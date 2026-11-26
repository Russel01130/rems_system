<?php
// Optional MySQL persistence for the admin, staff and shop state groups. Each row stores one group as JSON and is updated under a transaction.
declare(strict_types=1);

// Returns a cached PDO connection configured by REMS_DB environment variables. A missing DSN selects file storage.
function remsDatabase(): ?PDO
{
    static $database = null;
    $dsn = getenv('REMS_DB_DSN');
    if ($dsn === false || $dsn === '') return null;

    return $database ??= new PDO(
        $dsn,
        getenv('REMS_DB_USER') ?: '',
        (string) getenv('REMS_DB_PASSWORD'),
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false]
    );
}

// Imports a state group if missing, then locks its row during the callback so concurrent changes cannot overwrite one another.
function withDatabaseState(PDO $database, string $name, bool $write, callable $import, callable $operation): mixed
{
    $exists = $database->prepare('SELECT 1 FROM rems_state WHERE name = ?');
    $exists->execute([$name]);
    $initialized = $exists->fetchColumn() !== false;
    $exists->closeCursor();
    if (!$initialized) {
        $seed = $database->prepare('INSERT INTO rems_state (name, payload) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = name');
        $seed->execute([$name, json_encode($import(), JSON_THROW_ON_ERROR)]);
    }

    // Lock the state row from the first read through commit to serialize concurrent updates.
    $database->beginTransaction();
    try {
        $select = $database->prepare('SELECT payload FROM rems_state WHERE name = ? FOR UPDATE');
        $select->execute([$name]);
        $payload = $select->fetchColumn();
        $select->closeCursor();
        if ($payload === false) throw new RuntimeException('Database state is missing.');
        $state = json_decode($payload, true, 512, JSON_THROW_ON_ERROR);
        $result = $operation($state);
        if ($write) {
            $update = $database->prepare('UPDATE rems_state SET payload = ? WHERE name = ?');
            $update->execute([json_encode($state, JSON_THROW_ON_ERROR), $name]);
        }
        $database->commit();
        return $result;
    } catch (Throwable $error) {
        if ($database->inTransaction()) $database->rollBack();
        throw $error;
    }
}
