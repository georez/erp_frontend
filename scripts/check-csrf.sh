#!/usr/bin/env bash
# Checks the CSRF protection end to end against a real Next.js server: src/proxy.js and the /csrf route, which the
# unit tests (src/utils/csrf*.test.mjs) can't reach. Two curl cookie jars play two browsers.
#
# The same checks as scripts/check-csrf.mjs (npm run check:csrf), for a shell without npm, e.g. on a server or in
# CI. Needs bash and curl (Git Bash on Windows has both). Run after a build, from the frontend folder (no backend
# needed):
#   npm run build
#   bash scripts/check-csrf.sh
#
# It starts `next start` on CHECK_CSRF_PORT (default 3100) and stops it again. A changing request that passes the
# CSRF check gets 405 from POST /csrf (the route only has GET); a rejected one gets the proxy's 403.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=${CHECK_CSRF_PORT:-3100}
BASE="http://localhost:$PORT"
PASSED_CSRF=405
REJECTED=403

if [ ! -f .next/BUILD_ID ]; then
  echo "No build found: run 'npm run build' first" >&2
  exit 1
fi
if curl -s -o /dev/null "$BASE/login"; then
  echo "Port $PORT is already in use; set CHECK_CSRF_PORT to a free port" >&2
  exit 1
fi

WORK=$(mktemp -d)
server_pid=""

stop_server() {
  if [ -n "$server_pid" ]; then
    # next start runs the server in child processes. Git Bash on Windows: only taskkill /T stops the whole tree
    # (it needs the Windows process id; the // keeps Git Bash from turning /T into a path).
    if [ -r "/proc/$server_pid/winpid" ] && command -v taskkill > /dev/null; then
      taskkill //PID "$(cat "/proc/$server_pid/winpid")" //T //F > /dev/null 2>&1 || true
    else
      pkill -TERM -P "$server_pid" 2> /dev/null || true
      kill "$server_pid" 2> /dev/null || true
    fi
  fi
  rm -rf "$WORK"
}
# Runs however the script ends: success, a failed check, an error or Ctrl+C
trap stop_server EXIT

node node_modules/next/dist/bin/next start -p "$PORT" > "$WORK/server.log" 2>&1 &
server_pid=$!

for _ in $(seq 1 120); do
  curl -s -o /dev/null "$BASE/login" && break
  sleep 0.5
done
if ! curl -s -o /dev/null "$BASE/login"; then
  echo "next start didn't answer on port $PORT within 60 seconds:" >&2
  cat "$WORK/server.log" >&2
  exit 1
fi

failed=0
check() {
  if [ "$2" = "$3" ]; then
    echo "ok      $1"
  else
    echo "not ok  $1: expected $2, got $3"
    failed=1
  fi
}

# A browser is a cookie jar file: -c saves the cookies the server sets, -b sends them back
request() { # jar path [curl options...]: prints the status code, keeps the response headers in $WORK/headers
  local jar=$1 path=$2
  shift 2
  curl -s -o "$WORK/body" -D "$WORK/headers" -w '%{http_code}' -b "$jar" -c "$jar" "$@" "$BASE$path"
}
token() { # jar: a token for that browser
  request "$1" /csrf > /dev/null
  sed -E 's/.*"csrfToken":"([^"]+)".*/\1/' "$WORK/body"
}
post() { # jar [token]: a changing request; 405 means it passed the CSRF check
  if [ $# -ge 2 ]; then
    request "$1" /csrf -X POST -H "x-csrf-token: $2"
  else
    request "$1" /csrf -X POST
  fi
}
secret_cookies() { grep -ci '^set-cookie: csrf_secret=' "$WORK/headers" || true; }

# 1. The first page load gives the browser one secret cookie, httpOnly and SameSite=Lax
A="$WORK/browser-a"
request "$A" /login > /dev/null
check "the first page load sets one csrf_secret cookie" 1 "$(secret_cookies)"
cookie=$(grep -i '^set-cookie: csrf_secret=' "$WORK/headers" | tr -d '\r')
check "...httpOnly" yes "$(echo "$cookie" | grep -qi 'httponly' && echo yes || echo no)"
check "...SameSite=Lax" yes "$(echo "$cookie" | grep -qi 'samesite=lax' && echo yes || echo no)"

# 2. /csrf reuses the secret: no new cookie, and tabs get different tokens
tab1=$(token "$A")
check "/csrf with the cookie sets no new cookie" 0 "$(secret_cookies)"
tab2=$(token "$A")
check "tabs get different tokens" yes "$([ "$tab1" != "$tab2" ] && echo yes || echo no)"

# 3. Every tab's token passes with the browser's cookie
check "tab 1's token passes" "$PASSED_CSRF" "$(post "$A" "$tab1")"
check "tab 2's token passes" "$PASSED_CSRF" "$(post "$A" "$tab2")"

# 4. /csrf creates the secret when it is the browser's first request, once
B="$WORK/browser-b"
request "$B" /csrf > /dev/null
check "/csrf as the first request sets one csrf_secret cookie" 1 "$(secret_cookies)"
tokenB=$(sed -E 's/.*"csrfToken":"([^"]+)".*/\1/' "$WORK/body")
check "that token passes" "$PASSED_CSRF" "$(post "$B" "$tokenB")"

# 5. A token from another browser is rejected, marked so csrfFetch retries
check "browser B's token with browser A's cookie is rejected" "$REJECTED" "$(post "$A" "$tokenB")"
check "...marked with x-csrf-rejected" 1 "$(grep -ci '^x-csrf-rejected: true' "$WORK/headers" || true)"

# 6. A missing cookie, a missing token or a made-up token is rejected
check "a token without the cookie is rejected" "$REJECTED" "$(post "$WORK/no-cookies" "$tab1")"
check "the cookie without a token is rejected" "$REJECTED" "$(post "$A")"
check "a made-up token is rejected" "$REJECTED" "$(post "$A" made-up)"

# 7. GET requests need no token
check "GET without a token is allowed" 200 "$(request "$WORK/fresh" /login)"

echo
if [ "$failed" -eq 0 ]; then echo "All checks passed"; else echo "Some checks failed"; fi
exit "$failed"
