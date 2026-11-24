const retail = selector => document.querySelector(selector);
function retailNode(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}
function retailButton(text, action, className) {
    const button = retailNode('button', className, text);
    button.type = 'button';
    button.addEventListener('click', action);
    return button;
}
function newRetailId() {
    return globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

const catalogSeed = [
    ['Royal Canin Dog Food 1kg', 'Pet Food', 550, 24, '🦴'],
    ['Whiskas Cat Food 1kg', 'Pet Food', 420, 18, '🐟'],
    ['Oatmeal Pet Shampoo 250ml', 'Grooming', 280, 8, '🧴'],
    ['Adjustable Dog Collar', 'Accessories', 150, 10, '🔴'],
    ['Dog Chew Toy Bone', 'Toys', 95, 15, '🦴'],
    ['Cat Litter Box Large', 'Hygiene', 750, 6, '🐱']
].map((entry, index) => [...entry, 'assets/catalog-' + (index + 1) + '.jpg', 'catalog-' + index, '20000000000' + (index + 1)]);
const customerSeed = [
    ['Maria Santos', '0917 123 4567', 'maria.santos@example.com', 'Regular', 'Active', 12450, '2025-05-04'],
    ['John Dela Cruz', '0928 765 4321', 'john.delacruz@example.com', 'VIP', 'Active', 24870, '2025-05-06'],
    ['Alexis Tan', '0906 345 6789', 'alexis.tan@example.com', 'Regular', 'Active', 5230, '2025-04-28'],
    ['Michelle Reyes', '0915 222 3344', 'michelle.reyes@example.com', 'VIP', 'Active', 18900, '2025-05-02'],
    ['Paul Garcia', '0933 555 6677', 'paul.garcia@example.com', 'Regular', 'Inactive', 3120, '2025-04-15']
].map((entry, index) => [...entry, '', 'CUST-000' + (index + 1)]);
if (!records.RetailVersion) {
    products = [...catalogSeed.filter(seed => !products.some(product => product[0] === seed[0])), ...products];
    records.Customers = [...customerSeed.filter(seed => !records.Customers.some(record => record[0] === seed[0])), ...records.Customers];
    records.RetailVersion = 1;
}
products = products.map((product, index) => {
    const entry = [...product];
    entry[6] ||= 'existing-' + index;
    return entry;
});
const discountInput = retail('#sale-discount');
const customerInput = retail('#sale-customer');
const saleMessage = retail('#sale-message');
const posSearch = retail('#pos-search');
const categorySelect = retail('#pos-category');
const payment = retail('#payment-dialog');
const paymentForm = retail('#payment-form');
const saleStorageKey = 'rems-pos-drafts:' + admin.dataset.username.toLowerCase();
let localSales = {};
try {
    localSales = JSON.parse(localStorage.getItem(saleStorageKey)) ?? {};
} catch {
    // Cart storage is optional.
}
let savedSales = localSales.saved ?? (admin.dataset.role === 'admin' ? records.SavedSales : null) ?? [];
const initialDraft = localSales.draft ?? (admin.dataset.role === 'admin' ? records.RetailDraft : null);
let cart = new Map(initialDraft?.lines ?? []);
discountInput.value = initialDraft?.discount ?? 0;
customerInput.value = initialDraft?.customer ?? '';

function storeLocalSales(draft, saved = savedSales) {
    localStorage.setItem(saleStorageKey, JSON.stringify({ draft, saved }));
    savedSales = saved;
}

let catalogPage = 1;
let catalogLayout = 'grid';

function retailPages(target, page, total, go) {
    const container = retail(target);
    container.replaceChildren();
    const previous = retailButton('‹', () => go(page - 1));
    previous.setAttribute('aria-label', 'Previous page');
    previous.disabled = page === 1;
    container.append(previous);
    for (let number = 1; number <= total; number++) {
        if (total > 7 && number > 2 && number < total - 1 && Math.abs(number - page) > 1) {
            if (container.lastElementChild?.textContent !== '…') container.append(retailNode('span', '', '…'));
            continue;
        }
        const button = retailButton(number, () => go(number));
        if (number === page) button.setAttribute('aria-current', 'page');
        container.append(button);
    }
    const next = retailButton('›', () => go(page + 1));
    next.setAttribute('aria-label', 'Next page');
    next.disabled = page === total;
    container.append(next);
}

function productPicture(product) {
    const picture = retailNode('span', 'retail-product-picture', product[4]);
    picture.setAttribute('aria-hidden', 'true');
    showRecordPhoto(picture, product[5], product[4]);
    return picture;
}

function renderCatalog() {
    const category = categorySelect.value;
    const query = posSearch.value.trim().toLowerCase();
    const matching = products.filter(product => (!category || product[1] === category) &&
        (product[0].toLowerCase().includes(query) || product[7]?.includes(query)));
    const maxPage = Math.max(1, Math.ceil(matching.length / 6));
    catalogPage = Math.min(catalogPage, maxPage);
    const start = (catalogPage - 1) * 6;
    const grid = retail('#catalog-products');
    grid.dataset.layout = catalogLayout;
    grid.replaceChildren();
    for (const product of matching.slice(start, start + 6)) {
        const [name, , price, stock, , , id] = product;
        const card = retailNode('article', 'catalog-item');
        const info = retailNode('div', 'catalog-info');
        const add = retailButton('+', () => changeQuantity(id, 1), 'add-to-cart');
        add.setAttribute('aria-label', 'Add ' + name + ' to cart');
        add.disabled = stock <= (cart.get(id) ?? 0);
        info.append(retailNode('h2', '', name), retailNode('strong', '', pesos(price)),
            retailNode('span', stock <= 6 ? 'stock-warning' : 'stock-ready', 'Stock: ' + stock), add);
        card.append(productPicture(product), info);
        grid.append(card);
    }
    if (!matching.length) grid.append(retailNode('p', 'retail-empty', 'No products match your search.'));
    retail('#pos-count').textContent = matching.length ? 'Showing ' + (start + 1) + '–' + Math.min(start + 6, matching.length) + ' of ' + matching.length + ' products' : 'Showing 0 products';
    retailPages('#pos-pages', catalogPage, maxPage, next => {
        catalogPage = next;
        renderCatalog();
    });
    for (const button of retail('#pos-categories').children) button.setAttribute('aria-pressed', button.dataset.category === category);
}

function renderCategories() {
    const previous = categorySelect.value;
    const categories = ['', 'Pet Food', 'Accessories', 'Grooming', 'Toys', 'Hygiene', 'Others',
        ...new Set(products.map(product => product[1]).filter(group => !['Pet Food', 'Accessories', 'Grooming', 'Toys', 'Hygiene', 'Others'].includes(group)))];
    categorySelect.replaceChildren(...categories.map(group => new Option(group || 'All Categories', group)));
    categorySelect.value = categories.includes(previous) ? previous : '';
    const buttons = categories.map(group => {
        const button = retailButton(group || 'All', () => {
            categorySelect.value = group;
            resetCatalog();
        });
        button.dataset.category = group;
        return button;
    });
    retail('#pos-categories').replaceChildren(...buttons);
}

function resetCatalog() {
    catalogPage = 1;
    renderCatalog();
}
posSearch.addEventListener('input', resetCatalog);
categorySelect.addEventListener('change', resetCatalog);
posSearch.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    const product = products.find(item => item[7] && item[7] === posSearch.value.trim());
    if (!product) return;
    posSearch.value = '';
    resetCatalog();
    changeQuantity(product[6], 1);
});
document.querySelectorAll('[data-layout]').forEach(button => {
    if (button.tagName !== 'BUTTON') return;
    button.addEventListener('click', () => {
        catalogLayout = button.dataset.layout;
        for (const control of button.parentElement.children) control.setAttribute('aria-pressed', control === button);
        renderCatalog();
    });
});

