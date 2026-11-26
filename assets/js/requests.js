/* Dashboard API client and staff approval workflow. It synchronizes revisions, validates proposals and polls for changes. */

const isStaff = admin.dataset.role === 'staff';
let shopRevision = null;
let shopRequests = [];
let saleReceiptIds = new Set();
let transactionDetails = {};
let renderedRequestKey = '';
let displayedSummaryKey;
let statusLoading = false;
let decisionInFlight = false;
// Labels keep request actions readable for staff and administrators while storage uses stable action keys.
const requestLabels = {
    product_add: 'Add product', product_edit: 'Edit product', pet_add: 'Add pet', pet_edit: 'Edit pet',
    pet_remove: 'Remove pet', customer_add: 'Add customer', customer_edit: 'Edit customer',
    customer_import: 'Import customers', sale: 'Complete sale'
};

// Sends a dashboard action with its CSRF token and exposes server conflict or permission messages.
async function shopRequest(action, fields = {}) {
    const body = new FormData();
    body.set('action', action);
    body.set('csrf', admin.dataset.csrf);
    for (const [key, value] of Object.entries(fields)) body.set(key, value);
    const response = await fetch(location.pathname, { method: 'POST', body });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Shop records are temporarily unavailable.');
    return data;
}

// Updates the Staff Booking tab’s badge with the pending appointment count.
function updateBookingCount(count) {
    const badge = retail('#booking-nav-count');
    if (!badge) return;
    badge.hidden = !count;
    badge.textContent = count || '';
    badge.setAttribute('aria-label', count + ' pending appointment requests');
}

// Applies a current shop snapshot and broadcasts the update so views share the same revision.
function acceptShop(data) {
    if (shopRevision !== null && data.revision < shopRevision) return;
    shopRevision = data.revision;
    admin.dataset.pausedModules = JSON.stringify(data.pausedModules ?? []);
    shopRequests = data.requests;
    updateBookingCount(data.pendingBookings);
    saleReceiptIds = new Set(data.saleReceiptIds ?? []);
    transactionDetails = data.transactionDetails ?? {};
    updateRequestSummary(requestSummary(shopRequests));
    if (data.shop) {
        products = data.shop.products;
        records = data.shop.records;
        document.dispatchEvent(new Event('rems:shop-updated'));
    }
}

// Loads shared state and lets the administrator create the initial snapshot when no shop exists yet.
async function initializeShop() {
    try {
        const current = await shopRequest('shop_read');
        acceptShop(current);
        if (!current.shop) {
            if (isStaff) throw new Error('Ask your admin to open the dashboard to initialize the shop records.');
            await saveSharedShop(products, records);
        }
    } catch (error) {
        retail('#shop-load-error').textContent = error.message;
    }
    showSection('Dashboard');
}

// Saves administrator changes using the last known revision so stale clients cannot overwrite newer records.
async function saveSharedShop(nextProducts, nextRecords) {
    if (isStaff) throw new Error('Send this change to the admin for approval.');
    if (shopRevision === null) throw new Error('Refresh the page before changing shop records.');
    acceptShop(await shopRequest('shop_save', {
        revision: shopRevision, shop: JSON.stringify({ products: nextProducts, records: nextRecords })
    }));
}

let sendingShopRequest = false;
// Submits a staff proposal for approval and refreshes its request status.
async function sendShopRequest(type, payload) {
    if (sendingShopRequest) throw new Error('A request is already being sent.');
    sendingShopRequest = true;
    const label = payload.entry?.[0] ?? payload.before?.[0] ?? (type === 'sale' ? payload.customer : '');
    try {
        const response = await shopRequest('shop_submit', { type, payload: JSON.stringify(payload), label: String(label).slice(0, 100) });
        shopRequests = response.requests;
        updateRequestSummary(requestSummary(shopRequests));
    } finally {
        sendingShopRequest = false;
    }
}

// Finds the target record and checks that it still matches the version included with the request.
function requestEntries(entries, before, match) {
    const index = before ? entries.findIndex(match) : -1;
    if (before && (index < 0 || JSON.stringify(entries[index]) !== JSON.stringify(before))) {
        throw new Error('The original record changed. Reject this request and ask staff to submit it again.');
    }
    return index;
}

// Validates string fields before applying a staff proposal.
function requestText(value, required = false) {
    return typeof value === 'string' && value.length <= 500 && (!required || value.trim().length > 0);
}

