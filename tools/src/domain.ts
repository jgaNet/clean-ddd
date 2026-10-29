import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, posix } from 'path';
import { load } from 'js-yaml';

import { ArchitectureContract, ContractError, SUPPORTED_SCHEMA_VERSION } from './types';
import { relink } from './render';

/**
 * The domain map: conventions/domain.yaml, the strategic half of the design as data — the
 * subdomains and their kind, each bounded context's purpose and language, and the context map
 * (every relationship between two contexts, with its pattern, its mechanism and its reason).
 *
 * The map declares what the code cannot say and nothing the code already says. The contracts a
 * relationship carries are read from the code (`inspectContextLinks`, which walks this language's
 * tree), and the check holds the two to each other both ways (`checkDomainAgainstLinks`,
 * CTX-MAP-DECLARED): a declared relationship nothing carries, or a link nothing declares, is a
 * problem. Like the contract, the map names no file of any language.
 *
 * A repository without the file has no map yet (an application just created): every function
 * here then has nothing to say, and the check and the documents skip it.
 */

export const DOMAIN_FILE = 'conventions/domain.yaml';

export const SUBDOMAIN_KINDS = ['core', 'supporting', 'generic'] as const;
export type SubdomainKind = (typeof SUBDOMAIN_KINDS)[number];

/** The two contracts between contexts (CTX-CONTRACTS), as the two mechanisms a relationship can run on. */
export const MECHANISMS = ['integration-event', 'owned-port'] as const;
export type Mechanism = (typeof MECHANISMS)[number];

export const PATTERNS = [
  'published-language',
  'open-host-service',
  'customer-supplier',
  'conformist',
  'anti-corruption-layer',
] as const;
export type Pattern = (typeof PATTERNS)[number];

/**
 * Which patterns a mechanism can carry. An integration event is a published language (or an
 * open host service) the consumer conforms to or protects itself from; an owned port is a
 * customer's question, which its adapter translates or takes as is.
 */
export const PATTERNS_OF: Record<Mechanism, Pattern[]> = {
  'integration-event': ['published-language', 'open-host-service', 'anti-corruption-layer', 'conformist'],
  'owned-port': ['customer-supplier', 'anti-corruption-layer', 'conformist'],
};

export interface Subdomain {
  id: string;
  name: string;
  kind: SubdomainKind;
  why: string;
  contexts: string[];
}

export interface Term {
  term: string;
  meaning: string;
}

export interface DomainContext {
  /** The context's name, as every binding declares it. */
  id: string;
  purpose: string;
  language: Term[];
}

export interface Relationship {
  upstream: string;
  downstream: string;
  patterns: Pattern[];
  mechanism: Mechanism;
  why: string;
}

export interface DomainMap {
  schemaVersion: number;
  name: string;
  purpose: string;
  subdomains: Subdomain[];
  contexts: DomainContext[];
  relationships: Relationship[];
  sharedKernel: { holds: string; why: string };
  source: string;
}

/** A strategic concept, from concepts.yaml: shown by the domain map, not by a language's file. */
export interface StrategicConcept {
  id: string;
  name: string;
  description: string;
  /** Where it is in this repository, Markdown; names the map or a decision, never a language's file. */
  where: string;
  references: string[];
}

/** A relationship the code carries: one mechanism, one pair of contexts, the contracts found and where. */
export interface ContextLink {
  mechanism: Mechanism;
  upstream: string;
  downstream: string;
  /** The public names of the integration events, or the ports (without their `I`), the pair talks through. */
  contracts: string[];
  /** The files the link was read from, repository-relative. */
  evidence: string[];
}

