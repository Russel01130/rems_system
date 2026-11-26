<?php
// Application entry point. It loads the session and maintenance state, dispatches POST actions, and renders the page for the authenticated role.
// Load the server-side modules before deciding which page or endpoint this request needs.
require_once __DIR__ . '/includes/admin-auth.php';
startAdminSession();
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    handleAdminRequest();
}
try {
    // Read the session identity and the shared maintenance flags before choosing a role-specific view.
    $account = currentAccount();
    $maintenance = maintenanceStatus();
} catch (RuntimeException | JsonException $error) {
    error_log('REMS account: ' . $error->getMessage());
    http_response_code(503);
    exit('Your account is temporarily unavailable.');
}
$signedIn = $account !== null;
$isCustomer = $signedIn && $account['role'] === 'customer';
$isAdmin = $signedIn && $account['role'] === 'admin';
$isSuperAdmin = $signedIn && $account['role'] === 'super_admin';
$maintenanceEnabled = $maintenance['system']['enabled'];
$pausedModules = htmlspecialchars(json_encode(pausedModules($maintenance), JSON_THROW_ON_ERROR), ENT_QUOTES, 'UTF-8');
$showShop = $signedIn && !$isSuperAdmin && !$maintenanceEnabled;
if ($maintenanceEnabled && !$isSuperAdmin) http_response_code(503);
$dashboardTitle = $isAdmin ? 'Admin Dashboard' : 'Staff Dashboard';
$profileLabel = htmlspecialchars($isAdmin ? 'Admin' : ($account['username'] ?? ''), ENT_QUOTES, 'UTF-8');
$needsSetup = false;
$authUnavailable = false;
if (!$signedIn && !$maintenanceEnabled) {
    try {
        $needsSetup = !adminIsConfigured();
    } catch (RuntimeException | JsonException $error) {
        error_log('REMS authentication: ' . $error->getMessage());
        $authUnavailable = true;
    }
}
$authToken = htmlspecialchars($_SESSION['csrf'], ENT_QUOTES, 'UTF-8');
// Seed records give the new shop an initial catalog before shared state is initialized.
$products = [
    ['Dog Shampoo 250ml', 'Grooming', 180, 3, '🧴'],
    ['Aozi Adult 1kg', 'Pet Food', 123, 24, '🍖'],
    ['Pet Collar', 'Accessories', 120, 5, '🟢'],
    ['Dog Chew Toy', 'Toys', 95, 0, '🦴'],
    ['Cat litter 5kg', 'Hygiene', 325, 18, '🛍️'],
];
$adminPages = ['Transaction History', 'Audit Logs', 'Reports', 'User Management'];
$staffPages = ['Point of Sale', 'Booking', 'Reservation', 'Grooming & Pet Hotel'];
$staffHiddenTabs = [...$adminPages, 'Inventory', 'Customers', 'Pets'];
$navigation = ['▦ Dashboard', '◎ Inventory', '🛒 Point of Sale', '♙ Customers', '♧ Pets', '⌂ Grooming & Pet Hotel',
    '▣ Booking', '▤ Reservation', '≡ Transaction History', '◷ Audit Logs', '▥ Reports', '♙ User Management'];
