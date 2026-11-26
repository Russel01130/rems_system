<?php
// Super Admin authentication and maintenance controls for the whole site and individual modules.
declare(strict_types=1);

const SUPER_ADMIN_FILE = __DIR__ . '/../super-admin.credentials.php';
const MAINTENANCE_NOTICE = 'The shop is temporarily closed for system maintenance. Please try again later.';
// Define the maintenance modules once so the server checks and overview controls use the same keys.
const MAINTENANCE_MODULES = [
    'system' => ['▦', 'System-wide', 'Pause access for admins, staff, and customers.'],
    'pos' => ['🛒', 'Point of Sale', 'Pause in-store checkout and approval of staff sales.'],
    'inventory' => ['◎', 'Inventory', 'Pause manual product and stock updates. Stock still adjusts for sales and pickup orders.'],
    'booking' => ['⌂', 'Appointments', 'Pause grooming and pet hotel booking and schedule changes.'],
    'pickup' => ['♙', 'Pickup Orders', 'Pause new pickup reservations and order status changes. Customers can still see their receipts.'],
];

// Checks the dedicated Super Admin credentials kept in their own local protected file.
function verifySuperAdmin(string $username, string $password): ?string
{
    if (!is_file(SUPER_ADMIN_FILE)) return null;
    $file = fopen(SUPER_ADMIN_FILE, 'rb');
    if ($file === false) throw new RuntimeException('Cannot read Super Admin credentials.');
    try {
        if (!flock($file, LOCK_SH)) throw new RuntimeException('Cannot lock Super Admin credentials.');
        $account = readAdmin($file);
    } finally {
        fclose($file);
    }
    return $account && strcasecmp($account['username'], $username) === 0 && password_verify($password, $account['hash'])
        ? $account['username']
        : null;
}

// Reads the current maintenance settings from shared shop state.
function maintenanceStatus(): array
{
    return withShopData(false, 'maintenanceSettings');
}

// Normalizes current and older maintenance records into a status entry for each supported module.
function maintenanceSettings(array $data): array
{
    $state = $data['maintenance'] ?? [];
    return [
        'system' => ['enabled' => $state['enabled'] ?? false, 'changedAt' => $state['changedAt'] ?? null, 'changedBy' => $state['changedBy'] ?? null],
    ] + ($state['modules'] ?? []) + array_fill_keys(array_keys(MAINTENANCE_MODULES), ['enabled' => false, 'changedAt' => null]);
}

// Lists the module keys currently on maintenance so the interface can show the appropriate status.
function pausedModules(array $settings): array
{
    return array_keys(array_filter($settings, static fn(array $status): bool => $status['enabled']));
}

// Stops an operation when its module or the entire shop is on maintenance.
function requireModuleOnline(array $data, string $module): void
{
    $settings = maintenanceSettings($data);
    if ($settings['system']['enabled']) authResponse(503, MAINTENANCE_NOTICE);
    if ($settings[$module]['enabled']) {
        authResponse(503, MAINTENANCE_MODULES[$module][1] . ' is under maintenance. Please try again later.');
    }
}

// Maps staff request types to their maintenance modules before approval or submission.
function checkRequestMaintenance(array $data, string $type): void
{
    $module = match ($type) {
        'sale' => 'pos',
        'product_add', 'product_edit' => 'inventory',
        default => 'system',
    };
    requireModuleOnline($data, $module);
}

// Checks which areas a proposed snapshot changes so paused modules remain protected during saves.
function checkShopMaintenance(array $data, array $next): void
{
    requireModuleOnline($data, 'system');
    if ($data['shop'] === null) return;
    $old = $data['shop'];
    $saleChanged = $old['records']['Reports'] !== $next['records']['Reports'];
    if ($saleChanged) requireModuleOnline($data, 'pos');
    if (($old['records'][APPOINTMENTS] ?? []) !== $next['records'][APPOINTMENTS]) requireModuleOnline($data, 'booking');

    if ($old['products'] !== $next['products']) {
        $withoutStock = static function (array $products): array {
            foreach ($products as &$product) unset($product[3]);
            return $products;
        };
        if (!$saleChanged || $withoutStock($old['products']) !== $withoutStock($next['products'])) {
            requireModuleOnline($data, 'inventory');
        }
    }
}

// Requires a reason, saves the module switch change with its history and audit entry, then responds to the overview.
function handleMaintenanceChange(): never
{
    if (!isset($_SESSION['super_admin'])) authResponse(403, 'Only the Super Admin can change maintenance mode.');
    $mode = $_POST['enabled'] ?? '';
    $module = $_POST['module'] ?? 'system';
    $reason = $_POST['reason'] ?? '';
    if (!is_string($module) || !isset(MAINTENANCE_MODULES[$module])) authResponse(422, 'Choose a valid maintenance module.');
    if (!in_array($mode, ['0', '1'], true)) authResponse(422, 'Choose a valid maintenance mode.');
    if (!is_string($reason) || strlen($reason) > 960 || !preg_match('/\A.{0,240}\z/us', $reason)) {
        authResponse(422, 'Use up to 240 characters for the maintenance reason.');
    }
    $reason = trim($reason);
    if ($reason === '') authResponse(422, 'Enter a reason for the maintenance change.');

    $status = withShopData(true, static function (array &$data) use ($mode, $module, $reason): array {
        $enabled = $mode === '1';
        if ($enabled !== maintenanceSettings($data)[$module]['enabled']) {
            $change = ['enabled' => $enabled, 'changedAt' => gmdate('c'), 'changedBy' => $_SESSION['super_admin']];
            if ($module === 'system') {
                $data['maintenance'] = array_replace($data['maintenance'] ?? [], $change);
            } else {
                $data['maintenance']['modules'][$module] = $change;
            }
            $data['maintenance']['history'][] = $change + ['module' => $module, 'reason' => $reason];
            recordShopAudit($data, ['username' => $_SESSION['super_admin'], 'role' => 'super_admin'],
                'Maintenance', ($enabled ? 'Enabled ' : 'Disabled ') . MAINTENANCE_MODULES[$module][1] . ' maintenance.');
            $data['revision']++;
        }
        return maintenanceSettings($data)[$module];
    });

    if (($_SERVER['HTTP_ACCEPT'] ?? '') === 'application/json') {
        $lastChanged = $status['changedAt']
            ? (new DateTimeImmutable($status['changedAt']))->setTimezone(new DateTimeZone('Asia/Manila'))->format('M j, Y, g:i A')
            : null;
        authResponse(200, '', ['enabled' => $status['enabled'], 'lastChanged' => $lastChanged]);
    }
    header('Location: ./?maintenance=overview', true, 303);
    exit;
}
