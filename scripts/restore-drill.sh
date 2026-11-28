#!/usr/bin/env bash
# Restore drill (issue #8, NFR-7): proves a nightly backup can be decrypted and restored.
# Run monthly, and once before go-live. Procedure: docs/operations/backups-and-rollback.md.
#
#   RESTORE_DATABASE_URL=<owner string of an EMPTY database named ack_restore>
#   LIVE_COPY_URL=<owner string of neondb on the same temporary branch>
#   scripts/restore-drill.sh production/2026-12-01T0100Z.dump.age ~/secure/ack-backup.key
#
# Both databases live on a temporary branch of ack-production (never ack-nonprod: production
# data never leaves the production project). The backup is streamed: download | decrypt |
# pg_restore, so no unencrypted copy is written to disk. Needs wrangler (logged in), age and
# pg_restore 18 (`brew install age libpq`). pg_restore checks the server's certificate against
# the system's trusted roots, so both URLs must say sslmode=verify-full: it refuses a weaker
# mode (#164).
set -euo pipefail
cd "$(dirname "$0")/.."

KEY="${1:?usage: restore-drill.sh <object-key> <age-identity-file>}"
IDENTITY="${2:?usage: restore-drill.sh <object-key> <age-identity-file>}"
BUCKET="${R2_BACKUP_BUCKET:-ack-backups}"
: "${RESTORE_DATABASE_URL:?set RESTORE_DATABASE_URL (empty ack_restore database)}"
: "${LIVE_COPY_URL:?set LIVE_COPY_URL (neondb on the same temporary branch)}"

db_name="$(node -e 'process.stdout.write(new URL(process.argv[1]).pathname.slice(1))' "$RESTORE_DATABASE_URL")"
if [[ "$db_name" != *restore* ]]; then
  echo "Refusing to restore into \"$db_name\": the target database's name must contain 'restore'."
  exit 1
fi
PG_RESTORE="$(command -v pg_restore || echo /opt/homebrew/opt/libpq/bin/pg_restore)"

echo "1/3 Restoring $KEY into $db_name ..."
started=$(date +%s)
pnpm exec wrangler r2 object get "$BUCKET/$KEY" --jurisdiction eu --remote --pipe \
  | age --decrypt --identity "$IDENTITY" \
  | PGSSLROOTCERT="${PGSSLROOTCERT:-system}" "$PG_RESTORE" --exit-on-error --single-transaction --no-owner --dbname "$RESTORE_DATABASE_URL"
echo "    restored in $(($(date +%s) - started)) seconds"

echo "2/3 Schema of the restore against the live copy (must match) ..."
DRIFT_EXPECTED_URL="$LIVE_COPY_URL" DRIFT_ACTUAL_URL="$RESTORE_DATABASE_URL" pnpm -s db:drift

echo "3/3 Row counts, restore against live copy (small differences = changes since the backup) ..."
DRIFT_EXPECTED_URL="$LIVE_COPY_URL" DRIFT_ACTUAL_URL="$RESTORE_DATABASE_URL" pnpm -s db:drift --with-counts \
  | grep -E "rows|No drift" || true

echo "Drill complete. Record it in docs/operations/backups-and-rollback.md, then delete the temporary branch."
