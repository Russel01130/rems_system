const customerManagement = retail('#customer-management');
const customerManagementMessage = retail('#customer-management-status');
let customerManagementBusy = false;

function renderCustomerManagement({ accounts, orders }) {
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

async function refreshCustomerManagement() {
    if (customerManagementBusy) return;
    customerManagementBusy = true;
    customerManagementMessage.textContent = 'Loading customer accounts and orders…';
    try {
        renderCustomerManagement(await shopRequest('customer_admin_list'));
        customerManagementMessage.textContent = '';
    } catch (error) {
        customerManagementMessage.textContent = error.message;
    } finally {
        customerManagementBusy = false;
    }
}

async function updateCustomerOrder(id, status) {
    if (customerManagementBusy) return;
    const message = status === 'Completed' ? 'Confirm that payment was received and this order was picked up.' : 'Cancel this order and return the reserved quantity to stock?';
    if (!window.confirm(message)) return;
    customerManagementBusy = true;
    try {
        const result = await shopRequest('customer_order_status', { id, status });
        renderCustomerManagement(result);
        customerManagementMessage.textContent = result.notice;
        acceptShop(await shopRequest('shop_read'));
        refreshDashboard();
    } catch (error) {
        customerManagementMessage.textContent = error.message;
    } finally {
        customerManagementBusy = false;
    }
}

retail('#refresh-customer-management').addEventListener('click', refreshCustomerManagement);
document.addEventListener('rems:section', event => {
    customerManagement.hidden = event.detail !== 'User Management';
    if (!customerManagement.hidden) refreshCustomerManagement();
});
