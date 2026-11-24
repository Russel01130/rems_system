<?php
require_once __DIR__ . '/admin-auth.php';
startAdminSession();
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    handleAdminRequest();
}
try {
    $account = currentAccount();
} catch (RuntimeException | JsonException $error) {
    error_log('REMS account: ' . $error->getMessage());
    http_response_code(503);
    exit('Your account is temporarily unavailable.');
}
$signedIn = $account !== null;
$isCustomer = $signedIn && $account['role'] === 'customer';
$isAdmin = $signedIn && $account['role'] === 'admin';
$dashboardTitle = $isAdmin ? 'Admin Dashboard' : 'Staff Dashboard';
$needsSetup = false;
$authUnavailable = false;
if (!$signedIn) {
    try {
        $needsSetup = !adminIsConfigured();
    } catch (RuntimeException | JsonException $error) {
        error_log('REMS authentication: ' . $error->getMessage());
        $authUnavailable = true;
    }
}
$authToken = htmlspecialchars($_SESSION['csrf'], ENT_QUOTES, 'UTF-8');
$products = [
    ['Dog Shampoo 250ml', 'Grooming', 180, 3, '🧴'],
    ['Aozi Adult 1kg', 'Pet Food', 123, 24, '🍖'],
    ['Pet Collar', 'Accessories', 120, 5, '🟢'],
    ['Dog Chew Toy', 'Toys', 95, 0, '🦴'],
    ['Cat litter 5kg', 'Hygiene', 325, 18, '🛍️'],
];
$navigation = ['▦ Dashboard', '◎ Inventory', '🛒 Point of Sale', '♙ Customers', '♧ Pets', '⌂ Grooming & Pet Hotel', '▥ Reports', '♙ User Management'];
function logo() {
    return '<div class="logo" aria-label="Rem’s Pet Supplies and Accessories Shop"><span class="logo-house">⌂</span><div><strong>Rem’s</strong><small><b>&amp;</b> Pet Supplies<br>Accessories Shop</small><em>Quality goodies for your furbabies!</em></div></div>';
}
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rem’s Pet Supplies &amp; Accessories Shop</title>
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="retail.css">
<?php if ($isCustomer): ?>
<link rel="stylesheet" href="customer.css">
<script src="customer.js" defer></script>
<?php elseif ($signedIn): ?>
<script src="app.js" defer></script>
<script src="operations.js" defer></script>
<script src="retail.js" defer></script>
<script src="requests.js" defer></script>
<?php if ($isAdmin): ?><script src="staff.js" defer></script><script src="customer-admin.js" defer></script><?php endif; ?>
<?php else: ?>
<script src="sign-in.js" defer></script>
<?php endif; ?>
</head>
<body>
<?php if (!$signedIn): ?>
<div id="welcome">
<header class="welcome-header">
    <?= logo() ?>
    <button class="primary welcome-action" data-auth="login">Login</button>
</header>
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
</div>

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
        <button type="button" class="link" id="customer-auth-toggle">Create account</button>
        <?php if ($needsSetup): ?><button type="button" class="link" id="admin-setup-link" data-auth="setup">Set up admin</button><?php endif; ?>
    </div>
    <div id="auth-recovery" hidden>
        <p>Password recovery requires help from the owner of this Laragon installation. Contact them if you cannot sign in.</p>
        <button type="button" class="primary" id="auth-recovery-back">Back to Sign In</button>
    </div>
</dialog>

