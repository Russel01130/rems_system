-- Create the logical database on the MySQL server selected in your client.
CREATE DATABASE IF NOT EXISTS rems_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE rems_system;

-- The app stores one JSON document per state group, using admin, staff and shop as keys.
-- InnoDB lets the PHP storage layer lock a group row during a transaction.
CREATE TABLE IF NOT EXISTS rems_state (
    name VARCHAR(32) PRIMARY KEY,
    payload JSON NOT NULL
) ENGINE = InnoDB;
