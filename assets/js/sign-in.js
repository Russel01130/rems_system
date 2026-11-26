/* Public authentication dialog behavior for login, administrator setup and customer registration. */

const auth = document.querySelector('#auth');
const form = document.querySelector('#auth-form');
const title = document.querySelector('#auth-title');
const intro = document.querySelector('#auth-intro');
const submit = document.querySelector('#auth-submit');
const error = document.querySelector('#auth-error');
const forgot = document.querySelector('#auth-forgot');
const recovery = document.querySelector('#auth-recovery');
const back = document.querySelector('#auth-recovery-back');
const confirmation = form.elements.confirmation;
let busy = false;

// Switches the public authentication dialog between sign-in, setup and customer registration modes.
function openAuth(mode) {
    const signup = mode === 'customer_signup';
    const setup = mode === 'setup';
    const newAccount = setup || signup;
    const recovering = mode === 'recovery';
    form.hidden = recovering;
    document.querySelector('#auth-links').hidden = recovering;
    forgot.hidden = mode !== 'login';
    const adminSetup = document.querySelector('#admin-setup-link');
    if (adminSetup) adminSetup.hidden = mode !== 'login';
    document.querySelector('#customer-auth-toggle').textContent = newAccount ? 'Back to Sign In' : 'Create account';
    document.querySelector('#customer-signup-fields').hidden = !signup;
    for (const field of [form.elements.full_name, form.elements.email]) {
        field.disabled = !signup;
        field.required = signup;
    }
    recovery.hidden = !recovering;
    document.querySelector('#password-confirmation').hidden = !newAccount;
    confirmation.disabled = !newAccount;
    confirmation.required = newAccount;
    confirmation.value = '';
    form.elements.password.value = '';
    form.elements.password.autocomplete = newAccount ? 'new-password' : 'current-password';
    form.elements.password.minLength = newAccount ? 12 : 1;
    form.elements.action.value = mode;
    submit.textContent = setup ? 'Create Admin Account' : signup ? 'Create Customer Account' : 'Sign In';
    submit.disabled = auth.dataset.unavailable === 'true';
    error.textContent = submit.disabled ? 'Sign-in is temporarily unavailable. Check the Laragon PHP logs.' : '';
    title.textContent = setup ? 'Create Admin Account' : signup ? 'Create Customer Account' : recovering ? 'Forgot your password?' : 'Welcome Back!';
    intro.textContent = newAccount ? 'Choose a username and a password with at least 12 characters.' :
        recovering ? 'Need help signing in?' : 'Sign in to your account to continue.';
    if (!auth.open) auth.showModal();
    (recovering ? back : form.elements.username).focus();
}

document.querySelectorAll('[data-auth]').forEach(button => {
    button.addEventListener('click', () => openAuth(button.dataset.auth));
});
auth.querySelector('.close').addEventListener('click', () => auth.close());
forgot.addEventListener('click', () => openAuth('recovery'));
back.addEventListener('click', () => openAuth('login'));
document.querySelector('#customer-auth-toggle').addEventListener('click', () => openAuth(form.elements.action.value === 'login' ? 'customer_signup' : 'login'));
auth.addEventListener('close', () => form.reset());

// Send the selected authentication action, display server validation errors and reload on success.
form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || submit.disabled || form.hidden) return;
    busy = true;
    submit.disabled = true;
    error.textContent = '';
    try {
        const response = await fetch(location.pathname, { method: 'POST', body: new FormData(form) });
        if (response.ok) {
            location.reload();
            return;
        }
        const result = await response.json();
        error.textContent = result.message;
    } catch {
        error.textContent = 'Could not reach the server. Check Laragon and try again.';
    } finally {
        busy = false;
        submit.disabled = false;
    }
});
