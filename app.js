const admin = document.querySelector('#admin');
const productDialog = document.querySelector('#product-dialog');
const productForm = document.querySelector('#product-form');
const rows = document.querySelector('#product-rows');
const category = document.querySelector('#category');
const search = document.querySelector('#search');
const filter = document.querySelector('#filter');
const itemDialog = document.querySelector('#inventory-item-dialog');
const itemForm = document.querySelector('#inventory-item-form');
const itemError = document.querySelector('#inventory-item-error');
const itemSave = document.querySelector('#save-inventory-item');
const inventoryMessage = document.querySelector('#inventory-message');
const inventoryPdfButton = document.querySelector('#download-inventory-pdf');
const unitSelect = productForm.elements.unit;
const sellingAmount = productForm.elements.price;
const productUnitGroups = new Map([...unitSelect.querySelectorAll('optgroup')].map(group =>
    [group.label, [...group.children].map(option => option.value)]));
const unitGroupsByCategory = new Map([
    ['Pet Food', ['Weight']],
    ['Grooming', ['Volume', 'Count']],
    ['Accessories', ['Count']],
    ['Toys', ['Count']],
    ['Hygiene', ['Volume', 'Weight', 'Count']],
]);
const sampleProducts = JSON.parse(document.querySelector('#initial-products').textContent);
const storageKey = 'rems-demo-products';
let products = sampleProducts.map(product => [...product]);

try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(saved)) products = saved;
} catch {
    // The sample inventory also works without browser storage.
}

let productIndex = -1;
let unitPriceBasis = null;
let page = 1;
let productPhoto = '';
let pendingPhoto = null;
const photoPreview = document.querySelector('#product-photo-preview');
const photoField = productForm.elements.photo;
const photoError = document.querySelector('#product-error');
const removePhoto = document.querySelector('#remove-product-photo');

let previousAdminPage = 'Dashboard';
const adminHistoryPages = ['Booking', 'Transaction History', 'Audit Logs'];

function showSection(name) {
    if (admin.dataset.role === 'staff' && ['Reports', 'User Management', ...adminHistoryPages].includes(name)) return;
    const currentPage = admin.dataset.page;
    if (name === 'Settings' && currentPage && currentPage !== 'Settings') previousAdminPage = currentPage;
    document.querySelector('#requests-page').hidden = name !== 'Requests';
    document.querySelector('#profile-settings').hidden = name !== 'Settings';
    document.querySelector('#dashboard').hidden = name !== 'Dashboard';
    document.querySelector('#inventory').hidden = name !== 'Inventory';
    document.querySelector('#operations').hidden = ['Dashboard', 'Inventory', 'Point of Sale', 'Customers', 'Settings', 'Requests', ...adminHistoryPages].includes(name);
    document.querySelectorAll('[data-admin-history]').forEach(section => { section.hidden = section.dataset.adminHistory !== name; });
    document.querySelector('#pos').hidden = name !== 'Point of Sale';
    document.querySelector('#customers-page').hidden = name !== 'Customers';
    const modules = { Inventory: ['inventory', '#inventory'], 'Point of Sale': ['pos', '#pos'],
        'Grooming & Pet Hotel': ['booking', '#operations'] };
    const module = modules[name];
    const paused = module && JSON.parse(admin.dataset.pausedModules).includes(module[0]);
    const maintenanceNotice = document.querySelector('#shop-maintenance-notice');
    maintenanceNotice.hidden = !paused;
    maintenanceNotice.textContent = paused ? name + ' is under maintenance. Please try again later.' : '';
    if (paused) document.querySelector(module[1]).hidden = true;
    admin.dataset.page = name;
    document.querySelectorAll('.sidebar [data-section]').forEach(button => {
        if (button.dataset.section === name) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
    });
    if (name === 'Inventory') renderProducts();
    document.dispatchEvent(new CustomEvent('rems:section', { detail: name }));
}

document.querySelectorAll('dialog .close').forEach(button => {
    button.addEventListener('click', () => button.closest('dialog').close());
});
document.addEventListener('DOMContentLoaded', () => initializeShop());

