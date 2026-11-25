<?php
declare(strict_types=1);

const CUSTOMER_SLOTS = ['09:00', '10:00', '11:00', '13:00', '14:00'];
const DAILY_BOOKING_LIMIT = 5;
const APPOINTMENTS = 'Grooming & Pet Hotel';

function manilaNow(): DateTimeImmutable
{
    return new DateTimeImmutable('now', new DateTimeZone('Asia/Manila'));
}

function bookingCounts(array $appointments): array
{
    $days = [];
    foreach ($appointments as $row) {
        if (!isset($row[2], $row[3]) || ($row[4] ?? '') === 'Cancelled') continue;
        $date = $row[2];
        $time = $row[3];
        $days[$date]['total'] = ($days[$date]['total'] ?? 0) + 1;
        $days[$date]['slots'][$time] = ($days[$date]['slots'][$time] ?? 0) + 1;
    }
    return $days;
}

function checkAppointmentChanges(array $old, array $new): void
{
    $before = bookingCounts($old);
    foreach (bookingCounts($new) as $date => $day) {
        if ($day['total'] > max(DAILY_BOOKING_LIMIT, $before[$date]['total'] ?? 0)) {
            authResponse(409, 'That day already has five appointments. Choose another date.');
        }
        foreach ($day['slots'] as $time => $count) {
            if ($count > max(1, $before[$date]['slots'][$time] ?? 0)) {
                authResponse(409, 'That time is already booked. Choose another time.');
            }
        }
    }
}

function customerIdentity(array &$data, string $username): array
{
    $key = strtolower($username);
    $account = $data['customerAccounts'][$key];
    $records = &$data['shop']['records']['Customers'];
    $id = 'CUST-WEB-' . $key;
    $email = $account['email'];
    foreach ($records as $row) {
        if (($row[8] ?? null) === $id) return $row;
        if ($account['email'] !== '' && strcasecmp($row[2] ?? '', $account['email']) === 0) {
            // Keep the existing customer history separate from this self-registered account.
            $email = '';
        }
    }
    $name = $account['name'];
    $names = array_map(static fn(array $row): string => strtolower($row[0]), $records);
    if (in_array(strtolower($name), $names, true)) $name .= ' (' . $username . ')';
    if (in_array(strtolower($name), $names, true)) authResponse(409, 'Ask the shop to resolve this duplicate customer name.');
    $row = [$name, '', $email, '', 'Active', 0, '', manilaNow()->format('Y-m-d'), $id];
    array_unshift($records, $row);
    return $row;
}

function customerProductLabel(array $product): string
{
    $unit = $product[8]['unit'] ?? '';
    return $unit === '' ? $product[0] : $product[0] . ' · ' . $unit;
}

function customerPortal(array $data, string $username): array
{
    $shop = $data['shop'];
    $now = manilaNow();
    $base = $now->setTime(0, 0);
    $appointments = $shop['records'][APPOINTMENTS] ?? [];
    $counts = bookingCounts($appointments);
    $days = [];
    for ($i = 0; $i < 60; $i++) {
        $date = $base->modify('+' . $i . ' days')->format('Y-m-d');
        $day = $counts[$date] ?? ['total' => 0, 'slots' => []];
        $full = $day['total'] >= DAILY_BOOKING_LIMIT;
        $days[] = [
            'date' => $date,
            'remaining' => max(0, DAILY_BOOKING_LIMIT - $day['total']),
            'slots' => array_map(static fn(string $time): array => [
                'time' => $time,
                'available' => !$full && !isset($day['slots'][$time]) && ($date . ' ' . $time) > $now->format('Y-m-d H:i'),
            ], CUSTOMER_SLOTS),
        ];
    }
    $owner = null;
    foreach ($shop['records']['Customers'] ?? [] as $row) {
        if (($row[8] ?? '') === 'CUST-WEB-' . strtolower($username)) $owner = $row[0];
    }
    return [
        'ready' => $shop !== null,
        'pausedModules' => pausedModules(maintenanceSettings($data)),
        'products' => array_map(static fn(array $row): array => [
            'id' => $row[6], 'name' => customerProductLabel($row), 'category' => $row[1], 'price' => $row[2],
            'stock' => $row[3], 'icon' => $row[4] ?? '🐾', 'photo' => $row[5] ?? '',
        ], $shop['products'] ?? []),
        'days' => $days,
        'pets' => array_map(static fn(array $row): array => ['name' => $row[0], 'species' => $row[2]],
            array_values(array_filter($shop['records']['Pets'] ?? [], static fn(array $row): bool => $owner !== null && $row[1] === $owner))),
        'bookings' => array_values(array_filter($appointments, static fn(array $row): bool => ($row[7] ?? '') === $username)),
        'orders' => array_values(array_filter($data['customerOrders'], static fn(array $row): bool => $row['username'] === $username)),
    ];
}

