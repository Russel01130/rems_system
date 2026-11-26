/* Shared JavaScript for Admin and Super Admin staff account forms, including account creation and enable or disable actions. */

const staffAccountsPanel = document.querySelector('#staff-accounts');
const staffAccountListDisplay = document.querySelector('#staff-account-list');
const staffAccountDialog = document.querySelector('#staff-account-dialog');
const staffAccountForm = document.querySelector('#staff-account-form');
const staffAccountMessage = document.querySelector('#staff-account-message');
const staffAccountError = document.querySelector('#staff-account-error');

// Sends a form-encoded staff account request to the authenticated server endpoint.
async function staffAccountRequest(payload) {
    const response = await fetch(location.pathname, { method: 'POST', body: payload });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Staff accounts are temporarily unavailable.');
    return result;
}

// Builds the action and CSRF fields used by staff list and status requests.
function staffActionData(action) {
    return new URLSearchParams({ action, csrf: staffAccountForm.elements.csrf.value });
}

// Creates a text-only element for the staff account list.
function staffAccountElement(tag, className, text = '') {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
}

// Displays staff account statuses and offers an enable or disable action for each entry.
function renderStaffAccounts(accounts) {
    staffAccountListDisplay.replaceChildren();
    if (!accounts.length) {
        staffAccountListDisplay.append(staffAccountElement('p', 'staff-account-empty', 'No staff login accounts yet.'));
    }
    for (const account of accounts) {
        const row = staffAccountElement('div', 'staff-account-row');
        const name = staffAccountElement('strong', '', account.username);
        const status = staffAccountElement('span', 'operation-badge ' + (account.active ? 'active' : 'inactive'), account.active ? 'Active' : 'Disabled');
        const button = staffAccountElement('button', 'filter', account.active ? 'Disable' : 'Enable');
        button.type = 'button';
        button.addEventListener('click', async () => {
            button.disabled = true;
            staffAccountMessage.textContent = '';
            const data = staffActionData('set_staff_status');
            data.set('username', account.username);
            data.set('active', account.active ? '0' : '1');
            try {
                const result = await staffAccountRequest(data);
                renderStaffAccounts(result.accounts);
                staffAccountMessage.textContent = result.message;
            } catch (error) {
                staffAccountMessage.textContent = error.message;
                button.disabled = false;
            }
        });
        button.setAttribute('aria-label', button.textContent + ' ' + account.username);
        row.append(name, status, button);
        staffAccountListDisplay.append(row);
    }
}

document.querySelector('#open-staff-account').addEventListener('click', () => {
    staffAccountForm.reset();
    staffAccountError.textContent = '';
    staffAccountDialog.showModal();
});

// Submit the account creation form once, then refresh the active and disabled account list.
staffAccountForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = staffAccountForm.querySelector('button[type="submit"]');
    if (button.disabled) return;
    staffAccountError.textContent = '';
    button.disabled = true;
    try {
        const result = await staffAccountRequest(new FormData(staffAccountForm));
        renderStaffAccounts(result.accounts);
        staffAccountDialog.close();
        staffAccountForm.reset();
        staffAccountMessage.textContent = result.message;
    } catch (error) {
        staffAccountError.textContent = error.message;
    } finally {
        button.disabled = false;
    }
});

let staffListLoaded = false;
// Loads the staff list once when its page is first opened and reports failures in the panel.
async function loadStaffAccounts() {
    if (staffListLoaded) return;
    staffAccountMessage.textContent = 'Loading staff accounts…';
    try {
        const result = await staffAccountRequest(staffActionData('list_staff'));
        renderStaffAccounts(result.accounts);
        staffAccountMessage.textContent = '';
        staffListLoaded = true;
    } catch (error) {
        staffAccountMessage.textContent = error.message;
    }
}

if (document.querySelector('#admin').dataset.role === 'super_admin') {
    staffAccountDialog.querySelector('.close').addEventListener('click', () => staffAccountDialog.close());
    loadStaffAccounts();
} else {
    document.addEventListener('rems:section', event => {
        staffAccountsPanel.hidden = event.detail !== 'User Management';
        if (!staffAccountsPanel.hidden) loadStaffAccounts();
    });
}
