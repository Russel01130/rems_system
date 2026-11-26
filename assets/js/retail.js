/* Staff POS, local cart drafts and holds, receipts and customer record screens. Shared sales are recorded through the approval workflow. */

const retail = selector => document.querySelector(selector);
// Creates a DOM element for retail and admin views with optional text and CSS class.
function retailNode(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}
// Creates a plain action button and registers its handler without submitting a surrounding form.
function retailButton(text, action, className) {
    const button = retailNode('button', className, text);
    button.type = 'button';
    button.addEventListener('click', action);
    return button;
}
// Creates an ID for local drafts or new records using browser randomness when available.
function newRetailId() {
    return globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

// Default products retain predictable IDs so catalog thumbnails and legacy carts still resolve.
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
const saleDiscountLabels = { '': 'Discount', senior: 'Senior Citizen Discount (20%)', pwd: 'PWD Discount (20%)' };
const validDiscountType = type => typeof type === 'string' && Object.hasOwn(saleDiscountLabels, type);
const discountForSubtotal = (type, subtotal) => type === '' ? 0 : Math.round(subtotal / 5);
const saleMessage = retail('#sale-message');
const holdExpiryMessage = retail('#hold-expiry-message');
const hourMs = 60 * 60 * 1000;
const holdDeadlineFormat = new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila'
});
const posSearch = retail('#pos-search');
const categorySelect = retail('#pos-category');
const payment = retail('#payment-dialog');
const paymentForm = retail('#payment-form');
const completeSaleButton = paymentForm.querySelector('button[type="submit"]');
const saleReceiptDialog = retail('#sale-receipt-dialog');
let paymentSaving = false;
// Scope local POS drafts and holds by signed-in username on this browser.
const saleStorageKey = 'rems-pos-drafts:' + admin.dataset.username.toLowerCase();
let localSales = {};
try {
    localSales = JSON.parse(localStorage.getItem(saleStorageKey)) ?? {};
} catch {
    // Cart storage is optional.
}
let savedSales = localSales.saved ?? (admin.dataset.role === 'admin' ? records.SavedSales : null) ?? [];
const legacyHoldDeadline = Date.now() + 4 * hourMs;
const initialDraft = localSales.draft ?? (admin.dataset.role === 'admin' ? records.RetailDraft : null);
let cart = new Map(initialDraft?.lines ?? []);
discountInput.value = validDiscountType(initialDraft?.discountType) ? initialDraft.discountType : '';

// Persists the current POS draft and suspended sales together under the staff account’s browser key.
function storeLocalSales(draft, saved = savedSales) {
    localStorage.setItem(saleStorageKey, JSON.stringify({ draft, saved }));
    savedSales = saved;
}

let catalogPage = 1;
let catalogLayout = 'grid';
const posVariantSelections = new Map();

// Draws previous, next and numbered controls for a paginated retail or operations list.
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

// Builds the catalog thumbnail and falls back to the product icon when a photo is unavailable.
function productPicture(product) {
    const picture = retailNode('span', 'retail-product-picture', product[4]);
    picture.setAttribute('aria-hidden', 'true');
    showRecordPhoto(picture, product[5], product[4]);
    return picture;
}

// Groups product sizes in Staff POS, applies search or category filters and paginates the grouped results.
function renderCatalog() {
    const category = categorySelect.value;
    const query = posSearch.value.trim().toLowerCase();
    const variants = products.map(product => ({
        id: product[6], name: product[0], label: productLabel(product), category: product[1],
        unit: product[8]?.unit ?? '', price: product[2], stock: product[3], lowStock: isLowStock(product), product
    }));
    const matching = groupCatalogVariants(variants, variant => (!category || variant.category === category) &&
        (variant.label.toLowerCase().includes(query) || productBarcodes(variant.product).some(code => code.toLowerCase().includes(query))),
    posVariantSelections);
    const maxPage = Math.max(1, Math.ceil(matching.length / 6));
    catalogPage = Math.min(catalogPage, maxPage);
    const start = (catalogPage - 1) * 6;
    const grid = retail('#catalog-products');
    grid.dataset.layout = catalogLayout;
    grid.replaceChildren();
    for (const group of matching.slice(start, start + 6)) {
        grid.append(catalogVariantCard(group, {
            selections: posVariantSelections,
            formatPrice: pesos,
            picture: variant => productPicture(variant.product),
            stockText: stock => 'Stock: ' + stock,
            canAdd: variant => variant.stock > (cart.get(variant.id) ?? 0),
            addVariant: id => changeQuantity(id, 1)
        }));
    }
    if (!matching.length) grid.append(retailNode('p', 'retail-empty', 'No products match your search.'));
    retail('#pos-count').textContent = matching.length ? 'Showing ' + (start + 1) + '–' + Math.min(start + 6, matching.length) + ' of ' + matching.length + ' products' : 'Showing 0 products';
    retailPages('#pos-pages', catalogPage, maxPage, next => {
        catalogPage = next;
        renderCatalog();
    });
    for (const button of retail('#pos-categories').children) button.setAttribute('aria-pressed', button.dataset.category === category);
}

