/* Administrator transaction and audit views. Local transaction rows and server-paginated audit results share rendering and export helpers. */

const historyPageSize = 15;
const historyTime = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });
const historyRoles = { admin: 'Administrator', staff: 'Staff', customer: 'Customer', super_admin: 'Super Admin', system: 'System' };
const transactionFilters = retail('#admin-transactions .history-filters');
const auditFilters = retail('#admin-audit .history-filters');
const auditMessage = retail('#audit-history-message');
let transactionPage = 1;
let auditRequest = 0;
let auditSearchTimer;

// Reads the currently selected search and filter values from a history form.
function historyValues(form) {
    return Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, value.trim()]));
}

// Gets visible table headers so details and export columns follow the page layout.
function historyColumns(key) {
    return [...retail('#admin-' + key + ' thead tr').cells].map(cell => cell.textContent);
}

// Renders history rows with text or prepared controls and adds a full-width empty result message.
function renderHistoryRows(key, entries, emptyMessage) {
    const rows = retail('#' + key + '-history-rows');
    rows.replaceChildren();
    for (const entry of entries) {
        const row = rows.insertRow();
        for (const value of entry) {
            const cell = appendCell(row, value instanceof Node ? '' : value ?? '—');
            if (value instanceof Node) cell.append(value);
        }
    }
    if (!entries.length) appendCell(rows.insertRow(), emptyMessage).colSpan = historyColumns(key).length;
}

// Builds pagination controls and describes the displayed result range.
function renderHistoryPages(key, page, pages, total, from, to, change) {
    const controls = retail('#' + key + '-history-pages');
    controls.replaceChildren();
    retail('#' + key + '-history-count').textContent = total ? 'Showing ' + from + '–' + to + ' of ' + total + ' records' : '0 records';
    if (pages <= 1) return;
    const previous = retailButton('‹', () => change(page - 1));
    previous.setAttribute('aria-label', 'Previous page');
    previous.disabled = page === 1;
    controls.append(previous);
    const first = Math.max(1, Math.min(page - 2, pages - 4));
    for (let number = first; number <= Math.min(pages, first + 4); number++) {
        const button = retailButton(String(number), () => change(number));
        if (number === page) button.setAttribute('aria-current', 'page');
        controls.append(button);
    }
    const next = retailButton('›', () => change(page + 1));
    next.setAttribute('aria-label', 'Next page');
    next.disabled = page === pages;
    controls.append(next);
}

// Slices an in-memory result set into one page and renders its rows and controls.
function renderHistoryList(key, entries, page, row, onPage) {
    const pages = Math.max(1, Math.ceil(entries.length / historyPageSize));
    const current = Math.min(page, pages);
    const start = (current - 1) * historyPageSize;
    const visible = entries.slice(start, start + historyPageSize);
    renderHistoryRows(key, visible.map(row), 'No matching records found.');
    renderHistoryPages(key, current, pages, entries.length, start + 1, start + visible.length, onPage);
    return current;
}

// Creates a status or type badge from a label and its visual category.
function historyBadge(label, type) {
    return retailNode('span', 'history-badge ' + type, label);
}

// Maps transaction and audit statuses to the badge colors used in their tables.
function historyStatus(label) {
    const moods = { Completed: 'success', Success: 'success', Scheduled: 'warning', Pending: 'warning',
        Warning: 'warning', Cancelled: 'critical', Critical: 'critical' };
    return historyBadge(label, moods[label] ?? '');
}

// Shows one record in the details dialog and wires up its optional PDF download.
function showHistoryDetails(title, columns, values, filename) {
    retail('#history-details-title').textContent = title;
    const fields = retail('#history-details-fields');
    fields.replaceChildren();
    columns.forEach((label, index) => fields.append(retailNode('dt', '', label), retailNode('dd', '', values[index] ?? '—')));
    const pdf = retail('#history-details-pdf');
    pdf.hidden = !filename;
    pdf.onclick = filename ? () => downloadReceiptPdf(title,
        columns.map((label, index) => label + ': ' + (values[index] ?? '—')).join('\n'), filename) : null;
    retail('#history-details-dialog').showModal();
}

// Fills a filter with deduplicated values and keeps the selected value if it remains available.
function setHistoryChoices(select, values, labels = {}) {
    const selected = select.value;
    select.replaceChildren(select.options[0], ...[...new Set(values.filter(Boolean))].sort()
        .map(value => new Option(labels[value] ?? value, value)));
    select.value = values.includes(selected) ? selected : '';
}