type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** The map, or undefined when the repository has none; throws a ContractError when the file is not a map. */
export function loadDomainMap(root: string): DomainMap | undefined {
  const path = join(root, DOMAIN_FILE);
  if (!existsSync(path)) return undefined;
  const raw = load(readFileSync(path, 'utf8'));
  if (!isObject(raw)) throw new ContractError(`${DOMAIN_FILE} is not a YAML mapping`, 'malformed');
  if (typeof raw.schemaVersion !== 'number')
    throw new ContractError(`${DOMAIN_FILE} has no schemaVersion`, 'malformed');
  if (raw.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new ContractError(
      `${DOMAIN_FILE} is schemaVersion ${raw.schemaVersion}; this tooling understands ${SUPPORTED_SCHEMA_VERSION}`,
      'unsupported-schema-version',
    );
  }
  for (const key of ['subdomains', 'contexts', 'relationships']) {
    if (!Array.isArray(raw[key]))
      throw new ContractError(`${DOMAIN_FILE}: "${key}" is missing or malformed`, 'malformed');
  }
  const kernel = isObject(raw.sharedKernel) ? raw.sharedKernel : {};
  return {
    schemaVersion: raw.schemaVersion,
    name: text(raw.name),
    purpose: text(raw.purpose),
    subdomains: (raw.subdomains as unknown[]).filter(isObject).map(entry => ({
      id: text(entry.id),
      name: text(entry.name),
      kind: text(entry.kind) as SubdomainKind,
      why: text(entry.why),
      contexts: strings(entry.contexts),
    })),
    contexts: (raw.contexts as unknown[]).filter(isObject).map(entry => ({
      id: text(entry.id),
      purpose: text(entry.purpose),
      language: (Array.isArray(entry.language) ? entry.language : [])
        .filter(isObject)
        .map(term => ({ term: text(term.term), meaning: text(term.meaning) })),
    })),
    relationships: (raw.relationships as unknown[]).filter(isObject).map(entry => ({
      upstream: text(entry.upstream),
      downstream: text(entry.downstream),
      patterns: strings(entry.patterns) as Pattern[],
      mechanism: text(entry.mechanism) as Mechanism,
      why: text(entry.why),
    })),
    sharedKernel: { holds: text(kernel.holds), why: text(kernel.why) },
    source: DOMAIN_FILE,
  };
}

/** The strategic concepts of concepts.yaml (`strategic:`), empty when the file lists none. */
export function loadStrategicConcepts(root: string, file = 'conventions/concepts.yaml'): StrategicConcept[] {
  const path = join(root, file);
  if (!existsSync(path)) return [];
  const raw = load(readFileSync(path, 'utf8'));
  if (!isObject(raw) || !Array.isArray(raw.strategic)) return [];
  return raw.strategic.filter(isObject).map(entry => ({
    id: text(entry.id),
    name: text(entry.name),
    description: text(entry.description),
    where: text(entry.where),
    references: strings(entry.references),
  }));
}

const namesAFile = (value: string) => /\.(ts|js|rs|py|go|java|kt|cs)\b/.test(value) || /(^|\/)src\//.test(value);

/**
 * Everything the map can get wrong on its own and against the bindings: the contexts are the
 * ones every binding declares, each in exactly one subdomain; every relationship names two
 * different contexts, a mechanism, patterns that mechanism can carry; no pair is declared twice
 * on one mechanism; nothing names a file of one language.
 */
