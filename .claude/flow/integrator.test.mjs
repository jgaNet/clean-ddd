/**
 * The integrator's rounds, routing and bound, tested without git, a gate or an agent: `node --test .claude/flow/`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { filesAndModulesNamed, filesNamed, integrate, ownerOf, routeFailures, splitWaiting } from './integrator.mjs';

const owners = [
  { name: 'Messaging', owns: ['^src/Contexts/Messaging/', '^src/SharedKernel/.*/MessagingIntegrationEvents'] },
  { name: 'Moderation', owns: ['^src/Contexts/Moderation/', '^src/Bootstrap/', '^conventions/'] },
];

describe('routing a failure', () => {
  it('finds the files a failure names', () => {
    assert.deepEqual(
      filesNamed('FAIL src/Contexts/Messaging/Presentation/a.e2e.spec.ts\n  at (src/Bootstrap/app.ts:12:3)'),
      ['src/Contexts/Messaging/Presentation/a.e2e.spec.ts', 'src/Bootstrap/app.ts'],
    );
  });

  it('gives a file to the first owner whose patterns match it, and none to nobody', () => {
    assert.equal(ownerOf('src/Contexts/Messaging/Domain/Message.ts', owners), 'Messaging');
    assert.equal(
      ownerOf('src/SharedKernel/Application/IntegrationEvents/MessagingIntegrationEvents.ts', owners),
      'Messaging',
    );
    assert.equal(ownerOf('conventions/storms/x.yaml', owners), 'Moderation');
    assert.equal(ownerOf('src/Contexts/Reviews/Domain/Review.ts', owners), undefined);
  });

  it('sends a step to the owners of the files it names, and one that names none to the feature owner', () => {
    const routed = routeFailures(
      [
        { name: 'yarn test', lines: ['FAIL src/Contexts/Messaging/x.spec.ts'] },
        { name: 'lint', lines: ['src/Contexts/Moderation/y.ts: unused'] },
        { name: 'typecheck', lines: ['something broke'] },
        { name: 'e2e', lines: ['src/Contexts/Messaging/a.ts', 'src/Contexts/Moderation/b.ts'] },
      ],
      owners,
      'Moderation',
    );
    assert.deepEqual(Object.keys(routed).sort(), ['Messaging', 'Moderation']);
    assert.ok(routed.Messaging.includes('yarn test:'));
    assert.ok(routed.Messaging.includes('e2e:'));
    assert.ok(!routed.Messaging.includes('typecheck:'));
    assert.ok(routed.Moderation.includes('typecheck:'));
    assert.ok(routed.Moderation.includes('lint:'));
    assert.ok(routed.Moderation.includes('e2e:'));
  });

  it('sends a step to the owners the driver names, before the files it names', () => {
    const step = {
      name: 'relationships crossed',
      lines: ['Messaging → Moderation is crossed; see src/Contexts/Messaging/a.ts'],
    };
    const byPair = s => (s.name === 'relationships crossed' ? ['Moderation'] : []);
    assert.deepEqual(Object.keys(routeFailures([step], owners, 'Messaging', byPair)), ['Moderation']);
    assert.deepEqual(Object.keys(routeFailures([step], owners, 'Messaging')), ['Messaging']);
    assert.deepEqual(Object.keys(routeFailures([step], owners, 'Messaging', () => ['Nobody'])), ['Messaging']);
  });
});

