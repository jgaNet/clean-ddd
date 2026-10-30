#!/usr/bin/env node
/**
 * A kit rehearsed before its runs: the hidden tests run against trees that exist, so that a defect
 * of the kit is found before agents are paid to find it (every campaign so far found its kit's
 * defects while grading: files the trees' own checks refuse, a test that fails on every correct
 * solution, an earlier feature's assertion a later feature supersedes, a test no tree fails).
 *
 *   node .claude/flow/dry-run.mjs --plan <dry-run.yaml> [--out <report.json>]
 *
 *   kit: docs/evaluations/benchmark/robustness      # relative to the plan
 *   regression: docs/evaluations/benchmark           # optional: the kit whose features the trees already had
 *   trees:
 *     - { name: a3, arm: A, project: /runs/a3/app, before: 0aa7932, solved: main }
 *     - { name: p2, arm: P, project: /runs/p2/app, before: d23bdd0 }      # no solved tree yet
 *   tooling: /path/to/clean-ddd.tgz                  # optional, for arm A, as the grader takes it
 *
 * A tree's `before` is the commit the runs would start from; `solved`, when there is one, a commit
 * where the kit's features are written (by an earlier run, or by hand). Each is graded by
 * grade.mjs, one after the other (grading in parallel timed tests out before). Then:
 *
 * - **hygiene**: the kit's files in the tree, held to the tree's own formatter, linter and type
 *   checker, which the agent's verdict runs over them;
 * - **discrimination**: a feature's test that passes on a `before` tree tests nothing there;
 * - **solvability**: a feature's test that fails on every `solved` tree is suspected first, one that
 *   fails on some is read;
 * - **regression**: with `regression`, an earlier feature's test that passes before and fails on a
 *   solved tree is a regression or an assertion a new feature supersedes, to read either way.
 *
 * The verdict is `defect` (the kit is wrong, fix it before any run), `read` (a person decides) or
 * `clean`. It runs no agent and costs nothing but the machine.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ARMS = { A: [], D: ['--control', 'prose'], P: ['--control', 'plain'] };

/**
 * The verdict, from what each grading found. `gradings` holds, per tree and role, the features'
 * pass/fail (`features`), the regression kit's (`regression`, solved only) and the hygiene lines.
 */
export function judge(gradings, { features, regressionFeatures = [] }) {
  const findings = [];
  const add = (level, feature, message) => findings.push({ level, feature, message });

  // One finding per hygiene problem, with every tree it was found in: the kit's file is the same everywhere.
  const hygiene = new Map();
  for (const each of gradings)
    for (const line of each.hygiene ?? []) hygiene.set(line, [...(hygiene.get(line) ?? []), each.tree]);
  for (const [line, trees] of hygiene) add('defect', undefined, `${line} (in ${[...new Set(trees)].join(', ')})`);

  const befores = gradings.filter(each => each.role === 'before');
  const solveds = gradings.filter(each => each.role === 'solved');
  for (const feature of features) {
    const passingBefore = befores.filter(each => each.features[feature] === true).map(each => each.tree);
    if (passingBefore.length)
      add(
        'read',
        feature,
        `passes before the feature is written, on ${passingBefore.join(', ')}: it tests nothing there`,
      );
    const failingSolved = solveds.filter(each => each.features[feature] === false).map(each => each.tree);
    if (failingSolved.length && failingSolved.length === solveds.length && solveds.length > 1)
      add('defect', feature, `fails on every solved tree (${failingSolved.join(', ')}): suspect the kit first`);
    else if (failingSolved.length)
      add('read', feature, `fails on the solved ${failingSolved.join(', ')}: the kit, or that tree`);
  }
  for (const feature of regressionFeatures) {
    const broken = solveds
      .filter(each => each.regression?.[feature] === false)
      .filter(each => befores.find(before => before.tree === each.tree)?.regression?.[feature] !== false)
      .map(each => each.tree);
    if (broken.length)
      add(
        'read',
        feature,
        `an earlier feature's test fails after the kit's features, on ${broken.join(', ')}: a regression, or an assertion a new feature supersedes`,
      );
  }
  const verdict = findings.some(f => f.level === 'defect') ? 'defect' : findings.length ? 'read' : 'clean';
  return { verdict, findings };
}

/** The lines of a check that name the kit's files: what the kit, not the tree, brought. */
export function kitLines(output, directory) {
  return output
    .split('\n')
    .filter(line => line.includes(directory))
    .map(line => line.trim())
    .slice(0, 10);
}

