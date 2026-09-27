#!/bin/bash
set -euo pipefail
password=$(cat /run/secrets/postgres_password)
# Generated hexadecimal secret only; never interpolate arbitrary configuration into SQL.
[[ "$password" =~ ^[a-f0-9]{64}$ ]] || { echo 'Invalid generated application DB secret' >&2; exit 1; }
psql --username "$POSTGRES_USER" --dbname postgres --set ON_ERROR_STOP=1 <<SQL
CREATE ROLE studio_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '$password';
CREATE DATABASE studio_prod OWNER studio_app;
SQL
unset password
