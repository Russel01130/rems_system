<?php
if (empty($isCustomer)) {
    http_response_code(404);
    exit;
}
?>
<div class="customer-portal" id="customer-portal" data-csrf="<?= $authToken ?>" data-paused-modules="<?= $pausedModules ?>">
    <header class="portal-header">
        <?= logo() ?>
        <nav aria-label="Customer navigation">
            <button type="button" data-portal-page="shop" aria-current="page">Shop</button>
            <button type="button" data-portal-page="booking">Book a Visit</button>
            <button type="button" data-portal-page="history">My Activity</button>
        </nav>
        <form method="post">
            <input type="hidden" name="action" value="logout">
            <input type="hidden" name="csrf" value="<?= $authToken ?>">
            <button class="filter" type="submit">Logout</button>
        </form>
    </header>
    <main class="portal-content">
        <p class="portal-status" id="portal-status" role="status"></p>
        <p class="maintenance-notice" id="portal-booking-maintenance" role="status" hidden>Appointments are under maintenance. Please try again later.</p>
        <section id="portal-shop" aria-labelledby="portal-shop-title">
            <div class="portal-heading">
                <div><h1 id="portal-shop-title">Shop Pet Supplies</h1><p>Reserve products online and pay when you pick them up.</p></div>
                <button type="button" class="filter" id="portal-refresh">Refresh availability</button>
            </div>
            <div class="portal-shop-grid">
                <div>
                    <label class="retail-search portal-search"><span aria-hidden="true">&#8981;</span><input type="search" id="portal-search" placeholder="Search products" aria-label="Search products"></label>
                    <div id="portal-products" class="catalog-products"></div>
                </div>
                <aside class="portal-card portal-cart">
                    <h2>Your Cart <span id="portal-cart-count"></span></h2>
                    <div id="portal-cart-lines"></div>
                    <p class="portal-total"><span>Total</span><strong id="portal-cart-total"></strong></p>
                    <p class="maintenance-notice" id="portal-pickup-maintenance" hidden>Pickup reservations are under maintenance.</p>
                    <button type="button" class="primary" id="portal-order" disabled>Reserve for Pickup</button>
                </aside>
            </div>
        </section>
        <section id="portal-booking" aria-labelledby="portal-booking-title" hidden>
            <div class="portal-heading"><div><h1 id="portal-booking-title">Book a Visit</h1><p>Choose a grooming appointment or pet hotel check-in. Up to five appointments are available per day.</p></div></div>
            <div class="portal-booking-grid">
                <article class="portal-card portal-calendar">
                    <div class="portal-calendar-header">
                        <button class="filter" type="button" id="month-back" aria-label="Previous month">‹</button>
                        <h2 id="calendar-month"></h2>
                        <button class="filter" type="button" id="month-next" aria-label="Next month">›</button>
                    </div>
                    <div class="portal-calendar-days" id="calendar-days"></div>
                    <p class="portal-help">Unavailable dates and times are disabled. All times are Manila time.</p>
                </article>
                <article class="portal-card">
                    <h2>Your Appointment</h2>
                    <form class="portal-booking-form" id="portal-booking-form">
                        <label>Service<select name="service"><option>Grooming</option><option>Pet Hotel Check-in</option></select></label>
                        <label>Pet name<input name="pet" list="portal-pets" maxlength="100" required><datalist id="portal-pets"></datalist></label>
                        <label>Species<select name="species"><option>Dog</option><option>Cat</option><option>Bird</option><option>Rabbit</option><option>Other</option></select></label>
                        <p id="booking-selected-date">Choose a date to see available times.</p>
                        <div id="booking-slots" class="booking-slots" aria-label="Appointment times"></div>
                        <button class="primary" id="portal-book" disabled>Confirm Appointment</button>
                    </form>
                </article>
            </div>
        </section>
        <section id="portal-history" aria-labelledby="portal-history-title" hidden>
            <div class="portal-heading"><div><h1 id="portal-history-title">My Activity</h1><p>Check your pickup orders and booked visits.</p></div><button type="button" class="filter" id="refresh-activity">Refresh</button></div>
            <div class="portal-booking-grid">
                <article class="portal-card"><h2>Pickup Orders</h2><div id="portal-orders"></div></article>
                <article class="portal-card"><h2>Appointments</h2><div id="portal-appointments"></div></article>
            </div>
        </section>
    </main>
    <dialog class="portal-receipt" id="portal-receipt" aria-labelledby="portal-receipt-title">
        <h2 id="portal-receipt-title">Pickup Order Receipt</h2>
        <pre id="portal-receipt-details"></pre>
        <form method="dialog" class="portal-receipt-actions">
            <button class="filter" autofocus>Close</button>
            <button type="button" class="primary" id="portal-receipt-download">Download PDF</button>
            <button type="button" class="primary" id="portal-receipt-print">Print Receipt</button>
        </form>
    </dialog>
    <section class="portal-receipt-printout" aria-labelledby="portal-print-title">
        <h1 id="portal-print-title">Pickup Order Receipt</h1>
        <pre id="portal-print-details"></pre>
    </section>
</div>
