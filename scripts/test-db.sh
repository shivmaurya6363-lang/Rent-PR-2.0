#!/usr/bin/env bash
# Create a throwaway database, apply the Supabase stand-ins and every migration, and print its URL.
#   TEST_DATABASE_URL=$(./scripts/test-db.sh) npm test
# Needs psql and a reachable PostgreSQL 15+ server. Connection defaults can be overridden with PG* variables.
set -euo pipefail
cd "$(dirname "$0")/.."

DB="${TEST_DB_NAME:-rentpr_test}"
HOST="${PGHOST:-localhost}"; PORT="${PGPORT:-5432}"; USER_="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-}"
admin() { psql -q -h "$HOST" -p "$PORT" -U "$USER_" -d postgres -v ON_ERROR_STOP=1 "$@" >&2; }
run()   { psql -q -h "$HOST" -p "$PORT" -U "$USER_" -d "$DB" -v ON_ERROR_STOP=1 "$@" >&2; }

admin -c "DROP DATABASE IF EXISTS \"$DB\"" -c "CREATE DATABASE \"$DB\""
run -f supabase/tests/supabase-stub.sql
for f in supabase/migrations/*.sql; do run -f "$f"; done
run -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated; GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role, authenticated;"

AUTH=""; [ -n "$PGPASSWORD" ] && AUTH=":$PGPASSWORD"
echo "postgres://$USER_$AUTH@$HOST:$PORT/$DB"
