<?php
// CLI entry point for the appointment deadline processor. Windows Task Scheduler can run it without a browser session.
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../includes/admin-auth.php';

// Process due reminders and no-show or unanswered-request deadlines through the same logic the site uses.
refreshBookingDeadlines();