// Refreshes the category dropdown and category buttons from the current catalog.
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

// Returns the catalog to the first page before rendering a new search or category selection.
function resetCatalog() {
    catalogPage = 1;
    renderCatalog();
}
posSearch.addEventListener('input', resetCatalog);
categorySelect.addEventListener('change', resetCatalog);
// Enter after a barcode scan adds the exact matching variant instead of the card’s current unit.
posSearch.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    const product = products.find(item => productBarcodes(item).includes(posSearch.value.trim()));
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
// Resolves cart IDs into inventory records and calculates subtotal, discount and total in cents.
function currentSale() {
    const lines = [...cart].map(([id, quantity]) => ({ product: products.find(entry => entry[6] === id), quantity }));
    const subtotal = lines.reduce((total, line) => total + cents(line.product?.[2] ?? 0) * line.quantity, 0);
    const discountType = discountInput.value;
    const discount = discountForSubtotal(discountType, subtotal);
    return { lines, subtotal, discountType, discount, total: subtotal - discount };
}

// Serializes cart lines and the selected discount for local browser storage.
function draftSale(lines = [...cart]) {
    return { lines, discountType: discountInput.value };
}

// Writes the proposed cart to local storage before replacing the in-memory cart.
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

// Applies a relative quantity change and refreshes the sale after the change is saved.
function changeQuantity(id, change) {
    const quantity = (cart.get(id) ?? 0) + change;
    if (setCartQuantity(id, quantity)) refreshSale();
}

// Checks a quantity against stock, removes zero-quantity lines and saves the resulting cart.
function setCartQuantity(id, quantity) {
    if (quantity > (products.find(entry => entry[6] === id)?.[3] ?? 0)) {
        saleMessage.textContent = 'There is insufficient stock for that quantity.';
        return false;
    }
    const next = new Map(cart);
    if (quantity <= 0) next.delete(id);
    else next.set(id, quantity);
    saleMessage.textContent = '';
    return persistDraft(next);
}

// Updates the line count, currency totals and available cart actions.
function renderSaleTotals() {
    const { lines, subtotal, discount, total } = currentSale();
    const count = lines.reduce((sum, line) => sum + (line.product ? line.quantity : 0), 0);
    retail('#sale-title').textContent = '🛒 Current Sale (' + count + ')';
    retail('#sale-subtotal').textContent = pesos(subtotal / 100);
    retail('#discount-total').textContent = pesos(discount / 100);
    retail('#sale-total').textContent = pesos(total / 100);
    for (const selector of ['#checkout', '#clear-cart', '#hold-sale']) retail(selector).disabled = !cart.size;
}

