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
const cart = new Map();
let data = { products: [], days: [], orders: [], bookings: [], pets: [], ready: false };
let date = '';
let time = '';
let month = '';
let checkoutId = '';
let loading = false;
let saving = false;
let activePage = 'shop';

function element(tag, className = '', text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function portalButton(text, action, className = 'filter') {
    const button = element('button', className, text);
    button.type = 'button';
    button.addEventListener('click', action);
    return button;
}

function notice(text, isError = false) {
    const line = getPortal('#portal-status');
    line.classList.toggle('portal-error', isError);
    line.textContent = text;
}

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

function showPortalPage(page) {
    activePage = page;
    for (const section of ['shop', 'booking', 'history']) getPortal('#portal-' + section).hidden = section !== page;
    for (const button of portal.querySelectorAll('[data-portal-page]')) {
        if (button.dataset.portalPage === page) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
    }
    renderPortal();
}

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

function adjustCart(id, delta) {
    const quantity = (cart.get(id) ?? 0) + delta;
    const product = data.products.find(item => item.id === id);
    if (delta > 0 && (!product || quantity > product.stock)) return;
    checkoutId = '';
    if (quantity <= 0) cart.delete(id);
    else cart.set(id, quantity);
    renderShop();
}

function renderShop() {
    const query = getPortal('#portal-search').value.toLowerCase().trim();
    const list = getPortal('#portal-products');
    const matches = data.products.filter(item => (item.name + ' ' + item.category).toLowerCase().includes(query));
    list.replaceChildren();
    if (!matches.length) list.append(element('p', 'operation-empty', data.ready ? 'No matching products.' : 'The catalog is getting ready.'));
    for (const product of matches) {
        const card = element('article', 'catalog-item');
        const info = element('div', 'catalog-info');
        const add = portalButton('+', () => adjustCart(product.id, 1), 'add-to-cart');
        add.setAttribute('aria-label', 'Add ' + product.name + ' to cart');
        add.disabled = saving || product.stock <= (cart.get(product.id) ?? 0);
        info.append(element('h2', '', product.name), element('strong', '', formatMoney(product.price)),
            element('span', product.stock ? 'stock-ready' : 'stock-warning', product.stock ? product.stock + ' in stock' : 'Out of stock'), add);
        card.append(productImage(product), info);
        list.append(card);
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
    getPortal('#portal-order').disabled = saving || !cart.size || invalid || !data.ready;
}

function monthOffset(offset) {
    const start = portalDateObject(month + '-01');
    start.setUTCMonth(start.getUTCMonth() + offset);
    return start.toISOString().slice(0, 7);
}

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
            getPortal('#portal-book').disabled = saving || !data.ready;
        });
        button.disabled = !slot.available || saving;
        button.setAttribute('aria-pressed', time === slot.time ? 'true' : 'false');
        area.append(button);
    }
    getPortal('#portal-book').disabled = saving || !data.ready || !selected?.slots.some(slot => slot.time === time && slot.available);
}

function renderHistory() {
    const orders = getPortal('#portal-orders');
    const appointments = getPortal('#portal-appointments');
    orders.replaceChildren();
    appointments.replaceChildren();
    for (const order of [...data.orders].reverse()) {
        const card = element('div', 'portal-history-row');
        card.append(element('strong', '', order.id + ' · ' + order.status), element('p', '', portalDate.format(new Date(order.created)) + ' · ' + formatMoney(order.total)),
            element('p', '', order.items.map(item => item.quantity + ' × ' + item.name).join(', ')));
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

function acceptPortal(portalData) {
    data = portalData;
    const firstMonth = data.days[0]?.date.slice(0, 7) ?? '';
    const lastMonth = data.days.at(-1)?.date.slice(0, 7) ?? '';
    if (!month || month < firstMonth || month > lastMonth) month = firstMonth;
    const day = data.days.find(day => day.date === date);
    if (!day?.slots.some(slot => slot.available)) date = '';
    if (!date || !day.slots.some(slot => slot.time === time && slot.available)) time = '';
}

function renderPortal() {
    if (activePage === 'shop') renderShop();
    if (activePage === 'booking') {
        getPortal('#portal-pets').replaceChildren(...data.pets.map(pet => new Option(pet.name, pet.name)));
        renderCalendar();
        renderSlots();
    }
    if (activePage === 'history') renderHistory();
}

async function refreshPortal() {
    if (loading || saving) return;
    loading = true;
    try {
        acceptPortal((await request('customer_read')).portal);
        renderPortal();
    } catch (error) {
        notice(error.message, true);
    } finally { loading = false; }
}

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
bookingForm.elements.pet.addEventListener('input', () => {
    const pet = data.pets.find(item => item.name.toLowerCase() === bookingForm.elements.pet.value.trim().toLowerCase());
    if (pet && [...bookingForm.elements.species.options].some(option => option.value === pet.species)) bookingForm.elements.species.value = pet.species;
});

function freshCheckoutId() {
    return globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

async function savePortal(action, fields, onSuccess) {
    if (saving) return;
    saving = true;
    notice('');
    renderPortal();
    try {
        const result = await request(action, fields);
        acceptPortal(result.portal);
        onSuccess();
        showPortalPage('history');
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

bookingForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!date || !time) return;
    const values = new FormData(bookingForm);
    savePortal('customer_book', { booking: {
        date, time, service: values.get('service'), pet: values.get('pet'), species: values.get('species')
    } }, () => { date = time = ''; bookingForm.reset(); });
});

renderPortal();
refreshPortal();
setInterval(() => {
    if (!document.hidden && activePage === 'booking') refreshPortal();
}, 10000);
