<?php
// Shared Staff Login Accounts panel. The browser fills the list with active and disabled accounts.
if (empty($isAdmin) && empty($isSuperAdmin)) {
    http_response_code(404);
    exit;
}
?>
<section id="staff-accounts" class="staff-accounts" <?= $isSuperAdmin ? '' : 'hidden' ?> aria-labelledby="staff-accounts-title">
    <div class="staff-accounts-heading">
        <div><h2 id="staff-accounts-title">Staff Login Accounts</h2><p>Create or disable credentials for the Staff Dashboard.</p></div>
        <button id="open-staff-account" type="button" class="primary">＋ Create Staff Account</button>
    </div>
    <p id="staff-account-message" role="status"></p>
    <div id="staff-account-list"></div>
</section>
