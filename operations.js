const operationKey = 'rems-demo-operations';
const shopKey = 'rems-demo-shop';
const scheduleName = 'Grooming & Pet Hotel';
const staffName = 'User Management';
const serviceTypes = ['Grooming', 'Pet Hotel Check-in'];
const bookingStatuses = ['Scheduled', 'Completed', 'Cancelled'];
const staffRoles = ['Administrator', 'Manager', 'Staff'];
const sections = {
    Pets: {
        title: 'Pets',
        description: 'Find pet profiles, owners, and care notes.',
        noun: 'Pet',
        search: 'Search by pet, owner, or breed',
        filter: 'Species',
        seed: [['Charlie', 'Keith Heart', 'Dog'], ['Phoebe', 'Maria Angel', 'Dog']],
        fields: [
            { label: 'Pet name' },
            { label: 'Owner', options: () => records.Customers.map(([name]) => name), placeholder: 'Choose an owner' },
            { label: 'Species', suggestions: ['Dog', 'Cat', 'Bird', 'Rabbit', 'Other'] },
            { label: 'Breed', optional: true },
            { label: 'Care notes', type: 'textarea', optional: true }
        ]
    },
    [scheduleName]: {
        title: scheduleName,
        description: 'Schedule visits and track their status.',
        noun: 'Appointment',
        search: 'Search by pet, owner, or service',
        filter: 'Status',
        columns: ['Pet & owner', 'Service', 'Date & time', 'Status'],
        seed: [['Charlie', 'Grooming', '2026-11-23', '10:30'], ['Phoebe', 'Pet Hotel Check-in', '2026-11-23', '13:00']],
        fields: [
            { label: 'Pet name', suggestions: () => records.Pets.map(([name]) => name), placeholder: 'Type a registered pet name' },
            { label: 'Service', options: () => serviceTypes },
            { label: 'Date', type: 'date', initial: () => localDate() },
            { label: 'Time', type: 'time' },
            { label: 'Status', options: () => bookingStatuses },
            { label: 'Appointment notes', type: 'textarea', optional: true }
        ]
    },
    Reports: {
        title: 'Sales Reports',
        description: 'Review completed sales and download transactions for a selected period.',
        search: 'Search by transaction, customer, or product',
        columns: ['Transaction', 'Customer', 'Date', 'Sale details', 'Amount'],
        seed: []
    },
    [staffName]: {
        title: staffName,
        description: 'Manage your staff roster, contact details, and assigned roles.',
        noun: 'Staff Member',
        search: 'Search by name, email, or role',
        filter: 'Role',
        columns: ['Staff member', 'Role', 'Status'],
        seed: [['Administrator', 'Administrator']],
        fields: [
            { label: 'Staff name' },
            { label: 'Role', options: () => staffRoles },
            { label: 'Email', type: 'email', optional: true },
            { label: 'Status', options: () => ['Active', 'Inactive'] }
        ]
    },
    Customers: {
        seed: [['Keith Heart', ''], ['Maria Angel', ''], ['Elisha Mei', '']]
    }
};
let records = Object.fromEntries(Object.entries(sections).map(([name, config]) => [name, config.seed]));
records.Reports = [
    ['#TRX-1024', 'Keith Heart', '2026-11-23', 'Existing sale', 1250],
    ['#TRX-1023', 'Maria Angel', '2026-11-23', 'Existing sale', 850],
    ['#TRX-1022', 'Elisha Mei', '2026-11-22', 'Existing sale', 430]
];
try {
    records = { ...records, ...JSON.parse(localStorage.getItem(operationKey)) };
    const saved = JSON.parse(localStorage.getItem(shopKey));
    if (saved && Array.isArray(saved.products)) {
        products = saved.products;
        records = { ...records, ...saved.records };
    }
} catch {
    // Start with the sample records if browser storage cannot be read.
}



const pesos = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
const dateFormat = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' });
const localDate = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Manila' });

async function storeShop(nextProducts, nextRecords) {
    await saveSharedShop(nextProducts, nextRecords);
}

function storeRecords(name, entries) {
    return storeShop(products, { ...records, [name]: entries });
}

// Work with Manila calendar dates. UTC arithmetic keeps date-only values stable.
function salesPeriodStart(period, today) {
    if (period === 'month') return today.slice(0, 7) + '-01';
    if (period !== 'week') return today;
    const monday = new Date(today + 'T00:00:00Z');
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
    return monday.toISOString().slice(0, 10);
}

