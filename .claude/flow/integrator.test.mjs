/**
 * The integrator's rounds, routing and bound, tested without git, a gate or an agent: `node --test .claude/flow/`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { filesNamed, integrate, ownerOf, routeFailures } from './integrator.mjs';

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