// Accepts empty or supported inline image values while rejecting unsupported sources.
function requestPhoto(value) {
    return value === '' || (typeof value === 'string' && (
        /^assets\/catalog-[1-6]\.jpg$/.test(value) || /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)));
}

// Validates a pending operations proposal and calculates the inventory and record changes for administrator approval.
function applyApprovedRequest(request) {
    const { type, payload } = request;
    const { entry, before } = payload;
    if (type === 'sale') return applySaleRequest(request);
    let nextProducts = products;
    const nextRecords = { ...records };
    if (type === 'product_add' || type === 'product_edit') {
        const index = requestEntries(products, before, row => row[6] === before[6]);
        const specs = entry?.[8];
        const itemBarcodes = specs?.itemBarcodes ?? [];
        const validSpecs = specs === undefined || (specs && typeof specs === 'object' && !Array.isArray(specs) &&
            (specs.retailAmount === undefined || validMoney(specs.retailAmount)) &&
            (specs.minimumStock === undefined || Number.isSafeInteger(specs.minimumStock) && specs.minimumStock >= 0) &&
            (specs.unit === undefined || unitsForCategory(entry[1]).includes(specs.unit) ||
                (before?.[1] === entry[1] && before?.[8]?.unit === specs.unit)) &&
            (specs.expiryDate === undefined || validExpiryDate(specs.expiryDate)) &&
            (specs.pricingBasis === undefined || (typeof specs.pricingBasis?.unit === 'string' &&
                priceForUnit(specs.pricingBasis, specs.unit) === cents(entry[2]))) &&
            Array.isArray(itemBarcodes) && itemBarcodes.every(validItemBarcode) &&
            new Set(itemBarcodes).size === itemBarcodes.length && !itemBarcodes.includes(entry[7]));
        const barcodes = validSpecs && Array.isArray(entry) ? productBarcodes(entry) : [];
        if ((type === 'product_edit') !== (index >= 0) || !Array.isArray(entry) ||
            !requestText(entry[0], true) || !requestText(entry[1], true) || !validMoney(entry[2]) ||
            !Number.isSafeInteger(entry[3]) || entry[3] < 0 || !requestText(entry[4]) || !requestPhoto(entry[5]) ||
            !requestText(entry[6], true) || !requestText(entry[7]) || !validSpecs ||
            (index >= 0 && entry[6] !== before[6]) ||
            products.some((row, i) => i !== index && (row[6] === entry[6] ||
                productBarcodes(row).some(code => barcodes.includes(code)) ||
                sameProductVariant(row, entry[0], entry[1], specs?.unit ?? '')))) {
            throw new Error('The product details conflict with existing records or contain invalid values.');
        }
        nextProducts = [...products];
        if (index < 0) nextProducts.unshift(entry);
        else nextProducts[index] = entry;
    } else if (type.startsWith('pet_')) {
        const pets = [...records.Pets];
        const index = requestEntries(pets, before, row => row[0] === before[0]);
        if (type === 'pet_remove') {
            if (index < 0 || records[scheduleName].some(([name]) => name === before[0])) {
                throw new Error('This pet is linked to an appointment or has already been removed.');
            }
            pets.splice(index, 1);
        } else {
            if ((type === 'pet_edit') !== (index >= 0) || !Array.isArray(entry) || !requestText(entry[0], true) ||
                !records.Customers.some(([name]) => name === entry[1]) || !requestText(entry[2], true) ||
                !requestText(entry[3]) || !requestText(entry[4]) || !requestPhoto(entry[5]) ||
                pets.some(([name], i) => i !== index && name.toLowerCase() === entry[0].toLowerCase())) {
                throw new Error('The pet name, owner, or picture is invalid or conflicts with existing records.');
            }
            if (index < 0) pets.unshift(entry);
            else {
                pets[index] = entry;
                nextRecords[scheduleName] = records[scheduleName].map(row => row[0] === before[0] ? [entry[0], ...row.slice(1)] : row);
            }
        }
        nextRecords.Pets = pets;
    } else {
        const customers = [...records.Customers];
        const index = requestEntries(customers, before, row => row[0] === before[0]);
        const entries = type === 'customer_import' ? payload.entries : [entry];
        if ((type === 'customer_edit') !== (index >= 0) || !Array.isArray(entries) || !entries.length) {
            throw new Error('The request does not contain valid customer records.');
        }
        for (const row of entries) {
            if (!Array.isArray(row) || !requestText(row[0], true) || !requestText(row[1]) || !requestText(row[2]) ||
                !['Active', 'Inactive'].includes(row[4]) || customerContactError(row[1], row[2], index) ||
                customers.some((existing, i) => i !== index && (existing[0].toLowerCase() === row[0].toLowerCase() ||
                    (row[2] && existing[2]?.toLowerCase() === row[2].toLowerCase())))) {
                throw new Error('The customer details conflict with existing records or contain invalid values.');
            }
            if (index < 0) customers.unshift([row[0], row[1], row[2], '', row[4], 0, '', localDate(), 'CUST-' + newRetailId().slice(0, 8)]);
            else {
                customers[index] = [row[0], row[1], row[2], before[3] ?? '', row[4], ...before.slice(5)];
                nextRecords.Pets = records.Pets.map(pet => pet[1] === before[0] ? [pet[0], row[0], ...pet.slice(2)] : pet);
            }
        }
        nextRecords.Customers = customers;
    }
    return { products: nextProducts, records: nextRecords };
}