function salesRevenue(entries) {
    return entries.reduce((sum, entry) => sum + Math.round(Number(entry[4]) * 100), 0) / 100;
}

function saleInRange(entry, from, to) {
    return (!from || entry[2] >= from) && (!to || entry[2] <= to);
}

function renderDashboardSales(today) {
    document.querySelectorAll('[data-sales-period]').forEach(card => {
        const start = salesPeriodStart(card.dataset.salesPeriod, today);
        const entries = records.Reports.filter(entry => saleInRange(entry, start, today));
        card.querySelector('strong').textContent = pesos(salesRevenue(entries));
        const dates = start === today ? formatDay(today) : formatDay(start) + ' – ' + formatDay(today);
        card.querySelector('small').textContent = dates + ' · ' + entries.length + (entries.length === 1 ? ' sale' : ' sales');
    });
}

function refreshDashboard() {
    const dashboard = document.querySelector('#dashboard');
    const low = products.filter(product => product[3] > 0 && product[3] <= 5).sort((a, b) => a[3] - b[3]);
    const today = localDate();
    renderDashboardSales(today);
    const totals = [products.length, low.length, records.Customers.length];
    dashboard.querySelectorAll('.dashboard-business .stat strong').forEach((item, index) => {
        item.textContent = totals[index];
    });
    document.querySelectorAll('#inventory .stat strong').forEach((item, index) => {
        item.textContent = [products.length, low.length, products.filter(product => product[3] === 0).length][index];
    });
    const recent = dashboard.querySelector('.recent tbody');
    recent?.replaceChildren();
    if (recent) records.Reports.slice(0, 3).forEach(([id, customer, date, , amount]) => {
        const row = recent.insertRow();
        [id, customer, date === today ? 'Today' : dateFormat.format(new Date(date + 'T12:00')), pesos(amount)].forEach(value => appendCell(row, value));
        const badge = document.createElement('span');
        badge.className = 'complete';
        badge.textContent = '✓ Completed';
        appendCell(row, '').append(badge);
    });
    const lowPanel = dashboard.querySelector('.low');
    lowPanel.querySelectorAll('.low-row').forEach(row => row.remove());
    low.slice(0, 3).forEach(([name, , , stock, icon, photo]) => {
        const row = document.createElement('div');
        row.className = 'low-row';
        const thumb = document.createElement('span');
        thumb.className = 'product-image';
        showRecordPhoto(thumb, photo, icon);
        const count = document.createElement('strong');
        count.textContent = stock + ' left';
        row.append(thumb, name, count);
        lowPanel.append(row);
    });
    if (!low.length) {
        const empty = document.createElement('p');
        empty.className = 'low-row';
        empty.textContent = 'No low-stock products.';
        lowPanel.append(empty);
    }
    const schedule = dashboard.querySelector('.schedule');
    schedule.replaceChildren();
    const upcoming = records['Grooming & Pet Hotel'].filter(([, , date, , status]) => date >= today && (!status || status === 'Scheduled'))
        .sort((a, b) => (a[2] + a[3]).localeCompare(b[2] + b[3])).slice(0, 3);
    for (const [pet, service, date, time] of upcoming) {
        const row = document.createElement('div');
        for (const value of [pet, service, dateFormat.format(new Date(date + 'T12:00')), time]) {
            const text = document.createElement('span');
            text.textContent = value;
            if (row.children.length === 0) {
                text.classList.add('schedule-pet');
                const picture = document.createElement('span');
                picture.className = 'dashboard-pet-picture';
                picture.setAttribute('aria-hidden', 'true');
                showRecordPhoto(picture, records.Pets.find(([name]) => name === pet)?.[5], '🐾');
                text.prepend(picture);
            }
            row.append(text);
        }
        schedule.append(row);
    }
    if (!upcoming.length) {
        const empty = document.createElement('div');
        empty.textContent = 'No upcoming services.';
        schedule.append(empty);
    }
}



