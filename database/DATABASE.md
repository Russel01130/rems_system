# REMS MySQL setup

1. Open phpMyAdmin or Laragon’s Adminer at `http://localhost/adminer/` while its web server is running. Sign in to MySQL and import [database.sql](database.sql) with an account that can create the schema and table.
2. Use a MySQL account with `SELECT`, `INSERT`, and `UPDATE` on `rems_system.rems_state` for the PHP app.
3. Set these environment variables in the process that serves PHP. For a local preview, run the following from the project directory in PowerShell. For Apache, make the same variables available to PHP through the server configuration and restart Apache.

   ```powershell
   $env:REMS_DB_DSN = 'mysql:host=127.0.0.1;port=3306;dbname=rems_system;charset=utf8mb4'
   $env:REMS_DB_USER = Read-Host 'MySQL username'
   $env:REMS_DB_PASSWORD = [System.Net.NetworkCredential]::new('', (Read-Host 'MySQL password' -AsSecureString)).Password
   php -S 127.0.0.1:8080
   ```

4. Open `http://127.0.0.1:8080/` for the PowerShell preview. On first access to each data group, the app copies the existing PHP-file records into the corresponding `admin`, `staff`, or `shop` row. The `shop` row also contains customer accounts, orders, and appointments. You can check these rows under `rems_system → rems_state` in your database manager.

When `REMS_DB_DSN` is unset, the app uses its original PHP files. Once MySQL is enabled, keep it enabled for all app instances so that all shared changes go to the same database. The original files remain as they were at import time. The retail interface keeps browser-local drafts and saved sales in that browser.

## Appointment deadlines

The app checks appointment deadlines during customer and shop requests. To persist no-show cancellations and expire unanswered requests while nobody is using the app, run `php database/process-booking-deadlines.php` once a minute from Windows Task Scheduler. Use the same database environment and PHP executable as the web app.