document.querySelectorAll('[data-section]').forEach(button => {
    button.addEventListener('click', () => {
        if (button.closest('.low')) {
            filter.setAttribute('aria-pressed', 'true');
            category.value = '';
            search.value = '';
            page = 1;
        }
        showSection(button.dataset.section);
    });
});

function appendCell(row, value, className = '') {
    const cell = row.insertCell();
    cell.className = className;
    cell.textContent = value;
    return cell;
}

function isLowStock(product) {
    return product[3] > 0 && product[3] <= (product[8]?.minimumStock ?? 5);
}

function sameProductVariant(product, name, category, unit) {
    return product[0].toLowerCase() === name.toLowerCase() && product[1] === category &&
        (product[8]?.unit ?? '') === unit;
}

function productLabel(product) {
    return product[8]?.unit ? product[0] + ' · ' + product[8].unit : product[0];
}

function productBarcodes(product) {
    return [product[7], ...(product[8]?.itemBarcodes ?? [])].filter(Boolean);
}

function barcodeCheckDigit(body) {
    const sum = [...body].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
    return String((10 - sum % 10) % 10);
}

function validItemBarcode(barcode) {
    return typeof barcode === 'string' && /^\d{13}$/.test(barcode)
        && barcode[12] === barcodeCheckDigit(barcode.slice(0, 12));
}

function generateItemBarcode() {
    const used = new Set(products.flatMap(productBarcodes));
    let barcode;
    do {
        const random = crypto.getRandomValues(new Uint32Array(2));
        const body = '29' + [...random].map(value => String(value % 100000).padStart(5, '0')).join('');
        barcode = body + barcodeCheckDigit(body);
    } while (used.has(barcode));
    return barcode;
}

function drawItemBarcode(canvas, barcode) {
    canvas.hidden = !barcode;
    if (!barcode) return;
    const digitPatterns = ['0001101', '0011001', '0010011', '0111101', '0100011',
        '0110001', '0101111', '0111011', '0110111', '0001011'];
    const parity = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
        'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'][Number(barcode[0])];
    const flip = bits => bits.replace(/[01]/g, bit => bit === '1' ? '0' : '1');
    const left = [...barcode.slice(1, 7)].map((digit, index) => {
        const bits = digitPatterns[digit];
        return parity[index] === 'L' ? bits : [...flip(bits)].reverse().join('');
    }).join('');
    const right = [...barcode.slice(7)].map(digit => flip(digitPatterns[digit])).join('');
    const bars = '101' + left + '01010' + right + '101';
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000';
    for (const [index, bar] of [...bars].entries()) {
        if (bar === '1') context.fillRect(24 + index * 2, 4, 2, canvas.height - 8);
    }
}

function validExpiryDate(date) {
    if (date === '') return true;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const value = new Date(date + 'T00:00:00Z');
    return Number.isFinite(value.getTime()) && value.toISOString().slice(0, 10) === date;
}

function unitsForCategory(category) {
    const groups = unitGroupsByCategory.get(category) ?? [...productUnitGroups.keys()];
    return groups.flatMap(group => productUnitGroups.get(group));
}

function updateProductUnits(selectedUnit, readOnly = false) {
    const units = unitsForCategory(productForm.elements.category.value);
    // Keep a previously saved unit visible when viewing older products.
    if (readOnly && selectedUnit && !units.includes(selectedUnit)) units.push(selectedUnit);
    unitSelect.replaceChildren(new Option('Choose a unit or size', ''),
        ...units.map(unit => new Option(unit, unit)));
    unitSelect.value = units.includes(selectedUnit) ? selectedUnit : '';
    unitSelect.disabled = readOnly;
}

function unitMeasurement(unit) {
    const match = /^(\d+(?:\.\d+)?) (mL|L|g|kg)$/.exec(unit);
    if (!match) return null;
    const [, amount, symbol] = match;
    const kind = symbol === 'L' || symbol === 'mL' ? 'volume' : 'weight';
    const quantity = Number(amount) * (symbol === 'L' || symbol === 'kg' ? 1000 : 1);
    return Number.isSafeInteger(quantity) && quantity > 0 ? { kind, quantity } : null;
}

