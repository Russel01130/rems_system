<?php
// Super Admin directory of administrator and customer identities, with the shared staff account controls.
if (empty($isSuperAdmin)) {
    http_response_code(404);
    exit;
}

$escape = static fn(string $value): string => htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
try {
    $administrator = adminCredentials();
    $customers = withShopData(false, static fn(array $data): array => array_values($data['customerAccounts'] ?? []));
    usort($customers, static fn(array $left, array $right): int => strcasecmp($left['username'], $right['username']));
} catch (RuntimeException | JsonException $error) {
    error_log('REMS Super Admin user list: ' . $error->getMessage());
    $customers = null;
}
?>
<h1>User Management</h1>
<?php require __DIR__ . '/staff-accounts.php'; ?>
<?php require __DIR__ . '/staff-account-dialog.php'; ?>
<section class="staff-accounts" aria-labelledby="administrator-accounts-heading">
    <h2 id="administrator-accounts-heading">Administrator Accounts</h2>
    <p><?= $escape($account['username']) ?> · Super Admin</p>
    <?php if (!empty($administrator)): ?><p><?= $escape($administrator['username']) ?> · Administrator</p><?php endif; ?>
</section>
<!-- Customer account rows show identity and contact information without exposing account hashes. -->
<section class="staff-accounts" aria-labelledby="customer-accounts-heading">
    <h2 id="customer-accounts-heading">Customer Accounts</h2>
    <?php if ($customers === null): ?>
    <p role="alert">Account details are temporarily unavailable.</p>
    <?php elseif (!$customers): ?>
    <p>No customer accounts yet.</p>
    <?php else: ?>
    <div class="maintenance-history-table">
        <table aria-labelledby="customer-accounts-heading">
            <thead><tr><th scope="col">Username</th><th scope="col">Name</th><th scope="col">Email</th></tr></thead>
            <tbody>
                <?php foreach ($customers as $customer): ?>
                <tr><td><?= $escape($customer['username']) ?></td><td><?= $escape($customer['name']) ?></td><td><?= $escape($customer['email']) ?></td></tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
    <?php endif; ?>
</section>
