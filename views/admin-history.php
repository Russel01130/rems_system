<?php
// Administrator Transaction History and Audit Logs templates. JavaScript loads and filters the data, then fills the tables and export controls.
if (empty($isAdmin)) {
    http_response_code(404);
    exit;
}
$historyPages = [
    'Transaction History' => ['transactions', 'View product sales, pickup orders, and appointments in one place.',
        ['Date & Time', 'Reference', 'Type', 'Customer / Pet', 'Item / Service', 'Qty', 'Total', 'Processed By', 'Status', 'Details']],
    'Audit Logs' => ['audit', 'Track recorded system activity and the accounts responsible for each change.',
        ['Date & Time', 'Account', 'Role', 'Module', 'Action', 'Description', 'Status', 'Details']],
];
$metrics = [
    'transactions' => [['▣', 'Total Transactions'], ['🛒', 'Product Sales Today'], ['✂', 'Services & Bookings'], ['₱', 'Revenue Today']],
    'audit' => [['▣', 'Logs Today'], ['⚿', 'Login Activity Today'], ['⚠', 'Critical Actions Today'], ['♙', 'Admin Accounts Active Today']],
];
foreach ($historyPages as $title => [$key, $description, $columns]):
?>
<section data-admin-history="<?= $title ?>" id="admin-<?= $key ?>" aria-labelledby="<?= $key ?>-heading" hidden>
    <div class="operation-heading">
        <div><h1 id="<?= $key ?>-heading"><?= $title ?></h1><p class="subtitle"><?= $description ?></p></div>
    </div>
    <div class="stats history-metrics">
        <?php foreach ($metrics[$key] as $index => [$icon, $label]): ?>
        <div class="stat"><span class="bubble color-<?= $index ?>" aria-hidden="true"><?= $icon ?></span><div><small><?= $label ?></small><strong>—</strong></div></div>
        <?php endforeach; ?>
    </div>
    <!-- Filter controls are read by admin-history.js and determine which rows appear in the report and exports. -->
    <form class="history-filters" aria-label="<?= $title ?> filters">
        <div class="history-filter-bar">
            <label class="search"><span aria-hidden="true">⌕</span><input name="query" type="search" maxlength="80" placeholder="<?= $key === 'audit' ? 'Search by account, action, or module…' : 'Search by reference, customer, pet, or item…' ?>" aria-label="Search <?= strtolower($title) ?>"></label>
            <div class="history-filter-actions">
                <button type="reset" class="filter">Reset</button>
                <?php if ($key === 'audit'): ?>
                <button type="button" class="filter" id="refresh-audit">Refresh</button>
                <button type="button" class="primary" id="export-audit">Export Logs</button>
                <?php else: ?>
                <button type="button" class="filter" id="export-transactions-csv">Export CSV</button>
                <button type="button" class="primary" id="export-transactions-pdf">Export PDF</button>
                <?php endif; ?>
            </div>
        </div>
        <div class="history-filter-options">
            <?php if ($key === 'audit'): ?>
            <label>User Role<select name="role"><option value="">All roles</option></select></label>
            <label>Module<select name="area"><option value="">All modules</option></select></label>
            <label>Action Type<select name="event"><option value="">All actions</option></select></label>
            <?php else: ?>
            <label>Transaction Type<select name="type"><option value="">All transaction types</option></select></label>
            <label>Status<select name="status"><option value="">All statuses</option></select></label>
            <?php endif; ?>
            <label>Date Range<select name="range"><option value="">All dates</option><option value="today">Today</option><option value="week">Last 7 days</option><option value="month">This month</option></select></label>
        </div>
        <p class="retail-message" id="<?= $key ?>-history-message" role="status"></p>
    </form>
    <div class="inventory-table admin-history-table">
        <table>
            <thead><tr><?php foreach ($columns as $column): ?><th scope="col"><?= $column ?></th><?php endforeach; ?></tr></thead>
            <tbody id="<?= $key ?>-history-rows"></tbody>
        </table>
        <footer><span id="<?= $key ?>-history-count"></span><div class="pagination" id="<?= $key ?>-history-pages"></div></footer>
    </div>
</section>
<?php endforeach; ?>
<!-- A single details dialog serves both transaction and audit rows. -->
<dialog id="history-details-dialog" aria-labelledby="history-details-title">
    <button type="button" class="close" aria-label="Close">×</button>
    <h2 id="history-details-title"></h2>
    <dl id="history-details-fields"></dl>
    <button type="button" class="primary" id="history-details-pdf" hidden>Download PDF</button>
</dialog>
