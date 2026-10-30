import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

import { ArchitectureContract, Rule } from './types';
import { loadArchitectureContract } from './load';
import { ExplainedChange, FeaturePlan, explainPlan } from './plan';
import { getChecklist, getConcept } from './query';
import { ExpectedStorm, STORMS_DIR, StormContextDelta, loadExpectedStorm } from './storms';
import { referenceSource } from './create';

/**
 * `clean-ddd pack --plan <file>`: what one slice of a feature needs, and nothing of the others'
 * (RFC 0001, phase 3).
 *
 * A feature written as slices, one agent per bounded context, gives each agent one plan. `plan
 * explain` expands that plan as one author writing the whole feature would read it: the other
 * side's anti-corruption handler is listed among the files to write, and a contract frozen in
 * the contract stage is "changed". Phase 2's agents had to be told in words which half was
 * theirs. The pack draws the line: what this slice writes, in its own context; what the other
 * slices write, named but not theirs; the contracts between them, frozen; the storm's part for
 * this context; the rules the slice is bound by; and, for each thing to write, the files that
 * show its shape — from the project when it has them, from the reference the package carries
 * when it does not, so that an application `create` made, which has no aggregate and no command
 * yet, still has one to read (RFC gap G7).
 *
 * It decides nothing and writes nothing: it reads the plan, the storm, the contract and the
 * reference, like `plan explain`, and says it as data.
 */

export interface PackExample {
  /** Readable from the project's root: the project's own file, or the one the package carries. */
  path: string;
  from: 'project' | 'reference';
}

export interface PackChange extends Omit<ExplainedChange, 'canonical'> {
  examples: PackExample[];
}

export interface PackContract {
  /** The public name of the fact, as the storm writes it. */
  name: string;
  direction: 'publishes' | 'consumes';
  /** The file that declares it, when it exists. */
  file?: string;
}

export interface SlicePack {
  schemaVersion: 1;
  feature: string;
  language: string;
  context: string;
  intent: string;
  /** What this slice writes, in its own context. */
  yours: PackChange[];
  /** What the feature needs from the other slices: not this slice's to write. */
  notYours: { context: string; kind: string; name: string; place: string }[];
  /** The integration contracts this slice publishes or consumes. */
  contracts: PackContract[];
  /** The storm's part for this context, and the other contexts' parts, when a storm names the feature. */
  storm?: { file: string; yours?: StormContextDelta; others: StormContextDelta[] };
  /** Decided before the slice started: not to be changed by it. */
  frozen: string[];
  rules: Pick<Rule, 'id' | 'statement' | 'remediation'>[];
  /** What says the slice is done. */
  gate: string;
}

const isFile = (path: string) => existsSync(path) && statSync(path).isFile();

/** Every file under a directory, relative to the root. */
function filesUnder(root: string, dir: string): string[] {
  const absolute = join(root, dir);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { withFileTypes: true, recursive: true })
    .filter(entry => entry.isFile())
    .map(entry => relative(root, join(entry.parentPath, entry.name)));
}

/** The storm whose feature is the plan's, if one is kept. */
function stormOf(plan: FeaturePlan, root: string): ExpectedStorm | undefined {
  const dir = join(root, STORMS_DIR);
  if (!existsSync(dir)) return undefined;
  for (const entry of readdirSync(dir).filter(name => name.endsWith('.yaml'))) {
    try {
      const storm = loadExpectedStorm(`${STORMS_DIR}/${entry}`, root);
      if (storm.feature === plan.feature) return storm;
    } catch {
      // a storm that does not load is the check's to report
    }
  }
  return undefined;
}

/**
 * The files that show the shape of a kind of thing. The reference's concept says which; each is
 * read from the project when the project has the same file, else from the reference the package
 * carries (or this checkout, when the pack is asked of the reference itself).
 */
function examplesFor(kind: string, contract: ArchitectureContract, root: string, referenceRoot: string): PackExample[] {
  let reference: ArchitectureContract;
  try {
    reference = loadArchitectureContract(referenceRoot, contract.language.id);
  } catch {
    referenceRoot = root;
    reference = contract;
  }
  const concept = getConcept(reference, getChecklist(reference, kind)?.concept ?? '');
  if (!concept) return [];
  const prefix = reference.language.root === '.' ? '' : `${reference.language.root}/`;
  const examples: PackExample[] = [];
  for (const path of [...concept.canonical, ...concept.examples]) {
    const local = path.startsWith(prefix) ? path.slice(prefix.length) : path;
    const inProject = referenceRoot === root ? path : local;
    if (existsSync(join(root, inProject))) examples.push({ path: inProject, from: 'project' });
    else if (existsSync(join(referenceRoot, path))) {
      // Inside the project (node_modules/clean-ddd/…) as a relative path; elsewhere, absolute.
      const fromRoot = relative(root, join(referenceRoot, path));
      examples.push({ path: fromRoot.startsWith('..') ? join(referenceRoot, path) : fromRoot, from: 'reference' });
    }
  }
  return examples.filter((example, index) => examples.findIndex(each => each.path === example.path) === index);
}

/** Where the examples are read from when the project has none: this checkout, or the reference the package carries. */
function defaultReference(root: string): string {
  try {
    return referenceSource(root);
  } catch {
    return root;
  }
}

