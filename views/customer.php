<?php
// Customer portal template for shopping, appointment booking, pet registration, order history and the notification inbox.
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
            <button type="button" data-portal-page="pets">Pet Management</button>
            <button type="button" data-portal-page="history">My Activity</button>
        </nav>
        <div class="portal-header-actions">
            <!-- The inbox uses a native disclosure so the bell is usable with a keyboard. -->
            <details id="portal-notifications" class="portal-notifications">
                <summary class="filter" aria-label="Appointment notifications">
                    <span aria-hidden="true">&#128276;</span>
                    <span class="portal-notification-count" id="portal-notification-count" hidden></span>
                </summary>
                <section class="portal-card portal-notification-panel" aria-labelledby="portal-booking-notices-title">
                    <header>
                        <h2 id="portal-booking-notices-title">Notifications</h2>
                        <button type="button" class="link" id="portal-notification-read" disabled>Mark all as read</button>
                    </header>
                    <ul id="portal-booking-notice-list"></ul>
                    <p id="portal-notification-status" class="portal-help" role="status"></p>
                </section>
            </details>
            <form method="post">
                <input type="hidden" name="action" value="logout">
                <input type="hidden" name="csrf" value="<?= $authToken ?>">
                <button class="filter" type="submit">Logout</button>
            </form>
        </div>
    </header>
    <main class="portal-content">
        <p class="portal-status" id="portal-status" role="status"></p>
        <p class="maintenance-notice" id="portal-booking-maintenance" role="status" hidden>Appointments are under maintenance. Please try again later.</p>
        <!-- The catalog and pickup cart are rendered from customer_read data. -->
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
        <!-- Customers choose an available time and a pet from their own saved profiles. -->
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
                        <label class="retail-select-picker retail-select-service"><span>Service</span><select name="service" aria-label="Service"><option>Grooming</option><option>Pet Hotel Check-in</option></select></label>
                        <label class="retail-select-picker retail-select-pet"><span>Pet name</span><select name="pet" aria-label="Pet name" required><option value="">Choose your pet</option></select></label>
                        <p class="portal-help" id="booking-pet-help" hidden>Register a pet in Pet Management before booking an appointment.</p>
                        <div id="booking-pet-details" aria-live="polite" hidden></div>
                        <p id="booking-selected-date">Choose a date to see available times.</p>
                        <div id="booking-slots" class="booking-slots" aria-label="Appointment times"></div>
                        <button class="primary" id="portal-book" disabled>Request Appointment</button>
                    </form>
                </article>
            </div>
        </section>
        <!-- Registration collects mandatory pet details and supplies them to the owner’s profile and booking choices. -->
        <section id="portal-pet-management" aria-labelledby="portal-pet-title" hidden>
            <div class="portal-heading"><h1 id="portal-pet-title">Pet Management</h1></div>
            <div class="portal-booking-grid">
                <article class="portal-card">
                    <h2>Register a Pet</h2>
                    <form class="portal-booking-form" id="portal-pet-form">
                        <label>Pet name<input name="name" maxlength="100" required></label>
                        <label class="retail-select-picker retail-select-species"><span>Species</span><select name="species" aria-label="Species" required>
                            <option value="">Choose a species</option>
                            <?php foreach (CUSTOMER_PET_SPECIES as $species): ?><option><?= $species ?></option><?php endforeach; ?>
                        </select></label>
                        <label>Breed<input name="breed" maxlength="100" required></label>
                        <label>Marking<input name="marking" maxlength="100" placeholder="e.g. White patch on chest or None" required></label>
                        <label>Picture of pet<input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required></label>
                        <button type="submit" class="primary">Register</button>
                    </form>
                </article>
                <article class="portal-card"><h2>My Pets</h2><div id="portal-registered-pets"></div></article>
            </div>
        </section>
        <!-- Activity shows order receipts and appointment decisions returned for this account. -->
        <section id="portal-history" aria-labelledby="portal-history-title" hidden>
            <div class="portal-heading"><div><h1 id="portal-history-title">My Activity</h1><p>Check your pickup orders and booked visits.</p></div><button type="button" class="filter" id="refresh-activity">Refresh</button></div>
            <div class="portal-booking-grid">
                <article class="portal-card"><h2>Pickup Orders</h2><div id="portal-orders"></div></article>
                <article class="portal-card"><h2>Appointments</h2><div id="portal-appointments"></div></article>
            </div>
        </section>
    </main>
    <!-- The same receipt text is used for on-screen viewing, PDF output and browser printing. -->
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
