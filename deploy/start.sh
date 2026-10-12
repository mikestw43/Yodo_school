#!/bin/sh
# Container entrypoint: back up, apply schema changes safely, start the app.
set -e
cd /app/server

# 1. Copy the database before touching its structure.
if [ -f /data/yodo.db ]; then
  node dist/backup-cli.js prestart
fi

# 2. Add new tables/columns. Deliberately WITHOUT --accept-data-loss:
#    if a change would drop data, this fails and the app does not start,
#    instead of silently deleting anything.
npx prisma db push --skip-generate

# 3. Run.
exec node dist/index.js