// Redraws editable cart lines, keeps direct quantity input synchronized with stock and updates held sales.
function refreshSale() {
    renderCatalog();
    const items = retail('#cart-lines');
    items.replaceChildren();
    const lines = currentSale().lines.filter(line => line.product);
    if (!lines.length) items.append(retailNode('p', 'retail-empty', 'Add products to start a sale.'));
    for (const { product, quantity } of lines) {
        const [, , price, stock, , , id] = product;
        const name = productLabel(product);
        const row = retailNode('div', 'cart-line');
        const details = retailNode('div', 'cart-details');
        const controls = retailNode('div', 'cart-controls');
        const steps = retailNode('div', 'quantity-buttons');
        const minus = retailButton('−', () => changeQuantity(id, -1));
        const plus = retailButton('+', () => changeQuantity(id, 1));
        minus.setAttribute('aria-label', 'Decrease ' + name);
        plus.setAttribute('aria-label', 'Increase ' + name);
        plus.disabled = quantity >= stock;
        const remove = retailButton('×', () => changeQuantity(id, -cart.get(id)), 'plain cart-remove');
        remove.setAttribute('aria-label', 'Remove ' + name);
        const quantityInput = retailNode('input', 'cart-quantity');
        quantityInput.type = 'number';
        quantityInput.inputMode = 'numeric';
        quantityInput.min = '1';
        quantityInput.max = String(stock);
        quantityInput.value = String(quantity);
        quantityInput.setAttribute('aria-label', 'Quantity for ' + name);
        const lineTotal = retailNode('strong', '', pesos(cents(price) * quantity / 100));
        // Only commit a positive whole-number quantity within stock and then update the line in place.
        quantityInput.addEventListener('change', () => {
            const requested = quantityInput.valueAsNumber;
            if (!Number.isSafeInteger(requested) || requested < 1) {
                saleMessage.textContent = 'Enter a whole quantity of at least 1.';
            } else if (setCartQuantity(id, requested)) {
                lineTotal.textContent = pesos(cents(price) * requested / 100);
                plus.disabled = requested >= stock;
                const add = [...retail('#catalog-products').querySelectorAll('.add-to-cart')]
                    .find(button => button.dataset.productId === id);
                if (add) add.disabled = plus.disabled;
                renderSaleTotals();
            }
            quantityInput.value = String(cart.get(id));
        });
        quantityInput.addEventListener('keydown', event => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            quantityInput.blur();
        });
        steps.append(minus, quantityInput, plus);
        controls.append(steps, lineTotal);
        details.append(retailNode('strong', '', name), retailNode('span', '', pesos(price)), controls);
        row.append(productPicture(product), details, remove);
        items.append(row);
    }
    renderSaleTotals();
    renderSavedSales();
}

discountInput.addEventListener('input', renderSaleTotals);
discountInput.addEventListener('change', () => persistDraft(cart));
retail('#clear-cart').addEventListener('click', () => {
    if (updateSaleState({ lines: [], discountType: '' })) saleMessage.textContent = 'Cart cleared.';
});

// Switches to a new draft and suspended-sale list only after browser storage confirms the write.
function updateSaleState(draft, saved = savedSales) {
    try {
        storeLocalSales(draft, saved);
    } catch {
        saleMessage.textContent = 'The sale could not be saved. Check browser storage.';
        return false;
    }
    cart = new Map(draft.lines);
    discountInput.value = validDiscountType(draft.discountType) ? draft.discountType : '';
    refreshSale();
    return true;
}

// Applies hold expirations, shows deadline notices and renders the valid actions for each saved sale.
function renderSavedSales() {
    const now = Date.now();
    let changed = false;
    const updated = savedSales.map(sale => {
        if (sale.kind !== 'Held') return sale;
        const legacyDate = Date.parse(sale.savedOn + 'T23:59:59+08:00');
        const expiresAt = Number.isFinite(sale.expiresAt) ? sale.expiresAt :
            Math.min(legacyHoldDeadline, Number.isFinite(legacyDate) ? legacyDate + 4 * hourMs : Infinity);
        const kind = now >= expiresAt ? 'Declined' : 'Held';
        if (expiresAt === sale.expiresAt && kind === sale.kind) return sale;
        changed = true;
        return { ...sale, expiresAt, kind };
    });
    if (changed) {
        try {
            storeLocalSales(draftSale(), updated);
        } catch {
            savedSales = updated;
        }
    }
    const expired = savedSales.filter(sale => sale.kind === 'Declined').length;
    holdExpiryMessage.hidden = !expired;
    const expiryNotice = expired === 1 ? 'A held sale was declined because its hold duration expired.' :
        expired + ' held sales were declined because their hold durations expired.';
    if (expired && holdExpiryMessage.textContent !== expiryNotice) holdExpiryMessage.textContent = expiryNotice;
    const saved = retail('#saved-sales');
    saved.replaceChildren();
    for (const kind of ['Held', 'Parked', 'Declined']) {
        const sales = savedSales.filter(sale => sale.kind === kind);
        if (!sales.length) continue;
        const group = retailNode('section', 'saved-sale-group');
        group.append(retailNode('h2', '', kind + ' sales (' + sales.length + ')'));
        for (const sale of sales) {
            const row = retailNode('div', 'saved-sale-row');
            const label = retailNode('div');
            const units = sale.lines.reduce((total, [, quantity]) => total + quantity, 0);
            label.append(retailNode('strong', '', 'Walk-in'),
                retailNode('small', '', units + (units === 1 ? ' item' : ' items') + (sale.savedOn ? ' · ' + dateFormat.format(new Date(sale.savedOn + 'T12:00')) : '')));
            if (sale.expiresAt) label.append(retailNode('small', '', (kind === 'Declined' ? 'Hold expired ' : 'Hold expires ') + holdDeadlineFormat.format(sale.expiresAt)));
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
            row.append(label);
            if (kind !== 'Declined') row.append(retailButton('Resume', () => resumeSale(sale)));
            row.append(discard);
            group.append(row);
        }
        saved.append(group);
    }
}

