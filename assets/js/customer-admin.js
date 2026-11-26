/* Role-specific customer management. Admins see customer accounts, and staff process pickup reservations and cancellations. */

const customerManagement = retail('#customer-management');
const customerManagementMessage = retail(isStaff ? '#reservation-status' : '#customer-management-status');
let customerManagementBusy = false;

// Renders the customer account list on the Administrator’s User Management page.
function renderCustomerAccounts(accounts) {
    const accountList = retail('#customer-account-list');
    accountList.replaceChildren();
    for (const account of accounts) {
        const row = retailNode('div', 'customer-management-row');
        const contact = retailNode('div');
        contact.append(retailNode('strong', '', account.name), retailNode('small', '', account.email));
        row.append(contact, retailNode('span', '', account.username), retailNode('small', '', dateFormat.format(new Date(account.created))));
        accountList.append(row);
    }
    if (!accounts.length) accountList.append(retailNode('p', 'retail-empty', 'No customer accounts yet.'));
}

// Renders pickup orders and shows completion and cancellation controls for orders awaiting pickup.
function renderReservations(orders) {
    const orderList = retail('#customer-order-list');
    orderList.replaceChildren();
    for (const order of orders) {
        const row = retailNode('div', 'customer-management-row customer-order-row');
        const orderInfo = retailNode('div');
        orderInfo.append(retailNode('strong', '', order.id + ' · ' + order.customer),
            retailNode('small', '', order.items.map(item => item.quantity + ' × ' + item.name).join(', ')));
        row.append(orderInfo, retailNode('strong', '', pesos(order.total)), retailNode('span', 'operation-badge', order.status));
        if (order.status === 'Awaiting pickup') {
            const actions = retailNode('div', 'customer-order-actions');
            actions.append(
                retailButton('Mark Paid & Picked Up', () => updateCustomerOrder(order.id, 'Completed'), 'filter'),
                retailButton('Cancel Order', () => updateCustomerOrder(order.id, 'Cancelled'), 'filter')
            );
            row.append(actions);
        }
        orderList.append(row);
    }
    if (!orders.length) orderList.append(retailNode('p', 'retail-empty', 'No pickup orders yet.'));
}

// Uses the current role to load administrator account information or the staff pickup queue.
async function refreshCustomerManagement() {
    if (customerManagementBusy) return;
    customerManagementBusy = true;
    customerManagementMessage.textContent = isStaff ? 'Loading reservations…' : 'Loading customer accounts…';
    try {
        const result = await shopRequest(isStaff ? 'customer_order_list' : 'customer_admin_list');
        if (isStaff) renderReservations(result.orders);
        else renderCustomerAccounts(result.accounts);
        customerManagementMessage.textContent = '';
    } catch (error) {
        customerManagementMessage.textContent = error.message;
    } finally {
        customerManagementBusy = false;
    }
}

// Confirms a pickup action, saves it through the server and refreshes the shared stock and sales state.
async function updateCustomerOrder(id, status) {
    if (customerManagementBusy) return;
    const message = status === 'Completed' ? 'Confirm that payment was received and this order was picked up.' : 'Cancel this order and return the reserved quantity to stock?';
    if (!window.confirm(message)) return;
    customerManagementBusy = true;
    try {
        const result = await shopRequest('customer_order_status', { id, status });
        renderReservations(result.orders);
        customerManagementMessage.textContent = result.notice;
        acceptShop(await shopRequest('shop_read'));
        refreshDashboard();
    } catch (error) {
        customerManagementMessage.textContent = error.message;
    } finally {
        customerManagementBusy = false;
    }
}

retail(isStaff ? '#refresh-reservations' : '#refresh-customer-management').addEventListener('click', refreshCustomerManagement);
document.addEventListener('rems:section', event => {
    const open = event.detail === (isStaff ? 'Reservation' : 'User Management');
    if (customerManagement) customerManagement.hidden = !open;
    if (open) refreshCustomerManagement();
});