function verifyCustomer(string $username, string $password): ?array
{
    return withShopData(false, static function (array $data) use ($username, $password): array {
        $account = $data['customerAccounts'][strtolower($username)] ?? null;
        if (!$account || !password_verify($password, $account['hash'])) return [];
        return ['username' => $account['username'], 'name' => $account['name']];
    }) ?: null;
}

function handleCustomerSignup(): never
{
    $username = $_POST['username'] ?? '';
    $password = $_POST['password'] ?? '';
    if (!is_string($username) || !is_string($password) || strlen($password) > 72 || str_contains($password, "\0")) {
        authResponse(422, 'Enter a valid username and password.');
    }
    $username = trim($username);
    $key = strtolower($username);
    $name = $_POST['full_name'] ?? '';
    $email = $_POST['email'] ?? '';
    validateNewCredentials($username, $password);
    if (!is_string($name) || trim($name) === '' || strlen($name) > 100 ||
        !is_string($email) || strlen($email) > 150 || !filter_var(trim($email), FILTER_VALIDATE_EMAIL)) {
        authResponse(422, 'Enter your name and a valid email address.');
    }
    $account = withShopData(true, static function (array &$data) use ($key, $username, $password, $name, $email): array {
        if (isset($data['customerAccounts'][$key])) authResponse(409, 'That customer username is already in use.');
        foreach ($data['customerAccounts'] as $existing) {
            if (strcasecmp($existing['email'], trim($email)) === 0) authResponse(409, 'That customer email is already registered.');
        }
        $data['customerAccounts'][$key] = [
            'username' => $username, 'name' => trim($name), 'email' => trim($email),
            'hash' => password_hash($password, PASSWORD_DEFAULT), 'created' => gmdate('c'),
        ];
        if ($data['shop'] !== null) {
            customerIdentity($data, $username);
            $data['revision']++;
        }
        return ['username' => $username, 'name' => trim($name)];
    });
    if (!session_regenerate_id(true)) throw new RuntimeException('Cannot rotate customer session.');
    $_SESSION = ['customer' => $account, 'csrf' => bin2hex(random_bytes(32))];
    authResponse(200);
}