// Revalidates sale prices, stock and requested quantities before calculating the approved POS transaction.
function applySaleRequest(request) {
    const { lines, discountType, discount, total, customer } = request.payload;
    if (!Array.isArray(lines) || !lines.length || !validMoney(discount) || !validMoney(total) || !requestText(customer, true)) {
        throw new Error('The cart is invalid.');
    }
    const picked = new Map();
    let subtotal = 0;
    for (const line of lines) {
        if (!Array.isArray(line)) throw new Error('The cart contains an invalid item.');
        const [id, quantity, , unitPrice] = line;
        const item = products.find(product => product[6] === id);
        if (!item || picked.has(id) || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > item[3] || item[2] !== unitPrice) {
            throw new Error('Stock or prices changed. Reject this request and ask staff to prepare a new sale.');
        }
        picked.set(id, quantity);
        subtotal += cents(item[2]) * quantity;
    }
    const name = records.Customers.find(([name]) => name.toLowerCase() === customer.toLowerCase())?.[0];
    if (discountType !== undefined &&
        (!validDiscountType(discountType) || discountForSubtotal(discountType, subtotal) !== cents(discount))) {
        throw new Error('The discount does not match the selected discount type.');
    }
    if ((customer.toLowerCase() !== 'walk-in' && !name) || subtotal - cents(discount) !== cents(total)) {
        throw new Error('The sale total or customer needs updating.');
    }
    const date = localDate();
    const details = products.filter(product => picked.has(product[6])).map(product => picked.get(product[6]) + ' × ' + productLabel(product)).join(', ');
    const sale = ['#TRX-' + request.id.toUpperCase(), name ?? 'Walk-in', date, details, total];
    return {
        products: products.map(product => picked.has(product[6]) ? [product[0], product[1], product[2], product[3] - picked.get(product[6]), ...product.slice(4)] : product),
        records: { ...records, Reports: [sale, ...records.Reports], Customers: records.Customers.map(row => {
            if (row[0] !== name) return row;
            const next = [...row];
            next[5] = (cents(next[5] || 0) + cents(total)) / 100;
            next[6] = date;
            return next;
        }) }
    };
}

