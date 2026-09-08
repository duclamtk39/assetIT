#!/bin/sh
set -eu

# Same secret-file handling as the API, because the network monitor reads the same database with the
# same runtime credentials. It never applies migrations: the API's migrate container owns the schema,
# and two containers racing to migrate is how a deployment corrupts itself.

if [ -z "${DATABASE_URL:-}" ] && { [ -n "${DATABASE_PASSWORD_FILE:-}" ] || [ -n "${DATABASE_PASSWORD:-}" ]; }; then
  if [ -n "${DATABASE_PASSWORD_FILE:-}" ] && [ ! -r "$DATABASE_PASSWORD_FILE" ]; then
    echo "AssetFlow netmon: database password file is not readable" >&2
    exit 1
  fi
  if [ -n "${DATABASE_PASSWORD_FILE:-}" ]; then database_password="$(cat "$DATABASE_PASSWORD_FILE")"; else database_password="$DATABASE_PASSWORD"; fi
  encoded_password="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$database_password")"
  encoded_user="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "${DATABASE_USER:-assetflow}")"
  encoded_database="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "${DATABASE_NAME:-assetflow}")"
  export DATABASE_URL="postgresql://${encoded_user}:${encoded_password}@${DATABASE_HOST:-postgres}:${DATABASE_PORT:-5432}/${encoded_database}"
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "AssetFlow netmon: DATABASE_URL, DATABASE_PASSWORD, or DATABASE_PASSWORD_FILE is required" >&2
  exit 1
fi

echo "AssetFlow: starting network monitor"
exec node /app/apps/api/dist/poller.js