const operations = document.querySelector('#operations');
const operationForm = document.querySelector('#operations-form');
const operationDialog = document.querySelector('#operation-dialog');
const operationSearch = document.querySelector('#operation-search');
const operationFilter = document.querySelector('#operation-filter');
const operationAction = document.querySelector('#operation-action');
const operationMessage = document.querySelector('#operations-message');
const operationError = document.querySelector('#operation-error');
const reportPeriod = document.querySelector('#report-period');
const reportFrom = document.querySelector('#report-from');
const reportTo = document.querySelector('#report-to');
const operationPageSize = 6;
let activeOperation = '';
let operationPage = 1;
let editingRecord = -1;

const initialValue = field => field.initial?.() ?? (field.placeholder ? '' : field.options?.()[0] ?? '');
const formatDay = date => dateFormat.format(new Date(date + 'T12:00'));
const petOwner = name => records.Pets.find(([pet]) => pet === name)?.[1] || '';

function operationStatus(entry) {
    return entry[activeOperation === scheduleName ? 4 : 3] || (activeOperation === scheduleName ? 'Scheduled' : 'Active');
}

function filteredOperations() {
    const query = operationSearch.value.trim().toLowerCase();
    return records[activeOperation].map((entry, index) => ({ entry, index })).filter(({ entry }) => {
        const searchValues = activeOperation === scheduleName ? [...entry, petOwner(entry[0])] : activeOperation === 'Pets' ? entry.slice(0, 5) : entry;
        if (query && !searchValues.some(value => String(value ?? '').toLowerCase().includes(query))) return false;
        if (activeOperation === 'Reports') {
            return saleInRange(entry, reportFrom.value, reportTo.value);
        }
        if (!operationFilter.value) return true;
        const value = activeOperation === 'Pets' ? entry[2] : activeOperation === staffName ? entry[1] : operationStatus(entry);
        return value.toLowerCase() === operationFilter.value.toLowerCase();
    }).sort(({ entry: left }, { entry: right }) => {
        if (activeOperation === scheduleName) return (left[2] + left[3]).localeCompare(right[2] + right[3]);
        if (activeOperation === 'Reports') return right[2].localeCompare(left[2]);
        return left[0].localeCompare(right[0]);
    });
}

function renderOperationFilter() {
    const previous = operationFilter.value;
    const species = [...new Map(records.Pets.map(entry => [entry[2].toLowerCase(), entry[2]])).values()].sort();
    const options = activeOperation === 'Pets' ? species : activeOperation === staffName ? staffRoles : bookingStatuses;
    operationFilter.replaceChildren(new Option('All ' + ({ Pets: 'species', [staffName]: 'roles' }[activeOperation] ?? 'statuses'), ''),
        ...options.map(value => new Option(value, value)));
    operationFilter.value = options.includes(previous) ? previous : '';
}

function renderOperationStats(matches) {
    const all = records[activeOperation];
    const today = localDate();
    let stats;
    if (activeOperation === 'Pets') {
        stats = [['Registered pets', all.length], ['Pet owners', new Set(all.map(entry => entry[1])).size]];
    } else if (activeOperation === scheduleName) {
        const scheduled = all.filter(entry => operationStatus(entry) === 'Scheduled');
        stats = [['Scheduled today', scheduled.filter(entry => entry[2] === today).length],
            ['Upcoming', scheduled.filter(entry => entry[2] >= today).length],
            ['Completed', all.filter(entry => operationStatus(entry) === 'Completed').length]];
    } else if (activeOperation === 'Reports') {
        const revenue = salesRevenue(matches.map(({ entry }) => entry));
        stats = [['Sales in view', matches.length], ['Sales total', pesos(revenue)], ['Average sale', pesos(matches.length ? revenue / matches.length : 0)]];
    } else {
        stats = [['Staff members', all.length], ['Active staff', all.filter(entry => operationStatus(entry) === 'Active').length]];
    }
    retail('#operation-stats').replaceChildren(...stats.map(([label, value]) => {
        const card = retailNode('article', 'operation-stat');
        card.append(retailNode('span', '', label), retailNode('strong', '', value));
        return card;
    }));
}

function operationActions(index) {
    const actions = retailNode('div', 'operation-actions');
    actions.append(retailButton('View', () => openOperation('view', index), 'plain'),
        ...((isStaff && activeOperation === scheduleName) ? [] : [retailButton(isStaff ? 'Request edit' : 'Edit', () => openOperation('edit', index), 'plain')]));
    return actions;
}

