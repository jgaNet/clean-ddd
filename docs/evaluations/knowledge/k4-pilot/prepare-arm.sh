#!/usr/bin/env bash
# K4 pilot: prepares the repository one arm works in for one task, from OpenStay's frozen clean-3 at request 100.
#
#   prepare-arm.sh <arm A|B|C> <task dir> <openstay repository> <out dir> [<node_modules to copy>] [<K3 package .tgz, arm C>]
#
# The out dir becomes a new git repository whose history is one commit, "OpenStay at request 100", holding the start
# tree (with the task's injected defect folded in, for a defect task), and, for the handoff task, a second commit with
# the half-done work. Every arm and every task starts from the same tree but for what the arm removes (A) or adds
# beside it (C). Run it from anywhere; it writes nothing but <out dir> (and <out dir>.k3 for arm C).
set -euo pipefail

ARM=$1
TASK=$(cd "$2" && pwd)
OPENSTAY=$3
OUT=$4
MODULES=${5:-}
K3_TGZ=${6:-}
START=c1ac8da7a796bfd94f7793b6d1f48cd0b665eaa8   # j5b/clean-3, "Feature 100: pausing payouts"

case "$ARM" in A | B | C) ;; *) echo "arm is A, B or C" >&2; exit 2 ;; esac
[ -e "$OUT" ] && { echo "$OUT exists" >&2; exit 2; }
mkdir -p "$OUT"
git -C "$OPENSTAY" archive "$START" | tar -x -C "$OUT"
cd "$OUT"

# A defect task: the defect is part of the start tree, not a change the history shows.
[ -f "$TASK/inject.patch" ] && git apply "$TASK/inject.patch"

if [ "$ARM" = A ]; then
  # No guide, no Clean DDD commands, no skills: the guide and the documents the tooling renders, the agents' directory,
  # the tooling's package and its three scripts. The code, its tests, its linter (which reads conventions/), the
  # decisions (docs/adr) and the conventions' data stay: they are the project's, as a conventional repository has them.
  rm -f CLAUDE.md README.md src/Contexts/README.md src/SharedKernel/Application/IntegrationEvents/README.md \
    conventions/README.md conventions/plans/README.md conventions/storms/README.md
  rm -rf .claude vendor/clean-ddd-0.2.0.tgz
  rmdir vendor 2>/dev/null || true
  node -e '
    const fs = require("fs");
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    for (const s of ["check:conventions", "conventions:write", "architecture"]) delete pkg.scripts[s];
    delete pkg.devDependencies["clean-ddd"];
    fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
    const lock = fs.readFileSync("yarn.lock", "utf8").split(/\n\n/).filter(b => !/^"?clean-ddd@/m.test(b));
    fs.writeFileSync("yarn.lock", lock.join("\n\n"));
  '
fi

git init -q -b main
git add -A
GIT_AUTHOR_DATE=2026-11-13T14:44:11Z GIT_COMMITTER_DATE=2026-11-13T14:44:11Z \
  git -c user.name=OpenStay -c user.email=openstay@example.invalid commit -q -m "OpenStay at request 100"

# The handoff task: the first developer's half-done work is the branch's last commit.
if [ -f "$TASK/half-done.patch" ]; then
  git apply "$TASK/half-done.patch"
  git add -A
  GIT_AUTHOR_DATE=2026-11-13T16:02:40Z GIT_COMMITTER_DATE=2026-11-13T16:02:40Z \
    git -c user.name=Developer -c user.email=developer@example.invalid commit -q \
    -m "Messaging: archiving a conversation (work in progress)"
fi

# The dependencies, as the J5b tree had them installed (node_modules is ignored by git); A without the tooling's package.
if [ -n "$MODULES" ]; then
  cp -a "$MODULES" node_modules
  [ "$ARM" = A ] && rm -rf node_modules/clean-ddd node_modules/.bin/clean-ddd
fi

# Arm C: the K3 query beside the tree, never in it. A `clean-ddd` first on the agent's PATH answers `knowledge` from the
# K3 package and hands every other command to the tree's own tooling (0.2.0), so B's commands are unchanged in C.
if [ "$ARM" = C ]; then
  [ -n "$K3_TGZ" ] || { echo "arm C needs the K3 package (.tgz)" >&2; exit 2; }
  mkdir -p "$OUT.k3/package" "$OUT.k3/bin"
  tar -xzf "$K3_TGZ" -C "$OUT.k3/package" --strip-components=1
  (cd "$OUT.k3/package" && npm install --omit=dev --ignore-scripts --silent)
  cat >"$OUT.k3/bin/clean-ddd" <<EOF
#!/bin/sh
if [ "\$1" = knowledge ]; then exec node "$OUT.k3/package/tools/dist/cli.js" "\$@"; fi
ROOT=\$(git rev-parse --show-toplevel 2>/dev/null || pwd)
exec "\$ROOT/node_modules/.bin/clean-ddd" "\$@"
EOF
  chmod +x "$OUT.k3/bin/clean-ddd"
  echo "arm C: put $OUT.k3/bin first on the agent's PATH"
fi
echo "$ARM $(basename "$TASK"): $(git rev-parse HEAD) in $OUT"
