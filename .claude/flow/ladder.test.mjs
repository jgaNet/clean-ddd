/**
 * What the ladder gives an agent and what voids its attempt (ladder.mjs), without a ladder: the API fragments of J6's
 * kits up to a request, every storm of both kits marked as a Lite tree reads it, and the leakage scan on transcripts
 * written in a temp dir (`node --test .claude/flow/`).
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { answeredAtOnce, apiBrief, apiFragments, kitLeakage, markAnsweredAtOnce, transcriptsOf } from './ladder.mjs';

const yaml = createRequire(import.meta.url)('js-yaml');
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const kits = ['app', 'calibration'].map(name => join(root, 'docs/evaluations/benchmark/three-arms', name));
const [tally, calibration] = kits;
const scratch = mkdtempSync(join(tmpdir(), 'ladder-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

describe('the API as data (D3)', () => {
  it("gives the request's fragment and those of the requests before it, in their order, and none after", () => {
    const fragments = apiFragments(tally, 4);
    assert.deepEqual(
      fragments.map(each => each.file),
      ['1-accounts.yaml', '2-create-a-group.yaml', '3-invite-and-join.yaml', '4-record-an-expense.yaml'],
    );
    assert.equal(fragments[3].text, readFileSync(join(tally, 'api/4-record-an-expense.yaml'), 'utf8').trimEnd());
    const brief = apiBrief(fragments, 4).join('\n');
    assert.match(brief, /This request's API fragment and those of the requests before it/);
    assert.match(brief, /Request 4's fragment \(`4-record-an-expense\.yaml`\):\n\n```yaml\n# Request 4/);
    assert.ok(brief.indexOf("Request 1's fragment") < brief.indexOf("Request 4's fragment"));
    assert.doesNotMatch(brief, /Request 5's fragment/);
  });

  it('says so when the request has no fragment of its own, and gives nothing for a kit without api/', () => {
    // Request 10 of Tally has no API table; request 40's brief carries all thirty-six.
    assert.equal(apiFragments(tally, 10).length, 9);
    assert.match(apiBrief(apiFragments(tally, 10), 10).join('\n'), /this request has none of its own/);
    assert.equal(apiFragments(tally, 40).length, readdirSync(join(tally, 'api')).length);
    assert.equal(apiFragments(calibration, 10).length, readdirSync(join(calibration, 'api')).length);
    assert.deepEqual(apiFragments(scratch, 10), []);
    assert.deepEqual(apiBrief([], 1), []);
  });
});

describe('a storm, as a tree held to Lite reads it', () => {
  const storms = kits.flatMap(kit =>
    readdirSync(join(kit, 'storms'))
      .filter(file => file.endsWith('.yaml'))
      .map(file => join(kit, 'storms', file)),
  );

  it("marks every command of every storm of both kits answered at once, and changes nothing else in the storm's text", () => {
    assert.equal(storms.length, 50);
    let commands = 0;
    for (const file of storms) {
      const text = readFileSync(file, 'utf8');
      const { text: marked, marked: names } = markAnsweredAtOnce(text, () => true, yaml);
      const expected = yaml.load(text);
      for (const context of expected.contexts)
        for (const command of context.commands ?? []) command.answered = 'at-once';
      assert.deepEqual(yaml.load(marked), expected, file);
      commands += names.length;
      // Written as a line under each command's name, the rest of the file as it was: comments and folding kept.
      const added = marked.split('\n').filter(line => !text.split('\n').includes(line));
      assert.ok(
        added.every(line => /^ +answered: at-once$/.test(line)),
        file,
      );
      assert.equal(added.length, names.length, file);
    }
    assert.ok(commands > 40, `${commands} commands`);
  });

  it('marks only the contexts held to a profile that answers at once, and leaves a command already marked', () => {
    const text = [
      '# a storm of two contexts',
      'schemaVersion: 1',
      'feature: two',
      'intent: >-',
      '  Two contexts.',
      'done: false',
      'hotSpots: []',
      'contexts:',
      '  - id: Groups',
      '    commands:',
      '      - name: Archive',
      '        actor: a signed-in account',
      '        route: POST /groups/{param}/archive',
      '        events: [Archived]',
      '      - name: Rename',
      '        actor: a signed-in account',
      '        answered: at-once',
      '        route: POST /groups/{param}/name',
      '    events: [Archived]',
      '  - id: Ledger',
      '    commands:',
      '      - name: Record',
      '        actor: a signed-in account',
      '        route: POST /expenses',
      '    events: []',
      'links: []',
      '',
    ].join('\n');
    const { text: marked, marked: names } = markAnsweredAtOnce(text, context => context === 'Groups', yaml);
    assert.deepEqual(names, ['Groups.Archive']);
    const storm = yaml.load(marked);
    assert.deepEqual(
      storm.contexts.flatMap(context => context.commands.map(command => [command.name, command.answered])),
      [
        ['Archive', 'at-once'],
        ['Rename', 'at-once'],
        ['Record', undefined],
      ],
    );
    assert.ok(marked.startsWith('# a storm of two contexts\n'));
    // Nothing to mark: the text is the kit's, byte for byte (a Full tree).
    assert.equal(markAnsweredAtOnce(text, () => false, yaml).text, text);
  });

  it('dumps the storm whole when its commands are not written one key a line', () => {
    const text =
      'schemaVersion: 1\nfeature: f\nintent: i\ncontexts:\n  - { id: Groups, commands: [{ name: Archive, actor: anyone, route: POST /a }] }\n';
    const { text: marked } = markAnsweredAtOnce(text, () => true, yaml);
    assert.equal(yaml.load(marked).contexts[0].commands[0].answered, 'at-once');
  });

  it('reads which contexts answer at once from the tree (`architecture profiles --json`), a context not declared by the default', () => {
    const profiles = {
      profiles: [
        { id: 'full', default: true, mechanisms: {} },
        { id: 'lite', mechanisms: { 'command-bus': { stance: 'not-used' } } },
      ],
      contexts: [
        { context: 'Groups', profile: 'lite' },
        { context: 'Ledger', profile: 'full' },
      ],
    };
    const lite = answeredAtOnce(profiles, 'lite');
    assert.equal(lite('Groups'), true);
    assert.equal(lite('Ledger'), false);
    assert.equal(lite('Settlements'), true);
    assert.equal(answeredAtOnce(profiles)('Settlements'), false);
    assert.equal(answeredAtOnce(undefined), undefined);
    assert.equal(answeredAtOnce({ schemaVersion: 1 }), undefined);
  });
});

describe('leakage voids an attempt', () => {
  const projects = join(scratch, 'projects');
  const kit = '/var/lib/frozen/app';
  const cwd = '/srv/t/app.flow/worktrees/r/accounts-0';
  const slug = cwd.replace(/[^A-Za-z0-9]/g, '-');
  /** A transcript of one conversation in `dir`: each call `[tool, input, result]`. */
  const transcript = (dir, name, calls) => {
    mkdirSync(join(projects, dir), { recursive: true });
    const file = join(projects, dir, `${name}.jsonl`);
    const lines = calls.flatMap(([tool, input, result = ''], index) => [
      { type: 'assistant', cwd, message: { content: [{ type: 'tool_use', id: `t${index}`, name: tool, input }] } },
      { type: 'user', cwd, message: { content: [{ type: 'tool_result', tool_use_id: `t${index}`, content: result }] } },
    ]);
    writeFileSync(file, lines.map(line => JSON.stringify(line)).join('\n'));
    return file;
  };

  it("finds the attempt's transcripts, its owners' too, written since it began, and no other conversation's", () => {
    const since = Date.now() - 1000;
    const own = transcript(slug, 'a', [['Bash', { command: 'yarn test' }]]);
    const owner = transcript(`${slug}-Ledger`, 'b', [['Bash', { command: 'yarn test' }]]);
    const older = transcript(slug, 'c', [['Bash', { command: 'yarn test' }]]);
    utimesSync(older, new Date(since - 60_000), new Date(since - 60_000));
    transcript(`${slug}0`, 'd', [['Bash', { command: 'yarn test' }]]);
    transcript('-srv-t-app-flow-worktrees-r-balances-0', 'e', [['Bash', { command: 'yarn test' }]]);
    assert.deepEqual(transcriptsOf(cwd, since, projects), [own, owner].sort());
    assert.deepEqual(transcriptsOf(cwd, since, join(scratch, 'none')), []);
  });

  it('voids a transcript that reads or lists a path of the kit, and nothing else', () => {
    const read = transcript('v', 'read', [['Read', { file_path: `${kit}/acceptance/1-accounts.acceptance.ts` }]]);
    const listed = transcript('v', 'listed', [['Bash', { command: `ls ${kit}` }]]);
    const grep = transcript('v', 'grep', [['Grep', { pattern: 'expect', path: '/srv/t/app.flow/grade' }]]);
    const clean = transcript('v', 'clean', [
      ['Read', { file_path: `${cwd}/src/app.ts` }],
      ['Bash', { command: `ls ${kit}-notes /var/lib/frozen/apples` }],
      // A result that names the kit (an error, a log) is seen, not a read: it voids nothing.
      ['Bash', { command: 'yarn test' }, `failed near ${kit}/acceptance`],
    ]);
    const paths = [kit, '/srv/t/app.flow/grade'];
    for (const file of [read, listed, grep]) assert.equal(kitLeakage([file], paths).void, true, file);
    const scanned = kitLeakage([read, clean], paths);
    assert.equal(scanned.touched.length, 1);
    assert.equal(scanned.touched[0].matched, kit);
    assert.equal(scanned.touched[0].transcript, read);
    const fine = kitLeakage([clean], paths);
    assert.equal(fine.void, false);
    assert.equal(fine.seen.length, 1);
    // A kit's files wherever they are void it too: a hidden test by its name, the reference's evaluations, and the
    // grader's worktrees named relatively from the attempt's worktree (J6 readiness, 16 November).
    const named = transcript('v', 'named', [['Read', { file_path: `${cwd}/docs/evaluations/x/1-a.acceptance.ts` }]]);
    assert.equal(kitLeakage([named], paths).void, true);
    const relative = transcript('v', 'relative', [['Bash', { command: 'ls ../../grade' }]]);
    assert.equal(kitLeakage([relative], paths).void, true);
    assert.equal(kitLeakage([relative], paths).touched[0].matched, 'a grade directory');
    const found = transcript('v', 'found', [['Bash', { command: "find / -name '*.acceptance.ts'" }]]);
    assert.equal(kitLeakage([found], paths).void, true);
    // A word that only contains it is not a path: `upgrade`, `graded`.
    const words = transcript('v', 'words', [['Bash', { command: 'git log --grep upgrade; cat graded.txt' }]]);
    assert.equal(kitLeakage([words], paths).void, false);
    // The request's own file, given to the agent as it is, may be named (the maintainer, 18 November): an agent that
    // lost it to a compaction and found it on the disk read nothing it had not been given. Anything else beside it voids.
    const own = `${kit}/backlog/30-postgresql.md`;
    const self = transcript('v', 'self', [['Bash', { command: `find / -name 30-postgresql.md; cat ${own}` }]]);
    assert.equal(kitLeakage([self], paths, { allowed: [own] }).void, false);
    assert.equal(kitLeakage([self], paths).void, true);
    const beside = transcript('v', 'beside', [['Bash', { command: `cat ${own}; ls ${kit}/` }]]);
    assert.equal(kitLeakage([beside], paths, { allowed: [own] }).void, true);
    const other = transcript('v', 'other', [['Bash', { command: `cat ${kit}/backlog/31-merge-groups.md` }]]);
    assert.equal(kitLeakage([other], paths, { allowed: [own] }).void, true);
  });
});