function renderPetCards(entries) {
    const cards = retail('#operations-cards');
    cards.replaceChildren();
    for (const { entry: [name, owner, species, breed, , photo], index } of entries) {
        const card = retailNode('article', 'pet-card');
        const header = retailNode('div', 'pet-card-header');
        const icon = retailNode('span', 'pet-icon', { dog: '🐶', cat: '🐱', rabbit: '🐰', bird: '🐦' }[species.toLowerCase()] ?? '🐾');
        icon.setAttribute('aria-hidden', 'true');
        showRecordPhoto(icon, photo, icon.textContent);
        const identity = retailNode('div');
        identity.append(retailNode('h2', '', name), retailNode('p', '', breed ? species + ' · ' + breed : species));
        header.append(icon, identity);
        const ownerLine = retailNode('p', 'pet-owner');
        ownerLine.append(retailNode('span', '', 'Owner'), retailNode('strong', '', owner));
        card.append(header, ownerLine, operationActions(index));
        cards.append(card);
    }
}

function renderOperationTable(entries, config) {
    const head = retail('#operations-head');
    const rows = retail('#operations-rows');
    head.replaceChildren();
    rows.replaceChildren();
    const headers = head.insertRow();
    const isReport = activeOperation === 'Reports';
    for (const label of isReport ? config.columns : [...config.columns, 'Actions']) {
        const column = retailNode('th', '', label);
        column.scope = 'col';
        headers.append(column);
    }
    for (const { entry, index } of entries) {
        const row = rows.insertRow();
        if (isReport) {
            const [id, customer, date, details, total] = entry;
            [id, customer, formatDay(date), details, pesos(total)].forEach(value => appendCell(row, value));
            continue;
        }
        const identity = appendCell(row, '', 'operation-identity');
        identity.append(retailNode('strong', '', entry[0]));
        const secondary = activeOperation === scheduleName ? petOwner(entry[0]) : entry[2];
        if (secondary) identity.append(retailNode('small', '', secondary));
        appendCell(row, entry[1]);
        if (activeOperation === scheduleName) {
            const date = appendCell(row, formatDay(entry[2]), 'operation-identity');
            date.append(retailNode('small', '', entry[3]));
        }
        const status = operationStatus(entry);
        appendCell(row, '').append(retailNode('span', 'operation-badge ' + status.toLowerCase(), status));
        appendCell(row, '').append(operationActions(index));
    }
}

let salesGroup = 'day';
const salesChartLabels = { day: 'days', week: 'weeks', month: 'months' };
const salesAxisDate = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const salesAxisMonth = new Intl.DateTimeFormat('en-PH', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const salesAxisMoney = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', notation: 'compact', maximumFractionDigits: 1 });
const utcSaleDate = date => new Date(date + 'T00:00:00Z');

function trendBucket(date, group) {
    return group === 'day' ? date : salesPeriodStart(group, date);
}

function shiftTrendBucket(date, group, count) {
    const shifted = utcSaleDate(date);
    if (group === 'month') shifted.setUTCMonth(shifted.getUTCMonth() + count);
    else shifted.setUTCDate(shifted.getUTCDate() + count * (group === 'week' ? 7 : 1));
    return shifted.toISOString().slice(0, 10);
}

function salesTrendSeries(entries, group, from, to) {
    const count = group === 'day' ? 14 : 12;
    const lastDate = to || entries.reduce((latest, entry) => entry[2] > latest ? entry[2] : latest, '') || localDate();
    if (from && from > lastDate) return [];
    const last = trendBucket(lastDate, group);
    const first = from ? trendBucket(from, group) : '';
    const totals = new Map();
    for (const entry of entries) {
        const key = trendBucket(entry[2], group);
        totals.set(key, (totals.get(key) ?? 0) + Math.round(Number(entry[4]) * 100));
    }
    return Array.from({ length: count }, (_, index) => shiftTrendBucket(last, group, index + 1 - count))
        .filter(date => date >= first)
        .map(date => ({ date, amount: (totals.get(date) ?? 0) / 100 }));
}

function chartElement(tag, attributes, value) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [name, setting] of Object.entries(attributes)) element.setAttribute(name, setting);
    if (value !== undefined) element.textContent = value;
    return element;
}

