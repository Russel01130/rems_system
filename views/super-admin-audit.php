<?php
// Server-rendered Super Admin audit page with validated filters, escaped event text and paginated results.
if (empty($isSuperAdmin)) {
    http_response_code(404);
    exit;
}

$escape = static fn(string $value): string => htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
$filters = [];
foreach (['query', 'role', 'area', 'event', 'range'] as $field) {
    $value = $_GET[$field] ?? '';
    $filters[$field] = is_string($value) && strlen($value) <= 240 ? trim($value) : '';
}
$filters['export'] = '';
$page = filter_input(INPUT_GET, 'page', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) ?: 1;
$roleLabels = ['admin' => 'Administrator', 'staff' => 'Staff', 'customer' => 'Customer', 'super_admin' => 'Super Admin', 'system' => 'System'];
$ranges = ['today' => 'Today', 'week' => 'Last 7 days', 'month' => 'This month'];
try {
    $logs = withShopData(false, static fn(array $data): array => auditLogResult($data['auditLog'] ?? [], $filters, $page));
} catch (RuntimeException | JsonException $error) {
    error_log('REMS Super Admin audit logs: ' . $error->getMessage());
    $logs = null;
}
$pageLink = static fn(int $number): string => '?' . http_build_query(
    ['maintenance' => 'audit', 'page' => $number] + array_filter($filters, static fn(string $value): bool => $value !== '')
);
?>
<h1>Audit Logs</h1>
<p class="subtitle">Activity appears newest first. Times are shown in Manila time.</p>
<?php if ($logs === null): ?>
<p role="alert">Audit logs are temporarily unavailable.</p>
<?php else: ?>
<!-- Audit filters travel in GET parameters so pagination can retain the chosen criteria. -->
<form method="get" class="history-filters" aria-label="Audit log filters">
    <input type="hidden" name="maintenance" value="audit">
    <div class="history-filter-options">
        <label>Search <input class="filter" type="search" name="query" maxlength="80" value="<?= $escape($filters['query']) ?>"></label>
        <?php foreach (['role' => 'Role', 'area' => 'Module', 'event' => 'Event', 'range' => 'Date range'] as $field => $label): ?>
        <label><?= $label ?>
            <select class="filter" name="<?= $field ?>">
                <option value="">All</option>
                <?php $choices = $field === 'range' ? $ranges : array_combine($logs['facets'][$field], $logs['facets'][$field]); ?>
                <?php foreach ($choices as $value => $name): ?>
                <option value="<?= $escape((string) $value) ?>" <?= $filters[$field] === (string) $value ? 'selected' : '' ?>><?= $escape($field === 'role' ? ($roleLabels[$value] ?? $name) : $name) ?></option>
                <?php endforeach; ?>
            </select>
        </label>
        <?php endforeach; ?>
        <button type="submit" class="filter">Apply Filters</button>
        <a href="?maintenance=audit">Clear filters</a>
    </div>
</form>
<div class="maintenance-history-table">
    <table aria-label="Audit activity">
        <thead><tr><th scope="col">Date and time</th><th scope="col">Account</th><th scope="col">Role</th><th scope="col">Module</th><th scope="col">Activity</th><th scope="col">Status</th></tr></thead>
        <tbody>
            <?php foreach ($logs['entries'] as $entry): ?>
            <tr>
                <td><?= $formatChangeTime($entry['timestamp']) ?></td>
                <td><?= $escape($entry['account']) ?></td>
                <td><?= $escape($roleLabels[$entry['role']] ?? $entry['role']) ?></td>
                <td><?= $escape($entry['area']) ?></td>
                <td class="maintenance-history-reason"><?= $escape($entry['activity']) ?></td>
                <td><?= $escape($entry['status']) ?></td>
            </tr>
            <?php endforeach; ?>
            <?php if (!$logs['entries']): ?><tr><td colspan="6">No matching audit activity.</td></tr><?php endif; ?>
        </tbody>
    </table>
</div>
<?php if ($logs['pages'] > 1): ?>
<nav class="maintenance-history-pages" aria-label="Audit log pages">
    <?php if ($logs['page'] > 1): ?><a href="<?= $escape($pageLink($logs['page'] - 1)) ?>">Previous</a><?php endif; ?>
    <span>Page <?= $logs['page'] ?> of <?= $logs['pages'] ?></span>
    <?php if ($logs['page'] < $logs['pages']): ?><a href="<?= $escape($pageLink($logs['page'] + 1)) ?>">Next</a><?php endif; ?>
</nav>
<?php endif; ?>
<?php endif; ?>