const cents = amount => Math.round(Number(amount) * 100);
function currentSale() {
    const lines = [...cart].map(([id, quantity]) => ({ product: products.find(entry => entry[6] === id), quantity }));
    const subtotal = lines.reduce((total, line) => total + cents(line.product?.[2] ?? 0) * line.quantity, 0);
    const requestedDiscount = cents(discountInput.value);
    const discount = Math.max(0, Math.min(subtotal, Number.isFinite(requestedDiscount) ? requestedDiscount : 0));
    return { lines, subtotal, discount, total: subtotal - discount };
}

function draftSale(lines = [...cart]) {
    return { lines, discount: discountInput.value, customer: customerInput.value.trim() };
}

function persistDraft(nextCart) {
    try {
        storeLocalSales(draftSale([...nextCart]));
        cart = nextCart;
        return true;
    } catch {
        saleMessage.textContent = 'The cart could not be saved. Check browser storage.';
        return false;
    }
}

function changeQuantity(id, change) {
    const quantity = (cart.get(id) ?? 0) + change;
    if (quantity > (products.find(entry => entry[6] === id)?.[3] ?? 0)) {
        saleMessage.textContent = 'There is insufficient stock for that quantity.';
        return;
    }
    const next = new Map(cart);
    if (quantity <= 0) next.delete(id);
    else next.set(id, quantity);
    saleMessage.textContent = '';
    if (persistDraft(next)) refreshSale();
}