// Updates the figure displayed by each metric card in a history section.
function setHistoryMetrics(key, values) {
    retail('#admin-' + key).querySelectorAll('.history-metrics strong').forEach((node, index) => {
        node.textContent = values[index];
    });
}

// Quotes cells, protects spreadsheet formula prefixes and downloads the selected history rows as CSV.
function csvHistory(filename, columns, rows) {
    const csvCell = value => {
        const text = String(value ?? '');
        const safe = /^\s*[=+@-]/.test(text) && !/^-?\d+(?:\.\d+)?$/.test(text) ? "'" + text : text;
        return '"' + safe.replaceAll('"', '""') + '"';
    };
    const csv = [columns, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
    const link = retailNode('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Normalizes product sales, pickups and appointments into the Transaction History table’s shared row format.
function transactionHistoryRows() {
    const sales = (records.Reports ?? []).map(([ref, customer, date, items, total]) => {
        const saved = transactionDetails[ref];
        const quantity = [...String(items).matchAll(/(?:^|, )([0-9]+) × /g)].reduce((sum, match) => sum + Number(match[1]), 0);
        return {
            ref, customer, date, items, total: Number(total), quantity: quantity || null, status: 'Completed',
            type: ref.startsWith('ORD-') ? 'Pickup Order' : 'Product Sale',
            time: saved?.timestamp ? historyTime.format(new Date(saved.timestamp)) : formatDay(date),
            sortTime: Date.parse(saved?.timestamp ?? date + 'T00:00:00+08:00'), processedBy: saved?.processedBy ?? '',
        };
    });
    const bookings = (records[scheduleName] ?? []).map(([pet, service, date, time, status, , ref, customer]) => ({
        ref: ref ?? '', customer: customer ? customer + ' / ' + pet : pet, date, time: formatDay(date) + ' · ' + time,
        sortTime: Date.parse(date + 'T' + time + ':00+08:00'), items: service, quantity: null, total: null, processedBy: '',
        type: customer ? 'Booking' : service === 'Grooming' ? 'Grooming' : 'Pet Hotel', status: status || 'Scheduled',
    }));
    return [...sales, ...bookings].sort((a, b) => b.sortTime - a.sortTime);
}

// Converts a normalized transaction into the same column order used by the table, details and exports.
function transactionHistoryValues(entry) {
    return [entry.time, entry.ref || null, entry.type, entry.customer, entry.items, entry.quantity,
        entry.total === null ? null : pesos(entry.total), entry.processedBy || null, entry.status];
}

// Applies search, status, type and Manila-date filters to the normalized transaction records.
function filteredTransactions(rows) {
    const { query, type, status, range } = historyValues(transactionFilters);
    const today = localDate();
    const inRange = date => {
        if (range === 'today') return date === today;
        if (range === 'month') return date.slice(0, 7) === today.slice(0, 7);
        if (range === 'week') {
            const start = new Date(Date.parse(today + 'T00:00:00Z') - 6 * 86400000).toISOString().slice(0, 10);
            return date >= start && date <= today;
        }
        return true;
    };
    const search = query.toLowerCase();
    return rows.filter(entry => (!type || entry.type === type) && (!status || entry.status === status) &&
        inRange(entry.date) &&
        transactionHistoryValues(entry).some(value => String(value ?? '').toLowerCase().includes(search)));
}

// Refreshes transaction metrics, filtered rows, receipt actions and export availability together.
function renderTransactionHistory() {
    const rows = transactionHistoryRows();
    for (const key of ['type', 'status']) setHistoryChoices(transactionFilters.elements[key], rows.map(entry => entry[key]));
    const today = localDate();
    const paidToday = rows.filter(entry => entry.date === today && entry.total !== null);
    setHistoryMetrics('transactions', [rows.length, paidToday.filter(entry => entry.type === 'Product Sale').length,
        rows.filter(entry => entry.total === null).length, pesos(paidToday.reduce((sum, row) => sum + row.total, 0))]);
    const matching = filteredTransactions(rows);
    retail('#export-transactions-csv').disabled = matching.length === 0;
    retail('#export-transactions-pdf').disabled = matching.length === 0;
    transactionPage = renderHistoryList('transactions', matching, transactionPage, entry => {
        const values = transactionHistoryValues(entry);
        const attached = saleReceiptIds.has(entry.ref);
        const button = retailButton(attached ? 'Receipt' : 'View', () => {
            if (attached) downloadSaleReceipt(entry.ref, button);
            else showHistoryDetails(entry.total === null ? 'Appointment Details' : 'Transaction Details',
                historyColumns('transactions').slice(0, -1), values,
                entry.ref && entry.total !== null ? entry.ref.replace(/^#/, '') + '-details.pdf' : null);
        }, 'filter');
        values[2] = historyBadge(entry.type, 'type');
        values[8] = historyStatus(entry.status);
        return [...values, button];
    }, next => { transactionPage = next; renderTransactionHistory(); });
}

// Formats the date and role of one audit event for the table, details and CSV output.
function auditHistoryValues(entry) {
    return [historyTime.format(new Date(entry.timestamp)), entry.account, historyRoles[entry.role] ?? entry.role,
        entry.area, entry.event, entry.activity, entry.status];
}

// Loads one server-filtered audit page and discards earlier responses if a newer filter request has already started.
async function loadAuditLog(page = 1) {
    const request = ++auditRequest;
    auditMessage.textContent = 'Loading audit logs…';
    try {
        const log = await shopRequest('audit_read', { ...historyValues(auditFilters), page });
        if (request !== auditRequest) return;
        for (const key of ['role', 'area', 'event']) {
            const choices = key === 'event' ? log.facets[key].filter(event => event !== 'Changed maintenance') : log.facets[key];
            setHistoryChoices(auditFilters.elements[key], choices, key === 'role' ? historyRoles : {});
        }
        setHistoryMetrics('audit', [log.summary.today, log.summary.logins, log.summary.critical, log.summary.admins]);
        renderHistoryRows('audit', log.entries.map(entry => {
            const values = auditHistoryValues(entry);
            const button = retailButton('View', () => showHistoryDetails('Audit Log Details', historyColumns('audit').slice(0, -1), auditHistoryValues(entry)), 'filter');
            values[2] = historyBadge(values[2], '');
            values[6] = historyStatus(entry.status);
            return [...values, button];
        }), 'No matching audit activity.');
        renderHistoryPages('audit', log.page, log.pages, log.total, log.start, log.end, loadAuditLog);
        retail('#export-audit').disabled = log.total === 0;
        auditMessage.textContent = '';
    } catch (error) {
        if (request === auditRequest) auditMessage.textContent = error.message;
    }
}

// Returns to page one before rerendering Transaction History after a filter changes.
function applyTransactionFilters() { transactionPage = 1; renderTransactionHistory(); }
transactionFilters.addEventListener('submit', event => { event.preventDefault(); applyTransactionFilters(); });
transactionFilters.addEventListener('input', applyTransactionFilters);
transactionFilters.addEventListener('reset', () => setTimeout(applyTransactionFilters, 0));
auditFilters.addEventListener('submit', event => { event.preventDefault(); loadAuditLog(); });
auditFilters.addEventListener('input', event => {
    clearTimeout(auditSearchTimer);
    if (event.target.type === 'search') {
        auditRequest++;
        auditSearchTimer = setTimeout(() => loadAuditLog(), 250);
    } else loadAuditLog();
});
auditFilters.addEventListener('reset', () => {
    clearTimeout(auditSearchTimer);
    setTimeout(() => loadAuditLog(), 0);
});
retail('#refresh-audit').addEventListener('click', () => loadAuditLog());
retail('#export-audit').addEventListener('click', async () => {
    const button = retail('#export-audit');
    button.disabled = true;
    try {
        const log = await shopRequest('audit_read', { ...historyValues(auditFilters), export: '1' });
        csvHistory('rems-audit-' + localDate() + '.csv', historyColumns('audit').slice(0, -1), log.entries.map(auditHistoryValues));
    } catch (error) {
        auditMessage.textContent = error.message;
    } finally { button.disabled = false; }
});
retail('#export-transactions-csv').addEventListener('click', () => {
    csvHistory('rems-transactions-' + localDate() + '.csv', historyColumns('transactions').slice(0, -1),
        filteredTransactions(transactionHistoryRows()).map(transactionHistoryValues));
});
retail('#export-transactions-pdf').addEventListener('click', () => {
    const columns = historyColumns('transactions').slice(0, -1);
    const details = filteredTransactions(transactionHistoryRows()).map(entry =>
        transactionHistoryValues(entry).map((value, index) => columns[index] + ': ' + (value ?? '—')).join('\n'));
    downloadReceiptPdf('Transaction History', details.join('\n\n'), 'rems-transactions-' + localDate() + '.pdf');
});
document.addEventListener('rems:section', event => {
    if (event.detail === 'Audit Logs') loadAuditLog();
    if (event.detail === 'Transaction History') renderTransactionHistory();
});
document.addEventListener('rems:shop-updated', () => {
    if (admin.dataset.page === 'Transaction History') renderTransactionHistory();
});