function priceForUnit(basis, unit) {
    if (!basis || !Number.isSafeInteger(basis.cents) || basis.cents < 0) return null;
    if (unit === basis.unit) return basis.cents;
    const original = unitMeasurement(basis.unit);
    const target = unitMeasurement(unit);
    if (!original || !target || original.kind !== target.kind) return null;
    const divisor = BigInt(original.quantity);
    const rounded = (BigInt(basis.cents) * BigInt(target.quantity) + divisor / 2n) / divisor;
    return rounded <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(rounded) : null;
}

function enteredUnitPrice(unit, amount) {
    return unit && validMoney(amount) ? { unit, cents: Math.round(Number(amount) * 100) } : null;
}

function updatePriceForSelectedUnit() {
    const unit = unitSelect.value;
    if (!unit) return;
    if (!unitPriceBasis) {
        unitPriceBasis = enteredUnitPrice(unit, sellingAmount.value);
        return;
    }
    const amount = priceForUnit(unitPriceBasis, unit);
    sellingAmount.value = amount === null ? '' : (amount / 100).toFixed(2);
}

productForm.elements.category.addEventListener('change', () => {
    updateProductUnits(unitSelect.value);
    updatePriceForSelectedUnit();
});
unitSelect.addEventListener('change', updatePriceForSelectedUnit);
sellingAmount.addEventListener('input', () => {
    unitPriceBasis = enteredUnitPrice(unitSelect.value, sellingAmount.value);
});

function matchingInventoryProducts() {
    const query = search.value.trim().toLowerCase();
    const lowOnly = filter.getAttribute('aria-pressed') === 'true';
    return products.map((product, index) => ({ product, index })).filter(({ product }) =>
        productLabel(product).toLowerCase().includes(query) &&
        (!category.value || product[1] === category.value) &&
        (!lowOnly || isLowStock(product))
    );
}

function inventoryStockStatus(product) {
    return product[3] === 0 ? 'out' : isLowStock(product) ? 'low' : 'in';
}

const stockStatusLabels = { out: 'Out of Stock', low: 'Low Stock', in: 'In Stock' };

function renderProducts() {
    const matching = matchingInventoryProducts();
    if (inventoryPdfButton) inventoryPdfButton.disabled = !matching.length || shopRevision === null;
    const pageCount = Math.max(1, Math.ceil(matching.length / 5));
    page = Math.min(page, pageCount);
    const start = (page - 1) * 5;
    rows.replaceChildren();

    matching.slice(start, start + 5).forEach(({ product, index }) => {
        const [, group, price, stock, icon] = product;
        const row = rows.insertRow();
        const nameCell = appendCell(row, '');
        const item = document.createElement('div');
        item.className = 'product-name';
        const thumbnail = document.createElement('span');
        thumbnail.className = 'product-image';
        thumbnail.textContent = icon;
        thumbnail.setAttribute('aria-hidden', 'true');
        showRecordPhoto(thumbnail, product[5], icon);
        item.append(thumbnail, productLabel(product));
        nameCell.append(item);
        appendCell(row, group);
        appendCell(row, '₱' + Number(price).toFixed(2));
        const status = inventoryStockStatus(product);
        appendCell(row, stock, 'stock-' + status);
        const badge = document.createElement('span');
        badge.className = 'status ' + status + '-stock';
        badge.textContent = '● ' + stockStatusLabels[status];
        appendCell(row, '').append(badge);
        const actions = appendCell(row, '');
        for (const [label, mode] of [['◉ View', 'view'], ['♢ Edit', 'edit']]) {
            const button = document.createElement('button');
            button.className = mode === 'edit' ? 'row-action row-action-edit' : 'row-action';
            button.textContent = isStaff && mode === 'edit' ? 'Request edit' : label;
            button.addEventListener('click', () => openProduct(mode, index));
            actions.append(button);
        }
        if (!isStaff) {
            const remove = retailButton('Delete', () => deleteProduct(product, remove), 'row-action row-action-delete');
            remove.setAttribute('aria-label', 'Delete ' + productLabel(product) + ' (' + group + ')');
            actions.append(remove);
        }
    });
    if (matching.length === 0) {
        appendCell(rows.insertRow(), 'No products found.').colSpan = 6;
    }
    document.querySelector('#product-count').textContent = matching.length
        ? 'Showing ' + (start + 1) + '–' + Math.min(start + 5, matching.length) + ' of ' + matching.length + ' products'
        : 'Showing 0 products';
    const pagination = document.querySelector('#pagination');
    pagination.replaceChildren();
    for (const [label, target] of [['‹', page - 1], [page, page], ['›', page + 1]]) {
        const button = document.createElement('button');
        button.textContent = label;
        button.disabled = target < 1 || target > pageCount;
        if (target === page) button.setAttribute('aria-current', 'page');
        button.addEventListener('click', () => {
            page = target;
            renderProducts();
        });
        pagination.append(button);
    }
}