function bookCustomerAppointment(array &$data, string $username): string
{
    $input = shopInput('booking', 3000);
    $date = $input['date'] ?? '';
    $time = $input['time'] ?? '';
    $service = $input['service'] ?? '';
    $pet = $input['pet'] ?? '';
    $species = $input['species'] ?? '';
    if (!is_string($date) || !preg_match('/\A\d{4}-\d{2}-\d{2}\z/', $date) ||
        !in_array($time, CUSTOMER_SLOTS, true) || !in_array($service, ['Grooming', 'Pet Hotel Check-in'], true) ||
        !is_string($pet) || trim($pet) === '' || strlen($pet) > 100 ||
        !in_array($species, ['Dog', 'Cat', 'Bird', 'Rabbit', 'Other'], true)) {
        authResponse(422, 'Choose a valid date, time, service and pet.');
    }
    $now = manilaNow();
    $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $date, $now->getTimezone());
    if (!$parsed || $parsed->format('Y-m-d') !== $date || $date > $now->modify('+59 days')->format('Y-m-d') ||
        $date . ' ' . $time <= $now->format('Y-m-d H:i')) {
        authResponse(422, 'Choose a future appointment from the available dates.');
    }
    $appointments = &$data['shop']['records'][APPOINTMENTS];
    $day = bookingCounts($appointments)[$date] ?? ['total' => 0, 'slots' => []];
    if ($day['total'] >= DAILY_BOOKING_LIMIT || isset($day['slots'][$time])) {
        authResponse(409, 'That date or time is full. Pick another available slot.');
    }
    $owner = customerIdentity($data, $username)[0];
    $pet = trim($pet);
    $exists = false;
    foreach ($data['shop']['records']['Pets'] as $row) {
        if (strcasecmp($row[0], $pet) !== 0) continue;
        if ($row[1] !== $owner) authResponse(409, 'Use a distinct pet name, such as the pet name plus your surname.');
        $pet = $row[0];
        $exists = true;
        break;
    }
    if (!$exists) $data['shop']['records']['Pets'][] = [$pet, $owner, $species, '', '', ''];
    $id = 'BK-' . strtoupper(bin2hex(random_bytes(5)));
    $appointments[] = [$pet, $service, $date, $time, 'Scheduled', '', $id, $username];
    $data['revision']++;
    return 'Appointment confirmed. Reference ' . $id . '.';
}

function placeCustomerOrder(array &$data, string $username): string
{
    $input = shopInput('cart', 20000);
    $lines = $input['lines'] ?? [];
    $checkout = $input['checkout'] ?? '';
    if (!is_string($checkout) || !preg_match('/\A[a-zA-Z0-9-]{8,64}\z/', $checkout) || !is_array($lines) || !$lines || count($lines) > 50) {
        authResponse(422, 'Add products to your cart before checking out.');
    }
    foreach ($data['customerOrders'] as $order) {
        if ($order['username'] === $username && ($order['checkout'] ?? '') === $checkout) return 'Order reserved. Reference ' . $order['id'] . '.';
    }
    $items = [];
    $seen = [];
    $total = 0;
    $products = &$data['shop']['products'];
    foreach ($lines as $line) {
        if (!is_array($line) || !isset($line[0], $line[1], $line[2]) || !is_string($line[0]) ||
            !is_int($line[1]) || $line[1] < 1 || $line[1] > 1000 || !is_int($line[2]) || isset($seen[$line[0]])) {
            authResponse(422, 'One of the cart quantities or prices is invalid.');
        }
        [$id, $quantity, $quotedPrice] = $line;
        $seen[$id] = true;
        $index = array_search($id, array_column($products, 6), true);
        if ($index === false || $products[$index][3] < $quantity) authResponse(409, 'Stock changed. Review your cart before ordering.');
        $product = &$products[$index];
        $price = (int) round($product[2] * 100);
        if ($price !== $quotedPrice) authResponse(409, 'A product price changed. Review your cart before ordering.');
        $total += $price * $quantity;
        $items[] = ['id' => $id, 'name' => customerProductLabel($product), 'quantity' => $quantity, 'price' => $price / 100];
        $product[3] -= $quantity;
        unset($product);
    }
    $customer = customerIdentity($data, $username);
    $id = 'ORD-' . strtoupper(bin2hex(random_bytes(5)));
    $data['customerOrders'][] = ['id' => $id, 'username' => $username, 'customer' => $customer[0], 'customerId' => $customer[8],
        'items' => $items, 'total' => $total / 100, 'status' => 'Awaiting pickup', 'created' => gmdate('c'), 'checkout' => $checkout];
    $data['revision']++;
    return 'Order reserved. Reference ' . $id . '. Pay when you pick it up.';
}

