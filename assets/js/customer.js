/* Customer portal controller. It handles catalog variants, pickup checkout, pet registration, appointment requests and the notification inbox. */

const portal = document.querySelector('#customer-portal');
const getPortal = selector => portal.querySelector(selector);
const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
const portalDate = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' });
const monthFormat = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayFormat = new Intl.DateTimeFormat('en-PH', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' });
const priceCents = amount => Math.round(Number(amount) * 100);
const formatMoney = amount => currency.format(amount);
const portalDateObject = value => new Date(value + 'T00:00:00Z');
const bookingForm = getPortal('#portal-booking-form');
const petForm = getPortal('#portal-pet-form');
const notificationInbox = getPortal('#portal-notifications');
const markNotificationsRead = getPortal('#portal-notification-read');
const receiptDialog = getPortal('#portal-receipt');
// Cart keys are exact inventory variant IDs so two sizes of the same product can be reserved separately.
const cart = new Map();
const shopVariantSelections = new Map();
let data = { products: [], days: [], orders: [], bookings: [], pets: [], ready: false,
    pausedModules: JSON.parse(portal.dataset.pausedModules) };
let date = '';
let time = '';
let month = '';
let checkoutId = '';
let loading = false;
let saving = false;
let activePage = 'shop';
let displayedBookingPet;
let markingNotifications = false;
let renderedNotificationList;

// Creates a portal element and sets its optional class and text without interpreting customer input as markup.
function element(tag, className = '', text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

// Creates a non-submit portal button and registers its click handler.
function portalButton(text, action, className = 'filter') {
    const button = element('button', className, text);
    button.type = 'button';
    button.addEventListener('click', action);
    return button;
}

// Shows feedback in the portal status area and marks errors visually.
function notice(text, isError = false) {
    const line = getPortal('#portal-status');
    line.classList.toggle('portal-error', isError);
    line.textContent = text;
}

// Sends the portal action and CSRF token to index.php and turns a failed JSON response into a readable error.
async function request(action, fields = {}) {
    const body = new FormData();
    body.set('action', action);
    body.set('csrf', portal.dataset.csrf);
    for (const [key, value] of Object.entries(fields)) body.set(key, JSON.stringify(value));
    const response = await fetch(location.pathname, { method: 'POST', body });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Please try again.');
    return result;
}

// Switches the active customer tab, updates its accessibility state and rerenders the portal.
function showPortalPage(page) {
    activePage = page;
    for (const button of portal.querySelectorAll('[data-portal-page]')) {
        if (button.dataset.portalPage === page) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
    }
    renderPortal();
}

// Shows an approved file or inline photo source and falls back to the catalog icon if the image fails.
function productImage(product) {
    const frame = element('div', 'retail-product-picture', product.icon);
    if (/^(?:assets\/catalog-[1-6]\.jpg|data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*)$/.test(product.photo)) {
        const image = element('img');
        image.alt = '';
        image.src = product.photo;
        image.addEventListener('error', () => { frame.textContent = product.icon; });
        frame.replaceChildren(image);
    }
    return frame;
}

// Updates the quantity for a specific variant ID, respects its available stock and clears the old checkout token.
function adjustCart(id, delta) {
    const quantity = (cart.get(id) ?? 0) + delta;
    const product = data.products.find(item => item.id === id);
    if (delta > 0 && (!product || quantity > product.stock)) return;
    checkoutId = '';
    if (quantity <= 0) cart.delete(id);
    else cart.set(id, quantity);
    renderShop();
}

// Renders searchable variant groups and recalculates the pickup cart totals and checkout availability.
function renderShop() {
    const query = getPortal('#portal-search').value.toLowerCase().trim();
    const list = getPortal('#portal-products');
    const variants = data.products.map(item => ({ ...item, name: item.productName ?? item.name, label: item.name }));
    const matches = groupCatalogVariants(variants,
        variant => (variant.label + ' ' + variant.category).toLowerCase().includes(query), shopVariantSelections);
    list.replaceChildren();
    if (!matches.length) list.append(element('p', 'operation-empty', data.ready ? 'No matching products.' : 'The catalog is getting ready.'));
    for (const group of matches) {
        list.append(catalogVariantCard(group, {
            selections: shopVariantSelections,
            formatPrice: formatMoney,
            picture: productImage,
            stockText: stock => stock ? stock + ' in stock' : 'Out of stock',
            canAdd: variant => !saving && variant.stock > (cart.get(variant.id) ?? 0),
            addVariant: id => adjustCart(id, 1)
        }));
    }
    const lines = getPortal('#portal-cart-lines');
    lines.replaceChildren();
    let total = 0;
    let invalid = false;
    for (const [id, quantity] of cart) {
        const product = data.products.find(item => item.id === id);
        const row = element('div', 'portal-cart-line');
        if (!product || quantity > product.stock) invalid = true;
        total += priceCents(product?.price ?? 0) * quantity;
        const name = element('strong', '', product?.name ?? 'Unavailable product');
        const controls = element('div', 'quantity-buttons');
        const less = portalButton('−', () => adjustCart(id, -1), '');
        const more = portalButton('+', () => adjustCart(id, 1), '');
        less.setAttribute('aria-label', 'Remove one ' + name.textContent);
        more.setAttribute('aria-label', 'Add one ' + name.textContent);
        less.disabled = saving;
        more.disabled = saving || quantity >= (product?.stock ?? 0);
        controls.append(less, element('span', '', quantity), more);
        row.append(name, controls);
        if (!product || quantity > product.stock) row.append(element('p', 'stock-warning', 'Reduce this quantity to continue.'));
        lines.append(row);
    }
    if (!cart.size) lines.append(element('p', 'portal-help', 'Your cart is empty.'));
    getPortal('#portal-cart-count').textContent = cart.size ? '(' + [...cart.values()].reduce((a, b) => a + b, 0) + ')' : '';
    getPortal('#portal-cart-total').textContent = formatMoney(total / 100);
    const pickupPaused = data.pausedModules.includes('pickup');
    getPortal('#portal-pickup-maintenance').hidden = !pickupPaused;
    getPortal('#portal-order').disabled = pickupPaused || saving || !cart.size || invalid || !data.ready;
}

// Moves the booking calendar by whole months using UTC arithmetic to keep date-only values stable.
function monthOffset(offset) {
    const start = portalDateObject(month + '-01');
    start.setUTCMonth(start.getUTCMonth() + offset);
    return start.toISOString().slice(0, 7);
}

// Draws available appointment dates and prevents selecting days without bookable slots.
function renderCalendar() {
    const calendar = getPortal('#calendar-days');
    calendar.replaceChildren();
    if (!month || !data.days.length) {
        getPortal('#month-back').disabled = getPortal('#month-next').disabled = true;
        return;
    }
    const days = new Map(data.days.map(row => [row.date, row]));
    const first = portalDateObject(month + '-01');
    getPortal('#calendar-month').textContent = monthFormat.format(first);
    getPortal('#month-back').disabled = month <= data.days[0].date.slice(0, 7);
    getPortal('#month-next').disabled = month >= data.days.at(-1).date.slice(0, 7);
    for (const weekday of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) calendar.append(element('span', 'calendar-weekday', weekday));
    for (let i = 0; i < first.getUTCDay(); i++) calendar.append(element('span'));
    for (let cursor = first; cursor.toISOString().slice(0, 7) === month; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
        const value = cursor.toISOString().slice(0, 10);
        const available = data.ready && (days.get(value)?.slots.some(slot => slot.available) ?? false);
        const dateButton = portalButton(cursor.getUTCDate(), () => {
            date = value;
            time = '';
            renderCalendar();
            renderSlots();
            getPortal('#booking-slots button:not(:disabled)')?.focus();
        }, 'calendar-day');
        dateButton.disabled = !available;
        dateButton.setAttribute('aria-label', dayFormat.format(cursor) + (available ? '' : ', unavailable'));
        dateButton.setAttribute('aria-pressed', value === date ? 'true' : 'false');
        calendar.append(dateButton);
    }
}

// Displays the chosen day’s appointment times and keeps the current slot selection visible.
function renderSlots() {
    const selected = data.days.find(day => day.date === date);
    const area = getPortal('#booking-slots');
    area.replaceChildren();
    getPortal('#booking-selected-date').textContent = selected ? dayFormat.format(portalDateObject(date)) + ' · ' +
        selected.remaining + ' booking(s) left' : 'Choose a date to see available times.';
    for (const slot of selected?.slots ?? []) {
        const button = portalButton(slot.time, () => {
            time = slot.time;
            for (const option of area.children) option.setAttribute('aria-pressed', option === button ? 'true' : 'false');
            updateBookingSubmit();
        });
        button.disabled = !slot.available || saving;
        button.setAttribute('aria-pressed', time === slot.time ? 'true' : 'false');
        area.append(button);
    }
    updateBookingSubmit();
}

// Enables the appointment request only when a saved pet and an available time are selected.
function updateBookingSubmit() {
    const selected = data.days.find(day => day.date === date);
    getPortal('#portal-book').disabled = saving || !data.ready || !bookingForm.elements.pet.value ||
        !selected?.slots.some(slot => slot.time === time && slot.available);
}

// Displays the pickup receipt details and prepares the same text for download and printing.
function viewOrderReceipt(order) {
    const items = order.items.map(item => {
        const unitPrice = priceCents(item.price);
        return item.quantity + ' × ' + item.name + ' @ ' + formatMoney(unitPrice / 100)
            + ' = ' + formatMoney(item.quantity * unitPrice / 100);
    });
    const details = [
        'Rem’s Pet Supplies & Accessories Shop',
        'Order ' + order.id,
        portalDate.format(new Date(order.created)) + ' · ' + order.status,
        '',
        ...items,
        '',
        'Order total ' + formatMoney(order.total),
        ...(order.status === 'Awaiting pickup' ? ['Pay when you pick up your order.'] : []),
    ].join('\n');
    getPortal('#portal-receipt-details').textContent = details;
    getPortal('#portal-print-details').textContent = details;
    getPortal('#portal-receipt-download').dataset.orderId = order.id;
    receiptDialog.showModal();
}

getPortal('#portal-receipt-download').addEventListener('click', event => {
    downloadReceiptPdf(getPortal('#portal-receipt-title').textContent,
        getPortal('#portal-receipt-details').textContent, event.currentTarget.dataset.orderId + '-receipt.pdf');
});

getPortal('#portal-receipt-print').addEventListener('click', () => window.print());

// Lists the signed-in customer’s pickup orders and appointment statuses.
function renderHistory() {
    const orders = getPortal('#portal-orders');
    const appointments = getPortal('#portal-appointments');
    orders.replaceChildren();
    appointments.replaceChildren();
    for (const order of [...data.orders].reverse()) {
        const card = element('div', 'portal-history-row');
        card.append(element('strong', '', order.id + ' · ' + order.status), element('p', '', portalDate.format(new Date(order.created)) + ' · ' + formatMoney(order.total)),
            element('p', '', order.items.map(item => item.quantity + ' × ' + item.name).join(', ')));
        const receiptButton = portalButton('View Receipt', () => viewOrderReceipt(order), 'filter portal-receipt-button');
        receiptButton.setAttribute('aria-label', 'View receipt for ' + order.id);
        card.append(receiptButton);
        orders.append(card);
    }
    for (const booking of [...data.bookings].reverse()) {
        const [pet, service, when, slot, status, , id] = booking;
        const card = element('div', 'portal-history-row');
        card.append(element('strong', '', service + ' · ' + pet),
            element('p', '', dayFormat.format(portalDateObject(when)) + ' · ' + slot + ' · ' + status),
            element('p', '', id));
        appointments.append(card);
    }
    if (!orders.children.length) orders.append(element('p', 'portal-help', 'No orders yet.'));
    if (!appointments.children.length) appointments.append(element('p', 'portal-help', 'No appointments yet.'));
}

// Presents the saved pet photo, species, breed and markings in either Pet Management or the appointment form.
function registeredPetCard(pet) {
    const card = element('article', 'portal-registered-pet');
    if (/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(pet.photo)) {
        const picture = element('img');
        picture.src = pet.photo;
        picture.alt = 'Photo of ' + pet.name;
        card.append(picture);
    }
    const details = element('div');
    details.append(element('strong', '', pet.name));
    for (const [label, value] of [['Species', pet.species], ['Breed', pet.breed], ['Marking', pet.marking]]) {
        if (value) details.append(element('p', '', label + ': ' + value));
    }
    card.append(details);
    return card;
}

// Displays saved pets for the signed-in customer and an empty state when none exist.
function renderRegisteredPets() {
    const list = getPortal('#portal-registered-pets');
    list.replaceChildren(...data.pets.map(registeredPetCard));
    if (!data.pets.length) list.append(element('p', 'portal-help', 'No pets registered yet.'));
}

// Shows the selected pet’s saved details and avoids reannouncing an unchanged card during polling.
function renderBookingPetDetails() {
    const pet = data.pets.find(item => item.name === bookingForm.elements.pet.value);
    const details = getPortal('#booking-pet-details');
    details.hidden = !pet;
    if (pet === displayedBookingPet || (pet && displayedBookingPet &&
        ['name', 'species', 'breed', 'marking', 'photo'].every(key => pet[key] === displayedBookingPet[key]))) return;
    displayedBookingPet = pet;
    details.replaceChildren(...(pet ? [registeredPetCard(pet)] : []));
}

// Fills the appointment dropdown from the customer’s saved pets and keeps a valid selection after refresh.
function renderBookingPets() {
    const select = bookingForm.elements.pet;
    const names = data.pets.map(pet => pet.name);
    const selected = select.value;
    if (select.options.length !== names.length + 1 || names.some((name, index) => select.options[index + 1].value !== name)) {
        select.replaceChildren(new Option('Choose your pet', ''), ...names.map(name => new Option(name, name)));
        select.value = names.includes(selected) ? selected : '';
    }
    select.disabled = !names.length;
    getPortal('#booking-pet-help').hidden = Boolean(names.length);
    renderBookingPetDetails();
}

// Stores the latest server response and clears an appointment date or time if it is no longer available.
function acceptPortal(portalData) {
    data = portalData;
    const firstMonth = data.days[0]?.date.slice(0, 7) ?? '';
    const lastMonth = data.days.at(-1)?.date.slice(0, 7) ?? '';
    if (!month || month < firstMonth || month > lastMonth) month = firstMonth;
    const day = data.days.find(day => day.date === date);
    if (!day?.slots.some(slot => slot.available)) date = '';
    if (!date || !day.slots.some(slot => slot.time === time && slot.available)) time = '';
}

// Updates the unread badge and inbox rows, skipping unchanged message lists during polling.
function renderNotifications() {
    const notices = data.bookingNotices ?? [];
    const unread = notices.filter(item => !item.read).length;
    const badge = getPortal('#portal-notification-count');
    badge.hidden = !unread;
    badge.textContent = unread > 99 ? '99+' : String(unread);
    notificationInbox.querySelector('summary').setAttribute('aria-label', unread
        ? 'Appointment notifications, ' + unread + ' unread' : 'Appointment notifications');
    markNotificationsRead.disabled = !unread || markingNotifications;
    const fingerprint = JSON.stringify(notices);
    if (fingerprint === renderedNotificationList) return;
    renderedNotificationList = fingerprint;
    const list = getPortal('#portal-booking-notice-list');
    list.replaceChildren(...notices.map(item => {
        const row = element('li', item.read ? '' : 'notification-unread');
        row.append(element('p', '', item.message));
        if (item.sentAt) {
            const timestamp = element('time', '', notificationTime.format(new Date(item.sentAt)));
            timestamp.dateTime = item.sentAt;
            row.append(timestamp);
        }
        return row;
    }));
    if (!notices.length) list.append(element('li', 'portal-help', 'No notifications yet.'));
}

// Renders the active customer tab and shows maintenance feedback for paused booking or pickup features.
function renderPortal() {
    renderNotifications();
    const bookingPaused = data.pausedModules.includes('booking');
    getPortal('#portal-shop').hidden = activePage !== 'shop';
    getPortal('#portal-pet-management').hidden = activePage !== 'pets';
    getPortal('#portal-history').hidden = activePage !== 'history';
    getPortal('#portal-booking').hidden = activePage !== 'booking' || bookingPaused;
    getPortal('#portal-booking-maintenance').hidden = activePage !== 'booking' || !bookingPaused;
    if (activePage === 'shop') renderShop();
    if (activePage === 'booking' && !bookingPaused) {
        renderBookingPets();
        renderCalendar();
        renderSlots();
    }
    if (activePage === 'history') renderHistory();
    if (activePage === 'pets') renderRegisteredPets();
}

// Fetches current portal data without overlapping an active refresh or save. Pet photos are requested on relevant tabs.
async function refreshPortal() {
    if (loading || saving || markingNotifications) return;
    loading = true;
    try {
        acceptPortal((await request('customer_read', { includePetPhotos: activePage === 'pets' || activePage === 'booking' })).portal);
        renderPortal();
    } catch (error) {
        notice(error.message, true);
    } finally { loading = false; }
}

const notificationTime = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });
// Send the currently unread IDs. The server verifies that each ID belongs to this customer.
markNotificationsRead.addEventListener('click', async () => {
    if (markingNotifications) return;
    const ids = new Set((data.bookingNotices ?? []).filter(item => !item.read).map(item => item.id));
    if (!ids.size) return;
    markingNotifications = true;
    const status = getPortal('#portal-notification-status');
    status.textContent = '';
    renderNotifications();
    try {
        await request('customer_read_notifications', { notifications: [...ids] });
        for (const item of data.bookingNotices ?? []) {
            if (ids.has(item.id)) item.read = true;
        }
        status.textContent = 'Marked as read.';
    } catch (error) {
        status.textContent = error.message;
    } finally {
        markingNotifications = false;
        renderNotifications();
    }
});
document.addEventListener('click', event => {
    if (notificationInbox.open && !notificationInbox.contains(event.target)) notificationInbox.open = false;
});
notificationInbox.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !notificationInbox.open) return;
    event.preventDefault();
    notificationInbox.open = false;
    notificationInbox.querySelector('summary').focus();
});