// Returns the shared shop logo markup used by public and customer headers.
function logo() {
    return '<div class="logo" aria-label="Rem’s Pet Supplies and Accessories Shop"><span class="logo-house">⌂</span><div><strong>Rem’s</strong><small><b>&amp;</b> Pet Supplies<br>Accessories Shop</small><em>Quality goodies for your furbabies!</em></div></div>';
}
// Renders the nested sales filter. The hidden value is read by operations.js when building a report.
function salesPicker(string $id): void {
    ?>
    <div class="sales-picker-field">
        <span id="<?= $id ?>-label">Product or service</span>
        <details class="sales-picker">
            <summary class="filter" aria-labelledby="<?= $id ?>-label <?= $id ?>-selection">
                <span id="<?= $id ?>-selection">All products</span>
            </summary>
            <input type="hidden" id="<?= $id ?>" value="">
            <div class="sales-picker-options">
                <button type="button" data-sales-choice="service:Grooming">Grooming</button>
                <button type="button" data-sales-choice="service:Pet Hotel Check-in">Pet Hotel</button>
                <details class="sales-picker-products">
                    <summary>Product</summary>
                    <button type="button" data-sales-choice="">All products</button>
                    <div class="sales-picker-items"></div>
                </details>
            </div>
        </details>
    </div>
    <?php
}
?>
<!doctype html>
<html lang="en">
<!-- The following assets are selected by role and loaded in dependency order. -->
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rem’s Pet Supplies &amp; Accessories Shop</title>
<link rel="stylesheet" href="assets/css/style.css?v=<?= filemtime(__DIR__ . '/assets/css/style.css') ?>">
<link rel="stylesheet" href="assets/css/retail.css?v=<?= filemtime(__DIR__ . '/assets/css/retail.css') ?>">
<?php if ($showShop): ?>
<script src="assets/js/record-photo.js?v=<?= filemtime(__DIR__ . '/assets/js/record-photo.js') ?>" defer></script>
<script src="assets/js/catalog-variants.js?v=<?= filemtime(__DIR__ . '/assets/js/catalog-variants.js') ?>" defer></script>
<?php endif; ?>
<?php if ($showShop && ($isAdmin || $isCustomer)): ?>
<script src="assets/vendor/jspdf-4.2.1.umd.min.js" defer></script>
<script src="assets/js/receipt-pdf.js?v=<?= filemtime(__DIR__ . '/assets/js/receipt-pdf.js') ?>" defer></script>
<?php endif; ?>
<?php if ($showShop && $isCustomer): ?>
<link rel="stylesheet" href="assets/css/customer.css?v=<?= filemtime(__DIR__ . '/assets/css/customer.css') ?>">
<script src="assets/js/customer.js?v=<?= filemtime(__DIR__ . '/assets/js/customer.js') ?>" defer></script>
<?php elseif ($showShop): ?>
<script src="assets/js/app.js?v=<?= filemtime(__DIR__ . '/assets/js/app.js') ?>" defer></script>
<script src="assets/js/operations.js?v=<?= filemtime(__DIR__ . '/assets/js/operations.js') ?>" defer></script>
<script src="assets/js/retail.js?v=<?= filemtime(__DIR__ . '/assets/js/retail.js') ?>" defer></script>
<script src="assets/js/requests.js?v=<?= filemtime(__DIR__ . '/assets/js/requests.js') ?>" defer></script>
<script src="assets/js/customer-admin.js?v=<?= filemtime(__DIR__ . '/assets/js/customer-admin.js') ?>" defer></script>
<?php if ($isAdmin): ?><script src="assets/js/staff.js" defer></script>
<script src="assets/js/admin-history.js?v=<?= filemtime(__DIR__ . '/assets/js/admin-history.js') ?>" defer></script><?php endif; ?>
<?php elseif ($isSuperAdmin && ($_GET['maintenance'] ?? '') === 'users'): ?>
<script src="assets/js/staff.js?v=<?= filemtime(__DIR__ . '/assets/js/staff.js') ?>" defer></script>
<?php elseif (!$signedIn): ?>
<script src="assets/js/sign-in.js" defer></script>
<?php endif; ?>
</head>
<body>
<?php if ($isSuperAdmin): ?>
<?php require __DIR__ . '/views/maintenance-dashboard.php'; ?>
<?php elseif ($signedIn && $maintenanceEnabled): ?>
<main class="maintenance-page">
    <?= logo() ?>
    <section class="maintenance-card" aria-labelledby="maintenance-title">
        <h1 id="maintenance-title">System Under Maintenance</h1>
        <p><?= MAINTENANCE_NOTICE ?></p>
        <form method="post">
            <input type="hidden" name="csrf" value="<?= $authToken ?>">
            <input type="hidden" name="action" value="logout">
            <button type="submit" class="filter">Sign Out</button>
        </form>
    </section>
</main>
<?php elseif (!$signedIn): ?>
<div id="welcome">
<header class="welcome-header">
    <?= logo() ?>
    <button class="primary welcome-action" data-auth="login">Login</button>
</header>
<?php if ($maintenanceEnabled): ?>
<main class="maintenance-page">
    <section class="maintenance-card">
        <h1>System Under Maintenance</h1>
        <p><?= MAINTENANCE_NOTICE ?></p>
    </section>
