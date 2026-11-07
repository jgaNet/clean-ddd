// Two developers on request 64 (protocol.md beside this file). Usage: node run-twodev.mjs <A|B|C> <run number>
// C: as B, and an integrator: after the merge it runs the gate on main and hands each failure to the team that owns
// the file it names (two rounds at most).
// A: J5 clean-1 where it stopped (old kit). B: Full+ clean-1 at its migration (Full+ kit).
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runners } from '/home/user/clean-ddd/.claude/flow/runners.mjs';

const [arm, rep] = process.argv.slice(2);
if (!['A', 'B', 'C'].includes(arm) || !/^\d+$/.test(rep ?? '')) throw new Error('usage: run-twodev.mjs <A|B|C> <n>');
const KIT = '/home/user/clean-ddd/docs/evaluations/benchmark/openstay/j5';
const GRADER = '/home/user/clean-ddd/.claude/flow/grade.mjs';
const source = {
  A: { tree: '/tmp/claude-0/openstay/j2/clean-1/app', base: '4837e89' },
  B: { tree: '/tmp/claude-0/openstay/j5/fullplus/clean-1/app', base: '76f2576' },
}[arm === 'C' ? 'B' : arm];
const dir = `/tmp/claude-0/openstay/j5/twodev/${arm}${rep}`;
if (existsSync(dir)) throw new Error(`${dir} exists`);
mkdirSync(join(dir, 'bin'), { recursive: true });
const model = 'claude-haiku-5-5';
const port = 19970 + { A: 0, B: 10, C: 20 }[arm] + Number(rep) * 2;
const pg = 'postgresql://postgres@127.0.0.1:55448';
const env = {
  ...process.env,
  PATH: `${dir}/bin:/tmp/claude-0/node-v24.11.0-linux-x64/bin:${process.env.PATH}`,
  OPENSTAY_POSTGRES: pg,
  TEST_DATABASE_URL: `${pg}/postgres`,
  OPENSTAY_TEST_DATABASE_URL: `${pg}/postgres`,
  OPENSTAY_TEST_SERVER: `${pg}/postgres`,
  YARN_IGNORE_ENGINES: 'true',
  FORCE_COLOR: '0',
  NO_COLOR: '1',
};
delete env.DATABASE_URL;

const log = (event, fields = {}) =>
  appendFileSync(join(dir, 'events.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), event, ...fields })}\n`);
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env, maxBuffer: 1 << 28 }).trim();
const sh = (command, cwd, timeout = 2_400_000) =>
  new Promise(done => {
    const child = spawn('sh', ['-c', command], { cwd, env, detached: true });
    let out = '';
    child.stdout.on('data', chunk => (out += chunk));
    child.stderr.on('data', chunk => (out += chunk));
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {}
    }, timeout);
    child.on('close', code => {
      clearTimeout(timer);
      done({ code, out });
    });
  });
const parse = text => {
  try {
    return JSON.parse(text.slice(text.indexOf('{')));
  } catch {
    return undefined;
  }
};

// The remote: main at the base, with the storm the ladder would have committed.
const seed = join(dir, 'integration');
git('/', 'clone', '-q', '--no-hardlinks', source.tree, seed);
git(seed, 'checkout', '-q', '-B', 'main', git(source.tree, 'rev-parse', source.base));
mkdirSync(join(seed, 'conventions/storms'), { recursive: true });
copyFileSync(join(KIT, 'storms/moderation-queue.yaml'), join(seed, 'conventions/storms/moderation-queue.yaml'));
git(seed, 'add', 'conventions/storms/moderation-queue.yaml');
git(seed, '-c', 'user.name=driver', '-c', 'user.email=driver@local', 'commit', '-q', '-m', 'storm: moderation-queue, decided before the run');
const baseCommit = git(seed, 'rev-parse', 'HEAD');
git('/', 'clone', '-q', '--bare', seed, join(dir, 'remote.git'));
git(join(dir, 'remote.git'), 'symbolic-ref', 'HEAD', 'refs/heads/main');
git(seed, 'remote', 'set-url', 'origin', join(dir, 'remote.git'));
git(seed, 'fetch', '-q', 'origin');
execFileSync('cp', ['-al', join(source.tree, 'node_modules'), join(seed, 'node_modules')]);

