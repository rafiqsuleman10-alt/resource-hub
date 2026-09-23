#!/usr/bin/env bash
# TEST ONLY: loads the migrations into a throwaway local Postgres database and
# checks the security rules. Usage: PGHOST=... PGPORT=... bash supabase/tests/run_local_tests.sh
set -euo pipefail
cd "$(dirname "$0")/.."
psql -v ON_ERROR_STOP=1 -q -U postgres -c 'drop database if exists hub_test' -c 'create database hub_test'
run() { psql -v ON_ERROR_STOP=1 -q -U postgres -d hub_test "$@"; }
run -f tests/supabase_shim.sql
for f in migrations/*.sql; do echo "== $f"; run -f "$f"; done
run -f tests/rls_test.sql
run -f tests/reservations_test.sql
run -f tests/kiosk_test.sql
run -f tests/maintenance_test.sql