function downloadInventoryPdf(inventory, date) {
    const pdf = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 40;
    const columns = ['Product', 'Category', 'Selling Price', 'Stock', 'Status'];
    const widths = [205, 95, 90, 45, 80];
    const tableWidth = widths.reduce((total, width) => total + width, 0);
    const pageBottom = pdf.internal.pageSize.getHeight() - margin;
    const lineHeight = 13;
    let y;
    const drawHeader = () => {
        pdf.setFont('helvetica', 'bold').setFontSize(20).setTextColor(48, 32, 22);
        pdf.text('Inventory', margin, 48);
        pdf.setFont('helvetica', 'normal').setFontSize(10);
        pdf.text(formatDay(date) + ' | ' + inventory.length + ' products', margin, 66);
        pdf.setFillColor(174, 67, 33).rect(margin, 80, tableWidth, 24, 'F');
        pdf.setFont('helvetica', 'bold').setTextColor(255, 255, 255);
        let x = margin;
        columns.forEach((label, index) => { pdf.text(label, x + 7, 96); x += widths[index]; });
        pdf.setFont('helvetica', 'normal').setTextColor(48, 32, 22);
        y = 104;
    };
    drawHeader();
    inventory.forEach((product, index) => {
        const values = [productLabel(product), product[1], 'PHP ' + Number(product[2]).toFixed(2),
            String(product[3]), stockStatusLabels[inventoryStockStatus(product)]];
        const lines = values.map((value, column) => pdf.splitTextToSize(value, widths[column] - 14));
        const lineCount = Math.max(...lines.map(cell => cell.length));
        let offset = 0;
        while (offset < lineCount) {
            const remaining = Math.floor((pageBottom - y - 10) / lineHeight);
            if (remaining < 1) {
                pdf.addPage();
                drawHeader();
                continue;
            }
            const count = Math.min(lineCount - offset, remaining);
            const height = count * lineHeight + 10;
            pdf.setFillColor(...(index % 2 === 0 ? [249, 234, 226] : [255, 255, 255]));
            pdf.rect(margin, y, tableWidth, height, 'F');
            let x = margin;
            lines.forEach((cell, column) => {
                cell.slice(offset, offset + count).forEach((line, row) => pdf.text(line, x + 7, y + 14 + row * lineHeight));
                x += widths[column];
            });
            y += height;
            offset += count;
        }
    });
    pdf.save('rems-inventory-' + date + '.pdf');
}

inventoryPdfButton?.addEventListener('click', () => {
    const matching = matchingInventoryProducts();
    if (matching.length) downloadInventoryPdf(matching.map(({ product }) => product), localDate());
});

function resetPage() {
    page = 1;
    renderProducts();
}

async function deleteProduct(product, button) {
    const group = product[1];
    const name = productLabel(product);
    inventoryMessage.textContent = '';
    if (!window.confirm('Delete ' + name + ' (' + group + ') from inventory?')) return;
    if (!products.includes(product)) {
        renderProducts();
        inventoryMessage.textContent = 'The product list changed. Select the product again.';
        return;
    }

    button.disabled = true;
    try {
        await storeShop(products.filter(entry => entry !== product), records);
    } catch (error) {
        inventoryMessage.textContent = error.message;
        return;
    } finally {
        button.disabled = false;
    }
    renderProducts();
    refreshDashboard();
    inventoryMessage.textContent = 'Deleted ' + name + ' (' + group + ').';
}