const shared = ['^docs/', '^README\\.md$', '^CLAUDE\\.md$'];
const teams = {
  upstream: {
    branch: 'upstream',
    owns: [
      '^src/Contexts/Messaging/',
      '^src/Contexts/Reviews/',
      '^src/SharedKernel/Application/IntegrationEvents/(Messaging|Reviews)IntegrationEvents\\.ts$',
      ...shared,
    ],
    says: 'the Messaging and Reviews contexts (`src/Contexts/Messaging/`, `src/Contexts/Reviews/`) and the integration events they publish (`src/SharedKernel/Application/IntegrationEvents/MessagingIntegrationEvents.ts`, `ReviewsIntegrationEvents.ts`)',
  },
  moderation: {
    branch: 'moderation',
    owns: ['^src/Contexts/Moderation/', '^src/Bootstrap/', '^conventions/', ...shared],
    says: 'the Moderation context (`src/Contexts/Moderation/`), the composition root (`src/Bootstrap/`) and the conventions (`conventions/`)',
  },
};
const other = name => (name === 'upstream' ? 'moderation' : 'upstream');

// The channel: one append-only file, two commands.
const channelFile = join(dir, 'channel.log');
writeFileSync(channelFile, '');
writeFileSync(
  join(dir, 'bin/channel'),
  `#!/bin/bash
# channel say <text> | channel wait [seconds] | channel read
F=${channelFile}; SEEN=${dir}/.seen-$TEAM
case "$1" in
  say) shift; echo "[$(date -u +%T) $TEAM] $*" >> "$F"; wc -l < "$F" > "$SEEN"; echo "said";;
  read) cat "$F"; wc -l < "$F" > "$SEEN";;
  wait) s=\${2:-100}; [ "$s" -gt 100 ] && s=100; seen=$(cat "$SEEN" 2>/dev/null || echo 0); end=$(( $(date +%s) + s ))
    while [ "$(date +%s)" -lt $end ]; do
      new=$(tail -n +$((seen + 1)) "$F" | grep -v "^\\[[0-9:]* $TEAM\\]")
      if [ -n "$new" ]; then echo "$new"; wc -l < "$F" > "$SEEN"; exit 0; fi
      sleep 2
    done; echo "(nothing new from the other team in \${s} s; call channel wait again to keep waiting)";;
  *) echo "usage: channel say <text> | channel wait [seconds] | channel read"; exit 2;;
esac
`,
);
chmodSync(join(dir, 'bin/channel'), 0o755);

for (const [name, team] of Object.entries(teams)) {
  const cwd = join(dir, name);
  team.cwd = cwd;
  git('/', 'clone', '-q', join(dir, 'remote.git'), cwd);
  git(cwd, 'checkout', '-q', '-b', team.branch);
  git(cwd, 'config', 'user.name', `${name} team`);
  git(cwd, 'config', 'user.email', `${name}@openstay.local`);
  execFileSync('cp', ['-al', join(source.tree, 'node_modules'), join(cwd, 'node_modules')]);
  writeFileSync(
    join(cwd, '.git/hooks/pre-commit'),
    `#!/bin/bash
# Code owners: the ${name} team commits only what it owns. A merge brings the other team's files in and is not checked.
[ -f "$(git rev-parse --git-dir)/MERGE_HEAD" ] && exit 0
bad=$(git diff --cached --name-only | grep -v -E '${team.owns.join('|')}')
if [ -n "$bad" ]; then
  echo "Refused: the ${name} team does not own these files (ask the ${other(name)} team in the channel, or leave them):"
  echo "$bad" | sed 's/^/  /'
  echo "$(date -u +%T) ${name} $(echo $bad)" >> ${dir}/refused.log
  exit 1
fi
`,
  );
  chmodSync(join(cwd, '.git/hooks/pre-commit'), 0o755);
}

