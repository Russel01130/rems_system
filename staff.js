const staffAccountsPanel = document.querySelector('#staff-accounts');
const staffAccountListDisplay = document.querySelector('#staff-account-list');
const staffAccountDialog = document.querySelector('#staff-account-dialog');
const staffAccountForm = document.querySelector('#staff-account-form');
const staffAccountMessage = document.querySelector('#staff-account-message');
const staffAccountError = document.querySelector('#staff-account-error');

async function staffAccountRequest(payload) {
    const response = await fetch(location.pathname, { method: 'POST', body: payload });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Staff accounts are temporarily unavailable.');
    return result;
}

function staffActionData(action) {
    return new URLSearchParams({ action, csrf: staffAccountForm.elements.csrf.value });
}

function renderStaffAccounts(accounts) {
    staffAccountListDisplay.replaceChildren();
    if (!accounts.length) {
        staffAccountListDisplay.append(retailNode('p', 'staff-account-empty', 'No staff login accounts yet.'));
    }
    for (const account of accounts) {
        const row = retailNode('div', 'staff-account-row');
        const name = retailNode('strong', '', account.username);
        const status = retailNode('span', 'operation-badge ' + (account.active ? 'active' : 'inactive'), account.active ? 'Active' : 'Disabled');
        const button = retailButton(account.active ? 'Disable' : 'Enable', async () => {
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
        }, 'filter');
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
document.addEventListener('rems:section', async event => {
    staffAccountsPanel.hidden = event.detail !== 'User Management';
    if (staffAccountsPanel.hidden || staffListLoaded) return;
    staffAccountMessage.textContent = 'Loading staff accounts…';
    try {
        const result = await staffAccountRequest(staffActionData('list_staff'));
        renderStaffAccounts(result.accounts);
        staffAccountMessage.textContent = '';
        staffListLoaded = true;
    } catch (error) {
        staffAccountMessage.textContent = error.message;
    }
});