<?php elseif ($isCustomer): ?>
<?php require __DIR__ . '/customer.php'; ?>
<?php else: ?>
<div id="admin" data-csrf="<?= $authToken ?>" data-role="<?= $account['role'] ?>" data-username="<?= htmlspecialchars($account['username'], ENT_QUOTES, 'UTF-8') ?>">
    <aside class="sidebar">
        <div class="admin-brand"><span aria-hidden="true">⌂<i>🐾</i></span><div><strong>Rem’s</strong><small>Pet Supplies &amp;<br>Accessories Shop</small></div></div>
        <nav aria-label="<?= $isAdmin ? 'Admin' : 'Staff' ?> navigation">
        <?php foreach ($navigation as $i => $item): [$symbol, $name] = explode(' ', $item, 2);
            if (!$isAdmin && in_array($name, ['Reports', 'User Management'], true)) continue; ?>
            <button data-section="<?= htmlspecialchars($name) ?>"><span aria-hidden="true"><?= $symbol ?></span><?= htmlspecialchars($name) ?></button>
        <?php endforeach; ?>
            <button type="button" data-section="Requests"><span aria-hidden="true">⇄</span><?= $isAdmin ? 'Approvals' : 'My Requests' ?><span id="request-nav-count" class="request-nav-count" hidden></span></button>
        </nav>
        <form class="logout-form" method="post">
            <input type="hidden" name="csrf" value="<?= $authToken ?>">
            <input type="hidden" name="action" value="logout">
            <button class="logout" id="logout"><span aria-hidden="true">⇥</span> Logout</button>
        </form>
    </aside>
    <main class="workspace">
        <p id="shop-load-error" class="retail-message" role="alert"></p>
        <header class="admin-header">
            <span class="admin-header-title"><?= $dashboardTitle ?></span>
            <details class="profile-menu" id="profile-menu">
                <summary aria-label="System Administrator profile menu">
                    <span class="profile-name"><?= $isAdmin ? 'System Administrator' : htmlspecialchars($account['username'], ENT_QUOTES, 'UTF-8') ?></span>
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
                <div class="sales-periods">
                    <?php foreach (['today' => 'Daily Sales', 'week' => 'Weekly Sales', 'month' => 'Monthly Sales'] as $period => $label): ?>
                        <button type="button" class="sales-period" data-section="Reports" data-sales-period="<?= $period ?>">
                            <span><?= $label ?></span><strong></strong><small></small>
                        </button>
                    <?php endforeach; ?>
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
                <article class="panel recent">
                    <h2><span class="bubble">▣</span> Recent Sales</h2>
                    <table><thead><tr><th>Transaction ID</th><th>Customer</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>
                    <?php foreach ([['1024','Keith Heart','Today','1,250.00'],['1023','Maria Angel','Today','850.00'],['1022','Elisha Mei','Yesterday','430.00']] as [$id,$customer,$date,$amount]): ?>
                    <tr><td>#TRX-<?= $id ?></td><td><?= $customer ?></td><td><?= $date ?></td><td>₱<?= $amount ?></td><td><span class="complete">✓ Completed</span></td></tr>
                    <?php endforeach; ?>
                    </tbody><?php if ($isAdmin): ?><tfoot><tr><td colspan="5"><button class="link" data-section="Reports">View All Sales ›</button></td></tr></tfoot><?php endif; ?></table>
                </article>
                <?php endif; ?>
                <article class="panel low">
                    <h2><span class="bubble">⚠</span> Low Stock Products <button class="link" data-section="Inventory">View All ›</button></h2>
                    <?php foreach ([['🧴','Dog Shampoo',3],['🥫','Power Cat Tuna',4],['🟢','Pet Collar',5]] as [$icon,$name,$stock]): ?>
                    <div class="low-row"><span class="product-image"><?= $icon ?></span><span><?= $name ?></span><span><strong><?= $stock ?></strong> <small>left</small></span></div>
                    <?php endforeach; ?>
                </article>
            </div>
            <article class="panel services">
                <h2><span class="bubble">▣</span> Upcoming Services <button class="link" data-section="Grooming &amp; Pet Hotel">View Schedule ›</button></h2>
                <div class="schedule">
                    <div><strong>🐶　 Charlie</strong><span>⌂ &nbsp; Grooming</span><span>Today, Nov 23, 2026</span><span>10:30 AM</span></div>
                    <div><strong>🐕　 Phoebe</strong><span>⌂ &nbsp; Pet Hotel Check-in</span><span>Today, Nov 23, 2026</span><span>1:00 PM</span></div>
                </div>
            </article>
        </section>

        <section id="inventory" hidden>
            <div class="inventory-heading"><div><h1>Inventory</h1><p class="subtitle">Manage your products and stock levels.</p></div><button class="primary" id="add-product">＋ Add Product</button></div>
            <div class="toolbar">
                <label class="search"><span aria-hidden="true">⌕</span><input id="search" type="search" aria-label="Search products" placeholder="Search products..."></label>
                <select id="category" aria-label="Category"><option value="">All Categories</option><?php foreach (array_unique(array_column($products, 1)) as $category): ?><option><?= $category ?></option><?php endforeach; ?></select>
                <button class="filter" id="filter" aria-pressed="false">⚲ Filter</button>
            </div>
            <div class="stats three">
                <?php foreach ([['♧','Total Products',248,0],['⚠','Low Stock',12,2],['⊖','Out of Stock',3,4]] as [$symbol,$label,$value,$color]): ?>
                <div class="stat"><span class="bubble color-<?= $color ?>"><?= $symbol ?></span><div><small><?= $label ?></small><strong><?= $value ?></strong></div></div>
                <?php endforeach; ?>
            </div>
            <div class="inventory-table">
                <table><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead><tbody id="product-rows"></tbody></table>
                <footer><span id="product-count"></span><div class="pagination" id="pagination"></div></footer>
            </div>
        </section>
        <?php require __DIR__ . '/retail.php'; ?>
        <section id="operations" hidden aria-labelledby="operations-title">
            <div class="operation-heading">
                <div><h1 id="operations-title"></h1><p class="subtitle" id="operations-intro"></p></div>
                <button class="primary" id="operation-action" type="button"></button>
            </div>
            <?php if ($isAdmin): ?>
            <section id="staff-accounts" class="staff-accounts" hidden aria-labelledby="staff-accounts-title">
                <div class="staff-accounts-heading">
                    <div><h2 id="staff-accounts-title">Staff Login Accounts</h2><p>Create or disable credentials for the Staff Dashboard.</p></div>
                    <button id="open-staff-account" type="button" class="primary">＋ Create Staff Account</button>
                </div>
                <p id="staff-account-message" role="status"></p>
                <div id="staff-account-list"></div>
            </section>
            <section id="customer-management" class="staff-accounts" hidden>
                <div class="staff-accounts-heading">
                    <div><h2>Customer Accounts</h2><p>Customer portal registrations and pickup orders.</p></div>
                    <button id="refresh-customer-management" class="filter" type="button">Refresh</button>
                </div>
                <p id="customer-management-status" class="retail-message" role="status"></p>
                <div id="customer-account-list"></div>
                <h2 class="customer-orders-heading">Pickup Orders</h2>
                <div id="customer-order-list"></div>
            </section>
            <?php endif; ?>
            <div class="operation-stats" id="operation-stats"></div>
            <div class="operation-toolbar">
                <label class="retail-search"><span aria-hidden="true">&#8981;</span><input id="operation-search" type="search"></label>
                <label id="operation-filter-label"><span id="operation-filter-name"></span><select id="operation-filter"></select></label>
                <div id="report-dates" hidden>
                    <label>Period<select id="report-period"><option value="all">All time</option><option value="today">Today</option><option value="week">This week</option><option value="month">This month</option><option value="custom">Custom dates</option></select></label>
                    <label>From<input id="report-from" type="date"></label>
                    <label>To<input id="report-to" type="date"></label>
                </div>
                <button class="plain" id="operation-reset" type="button">Clear filters</button>
            </div>
            <p id="operations-message" role="status"></p>
            <section id="report-trend" hidden aria-labelledby="report-trend-title">
                <div class="sales-chart-header">
                    <div><h2 id="report-trend-title">Sales trend</h2><p class="subtitle" id="sales-chart-range"></p></div>
                    <div class="view-buttons sales-chart-controls" aria-label="Group sales by">
                        <button type="button" data-sales-group="day" aria-pressed="true">Daily</button>
                        <button type="button" data-sales-group="week" aria-pressed="false">Weekly</button>
                        <button type="button" data-sales-group="month" aria-pressed="false">Monthly</button>
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
<dialog id="staff-account-dialog" aria-labelledby="staff-account-title">
    <button type="button" class="close" aria-label="Close">&times;</button>
    <h2 id="staff-account-title">Create Staff Account</h2>
    <form id="staff-account-form" method="post">
        <input type="hidden" name="csrf" value="<?= $authToken ?>">
        <input type="hidden" name="action" value="create_staff">
        <label>Username<input name="username" autocomplete="off" minlength="3" maxlength="32" pattern="[A-Za-z0-9._\-]+" required></label>
        <label>Password<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="72" required></label>
        <label>Confirm password<input name="confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="72" required></label>
        <p id="staff-account-error" role="alert"></p>
        <button type="submit" class="primary">Create Staff Account</button>
    </form>