function handleCustomerPortal(string $action): never
{
    $account = currentAccount();
    if (!$account) authResponse(403, 'Sign in to continue.');
    $admin = $account['role'] === 'admin';
    $adminAction = in_array($action, ['customer_admin_list', 'customer_order_status'], true);
    if (($adminAction && !$admin) || (!$adminAction && $account['role'] !== 'customer')) {
        authResponse(403, 'This action is unavailable for your account.');
    }
    $write = in_array($action, ['customer_book', 'customer_order', 'customer_order_status'], true);
    $result = withShopData($write, static function (array &$data) use ($action, $account, $admin, $write): array {
        if ($action === 'customer_book') requireModuleOnline($data, 'booking');
        if (in_array($action, ['customer_order', 'customer_order_status'], true)) requireModuleOnline($data, 'pickup');
        if ($write && $data['shop'] === null) authResponse(409, 'The shop is getting ready. Try again later.');
        $previousRevision = $data['revision'];
        $message = '';
        if ($action === 'customer_book') $message = bookCustomerAppointment($data, $account['username']);
        if ($action === 'customer_order') $message = placeCustomerOrder($data, $account['username']);
        if ($action === 'customer_order_status') $message = resolveCustomerOrder($data);
        if ($data['revision'] !== $previousRevision) {
            if ($action === 'customer_order_status' && $_POST['status'] === 'Completed') {
                $data['transactionDetails'][$_POST['id']] = ['processedBy' => $account['username'], 'timestamp' => gmdate('c')];
            }
            $area = $action === 'customer_book' ? 'Booking' : 'Pickup Orders';
            $activity = $action === 'customer_order_status' ? $message . ' ' . $_POST['id'] : $message;
            recordShopAudit($data, $account, $area, $activity);
        }
        if (!$admin) return ['notice' => $message, 'portal' => customerPortal($data, $account['username'])];
        $accounts = array_map(static fn(array $row): array => [
            'username' => $row['username'], 'name' => $row['name'], 'email' => $row['email'], 'created' => $row['created'],
        ], array_values($data['customerAccounts']));
        return ['notice' => $message, 'accounts' => $accounts, 'orders' => array_reverse($data['customerOrders'])];
    });
    authResponse(200, '', $result);
}

function resolveCustomerOrder(array &$data): string
{
    $id = $_POST['id'] ?? '';
    $status = $_POST['status'] ?? '';
    if (!in_array($status, ['Completed', 'Cancelled'], true)) authResponse(422, 'Choose a valid order status.');
    $index = array_search($id, array_column($data['customerOrders'], 'id'), true);
    if ($index === false || $data['customerOrders'][$index]['status'] !== 'Awaiting pickup') {
        authResponse(409, 'This order has already been updated or no longer exists.');
    }
    $order = &$data['customerOrders'][$index];
    if ($status === 'Cancelled') {
        $products = &$data['shop']['products'];
        foreach ($order['items'] as $line) {
            $product = array_search($line['id'], array_column($products, 6), true);
            if ($product === false) authResponse(409, 'A product is missing. Restore it before cancelling this order.');
            $products[$product][3] += $line['quantity'];
        }
    } else {
        $records = &$data['shop']['records'];
        $date = manilaNow()->format('Y-m-d');
        $name = $order['customer'];
        foreach ($records['Customers'] as &$customer) {
            if (($customer[8] ?? null) !== $order['customerId']) continue;
            $name = $customer[0];
            $customer[5] = round(($customer[5] ?? 0) + $order['total'], 2);
            $customer[6] = $date;
            break;
        }
        unset($customer);
        $details = implode(', ', array_map(static fn(array $line): string => $line['quantity'] . ' × ' . $line['name'], $order['items']));
        array_unshift($records['Reports'], [$id, $name, $date, $details, $order['total']]);
    }
    $order['status'] = $status;
    $data['revision']++;
    return 'Order ' . strtolower($status) . '.';
}