export function packSlice(
  plan: FeaturePlan,
  contract: ArchitectureContract,
  root: string,
  file: string,
  reference: string = defaultReference(root),
): SlicePack {
  const explained = explainPlan(plan, contract);
  const own = `${contract.contextsTree.path}/${plan.context}/`;
  const storm = stormOf(plan, root);
  const yoursInStorm = storm?.contexts.find(context => context.id === plan.context);

  const yours: PackChange[] = [];
  const notYours: SlicePack['notYours'] = [];
  for (const change of explained.changes) {
    if (change.kind === 'integration-event') continue; // a contract, below
    if (!change.place.startsWith(own)) {
      const context = change.place.slice(contract.contextsTree.path.length + 1).split('/')[0];
      notYours.push({ context, kind: change.kind, name: change.name, place: change.place });
      continue;
    }
    yours.push({
      kind: change.kind,
      name: change.name,
      place: change.place,
      new: change.new,
      parts: change.parts,
      rules: change.rules,
      ...(change.route && { route: change.route }),
      ...(change.verb && { verb: change.verb }),
      examples: examplesFor(change.kind, contract, root, reference),
    });
  }
  for (const other of storm?.contexts.filter(context => context.id !== plan.context) ?? []) {
    for (const command of other.commands)
      notYours.push({ context: other.id, kind: 'command', name: command.name, place: '' });
    for (const query of other.queries) notYours.push({ context: other.id, kind: 'query', name: query.name, place: '' });
    for (const policy of other.policies)
      notYours.push({ context: other.id, kind: 'event-handler', name: `on ${policy.on}`, place: '' });
  }
  const seen = new Set<string>();
  const deduplicated = notYours.filter(entry => {
    const key = `${entry.context}:${entry.kind}:${entry.name.replace(/^on /, '').replace(/:.*$/, '')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // The contracts this slice is party to: what its policies consume, and what they publish.
  const contractsDir = contract.create?.contracts;
  const contractFiles = contractsDir ? filesUnder(root, contractsDir) : [];
  const fileOf = (name: string) =>
    contractFiles.find(path => isFile(join(root, path)) && readFileSync(join(root, path), 'utf8').includes(name));
  const contracts: PackContract[] = [];
  for (const policy of yoursInStorm?.policies ?? []) {
    if (policy.kind === 'integration-event')
      contracts.push({ name: policy.on, direction: 'consumes', file: fileOf(policy.on) });
    for (const name of policy.publishes) contracts.push({ name, direction: 'publishes', file: fileOf(name) });
  }
  for (const change of explained.changes.filter(each => each.kind === 'integration-event')) {
    const name = change.name.replace(/IntegrationEvent$/, '');
    if (!contracts.some(each => each.name === name))
      contracts.push({
        name,
        direction: 'publishes',
        file: existsSync(join(root, change.place)) ? change.place : undefined,
      });
  }

  const tool = contract.create?.manifest.endsWith('package.json') ? 'yarn architecture' : 'npx clean-ddd';
  return {
    schemaVersion: 1,
    feature: plan.feature,
    language: contract.language.id,
    context: plan.context,
    intent: plan.intent,
    yours,
    notYours: deduplicated,
    contracts,
    ...(storm && {
      storm: {
        file: storm.source,
        ...(yoursInStorm && { yours: yoursInStorm }),
        others: storm.contexts.filter(context => context.id !== plan.context),
      },
    }),
    frozen: [
      ...(storm ? [storm.source] : []),
      file,
      ...contracts.map(each => each.file).filter((path): path is string => Boolean(path)),
    ].filter((path, index, all) => all.indexOf(path) === index),
    rules: explained.rules,
    gate: `${tool} gate --base <the commit the slice started from>`,
  };
}

/** The pack in words, for an agent's brief or a person at a terminal. */
export function describePack(pack: SlicePack): string {
  const lines = [
    `${pack.feature} — the ${pack.context} slice, in ${pack.language}`,
    '',
    pack.intent.trim(),
    '',
    `Yours to write, under the ${pack.context} context:`,
  ];
  for (const change of pack.yours) {
    lines.push(`  ${change.new ? 'Add' : 'Change'} the ${change.kind} ${change.name} — ${change.place}`);
    if (change.verb) lines.push(`    ${change.route ?? change.verb.shape} — ${change.verb.when}`);
    for (const part of change.parts) lines.push(`    - ${part}`);
    for (const example of change.examples)
      lines.push(
        `    Read for its shape: ${example.path}${example.from === 'reference' ? ' (from the reference)' : ''}`,
      );
  }
  if (pack.contracts.length) {
    lines.push('', 'The contracts between the slices (frozen):');
    for (const each of pack.contracts)
      lines.push(`  ${each.direction} ${each.name}${each.file ? ` — ${each.file}` : ' — not written yet'}`);
  }
  if (pack.notYours.length) {
    lines.push('', 'Not yours: written by the other slices, integrated after yours.');
    for (const each of pack.notYours)
      lines.push(`  ${each.context}: the ${each.kind} ${each.name}${each.place ? ` — ${each.place}` : ''}`);
  }
  if (pack.storm?.yours) {
    const yours = pack.storm.yours;
    lines.push('', `What the storm (${pack.storm.file}) expects of ${pack.context}:`);
    for (const command of yours.commands)
      lines.push(`  the command ${command.name}: ${command.route}, by ${command.actor}`);
    for (const query of yours.queries) lines.push(`  the query ${query.name}: ${query.route}, by ${query.actor}`);
    for (const event of yours.events) lines.push(`  the event ${event}`);
    for (const policy of yours.policies)
      lines.push(
        `  the policy on ${policy.on} (${policy.kind})${policy.publishes.length ? `, publishing ${policy.publishes.join(', ')}` : ''}${policy.events.length ? `, recording ${policy.events.join(', ')}` : ''}`,
      );
  }
  lines.push('', `Frozen — decided before you started, not yours to change: ${pack.frozen.join(', ')}.`);
  lines.push('', 'Rules this slice is bound by:', ...pack.rules.map(rule => `  ${rule.id}: ${rule.statement}`));
  lines.push('', `Done when the gate passes: ${pack.gate}.`);
  return lines.join('\n');
}
