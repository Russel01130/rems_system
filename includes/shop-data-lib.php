<?php
// Shared shop storage, revision checks, staff requests, POS receipt access and the audit log. The shop state holds inventory, operations records and customer activity.
declare(strict_types=1);

const SHOP_FILE = __DIR__ . '/../shop-data.php';
const SHOP_LOCK = __DIR__ . '/../shop-lock.php';

// Inventory rows keep their data in fixed positions for compatibility with older local snapshots.
// Indices 0–3 hold name, category, selling price and stock. Indices 4–8 hold the icon, photo,
// stable product ID, barcode and optional details such as unit, pricing basis and expiry date.

// Runs a callback against shared shop state using configured MySQL or the protected PHP storage file.
function withShopData(bool $write, callable $operation): array
{
    $database = remsDatabase();
    if ($database !== null) {
        return withDatabaseState($database, 'shop', $write, static fn(): array =>
            withShopFile(false, static fn(array $data): array => $data), $operation);
    }
    return withShopFile($write, $operation);
}

// Uses a separate lock file to synchronize readers and writers. Writes replace the state file only after encoding succeeds.
function withShopFile(bool $write, callable $operation): array
{
    $lock = fopen(SHOP_LOCK, 'c+b');
    if ($lock === false) {
        throw new RuntimeException('Unable to open shop storage.');
    }
    try {
        if (!flock($lock, $write ? LOCK_EX : LOCK_SH)) {
            throw new RuntimeException('Unable to lock shop storage.');
        }
        $data = ['revision' => 0, 'shop' => null, 'requests' => []];
        if (is_file(SHOP_FILE)) {
            $contents = file_get_contents(SHOP_FILE);
            if ($contents === false || !str_starts_with($contents, ADMIN_FILE_HEADER)) {
                throw new RuntimeException('Unable to read shop data.');
            }
            $data = json_decode(substr($contents, strlen(ADMIN_FILE_HEADER)), true, 512, JSON_THROW_ON_ERROR);
        }
        $data += ['customerAccounts' => [], 'customerOrders' => []];
        $result = $operation($data);
        if ($write) {
            // Write to a sibling file first so a failed write does not truncate the previous shop snapshot.
            $temporary = __DIR__ . '/../shop-write-' . bin2hex(random_bytes(12)) . '.php';
            $contents = ADMIN_FILE_HEADER . json_encode($data, JSON_THROW_ON_ERROR);
            try {
                if (file_put_contents($temporary, $contents) !== strlen($contents) || !rename($temporary, SHOP_FILE)) {
                    throw new RuntimeException('Unable to save shop data.');
                }
            } finally {
                if (is_file($temporary)) unlink($temporary);
            }
        }
        return $result;
    } finally {
        fclose($lock);
    }
}

// Returns every staff request for administrators and only the signed-in staff member’s own requests for staff.
function visibleShopRequests(array $data, bool $admin, string $username): array
{
    return array_values(array_filter($data['requests'], static fn(array $request): bool =>
        $admin || $request['staff'] === $username));
}

// Builds the dashboard response and restricts reports, user management and receipt information by role.
function shopResult(array $data, bool $admin, string $username): array
{
    $requests = visibleShopRequests($data, $admin, $username);
    $shop = $data['shop'];
    if (!$admin && $shop !== null) {
        $shop['records']['Reports'] = [];
        $shop['records']['User Management'] = [];
    }
    return ['revision' => $data['revision'], 'shop' => $shop, 'requests' => $requests,
        'pendingBookings' => $admin ? 0 : pendingBookingCount($data),
        'transactionDetails' => $admin ? ($data['transactionDetails'] ?? []) : [],
        'saleReceiptIds' => $admin ? array_keys($data['saleReceipts'] ?? []) : [],
        'pausedModules' => pausedModules(maintenanceSettings($data))];
}

