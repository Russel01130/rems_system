<?php
// Appointment status transitions, reminder scheduling, no-show processing and customer inbox entries. Appointment rows use pet, service, date, time, status, notes, reference, customer username and optional event metadata.
declare(strict_types=1);

// This is the appointment slot shown in notices, including the Pet Hotel check-in slot.
const APPOINTMENT_DURATION_MINUTES = 60;

// Parses a stored date and time as a Manila appointment start and rejects invalid legacy values.
function appointmentStart(array $row): ?DateTimeImmutable
{
    $value = ($row[2] ?? '') . ' ' . ($row[3] ?? '');
    $start = DateTimeImmutable::createFromFormat('!Y-m-d H:i', $value, new DateTimeZone('Asia/Manila'));
    return $start && $start->format('Y-m-d H:i') === $value ? $start : null;
}

// Determines whether a request has expired or a scheduled visit has passed the no-show deadline.
function elapsedBookingStatus(array $row, DateTimeImmutable $now): ?string
{
    if (empty($row[7])) return null;
    $start = appointmentStart($row);
    if ($start === null) return null;
    return match ($row[4] ?? '') {
        'Pending' => $now >= $start ? 'Request expired' : null,
        'Scheduled' => $now >= $start->modify('+15 minutes') ? 'Cancelled - No-show' : null,
        default => null,
    };
}

// Identifies a scheduled visit whose two-hour reminder is due and has yet to be recorded.
function bookingReminderDue(array $row, DateTimeImmutable $now): bool
{
    if (empty($row[7]) || ($row[4] ?? '') !== 'Scheduled' || !empty($row[8]['remindedAt'])) return false;
    $start = appointmentStart($row);
    return $start !== null && $now >= $start->modify('-2 hours');
}

// Records the reminder once in appointment metadata so it can stay visible in the customer inbox.
function storeBookingReminder(array &$row, DateTimeImmutable $now): void
{
    $metadata = is_array($row[8] ?? null) ? $row[8] : [];
    $due = appointmentStart($row)->modify('-2 hours');
    $approved = isset($metadata['decidedAt']) ? new DateTimeImmutable($metadata['decidedAt']) : $due;
    // Late processing still uses the scheduled delivery time, or the approval time if it came later.
    $row[8] = $metadata + ['decision' => 'approved', 'remindedAt' => min($now, max($due, $approved))->format(DATE_ATOM)];
}

// Checks for due events and takes a write lock only when a reminder, request expiry or no-show needs to be saved.
function refreshBookingDeadlines(): void
{
    $now = manilaNow();
    $due = withShopData(false, static function (array $data) use ($now): array {
        foreach ($data['shop']['records'][APPOINTMENTS] ?? [] as $row) {
            if (bookingReminderDue($row, $now) || elapsedBookingStatus($row, $now) !== null) return [true];
        }
        return [];
    });
    if (!$due) return;
    withShopData(true, static function (array &$data) use ($now): array {
        if (!isset($data['shop']['records'][APPOINTMENTS])) return [];
        foreach ($data['shop']['records'][APPOINTMENTS] as &$row) {
            $status = elapsedBookingStatus($row, $now);
            $reminderDue = bookingReminderDue($row, $now);
            if ($status === null && !$reminderDue) continue;
            if ($reminderDue) storeBookingReminder($row, $now);
            if ($status !== null) {
                $row[4] = $status;
                if (!is_array($row[8] ?? null)) $row[8] = [];
                $row[8]['closedAt'] = $now->format(DATE_ATOM);
            }
            $data['revision']++;
        }
        return [];
    });
}

// Counts customer-submitted appointments awaiting a decision for the Staff Booking badge.
function pendingBookingCount(array $data): int
{
    return count(array_filter($data['shop']['records'][APPOINTMENTS] ?? [],
        static fn(array $row): bool => ($row[4] ?? '') === 'Pending' && !empty($row[7])));
}