const request = readFileSync(join(KIT, 'backlog/64-moderation-queue.md'), 'utf8').trim();
const brief = (name, teamPort) => {
  const team = teams[name];
  const them = teams[other(name)];
  return [
    'You are one of two developers writing an application built on the clean-ddd architecture, one feature at a time. This is feature 64 of 100; the earlier ones are in the code.',
    'Read `CLAUDE.md` first and follow it. Do not ask questions of the user: decide, and say in your final report what was unclear.',
    '',
    "The feature's storm, decided with the product's owner before you started, is `conventions/storms/moderation-queue.yaml`: its hot spots are decided, do not change them. `yarn architecture storm --expect conventions/storms/moderation-queue.yaml` says what the code still owes it.",
    '',
    `**Your team.** You are the ${name} team, on the branch \`${team.branch}\`. You own ${team.says}; the documents under \`docs/\` are everyone's. The ${other(name)} team owns ${them.says}, and is working on this same feature right now, in its own clone, on the branch \`${them.branch}\`. Neither team changes the rest of the code. The repository's hook refuses a commit that touches a file you do not own, as a code owner would: what you need there, ask the ${other(name)} team for.`,
    '',
    `**Talking to the ${other(name)} team.** Only through the channel:`,
    '- `channel say "<text>"` writes to it;',
    `- \`channel wait\` waits until the ${other(name)} team writes (100 seconds at most per call; call it again to wait longer) and prints what it wrote;`,
    '- `channel read` prints everything said so far.',
    `Its work reaches you only when it pushes: \`git fetch origin\`, then read \`origin/${them.branch}\`. Push your branch (\`git push origin ${team.branch}\`) whenever the ${other(name)} team should see your work; never push another branch. The two branches are merged into \`main\` when both teams are done.`,
    '',
    `You are done when \`yarn architecture gate --base main --mode architecture --fix\` passes on your branch and the storm owes nothing, or when what is left is the ${other(name)} team's: then say so in the channel and in your final report. Commit your work and push your branch. If you start a server, use port ${teamPort}.`,
    '',
    'The feature, in product words, with the API it answers:',
    '',
    request,
  ].join('\n');
};

const gate = async cwd => {
  const out = (await sh('yarn -s architecture gate --base main --mode architecture --fix --json', cwd)).out;
  const gated = parse(out);
  if (!gated) return { pass: false, lines: ['the gate did not answer', ...out.split('\n').slice(-15)] };
  const failing = (gated.steps ?? []).filter(step => step.status === 'fail');
  return { pass: failing.length === 0, lines: failing.flatMap(step => [`${step.name}:`, ...(step.lines ?? []).map(l => `  ${l}`)]) };
};
const costs = [];
const turn = async (name, prompt, again) => {
  const team = teams[name];
  log('agent-start', { team: name, again: Boolean(again) });
  const result = await runners['claude-cli'].run({
    prompt,
    cwd: team.cwd,
    project: team.cwd,
    model,
    again,
    env: { ...env, TEAM: name, PORT: String(team.port) },
    timeoutMs: 90 * 60_000,
    maxBudgetUsd: 12,
    onProcess: () => {},
  });
  const before = again ? (team.reported ?? 0) : 0;
  team.reported = result.costUsd ?? before;
  const cost = Math.max(0, (result.costUsd ?? 0) - before);
  costs.push({ team: name, again: Boolean(again), cost });
  const { report, ...figures } = result;
  log('agent-finished', { team: name, ...figures, costUsd: cost, report });
  return result;
};
const push = name => {
  const team = teams[name];
  const dirty = git(team.cwd, 'status', '--porcelain');
  try {
    git(team.cwd, 'push', '-q', 'origin', team.branch);
  } catch (error) {
    log('push-failed', { team: name, error: String(error.message).slice(0, 400) });
  }
  log('pushed', { team: name, head: git(team.cwd, 'rev-parse', 'HEAD'), uncommitted: dirty.split('\n').filter(Boolean).length });
};

