/* Super Admin maintenance switch interactions. Each overview card sends its required reason asynchronously and displays the saved state in place. */

// Bind each module independently so editing a reason on one card does not affect another card.
document.querySelectorAll('.maintenance-tile').forEach(form => {
    const toggle = form.elements.enabled;
    const reason = form.elements.reason;
    const feedback = form.querySelector('.maintenance-feedback');
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (toggle.disabled) return;
        if (!reason.value.trim()) {
            feedback.textContent = 'Enter a reason for the maintenance change.';
            reason.focus();
            return;
        }
        const payload = new FormData(form);
        payload.set('enabled', toggle.value);
        toggle.disabled = true;
        reason.readOnly = true;
        feedback.textContent = 'Saving…';
        try {
            const response = await fetch(location.pathname, {
                method: 'POST',
                headers: { Accept: 'application/json' },
                body: payload
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Unable to save the maintenance change.');
            const enabled = result.enabled;
            toggle.value = enabled ? '0' : '1';
            toggle.textContent = enabled ? 'Maintenance on' : 'Maintenance off';
            toggle.dataset.paused = String(enabled);
            toggle.setAttribute('aria-checked', String(enabled));
            form.querySelector('.maintenance-last-change').textContent = result.lastChanged
                ? 'Last changed ' + result.lastChanged : 'No changes yet';
            if (form.elements.module.value === 'system') {
                document.querySelector('#system-maintenance-note').hidden = !enabled;
            }
            reason.value = '';
            feedback.textContent = 'Maintenance setting saved.';
        } catch (error) {
            feedback.textContent = error instanceof SyntaxError ? 'Unable to save the maintenance change.' : error.message;
        } finally {
            reason.readOnly = false;
            toggle.disabled = false;
        }
    });
});
