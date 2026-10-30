#!/bin/sh
# Feature 5's architecture task, as the person writes it: the Notifications context declared and
# registered (empty), the relationship Notes → Notifications planned, its ADR, and the frozen
# integration event NoteArchivedIntegrationEvent.
set -e
. /tmp/claude-0/flow3/runs/env.sh
app=$1
D=/tmp/claude-0/flow4/plans/contracts/notify
cd $app
num=$(printf '%04d' $(( $(ls docs/adr | grep -c '^[0-9]') + 1 )))
n=$(( $(ls docs/adr | grep -c '^[0-9]') + 1 ))
sed "s/^# NN\./# $n./" $D/0004.md > docs/adr/$num-notifications-is-a-context.md
mkdir -p src/Contexts/Notifications/Presentation/API/REST/Routes src/SharedKernel/Application/IntegrationEvents
cp $D/module.local.ts src/Contexts/Notifications/module.local.ts
cp $D/routes-index.ts src/Contexts/Notifications/Presentation/API/REST/Routes/index.ts
cp $D/NoteIntegrationEvents.ts src/SharedKernel/Application/IntegrationEvents/NoteIntegrationEvents.ts
python3 - "$num" "$n" <<'PY'
import sys
num, n = sys.argv[1], sys.argv[2]
def edit(p, a, b):
    s = open(p).read()
    assert a in s, (p, a[:50])
    open(p, 'w').write(s.replace(a, b, 1))
edit('conventions/typescript.yaml', '  - Notes\n', '  - Notes\n  - Notifications\n')
edit('conventions/domain.yaml', 'contexts:\n  - id: Tracker', '''  - id: communication
    name: Communication
    kind: supporting
    why: >-
      Telling a person that something they were given changed supports the core without being it; what a
      notification is and who reads it have reasons of their own.
    contexts:
      - Notifications
contexts:
  - id: Tracker''')
edit('conventions/domain.yaml', 'relationships:\n', '''  - id: Notifications
    purpose: >-
      What a person is told: a notification for each thing that happened to something they were given, which
      they list.
    language:
      - term: Notification
        meaning: what one recipient is told about one fact, kept for them to read.
      - term: Recipient
        meaning: the account a notification is for; only they list it.
relationships:
  - upstream: Notes
    downstream: Notifications
    patterns:
      - published-language
      - anti-corruption-layer
    mechanism: integration-event
    planned: true
    why: >-
      The accounts a note is shared with are told when its owner archives it. Notes publishes the fact in its
      public words; Notifications decides what a recipient is told.
''')
s = open('docs/adr/README.md').read().rstrip('\n').split('\n')
i = max(k for k, line in enumerate(s) if line.startswith('| ['))
s.insert(i + 1, f'| [{n}]({num}-notifications-is-a-context.md) | Notifications tells people what happened to what they were given |')
open('docs/adr/README.md', 'w').write('\n'.join(s) + '\n')
p = 'src/Bootstrap/Fastify/createApplication.ts'
edit(p, "import { noteRoutes } from '@Contexts/Notes/Presentation/API/REST/Routes';\n", "import { noteRoutes } from '@Contexts/Notes/Presentation/API/REST/Routes';\nimport { localNotificationsModule } from '@Contexts/Notifications/module.local';\nimport { notificationRoutes } from '@Contexts/Notifications/Presentation/API/REST/Routes';\n")
edit(p, "    .registerModule(localTrackerModule)\n", "    .registerModule(localTrackerModule)\n    .registerModule(localNotificationsModule)\n")
edit(p, "    .registerRoutes('/notes', noteRoutes, { notesModule: localNotesModule })\n", "    .registerRoutes('/notes', noteRoutes, { notesModule: localNotesModule })\n    .registerRoutes('/notifications', notificationRoutes, { notificationsModule: localNotificationsModule })\n")
PY
npx prettier --write conventions docs src >/dev/null
yarn -s conventions:write >/dev/null 2>&1 || true
yarn -s architecture gate --base HEAD --mode architecture | head -1
git add -A
git -c user.name=architect -c user.email=architect@example.com commit -qm "architecture: Notifications is a context; Notes publishes NoteArchived (ADR $n)"
git log --oneline -1