for (const button of portal.querySelectorAll('[data-portal-page]')) {
    button.addEventListener('click', () => {
        notice('');
        showPortalPage(button.dataset.portalPage);
        refreshPortal();
    });
}
for (const id of ['#portal-refresh', '#refresh-activity']) getPortal(id).addEventListener('click', refreshPortal);
getPortal('#portal-search').addEventListener('input', renderShop);
getPortal('#month-back').addEventListener('click', () => { month = monthOffset(-1); renderCalendar(); });
getPortal('#month-next').addEventListener('click', () => { month = monthOffset(1); renderCalendar(); });
bookingForm.elements.pet.addEventListener('change', () => {
    renderBookingPetDetails();
    updateBookingSubmit();
});

// Creates an idempotency token so retrying the same pickup reservation does not reserve stock again.
function freshCheckoutId() {
    return globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

// Sends a portal write, runs its success handler and refreshes the customer’s data after the server responds.
async function savePortal(action, fields, onSuccess, successPage = 'history') {
    if (saving) return;
    saving = true;
    notice('');
    renderPortal();
    try {
        const result = await request(action, fields);
        acceptPortal(result.portal);
        onSuccess();
        showPortalPage(successPage);
        notice(result.notice);
    } catch (error) {
        notice(error.message, true);
    } finally {
        saving = false;
        renderPortal();
        refreshPortal();
    }
}

getPortal('#portal-order').addEventListener('click', () => {
    const lines = [...cart].map(([id, quantity]) => [id, quantity, priceCents(data.products.find(item => item.id === id)?.price)]);
    checkoutId ||= freshCheckoutId();
    savePortal('customer_order', { cart: { checkout: checkoutId, lines } }, () => {
        cart.clear();
        checkoutId = '';
    });
});

// Submit the selected pet and slot. The server verifies ownership and availability again.
bookingForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!date || !time || !bookingForm.elements.pet.value) return;
    const values = new FormData(bookingForm);
    savePortal('customer_book', { booking: {
        date, time, service: values.get('service'), pet: values.get('pet')
    } }, () => { date = time = ''; bookingForm.reset(); });
});

// Resize the pet image before submitting it alongside the required profile fields.
petForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = petForm.querySelector('button[type="submit"]');
    if (button.disabled || saving) return;
    const values = new FormData(petForm);
    const [name, breed, marking] = ['name', 'breed', 'marking'].map(field => values.get(field).trim());
    if (!name || !breed || !marking) {
        notice('Enter a pet name, breed, and marking.', true);
        return;
    }
    button.disabled = true;
    notice('');
    try {
        const photo = await prepareRecordPhoto(values.get('photo'));
        await savePortal('customer_register_pet', {
            pet: { name, species: values.get('species'), breed, marking, photo }
        }, () => petForm.reset(), 'pets');
    } catch (error) {
        notice(error.message || 'Choose a readable picture of your pet.', true);
    } finally {
        button.disabled = false;
    }
});

renderPortal();
refreshPortal();
// Refresh customer data only when this tab is visible so notifications and availability stay current.
setInterval(() => {
    if (!document.hidden) refreshPortal();
}, 10000);
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshPortal();
});
