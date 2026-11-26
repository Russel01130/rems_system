<?php
// Session security, password verification, first-time administrator setup and the authenticated POST router for every dashboard.
declare(strict_types=1);

require_once __DIR__ . '/staff-auth.php';
require_once __DIR__ . '/shop-data-lib.php';
require_once __DIR__ . '/customer-lib.php';
require_once __DIR__ . '/booking-workflow.php';
require_once __DIR__ . '/database.php';
require_once __DIR__ . '/super-admin.php';

// Local credential and shop files use a PHP guard header before the serialized payload.
const ADMIN_FILE = __DIR__ . '/../admin.credentials.php';
const ADMIN_FILE_HEADER = "<?php http_response_code(404); exit; __halt_compiler();\n";

// Reads and validates one protected credential record. The returned hash is used only for verification.
function readAdmin($file): ?array
{
    rewind($file);
    $content = stream_get_contents($file);
    if ($content === '') {
        return null;
    }
    if ($content === false || !str_starts_with($content, ADMIN_FILE_HEADER)) {
        throw new RuntimeException('Invalid admin credential file.');
    }
    $admin = json_decode(substr($content, strlen(ADMIN_FILE_HEADER)), true, 512, JSON_THROW_ON_ERROR);
    if (!isset($admin['username'], $admin['hash']) || !is_string($admin['username']) || !is_string($admin['hash'])) {
        throw new RuntimeException('Invalid admin credential data.');
    }
    return $admin;
}

// Configures the session cookie, starts the session, and creates a CSRF token for requests that change state.
function startAdminSession(): void
{
    $path = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/index.php'));
    session_name('REMSADMIN');
    $started = session_start([
        'use_strict_mode' => true,
        'cookie_httponly' => true,
        'cookie_secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'cookie_samesite' => 'Strict',
        'cookie_path' => rtrim($path, '/') . '/',
    ]);
    if (!$started) {
        http_response_code(503);
        exit('The admin session could not start. Check the Laragon PHP configuration.');
    }
    header('Cache-Control: no-store');
    $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
}

// Checks whether setup has already created the shop administrator account.
function adminIsConfigured(): bool
{
    return adminCredentials() !== null;
}

// Uses the MySQL admin state when configured, with the local credential file as its initial source.
function adminCredentials(): ?array
{
    $database = remsDatabase();
    if ($database !== null) {
        return withDatabaseState($database, 'admin', false, 'fileAdminCredentials', static fn(?array $admin): ?array => $admin);
    }
    return fileAdminCredentials();
}

// Reads the local administrator credentials under a shared file lock.
function fileAdminCredentials(): ?array
{
    if (!is_file(ADMIN_FILE)) {
        return null;
    }
    $file = fopen(ADMIN_FILE, 'rb');
    if ($file === false) {
        throw new RuntimeException('Cannot read admin credentials.');
    }
    try {
        if (!flock($file, LOCK_SH)) {
            throw new RuntimeException('Cannot lock admin credentials.');
        }
        return readAdmin($file);
    } finally {
        fclose($file);
    }
}

// Creates the first administrator with a password hash and prevents concurrent setup from replacing it.
function createAdmin(string $username, string $password): bool
{
    $database = remsDatabase();
    if ($database !== null) {
        return withDatabaseState($database, 'admin', true, 'fileAdminCredentials',
            static function (?array &$admin) use ($username, $password): bool {
                if ($admin !== null) return false;
                $admin = ['username' => $username, 'hash' => password_hash($password, PASSWORD_DEFAULT)];
                return true;
            });
    }
    $file = fopen(ADMIN_FILE, 'c+b');
    if ($file === false) {
        throw new RuntimeException('Cannot open admin credentials.');
    }
    try {
        if (!flock($file, LOCK_EX)) {
            throw new RuntimeException('Cannot lock admin credentials.');
        }
        if (readAdmin($file) !== null) {
            return false;
        }
        $content = ADMIN_FILE_HEADER . json_encode([
            'username' => $username,
            'hash' => password_hash($password, PASSWORD_DEFAULT),
        ], JSON_THROW_ON_ERROR);
        if (fwrite($file, $content) !== strlen($content) || !fflush($file)) {
            ftruncate($file, 0);
            throw new RuntimeException('Cannot save admin credentials.');
        }
        return true;
    } finally {
        fclose($file);
    }
}