/** ESLint's JSON report as one line per problem, `file:line:column: message [rule]` (it has no line format of its own). */
export function eslintLines(json) {
  try {
    return JSON.parse(json)
      .flatMap(file => file.messages.map(m => `${file.filePath}:${m.line}:${m.column}: ${m.message} [${m.ruleId}]`))
      .join('\n');
  } catch {
    return json;
  }
}

function main() {
  const args = process.argv.slice(2);
  const option = name => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);
  const planFile = resolve(option('plan') ?? (process.stderr.write('--plan is required\n'), process.exit(2)));
  const here = dirname(fileURLToPath(import.meta.url));
  const yaml = createRequire(join(here, '../../package.json'))('js-yaml');
  const plan = yaml.load(readFileSync(planFile, 'utf8'));
  const kit = resolve(dirname(planFile), plan.kit);
  const regression = plan.regression ? resolve(dirname(planFile), plan.regression) : undefined;
  const ids = dir => yaml.load(readFileSync(join(dir, 'backlog/backlog.yaml'), 'utf8')).features.map(f => f.id);
  const scratch = mkdtempSync(join(tmpdir(), 'dry-run-'));

  const grade = (tree, ref, kitDir) => {
    const out = join(scratch, `${tree.name}-${ref}-${relative(dirname(kitDir), kitDir).replace(/\W/g, '_')}.json`);
    const run = spawnSync(
      process.execPath,
      [
        join(here, 'grade.mjs'),
        ...['--project', tree.project, '--ref', ref, '--base', tree.before, '--kit', kitDir, '--out', out],
        ...ARMS[tree.arm],
        ...(tree.arm === 'A' && plan.tooling ? ['--tooling', plan.tooling] : []),
      ],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
    if (!existsSync(out))
      throw new Error(`grading ${tree.name} at ${ref} wrote no report:\n${run.stderr.slice(-2000)}`);
    const report = JSON.parse(readFileSync(out, 'utf8'));
    const commit = report.commit.slice(0, 12);
    return {
      report,
      graded: join(`${tree.project}.flow`, 'grade', commit),
      features: Object.fromEntries(report.features.map(f => [f.feature, f.M2.pass])),
    };
  };

  /** The tree's own checks, over the kit's files only, as the agent's verdict would run them. */
  const hygiene = (graded, arm) => {
    const directory = arm === 'P' ? 'src/acceptance' : 'src/Bootstrap/Fastify/Acceptance';
    const sh = command =>
      spawnSync('sh', ['-c', command], { cwd: graded, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const lines = [];
    const format = sh(`npx prettier --check '${directory}/**/*.ts'`);
    if (format.status !== 0) lines.push(...kitLines(format.stdout + format.stderr, directory).map(l => `format: ${l}`));
    const lint = sh(`npx eslint --format json '${directory}'`);
    if (lint.status !== 0) lines.push(...kitLines(eslintLines(lint.stdout), directory).map(l => `lint: ${l}`));
    const types = sh('npx tsc --noEmit -p tsconfig.json');
    lines.push(...kitLines(types.stdout + types.stderr, directory).map(l => `types: ${l}`));
    // Paths from the directory on, so that the same problem reads the same in every tree.
    return [...new Set(lines.map(line => line.replace(new RegExp(`^(\\w+: ).*?(${directory})`), '$1$2')))];
  };

  const gradings = [];
  for (const tree of plan.trees) {
    for (const role of ['before', 'solved']) {
      const ref = tree[role];
      if (!ref) continue;
      process.stdout.write(`${tree.name} ${role} (${ref}) …\n`);
      const graded = grade(tree, ref, kit);
      const entry = {
        tree: tree.name,
        role,
        ref,
        features: graded.features,
        hygiene: hygiene(graded.graded, tree.arm),
      };
      if (regression) entry.regression = grade(tree, ref, regression).features;
      gradings.push(entry);
    }
  }
  const verdict = judge(gradings, { features: ids(kit), regressionFeatures: regression ? ids(regression) : [] });
  const report = { schemaVersion: 1, kit: relative(process.cwd(), kit), gradings, ...verdict };
  const out = option('out');
  if (out) writeFileSync(resolve(out), `${JSON.stringify(report, null, 2)}\n`);
  rmSync(scratch, { recursive: true, force: true });
  process.stdout.write(`\ndry run of ${report.kit}: ${verdict.verdict.toUpperCase()}\n`);
  for (const f of verdict.findings)
    process.stdout.write(`  ${f.level}: ${f.feature ? `${f.feature}: ` : ''}${f.message}\n`);
  process.exit(verdict.verdict === 'defect' ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
