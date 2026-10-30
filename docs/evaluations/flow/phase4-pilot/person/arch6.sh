#!/bin/sh
# Feature 6's architecture task: the Plans context declared and registered (empty, everyone on
# Free), its frozen read model IPlanQueries, the relationship Plans → Notes planned, its ADR.
set -e
. /tmp/claude-0/flow3/runs/env.sh
app=$1
D=/tmp/claude-0/flow4/plans/contracts/quota
cd $app
num=$(printf '%04d' $(( $(ls docs/adr | grep -c '^[0-9]') + 1 )))
n=$(( $(ls docs/adr | grep -c '^[0-9]') + 1 ))
sed "s/^# NN\./# $n./" $D/adr.md > docs/adr/$num-plans-is-a-context.md
mkdir -p src/Contexts/Plans/Presentation/API/REST/Routes src/Contexts/Plans/Domain/Plan/Ports
cp $D/module.local.ts src/Contexts/Plans/module.local.ts
cp $D/routes-index.ts src/Contexts/Plans/Presentation/API/REST/Routes/index.ts
cp $D/IPlanQueries.ts src/Contexts/Plans/Domain/Plan/Ports/IPlanQueries.ts
python3 - "$num" "$n" <<'PY'
import sys
num, n = sys.argv[1], sys.argv[2]
def edit(p, a, b):
    s = open(p).read()
    assert a in s, (p, a[:50])
    open(p, 'w').write(s.replace(a, b, 1))
s = open('conventions/typescript.yaml').read()
i = s.index('contexts:\n') + len('contexts:\n')
j = s.index('contexts_tree:')
open('conventions/typescript.yaml', 'w').write(s[:j] + '  - Plans\n' + s[j:] if '  - Plans\n' not in s[i:j] else s)
edit('conventions/domain.yaml', 'contexts:\n  - id: Tracker', '''  - id: billing
    name: Billing
    kind: supporting
    why: >-
      Which plan a person is on and what it allows supports the product without being it; its rules change
      with pricing, not with notes.
    contexts:
      - Plans
contexts:
  - id: Tracker''')
edit('conventions/domain.yaml', 'relationships:\n', '''  - id: Plans
    purpose: 'Which plan each person is on — Free, ten notes, or Unlimited — and what it allows.'
    language:
      - term: Plan
        meaning: what a person is on, Free until they switch; it says how many notes they may keep.
      - term: Note limit
        meaning: how many notes a plan keeps; none for Unlimited.
relationships:
  - upstream: Plans
    downstream: Notes
    patterns:
      - customer-supplier
      - anti-corruption-layer
    mechanism: owned-port
    planned: true
    why: >-
      Writing a note is refused past the limit of the writer's plan, and only Plans knows the plan. Notes asks
      in its own words, through a port it owns, answered by an adapter over Plans' read model.
''')
s = open('docs/adr/README.md').read().rstrip('\n').split('\n')
i = max(k for k, line in enumerate(s) if line.startswith('| ['))
s.insert(i + 1, f'| [{n}]({num}-plans-is-a-context.md) | Plans is a context of its own, and Notes asks it how many notes a person may keep |')
open('docs/adr/README.md', 'w').write('\n'.join(s) + '\n')
p = 'src/Bootstrap/Fastify/createApplication.ts'
edit(p, "import { noteRoutes } from '@Contexts/Notes/Presentation/API/REST/Routes';\n", "import { noteRoutes } from '@Contexts/Notes/Presentation/API/REST/Routes';\nimport { localPlansModule } from '@Contexts/Plans/module.local';\nimport { planRoutes } from '@Contexts/Plans/Presentation/API/REST/Routes';\n")
edit(p, "    .registerModule(localTrackerModule)\n", "    .registerModule(localTrackerModule)\n    .registerModule(localPlansModule)\n")
edit(p, "    .registerRoutes('/notes', noteRoutes, { notesModule: localNotesModule })\n", "    .registerRoutes('/notes', noteRoutes, { notesModule: localNotesModule })\n    .registerRoutes('/plans', planRoutes, { plansModule: localPlansModule })\n")
PY
npx prettier --write conventions docs src >/dev/null
yarn -s conventions:write >/dev/null 2>&1 || true
yarn -s architecture gate --base HEAD --mode architecture | head -1
git add -A
git -c user.name=architect -c user.email=architect@example.com commit -qm "architecture: Plans is a context; Notes asks it the limit (ADR $n)"
git log --oneline -1