function renderSaleTotals() {
    const { subtotal, discount, total } = currentSale();
    retail('#sale-subtotal').textContent = pesos(subtotal / 100);
    retail('#discount-total').textContent = pesos(discount / 100);
    retail('#sale-total').textContent = pesos(total / 100);
    discountInput.max = (subtotal / 100).toFixed(2);
    for (const selector of ['#checkout', '#clear-cart', '#hold-sale', '#park-sale']) retail(selector).disabled = !cart.size;
}

function refreshSale() {
    renderCatalog();
    const items = retail('#cart-lines');
    items.replaceChildren();
    const lines = currentSale().lines.filter(line => line.product);
    retail('#sale-title').textContent = '🛒 Current Sale (' + lines.reduce((sum, line) => sum + line.quantity, 0) + ')';
    if (!lines.length) items.append(retailNode('p', 'retail-empty', 'Add products to start a sale.'));
    for (const { product, quantity } of lines) {
        const [name, , price, stock, , , id] = product;
        const row = retailNode('div', 'cart-line');
        const details = retailNode('div', 'cart-details');
        const controls = retailNode('div', 'cart-controls');
        const steps = retailNode('div', 'quantity-buttons');
        const minus = retailButton('−', () => changeQuantity(id, -1));
        const plus = retailButton('+', () => changeQuantity(id, 1));
        minus.setAttribute('aria-label', 'Decrease ' + name);
        plus.setAttribute('aria-label', 'Increase ' + name);
        plus.disabled = quantity >= stock;
        const remove = retailButton('×', () => changeQuantity(id, -quantity), 'plain cart-remove');
        remove.setAttribute('aria-label', 'Remove ' + name);
        steps.append(minus, retailNode('span', '', quantity), plus);
        controls.append(steps, retailNode('strong', '', pesos(cents(price) * quantity / 100)));
        details.append(retailNode('strong', '', name), retailNode('span', '', pesos(price)), controls);
        row.append(productPicture(product), details, remove);
        items.append(row);
    }
    renderSaleTotals();
    renderSavedSales();
}

discountInput.addEventListener('input', renderSaleTotals);
for (const field of [discountInput, customerInput]) field.addEventListener('change', () => persistDraft(cart));
retail('#clear-cart').addEventListener('click', () => {
    if (updateSaleState({ lines: [], discount: 0, customer: '' })) saleMessage.textContent = 'Cart cleared.';
});

function updateSaleState(draft, saved = savedSales) {
    try {
        storeLocalSales(draft, saved);
    } catch {
        saleMessage.textContent = 'The sale could not be saved. Check browser storage.';
        return false;
    }
    cart = new Map(draft.lines);
    discountInput.value = draft.discount;
    customerInput.value = draft.customer;
    refreshSale();
    return true;
}

