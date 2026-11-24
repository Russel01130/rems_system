<?php
if (empty($signedIn)) {
    http_response_code(404);
    exit;
}
?>
<section id="pos" hidden aria-labelledby="pos-title">
    <h1 id="pos-title">Point of Sale</h1>
    <p class="subtitle">Add products to cart and complete the sale. 🐾</p>
    <div class="pos-layout">
        <div class="catalog">
            <div class="retail-toolbar">
                <label class="retail-search">⌕ <input id="pos-search" type="search" aria-label="Search products" placeholder="Search product by name or scan barcode…"></label>
                <select id="pos-category" aria-label="Product category"></select>
                <div class="view-buttons"><button data-layout="grid" aria-label="Grid view" aria-pressed="true">▦</button><button data-layout="list" aria-label="List view" aria-pressed="false">☷</button></div>
            </div>
            <div id="pos-categories" class="category-tabs" aria-label="Product categories"></div>
            <div id="catalog-products" class="catalog-products"></div>
            <footer class="retail-footer"><span id="pos-count"></span><div class="retail-pages" id="pos-pages"></div></footer>
        </div>
        <aside class="sale-card">
            <header><strong id="sale-title">🛒 Current Sale (0)</strong><button class="link" id="clear-cart">Clear Cart</button></header>
            <div id="cart-lines"></div>
            <div class="sale-totals">
                <div><span>Subtotal</span><strong id="sale-subtotal"></strong></div>
                <div><label>Discount <input id="sale-discount" type="number" min="0" step=".01" value="0"></label><span id="discount-total"></span></div>
                <div class="grand-total"><strong>Total</strong><strong id="sale-total"></strong></div>
                <button class="primary checkout" id="checkout">▤ &nbsp; Checkout / Payment</button>
                <div class="sale-actions"><button id="hold-sale">Ⅱ &nbsp; Hold Sale</button><button id="park-sale">▣ &nbsp; Park Sale</button></div>
                <div id="saved-sales"></div>
                <p id="sale-message" role="status"></p>
            </div>
            <div class="customer-pick">
                <label for="sale-customer">Customer (Optional)</label>
                <div><input id="sale-customer" list="sale-customers" placeholder="Search customer…"><datalist id="sale-customers"></datalist><button id="sale-add-customer" aria-label="Add customer">♙＋</button></div>
            </div>
        </aside>
    </div>
</section>
<section id="customers-page" hidden aria-labelledby="customers-title">
    <div class="customer-heading">
        <div><h1 id="customers-title">Customers</h1><p class="subtitle">Manage your customer records and information. 🐾</p></div>
        <div><button id="import-customers">↥ &nbsp; Import Customers</button><button class="primary" id="add-customer">＋ Add Customer</button></div>
    </div>
    <div class="retail-toolbar customer-toolbar">
        <label class="retail-search">⌕ <input id="customer-search" type="search" aria-label="Search customers" placeholder="Search customers by name, email or phone…"></label>

        <select id="customer-status" aria-label="Customer status"><option value="">All Status</option><option>Active</option><option>Inactive</option></select>
        <button id="customer-filter" type="button">⚲ &nbsp; Filter</button>
    </div>
    <p class="retail-message" id="customer-message" role="status"></p>
    <div class="customer-stats" id="customer-stats"></div>
    <div class="customer-table">
        <table><thead><tr><th>Customer</th><th>Contact</th><th>Total Purchases</th><th>Last Purchase</th><th>Status</th><th>Actions</th></tr></thead><tbody id="customer-rows"></tbody></table>
        <footer class="retail-footer"><span id="customer-count"></span><div class="retail-pages" id="customer-pages"></div></footer>
    </div>
</section>
<dialog id="customer-dialog">
    <button type="button" class="close" aria-label="Close">×</button>
    <h2 id="customer-dialog-title">Add Customer</h2>
    <form id="customer-form">
        <label>Name<input name="fullName" required></label>
        <label>Phone<input name="phone" type="tel"></label>
        <label>Email<input name="email" type="email"></label>

        <label>Status<select name="status"><option>Active</option><option>Inactive</option></select></label>
        <p class="retail-message" id="customer-error" role="alert"></p>
        <button class="primary">Save Customer</button>
    </form>
</dialog>
<dialog id="customer-import">
    <button type="button" class="close" aria-label="Close">×</button>
    <h2>Import Customers</h2>
    <form id="import-form">
        <p>Choose a CSV file with name, phone, email, and status columns. Only name is required.</p>
        <label>CSV file<input name="file" type="file" accept=".csv,text/csv" required></label>
        <p class="retail-message" id="import-error" role="alert"></p>
        <button class="primary">Import</button>
    </form>
</dialog>
<dialog id="payment-dialog">
    <button type="button" class="close" aria-label="Close">×</button>
    <h2>Checkout / Payment</h2>
    <form id="payment-form">
        <p id="payment-total"></p>
        <label>Cash received<input type="number" name="cash" step=".01" required></label>
        <p id="payment-change"></p>
        <p class="retail-message" id="payment-error" role="alert"></p>
        <button class="primary">Complete Sale</button>
    </form>
</dialog>