function renderSalesTrend(matches) {
    const entries = matches.map(({ entry }) => entry);
    const series = salesTrendSeries(entries, salesGroup, reportFrom.value, reportTo.value);
    const chart = retail('#sales-chart');
    const detail = retail('#sales-chart-point');
    const range = retail('#sales-chart-range');
    detail.textContent = '';
    const limit = salesGroup === 'day' ? 14 : 12;
    range.textContent = 'Latest ' + limit + ' ' + salesChartLabels[salesGroup] + ' in the selected date range.';
    if (!series.length || !entries.length) {
        chart.replaceChildren(retailNode('p', 'sales-trend-empty', 'No sales in this view.'));
        return;
    }

    const peak = Math.max(1, ...series.map(point => point.amount));
    const power = 10 ** Math.floor(Math.log10(peak));
    const ceiling = Math.ceil(peak / power * 2) * power / 2;
    const width = 680;
    const height = 235;
    const left = 62;
    const right = 652;
    const top = 18;
    const bottom = 190;
    const x = index => series.length === 1 ? (left + right) / 2 : left + (right - left) * index / (series.length - 1);
    const y = amount => bottom - (bottom - top) * Math.max(0, amount) / ceiling;
    const svg = chartElement('svg', { viewBox: '0 0 ' + width + ' ' + height, role: 'group', 'aria-label': 'Sales by ' + salesGroup });
    for (let tick = 0; tick <= 4; tick++) {
        const amount = ceiling * tick / 4;
        const position = y(amount);
        svg.append(chartElement('line', { x1: left, x2: right, y1: position, y2: position, class: 'sales-gridline' }),
            chartElement('text', { x: left - 8, y: position + 4, 'text-anchor': 'end' }, salesAxisMoney.format(amount)));
    }
    const points = series.map(({ amount }, index) => x(index) + ',' + y(amount)).join(' ');
    svg.append(chartElement('polyline', { points, class: 'sales-chart-line' }));
    const labelStep = Math.max(1, Math.ceil((series.length - 1) / 5));
    series.forEach(({ date, amount }, index) => {
        const dateLabel = salesGroup === 'month' ? salesAxisMonth.format(utcSaleDate(date)) : salesAxisDate.format(utcSaleDate(date));
        if (index === 0 || index === series.length - 1 || (index % labelStep === 0 && index < series.length - 1 - labelStep / 2)) {
            svg.append(chartElement('text', { x: x(index), y: bottom + 25, 'text-anchor': 'middle' }, dateLabel));
        }
        const label = (salesGroup === 'week' ? 'Week of ' : '') + formatDay(date) + ' · ' + pesos(amount);
        const marker = chartElement('circle', { cx: x(index), cy: y(amount), r: 5, tabindex: 0, 'aria-label': label, class: 'sales-chart-marker' });
        marker.append(chartElement('title', {}, label));
        for (const event of ['focus', 'pointerenter', 'click']) marker.addEventListener(event, () => { detail.textContent = label; });
        svg.append(marker);
    });
    chart.replaceChildren(svg);
}

document.querySelectorAll('[data-sales-group]').forEach(button => {
    button.addEventListener('click', () => {
        salesGroup = button.dataset.salesGroup;
        for (const option of button.parentElement.children) option.setAttribute('aria-pressed', option === button);
        renderSalesTrend(filteredOperations());
    });
});

function renderOperation() {
    const config = sections[activeOperation];
    const results = filteredOperations();
    const totalPages = Math.max(1, Math.ceil(results.length / operationPageSize));
    operationPage = Math.min(operationPage, totalPages);
    const start = (operationPage - 1) * operationPageSize;
    const pageEntries = results.slice(start, start + operationPageSize);
    const cards = retail('#operations-cards');
    const table = retail('#operations-table');
    cards.hidden = Boolean(pageEntries.length && activeOperation !== 'Pets');
    table.hidden = !pageEntries.length || activeOperation === 'Pets';
    if (!pageEntries.length) {
        const hasRecords = records[activeOperation].length > 0;
        cards.replaceChildren(retailNode('p', 'operation-empty', hasRecords ? 'No records match these filters.' : 'No records yet.'));
    } else if (activeOperation === 'Pets') renderPetCards(pageEntries);
    else renderOperationTable(pageEntries, config);
    renderOperationStats(results);
    if (activeOperation === 'Reports') renderSalesTrend(results);
    const invalidDates = activeOperation === 'Reports' && reportFrom.value && reportTo.value && reportFrom.value > reportTo.value;
    reportTo.setCustomValidity(invalidDates ? 'Choose an end date on or after the start date.' : '');
    if (activeOperation === 'Reports') operationAction.disabled = !results.length || invalidDates;
    const count = retail('#operation-count');
    count.textContent = invalidDates ? 'Choose an end date on or after the start date.' : results.length
        ? 'Showing ' + (start + 1) + '–' + Math.min(start + operationPageSize, results.length) + ' of ' + results.length
        : 'Showing 0 records';
    retail('#operation-pages').hidden = totalPages === 1;
    retailPages('#operation-pages', operationPage, totalPages, next => {
        operationPage = next;
        renderOperation();
    });
    retail('#operation-reset').hidden = !(operationSearch.value || operationFilter.value || reportFrom.value || reportTo.value);
}