// Checks the supplied username and password against the stored administrator credentials.
function verifyAdmin(string $username, string $password): ?string
{
    $admin = adminCredentials();
    if ($admin === null || !password_verify($password, $admin['hash']) || strcasecmp($admin['username'], $username) !== 0) {
        return null;
    }
    return $admin['username'];
}

// Sends a JSON response and stops execution so a failed request cannot continue into a later write.
function authResponse(int $status, string $message = '', array $data = []): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['message' => $message] + $data, JSON_THROW_ON_ERROR);
    exit;
}

// Checks the username and password against the rules shared by account creation forms.
function validateNewCredentials(string $username, string $password): void
{
    if (!preg_match('/\A[A-Za-z0-9._-]{3,32}\z/', $username)) {
        authResponse(422, 'Use 3–32 letters, numbers, periods, underscores, or hyphens for the username.');
    }
    if (preg_match_all('/./us', $password) < 12 || trim($password) === '') {
        authResponse(422, 'Choose a password with at least 12 characters.');
    }
    if ($password !== ($_POST['confirmation'] ?? '')) {
        authResponse(422, 'The passwords do not match.');
    }
}

// Records sign-in activity without placing the submitted password in the audit log.
function auditAuthentication(array $account, string $activity, string $status = 'Success'): void
{
    try {
        withShopData(true, static function (array &$data) use ($account, $activity, $status): array {
            recordShopAudit($data, $account, 'Authentication', $activity, $status);
            return [];
        });
    } catch (RuntimeException | JsonException $error) {
        error_log('REMS sign-in audit: ' . $error->getMessage());
    }
}

