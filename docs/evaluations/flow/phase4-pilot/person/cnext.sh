#!/bin/sh
# Arm C or C′: integrate the previous feature's branch into main, then the feature's contract
# stage (timed), then its slices.
#   cnext.sh <arm c|cp> <prev-run> <n> <feature> <slices "id:Context" …>
set -e
. /tmp/claude-0/flow3/runs/env.sh
arm=$1; prev=$2; n=$3; feature=$4; shift 4
app=/tmp/claude-0/flow4/$arm/app
L=$app.flow/pilot-$arm.person.jsonl
P=/home/user/clean-ddd/.claude/flow/person.mjs
cd $app
git merge -q --ff-only "run/$prev/integration-1"
node $P --log $L start $feature contract "${NOTE:-}"
plans=""
for slice in "$@"; do id=${slice%%:*}; plans="$plans /tmp/claude-0/flow4/plans/contracts/$feature.$id.yaml"; done
/tmp/claude-0/flow4/contract.sh $app $n $feature $plans
node $P --log $L end $feature contract
pack=false; port=18300; [ $arm = cp ] && pack=true && port=18400
exec_plan=/tmp/claude-0/flow4/plans/$arm/$n-$feature.yaml
{
  echo "run: pilot-$arm-$n"
  echo "base: main"
  echo "request: /home/user/clean-ddd/docs/evaluations/benchmark/backlog/$n-$feature.md"
  echo "storm: conventions/storms/$feature.yaml"
  echo "acceptance:"
  echo "  file: src/Bootstrap/Fastify/Acceptance/$n-$feature.acceptance.ts"
  echo "  command: yarn -s test --testMatch '**/Acceptance/*.acceptance.ts'"
  echo "slices:"
  for slice in "$@"; do id=${slice%%:*}; ctx=${slice#*:}; echo "  - { id: $id, context: $ctx, plan: conventions/plans/$feature.$id.yaml }"; done
  echo "agent: { runner: claude-cli, timeoutMinutes: 90, pack: $pack }"
  echo "parallelism: 2"
  echo "retry: { perSlice: 1 }"
  echo "ports: { base: $port }"
} > $exec_plan
setsid nohup node /home/user/clean-ddd/.claude/flow/run-slices.mjs --project $app --plan $exec_plan > /tmp/claude-0/flow4/pilot-$arm-$n.out 2>&1 < /dev/null &
echo "started pilot-$arm-$n"