describe('what an owner can fix alone (correction 13)', () => {
  const aliases = { '@SharedKernel': 'src/SharedKernel', '@Contexts': 'src/Contexts' };

  it('reads a module an import names through its alias', () => {
    assert.deepEqual(
      filesAndModulesNamed(
        `src/Contexts/Moderation/a.ts(3,10): error TS2305: Module '"@SharedKernel/Application/IntegrationEvents/MessagingIntegrationEvents"' has no exported member 'X'.`,
        aliases,
      ),
      ['src/Contexts/Moderation/a.ts', 'src/SharedKernel/Application/IntegrationEvents/MessagingIntegrationEvents'],
    );
    assert.deepEqual(filesAndModulesNamed(`import '@Unknown/x'`, aliases), []);
  });

  it("sets apart a step that waits on another owner's contract", () => {
    const typecheck = {
      name: 'typecheck',
      lines: [
        `src/Contexts/Moderation/a.ts(3,10): error TS2305: Module '"@SharedKernel/Application/IntegrationEvents/MessagingIntegrationEvents"' has no exported member 'X'.`,
      ],
    };
    const { own, waiting } = splitWaiting([typecheck], 'Moderation', owners, aliases);
    assert.deepEqual(own, []);
    assert.deepEqual(waiting, [typecheck]);
  });

  it("keeps the owner's own lines, and a step that names no file, as the owner's", () => {
    const steps = [
      {
        name: 'typecheck',
        lines: [
          'src/Contexts/Moderation/b.ts(1,1): error TS2322: wrong type',
          `src/Contexts/Moderation/a.ts(3,10): error TS2724: '"@SharedKernel/x/MessagingIntegrationEvents"' has no member.`,
        ],
      },
      { name: 'lint', lines: ['something broke'] },
    ];
    const { own, waiting } = splitWaiting(steps, 'Moderation', owners, aliases);
    assert.deepEqual(own, [
      { name: 'typecheck', lines: ['src/Contexts/Moderation/b.ts(1,1): error TS2322: wrong type'] },
      { name: 'lint', lines: ['something broke'] },
    ]);
    assert.equal(waiting.length, 1);
    assert.equal(waiting[0].lines.length, 1);
  });

  it("does not set apart the owner's own files, nor files nobody owns", () => {
    const step = { name: 'test', lines: ['FAIL src/Contexts/Messaging/x.spec.ts', 'see src/Contexts/Reviews/y.ts'] };
    assert.deepEqual(splitWaiting([step], 'Messaging', owners, aliases).own, [step]);
  });
});

/** A scripted run: what each merge and gate answers, in order, and what was sent. */
function scripted({ merges, gates }) {
  const sent = [];
  return {
    sent,
    merge: async () => merges.shift() ?? {},
    gate: async () => gates.shift(),
    send: async (owner, kind, lines) => sent.push({ owner, kind, lines }),
  };
}

describe('the rounds', () => {
  it('stops at the first merged result the gate passes', async () => {
    const run = scripted({ merges: [], gates: [{ pass: true, steps: [] }] });
    const result = await integrate({ owners, featureOwner: 'Moderation', ...run });
    assert.equal(result.pass, true);
    assert.equal(run.sent.length, 0);
  });

  it('sends each failure to its owner, then judges the merged result again', async () => {
    const run = scripted({
      merges: [],
      gates: [
        { pass: false, steps: [{ name: 'yarn test', lines: ['FAIL src/Contexts/Messaging/x.spec.ts'] }] },
        { pass: true, steps: [] },
      ],
    });
    const result = await integrate({ owners, featureOwner: 'Moderation', ...run });
    assert.equal(result.pass, true);
    assert.deepEqual(
      run.sent.map(each => [each.owner, each.kind]),
      [['Messaging', 'failures']],
    );
    assert.equal(result.rounds.length, 2);
  });

  it('gives up after two rounds and says which failure was left, and whose', async () => {
    const failing = { pass: false, steps: [{ name: 'typecheck', lines: ['broken'] }] };
    const run = scripted({ merges: [], gates: [failing, failing, failing, { pass: true, steps: [] }] });
    const result = await integrate({ owners, featureOwner: 'Moderation', ...run });
    assert.equal(result.pass, false);
    assert.equal(run.sent.length, 2);
    assert.deepEqual(Object.keys(result.left), ['Moderation']);
    assert.equal(result.rounds.length, 3);
  });

  it('sends a conflict to the owner whose branch conflicted, and merges again', async () => {
    const run = scripted({
      merges: [{ conflict: { owner: 'Moderation', files: ['src/Bootstrap/app.ts'] } }, {}],
      gates: [{ pass: true, steps: [] }],
    });
    const result = await integrate({ owners, featureOwner: 'Moderation', ...run });
    assert.equal(result.pass, true);
    assert.deepEqual(run.sent, [{ owner: 'Moderation', kind: 'conflict', lines: ['src/Bootstrap/app.ts'] }]);
  });

  it('a conflict in the last round is the result', async () => {
    const conflict = { conflict: { owner: 'Messaging', files: ['x'] } };
    const run = scripted({ merges: [conflict, conflict, conflict], gates: [] });
    const result = await integrate({ owners, featureOwner: 'Moderation', ...run });
    assert.equal(result.pass, false);
    assert.deepEqual(result.conflict, conflict.conflict);
    assert.equal(run.sent.length, 2);
  });

  it('refuses a feature owner that owns nothing', async () => {
    await assert.rejects(() => integrate({ owners, featureOwner: 'Reviews', ...scripted({ merges: [], gates: [] }) }));
  });
});