export function validateDomainMap(map: DomainMap, contracts: ArchitectureContract[], root: string): string[] {
  const problems: string[] = [];
  const where = map.source;
  const contextIds = map.contexts.map(context => context.id);
  const known = new Set(contextIds);

  if (!map.name) problems.push(`${where}: "name" is missing`);
  if (!map.purpose) problems.push(`${where}: "purpose" is missing`);
  for (const id of contextIds.filter((id, index) => contextIds.indexOf(id) !== index)) {
    problems.push(`${where}: the context ${id} is declared twice`);
  }
  for (const contract of contracts) {
    for (const id of contract.contexts) {
      if (!known.has(id))
        problems.push(
          `${where}: ${contract.sources.binding} declares the context ${id}, which the map does not describe; every context has a purpose`,
        );
    }
    for (const id of contextIds) {
      if (!contract.contexts.includes(id))
        problems.push(`${where}: describes the context ${id}, which ${contract.sources.binding} does not declare`);
    }
  }
  for (const context of map.contexts) {
    if (!context.purpose) problems.push(`${where}: the context ${context.id} has no purpose`);
    for (const term of context.language) {
      if (!term.term || !term.meaning) problems.push(`${where}: a term of ${context.id} has no term or no meaning`);
    }
  }

  const subdomainIds = new Set<string>();
  const placed = new Map<string, string[]>();
  for (const subdomain of map.subdomains) {
    const at = `${where} subdomain "${subdomain.id || '(no id)'}"`;
    if (!subdomain.id) problems.push(`${at}: has no id`);
    if (subdomainIds.has(subdomain.id)) problems.push(`${at}: duplicate id`);
    subdomainIds.add(subdomain.id);
    if (!SUBDOMAIN_KINDS.includes(subdomain.kind))
      problems.push(`${at}: kind must be one of ${SUBDOMAIN_KINDS.join(', ')}`);
    if (!subdomain.why)
      problems.push(`${at}: "why" is missing — the kind is a judgement, and a judgement has a reason`);
    if (!subdomain.contexts.length) problems.push(`${at}: holds no context`);
    for (const id of subdomain.contexts) {
      if (!known.has(id)) problems.push(`${at}: names the context ${id}, which the map does not describe`);
      placed.set(id, [...(placed.get(id) ?? []), subdomain.id]);
    }
  }
  for (const id of contextIds) {
    const owners = placed.get(id) ?? [];
    if (owners.length !== 1)
      problems.push(
        `${where}: the context ${id} is in ${owners.length ? owners.join(' and ') : 'no subdomain'}; a context belongs to exactly one`,
      );
  }

  const pairs = new Set<string>();
  for (const relationship of map.relationships) {
    const at = `${where} relationship ${relationship.upstream || '?'} → ${relationship.downstream || '?'}`;
    for (const side of ['upstream', 'downstream'] as const) {
      if (!known.has(relationship[side]))
        problems.push(`${at}: ${side} ${relationship[side] || '(missing)'} is not a context of the map`);
    }
    if (relationship.upstream && relationship.upstream === relationship.downstream)
      problems.push(`${at}: a relationship is between two different contexts`);
    if (!MECHANISMS.includes(relationship.mechanism)) {
      problems.push(
        `${at}: mechanism must be ${MECHANISMS.join(' or ')} — the only two contracts between contexts (CTX-CONTRACTS)`,
      );
    } else {
      const allowed = PATTERNS_OF[relationship.mechanism];
      for (const pattern of relationship.patterns) {
        if (!PATTERNS.includes(pattern)) problems.push(`${at}: "${pattern}" is not a pattern (${PATTERNS.join(', ')})`);
        else if (!allowed.includes(pattern))
          problems.push(
            `${at}: an ${relationship.mechanism} cannot carry "${pattern}"; it carries ${allowed.join(', ')}`,
          );
      }
    }
    if (!relationship.patterns.length) problems.push(`${at}: names no pattern`);
    if (!relationship.why) problems.push(`${at}: "why" is missing`);
    const key = `${relationship.upstream}→${relationship.downstream}:${relationship.mechanism}`;
    if (pairs.has(key)) problems.push(`${at}: declared twice on the same mechanism`);
    pairs.add(key);
  }

  const rawText = existsSync(join(root, where)) ? readFileSync(join(root, where), 'utf8') : '';
  for (const line of rawText.split('\n')) {
    if (!line.trim().startsWith('#') && namesAFile(line))
      problems.push(
        `${where}: "${line.trim()}" names a file of one language; the map is true in every language (ARCH-ONE-CONTRACT)`,
      );
  }
  return problems;
}