</main>
<?php else: ?>
<!-- Public storefront introduction. Visitors open the sign-in dialog from this hero. -->
<main class="hero">
    <div class="hero-copy">
        <h1><span>Welcome!</span><strong>Rem’s</strong>Pet Supplies &amp;<br>Accessories Shop</h1>
        <p>Quality goodies for your furbabies!<br>We offer trusted pet supplies and accessories<br>to keep your pets happy, healthy, and loved.</p>
        <button class="start" data-auth="login">Get Started</button>
    </div>
    <img class="hero-photo" src="assets/pets.jpg" alt="Black Shih Tzu behind a black-and-white cat">
    <?php foreach (['paw-one', 'paw-two'] as $paw): ?>
    <svg class="paw <?= $paw ?>" viewBox="0 0 52 54" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="3.5"><ellipse cx="10" cy="21" rx="5" ry="6"/><ellipse cx="20" cy="10" rx="5" ry="6"/><ellipse cx="33" cy="10" rx="5" ry="6"/><ellipse cx="44" cy="21" rx="5" ry="6"/><path d="M12 39c0-7 8-15 14-15s14 8 14 15c0 9-8 8-14 7s-14 2-14-7Z"/></g></svg>
    <?php endforeach; ?>
</main>
<?php endif; ?>
</div>

<!-- Authentication dialog shared by account setup, sign-in and customer registration. -->
<dialog id="auth" data-unavailable="<?= $authUnavailable ? 'true' : 'false' ?>" aria-labelledby="auth-title">
    <button type="button" class="close" aria-label="Close">×</button>
    <h2 id="auth-title">Welcome Back!</h2>
    <p id="auth-intro">Sign in to your account to continue</p>
    <form id="auth-form" method="post">
        <input type="hidden" name="csrf" value="<?= $authToken ?>">
        <input type="hidden" name="action" value="login">
        <div id="customer-signup-fields" hidden>
            <label>Full name<input name="full_name" autocomplete="name" maxlength="100" disabled></label>
            <label>Email address<input name="email" type="email" autocomplete="email" maxlength="150" disabled></label>
        </div>
        <label>Username<input name="username" placeholder="Enter your username" autocomplete="username" maxlength="32" required></label>
        <label>Password<input name="password" type="password" placeholder="Enter your password" autocomplete="current-password" maxlength="72" required></label>
        <label id="password-confirmation" hidden>Confirm password<input type="password" name="confirmation" autocomplete="new-password" maxlength="72" disabled></label>
        <p id="auth-error" role="alert"></p>
        <button class="primary" id="auth-submit">Sign In</button>
    </form>
    <div id="auth-links" class="auth-links">
        <button type="button" class="link" id="auth-forgot">Forgot password?</button>
        <button type="button" class="link" id="customer-auth-toggle" <?= $maintenanceEnabled ? 'hidden' : '' ?>>Create account</button>
        <?php if ($needsSetup): ?><button type="button" class="link" id="admin-setup-link" data-auth="setup">Set up admin</button><?php endif; ?>
    </div>
    <div id="auth-recovery" hidden>
        <p>Password recovery requires help from the owner of this Laragon installation. Contact them if you cannot sign in.</p>
        <button type="button" class="primary" id="auth-recovery-back">Back to Sign In</button>
    </div>
</dialog>