// Builds the staff proposal preview shown to the person reviewing a request.
function requestDetails(request, card) {
    const payload = request.payload;
    if (!payload) return;
    const details = retailNode('div', 'request-details');
    const { type } = request;
    if (type === 'sale') {
        if (Array.isArray(payload.lines)) for (const line of payload.lines) {
            if (Array.isArray(line)) details.append(retailNode('p', '', line[1] + ' × ' + line[2] + ' · ' + pesos(line[3])));
        }
        const label = validDiscountType(payload.discountType) ? saleDiscountLabels[payload.discountType] : 'Discount';
        details.append(retailNode('p', '', label + ' ' + pesos(payload.discount) + ' · Total ' + pesos(payload.total)));
    } else if (type === 'customer_import') {
        if (Array.isArray(payload.entries)) for (const entry of payload.entries) {
            if (Array.isArray(entry)) details.append(retailNode('p', '', [entry[0], entry[1], entry[2], entry[4]].filter(Boolean).join(' · ')));
        }
    } else {
        const fields = type.startsWith('product_')
            ? [[0, 'Product'], [1, 'Category'], [2, 'Selling amount'], [3, 'Stock'], [7, 'Barcode']]
            : type.startsWith('pet_') ? [[0, 'Pet'], [1, 'Owner'], [2, 'Species'], [3, 'Breed'], [4, 'Care notes']]
                : [[0, 'Customer'], [1, 'Phone'], [2, 'Email'], [4, 'Status']];
        const record = payload.entry ?? payload.before;
        if (Array.isArray(record)) {
            for (const [index, label] of fields) {
                const before = payload.before?.[index];
                const after = record[index];
                if (after || after === 0 || before) {
                    const value = payload.entry && before !== undefined && before !== after
                        ? (before || '—') + ' → ' + (after || (after === 0 ? '0' : '—')) : after;
                    details.append(retailNode('p', '', label + ' · ' + String(value ?? '—')));
                }
            }
            if (type.startsWith('product_') && record[8]) {
                const specs = record[8];
                for (const [key, label] of [['retailAmount', 'Retail amount'], ['minimumStock', 'Minimum stock'],
                    ['unit', 'Unit value'], ['expiryDate', 'Expiry date']]) {
                    const after = specs[key];
                    const before = payload.before?.[8]?.[key];
                    if (after !== undefined && after !== before) {
                        details.append(retailNode('p', '', label + ' · ' + (after === '' ? '—' : String(after))));
                    }
                }
                const previousCodes = payload.before?.[8]?.itemBarcodes;
                const oldCodes = Array.isArray(previousCodes) ? previousCodes : [];
                const newCodes = Array.isArray(specs.itemBarcodes) ? specs.itemBarcodes.filter(code => !oldCodes.includes(code)) : [];
                if (newCodes.length) details.append(retailNode('p', '', 'New item barcode · ' + newCodes.join(', ')));
            }
            if ((type.startsWith('pet_') || type.startsWith('product_')) && record[5] && requestPhoto(record[5])) {
                const image = retailNode('span', 'pet-photo-preview');
                showRecordPhoto(image, record[5], '');
                details.append(image);
            }
        }
    }
    if (details.children.length) {
        const disclosure = retailNode('details', 'request-disclosure');
        disclosure.open = !isStaff && request.status === 'Pending';
        disclosure.append(retailNode('summary', '', 'Review details'), details);
        card.append(disclosure);
    }
}

// Derives a status key and pending list for dashboard approval counters and refresh detection.
function requestSummary(requests) {
    const pending = requests.filter(request => request.status === 'Pending');
    return {
        key: requests.map(request => request.id + ':' + request.status).join('|'),
        pending: pending.length,
        latest: pending.slice(-3).reverse()
    };
}

// Refreshes the administrator’s approval badge and dashboard preview when request statuses change.
function updateRequestSummary(summary) {
    if (displayedSummaryKey === summary.key) return;
    displayedSummaryKey = summary.key;
    if (isStaff) return;
    const badge = retail('#request-nav-count');
    badge.hidden = !summary.pending;
    badge.textContent = summary.pending;
    badge.setAttribute('aria-label', summary.pending + ' pending');
    retail('#dashboard-approval-count').textContent = summary.pending === 0
        ? 'No staff requests awaiting review.'
        : summary.pending + (summary.pending === 1 ? ' request awaiting review' : ' requests awaiting review');
    const list = retail('#dashboard-approval-list');
    list.hidden = !summary.latest.length;
    list.replaceChildren(...summary.latest.map(request => {
        const title = requestLabels[request.type] + (request.label ? ' · ' + request.label : '');
        const item = retailNode('li');
        item.append(retailNode('strong', '', title), retailNode('span', '', request.staff));
        return item;
    }));
}