search.addEventListener('input', resetPage);
category.addEventListener('change', resetPage);
filter.addEventListener('click', () => {
    filter.setAttribute('aria-pressed', filter.getAttribute('aria-pressed') !== 'true');
    resetPage();
});

function openProduct(mode, index = -1) {
    productIndex = index;
    const product = products[index];
    const specs = product?.[8];
    const readOnly = mode === 'view';
    productForm.reset();
    pendingPhoto = null;
    photoError.textContent = '';
    productPhoto = product?.[5] ?? '';
    document.querySelector('#product-photo-field').hidden = readOnly;
    updatePhotoPreview(readOnly);
    document.querySelector('#product-title').textContent = { add: 'Add Product', edit: 'Edit Product', view: 'Product Details' }[mode];
    const barcodes = product ? productBarcodes(product) : [];
    const barcodeList = document.querySelector('#product-barcodes');
    barcodeList.hidden = barcodes.length === 0;
    barcodeList.textContent = barcodes.length ? 'Barcodes: ' + barcodes.join(', ') : '';
    const fields = {
        product: product?.[0], category: product?.[1], retailAmount: specs?.retailAmount, price: product?.[2],
        stock: product?.[3], minimumStock: specs?.minimumStock, expiryDate: specs?.expiryDate,
    };
    for (const [key, value] of Object.entries(fields)) {
        const field = productForm.elements[key];
        field.disabled = readOnly;
        if (value !== undefined) field.value = value;
    }
    updateProductUnits(specs?.unit, readOnly);
    unitPriceBasis = specs?.pricingBasis ?? enteredUnitPrice(specs?.unit, product?.[2]);
    const submit = productForm.querySelector('button:not([type="button"])');
    submit.hidden = readOnly;
    submit.textContent = isStaff ? 'Send for Approval' : 'Save Product';
    productDialog.showModal();
}

function updatePhotoPreview(readOnly = false) {
    photoPreview.hidden = !productPhoto;
    removePhoto.hidden = readOnly || !productPhoto;
    if (productPhoto) photoPreview.src = productPhoto;
    else photoPreview.removeAttribute('src');
}