const walk = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
        entry.isDirectory()
          ? walk(join(dir, entry.name))
          : entry.name.endsWith('.ts') && !/\.spec(-helper)?\.ts$/.test(entry.name)
            ? [join(dir, entry.name)]
            : [],
      )
    : [];

/**
 * The relationships this language's code carries, read from the tree the binding describes:
 * an integration event is a link from every context that publishes it (`X.set(` or `new X(`)
 * to every context whose wiring subscribes to it; an import of another context through the
 * contexts alias, outside the specs, is a link on an owned port, named after the port the
 * importing file implements. The contracts of a link are what the map renders and never
 * declares.
 */
/** One source file of this language's tree, repository-relative, with its text. */
export interface SourceFile {
  path: string;
  text: string;
}

/** Every non-spec source file of each declared context, read once, keyed by context. */
export function readContextFiles(contract: ArchitectureContract, root: string): Map<string, SourceFile[]> {
  const relativeTo = (path: string) =>
    posix.normalize(
      path
        .slice(root.length + 1)
        .split('\\')
        .join('/'),
    );
  const contextsDir = join(root, contract.contextsTree.path);
  const files = new Map<string, SourceFile[]>();
  for (const context of contract.contexts) {
    files.set(
      context,
      walk(join(contextsDir, context)).map(path => ({ path: relativeTo(path), text: readFileSync(path, 'utf8') })),
    );
  }
  return files;
}

export function inspectContextLinks(contract: ArchitectureContract, root: string): ContextLink[] {
  const files = readContextFiles(contract, root);

  const events = new Set<string>();
  for (const path of walk(join(root, contract.kernel.path, 'Application', 'IntegrationEvents'))) {
    for (const match of readFileSync(path, 'utf8').matchAll(/export class (\w+)IntegrationEvent\b/g))
      events.add(match[1]);
  }

  const links = new Map<string, ContextLink>();
  const link = (mechanism: Mechanism, upstream: string, downstream: string, contract: string, evidence: string) => {
    const key = `${mechanism}:${upstream}→${downstream}`;
    const existing = links.get(key) ?? { mechanism, upstream, downstream, contracts: [], evidence: [] };
    if (contract && !existing.contracts.includes(contract)) existing.contracts.push(contract);
    if (!existing.evidence.includes(evidence)) existing.evidence.push(evidence);
    links.set(key, existing);
  };

  for (const name of events) {
    const builds = new RegExp(`\\b${name}IntegrationEvent\\.set\\(|new ${name}IntegrationEvent\\(`);
    const publishers = contract.contexts.filter(context => files.get(context)!.some(file => builds.test(file.text)));
    const consumers = contract.contexts.filter(context =>
      files
        .get(context)!
        .some(file => file.path.endsWith(`/${contract.wiring}`) && file.text.includes(`${name}IntegrationEvent`)),
    );
    for (const upstream of publishers) {
      for (const downstream of consumers) {
        if (upstream === downstream) continue;
        const where = files.get(upstream)!.find(file => builds.test(file.text))!.path;
        link('integration-event', upstream, downstream, name, where);
      }
    }
  }

  const alias = contract.contextsTree.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const imports = new RegExp(`from '${alias}/(\\w+)/`, 'g');
  for (const [context, own] of files) {
    for (const file of own) {
      for (const match of file.text.matchAll(imports)) {
        const other = match[1];
        if (other === context || !contract.contexts.includes(other)) continue;
        const port = file.text.match(/implements I(\w+)\b/)?.[1] ?? '';
        link('owned-port', other, context, port, file.path);
      }
    }
  }
  return [...links.values()].sort((a, b) =>
    `${a.upstream}${a.downstream}`.localeCompare(`${b.upstream}${b.downstream}`),
  );
}

