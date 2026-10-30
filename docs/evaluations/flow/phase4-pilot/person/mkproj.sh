#!/bin/sh
# A created project for one arm: clean-ddd create from the packed tooling, installed, committed.
set -e
. /tmp/claude-0/flow3/runs/env.sh
dir=$1
rm -rf "$dir" "$dir.flow"
mkdir -p "$(dirname "$dir")"
cd "$(dirname "$dir")"
node /home/user/clean-ddd/tools/dist/cli.js create "$(basename "$dir")" --name notes-app >/dev/null
cd "$dir"
sed -i 's#"clean-ddd": "^0.1.0"#"clean-ddd": "file:/tmp/claude-0/flow4/clean-ddd-bench.tgz"#' package.json
yarn install --silent >/dev/null 2>&1
git init -q
git add -A
git -c user.name=architect -c user.email=architect@example.com commit -qm "created: clean-ddd create notes-app"
git rev-parse --short HEAD
