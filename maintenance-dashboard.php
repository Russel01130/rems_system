<?php
if (empty($isSuperAdmin)) {
    http_response_code(404);
    exit;
}
$navigation = ['overview' => ['▦', 'Maintenance Overview']] + MAINTENANCE_MODULES + ['history' => ['◷', 'Maintenance History']];
$selected = $_GET['maintenance'] ?? 'overview';
if (!is_string($selected) || !isset($navigation[$selected])) $selected = 'overview';
$formatChangeTime = static fn(string $date): string =>
    (new DateTimeImmutable($date))->setTimezone(new DateTimeZone('Asia/Manila'))->format('M j, Y, g:i A');
?>
<div id="admin" data-role="super_admin">
    <aside class="sidebar">
        <div class="admin-brand"><span aria-hidden="true">⌂<i>🐾</i></span><div><strong>Rem’s</strong><small>Pet Supplies &amp;<br>Accessories Shop</small></div></div>
        <nav aria-label="Maintenance navigation">
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
        <p class="subtitle">Check module status and the most recent change for each control. Times are shown in Manila time.</p>
        <div class="maintenance-list">
            <?php foreach (MAINTENANCE_MODULES as $key => [, $label]): $status = $maintenance[$key]; ?>
            <a class="maintenance-tile" href="?maintenance=<?= $key ?>">
                <strong><?= $label ?></strong>
                <span class="maintenance-badge" data-paused="<?= $status['enabled'] ? 'true' : 'false' ?>"><?= $status['enabled'] ? 'Maintenance on' : 'Maintenance off' ?></span>
                <small><?= $status['changedAt'] ? 'Last changed ' . $formatChangeTime($status['changedAt']) : 'No changes yet' ?></small>
            </a>
            <?php endforeach; ?>
        </div>
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
        <?php else: ?>
        <?php [, $label, $description] = MAINTENANCE_MODULES[$selected]; $status = $maintenance[$selected]; ?>
        <h1><?= $label ?> Maintenance</h1>
        <p class="subtitle"><?= $description ?></p>
        <?php if ($maintenanceEnabled && $selected !== 'system'): ?>
        <p class="maintenance-notice">System-wide maintenance is on and takes priority over this setting.</p>
        <?php endif; ?>
        <form class="maintenance-card maintenance-control" method="post" aria-label="<?= $label ?> maintenance control">
            <div>
                <h2>Maintenance mode</h2>
                <p><?= $status['enabled'] ? 'On' : 'Off' ?></p>
                <?php if ($status['changedAt']): ?>
                <small>Last changed <?= $formatChangeTime($status['changedAt']) ?> Manila time
                    <?= isset($status['changedBy']) ? 'by ' . htmlspecialchars($status['changedBy'], ENT_QUOTES, 'UTF-8') : '' ?></small>
                <?php endif; ?>
            </div>
            <input type="hidden" name="csrf" value="<?= $authToken ?>">
            <input type="hidden" name="action" value="set_maintenance">
            <input type="hidden" name="module" value="<?= $selected ?>">
            <label class="maintenance-reason">Reason for this change (optional)
                <textarea name="reason" maxlength="240" rows="2"></textarea>
            </label>
            <button class="maintenance-switch" type="submit" name="enabled" value="<?= $status['enabled'] ? '0' : '1' ?>"
                role="switch" aria-checked="<?= $status['enabled'] ? 'true' : 'false' ?>" aria-label="<?= $label ?> maintenance mode"></button>
        </form>
        <?php endif; ?>
    </main>
</div>