function renderSavedSales() {
    const saved = retail('#saved-sales');
    saved.replaceChildren();
    for (const kind of ['Held', 'Parked']) {
        const sales = savedSales.filter(sale => sale.kind === kind);
        if (!sales.length) continue;
        const group = retailNode('section', 'saved-sale-group');
        group.append(retailNode('h2', '', kind + ' sales (' + sales.length + ')'));
        for (const sale of sales) {
            const row = retailNode('div', 'saved-sale-row');
            const label = retailNode('div');
            const units = sale.lines.reduce((total, [, quantity]) => total + quantity, 0);
            label.append(retailNode('strong', '', sale.customer || 'Walk-in'),
                retailNode('small', '', units + (units === 1 ? ' item' : ' items') + (sale.savedOn ? ' · ' + dateFormat.format(new Date(sale.savedOn + 'T12:00')) : '')));
            const resume = retailButton('Resume', () => resumeSale(sale));
            const discard = retailButton('Discard', () => {
                if (!window.confirm('Discard this ' + kind.toLowerCase() + ' sale?')) return;
                try {
                    storeLocalSales(draftSale(), savedSales.filter(entry => entry.id !== sale.id));
                    renderSavedSales();
                    saleMessage.textContent = kind + ' sale discarded.';
                } catch {
                    saleMessage.textContent = 'The saved sale could not be discarded.';
                }
            }, 'link');
            row.append(label, resume, discard);
            group.append(row);
        }
        saved.append(group);
    }
}

function saleValidation({ lines, subtotal }, checkStock = true) {
    if (!lines.length || lines.some(({ product, quantity }) => !product || !Number.isSafeInteger(quantity) || quantity < 1 || (checkStock && product[3] < quantity))) {
        return 'Check that the cart contains valid products and quantities within available stock.';
    }
    const discount = discountInput.value || '0';
    if (!validMoney(discount) || cents(discount) > subtotal) return 'Enter a discount between zero and the subtotal, with up to two decimal places.';
    const customer = customerInput.value.trim();
    if (customer && customer.toLowerCase() !== 'walk-in' && !records.Customers.some(([name]) => name.toLowerCase() === customer.toLowerCase())) {
        return 'Choose a registered customer, or leave the field blank for a walk-in.';
    }
    return '';
}

function suspendSale(kind) {
    if (!cart.size) return;
    const error = saleValidation(currentSale(), false);
    if (error) {
        saleMessage.textContent = error;
        return;
    }
    const stored = [...savedSales, { ...draftSale(), kind, id: newRetailId(), savedOn: localDate() }];
    if (updateSaleState({ lines: [], discount: 0, customer: '' }, stored)) {
        saleMessage.textContent = kind + ' sale saved.';
    }
}

function resumeSale(sale) {
    if (cart.size) {
        saleMessage.textContent = 'Clear, hold, or park the current cart before resuming another sale.';
        return;
    }
    if (updateSaleState(sale, savedSales.filter(entry => entry.id !== sale.id))) {
        const error = saleValidation(currentSale());
        saleMessage.textContent = error ? 'Sale resumed. ' + error : 'Sale resumed.';
    }
}
retail('#hold-sale').addEventListener('click', () => suspendSale('Held'));
retail('#park-sale').addEventListener('click', () => suspendSale('Parked'));
retail('#checkout').addEventListener('click', async () => {
    const sale = currentSale();
    const error = saleValidation(sale);
    if (error) {
        saleMessage.textContent = error;
        return;
    }
    const { total } = sale;
    if (isStaff) {
        const button = retail('#checkout');
        button.disabled = true;
        try {
            await sendShopRequest('sale', {
                lines: sale.lines.map(({ product, quantity }) => [product[6], quantity, product[0], product[2]]),
                discount: sale.discount / 100, total: total / 100, customer: customerInput.value.trim() || 'Walk-in'
            });
            updateSaleState({ lines: [], discount: 0, customer: '' });
            showSection('Requests');
        } catch (error) {
            saleMessage.textContent = error.message;
        } finally {
            button.disabled = !cart.size;
        }
        return;
    }
    paymentForm.reset();
    paymentForm.elements.cash.min = (total / 100).toFixed(2);
    retail('#payment-total').textContent = 'Total due ' + pesos(total / 100);
    retail('#payment-change').textContent = '';
    retail('#payment-error').textContent = '';
    payment.showModal();
});
paymentForm.elements.cash.addEventListener('input', () => {
    const change = cents(paymentForm.elements.cash.value) - currentSale().total;
    retail('#payment-change').textContent = change >= 0 ? 'Change ' + pesos(change / 100) : '';
});
paymentForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (isStaff) return;
    const sale = currentSale();
    const { lines, total } = sale;
    const cash = paymentForm.elements.cash.value;
    const received = cents(cash);
    const error = saleValidation(sale);
    if (error || !validMoney(cash) || received < total) {
        retail('#payment-error').textContent = error || 'Enter a valid cash amount that covers the total.';
        return;
    }
    const date = localDate();
    const enteredCustomer = customerInput.value.trim().toLowerCase();
    const customer = records.Customers.find(([name]) => name.toLowerCase() === enteredCustomer)?.[0] ?? 'Walk-in';
    const transaction = ['#TRX-' + newRetailId().replaceAll('-', '').slice(0, 10).toUpperCase(), customer, date,
        lines.map(({ product, quantity }) => quantity + ' × ' + product[0]).join(', '), total / 100];
    const nextProducts = products.map(product => {
        if (!cart.has(product[6])) return product;
        const updated = [...product];
        updated[3] -= cart.get(product[6]);
        return updated;
    });
    const nextCustomers = records.Customers.map(entry => {
        if (entry[0] !== customer) return entry;
        const updated = [...entry];
        updated[5] = (Number(updated[5]) || 0) + total / 100;
        updated[6] = date;
        return updated;
    });
    try {
        await storeShop(nextProducts, { ...records, Customers: nextCustomers, Reports: [transaction, ...records.Reports] });
    } catch (error) {
        retail('#payment-error').textContent = error.message;
        return;
    }
    try { storeLocalSales({ lines: [], discount: 0, customer: '' }); } catch { /* The sale is already recorded. */ }
    cart.clear();
    discountInput.value = '0';
    customerInput.value = '';
    payment.close();
    refreshSale();
    refreshDashboard();
    saleMessage.textContent = 'Sale completed. Change ' + pesos((received - total) / 100) + '.';
});

