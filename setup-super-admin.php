<?php
// CLI-only first-time setup for the Super Admin. It stores a password hash in a protected local file and fails if setup already exists.
declare(strict_types=1);

// Reject browser requests before accepting setup arguments.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/includes/admin-auth.php';

$username = $argv[1] ?? 'superadmin';
if (!preg_match('/\A[A-Za-z0-9._-]{3,32}\z/', $username)) {
    fwrite(STDERR, "Use 3 to 32 letters, numbers, periods, underscores, or hyphens.\n");
    exit(1);
}

$password = bin2hex(random_bytes(16));
$credentials = ADMIN_FILE_HEADER . json_encode([
    'username' => $username,
    'hash' => password_hash($password, PASSWORD_DEFAULT),
], JSON_THROW_ON_ERROR);

// Open the protected credential file in exclusive creation mode so existing setup cannot be replaced.
$file = @fopen(SUPER_ADMIN_FILE, 'xb');
if ($file === false) {
    fwrite(STDERR, "Super Admin already exists or the credential file could not be created.\n");
    exit(1);
}
try {
    if (!flock($file, LOCK_EX) || fwrite($file, $credentials) !== strlen($credentials) || !fflush($file)) {
        throw new RuntimeException('Cannot save Super Admin credentials.');
    }
} catch (RuntimeException $error) {
    fclose($file);
    unlink(SUPER_ADMIN_FILE);
    fwrite(STDERR, $error->getMessage() . PHP_EOL);
    exit(1);
}
fclose($file);

echo "Super Admin username: $username\n";
echo "Generated password: $password\nSave this password before closing the terminal.\n";
