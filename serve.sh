#!/bin/sh
# Serve Napkinetic locally.
#
# The page works when opened straight from disk, but Chrome blocks IndexedDB
# on file:// URLs, so autosave needs a real origin. This script gives you one.
#
#   ./serve.sh          → http://localhost:8123/
#   ./serve.sh 9000     → http://localhost:9000/

cd "$(dirname "$0")" || exit 1
PORT="${1:-8123}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to serve the page." >&2
  exit 1
fi

echo "Napkinetic → http://localhost:$PORT/"
echo "Ctrl-C to stop."

exec python3 -m http.server "$PORT" --bind 127.0.0.1