const customerDialog = retail('#customer-dialog');
const customerForm = retail('#customer-form');
const customerMessage = retail('#customer-message');
const customerSearch = retail('#customer-search');
const customerStatus = retail('#customer-status');
const customerFields = [['fullName', 0], ['phone', 1], ['email', 2], ['status', 4]];
let customerPage = 1;
let customerEditIndex = -1;
let returnToSale = false;

function renderCustomerOptions() {
    retail('#sale-customers').replaceChildren(...records.Customers.map(([name]) => new Option(name, name)));
}

function renderCustomers() {
    const customers = records.Customers;
    const month = localDate().slice(0, 7);
    const counts = [
        ['♙', 'Total Customers', customers.length],
        ['✓', 'Active Customers', customers.filter(entry => entry[4] !== 'Inactive').length],
        ['＋', 'New This Month', customers.filter(entry => entry[7]?.startsWith(month)).length]
    ];
    retail('#customer-stats').replaceChildren(...counts.map(([icon, label, value]) => {
        const card = retailNode('article', 'customer-stat');
        const details = retailNode('div');
        details.append(retailNode('span', '', label), retailNode('strong', '', value));
        card.append(retailNode('span', 'customer-stat-icon', icon), details);
        return card;
    }));
    const query = customerSearch.value.trim().toLowerCase();
    const matching = customers.map((entry, index) => ({ entry, index })).filter(({ entry }) =>
        (!customerStatus.value || (entry[4] || 'Active') === customerStatus.value) &&
        entry.slice(0, 3).some(value => (value || '').toLowerCase().includes(query))
    );
    const totalPages = Math.max(1, Math.ceil(matching.length / 5));
    customerPage = Math.min(customerPage, totalPages);
    const start = (customerPage - 1) * 5;
    const rows = retail('#customer-rows');
    rows.replaceChildren();
    for (const { entry, index } of matching.slice(start, start + 5)) {
        const [name, phone, email, , status = 'Active', purchases = 0, lastPurchase, , id] = entry;
        const row = rows.insertRow();
        const identity = retailNode('div', 'customer-identity');
        const initials = name.split(/\s+/).slice(0, 2).map(word => word[0]).join('');
        const avatar = retailNode('span', 'customer-avatar', initials);
        avatar.dataset.color = index % 5;
        const profile = retailNode('div', 'customer-profile');
        profile.append(retailNode('strong', '', name), retailNode('small', '', '#' + (id || 'CUST-' + String(index + 1).padStart(4, '0'))));
        identity.append(avatar, profile);
        row.insertCell().append(identity);
        const contact = retailNode('div', 'customer-contact');
        contact.append(retailNode('span', '', phone ? '☎  ' + phone : '—'));
        if (email) contact.append(retailNode('span', '', '✉  ' + email));
        row.insertCell().append(contact);
        appendCell(row, pesos(purchases));
        appendCell(row, lastPurchase ? dateFormat.format(new Date(lastPurchase + 'T12:00')) : '—');
        row.insertCell().append(retailNode('span', 'customer-badge ' + status.toLowerCase(), status));
        const actions = row.insertCell();
        actions.className = 'customer-actions';
        actions.append(retailButton('◎ View', () => openCustomer('view', index), 'plain'),
            retailButton('✎ Edit', () => openCustomer('edit', index), 'plain'));
    }
    if (!matching.length) appendCell(rows.insertRow(), 'No customers match your search.').colSpan = 6;
    retail('#customer-count').textContent = matching.length ? 'Showing ' + (start + 1) + '–' + Math.min(start + 5, matching.length) + ' of ' + matching.length + ' customers' : 'Showing 0 customers';
    retailPages('#customer-pages', customerPage, totalPages, next => {
        customerPage = next;
        renderCustomers();
    });
}