/** The map against the code, both ways (CTX-MAP-DECLARED). */
export function checkDomainAgainstLinks(map: DomainMap, links: ContextLink[], language: string): string[] {
  const problems: string[] = [];
  const same = (a: { upstream: string; downstream: string; mechanism: Mechanism }, b: typeof a) =>
    a.upstream === b.upstream && a.downstream === b.downstream && a.mechanism === b.mechanism;
  for (const relationship of map.relationships) {
    if (!links.some(found => same(found, relationship))) {
      problems.push(
        `CTX-MAP-DECLARED: ${map.source} declares ${relationship.upstream} → ${relationship.downstream} over an ${relationship.mechanism}, which nothing in the ${language} code carries`,
      );
    }
  }
  for (const found of links) {
    if (!map.relationships.some(relationship => same(found, relationship))) {
      problems.push(
        `CTX-MAP-DECLARED: ${found.evidence[0]} makes ${found.downstream} depend on ${found.upstream} over an ${found.mechanism} (${found.contracts.join(', ') || 'no named contract'}), a relationship ${map.source} does not declare; a new relationship between two contexts is a decision`,
      );
    }
  }
  return problems;
}

/** The link the code carries for a declared relationship, if any. */
export const linkOf = (relationship: Relationship, links: ContextLink[]): ContextLink | undefined =>
  links.find(
    found =>
      found.upstream === relationship.upstream &&
      found.downstream === relationship.downstream &&
      found.mechanism === relationship.mechanism,
  );

const cell = (value: string) => value.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
const row = (cells: string[]) => `| ${cells.map(cell).join(' | ')} |`;
const table = (headers: string[], rows: string[][]) =>
  [row(headers), row(headers.map(() => '---')), ...rows.map(row)].join('\n');
const title = (word: string) => `${word[0].toUpperCase()}${word.slice(1)}`;
const spell = (pattern: string) => pattern.replace(/-/g, ' ');

export const DOMAIN_MARKER = `<!-- generated from conventions/domain.yaml (map); edit the YAML, then run the conventions check with --write -->`;

/**
 * The strategic view of the root README: the subdomains, the context map as a diagram and as a
 * table (its contracts read from the code), each context's purpose and language, the shared
 * kernel, and where each strategic concept is shown.
 */
export function renderDomain(map: DomainMap, links: ContextLink[], strategic: StrategicConcept[], at = '.'): string {
  const subdomainOf = (context: string) => map.subdomains.find(subdomain => subdomain.contexts.includes(context));
  const diagram = [
    '```mermaid',
    'flowchart LR',
    ...map.subdomains.flatMap(subdomain => [
      `  subgraph ${subdomain.id}["${subdomain.name} · ${subdomain.kind}"]`,
      ...subdomain.contexts.map(context => `    ${context}`),
      '  end',
    ]),
    ...map.relationships.map(relationship => {
      const contracts = linkOf(relationship, links)?.contracts ?? [];
      const label = [relationship.patterns.map(spell).join(' → '), contracts.join(', ')].filter(Boolean).join(': ');
      return `  ${relationship.upstream} -- "${label}" --> ${relationship.downstream}`;
    }),
    '```',
  ].join('\n');

  const sections = [
    `**${map.name}.** ${cell(map.purpose)}`,
    '',
    '#### Subdomains',
    '',
    table(
      ['Subdomain', 'Kind', 'Contexts', 'Why'],
      map.subdomains.map(subdomain => [subdomain.name, subdomain.kind, subdomain.contexts.join(', '), subdomain.why]),
    ),
    '',
    '#### The context map',
    '',
    'Upstream on the left, downstream on the right; the label is the pattern on each side, then the contracts the code carries.',
    '',
    diagram,
    '',
    table(
      ['Upstream', 'Downstream', 'Patterns', 'Mechanism', 'Contracts (from the code)', 'Why'],
      map.relationships.map(relationship => [
        relationship.upstream,
        relationship.downstream,
        relationship.patterns.map(spell).join(', '),
        spell(relationship.mechanism),
        (linkOf(relationship, links)?.contracts ?? []).map(contract => `\`${contract}\``).join(', ') || '—',
        relationship.why,
      ]),
    ),
    '',
    `**Shared kernel.** ${cell(map.sharedKernel.holds)} ${cell(map.sharedKernel.why)}`,
    '',
    '#### The contexts and their language',
    '',
    ...map.contexts.flatMap(context => [
      '<details>',
      `<summary><b>${context.id}</b> (${subdomainOf(context.id)?.name ?? '?'}) — ${cell(context.purpose)}</summary>`,
      '',
      table(
        ['Term', 'Here it means'],
        context.language.map(term => [term.term, term.meaning]),
      ),
      '',
      '</details>',
    ]),
  ];
  if (strategic.length) {
    sections.push(
      '',
      '#### Strategic design, where it is here',
      '',
      table(
        ['Concept', 'Here', 'Notes'],
        strategic.map(concept => [concept.name, relink(concept.where, at), relink(concept.description, at)]),
      ),
    );
  }
  return sections
    .map(line => (line.startsWith('|') || line.startsWith('<') || line.startsWith('`') ? line : line))
    .join('\n');
}

