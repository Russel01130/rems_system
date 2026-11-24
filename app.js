const admin = document.querySelector('#admin');
const productDialog = document.querySelector('#product-dialog');
const productForm = document.querySelector('#product-form');
const rows = document.querySelector('#product-rows');
const category = document.querySelector('#category');
const search = document.querySelector('#search');
const filter = document.querySelector('#filter');
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
let page = 1;
let productPhoto = '';
let pendingPhoto = null;
const photoPreview = document.querySelector('#product-photo-preview');
const photoField = productForm.elements.photo;
const photoError = document.querySelector('#product-error');
const removePhoto = document.querySelector('#remove-product-photo');

let previousAdminPage = 'Dashboard';

function showSection(name) {
    if (admin.dataset.role === 'staff' && ['Reports', 'User Management'].includes(name)) return;
    const currentPage = admin.dataset.page;
    if (name === 'Settings' && currentPage && currentPage !== 'Settings') previousAdminPage = currentPage;
    document.querySelector('#requests-page').hidden = name !== 'Requests';
    document.querySelector('#profile-settings').hidden = name !== 'Settings';
    document.querySelector('#dashboard').hidden = name !== 'Dashboard';
    document.querySelector('#inventory').hidden = name !== 'Inventory';
    document.querySelector('#operations').hidden = ['Dashboard', 'Inventory', 'Point of Sale', 'Customers', 'Settings', 'Requests'].includes(name);
    document.querySelector('#pos').hidden = name !== 'Point of Sale';
    document.querySelector('#customers-page').hidden = name !== 'Customers';
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

function renderProducts() {
    const query = search.value.trim().toLowerCase();
    const lowOnly = filter.getAttribute('aria-pressed') === 'true';
    const matching = products.map((product, index) => ({ product, index })).filter(({ product }) =>
        product[0].toLowerCase().includes(query) &&
        (!category.value || product[1] === category.value) &&
        (!lowOnly || (product[3] > 0 && product[3] <= 5))
    );
    const pageCount = Math.max(1, Math.ceil(matching.length / 5));
    page = Math.min(page, pageCount);
    const start = (page - 1) * 5;
    rows.replaceChildren();

    matching.slice(start, start + 5).forEach(({ product, index }) => {
        const [name, group, price, stock, icon] = product;
        const row = rows.insertRow();
        const nameCell = appendCell(row, '');
        const item = document.createElement('div');
        item.className = 'product-name';
        const thumbnail = document.createElement('span');
        thumbnail.className = 'product-image';
        thumbnail.textContent = icon;
        thumbnail.setAttribute('aria-hidden', 'true');
        showRecordPhoto(thumbnail, product[5], icon);
        item.append(thumbnail, name);
        nameCell.append(item);
        appendCell(row, group);
        appendCell(row, '₱' + Number(price).toFixed(2));
        const status = stock === 0 ? 'out' : stock <= 5 ? 'low' : 'in';
        appendCell(row, stock, 'stock-' + status);
        const badge = document.createElement('span');
        badge.className = 'status ' + status + '-stock';
        badge.textContent = '● ' + { out: 'Out of Stock', low: 'Low Stock', in: 'In Stock' }[status];
        appendCell(row, '').append(badge);
        const actions = appendCell(row, '');
        for (const [label, mode] of [['◉ View', 'view'], ['♢ Edit', 'edit']]) {
            const button = document.createElement('button');
            button.className = 'row-action';
            button.textContent = isStaff && mode === 'edit' ? 'Request edit' : label;
            button.addEventListener('click', () => openProduct(mode, index));
            actions.append(button);
        }
    });
    if (matching.length === 0) {
        appendCell(rows.insertRow(), 'No products found.').colSpan = 6;
    }
    document.querySelector('#product-count').textContent = matching.length
        ? 'Showing ' + (start + 1) + '–' + Math.min(start + 5, matching.length) + ' of ' + matching.length + ' demo products'
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

function resetPage() {
    page = 1;
    renderProducts();
}

search.addEventListener('input', resetPage);
category.addEventListener('change', resetPage);
filter.addEventListener('click', () => {
    filter.setAttribute('aria-pressed', filter.getAttribute('aria-pressed') !== 'true');
    resetPage();
});

function openProduct(mode, index = -1) {
    productIndex = index;
    const readOnly = mode === 'view';
    productForm.reset();
    pendingPhoto = null;
    photoError.textContent = '';
    productPhoto = products[index]?.[5] ?? '';
    document.querySelector('#product-photo-field').hidden = readOnly;
    updatePhotoPreview(readOnly);
    document.querySelector('#product-title').textContent = { add: 'Add Product', edit: 'Edit Product', view: 'Product Details' }[mode];
    productForm.elements.barcode.disabled = readOnly;
    productForm.elements.barcode.value = products[index]?.[7] ?? '';
    const keys = ['product', 'category', 'price', 'stock'];
    keys.forEach((key, position) => {
        const field = productForm.elements[key];
        field.disabled = readOnly;
        if (index >= 0) field.value = products[index][position];
    });
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
    const icon = products[productIndex]?.[4] ?? '📦';
    const group = data.get('category');
    const price = data.get('price');
    const stock = data.get('stock');
    if (!Array.from(productForm.elements.category.options).some(option => option.value === group) ||
        !validMoney(price) || !/^\d+$/.test(stock) || !Number.isSafeInteger(Number(stock))) {
        photoError.textContent = 'Choose a category and enter a valid price and whole stock quantity.';
        return;
    }
    if (products.some((entry, index) => index !== productIndex && entry[1] === group && entry[0].toLowerCase() === name.toLowerCase())) {
        photoError.textContent = 'A product with that name already exists in this category.';
        return;
    }
    const barcode = data.get('barcode').trim();
    if (barcode && products.some((entry, index) => index !== productIndex && entry[7] === barcode)) {
        photoError.textContent = 'That barcode is already assigned to a product.';
        return;
    }
    const product = [name, group, Number(price), Number(stock), icon, productPhoto, products[productIndex]?.[6] ?? newRetailId(), barcode];
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
    else resetPage();
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