customerSearch.addEventListener('input', () => {
    customerPage = 1;
    renderCustomers();
});
function applyCustomerFilters() {
    customerPage = 1;
    renderCustomers();
}
retail('#customer-filter').addEventListener('click', applyCustomerFilters);
customerStatus.addEventListener('change', applyCustomerFilters);

function openCustomer(mode, index = -1, fromSale = false) {
    const entry = records.Customers[index];
    const readOnly = mode === 'view';
    customerEditIndex = index;
    returnToSale = fromSale;
    customerForm.reset();
    retail('#customer-dialog-title').textContent = { view: 'Customer Details', add: 'Add Customer', edit: 'Edit Customer' }[mode];
    retail('#customer-error').textContent = '';
    customerFields.forEach(([key, position]) => {
        const field = customerForm.elements[key];
        field.disabled = readOnly;
        if (entry?.[position]) field.value = entry[position];
    });
    customerForm.querySelector('button').hidden = readOnly;
    customerForm.querySelector('button').textContent = isStaff ? 'Send for Approval' : 'Save Customer';
    customerDialog.showModal();
}
retail('#add-customer').addEventListener('click', () => openCustomer('add'));
retail('#sale-add-customer').addEventListener('click', () => openCustomer('add', -1, true));
function customerContactError(phone, email, except = -1) {
    if (phone && (!/^[+0-9 ().-]+$/.test(phone) || !/^\d{7,15}$/.test(phone.replace(/\D/g, '')))) return 'Enter a valid phone number with 7 to 15 digits.';
    if (email && !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email)) return 'Enter a valid email address.';
    if (email && records.Customers.some((entry, index) => index !== except && entry[2]?.toLowerCase() === email.toLowerCase())) return 'That email is already used by a customer.';
    return '';
}