<?php elseif ($isCustomer): ?>
<?php require __DIR__ . '/views/customer.php'; ?>
<?php else: ?>
<!-- The server exposes only the allowed navigation and panels for this signed-in dashboard role. -->
<div id="admin" data-csrf="<?= $authToken ?>" data-role="<?= $account['role'] ?>" data-username="<?= htmlspecialchars($account['username'], ENT_QUOTES, 'UTF-8') ?>" data-paused-modules="<?= $pausedModules ?>">
    <aside class="sidebar">
        <div class="admin-brand"><span aria-hidden="true">⌂<i>🐾</i></span><div><strong>Rem’s</strong><small>Pet Supplies &amp;<br>Accessories Shop</small></div></div>
        <nav aria-label="<?= $isAdmin ? 'Admin' : 'Staff' ?> navigation">
        <?php foreach ($navigation as $i => $item): [$symbol, $name] = explode(' ', $item, 2);
            if ($isAdmin && (in_array($name, $staffPages, true) || $name === 'Pets')) continue;
            if (!$isAdmin && in_array($name, $staffHiddenTabs, true)) continue; ?>
            <button data-section="<?= htmlspecialchars($name) ?>"><span aria-hidden="true"><?= $symbol ?></span><?= htmlspecialchars($name) ?><?php if ($name === 'Booking'): ?><span id="booking-nav-count" class="request-nav-count" hidden></span><?php endif; ?></button>
        <?php endforeach; ?>
            <?php if ($isAdmin): ?>
            <button type="button" data-section="Requests"><span aria-hidden="true">⇄</span>Approvals<span id="request-nav-count" class="request-nav-count" hidden></span></button>
            <?php endif; ?>
        </nav>
        <form class="logout-form" method="post">
            <input type="hidden" name="csrf" value="<?= $authToken ?>">
            <input type="hidden" name="action" value="logout">
            <button class="logout" id="logout"><span aria-hidden="true">⇥</span> Logout</button>
        </form>
    </aside>
    <main class="workspace">
        <p id="shop-maintenance-notice" class="retail-message maintenance-notice" role="status" hidden></p>
        <p id="shop-load-error" class="retail-message" role="alert"></p>
        <header class="admin-header">
            <span class="admin-header-title"><?= $dashboardTitle ?></span>
            <details class="profile-menu" id="profile-menu">
                <summary aria-label="<?= $profileLabel ?> profile menu">
                    <span class="profile-name"><?= $profileLabel ?></span>
                    <span class="avatar" aria-hidden="true">👨</span>
                </summary>
                <div class="profile-panel">
                    <button type="button" data-section="Dashboard">Dashboard</button>
                    <button type="button" data-section="Settings">Settings</button>
                    <button type="button" id="quick-theme" role="switch" aria-label="Dark mode" aria-checked="false">
                        <span id="quick-theme-label">Switch to dark mode</span><span class="theme-switch" aria-hidden="true"></span>
                    </button>
                    <button type="button" id="profile-logout">Logout</button>
                </div>
            </details>
        </header>
        <!-- The workspace is initialized with the overview visible. Feature scripts switch panels after navigation. -->
        <section id="dashboard">
            <h1><?= $isAdmin ? 'Dashboard' : 'Staff Dashboard' ?></h1>
            <p class="subtitle"><?= $isAdmin ? 'Welcome back! Here’s an overview for your shop today.' : 'Track stock, serve customers, and check upcoming appointments.' ?></p>
            <?php if ($isAdmin): ?>
            <section class="dashboard-approvals" aria-labelledby="dashboard-approvals-title">
                <div class="dashboard-approvals-heading">
                    <div><h2 id="dashboard-approvals-title">Staff approvals</h2>
                        <p id="dashboard-approval-count" role="status">Checking for pending requests…</p>
                    </div>
                    <button type="button" class="primary" data-section="Requests">Open Approvals</button>
                </div>
                <ul id="dashboard-approval-list" hidden></ul>
            </section>
            <section class="dashboard-sales" aria-labelledby="dashboard-sales-title">
                <h2 id="dashboard-sales-title">Sales overview</h2>
                <div class="sales-summary">
                    <div class="sales-period-picker">
                        <span class="sales-period-icon" aria-hidden="true"><i></i><i></i><i></i></span>
                        <select id="dashboard-sales-period" aria-label="Sales period">
                            <option value="today">Daily Sales</option>
                            <option value="week">Weekly Sales</option>
                            <option value="month" selected>Monthly Sales</option>
                            <option value="year">Yearly Sales</option>
                        </select>
                    </div>
                    <?php salesPicker('dashboard-sales-product'); ?>
                    <div id="dashboard-sales-total" aria-live="polite">
                        <strong></strong><small></small>
                        <small id="dashboard-sales-product-note" hidden>Includes the full value of matching sales.</small>
                    </div>
                    <button type="button" class="filter" id="dashboard-sales-report" data-section="Reports">View Report</button>
                </div>
            </section>
            <?php else: ?>
            <div class="staff-welcome">
                <strong>Staff workspace</strong>
                <p>Look up shop records, prepare a sale, or send changes to your admin for approval.</p>
                <button class="primary" type="button" data-section="Requests">My Requests</button>
            </div>
            <div class="staff-shortcuts">
                <button class="primary" type="button" data-section="Point of Sale">Open Point of Sale</button>
                <button class="filter" type="button" data-section="Inventory">View Products</button>
                <button class="filter" type="button" data-section="Grooming &amp; Pet Hotel">View Appointments</button>
            </div>
            <?php endif; ?>
            <div class="stats three dashboard-business">
                <?php foreach ([['♧','Total Products','248'],['⚠','Low Stock Items','14'],['♙','Registered Customers','86']] as $i => [$symbol,$label,$value]): ?>
                <div class="stat"><span class="bubble color-<?= $i ?>"><?= $symbol ?></span><div><small><?= $label ?></small><strong><?= $value ?></strong></div></div>
                <?php endforeach; ?>
            </div>
            <div class="dashboard-grid <?= $isAdmin ? '' : 'staff-dashboard-grid' ?>">
                <?php if ($isAdmin): ?>
                <?php $expiryColumns = ['Product', 'Category', 'Expiry Date', 'Days Left', 'Status']; ?>
                <article class="panel recent expiry-panel">
                    <h2><span class="bubble" aria-hidden="true">◷</span> Near Expired Products</h2>
                    <table>
                        <thead><tr><?php foreach ($expiryColumns as $column): ?><th scope="col"><?= $column ?></th><?php endforeach; ?></tr></thead>
                        <tbody id="near-expiry-rows"></tbody>
                        <tfoot><tr><td colspan="5"><button type="button" class="link" id="view-near-expiry" aria-haspopup="dialog">View All ›</button></td></tr></tfoot>
                    </table>
                </article>
                <dialog id="near-expiry-dialog" aria-labelledby="near-expiry-title">
                    <button type="button" class="close" aria-label="Close">×</button>
                    <h2 id="near-expiry-title">Near Expired Products</h2>
                    <p>Products expiring today or within the next 30 days.</p>
                    <div class="near-expiry-list">
                        <table>
                            <thead><tr><?php foreach ($expiryColumns as $column): ?><th scope="col"><?= $column ?></th><?php endforeach; ?></tr></thead>
                            <tbody id="all-near-expiry-rows"></tbody>
                        </table>
                    </div>
                </dialog>
                <?php endif; ?>
                <article class="panel low">
                    <h2><span class="bubble">⚠</span> Low Stock Products <button class="link" data-section="Inventory">View All ›</button></h2>
                    <?php foreach ([['🧴','Dog Shampoo',3],['🥫','Power Cat Tuna',4],['🟢','Pet Collar',5]] as [$icon,$name,$stock]): ?>
                    <div class="low-row"><span class="product-image"><?= $icon ?></span><span><?= $name ?></span><span><strong><?= $stock ?></strong> <small>left</small></span></div>
                    <?php endforeach; ?>
                </article>
            </div>
            <article class="panel services">
                <h2><span class="bubble">▣</span> Upcoming Services <?php if (!$isAdmin): ?><button class="link" data-section="Grooming &amp; Pet Hotel">View Schedule ›</button><?php endif; ?></h2>
                <div class="schedule">
                    <div><strong>🐶　 Charlie</strong><span>⌂ &nbsp; Grooming</span><span>Today, Nov 23, 2026</span><span>10:30 AM</span></div>
                    <div><strong>🐕　 Phoebe</strong><span>⌂ &nbsp; Pet Hotel Check-in</span><span>Today, Nov 23, 2026</span><span>1:00 PM</span></div>
                </div>
            </article>
        </section>

        <!-- Inventory filters and table. Administrator actions are rendered separately from staff viewing controls. -->
        <section id="inventory" hidden>
            <div class="inventory-heading">
                <div><h1>Inventory</h1><p class="subtitle"><?= $isAdmin ? 'Manage products and stock levels.' : 'Review products and stock levels.' ?></p></div>
                <div class="inventory-actions">
                    <?php if ($isAdmin): ?><button type="button" class="filter" id="download-inventory-pdf" disabled>↓ Download PDF</button><?php endif; ?>
                    <button type="button" class="primary" id="add-item" <?= $isAdmin ? '' : 'hidden' ?>>＋ Add Item</button>
                    <button type="button" class="primary" id="add-product" <?= $isAdmin ? '' : 'hidden' ?>>＋ Add Product</button>
                </div>
            </div>
            <p class="retail-message" id="inventory-message" role="status"></p>
            <?php if ($isAdmin): ?><p class="maintenance-notice" id="inventory-stock-warning" role="status" hidden></p><?php endif; ?>
            <div class="toolbar">
                <label class="search"><span aria-hidden="true">⌕</span><input id="search" type="search" aria-label="Search products" placeholder="Search products..."></label>
                <select id="category" aria-label="Category"><option value="">All Categories</option><?php foreach (array_unique([...array_column($products, 1), 'Others']) as $category): ?><option><?= $category ?></option><?php endforeach; ?></select>
                <button class="filter" id="filter" aria-pressed="false">⚲ Filter</button>
            </div>
            <div class="stats three">
                <?php foreach ([['♧','Total Products',248,0],['⚠','Low Stock',12,2],['⊖','Out of Stock',3,4]] as [$symbol,$label,$value,$color]): ?>
                <div class="stat"><span class="bubble color-<?= $color ?>"><?= $symbol ?></span><div><small><?= $label ?></small><strong><?= $value ?></strong></div></div>
                <?php endforeach; ?>
            </div>
            <div class="inventory-table">
                <table><thead><tr><th>Product</th><th>Category</th><th>Selling Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead><tbody id="product-rows"></tbody></table>
                <footer><span id="product-count"></span><div class="pagination" id="pagination"></div></footer>
            </div>
        </section>
        <?php require __DIR__ . '/views/retail.php'; ?>
        <?php if ($isAdmin) require __DIR__ . '/views/admin-history.php'; ?>
        <?php if (!$isAdmin): ?>
        <!-- Staff pickup workflow. The customer-admin script populates these rows from the shared reservation data. -->
        <section id="reservation-page" hidden aria-labelledby="reservation-title">
            <div class="operation-heading">
                <div><h1 id="reservation-title">Reservation</h1><p class="subtitle">Manage product reservations for in-store pickup.</p></div>
                <button id="refresh-reservations" class="filter" type="button">Refresh</button>
            </div>
            <div class="staff-accounts">
                <p id="reservation-status" class="retail-message" role="status"></p>
                <div id="customer-order-list"></div>
            </div>
        </section>
        <?php endif; ?>
        <!-- Shared operation shell for the schedule, booking queue, sales reports and account directories. -->
        <section id="operations" hidden aria-labelledby="operations-title">
            <div class="operation-heading">
                <div><h1 id="operations-title"></h1><p class="subtitle" id="operations-intro"></p></div>
                <div class="operation-heading-actions">
                    <button class="primary" id="operation-action" type="button"></button>
                    <button class="primary" id="export-sales-pdf" type="button" hidden>Export PDF</button>
                </div>
            </div>
            <?php if ($isAdmin): ?>
            <?php require __DIR__ . '/views/staff-accounts.php'; ?>
            <section id="customer-management" class="staff-accounts" hidden>
                <div class="staff-accounts-heading">
                    <div><h2>Customer Accounts</h2><p>Customer portal registrations.</p></div>
                    <button id="refresh-customer-management" class="filter" type="button">Refresh</button>
                </div>
                <p id="customer-management-status" class="retail-message" role="status"></p>
                <div id="customer-account-list"></div>
            </section>
            <?php endif; ?>
            <div class="operation-stats" id="operation-stats"></div>
            <div class="operation-toolbar">
                <label class="retail-search"><span aria-hidden="true">&#8981;</span><input id="operation-search" type="search"></label>
                <label id="operation-filter-label"><span id="operation-filter-name"></span><select id="operation-filter"></select></label>
                <div id="report-dates" hidden>
                    <?php salesPicker('report-product'); ?>
                    <label>Period<select id="report-period"><option value="all">All time</option><option value="today">Today</option><option value="week">This week</option><option value="month">This month</option><option value="year">This year</option><option value="custom">Custom dates</option></select></label>
                    <label>From<input id="report-from" type="date"></label>
                    <label>To<input id="report-to" type="date"></label>
                </div>
                <button class="plain" id="operation-reset" type="button">Clear filters</button>
            </div>
            <p class="retail-message" id="report-product-note" hidden>Totals include the full value of each sale containing the selected product.</p>
            <p id="operations-message" role="status"></p>
            <!-- Report chart and grouping controls. Operations JavaScript draws the chart using the filtered data. -->
            <section id="report-trend" hidden aria-labelledby="report-trend-title">
                <div class="sales-chart-header">
                    <div><h2 id="report-trend-title">Sales trend</h2><p class="subtitle" id="sales-chart-range"></p></div>
                    <div class="view-buttons sales-chart-controls" aria-label="Group sales by">
                        <button type="button" data-sales-group="day" aria-pressed="true">Daily</button>
                        <button type="button" data-sales-group="week" aria-pressed="false">Weekly</button>
                        <button type="button" data-sales-group="month" aria-pressed="false">Monthly</button>
                        <button type="button" data-sales-group="year" aria-pressed="false">Yearly</button>
                    </div>
                </div>
                <div id="sales-chart" class="sales-chart"></div>
                <p id="sales-chart-point" class="sales-chart-point" aria-live="polite"></p>
            </section>
            <div id="operations-cards" class="operations-cards"></div>
            <div id="operations-table" class="customer-table" hidden>
                <table><thead id="operations-head"></thead><tbody id="operations-rows"></tbody></table>
            </div>
            <footer class="retail-footer"><span id="operation-count"></span><div id="operation-pages" class="retail-pages"></div></footer>
        </section>
        <section id="requests-page" hidden aria-labelledby="requests-title">
            <div class="operation-heading">
                <div><h1 id="requests-title"><?= $isAdmin ? 'Staff Approvals' : 'My Requests' ?></h1>
                    <p class="subtitle"><?= $isAdmin ? 'Review proposed changes before they update shop records.' : 'Track changes you sent to your admin.' ?></p></div>
                <button type="button" class="filter" id="refresh-requests">Refresh</button>
            </div>
            <p id="request-message" class="retail-message" role="status"></p>
            <div id="request-list" class="request-list"></div>
        </section>
        <section id="profile-settings" hidden aria-labelledby="settings-title">
            <div class="settings-heading">
                <div><h1 id="settings-title" tabindex="-1">Settings</h1><p class="subtitle">Manage your display name, theme, and current session.</p></div>
                <button type="button" class="filter" id="settings-back">Back</button>
            </div>
            <div class="settings-sections">
                <section class="settings-card" aria-labelledby="settings-profile-title">
                    <div><h2 id="settings-profile-title">Profile</h2><p>Choose the name shown in the admin header on this browser.</p></div>
                    <form id="profile-form">
                        <label for="profile-display-name">Display name</label>
                        <input type="text" id="profile-display-name" maxlength="48" required>
                        <button class="primary">Save changes</button>
                        <p id="profile-save-status" role="status"></p>
                    </form>
                </section>
                <section class="settings-card" aria-labelledby="settings-appearance-title">
                    <div><h2 id="settings-appearance-title">Appearance</h2><p>Your theme preference is saved in this browser.</p></div>
                    <fieldset class="theme-settings">
                        <legend>Theme</legend>
                        <label><input type="radio" name="appearance" value="light"> Light</label>
                        <label><input type="radio" name="appearance" value="dark"> Dark</label>
                        <label><input type="radio" name="appearance" value="system"> Follow device</label>
                    </fieldset>
                </section>
                <section class="settings-card" aria-labelledby="settings-session-title">
                    <div><h2 id="settings-session-title">Session</h2><p>View your current sign-in or log out.</p></div>
                    <div class="settings-session">
                        <p>Signed in as <strong id="settings-username"><?= htmlspecialchars($account['username'], ENT_QUOTES, 'UTF-8') ?></strong></p>
                        <button type="button" class="filter" id="settings-logout">Logout</button>
                    </div>
                </section>
            </div>
        </section>
    </main>