// Decodes a bounded JSON POST field into an array and returns a validation error for malformed data.
function shopInput(string $key, int $maxBytes): array
{
    $value = $_POST[$key] ?? '';
    if (!is_string($value) || $value === '' || strlen($value) > $maxBytes) {
        authResponse(422, 'The submitted data is empty or too large.');
    }
    try {
        $parsed = json_decode($value, true, 64, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        authResponse(422, 'Invalid submitted data.');
    }
    if (!is_array($parsed)) authResponse(422, 'Invalid submitted data.');
    return $parsed;
}

// Validates the dashboard’s replacement snapshot before it is accepted as shared shop state.
function shopSnapshot(array $data): array
{
    $shop = shopInput('shop', 6_000_000);
    if (!isset($shop['products'], $shop['records']) || !is_array($shop['products']) || !is_array($shop['records'])) {
        authResponse(422, 'Invalid shop records.');
    }
    foreach (['Customers', 'Pets', 'Grooming & Pet Hotel', 'User Management', 'Reports'] as $section) {
        if (!isset($shop['records'][$section]) || !is_array($shop['records'][$section])) {
            authResponse(422, 'Missing shop records.');
        }
    }
    validateInventoryDetails($shop['products']);
    validatePendingPickupProducts($data, $shop['products']);
    unset($shop['records']['RetailDraft'], $shop['records']['SavedSales']);
    return $shop;
}

// Prevents deleting inventory that a pending pickup needs so a later cancellation can restore its stock.
function validatePendingPickupProducts(array $data, array $products): void
{
    $removed = array_diff(array_column($data['shop']['products'] ?? [], 6), array_column($products, 6));
    if (!$removed) return;
    foreach ($data['customerOrders'] ?? [] as $order) {
        if ($order['status'] === 'Awaiting pickup' && array_intersect($removed, array_column($order['items'], 'id'))) {
            authResponse(409, 'Complete or cancel the pending pickup order before deleting this product.');
        }
    }
}

// Checks inventory metadata such as stock thresholds, expiry dates, pricing details and duplicate barcodes.
function validateInventoryDetails(array $products): void
{
    $barcodes = [];
    foreach ($products as $product) {
        if (is_string($product[7] ?? null) && $product[7] !== '') $barcodes[$product[7]] = true;
    }
    foreach ($products as $product) {
        $specs = $product[8] ?? [];
        if (!is_array($specs) ||
            (isset($specs['minimumStock']) && (!is_int($specs['minimumStock']) || $specs['minimumStock'] < 0)) ||
            (isset($specs['retailAmount']) && ((!is_int($specs['retailAmount']) && !is_float($specs['retailAmount'])) || $specs['retailAmount'] < 0)) ||
            (isset($specs['unit']) && (!is_string($specs['unit']) || $specs['unit'] === '' || strlen($specs['unit']) > 24))) {
            authResponse(422, 'Check the product’s retail amount, minimum stock, and unit.');
        }
        $expiry = $specs['expiryDate'] ?? '';
        $basis = $specs['pricingBasis'] ?? null;
        if ($basis !== null && (!is_array($basis) || !is_string($basis['unit'] ?? null) ||
            $basis['unit'] === '' || strlen($basis['unit']) > 24 || !is_int($basis['cents'] ?? null) ||
            $basis['cents'] < 0 || $basis['cents'] > 9007199254740991)) {
            authResponse(422, 'Check the product’s reference unit and selling amount.');
        }
        if ($expiry !== '' && (!is_string($expiry) || !preg_match('/\A(\d{4})-(\d{2})-(\d{2})\z/', $expiry, $parts) ||
            !checkdate((int) $parts[2], (int) $parts[3], (int) $parts[1]))) {
            authResponse(422, 'Enter a valid product expiry date.');
        }
        $items = $specs['itemBarcodes'] ?? [];
        if (!is_array($items) || !array_is_list($items)) authResponse(422, 'Invalid item barcode list.');
        foreach ($items as $barcode) {
            if (!is_string($barcode) || !preg_match('/\A\d{13}\z/', $barcode)) {
                authResponse(422, 'Invalid item barcode.');
            }
            $sum = 0;
            for ($i = 0; $i < 13; $i++) $sum += (int) $barcode[$i] * ($i % 2 === 0 ? 1 : 3);
            if ($sum % 10 !== 0 || isset($barcodes[$barcode])) {
                authResponse(422, 'Invalid or duplicate item barcode.');
            }
            $barcodes[$barcode] = true;
        }
    }
}

// Adds an audit entry with the actor, role, module, event description and UTC timestamp.
function recordShopAudit(array &$data, array $account, string $area, string $activity, string $status = 'Success'): void
{
    $data['auditLog'][] = [
        'timestamp' => gmdate('c'), 'account' => $account['username'], 'role' => $account['role'],
        'area' => $area, 'activity' => $activity, 'status' => $status,
    ];
}

// Compares existing and proposed shop records and logs the inventory, sales or operational changes it can identify.
function auditShopSave(array &$data, array $account, array $next): void
{
    $previous = $data['shop'];
    if ($previous === null) {
        recordShopAudit($data, $account, 'System', 'Initialized shop records.');
        return;
    }
    if ($previous['records']['Reports'] !== $next['records']['Reports']) {
        $oldRefs = array_column($previous['records']['Reports'], 0);
        foreach ($next['records']['Reports'] as $sale) {
            if (!in_array($sale[0], $oldRefs, true)) {
                $data['transactionDetails'][$sale[0]] = ['processedBy' => $account['username'], 'timestamp' => gmdate('c')];
                recordShopAudit($data, $account, 'Point of Sale', 'Completed transaction ' . $sale[0] . '.');
            }
        }
    } elseif ($previous['products'] !== $next['products']) {
        $oldIds = array_column($previous['products'], 0, 6);
        $newIds = array_column($next['products'], 0, 6);
        $added = array_diff_key($newIds, $oldIds);
        $removed = array_diff_key($oldIds, $newIds);
        foreach ($added as $name) recordShopAudit($data, $account, 'Inventory', 'Added product ' . $name . '.');
        foreach ($removed as $name) recordShopAudit($data, $account, 'Inventory', 'Deleted product ' . $name . '.');
        if (!$added && !$removed) recordShopAudit($data, $account, 'Inventory', 'Updated product records.');
    }
    foreach (['Customers', 'Pets', APPOINTMENTS] as $area) {
        if (($previous['records'][$area] ?? []) !== $next['records'][$area]) {
            recordShopAudit($data, $account, $area, 'Updated ' . strtolower($area) . ' records.');
        }
    }
}

// Builds Manila-date metrics, filter choices and newest-first audit results. Export mode returns all matching rows.
function auditLogResult(array $entries, array $filters, int $page): array
{
    $today = manilaNow();
    $date = $today->format('Y-m-d');
    $since = match ($filters['range']) {
        'today' => $date,
        'week' => $today->modify('-6 days')->format('Y-m-d'),
        'month' => $today->format('Y-m-01'),
        default => '',
    };
    $lists = ['role' => [], 'area' => [], 'event' => []];
    $summary = ['today' => 0, 'logins' => 0, 'critical' => 0, 'admins' => 0];
    $admins = [];
    $matching = [];
    foreach ($entries as $entry) {
        $when = (new DateTimeImmutable($entry['timestamp']))->setTimezone(new DateTimeZone('Asia/Manila'))->format('Y-m-d');
        $description = $entry['activity'];
        $entry['event'] = match (strtok($description, ' ')) {
            'Added' => 'Added record', 'Deleted' => 'Deleted record', 'Updated' => 'Updated record',
            'Completed' => 'Completed transaction', 'Submitted' => 'Submitted request',
            'Approved' => 'Approved request', 'Rejected' => 'Rejected request',
            'Enabled', 'Disabled' => 'Changed maintenance', 'Signed' => 'Sign-in',
            'Failed' => 'Failed sign-in', 'Order' => 'Pickup order', default => 'Other activity',
        };
        $entry['status'] = str_starts_with($description, 'Deleted ') || str_starts_with($description, 'Enabled System-wide ')
            ? 'Critical' : ($entry['status'] ?? 'Success');
        if ($when === $date) {
            $summary['today']++;
            if ($entry['area'] === 'Authentication') $summary['logins']++;
            if ($entry['status'] === 'Critical') $summary['critical']++;
            if (in_array($entry['role'], ['admin', 'super_admin'], true)) $admins[$entry['account']] = true;
        }
        $matches = $when >= $since;
        foreach (array_keys($lists) as $key) {
            $lists[$key][$entry[$key]] = true;
            if ($filters[$key] !== '' && $filters[$key] !== $entry[$key]) $matches = false;
        }
        if ($matches && ($filters['query'] === '' || stripos(implode(' ', $entry), $filters['query']) !== false)) {
            $matching[] = $entry;
        }
    }
    $summary['admins'] = count($admins);
    $facets = array_map(static function (array $list): array {
        $values = array_keys($list);
        sort($values, SORT_NATURAL | SORT_FLAG_CASE);
        return $values;
    }, $lists);
    $total = count($matching);
    $size = 15;
    $pages = max(1, (int) ceil($total / $size));
    $page = min($page, $pages);
    $end = $total - ($page - 1) * $size;
    $start = max(0, $end - $size);
    $selected = $filters['export'] === '1' ? $matching : array_slice($matching, $start, $end - $start);
    return ['entries' => array_reverse($selected), 'page' => $page, 'pages' => $pages, 'total' => $total,
        'summary' => $summary, 'facets' => $facets, 'start' => $total ? $start + 1 : 0, 'end' => $end];
}

// Checks shop permissions and revisions before running dashboard reads, staff submissions, approvals or administrator saves.
function handleShopRequest(string $action): never
{
    $account = currentAccount();
    if (!$account || $account['role'] === 'customer') authResponse(403, 'Shop management is reserved for staff and administrators.');
    $admin = $account['role'] === 'admin';
    if ($action === 'audit_read') {
        if (!$admin) authResponse(403, 'Only administrators can view audit logs.');
        $page = filter_var($_POST['page'] ?? '1', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($page === false) authResponse(422, 'Choose a valid audit log page.');
        $filters = [];
        foreach (['query', 'role', 'area', 'event', 'range', 'export'] as $key) {
            $value = $_POST[$key] ?? '';
            if (!is_string($value) || strlen($value) > 240) authResponse(422, 'Invalid audit log filter.');
            $filters[$key] = trim($value);
        }
        $result = withShopData(false, static fn(array $data): array => auditLogResult($data['auditLog'] ?? [], $filters, $page));
        authResponse(200, '', $result);
    }
    if ($action === 'sale_receipt_download') {
        if (!$admin) authResponse(403, 'Only administrators can manage sales receipts.');
        downloadStoredSaleReceipt();
    }
    if (($action === 'shop_submit' && $admin) || (in_array($action, ['shop_save', 'shop_decide'], true) && !$admin)) {
        authResponse(403, 'This action is reserved for the other account role.');
    }
    refreshBookingDeadlines();
    $result = withShopData(!in_array($action, ['shop_read', 'shop_status'], true), static function (array &$data) use ($action, $admin, $account): array {
        // Send revision and count information cheaply when the request poll does not need a full snapshot.
        if ($action === 'shop_status') {
            $requests = visibleShopRequests($data, $admin, $account['username']);
            $pending = array_values(array_filter($requests, static fn(array $request): bool => $request['status'] === 'Pending'));
            return [
                'revision' => $data['revision'],
                'pendingBookings' => $admin ? 0 : pendingBookingCount($data),
                'key' => implode('|', array_map(static fn(array $request): string => $request['id'] . ':' . $request['status'], $requests)),
                'pending' => count($pending),
                'latest' => array_map(static fn(array $request): array => [
                    'type' => $request['type'], 'label' => $request['label'] ?? '',
                    'staff' => $request['staff'], 'created' => $request['created'],
                ], array_slice(array_reverse($pending), 0, 3)),
            ];
        }
        if ($action === 'shop_submit') {
            if ($data['shop'] === null) authResponse(409, 'Ask the admin to open the dashboard first.');
            $type = $_POST['type'] ?? '';
            if (in_array($type, ['product_add', 'product_edit'], true)) {
                authResponse(403, 'Only administrators can add or edit products.');
            }
            $types = ['pet_add', 'pet_edit', 'pet_remove', 'customer_add', 'customer_edit', 'customer_import', 'sale'];
            if (!in_array($type, $types, true)) authResponse(422, 'This request type is unavailable.');
            checkRequestMaintenance($data, $type);
            $payload = shopInput('payload', 1_500_000);
            $label = $_POST['label'] ?? '';
            if (!is_string($label) || strlen($label) > 400) authResponse(422, 'Invalid request label.');
            $data['requests'][] = [
                'id' => bin2hex(random_bytes(10)), 'staff' => $account['username'], 'type' => $type,
                'payload' => $payload, 'label' => $label, 'status' => 'Pending', 'created' => gmdate('c'), 'note' => '',
            ];
            recordShopAudit($data, $account, 'Approvals', 'Submitted ' . str_replace('_', ' ', $type) . ' request.');
        } elseif ($action === 'shop_save') {
            // Only proposed snapshots based on the current revision may replace the shared records.
            if ((string) $data['revision'] !== ($_POST['revision'] ?? null)) {
                authResponse(409, 'Shop records changed. Refresh and try again.');
            }
            $next = shopSnapshot($data);
            if ($data['shop'] !== null) {
                $previous = $data['shop'];
                if ($next['records']['Customers'] !== $previous['records']['Customers'] ||
                    $next['records']['Pets'] !== $previous['records']['Pets'] ||
                    $next['records']['Reports'] !== $previous['records']['Reports']) {
                    authResponse(403, 'Review staff requests in Approvals to update operational records.');
                }
            }
            checkShopMaintenance($data, $next);
            checkAppointmentChanges($data['shop']['records'][APPOINTMENTS] ?? [], $next['records'][APPOINTMENTS]);
            auditShopSave($data, $account, $next);
            $data['shop'] = $next;
            $data['revision']++;
        } elseif ($action === 'shop_decide') {
            // Finalize a pending proposal. Approval and its changes are handled under the same state lock.
            $decision = $_POST['decision'] ?? '';
            $id = $_POST['id'] ?? '';
            $note = $_POST['note'] ?? '';
            if (!in_array($decision, ['Approved', 'Rejected'], true) || !is_string($note) || strlen($note) > 500) {
                authResponse(422, 'Enter a valid decision and note.');
            }
            $index = array_search($id, array_column($data['requests'], 'id'), true);
            if ($index === false || $data['requests'][$index]['status'] !== 'Pending') {
                authResponse(409, 'This request is no longer pending. Refresh the request list.');
            }
            if ($decision === 'Approved') {
                checkRequestMaintenance($data, $data['requests'][$index]['type']);
                if ((string) $data['revision'] !== ($_POST['revision'] ?? null)) {
                    authResponse(409, 'Shop records changed. Refresh the request list before approving.');
                }
                $next = shopSnapshot($data);
                checkShopMaintenance($data, $next);
                checkAppointmentChanges($data['shop']['records'][APPOINTMENTS] ?? [], $next['records'][APPOINTMENTS]);
                auditShopSave($data, $account, $next);
                $data['shop'] = $next;
                $data['revision']++;
            }
            $data['requests'][$index]['status'] = $decision;
            recordShopAudit($data, $account, 'Approvals', $decision . ' ' . str_replace('_', ' ', $data['requests'][$index]['type']) . ' request.');
            $data['requests'][$index]['note'] = trim($note);
            unset($data['requests'][$index]['payload']);
        }
        return shopResult($data, $admin, $account['username']);
    });
    authResponse(200, '', $result);
}

// Validates the sale reference and returns an attached receipt only for a recorded transaction.
function downloadStoredSaleReceipt(): never
{
    $id = $_POST['id'] ?? '';
    if (!is_string($id) || !preg_match('/\A#TRX-[A-Z0-9]{10}\z/', $id)) {
        authResponse(422, 'Choose a valid Point of Sale transaction.');
    }
    $result = withShopData(false, static function (array $data) use ($id): array {
        requireModuleOnline($data, 'system');
        if (!in_array($id, array_column($data['shop']['records']['Reports'] ?? [], 0), true)) {
            authResponse(404, 'The completed sale could not be found.');
        }
        $receipt = $data['saleReceipts'][$id] ?? null;
        if ($receipt === null) authResponse(404, 'No receipt PDF is attached to this sale.');
        return ['receipt' => $receipt];
    });
    authResponse(200, '', $result);
}
