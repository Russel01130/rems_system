<?php
declare(strict_types=1);

const SHOP_FILE = __DIR__ . '/shop-data.php';
const SHOP_LOCK = __DIR__ . '/shop-lock.php';

function withShopData(bool $write, callable $operation): array
{
    $database = remsDatabase();
    if ($database !== null) {
        return withDatabaseState($database, 'shop', $write, static fn(): array =>
            withShopFile(false, static fn(array $data): array => $data), $operation);
    }
    return withShopFile($write, $operation);
}

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
            $temporary = __DIR__ . '/shop-write-' . bin2hex(random_bytes(12)) . '.php';
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

function visibleShopRequests(array $data, bool $admin, string $username): array
{
    return array_values(array_filter($data['requests'], static fn(array $request): bool =>
        $admin || $request['staff'] === $username));
}

function shopResult(array $data, bool $admin, string $username): array
{
    $requests = visibleShopRequests($data, $admin, $username);
    $shop = $data['shop'];
    if (!$admin && $shop !== null) {
        $shop['records']['Reports'] = [];
        $shop['records']['User Management'] = [];
    }
    return ['revision' => $data['revision'], 'shop' => $shop, 'requests' => $requests];
}

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

function shopSnapshot(): array
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
    unset($shop['records']['RetailDraft'], $shop['records']['SavedSales']);
    return $shop;
}

function handleShopRequest(string $action): never
{
    $account = currentAccount();
    if (!$account || $account['role'] === 'customer') authResponse(403, 'Shop management is reserved for staff and administrators.');
    $admin = $account['role'] === 'admin';
    if (($action === 'shop_submit' && $admin) || (in_array($action, ['shop_save', 'shop_decide'], true) && !$admin)) {
        authResponse(403, 'This action is reserved for the other account role.');
    }
    $result = withShopData(!in_array($action, ['shop_read', 'shop_status'], true), static function (array &$data) use ($action, $admin, $account): array {
        if ($action === 'shop_status') {
            $requests = visibleShopRequests($data, $admin, $account['username']);
            $pending = array_values(array_filter($requests, static fn(array $request): bool => $request['status'] === 'Pending'));
            return [
                'revision' => $data['revision'],
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
            $types = ['product_add', 'product_edit', 'pet_add', 'pet_edit', 'pet_remove', 'customer_add', 'customer_edit', 'customer_import', 'sale'];
            if (!in_array($type, $types, true)) authResponse(422, 'This request type is unavailable.');
            $payload = shopInput('payload', 1_500_000);
            $label = $_POST['label'] ?? '';
            if (!is_string($label) || strlen($label) > 400) authResponse(422, 'Invalid request label.');
            $data['requests'][] = [
                'id' => bin2hex(random_bytes(10)), 'staff' => $account['username'], 'type' => $type,
                'payload' => $payload, 'label' => $label, 'status' => 'Pending', 'created' => gmdate('c'), 'note' => '',
            ];
        } elseif ($action === 'shop_save') {
            if ((string) $data['revision'] !== ($_POST['revision'] ?? null)) {
                authResponse(409, 'Shop records changed. Refresh and try again.');
            }
            $next = shopSnapshot();
            checkAppointmentChanges($data['shop']['records'][APPOINTMENTS] ?? [], $next['records'][APPOINTMENTS]);
            $data['shop'] = $next;
            $data['revision']++;
        } elseif ($action === 'shop_decide') {
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
                if ((string) $data['revision'] !== ($_POST['revision'] ?? null)) {
                    authResponse(409, 'Shop records changed. Refresh the request list before approving.');
                }
                $next = shopSnapshot();
                checkAppointmentChanges($data['shop']['records'][APPOINTMENTS] ?? [], $next['records'][APPOINTMENTS]);
                $data['shop'] = $next;
                $data['revision']++;
            }
            $data['requests'][$index]['status'] = $decision;
            $data['requests'][$index]['note'] = trim($note);
            unset($data['requests'][$index]['payload']);
        }
        return shopResult($data, $admin, $account['username']);
    });
    authResponse(200, '', $result);
}