let petPhoto = '';
let pendingPetPhoto;

function petPhotoField(photo, view) {
    const block = retailNode('div', 'operation-wide pet-photo-field');
    petPhoto = photo;
    pendingPetPhoto = undefined;
    const preview = retailNode('span', 'pet-photo-preview');
    const remove = retailButton('Remove picture', () => {
        pendingPetPhoto = undefined;
        petPhoto = '';
        input.value = '';
        operationError.textContent = '';
        updatePreview();
    }, 'link');
    const updatePreview = () => {
        showRecordPhoto(preview, petPhoto, '');
        preview.hidden = !petPhoto;
        remove.hidden = view || !petPhoto;
    };
    const input = retailNode('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/gif';
    input.addEventListener('change', async () => {
        if (!input.files[0]) return;
        operationError.textContent = '';
        const loading = prepareRecordPhoto(input.files[0]);
        pendingPetPhoto = loading;
        try {
            const picture = await loading;
            if (pendingPetPhoto !== loading || !operationDialog.open) return;
            petPhoto = picture;
            updatePreview();
        } catch (error) {
            if (pendingPetPhoto !== loading || !operationDialog.open) return;
            input.value = '';
            operationError.textContent = error instanceof DOMException ? 'This picture could not be opened.' : error.message;
        } finally {
            if (pendingPetPhoto === loading) pendingPetPhoto = undefined;
        }
    });
    if (!view) {
        const label = retailNode('label', '', 'Pet picture (optional)');
        label.append(input);
        block.append(label);
    }
    block.append(preview, remove);
    updatePreview();
    return block;
}

function openOperation(mode, index = -1) {
    const config = sections[activeOperation];
    const entry = records[activeOperation][index];
    if (isStaff && activeOperation === scheduleName && mode !== 'view') return;
    const view = mode === 'view';
    editingRecord = index;
    retail('#operation-dialog-title').textContent = { view: 'View ', edit: 'Edit ', add: 'Add ' }[mode] + config.noun;
    operationError.textContent = '';
    const fields = config.fields.map((field, position) => {
        const wrapper = retailNode('label', field.type === 'textarea' ? 'operation-wide' : '', field.label + (field.optional ? ' (optional)' : ''));
        const value = entry?.[position] ?? (entry && field.optional ? '' : initialValue(field));
        const control = document.createElement(field.options ? 'select' : field.type === 'textarea' ? 'textarea' : 'input');
        control.name = 'operation-' + position;
        control.disabled = view;
        control.required = !field.optional;
        if (field.options) {
            const options = field.options();
            if (field.placeholder) control.add(new Option(field.placeholder, ''));
            for (const item of options) control.add(new Option(item, item));
            if (value && !options.includes(value)) control.add(new Option(value, value));
        } else if (field.type === 'textarea') {
            control.rows = 3;
            control.maxLength = 500;
        } else {
            control.type = field.type ?? 'text';
            if (control.type === 'text') control.maxLength = 100;
        }
        if (!field.options && field.placeholder) control.placeholder = field.placeholder;
        control.value = value;
        wrapper.append(control);
        if (field.suggestions) {
            const list = retailNode('datalist');
            list.id = 'operation-suggestions-' + position;
            const suggestions = typeof field.suggestions === 'function' ? field.suggestions() : field.suggestions;
            list.append(...suggestions.map(item => new Option(item, item)));
            control.setAttribute('list', list.id);
            wrapper.append(list);
        }
        return wrapper;
    });
    if (activeOperation === 'Pets') fields.push(petPhotoField(entry?.[5] ?? '', view));
    retail('#operation-fields').replaceChildren(...fields);
    retail('#save-operation').hidden = view;
    retail('#save-operation').textContent = isStaff ? 'Send for Approval' : 'Save';
    retail('#remove-operation').textContent = isStaff ? 'Request removal' : 'Remove';
    retail('#remove-operation').hidden = mode !== 'edit';
    operationDialog.showModal();
}

operationForm.addEventListener('submit', async event => {
    event.preventDefault();
    const config = sections[activeOperation];
    const data = new FormData(operationForm);
    const values = config.fields.map((_, index) => String(data.get('operation-' + index) ?? '').trim());
    if (config.fields.some((field, index) => !field.optional && !values[index])) {
        operationError.textContent = 'Complete the required fields.';
        return;
    }
    const entries = records[activeOperation];
    const existing = entries[editingRecord];
    if (activeOperation === 'Pets' && entries.some(([name], index) => index !== editingRecord && name.toLowerCase() === values[0].toLowerCase())) {
        operationError.textContent = 'Use a distinct pet name so appointments can identify the correct pet.';
        return;
    }
    if (activeOperation === 'Pets') {
        if (pendingPetPhoto) {
            operationError.textContent = 'Wait for the picture preview before saving.';
            return;
        }
        if (!records.Customers.some(([name]) => name === values[1]) && existing?.[1] !== values[1]) {
            operationError.textContent = 'Choose a registered owner.';
            return;
        }
        values.push(petPhoto);
    }
    if (activeOperation === scheduleName) {
        const pet = records.Pets.find(([name]) => name.toLowerCase() === values[0].toLowerCase());
        if (!pet) {
            operationError.textContent = 'Type the name of a registered pet or choose one from the suggestions.';
            return;
        }
        values[0] = pet[0];
        const changedSlot = !existing || existing[2] !== values[2] || existing[3] !== values[3];
        const manilaTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
        if (changedSlot && values[4] === 'Scheduled' && (values[2] + values[3]) < (localDate() + manilaTime)) {
            operationError.textContent = 'Choose a date and time that has not already passed.';
            return;
        }
    }
    if (activeOperation === staffName && values[2] && entries.some((entry, index) =>
        index !== editingRecord && entry[2]?.toLowerCase() === values[2].toLowerCase())) {
        operationError.textContent = 'That email is already assigned to a staff member.';
        return;
    }
    if (activeOperation === scheduleName && values[4] !== 'Cancelled' && entries.some((entry, index) =>
        index !== editingRecord && entry[4] !== 'Cancelled' && entry[0] === values[0] && entry[2] === values[2] && entry[3] === values[3])) {
        operationError.textContent = 'This pet already has an appointment at that date and time.';
        return;
    }
    if (isStaff) {
        if (activeOperation !== 'Pets') return;
        try {
            await sendShopRequest(existing ? 'pet_edit' : 'pet_add', { before: existing, entry: values });
            operationDialog.close();
            showSection('Requests');
        } catch (error) { operationError.textContent = error.message; }
        return;
    }
    if (activeOperation === scheduleName && existing?.length > 6) values.push(...existing.slice(6));
    const next = [...entries];
    if (editingRecord < 0) next.unshift(values);
    else next[editingRecord] = values;
    const nextRecords = { ...records, [activeOperation]: next };
    if (activeOperation === 'Pets' && existing && values[0] !== existing[0]) {
        nextRecords[scheduleName] = records[scheduleName].map(entry => entry[0] === existing[0] ? [values[0], ...entry.slice(1)] : entry);
    }
    try {
        await storeShop(products, nextRecords);
    } catch (error) {
        operationError.textContent = error.message;
        return;
    }
    operationDialog.close();
    renderOperationFilter();
    renderOperation();
    refreshDashboard();
    operationMessage.textContent = config.noun + ' saved.';
});


document.querySelector('#remove-operation').addEventListener('click', async () => {
    const entries = records[activeOperation];
    const entry = entries[editingRecord];
    if (!entry) return;
    if (activeOperation === 'Pets' && records[scheduleName].some(([pet]) => pet === entry[0])) {
        operationError.textContent = 'This pet has linked appointments. Remove those appointments before removing the pet.';
        return;
    }
    if (isStaff) {
        if (activeOperation !== 'Pets') return;
        try {
            await sendShopRequest('pet_remove', { before: entry });
            operationDialog.close();
            showSection('Requests');
        } catch (error) { operationError.textContent = error.message; }
        return;
    }
    if (!window.confirm('Remove ' + entry[0] + ' from ' + sections[activeOperation].title + '?')) return;
    try {
        await storeRecords(activeOperation, entries.filter((_, index) => index !== editingRecord));
    } catch {
        operationError.textContent = 'The record could not be removed. Check browser storage.';
        return;
    }
    operationDialog.close();
    renderOperationFilter();
    renderOperation();
    refreshDashboard();
    operationMessage.textContent = sections[activeOperation].noun + ' removed.';
});

function exportSales() {
    const rows = [sections.Reports.columns, ...filteredOperations().map(({ entry }) => entry)];
    const csv = rows.map(row => row.map(value => {
        let cell = String(value ?? '');
        if (typeof value === 'string' && /^[\s]*[=+@\-\t\r\n]/.test(cell)) cell = "'" + cell;
        return '"' + cell.replaceAll('"', '""') + '"';
    }).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const download = document.createElement('a');
    download.href = url;
    download.download = 'rems-sales-' + localDate() + '.csv';
    download.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    operationMessage.textContent = 'Sales CSV downloaded.';
}

function resetOperations() {
    operationSearch.value = '';
    operationFilter.value = '';
    reportPeriod.value = 'all';
    reportFrom.value = '';
    reportTo.value = '';
    operationPage = 1;
}

operationAction.addEventListener('click', () => {
    if (activeOperation === 'Reports') exportSales();
    else if (activeOperation === scheduleName && !records.Pets.length) operationMessage.textContent = 'Add a pet on the Pets page before scheduling an appointment.';
    else if (activeOperation === 'Pets' && !records.Customers.length) operationMessage.textContent = 'Add an owner on the Customers page before adding a pet.';
    else openOperation('add');
});
function applySalesPeriod(period) {
    if (period === 'custom') {
        reportFrom.focus();
        return;
    }
    const today = localDate();
    if (['today', 'week', 'month'].includes(period)) {
        salesGroup = { today: 'day', week: 'day', month: 'week' }[period];
        document.querySelectorAll('[data-sales-group]').forEach(button => {
            button.setAttribute('aria-pressed', button.dataset.salesGroup === salesGroup);
        });
    }
    reportPeriod.value = period;
    reportFrom.value = period === 'all' ? '' : salesPeriodStart(period, today);
    reportTo.value = period === 'all' ? '' : today;
    operationPage = 1;
    renderOperation();
}

reportPeriod.addEventListener('change', () => applySalesPeriod(reportPeriod.value));
document.querySelectorAll('[data-sales-period]').forEach(card => {
    card.addEventListener('click', () => applySalesPeriod(card.dataset.salesPeriod));
});
for (const field of [operationSearch, operationFilter, reportFrom, reportTo]) {
    field.addEventListener('input', () => {
        if (field === reportFrom || field === reportTo) reportPeriod.value = reportFrom.value || reportTo.value ? 'custom' : 'all';
        operationPage = 1;
        renderOperation();
    });
}
document.querySelector('#operation-reset').addEventListener('click', () => {
    resetOperations();
    renderOperation();
    operationSearch.focus();
});

document.addEventListener('rems:section', event => {
    refreshDashboard();
    if (operations.hidden) return;
    activeOperation = event.detail;
    const config = sections[activeOperation];
    const report = activeOperation === 'Reports';
    resetOperations();
    operationMessage.textContent = '';
    retail('#operations-title').textContent = config.title;
    retail('#operations-intro').textContent = config.description;
    operationAction.textContent = report ? 'Export CSV' : '+ ' + (activeOperation === scheduleName ? 'Schedule Appointment' : 'Add ' + config.noun);
    operationAction.hidden = isStaff && activeOperation === scheduleName;
    if (isStaff && activeOperation === 'Pets') operationAction.textContent = 'Request New Pet';
    operationAction.disabled = false;
    operationSearch.placeholder = config.search;
    operationSearch.setAttribute('aria-label', config.search);
    retail('#operation-filter-label').hidden = report;
    retail('#operation-filter-name').textContent = config.filter ?? '';
    retail('#report-dates').hidden = !report;
    retail('#report-trend').hidden = !report;
    if (!report) renderOperationFilter();
    renderOperation();
});
