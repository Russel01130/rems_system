CREATE DATABASE IF NOT EXISTS rems_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE rems_system;

CREATE TABLE IF NOT EXISTS rems_state (
    name VARCHAR(32) PRIMARY KEY,
    payload JSON NOT NULL
) ENGINE = InnoDB;