/** `yarn architecture domain`, in words. */
export function describeDomain(map: DomainMap, links: ContextLink[]): string {
  const lines = [`${map.name}: ${cell(map.purpose)}`, '', 'Subdomains:'];
  for (const subdomain of map.subdomains) {
    lines.push(`  ${subdomain.name} (${subdomain.kind}): ${subdomain.contexts.join(', ')}`);
  }
  lines.push('', 'Context map (upstream → downstream):');
  for (const relationship of map.relationships) {
    const contracts = linkOf(relationship, links)?.contracts ?? [];
    lines.push(
      `  ${relationship.upstream} → ${relationship.downstream}: ${relationship.patterns.map(spell).join(', ')}, over an ${spell(relationship.mechanism)}${contracts.length ? ` (${contracts.join(', ')})` : ''}`,
    );
  }
  lines.push('', `Shared kernel: ${cell(map.sharedKernel.holds)}`);
  return lines.join('\n');
}

/** `yarn architecture context <id>`, in words. */
export function describeContext(
  map: DomainMap,
  context: DomainContext,
  links: ContextLink[],
  contract: ArchitectureContract,
): string {
  const subdomain = map.subdomains.find(candidate => candidate.contexts.includes(context.id));
  const lines = [
    `${context.id} — ${cell(context.purpose)}`,
    '',
    `Subdomain: ${subdomain ? `${subdomain.name} (${subdomain.kind})` : 'none'}`,
    `In ${contract.language.name}: ${posix.join(contract.contextsTree.path, context.id)}`,
    '',
    'Language:',
    ...context.language.map(term => `  ${term.term}: ${term.meaning}`),
  ];
  const upstream = map.relationships.filter(relationship => relationship.downstream === context.id);
  const downstream = map.relationships.filter(relationship => relationship.upstream === context.id);
  if (upstream.length) {
    lines.push('', 'Depends on:');
    for (const relationship of upstream) {
      const contracts = linkOf(relationship, links)?.contracts ?? [];
      lines.push(
        `  ${relationship.upstream}, as ${title(relationship.patterns.map(spell).join(' and '))}, over an ${spell(relationship.mechanism)}${contracts.length ? ` (${contracts.join(', ')})` : ''}`,
      );
    }
  }
  if (downstream.length) {
    lines.push('', 'Depended on by:');
    for (const relationship of downstream) {
      const contracts = linkOf(relationship, links)?.contracts ?? [];
      lines.push(
        `  ${relationship.downstream}, as ${title(relationship.patterns.map(spell).join(' and '))}, over an ${spell(relationship.mechanism)}${contracts.length ? ` (${contracts.join(', ')})` : ''}`,
      );
    }
  }
  return lines.join('\n');
}
