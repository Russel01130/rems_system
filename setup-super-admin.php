<?php
declare(strict_types=1);

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
