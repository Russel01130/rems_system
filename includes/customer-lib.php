<?php
// Customer portal endpoints for account registration, pet profiles, pickup reservations and bookings. Ownership is checked against the signed-in account before records are read or changed.
declare(strict_types=1);

// Customer booking capacity is defined using Manila times and a daily maximum.
const CUSTOMER_SLOTS = ['09:00', '10:00', '11:00', '13:00', '14:00'];
const DAILY_BOOKING_LIMIT = 5;
const APPOINTMENTS = 'Grooming & Pet Hotel';
const CUSTOMER_PET_SPECIES = ['Dog', 'Cat', 'Bird', 'Rabbit'];

// Returns the current time in Asia/Manila for appointment dates, sales dates and deadline comparisons.
function manilaNow(): DateTimeImmutable
{
    return new DateTimeImmutable('now', new DateTimeZone('Asia/Manila'));
}

// Counts occupied times per day while excluding rejected, expired and cancelled appointments.
function bookingCounts(array $appointments): array
{
    $days = [];
    foreach ($appointments as $row) {
        if (!isset($row[2], $row[3]) || in_array($row[4] ?? '', ['Cancelled', 'Rejected', 'Request expired', 'Cancelled - No-show'], true)) continue;
        $date = $row[2];
        $time = $row[3];
        $days[$date]['total'] = ($days[$date]['total'] ?? 0) + 1;
        $days[$date]['slots'][$time] = ($days[$date]['slots'][$time] ?? 0) + 1;
    }
    return $days;
}

// Enforces booking capacity and protects customer-linked appointments from edits through a full shop snapshot.
function checkAppointmentChanges(array $old, array $new): void
{
    $managed = static function (array $rows): array {
        $result = [];
        foreach ($rows as $row) {
            if (!empty($row[7])) $result[$row[6]] = array_slice($row, 1);
        }
        ksort($result);
        return $result;
    };
    if ($managed($old) !== $managed($new)) authResponse(409, 'Use the appointment actions to update online bookings.');
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

// Finds or creates a shop customer record for the signed-in account using a stable CUST-WEB identifier.
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

// Combines the product name with its unit for carts, receipts and order history.
function customerProductLabel(array $product): string
{
    $unit = $product[8]['unit'] ?? '';
    return $unit === '' ? $product[0] : $product[0] . ' · ' . $unit;
}

// Checks whether a saved pet already has the complete registration details required by Pet Management.
function customerPetRegistered(array $pet): bool
{
    return ($pet[3] ?? '') !== '' && ($pet[5] ?? '') !== '' && ($pet[6] ?? '') !== '';
}

// Builds the customer’s catalog, booking availability, pets, orders and notices. Photos are included only when requested.
function customerPortal(array $data, string $username, bool $includePetPhotos = false): array
{
    $shop = $data['shop'];
    $now = manilaNow();
    $base = $now->setTime(0, 0);
    $appointments = $shop['records'][APPOINTMENTS] ?? [];
    $bookings = array_values(array_filter($appointments, static fn(array $row): bool => ($row[7] ?? '') === $username));
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
            'id' => $row[6], 'name' => customerProductLabel($row), 'productName' => $row[0], 'unit' => $row[8]['unit'] ?? '',
            'category' => $row[1], 'price' => $row[2],
            'stock' => $row[3], 'icon' => $row[4] ?? '🐾', 'photo' => $row[5] ?? '',
        ], $shop['products'] ?? []),
        'days' => $days,
        'pets' => array_map(static fn(array $row): array => [
            'name' => $row[0], 'species' => $row[2], 'breed' => $row[3] ?? '', 'marking' => $row[6] ?? '',
            'photo' => $includePetPhotos ? ($row[5] ?? '') : '',
        ],
            array_values(array_filter($shop['records']['Pets'] ?? [], static fn(array $row): bool => $owner !== null && $row[1] === $owner))),
        'bookings' => $bookings,
        'bookingNotices' => customerBookingNotices($bookings, $now, $data['customerAccounts'][strtolower($username)]['readBookingNotices'] ?? []),
        'orders' => array_values(array_filter($data['customerOrders'], static fn(array $row): bool => $row['username'] === $username)),
    ];
}