// Checks cart contents and discounts, with optional stock enforcement for actions that only save a draft.
function saleValidation({ lines, discountType }, checkStock = true) {
    if (!lines.length || lines.some(({ product, quantity }) => !product || !Number.isSafeInteger(quantity) || quantity < 1 || (checkStock && product[3] < quantity))) {
        return 'Check that the cart contains valid products and quantities within available stock.';
    }
    if (!validDiscountType(discountType)) return 'Choose a valid discount.';
    return '';
}

// Persists a paused cart. New Held sales receive a three-hour deadline from the current time.
function suspendSale(kind) {
    if (!cart.size) return;
    const error = saleValidation(currentSale(), false);
    if (error) {
        saleMessage.textContent = error;
        return;
    }
    const sale = { ...draftSale(), kind, id: newRetailId(), savedOn: localDate() };
    if (kind === 'Held') sale.expiresAt = Date.now() + 3 * hourMs;
    const stored = [...savedSales, sale];
    if (updateSaleState({ lines: [], discountType: '' }, stored)) {
        saleMessage.textContent = kind === 'Held' ? 'Sale held for 3 hours.' : kind + ' sale saved.';
    }
}

// Blocks expired holds or a nonempty current cart before restoring a saved sale.
function resumeSale(sale) {
    if (sale.kind === 'Held' && Date.now() >= sale.expiresAt) {
        renderSavedSales();
        return;
    }
    if (cart.size) {
        saleMessage.textContent = 'Clear or hold the current cart before resuming another sale.';
        return;
    }
    if (updateSaleState(sale, savedSales.filter(entry => entry.id !== sale.id))) {
        const error = saleValidation(currentSale());
        saleMessage.textContent = error ? 'Sale resumed. ' + error : 'Sale resumed.';
    }
}
// Check stored holds while the POS is open and prevent a resume after the saved deadline.
retail('#hold-sale').addEventListener('click', () => suspendSale('Held'));
setInterval(() => {
    if (savedSales.some(sale => sale.kind === 'Held' && Date.now() >= sale.expiresAt)) renderSavedSales();
}, 1000);
// Shows the receipt details after checkout and prepares its PDF filename.
function openSaleReceipt(id, details) {
    retail('#sale-receipt-details').textContent = details;
    retail('#sale-receipt-print-details').textContent = details;
    retail('#print-sale-receipt').dataset.filename = id.replace(/^#/, '') + '-receipt.pdf';
    if (payment.open) payment.close();
    saleReceiptDialog.showModal();
}
retail('#print-sale-receipt').addEventListener('click', event => {
    downloadReceiptPdf(retail('#sale-receipt-title').textContent,
        retail('#sale-receipt-details').textContent, event.currentTarget.dataset.filename);
});

// Fetches a previously stored sale receipt and offers it as a PDF download.
async function downloadSaleReceipt(id, button) {
    button.disabled = true;
    try {
        const { receipt } = await shopRequest('sale_receipt_download', { id });
        const bytes = Uint8Array.from(atob(receipt), char => char.charCodeAt(0));
        const link = retailNode('a');
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        link.href = url;
        link.download = id.slice(1) + '-receipt.pdf';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
        retail('#shop-load-error').textContent = error.message;
    } finally {
        button.disabled = false;
    }
}
// Validate the current cart and send staff checkout requests to Approvals.
retail('#checkout').addEventListener('click', async () => {
    if (paymentSaving) return;
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
                lines: sale.lines.map(({ product, quantity }) => [product[6], quantity, productLabel(product), product[2]]),
                discountType: sale.discountType, discount: sale.discount / 100,
                total: total / 100, customer: 'Walk-in'
            });
            updateSaleState({ lines: [], discountType: '' });
            showSection('Requests');
        } catch (error) {
            saleMessage.textContent = error.message;
        } finally {
            button.disabled = !cart.size;
        }
        return;
    }
    paymentForm.reset();
    completeSaleButton.disabled = false;
    paymentForm.elements.cash.readOnly = false;
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
// Validate cash and stock again before building the sale and receipt details.
paymentForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (isStaff) return;
    if (completeSaleButton.disabled) return;
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
    const transaction = ['#TRX-' + newRetailId().replaceAll('-', '').slice(0, 10).toUpperCase(), 'Walk-in', date,
        lines.map(({ product, quantity }) => quantity + ' × ' + productLabel(product)).join(', '), total / 100];
    const receiptDetails = [
        'Rem’s Pet Supplies & Accessories Shop',
        transaction[0] + ' · ' + formatDay(date),
        'Customer Walk-in',
        '',
        ...lines.map(({ product, quantity }) => quantity + ' × ' + productLabel(product) + ' @ ' + pesos(product[2])
            + ' = ' + pesos(cents(product[2]) * quantity / 100)),
        '',
        'Subtotal ' + pesos(sale.subtotal / 100),
        saleDiscountLabels[sale.discountType] + ' ' + pesos(sale.discount / 100),
        'Total paid ' + pesos(total / 100),
        'Cash received ' + pesos(received / 100),
        'Change ' + pesos((received - total) / 100),
    ].join('\n');
    const nextProducts = products.map(product => {
        if (!cart.has(product[6])) return product;
        const updated = [...product];
        updated[3] -= cart.get(product[6]);
        return updated;
    });
    retail('#payment-error').textContent = '';
    paymentSaving = true;
    completeSaleButton.disabled = true;
    paymentForm.elements.cash.readOnly = true;
    try {
        await storeShop(nextProducts, { ...records, Reports: [transaction, ...records.Reports] });
    } catch (error) {
        retail('#payment-error').textContent = error.message;
        completeSaleButton.disabled = false;
        paymentForm.elements.cash.readOnly = false;
        return;
    } finally {
        paymentSaving = false;
    }
    try { storeLocalSales({ lines: [], discountType: '' }); } catch { /* The sale is already recorded. */ }
    cart.clear();
    discountInput.value = '';
    refreshSale();
    refreshDashboard();
    saleMessage.textContent = 'Sale completed. Change ' + pesos((received - total) / 100) + '.';
    openSaleReceipt(transaction[0], receiptDetails);
});

