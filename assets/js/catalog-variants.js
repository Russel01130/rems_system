/* Shared catalog grouping and rendering used by Staff POS and the customer shop. Cart actions keep the selected variant’s own ID. */

// Groups variants with the same product name and category while preserving each variant ID, stock and price.
function groupCatalogVariants(variants, matches, selections) {
    const groups = new Map();
    for (const variant of variants) {
        const key = JSON.stringify([variant.name.trim().toLowerCase(), variant.category.trim().toLowerCase()]);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(variant);
    }
    const visible = [];
    for (const [key, options] of groups) {
        const matching = options.filter(matches);
        if (!matching.length) continue;
        const selected = matching.find(variant => variant.id === selections.get(key)) ??
            matching.find(variant => variant.stock > 0) ?? matching[0];
        visible.push({ key, options, selected });
    }
    return visible;
}

// Creates one listing for a group of sizes and sends the chosen variant ID to the caller’s cart action.
function catalogVariantCard(group, { selections, formatPrice, picture, stockText, canAdd, addVariant }) {
    const card = document.createElement('article');
    card.className = 'catalog-item';
    const info = document.createElement('div');
    info.className = 'catalog-info';
    const title = document.createElement('h2');
    title.textContent = group.selected.name;
    const price = document.createElement('strong');
    const stock = document.createElement('span');
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'add-to-cart';
    add.textContent = '+';
    let variant = group.selected;
    let image = picture(variant);
    card.append(image, info);
    info.append(title);

    // Refreshes the displayed variant price, stock, cart availability and accessible add-button label.
    function updateDetails() {
        price.textContent = formatPrice(variant.price);
        stock.textContent = stockText(variant.stock);
        stock.className = !variant.stock || variant.lowStock ? 'stock-warning' : 'stock-ready';
        add.dataset.productId = variant.id;
        add.setAttribute('aria-label', 'Add ' + variant.label + ' to cart');
        add.disabled = !canAdd(variant);
    }

    if (group.options.length > 1) {
        const picker = document.createElement('label');
        picker.className = 'retail-select-picker';
        const label = document.createElement('span');
        label.textContent = 'Unit';
        const unit = document.createElement('select');
        unit.setAttribute('aria-label', 'Unit for ' + variant.name);
        unit.replaceChildren(...group.options.map(option => new Option(option.unit || 'Standard', option.id)));
        unit.value = variant.id;
        unit.addEventListener('change', () => {
            variant = group.options.find(option => option.id === unit.value);
            selections.set(group.key, variant.id);
            const nextImage = picture(variant);
            image.replaceWith(nextImage);
            image = nextImage;
            updateDetails();
        });
        picker.append(label, unit);
        info.append(picker);
    } else if (variant.unit) {
        const unit = document.createElement('span');
        unit.className = 'catalog-unit-label';
        unit.textContent = variant.unit;
        info.append(unit);
    }
    add.addEventListener('click', () => addVariant(variant.id));
    info.append(price, stock, add);
    updateDetails();
    return card;
}