// Verifies the password hash for a customer username and returns the identity needed for the session.
function verifyCustomer(string $username, string $password): ?array
{
    return withShopData(false, static function (array $data) use ($username, $password): array {
        $account = $data['customerAccounts'][strtolower($username)] ?? null;
        if (!$account || !password_verify($password, $account['hash'])) return [];
        return ['username' => $account['username'], 'name' => $account['name']];
    }) ?: null;
}

// Validates the registration form, prevents duplicate accounts, saves a password hash and rotates the session.
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

// Validates the name, species and image before adding a pet or completing an older profile for the same owner.
function registerCustomerPet(array &$data, string $username): string
{
    $input = shopInput('pet', 460_000);
    foreach (['name', 'breed', 'marking'] as $field) {
        $value = $input[$field] ?? '';
        if (!is_string($value) || !preg_match('/\A.{1,100}\z/us', trim($value))) {
            authResponse(422, 'Enter a pet name, breed, and marking of up to 100 characters each.');
        }
        $input[$field] = trim($value);
    }
    if (!in_array($input['species'] ?? '', CUSTOMER_PET_SPECIES, true)) {
        authResponse(422, 'Choose a valid species.');
    }
    $photo = $input['photo'] ?? '';
    if (!is_string($photo) || strlen($photo) > 450_000 ||
        !preg_match('/\Adata:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+\/]+=*)\z/', $photo, $parts)) {
        authResponse(422, 'Choose a valid picture of your pet.');
    }
    $bytes = base64_decode($parts[2], true);
    $image = $bytes === false || $bytes === '' ? false : @getimagesizefromstring($bytes);
    if ($image === false || $image['mime'] !== $parts[1] || max($image[0], $image[1]) > 480) {
        authResponse(422, 'Choose a valid picture of your pet.');
    }
    $owner = customerIdentity($data, $username)[0];
    $pets = &$data['shop']['records']['Pets'];
    foreach ($pets as $index => $pet) {
        if (strcasecmp($pet[0], $input['name']) !== 0) continue;
        if ($pet[1] !== $owner) authResponse(409, 'That pet name is already in use. Try adding your surname.');
        if (customerPetRegistered($pet)) {
            authResponse(409, 'This pet is already registered.');
        }
        $pets[$index] = [$pet[0], $owner, $input['species'], $input['breed'], $pet[4] ?? '', $photo, $input['marking']];
        $data['revision']++;
        return 'Pet registration completed.';
    }
    // Keep care notes at index 4 and the optional owner-provided marking at index 6.
    $pets[] = [$input['name'], $owner, $input['species'], $input['breed'], '', $photo, $input['marking']];
    $data['revision']++;
    return 'Pet registered.';
}