async function prepareRecordPhoto(file) {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > 10 * 1024 * 1024) {
        throw new Error('Choose a JPG, PNG, WebP, or GIF up to 10 MB.');
    }
    const picture = await createImageBitmap(file);
    try {
        const scale = Math.min(1, 480 / Math.max(picture.width, picture.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(picture.width * scale));
        canvas.height = Math.max(1, Math.round(picture.height * scale));
        canvas.getContext('2d').drawImage(picture, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/webp', 0.82);
    } finally {
        picture.close();
    }
}

function validMoney(value) {
    const text = String(value ?? '');
    return /^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(text) && Number.isSafeInteger(Math.round(Number(text) * 100));
}

function showRecordPhoto(frame, photo, fallback) {
    frame.textContent = fallback;
    if (!photo) return;
    const image = document.createElement('img');
    image.alt = '';
    image.addEventListener('error', () => { frame.textContent = fallback; });
    image.src = photo;
    frame.replaceChildren(image);
}

photoField.addEventListener('change', async () => {
    const file = photoField.files[0];
    if (!file) return;
    photoError.textContent = '';
    const loading = prepareRecordPhoto(file);
    pendingPhoto = loading;
    try {
        const picture = await loading;
        if (pendingPhoto !== loading) return;
        productPhoto = picture;
        updatePhotoPreview();
    } catch (error) {
        if (pendingPhoto !== loading) return;
        photoField.value = '';
        photoError.textContent = error instanceof DOMException ? 'This picture could not be opened.' : error.message;
    } finally {
        if (pendingPhoto === loading) pendingPhoto = null;
    }
});

removePhoto.addEventListener('click', () => {
    pendingPhoto = null;
    productPhoto = '';
    photoField.value = '';
    photoError.textContent = '';
    updatePhotoPreview();
});

document.querySelector('#add-product').addEventListener('click', () => openProduct('add'));
productForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (pendingPhoto) {
        photoError.textContent = 'Wait for the picture preview before saving.';
        return;
    }
    const data = new FormData(productForm);
    const name = data.get('product').trim();
    if (!name) {
        photoError.textContent = 'Enter a product name.';
        productForm.elements.product.focus();
        return;
    }
    const before = products[productIndex];
    const group = data.get('category');
    const price = data.get('price');
    const stock = data.get('stock');
    const retailAmount = data.get('retailAmount');
    const minimumStock = data.get('minimumStock');
    const unit = data.get('unit');
    const expiryDate = data.get('expiryDate');
    if (!Array.from(productForm.elements.category.options).some(option => option.value === group) ||
        !validMoney(price) || !validMoney(retailAmount) ||
        ![stock, minimumStock].every(value => /^\d+$/.test(value) && Number.isSafeInteger(Number(value))) ||
        !unitsForCategory(group).includes(unit) ||
        !validExpiryDate(expiryDate)) {
        photoError.textContent = 'Check the category, amounts, stock quantities, unit, and expiry date.';
        return;
    }
    if (products.some((entry, index) => index !== productIndex && sameProductVariant(entry, name, group, unit))) {
        photoError.textContent = 'This product name, category, and unit size already exist. Edit the existing product instead.';
        return;
    }
    const enteredPrice = enteredUnitPrice(unit, price);
    const pricingBasis = priceForUnit(unitPriceBasis, unit) === enteredPrice.cents ? unitPriceBasis : enteredPrice;
    const specs = { ...before?.[8], retailAmount: Number(retailAmount), minimumStock: Number(minimumStock), unit, expiryDate, pricingBasis };
    const product = [name, group, Number(price), Number(stock), before?.[4] ?? '📦', productPhoto,
        before?.[6] ?? newRetailId(), before?.[7] ?? '', specs];
    const next = [...products];
    if (productIndex === -1) next.unshift(product);
    else next[productIndex] = product;
    try {
        if (isStaff) await sendShopRequest(productIndex === -1 ? 'product_add' : 'product_edit', { before: products[productIndex], entry: product });
        else await storeShop(next, records);
    } catch (error) {
        photoError.textContent = error.message;
        return;
    }
    productDialog.close();
    if (isStaff) showSection('Requests');
    else {
        refreshDashboard();
        resetPage();
    }
});

const itemBarcodePreview = document.querySelector('#inventory-item-barcode');
itemForm.elements.productId.addEventListener('change', () => {
    const product = products.find(entry => entry[6] === itemForm.elements.productId.value);
    const barcode = product ? generateItemBarcode() : '';
    itemForm.elements.sellingPrice.value = product ? pesos(product[2]) : '';
    itemForm.elements.itemBarcode.value = barcode;
    drawItemBarcode(itemBarcodePreview, barcode);
    itemSave.disabled = !product;
    itemError.textContent = '';
});

document.querySelector('#add-item').addEventListener('click', () => {
    itemForm.reset();
    itemForm.elements.productId.replaceChildren(new Option('Choose a product', ''), ...products.map(product =>
        new Option(productLabel(product) + ' · ' + product[1], product[6])));
    itemSave.disabled = true;
    itemBarcodePreview.hidden = true;
    itemError.textContent = products.length ? '' : 'Add a product first.';
    itemDialog.showModal();
});

itemForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (itemSave.disabled) return;
    const index = products.findIndex(entry => entry[6] === itemForm.elements.productId.value);
    const before = products[index];
    const barcode = itemForm.elements.itemBarcode.value;
    if (!before || !validItemBarcode(barcode) || products.some(entry => productBarcodes(entry).includes(barcode))) {
        itemError.textContent = 'Choose the product again to generate an available barcode.';
        return;
    }
    const updated = [...before];
    updated[7] ??= '';
    updated[8] = { ...before[8], itemBarcodes: [...(before[8]?.itemBarcodes ?? []), barcode] };
    itemSave.disabled = true;
    try {
        if (isStaff) await sendShopRequest('product_edit', { before, entry: updated });
        else {
            const next = [...products];
            next[index] = updated;
            await storeShop(next, records);
        }
    } catch (error) {
        itemError.textContent = error.message;
        return;
    } finally {
        itemSave.disabled = false;
    }
    itemDialog.close();
    if (isStaff) showSection('Requests');
    else inventoryMessage.textContent = 'Item added for ' + productLabel(before) + '. Barcode ' + barcode + '.';
});
const profileMenu = document.querySelector('#profile-menu');
const profileTrigger = profileMenu.querySelector('summary');
const settingsPage = document.querySelector('#profile-settings');
const quickTheme = document.querySelector('#quick-theme');
const appearanceChoices = settingsPage.querySelectorAll('input[name="appearance"]');
const deviceTheme = window.matchMedia('(prefers-color-scheme: dark)');
const themeStorageKey = 'rems-appearance';
let appearance = 'light';
try {
    const savedTheme = localStorage.getItem(themeStorageKey);
    if (['light', 'dark', 'system'].includes(savedTheme)) appearance = savedTheme;
} catch {
    // Appearance can still be changed for the current page.
}

function applyAppearance() {
    const dark = appearance === 'dark' || (appearance === 'system' && deviceTheme.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    quickTheme.setAttribute('aria-checked', String(dark));
    document.querySelector('#quick-theme-label').textContent = dark ? 'Switch to light mode' : 'Switch to dark mode';
    appearanceChoices.forEach(input => { input.checked = input.value === appearance; });
}

function chooseAppearance(theme) {
    appearance = theme;
    try {
        localStorage.setItem(themeStorageKey, theme);
    } catch {
        // Keep the selection for the current page if storage is unavailable.
    }
    applyAppearance();
}

appearanceChoices.forEach(input => input.addEventListener('change', () => chooseAppearance(input.value)));
deviceTheme.addEventListener('change', applyAppearance);
applyAppearance();

document.addEventListener('click', event => {
    if (profileMenu.open && !profileMenu.contains(event.target)) profileMenu.open = false;
});
profileMenu.addEventListener('keydown', event => {
    if (event.key === 'Escape' && profileMenu.open) {
        event.preventDefault();
        profileMenu.open = false;
        profileTrigger.focus();
    }
});
document.addEventListener('rems:section', () => { profileMenu.open = false; });

quickTheme.addEventListener('click', () => {
    chooseAppearance(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});
const displayNameInput = document.querySelector('#profile-display-name');
const profileName = profileTrigger.querySelector('.profile-name');
const profileSaveStatus = document.querySelector('#profile-save-status');
const displayNameKey = admin.dataset.role === 'staff' ? 'rems-display-name:' + admin.dataset.username : 'rems-display-name';
const defaultDisplayName = admin.dataset.role === 'staff' ? admin.dataset.username : 'System Administrator';

function showDisplayName(name) {
    profileName.textContent = name;
    profileTrigger.setAttribute('aria-label', name + ' profile menu');
    displayNameInput.value = name;
}

let displayName = defaultDisplayName;
try {
    displayName = localStorage.getItem(displayNameKey) || defaultDisplayName;
} catch {
    // Use the default name when storage is unavailable.
}
showDisplayName(displayName);

document.querySelector('#profile-form').addEventListener('submit', event => {
    event.preventDefault();
    const name = displayNameInput.value.trim();
    if (!name) {
        profileSaveStatus.textContent = 'Enter a display name.';
        displayNameInput.focus();
        return;
    }
    showDisplayName(name);
    try {
        localStorage.setItem(displayNameKey, name);
        profileSaveStatus.textContent = 'Display name saved.';
    } catch {
        profileSaveStatus.textContent = 'Display name updated for this visit.';
    }
});

document.addEventListener('rems:section', event => {
    if (event.detail !== 'Settings') return;
    displayNameInput.value = profileName.textContent;
    profileSaveStatus.textContent = '';
    document.querySelector('#settings-title').focus();
});
document.querySelector('#settings-back').addEventListener('click', () => showSection(previousAdminPage));
for (const selector of ['#profile-logout', '#settings-logout']) {
    document.querySelector(selector).addEventListener('click', () => {
        profileMenu.open = false;
        document.querySelector('#logout').click();
    });
}
