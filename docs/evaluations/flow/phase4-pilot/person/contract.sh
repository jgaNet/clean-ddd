#!/bin/sh
# The contract stage of one feature in arm C or C′, as the person does it: the storm and the
# acceptance test from the kit, the plans given as files, checked and committed.
#   contract.sh <project> <n> <feature> <plan files…>
set -e
. /tmp/claude-0/flow3/runs/env.sh
project=$1; n=$2; feature=$3; shift 3
K=/home/user/clean-ddd/docs/evaluations/benchmark
cd "$project"
mkdir -p conventions/storms conventions/plans src/Bootstrap/Fastify/Acceptance
cp "$K/storms/$feature.yaml" conventions/storms/
cp "$K/acceptance/support.ts" "$K/acceptance/$n-$feature.acceptance.ts" src/Bootstrap/Fastify/Acceptance/
for plan in "$@"; do cp "$plan" conventions/plans/; done
npx prettier --write src/Bootstrap/Fastify/Acceptance conventions >/dev/null
yarn -s architecture storm validate "conventions/storms/$feature.yaml" | tail -1
for plan in "$@"; do yarn -s architecture plan validate "conventions/plans/$(basename "$plan")" | tail -1; done
git add -A
git -c user.name=architect -c user.email=architect@example.com commit -qm "contract: $feature — storm, plans, acceptance test"
git log --oneline -1
