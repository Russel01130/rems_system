<?php
// Shared staff creation dialog for authorized Admin and Super Admin pages. The form submits its CSRF token and credentials to the server.
if (empty($isAdmin) && empty($isSuperAdmin)) {
    http_response_code(404);
    exit;
}
?>
<dialog id="staff-account-dialog" aria-labelledby="staff-account-title">
    <button type="button" class="close" aria-label="Close">&times;</button>
    <h2 id="staff-account-title">Create Staff Account</h2>
    <form id="staff-account-form" method="post">
        <input type="hidden" name="csrf" value="<?= $authToken ?>">
        <input type="hidden" name="action" value="create_staff">
        <label>Username<input name="username" autocomplete="off" minlength="3" maxlength="32" pattern="[A-Za-z0-9._\-]+" required></label>
        <label>Password<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="72" required></label>
        <label>Confirm password<input name="confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="72" required></label>
        <p id="staff-account-error" role="alert"></p>
        <button type="submit" class="primary">Create Staff Account</button>
    </form>
</dialog>