</dialog>
<?php endif; ?>

<dialog id="operation-dialog" aria-labelledby="operation-dialog-title">
    <button type="button" class="close" aria-label="Close">&times;</button>
    <h2 id="operation-dialog-title"></h2>
    <form id="operations-form">
        <div id="operation-fields"></div>
        <p id="operation-error" class="retail-message" role="alert"></p>
        <div class="operation-dialog-actions">
            <button class="primary" id="save-operation">Save</button>
            <button class="plain" id="remove-operation" type="button">Remove</button>
        </div>
    </form>
</dialog>

<dialog id="product-dialog">
    <button type="button" class="close" aria-label="Close">×</button>
    <h2 id="product-title"></h2>
    <form id="product-form">
        <label>Product<input name="product" required></label>
        <label>Category<select name="category" required><?php foreach (array_unique(array_column($products, 1)) as $category): ?><option><?= $category ?></option><?php endforeach; ?></select></label>
        <label>Price<input name="price" type="number" min="0" step=".01" required></label>
        <label>Stock<input name="stock" type="number" min="0" step="1" required></label>
        <label>Barcode (optional)<input name="barcode" inputmode="numeric"></label>
        <label id="product-photo-field">Product picture<input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label>
        <img id="product-photo-preview" alt="Product picture preview" hidden>
        <button type="button" class="link" id="remove-product-photo" hidden>Remove picture</button>
        <p id="product-error" role="alert"></p>
        <button class="primary">Save Product</button>
    </form>
</dialog>
<script type="application/json" id="initial-products"><?= json_encode($products, JSON_HEX_TAG | JSON_UNESCAPED_UNICODE) ?></script>
<?php endif; ?>
</body>
</html>