// Displays request cards in review order and wires up administrator decisions.
function renderRequests() {
    renderedRequestKey = requestSummary(shopRequests).key;
    const list = retail('#request-list');
    list.replaceChildren();
    if (!shopRequests.length) list.append(retailNode('p', 'operation-empty', 'No requests yet.'));
    const ordered = [...shopRequests].reverse().sort((a, b) => Number(b.status === 'Pending') - Number(a.status === 'Pending'));
    for (const request of ordered) {
        const card = retailNode('article', 'request-card');
        const header = retailNode('div', 'request-card-heading');
        const title = requestLabels[request.type] ?? 'Shop request';
        header.append(retailNode('h2', '', request.label ? title + ' · ' + request.label : title),
            retailNode('span', 'operation-badge ' + ({ Approved: 'active', Rejected: 'inactive' }[request.status] ?? ''), request.status));
        card.append(header, retailNode('p', 'request-meta', request.staff + ' · ' + dateFormat.format(new Date(request.created))));
        if (request.note) card.append(retailNode('p', 'request-note', request.note));
        requestDetails(request, card);
        if (!isStaff && request.status === 'Pending') {
            const actions = retailNode('div', 'request-actions');
            const note = retailNode('input');
            note.maxLength = 120;
            note.placeholder = 'Decision note (optional)';
            note.setAttribute('aria-label', 'Decision note');
            const approve = retailButton('Approve', () => decide('Approved'), 'primary');
            const reject = retailButton('Reject', () => decide('Rejected'), 'filter');
            const decide = async decision => {
                if (decisionInFlight) return;
                decisionInFlight = true;
                approve.disabled = reject.disabled = true;
                const message = retail('#request-message');
                message.textContent = '';
                try {
                    const fields = { id: request.id, decision, note: note.value, revision: shopRevision };
                    if (decision === 'Approved') fields.shop = JSON.stringify(applyApprovedRequest(request));
                    acceptShop(await shopRequest('shop_decide', fields));
                    renderRequests();
                    message.textContent = 'Request ' + decision.toLowerCase() + '.';
                } catch (error) {
                    message.textContent = error.message;
                    approve.disabled = reject.disabled = false;
                } finally {
                    decisionInFlight = false;
                }
            };
            actions.append(note, approve, reject);
            card.append(actions);
        }
        list.append(card);
    }
}

// Checks whether an action is underway or a note is being edited before background updates replace the cards.
function reviewingRequest() {
    return decisionInFlight || [...retail('#request-list').querySelectorAll('input')].some(input =>
        input === document.activeElement || input.value.length > 0);
}

// Reloads the request list while protecting decisions and unsaved notes from background redraws.
async function refreshRequests(automatic = false) {
    const button = retail('#refresh-requests');
    if (button.disabled || decisionInFlight || (automatic && reviewingRequest())) return;
    const message = retail('#request-message');
    button.disabled = true;
    message.textContent = '';
    try {
        const update = await shopRequest('shop_read');
        if (decisionInFlight || (automatic && reviewingRequest())) return;
        acceptShop(update);
        renderRequests();
    } catch (error) {
        if (!automatic) message.textContent = error.message;
    } finally {
        button.disabled = false;
    }
}

// Polls revisions and request counts, refreshing the current view only when shared data has changed.
async function checkRequestStatus() {
    if (document.hidden || statusLoading || decisionInFlight) return;
    statusLoading = true;
    try {
        const summary = await shopRequest('shop_status');
        if (decisionInFlight) return;
        updateRequestSummary(summary);
        updateBookingCount(summary.pendingBookings);
        if (admin.dataset.page === 'Requests' && summary.key !== renderedRequestKey) {
            await refreshRequests(true);
        } else if (admin.dataset.page !== 'Requests' && shopRevision !== null &&
            summary.revision > shopRevision && !document.querySelector('dialog[open]')) {
            const update = await shopRequest('shop_read');
            if (document.querySelector('dialog[open]') || decisionInFlight) return;
            const previousModules = admin.dataset.pausedModules;
            acceptShop(update);
            if (previousModules !== admin.dataset.pausedModules) {
                showSection(admin.dataset.page);
                return;
            }
            refreshDashboard();
            const page = admin.dataset.page;
            if (page === 'Inventory') renderProducts();
            else if (page === 'Customers') renderCustomers();
            else if (page === 'Point of Sale') { renderCategories(); refreshSale(); }
            else if (['Pets', 'Booking', scheduleName, 'Reports', staffName].includes(page)) renderOperation();
        }
    } catch {
        if (!isStaff && displayedSummaryKey === undefined) {
            retail('#dashboard-approval-count').textContent = 'Could not check requests. Open Approvals to retry.';
        }
    } finally {
        statusLoading = false;
    }
}

// Poll the lightweight status endpoint to refresh approvals, stock and bookings as other users save changes.
window.setInterval(checkRequestStatus, 5000);
document.addEventListener('visibilitychange', checkRequestStatus);
retail('#refresh-requests').addEventListener('click', () => refreshRequests());
document.addEventListener('rems:section', event => {
    if (event.detail === 'Requests') {
        renderRequests();
        refreshRequests();
    }
});
if (isStaff) {
    retail('#add-customer').textContent = 'Request New Customer';
    retail('#import-customers').textContent = 'Request CSV Import';
}