</div>

<?php if ($isAdmin): ?>
<section id="sale-receipt-printout" aria-label="Sales Receipt">
    <h1>Sales Receipt</h1>
    <pre id="sale-receipt-print-details"></pre>
</section>
<?php require __DIR__ . '/views/staff-account-dialog.php'; ?>
<?php endif; ?>

<!-- Shared detail or edit dialog. Its fields and attendance action are built from the active record type. -->
<dialog id="operation-dialog" aria-labelledby="operation-dialog-title">
    <button type="button" class="close" aria-label="Close">&times;</button>
    <h2 id="operation-dialog-title"></h2>
    <form id="operations-form">
        <div id="operation-fields"></div>
        <p id="operation-error" class="retail-message" role="alert"></p>
        <div class="operation-dialog-actions">
            <button class="primary" id="save-operation">Save</button>
            <button class="plain" id="remove-operation" type="button">Remove</button>
            <button class="primary" id="appointment-attendance" type="button" hidden>Check in</button>
        </div>
    </form>
</dialog>

<dialog id="product-dialog">
    <button type="button" class="close" aria-label="Close">×</button>
    <h2 id="product-title"></h2>
    <form id="product-form">
        <label>Product Name<input name="product" required></label>
        <label>Category<select name="category" required><?php foreach (array_unique([...array_column($products, 1), 'Others']) as $category): ?><option><?= $category ?></option><?php endforeach; ?></select></label>
        <label>Retail Amount<input name="retailAmount" type="number" min="0" step=".01" required></label>
        <label>Selling Amount<input name="price" type="number" min="0" step=".01" aria-describedby="product-price-hint" required></label>
        <small id="product-price-hint">Enter a price for one size. Choosing another weight or volume will adjust the price.</small>
        <label>Stock<input name="stock" type="number" min="0" step="1" required></label>
        <label>Minimum Stock<input name="minimumStock" type="number" min="0" step="1" value="5" required></label>
        <label>Unit Value<select name="unit" required>
            <option value="">Choose a unit or size</option>
            <?php foreach (['Volume' => ['50 mL', '100 mL', '150 mL', '200 mL', '250 mL', '300 mL', '500 mL', '750 mL', '1 L', '2 L', '5 L'],
                'Weight' => ['50 g', '100 g', '250 g', '500 g', '750 g', '1 kg', '2 kg', '2.5 kg', '5 kg', '10 kg', '15 kg', '20 kg'],
                'Count' => ['Piece', 'Pair', 'Pack', 'Box', 'Set']] as $unitGroup => $units): ?>
                <optgroup label="<?= $unitGroup ?>"><?php foreach ($units as $unit): ?><option><?= $unit ?></option><?php endforeach; ?></optgroup>
            <?php endforeach; ?>
        </select></label>
        <label>Expiry Date (optional)<input name="expiryDate" type="date"></label>
        <label id="product-photo-field">Product picture<input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label>
        <img id="product-photo-preview" alt="Product picture preview" hidden>
        <div id="product-barcodes" hidden></div>
        <button type="button" class="link" id="remove-product-photo" hidden>Remove picture</button>
        <p id="product-error" role="alert"></p>
        <button class="primary">Save Product</button>
    </form>
</dialog>
<dialog id="inventory-item-dialog" aria-labelledby="inventory-item-title">
    <button type="button" class="close" aria-label="Close">×</button>
    <h2 id="inventory-item-title">Add Item</h2>
    <form id="inventory-item-form">
        <label>Product Name<select name="productId" required></select></label>
        <label>Selling Price<input name="sellingPrice" readonly></label>
        <label>Barcode<input name="itemBarcode" readonly></label>
        <canvas id="inventory-item-barcode" width="238" height="64" aria-hidden="true" hidden></canvas>
        <p id="inventory-item-error" class="retail-message" role="alert"></p>
        <button type="submit" class="primary" id="save-inventory-item">Save Item</button>
    </form>
</dialog>
<script type="application/json" id="initial-products"><?= json_encode($products, JSON_HEX_TAG | JSON_UNESCAPED_UNICODE) ?></script>
<?php endif; ?>
</body>
</html>
