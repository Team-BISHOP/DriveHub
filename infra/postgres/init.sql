-- Runs once, the first time the Postgres container starts.
-- One database per service, so no service can touch another service's tables.
CREATE DATABASE fleetdb;
CREATE DATABASE bookingdb;
CREATE DATABASE paymentdb;
CREATE DATABASE notificationdb;
CREATE DATABASE analyticsdb;
