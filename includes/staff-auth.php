<?php
// Staff credentials and session role resolution. Local credential entries are append-only until MySQL storage is configured.
declare(strict_types=1);

const STAFF_FILE = __DIR__ . '/../staff.credentials.php';

// Replays the staff credential file in order so later enable or disable entries override the original account status.
function readStaffAccounts($file): array
{
    rewind($file);
    $header = fgets($file);
    if ($header === false && feof($file)) {
        return [];
    }
    if ($header !== ADMIN_FILE_HEADER) {
        throw new RuntimeException('Invalid staff credential file.');
    }
    $accounts = [];
    while (($line = fgets($file)) !== false) {
        $entry = json_decode($line, true, 512, JSON_THROW_ON_ERROR);
        $key = strtolower($entry['username']);
        if (isset($entry['hash'])) {
            $accounts[$key] = $entry;
        } elseif (isset($accounts[$key])) {
            $accounts[$key]['active'] = $entry['active'];
            $accounts[$key]['version'] = $entry['version'];
        }
    }
    return $accounts;
}

// Loads staff records from MySQL or the protected local file using the active storage configuration.
function staffAccounts(): array
{
    $database = remsDatabase();
    if ($database !== null) {
        return withDatabaseState($database, 'staff', false, 'fileStaffAccounts', static fn(array $accounts): array => $accounts);
    }
    return fileStaffAccounts();
}

// Reads local staff accounts under a shared lock and returns an empty list before setup.
function fileStaffAccounts(): array
{
    if (!is_file(STAFF_FILE)) {
        return [];
    }
    $file = fopen(STAFF_FILE, 'rb');
    if ($file === false) {
        throw new RuntimeException('Cannot read staff credentials.');
    }
    try {
        if (!flock($file, LOCK_SH)) {
            throw new RuntimeException('Cannot lock staff credentials.');
        }
        return readStaffAccounts($file);
    } finally {
        fclose($file);
    }
}

// Identifies the signed-in role and invalidates staff sessions whose account has since been disabled or changed.
function currentAccount(): ?array
{
    if (isset($_SESSION['super_admin'])) {
        return ['username' => $_SESSION['super_admin'], 'role' => 'super_admin'];
    }
    // Preserve sessions created before staff accounts were added.
    if (isset($_SESSION['admin'])) {
        return ['username' => $_SESSION['admin'], 'role' => 'admin'];
    }
    if (isset($_SESSION['customer'])) {
        return $_SESSION['customer'] + ['role' => 'customer'];
    }
    if (!isset($_SESSION['staff'])) {
        return null;
    }
    $staff = staffAccounts()[strtolower($_SESSION['staff'])] ?? null;
    if ($staff && $staff['active'] && $staff['version'] === ($_SESSION['staff_version'] ?? null)) {
        return ['username' => $staff['username'], 'role' => 'staff'];
    }
    unset($_SESSION['staff'], $_SESSION['staff_version']);
    return null;
}

// Sorts staff accounts and returns only the username and active state for display.
function staffAccountList(array $accounts): array
{
    ksort($accounts);
    return array_values(array_map(
        static fn(array $account): array => ['username' => $account['username'], 'active' => $account['active']],
        $accounts
    ));
}

// Allows administrators to list, create or enable and disable staff accounts and audits successful changes.
function handleStaffAccountRequest(string $action): never
{
    $account = currentAccount();
    if (!$account || !in_array($account['role'], ['admin', 'super_admin'], true)) {
        authResponse(403, 'Only administrators can manage staff accounts.');
    }
    if ($action === 'list_staff') {
        authResponse(200, '', ['accounts' => staffAccountList(staffAccounts())]);
    }
    $username = $_POST['username'] ?? '';
    if (!is_string($username)) {
        authResponse(422, 'Enter a valid staff username.');
    }
    $username = trim($username);
    $key = strtolower($username);
    $create = $action === 'create_staff';
    $password = '';
    if ($create) {
        $password = $_POST['password'] ?? '';
        if (!is_string($password) || strlen($password) > 72 || str_contains($password, "\0")) {
            authResponse(422, 'Choose a password of at least 12 characters and at most 72 bytes.');
        }
        validateNewCredentials($username, $password);
        $admin = adminCredentials();
        if (strcasecmp($account['username'], $username) === 0 ||
            ($admin && strcasecmp($admin['username'], $username) === 0)) {
            authResponse(409, 'That username is already used.');
        }
    } elseif (!in_array($_POST['active'] ?? '', ['0', '1'], true)) {
        authResponse(422, 'Choose a valid account status.');
    }

    $change = static function (array &$accounts) use ($key, $username, $create, $password): array {
        $existing = $accounts[$key] ?? null;
        if ($create && $existing) authResponse(409, 'That username is already used.');
        if (!$create && !$existing) authResponse(404, 'Staff account not found.');
        $entry = [
            'username' => $existing['username'] ?? $username,
            'active' => $create || $_POST['active'] === '1',
            'version' => bin2hex(random_bytes(16)),
        ];
        if ($create) $entry['hash'] = password_hash($password, PASSWORD_DEFAULT);
        $accounts[$key] = array_replace($existing ?? [], $entry);
        return [$entry, $accounts];
    };

    $database = remsDatabase();
    [$entry, $accounts] = $database !== null
        ? withDatabaseState($database, 'staff', true, 'fileStaffAccounts', $change)
        : changeStaffFile($create, $change);
    try {
        withShopData(true, static function (array &$data) use ($account, $entry, $create): array {
            $activity = $create ? 'Added staff account ' . $entry['username'] :
                'Updated staff account ' . $entry['username'] . ' to ' . ($entry['active'] ? 'active' : 'disabled');
            recordShopAudit($data, $account, 'User Management', $activity . '.');
            return [];
        });
    } catch (RuntimeException | JsonException $error) {
        error_log('REMS staff account audit: ' . $error->getMessage());
    }
    authResponse(200, $create ? 'Staff account created.' : ($entry['active'] ? 'Staff account enabled.' : 'Staff account disabled.'), [
        'accounts' => staffAccountList($accounts),
    ]);
}

// Locks the staff file during an append and rolls back a partial write so older account entries remain readable.
function changeStaffFile(bool $create, callable $change): array
{
    if (!$create && !is_file(STAFF_FILE)) {
        authResponse(404, 'Staff account not found.');
    }
    $file = fopen(STAFF_FILE, $create ? 'c+b' : 'r+b');
    if ($file === false) {
        throw new RuntimeException('Cannot open staff credentials.');
    }
    try {
        if (!flock($file, LOCK_EX)) {
            throw new RuntimeException('Cannot lock staff credentials.');
        }
        $accounts = readStaffAccounts($file);
        [$entry, $accounts] = $change($accounts);
        fseek($file, 0, SEEK_END);
        $offset = ftell($file);
        if ($offset === false) {
            throw new RuntimeException('Cannot locate end of staff credentials.');
        }
        $line = ($offset === 0 ? ADMIN_FILE_HEADER : '') . json_encode($entry, JSON_THROW_ON_ERROR) . "\n";
        if (fwrite($file, $line) !== strlen($line) || !fflush($file)) {
            ftruncate($file, $offset);
            throw new RuntimeException('Cannot save staff credentials.');
        }
        return [$entry, $accounts];
    } finally {
        fclose($file);
    }
}
