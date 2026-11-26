<?php
// Super Admin layout for the maintenance overview, history, user management and audit log sections.
if (empty($isSuperAdmin)) {
    http_response_code(404);
    exit;
}
$navigation = ['overview' => ['▦', 'Maintenance Overview'], 'history' => ['◷', 'Maintenance History'],
    'users' => ['♙', 'User Management'], 'audit' => ['≡', 'Audit Logs']];
$selected = $_GET['maintenance'] ?? 'overview';
if (!is_string($selected) || !isset($navigation[$selected])) $selected = 'overview';
$formatChangeTime = static fn(string $date): string =>
    (new DateTimeImmutable($date))->setTimezone(new DateTimeZone('Asia/Manila'))->format('M j, Y, g:i A');
?>
<div id="admin" data-role="super_admin">
    <aside class="sidebar">
        <div class="admin-brand"><span aria-hidden="true">⌂<i>🐾</i></span><div><strong>Rem’s</strong><small>Pet Supplies &amp;<br>Accessories Shop</small></div></div>
        <!-- A GET parameter identifies the overview, history, account or audit page without changing shop state. -->
        <nav aria-label="Super Admin navigation">
            <form method="get">
                <?php foreach ($navigation as $key => [$icon, $label]): ?>
                <button type="submit" name="maintenance" value="<?= $key ?>" <?= $selected === $key ? 'aria-current="page"' : '' ?>>
                    <span aria-hidden="true"><?= $icon ?></span><?= $label ?>
                </button>
                <?php endforeach; ?>
            </form>
        </nav>
        <form class="logout-form" method="post">
            <input type="hidden" name="csrf" value="<?= $authToken ?>">
            <input type="hidden" name="action" value="logout">
            <button class="logout" type="submit"><span aria-hidden="true">⇥</span> Logout</button>
        </form>
    </aside>
    <main class="workspace maintenance-workspace">
        <header class="admin-header">
            <span class="admin-header-title">Super Admin Dashboard</span>
            <span><?= htmlspecialchars($account['username'], ENT_QUOTES, 'UTF-8') ?></span>
        </header>
        <?php if ($selected === 'overview'): ?>
        <h1>Maintenance Overview</h1>
        <p class="subtitle">Enter a reason, then select a module’s maintenance button to switch it on or off. Times are shown in Manila time.</p>
        <p id="system-maintenance-note" class="maintenance-notice" role="status" <?= $maintenanceEnabled ? '' : 'hidden' ?>>System-wide maintenance is on and takes priority over individual module settings.</p>
        <!-- Each module posts its next state, required reason and CSRF token from the overview card. -->
        <div class="maintenance-list">
            <?php foreach (MAINTENANCE_MODULES as $key => [, $label]): $status = $maintenance[$key]; ?>
            <form class="maintenance-tile" method="post" aria-label="<?= $label ?> maintenance control">
                <strong><?= $label ?></strong>
                <input type="hidden" name="csrf" value="<?= $authToken ?>">
                <input type="hidden" name="action" value="set_maintenance">
                <input type="hidden" name="module" value="<?= $key ?>">
                <button type="submit" class="maintenance-badge maintenance-toggle" name="enabled" value="<?= $status['enabled'] ? '0' : '1' ?>"
                    data-paused="<?= $status['enabled'] ? 'true' : 'false' ?>" role="switch" aria-checked="<?= $status['enabled'] ? 'true' : 'false' ?>"
                    aria-label="<?= $label ?> maintenance"><?= $status['enabled'] ? 'Maintenance on' : 'Maintenance off' ?></button>
                <label class="maintenance-reason">Reason (required)
                    <textarea name="reason" maxlength="240" rows="2" required></textarea>
                </label>
                <small class="maintenance-last-change"><?= $status['changedAt'] ? 'Last changed ' . $formatChangeTime($status['changedAt']) : 'No changes yet' ?></small>
                <p class="maintenance-feedback" role="status"></p>
            </form>
            <?php endforeach; ?>
        </div>
        <script src="assets/js/maintenance.js?v=<?= filemtime(__DIR__ . '/../assets/js/maintenance.js') ?>" defer></script>
        <?php elseif ($selected === 'history'): ?>
        <h1>Maintenance History</h1>
        <p class="subtitle">Changes appear newest first. Times are shown in Manila time.</p>
        <?php
        try {
            $history = withShopData(false, static fn(array $data): array => $data['maintenance']['history'] ?? []);
        } catch (RuntimeException | JsonException $error) {
            error_log('REMS maintenance history: ' . $error->getMessage());
            $history = null;
        }
        ?>
        <?php if ($history === null): ?>
        <p role="alert">Maintenance history is temporarily unavailable.</p>
        <?php elseif ($history === []): ?>
        <p>No maintenance changes have been logged yet.</p>
        <?php else: ?>
        <?php
        $pageSize = 20;
        $pageCount = (int) ceil(count($history) / $pageSize);
        $requestedPage = $_GET['page'] ?? '1';
        $page = is_string($requestedPage) ? max(1, min($pageCount, (int) $requestedPage)) : 1;
        $entries = array_slice(array_reverse($history), ($page - 1) * $pageSize, $pageSize);
        ?>
        <!-- The history table displays stored reasons and timestamps in Manila time. -->
        <div class="maintenance-history-table">
            <table aria-label="Maintenance changes">
                <thead><tr><th scope="col">Date and time</th><th scope="col">Module</th><th scope="col">Maintenance</th><th scope="col">Changed by</th><th scope="col">Reason</th></tr></thead>
                <tbody>
                <?php foreach ($entries as $entry): ?>
                    <tr>
                        <td><?= $formatChangeTime($entry['changedAt']) ?></td>
                        <td><?= MAINTENANCE_MODULES[$entry['module']][1] ?? htmlspecialchars($entry['module'], ENT_QUOTES, 'UTF-8') ?></td>
                        <td><span class="maintenance-badge" data-paused="<?= $entry['enabled'] ? 'true' : 'false' ?>"><?= $entry['enabled'] ? 'On' : 'Off' ?></span></td>
                        <td><?= htmlspecialchars($entry['changedBy'], ENT_QUOTES, 'UTF-8') ?></td>
                        <td class="maintenance-history-reason"><?= $entry['reason'] === '' ? '—' : htmlspecialchars($entry['reason'], ENT_QUOTES, 'UTF-8') ?></td>
                    </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php if ($pageCount > 1): ?>
        <nav class="maintenance-history-pages" aria-label="Maintenance history pages">
            <?php if ($page > 1): ?><a href="?maintenance=history&amp;page=<?= $page - 1 ?>">Previous</a><?php endif; ?>
            <span>Page <?= $page ?> of <?= $pageCount ?></span>
            <?php if ($page < $pageCount): ?><a href="?maintenance=history&amp;page=<?= $page + 1 ?>">Next</a><?php endif; ?>
        </nav>
        <?php endif; ?>
        <?php endif; ?>
        <?php elseif ($selected === 'users'): ?>
        <?php require __DIR__ . '/super-admin-users.php'; ?>
        <?php elseif ($selected === 'audit'): ?>
        <?php require __DIR__ . '/super-admin-audit.php'; ?>
        <?php endif; ?>
    </main>
</div>