// Checks the chosen service, time slot and pet ownership before saving a pending customer appointment.
function bookCustomerAppointment(array &$data, string $username): string
{
    $input = shopInput('booking', 3000);
    $date = $input['date'] ?? '';
    $time = $input['time'] ?? '';
    $service = $input['service'] ?? '';
    $pet = $input['pet'] ?? '';
    if (!is_string($date) || !preg_match('/\A\d{4}-\d{2}-\d{2}\z/', $date) ||
        !in_array($time, CUSTOMER_SLOTS, true) || !in_array($service, ['Grooming', 'Pet Hotel Check-in'], true) ||
        !is_string($pet) || !preg_match('/\A.{1,100}\z/us', trim($pet))) {
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
    $petName = trim($pet);
    $registeredPet = null;
    foreach ($data['shop']['records']['Pets'] as $row) {
        if ($row[1] !== $owner || strcasecmp($row[0], $petName) !== 0) continue;
        $registeredPet = $row[0];
        break;
    }
    if ($registeredPet === null) authResponse(422, 'Choose a pet from your account in Pet Management.');
    // Use the stored pet name and the signed-in username instead of client-supplied ownership details.
    $id = 'BK-' . strtoupper(bin2hex(random_bytes(5)));
    $appointments[] = [$registeredPet, $service, $date, $time, 'Pending', '', $id, $username];
    $data['revision']++;
    return 'Appointment request sent for approval. Reference ' . $id . '.';
}

// Reserves stock using the selected variant IDs and current prices. The checkout ID protects against duplicate submissions.
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
        // Reserve stock while processing checkout. All lines are saved together when the operation succeeds.
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

// Dispatches customer, staff and admin actions according to role, then returns the relevant portal or dashboard data.
function handleCustomerPortal(string $action): never
{
    $account = currentAccount();
    if (!$account) authResponse(403, 'Sign in to continue.');
    $requiredRole = match ($action) {
        'customer_admin_list' => 'admin',
        'customer_booking_status', 'customer_order_list', 'customer_order_status' => 'staff',
        default => 'customer',
    };
    if ($account['role'] !== $requiredRole) {
        authResponse(403, 'This action is unavailable for your account.');
    }
    refreshBookingDeadlines();
    $write = in_array($action, ['customer_register_pet', 'customer_book', 'customer_order', 'customer_order_status', 'customer_booking_status', 'customer_read_notifications'], true);
    $result = withShopData($write, static function (array &$data) use ($action, $account, $write): array {
        if (in_array($action, ['customer_book', 'customer_booking_status'], true)) requireModuleOnline($data, 'booking');
        if (in_array($action, ['customer_order', 'customer_order_status'], true)) requireModuleOnline($data, 'pickup');
        if ($write && $data['shop'] === null && $action !== 'customer_read_notifications') authResponse(409, 'The shop is getting ready. Try again later.');
        $previousRevision = $data['revision'];
        $message = '';
        if ($action === 'customer_register_pet') $message = registerCustomerPet($data, $account['username']);
        if ($action === 'customer_book') $message = bookCustomerAppointment($data, $account['username']);
        if ($action === 'customer_order') $message = placeCustomerOrder($data, $account['username']);
        if ($action === 'customer_order_status') $message = resolveCustomerOrder($data);
        if ($action === 'customer_booking_status') $message = resolveCustomerBooking($data);
        // Only mark IDs that are in the signed-in account’s own inbox.
        if ($action === 'customer_read_notifications') {
            $ids = shopInput('notifications', 1_000_000);
            $submitted = array_flip(array_filter($ids, 'is_string'));
            $username = $account['username'];
            $bookings = array_values(array_filter($data['shop']['records'][APPOINTMENTS] ?? [],
                static fn(array $row): bool => ($row[7] ?? '') === $username));
            foreach (customerBookingNotices($bookings, manilaNow()) as $notice) {
                if (isset($submitted[$notice['id']])) {
                    $data['customerAccounts'][strtolower($username)]['readBookingNotices'][$notice['id']] = true;
                }
            }
            return ['notice' => 'Notifications marked as read.'];
        }
        if ($data['revision'] !== $previousRevision) {
            if ($action === 'customer_order_status' && $_POST['status'] === 'Completed') {
                $data['transactionDetails'][$_POST['id']] = ['processedBy' => $account['username'], 'timestamp' => gmdate('c')];
            }
            $area = match ($action) {
                'customer_register_pet' => 'Pets',
                'customer_book', 'customer_booking_status' => 'Booking',
                default => 'Pickup Orders',
            };
            $activity = in_array($action, ['customer_order_status', 'customer_booking_status'], true) ? $message . ' ' . $_POST['id'] : $message;
            recordShopAudit($data, $account, $area, $activity);
        }
        if ($account['role'] === 'customer') {
            $includePetPhotos = $action === 'customer_register_pet' || ($_POST['includePetPhotos'] ?? '') === 'true';
            return ['notice' => $message, 'portal' => customerPortal($data, $account['username'], $includePetPhotos)];
        }
        if ($action === 'customer_booking_status') return ['notice' => $message] + shopResult($data, false, $account['username']);
        if ($account['role'] === 'staff') return ['notice' => $message, 'orders' => array_reverse($data['customerOrders'])];
        $accounts = array_map(static fn(array $row): array => [
            'username' => $row['username'], 'name' => $row['name'], 'email' => $row['email'], 'created' => $row['created'],
        ], array_values($data['customerAccounts']));
        return ['notice' => $message, 'accounts' => $accounts];
    });
    authResponse(200, '', $result);
}

// Completes a pickup by recording the sale or cancels it by restoring its reserved stock.
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