const customerDialog = retail('#customer-dialog');
const customerForm = retail('#customer-form');
const customerSave = retail('#save-customer');
const customerMessage = retail('#customer-message');
const customerSearch = retail('#customer-search');
const customerStatus = retail('#customer-status');
const customerFields = [['fullName', 0], ['phone', 1], ['email', 2], ['status', 4]];
let customerPage = 1;
let customerEditIndex = -1;
let customerEditEntry;

// Builds the filtered and paginated customer table with role-appropriate actions.
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
        actions.append(retailButton('◎ View', () => openCustomer('view', index), 'plain'));
        if (isStaff) actions.append(retailButton('Request edit', () => openCustomer('edit', index), 'plain'));
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
// Returns to the first customer results page after the search or filters change.
function applyCustomerFilters() {
    customerPage = 1;
    renderCustomers();
}
retail('#customer-filter').addEventListener('click', applyCustomerFilters);
customerStatus.addEventListener('change', applyCustomerFilters);

// Populates the customer form for viewing, registering or requesting an edit.
function openCustomer(mode, index = -1) {
    if (!isStaff && mode !== 'view') return;
    const entry = records.Customers[index];
    const readOnly = mode === 'view';
    customerEditIndex = index;
    customerEditEntry = mode === 'edit' ? entry : undefined;
    customerForm.reset();
    retail('#customer-dialog-title').textContent = { view: 'Customer Details', add: 'Add Customer', edit: 'Edit Customer' }[mode];
    retail('#customer-error').textContent = '';
    customerFields.forEach(([key, position]) => {
        const field = customerForm.elements[key];
        field.disabled = readOnly;
        if (entry?.[position]) field.value = entry[position];
    });
    customerSave.hidden = readOnly;
    customerSave.textContent = isStaff ? 'Send for Approval' : 'Save Customer';
    customerDialog.showModal();
}
retail('#add-customer').addEventListener('click', () => openCustomer('add'));
// Checks phone and email formats and detects conflicts with another customer record.
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
    if (customerEditIndex < 0) {
        customerSearch.value = '';
        customerStatus.value = '';
        applyCustomerFilters();
    } else renderCustomers();
    customerMessage.textContent = 'Customer saved.';
});

// Parses CSV rows with quoted values before validating imported customer records.
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
    if (!isStaff) return;
    importForm.reset();
    retail('#import-error').textContent = '';
    importDialog.showModal();
});
// Validate every CSV row before sending customer import changes.
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
        refreshSale();
    } else if (event.detail === 'Customers') renderCustomers();
});