const work = async name => {
  const team = teams[name];
  await turn(name, brief(name, team.port));
  let gated = await gate(team.cwd);
  log('team-gate', { team: name, pass: gated.pass, lines: gated.lines.slice(0, 40) });
  if (!gated.pass) {
    await turn(
      name,
      `The driver checked your branch and it is not done:\n\n${gated.lines.slice(0, 60).join('\n')}\n\nFix what is yours, then commit and push; what is the ${other(name)} team's, settle with it in the channel. The request is unchanged.`,
      true,
    );
    gated = await gate(team.cwd);
    log('team-gate', { team: name, pass: gated.pass, lines: gated.lines.slice(0, 40), after: 'feedback' });
  }
  push(name);
};

const started = Date.now();
teams.upstream.port = port;
teams.moderation.port = port + 1;
log('start', { arm, rep, source: source.tree, base: source.base, baseCommit, model });
await Promise.all([work('upstream'), work('moderation')]);
const worked = Date.now();

// Integration: upstream first, then moderation; one resolution turn on a conflict.
const merge = branch => {
  git(seed, 'fetch', '-q', 'origin');
  try {
    git(seed, '-c', 'user.name=driver', '-c', 'user.email=driver@local', 'merge', '--no-ff', '-q', '-m', `Merge ${branch}`, `origin/${branch}`);
    return [];
  } catch {
    const files = git(seed, 'diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
    git(seed, 'merge', '--abort');
    return files;
  }
};
let conflicts = merge('upstream');
if (conflicts.length) log('conflict', { branch: 'upstream', files: conflicts });
git(seed, 'push', '-q', 'origin', 'main');
conflicts = merge('moderation');
let integrated = conflicts.length === 0;
if (!integrated) {
  log('conflict', { branch: 'moderation', files: conflicts });
  await turn(
    'moderation',
    `The upstream team's branch is merged into \`main\`, and your branch conflicts with it in: ${conflicts.join(', ')}. Merge \`origin/main\` into your branch, resolve the conflicts, make the gate pass again, then commit and push your branch.`,
    true,
  );
  push('moderation');
  conflicts = merge('moderation');
  integrated = conflicts.length === 0;
  if (!integrated) log('conflict', { branch: 'moderation', files: conflicts, after: 'resolution' });
}
log('integrated', { integrated, head: git(seed, 'rev-parse', 'HEAD') });

// Arm C: the integrator. It runs the gate on the merged main and hands each failure to the team that owns the file
// the failure names (a failure that names no owned file goes to Moderation, whose feature it is); two rounds at most.
const rounds = [];
const owner = file =>
  Object.keys(teams).find(name => new RegExp(teams[name].owns.filter(o => !shared.includes(o)).join('|')).test(file));
if (arm === 'C' && integrated) {
  for (let round = 1; round <= 2; round++) {
    git(seed, 'push', '-q', 'origin', 'main');
    const out = (await sh(`yarn -s architecture gate --base ${baseCommit} --mode architecture --json`, seed)).out;
    const gated = parse(out);
    const failing = gated ? (gated.steps ?? []).filter(step => step.status === 'fail') : [{ name: 'the gate did not answer', lines: out.split('\n').slice(-10) }];
    if (gated && failing.length === 0) {
      rounds.push({ round, pass: true });
      log('integrator', { round, pass: true });
      break;
    }
    const assigned = { upstream: [], moderation: [] };
    for (const step of failing) {
      const text = [step.name, ...(step.lines ?? [])].join('\n');
      const files = [...new Set(text.match(/(?:src|conventions|docs)\/[^\s:()'"]+\.[a-z]+/g) ?? [])];
      const owners = new Set(files.map(owner).filter(Boolean));
      if (owners.size === 0) owners.add('moderation');
      const block = [`${step.name}:`, ...(step.lines ?? []).slice(-60).map(line => `  ${line}`)];
      for (const name of owners) assigned[name].push(...block);
    }
    rounds.push({ round, pass: false, assigned: { upstream: assigned.upstream.length, moderation: assigned.moderation.length } });
    log('integrator', { round, pass: false, assigned });
    await Promise.all(
      Object.entries(assigned)
        .filter(([, block]) => block.length)
        .map(async ([name, block]) => {
          await turn(
            name,
            [
              "The integrator merged both teams' branches into `main` and ran the gate on it. These failures name files your team owns (or name no team's file, and the feature is Moderation's):",
              '',
              ...block,
              '',
              `Merge \`origin/main\` into your branch (\`git pull --no-rebase origin main\`), fix what is yours, run the gate, then commit and push your branch. Read the channel first (\`channel read\`): the ${other(name)} team may have asked you for something. What is the ${other(name)} team's, tell it in the channel.`,
            ].join('\n'),
            true,
          );
          push(name);
        }),
    );
    const again = [...merge('upstream'), ...merge('moderation')];
    if (again.length) {
      log('conflict', { round, files: again });
      integrated = false;
      break;
    }
  }
  if (rounds.length && !rounds.at(-1).pass) log('integrator', { after: 'last round', note: 'the gate on main was not run again' });
  log('integrated', { integrated, head: git(seed, 'rev-parse', 'HEAD'), after: 'integrator' });
}

let graded;
if (integrated) {
  git(seed, 'push', '-q', 'origin', 'main');
  const out = join(dir, 'grade.json');
  await sh(
    `node ${GRADER} --project ${seed} --ref HEAD --base ${baseCommit} --kit ${KIT} --upto 64 --only reporting-a-message,review-rules,reporting-a-listing,moderation-queue --keep false --out ${out} > ${dir}/grade.log 2>&1`,
    '/home/user/clean-ddd',
    3_600_000,
  );
  const report = existsSync(out) ? parse(readFileSync(out, 'utf8')) : undefined;
  graded = report && {
    M1: { verdict: report.M1?.verdict, failing: (report.M1?.failing ?? []).map(step => step.name) },
    features: report.features.map(f => ({ feature: f.feature, pass: f.M2.pass, failed: f.M2.failed, said: f.M2.said?.slice(0, 12) })),
  };
}
const channel = readFileSync(channelFile, 'utf8').split('\n').filter(Boolean);
const refused = existsSync(join(dir, 'refused.log')) ? readFileSync(join(dir, 'refused.log'), 'utf8').split('\n').filter(Boolean) : [];
const touched = name =>
  git(seed, 'diff', '--name-only', `${baseCommit}...origin/${teams[name].branch}`)
    .split('\n')
    .filter(Boolean)
    .filter(file => !new RegExp(teams[name].owns.join('|')).test(file));
const summary = {
  arm,
  rep,
  integrated,
  rounds,
  delivered: Boolean(graded && graded.M1.verdict === 'pass' && graded.features.every(f => f.pass)),
  graded,
  costUsd: Number(costs.reduce((sum, c) => sum + c.cost, 0).toFixed(2)),
  costs,
  wallMinutes: { work: Math.round((worked - started) / 60000), total: Math.round((Date.now() - started) / 60000) },
  channel: { messages: channel.length, byTeam: { upstream: channel.filter(l => / upstream\]/.test(l)).length, moderation: channel.filter(l => / moderation\]/.test(l)).length } },
  refusedCommits: refused.length,
  filesOutsideOwnership: { upstream: touched('upstream'), moderation: touched('moderation') },
};
writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary, null, 1));
log('finished', summary);
console.log(JSON.stringify(summary, null, 1));
