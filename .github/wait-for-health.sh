#!/usr/bin/env sh
# Waits for a server to answer its health route, for a minute at most: the CI jobs start each
# language's server in the background and run the shared API scenario against it.
#   .github/wait-for-health.sh http://127.0.0.1:10000
base="${1:?base url}"
for _ in $(seq 1 120); do
  if curl -sf "$base/v1/health" > /dev/null; then exit 0; fi
  sleep 0.5
done
echo "no answer from $base/v1/health after 60s" >&2
exit 1