// Checks each appointment status transition and records the decision so the customer automatically receives a portal notice.
function resolveCustomerBooking(array &$data): string
{
    $id = $_POST['id'] ?? '';
    $status = $_POST['status'] ?? '';
    if (!is_string($id) || $id === '' || !in_array($status, ['Scheduled', 'Rejected', 'Checked in', 'Completed', 'Cancelled'], true)) {
        authResponse(422, 'Choose a valid appointment action.');
    }
    $appointments = &$data['shop']['records'][APPOINTMENTS];
    foreach ($appointments as $index => $row) {
        if (($row[6] ?? '') !== $id || empty($row[7])) continue;
        $now = manilaNow();
        $start = appointmentStart($row);
        $allowed = match ($row[4]) {
            'Pending' => in_array($status, ['Scheduled', 'Rejected'], true),
            'Scheduled' => $status === 'Cancelled' || ($status === 'Checked in' && $start !== null),
            'Checked in' => in_array($status, ['Completed', 'Cancelled'], true),
            default => false,
        };
        if (!$allowed || elapsedBookingStatus($row, $now) !== null) break;
        if (bookingReminderDue($row, $now)) storeBookingReminder($appointments[$index], $now);
        $appointments[$index][4] = $status;
        if ($row[4] === 'Pending') {
            $appointments[$index][8] = ['decision' => $status === 'Scheduled' ? 'approved' : 'rejected', 'decidedAt' => $now->format(DATE_ATOM)];
        } elseif ($status === 'Cancelled') {
            if (!is_array($appointments[$index][8] ?? null)) $appointments[$index][8] = [];
            $appointments[$index][8] += ['decision' => 'approved', 'closedAt' => $now->format(DATE_ATOM)];
        }
        $data['revision']++;
        return match ($status) {
            'Scheduled' => 'Appointment approved. The customer was notified in their portal.',
            'Rejected' => 'Appointment rejected. The customer was notified in their portal.',
            'Checked in' => 'Customer checked in.',
            'Completed' => 'Customer checked out. Appointment completed.',
            'Cancelled' => 'Appointment cancelled.',
        };
    }
    authResponse(409, 'This appointment is no longer eligible for that action.');
}

// Builds the inbox from appointment events, adds stable IDs and read flags, and sorts dated notices newest first.
function customerBookingNotices(array $bookings, DateTimeImmutable $now, array $read = []): array
{
    $notices = [];
    foreach (array_reverse($bookings) as $row) {
        $start = appointmentStart($row);
        if ($start === null) continue;
        $status = $row[4] ?? '';
        $decision = $row[8]['decision'] ?? match ($status) {
            'Scheduled', 'Checked in', 'Completed' => 'approved',
            'Rejected' => 'rejected',
            default => null,
        };
        $change = match ($status) {
            'Request expired' => 'Appointment request expired before approval',
            'Cancelled - No-show' => 'Appointment cancelled because no check-in was recorded',
            'Cancelled' => 'Appointment cancelled',
            default => null,
        };
        $end = $start->modify('+' . APPOINTMENT_DURATION_MINUTES . ' minutes');
        $details = $row[1] . ' for ' . $row[0] . ' (' . $row[6] . '). Date: ' . $start->format('M j, Y') .
            '. Time: ' . $start->format('g:i A') . ' to ' . $end->format('g:i A') .
            ' Manila time. Duration: ' . APPOINTMENT_DURATION_MINUTES . ' minutes.';
        $add = static function (string $kind, string $message, ?string $date) use (&$notices, $row, $details, $read): void {
            $id = $row[6] . ':' . $kind;
            $notices[] = ['id' => $id, 'message' => $message . ' ' . $details, 'sentAt' => $date, 'read' => isset($read[$id])];
        };
        if ($change !== null) $add('status', $change . '.', $row[8]['closedAt'] ?? null);
        $remindedAt = $row[8]['remindedAt'] ?? null;
        if ($remindedAt !== null || bookingReminderDue($row, $now)) {
            $add('reminder', 'Good Day! Your appointment is coming up in the next two hours. Please come in for your appointment.',
                $remindedAt ?? $start->modify('-2 hours')->format(DATE_ATOM));
        }
        if ($decision !== null) $add('decision', 'Good Day! Your request for a booking appointment was ' . $decision . '.',
            $row[8]['decidedAt'] ?? null);
    }
    usort($notices, static fn(array $a, array $b): int => strcmp($b['sentAt'] ?? '', $a['sentAt'] ?? ''));
    return $notices;
}