// Validates the CSRF token, applies maintenance restrictions, and routes a POST to the appropriate role-checked handler.
function handleAdminRequest(): void
{
    // The action field identifies an endpoint. The CSRF token must match the one in the current session.
    $action = $_POST['action'] ?? '';
    $csrf = $_POST['csrf'] ?? '';
    if (!is_string($csrf) || !hash_equals($_SESSION['csrf'], $csrf)) {
        authResponse(403, 'Your session expired. Refresh and try again.');
    }
    if ($action === 'logout') {
        $_SESSION = [];
        session_regenerate_id(true);
        header('Location: ./', true, 303);
        exit;
    }
    try {
        if ($action === 'set_maintenance') handleMaintenanceChange();
        $staffAction = in_array($action, ['list_staff', 'create_staff', 'set_staff_status'], true);
        if (isset($_SESSION['super_admin']) && !$staffAction) {
            authResponse(403, 'Use the Super Admin maintenance dashboard.');
        }
        if ($action !== 'login' && !isset($_SESSION['super_admin']) && maintenanceStatus()['system']['enabled']) {
            authResponse(503, MAINTENANCE_NOTICE);
        }
    } catch (RuntimeException | JsonException $error) {
        error_log('REMS maintenance: ' . $error->getMessage());
        authResponse(503, 'System maintenance controls are temporarily unavailable.');
    }
    if (in_array($action, ['customer_signup', 'customer_read', 'customer_register_pet', 'customer_book', 'customer_order', 'customer_admin_list', 'customer_order_list', 'customer_order_status', 'customer_booking_status', 'customer_read_notifications'], true)) {
        try {
            if ($action === 'customer_signup') handleCustomerSignup();
            handleCustomerPortal($action);
        } catch (RuntimeException | JsonException | ValueError $error) {
            error_log('REMS customer portal: ' . $error->getMessage());
            authResponse(500, 'The customer portal is temporarily unavailable.');
        }
    }
    if (in_array($action, ['shop_read', 'shop_status', 'shop_submit', 'shop_save', 'shop_decide', 'sale_receipt_download', 'audit_read'], true)) {
        try {
            handleShopRequest($action);
        } catch (RuntimeException | JsonException | ValueError $error) {
            error_log('REMS shop data: ' . $error->getMessage());
            authResponse(500, 'Shop records are temporarily unavailable.');
        }
    }
    if ($staffAction) {
        try {
            handleStaffAccountRequest($action);
        } catch (RuntimeException | JsonException | ValueError $error) {
            error_log('REMS staff accounts: ' . $error->getMessage());
            authResponse(500, 'Staff accounts are temporarily unavailable.');
        }
    }
    if ($action !== 'login' && $action !== 'setup') {
        authResponse(400, 'Unknown sign-in action.');
    }
    $username = $_POST['username'] ?? '';
    $password = $_POST['password'] ?? '';
    if (!is_string($username) || !is_string($password) || strlen($password) > 72 || str_contains($password, "\0")) {
        authResponse(422, 'Enter a valid username and password.');
    }
    $username = trim($username);
    try {
        $staff = null;
        $customer = null;
        $superAdmin = null;
        if ($action === 'setup') {
            validateNewCredentials($username, $password);
            if (!createAdmin($username, $password)) {
                authResponse(409, 'An admin already exists. Refresh this page and sign in.');
            }
        } else {
            $now = time();
            if (($_SESSION['retry_at'] ?? 0) > $now) {
                authResponse(429, 'Too many attempts. Wait one minute and try again.');
            }
            $superAdmin = verifySuperAdmin($username, $password);
            if ($superAdmin === null && maintenanceStatus()['system']['enabled']) {
                $_SESSION['attempts'] = ($_SESSION['attempts'] ?? 0) + 1;
                if ($_SESSION['attempts'] >= 5) {
                    $_SESSION['attempts'] = 0;
                    $_SESSION['retry_at'] = $now + 60;
                }
                authResponse(503, MAINTENANCE_NOTICE);
            }
            $verified = $superAdmin ?? verifyAdmin($username, $password);
            if ($verified === null) {
                $candidate = staffAccounts()[strtolower($username)] ?? null;
                if ($candidate && $candidate['active'] && password_verify($password, $candidate['hash'])) {
                    $staff = $candidate;
                    $verified = $candidate['username'];
                }
            }
            if ($verified === null) {
                $customer = verifyCustomer($username, $password);
                $verified = $customer['username'] ?? null;
            }
            if ($verified === null) {
                $_SESSION['attempts'] = ($_SESSION['attempts'] ?? 0) + 1;
                if ($_SESSION['attempts'] >= 5) {
                    $_SESSION['attempts'] = 0;
                    $_SESSION['retry_at'] = $now + 60;
                    auditAuthentication(['username' => 'System', 'role' => 'system'], 'Failed sign-in attempts reached the retry limit.', 'Warning');
                }
                authResponse(401, 'The username or password is incorrect.');
            }
            $username = $verified;
        }
        if (!session_regenerate_id(true)) {
            throw new RuntimeException('Cannot rotate the admin session.');
        }
        $_SESSION = ['csrf' => bin2hex(random_bytes(32))];
        if ($superAdmin !== null) {
            $_SESSION['super_admin'] = $superAdmin;
        } elseif ($customer) {
            $_SESSION['customer'] = $customer;
        } elseif ($staff) {
            $_SESSION['staff'] = $staff['username'];
            $_SESSION['staff_version'] = $staff['version'];
        } else {
            $_SESSION['admin'] = $username;
        }
        auditAuthentication(currentAccount(), 'Signed in successfully.');
        authResponse(200);
    } catch (RuntimeException | JsonException | ValueError $error) {
        error_log('REMS authentication: ' . $error->getMessage());
        authResponse(500, 'Sign-in is temporarily unavailable. Check the Laragon PHP logs.');
    }
}