customerForm.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(customerForm);
    const [name, phone, email, status] = customerFields.map(([key]) => data.get(key).trim());
    const existing = records.Customers[customerEditIndex];
    const error = retail('#customer-error');
    if (!name) {
        error.textContent = 'Enter a customer name.';
        return;
    }
    if (records.Customers.some((entry, index) => index !== customerEditIndex && entry[0].toLowerCase() === name.toLowerCase())) {
        error.textContent = 'A customer with that name already exists.';
        return;
    }
    const contactError = customerContactError(phone, email, customerEditIndex);
    if (contactError) {
        error.textContent = contactError;
        return;
    }
    const entry = [name, phone, email, existing?.[3] ?? '', status, existing?.[5] ?? 0, existing?.[6] ?? '', existing?.[7] ?? localDate(),
        existing?.[8] ?? 'CUST-' + newRetailId().slice(0, 8).toUpperCase()];
    const customers = [...records.Customers];
    if (customerEditIndex < 0) customers.unshift(entry);
    else customers[customerEditIndex] = entry;
    const pets = records.Pets.map(pet => existing && pet[1] === existing[0] ? [pet[0], name, ...pet.slice(2)] : pet);
    try {
        if (isStaff) {
            await sendShopRequest(existing ? 'customer_edit' : 'customer_add', { before: existing, entry });
            customerDialog.close();
            showSection('Requests');
            return;
        }
        await storeShop(products, { ...records, Customers: customers, Pets: pets });
    } catch (failure) {
        error.textContent = failure.message;
        return;
    }
    customerDialog.close();
    renderCustomerOptions();
    if (returnToSale) {
        customerInput.value = name;
        persistDraft(cart);
    } else {
        if (customerEditIndex < 0) {
            customerSearch.value = '';

            customerStatus.value = '';
            applyCustomerFilters();
        } else renderCustomers();
        customerMessage.textContent = 'Customer saved.';
    }
});

function parseCustomerCsv(source) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    const csv = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n') + '\n';
    for (let i = 0; i < csv.length; i++) {
        const char = csv[i];
        if (char === '"') {
            if (quoted && csv[i + 1] === '"') {
                field += '"';
                i++;
            } else quoted = !quoted;
        } else if (!quoted && (char === ',' || char === '\n')) {
            row.push(field.trim());
            field = '';
            if (char === '\n') {
                if (row.some(Boolean)) rows.push(row);
                row = [];
            }
        } else field += char;
    }
    if (quoted) throw new Error('The CSV has an unclosed quote.');
    return rows;
}

const importDialog = retail('#customer-import');
const importForm = retail('#import-form');
retail('#import-customers').addEventListener('click', () => {
    importForm.reset();
    retail('#import-error').textContent = '';
    importDialog.showModal();
});
importForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = importForm.querySelector('button');
    button.disabled = true;
    try {
        const file = importForm.elements.file.files[0];
        if (!file || file.size > 1024 * 1024) throw new Error('Choose a CSV file up to 1 MB.');
        const [headers = [], ...rows] = parseCustomerCsv(await file.text());
        const columns = headers.map(header => header.toLowerCase());
        const fields = ['name', 'phone', 'email', 'status'].map(field => columns.indexOf(field));
        if (fields[0] === -1) throw new Error('The CSV needs a name column.');
        const used = new Set(records.Customers.map(([name]) => name.toLowerCase()));
        const imported = [];
        const emails = new Set();
        let skipped = 0;
        for (const row of rows) {
            const [name, phone, email, status] = fields.map(index => row[index] ?? '');
            if (!name || used.has(name.toLowerCase()) || customerContactError(phone, email) || (email && emails.has(email.toLowerCase()))) {
                skipped++;
                continue;
            }
            if (email) emails.add(email.toLowerCase());
            used.add(name.toLowerCase());
            imported.push([name, phone, email, '', /^inactive$/i.test(status) ? 'Inactive' : 'Active',
                0, '', localDate(), 'CUST-' + newRetailId().slice(0, 8).toUpperCase()]);
        }
        if (!imported.length) throw new Error('The CSV contains no new customers with valid details.');
        if (isStaff) {
            await sendShopRequest('customer_import', { entries: imported });
            importDialog.close();
            showSection('Requests');
            return;
        }
        await storeRecords('Customers', [...imported, ...records.Customers]);
        importDialog.close();
        customerSearch.value = '';

        customerStatus.value = '';
        applyCustomerFilters();
        renderCustomerOptions();
        customerMessage.textContent = 'Imported ' + imported.length + ' customer(s).' + (skipped ? ' Skipped ' + skipped + ' duplicate or invalid row(s).' : '');
    } catch (error) {
        retail('#import-error').textContent = error instanceof DOMException ? 'The import could not be saved.' : error.message;
    } finally {
        button.disabled = false;
    }
});

document.addEventListener('rems:section', event => {
    if (event.detail === 'Point of Sale') {
        if (isStaff) retail('#checkout').textContent = 'Request Checkout';
        renderCategories();
        renderCustomerOptions();
        refreshSale();
    } else if (event.detail === 'Customers') renderCustomers();
});
