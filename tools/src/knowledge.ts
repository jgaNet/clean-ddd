import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, posix, resolve } from 'path';

import { loadArchitectureContract, repositoryRoot } from './load';
import { DOMAIN_FILE, DomainMap, SourceFile, loadDomainMap, readContextFiles } from './domain';
import { EventStorm, StormCommand, StormContext, inspectEventStorm, methodsOf } from './storm';
import { integrationEventPayloads, readTypeScriptFiles } from './inventory';
import { PUBLISHED_LANGUAGE_FILE, describePayload, lastVersion, loadPublishedLanguage } from './published-language';
import { Refusal, describeOrigin, inspectRuleEvidence, loadRuleRegister, publicNameOf } from './rule-register';
import { ArchitectureContract, ContractError, PublishedLanguage, RULE_REGISTER_FILE, RuleRegister } from './types';

/**
 * `clean-ddd knowledge <name>` (RFC 0006, K3): one read-only answer about a command, a query, a domain event, an
 * integration event, a rule, an aggregate or a context, over what the tooling already loads — the binding, the storm
 * read from the code, the rule register, the published language, the domain map. Every edge says where it came from:
 * `derived`, read from the code by the tooling; `declared`, written in a file under `conventions/`; a citation is a
 * document under `docs/adr`, `conventions/storms`, `conventions/plans` or `api/` that names it, found by search. It
 * writes nothing and holds nothing: what it cannot read in a tree it says (`unread`), and an unknown name answers the
 * nearest known names.
 */

export type KnowledgeProvenance = 'derived' | 'declared';
export type KnowledgeKind =
  'command' | 'query' | 'domain-event' | 'integration-event' | 'rule' | 'aggregate' | 'context';

export interface KnowledgeEdge {
  relation: string;
  target: string;
  provenance: KnowledgeProvenance;
  /** Where it was read: a repository-relative file or directory. */
  source: string;
  detail?: string;
  /** Found by searching a document for the name: the document names it, nothing more. */
  citation?: true;
  /** What is known about the target itself (a rule's statement, origin and tests). */
  edges?: KnowledgeEdge[];
}

export interface KnowledgeEntry {
  name: string;
  kind: KnowledgeKind;
  context?: string;
  summary: string;
  edges: KnowledgeEdge[];
}

export interface KnowledgeAnswer {
  name: string;
  language: string;
  entries: KnowledgeEntry[];
  /** When nothing is called `name`: the known names nearest to it, never an invention. */
  nearest: string[];
  /** What this tree does not hold, so cannot be answered from it. */
  unread: string[];
}

/** Everything the query reads, once. */
interface Tree {
  contract: ArchitectureContract;
  storm: EventStorm;
  files: Map<string, SourceFile[]>;
  specs: SourceFile[];
  documents: SourceFile[];
  kernel: SourceFile[];
  register?: RuleRegister;
  published?: PublishedLanguage;
  map?: DomainMap;
  refusals: Refusal[];
  unread: string[];
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const unique = <T>(values: T[]): T[] => [...new Set(values)];

/** Every file under a repository-relative directory whose name passes `keep`. */
function walk(root: string, dir: string, keep: (name: string) => boolean): SourceFile[] {
  if (!existsSync(join(root, dir))) return [];
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const path = posix.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(root, path, keep);
    return keep(entry.name) ? [{ path, text: readFileSync(join(root, path), 'utf8') }] : [];
  });
}

function readTree(root: string): Tree {
  const contract = loadArchitectureContract(root);
  if (contract.language.id !== 'typescript')
    throw new ContractError(`knowledge reads a TypeScript tree; ${root} is ${contract.language.name}`, 'malformed');
  const unread: string[] = [];
  const trees = [contract.contextsTree.path, contract.kernel.path, contract.architecture.path, contract.bootstrap.path];
  const documents = [
    ...walk(root, 'docs/adr', name => name.endsWith('.md') && name !== 'README.md'),
    ...walk(root, 'conventions/storms', name => name.endsWith('.yaml')),
    ...walk(root, 'conventions/plans', name => name.endsWith('.yaml')),
    ...walk(root, 'api', name => name.endsWith('.yaml')),
  ];
  for (const dir of ['docs/adr', 'conventions/storms', 'conventions/plans', 'api'])
    if (!existsSync(join(root, dir))) unread.push(`${dir}: absent in this tree, so no citation from it`);
  const register = loadRuleRegister(root);
  if (!register)
    unread.push(
      `${RULE_REGISTER_FILE}: absent in this tree — a rule's statement and origin cannot be read; its refusal is read from the code`,
    );
  const published = loadPublishedLanguage(root);
  if (!published)
    unread.push(
      `${PUBLISHED_LANGUAGE_FILE}: absent in this tree — an integration event's payload is the one its code carries, not a declared one`,
    );
  const map = loadDomainMap(root);
  if (!map) unread.push(`${DOMAIN_FILE}: absent in this tree — no context's purpose, no declared relationship`);
  return {
    contract,
    storm: inspectEventStorm(contract, root),
    files: readContextFiles(contract, root),
    specs: trees.flatMap(dir => walk(root, dir, name => /\.spec\.ts$/.test(name))),
    documents,
    kernel: readTypeScriptFiles(root, [contract.kernel.path, contract.architecture.path]),
    register,
    published,
    map,
    refusals: inspectRuleEvidence(contract, root).refusals,
    unread,
  };
}

/** The name and the class names a kind of thing is spelled with in the code and the documents. */
const SUFFIXES: Record<KnowledgeKind, string> = {
  command: '(?:CommandEvent|CommandHandler|Command)?',
  query: '(?:QueryHandler|Query)?',
  'domain-event': '(?:Event)?',
  'integration-event': '(?:IntegrationEvent(?:Handler)?)?',
  rule: '(?:Exception)?',
  aggregate: '',
  context: '',
};
const naming = (name: string, kind: KnowledgeKind) => new RegExp(`\\b${escape(name)}${SUFFIXES[kind]}\\b`);

const lines = (text: string, pattern: RegExp) =>
  text.split('\n').flatMap((line, index) => (pattern.test(line) ? [index + 1] : []));

/** The specs that name it, or that call its route (`agent.post(`${api}/notes/${id}/share`)`). */
function testsOf(tree: Tree, name: string, kind: KnowledgeKind, route?: string): KnowledgeEdge[] {
  const named = naming(name, kind);
  const [verb, path] = route?.split(' ') ?? [];
  // `agent.post(`…/notes/${id}/share`)`, `command('POST', `/bookings/${id}/cancel`)`, `inject({ method: 'POST', url: … })`.
  const called =
    verb && path
      ? new RegExp(
          `(?:\\.${verb.toLowerCase()}\\(\\s*|['"]${verb}['"]\\s*,\\s*(?:url:\\s*)?)[\`'"][^\`'"\\n]*${path
            .split('/')
            .filter(Boolean)
            .map(part => (/^[:{]/.test(part) ? '/[^/`\'"\\s]+' : `/${escape(part)}`))
            .join('')}[\`'"?]`,
        )
      : undefined;
  return tree.specs.flatMap(spec => {
    const how = named.test(spec.text) ? `names ${name}` : called?.test(spec.text) ? `calls ${route}` : undefined;
    return how
      ? [{ relation: 'tested-by', target: spec.path, provenance: 'derived' as const, source: spec.path, detail: how }]
      : [];
  });
}

function citationsOf(tree: Tree, name: string, kind: KnowledgeKind): KnowledgeEdge[] {
  const named = naming(name, kind);
  return tree.documents.flatMap(document => {
    const at = lines(document.text, named);
    if (!at.length) return [];
    const shown = at.slice(0, 5).join(', ') + (at.length > 5 ? ', …' : '');
    return [
      {
        relation: 'cited-by',
        target: document.path,
        provenance: 'derived' as const,
        source: document.path,
        citation: true as const,
        detail: `line${at.length > 1 ? 's' : ''} ${shown}`,
      },
    ];
  });
}

const derived = (relation: string, target: string, source: string, detail?: string): KnowledgeEdge => ({
  relation,
  target,
  provenance: 'derived',
  source,
  ...(detail && { detail }),
});

const file = (path: string | undefined, detail: string): KnowledgeEdge[] =>
  path ? [{ relation: 'file', target: path, provenance: 'derived', source: path, detail }] : [];

/** The file that declares a class, in a context or the kernel. */
const declaring = (files: SourceFile[], className: string) =>
  files.find(each => new RegExp(`\\bclass ${escape(className)}\\b`).test(each.text))?.path;

const contextFiles = (tree: Tree, context: string) => tree.files.get(context) ?? [];
const wiringOf = (tree: Tree, context: string) =>
  contextFiles(tree, context).find(each => each.path.endsWith(`/${context}/${tree.contract.wiring}`))?.path;

/**
 * The refusals a handler can return, read from the code: the bodies it reaches — its own file, the behaviours and
 * services the storm says it reaches, and from them, to a fixpoint, `this.method(`, `Class.method(` and
 * `this.field.method(` on a class of the context — and every exception of the context built in them.
 */
function refusalsReached(tree: Tree, context: string, seeds: { cls: string; method?: string }[]): KnowledgeEdge[] {
  const files = contextFiles(tree, context).filter(each => /\/(Domain|Application)\//.test(each.path));
  const classes = new Map<string, SourceFile>();
  const functions = new Map<string, { path: string; text: string }>();
  for (const each of files) {
    for (const match of each.text.matchAll(/\bclass (\w+)/g)) classes.set(match[1], each);
    const exports = [...each.text.matchAll(/^export /gm)].map(match => match.index);
    for (const match of each.text.matchAll(/^export (?:async )?function (\w+)/gm)) {
      const end = exports.find(at => at > match.index) ?? each.text.length;
      functions.set(match[1], { path: each.path, text: each.text.slice(match.index, end) });
    }
  }
  const aggregates = (tree.storm.contexts.find(each => each.id === context)?.aggregates ?? []).map(each => each.name);
  const bodies: { file: string; text: string }[] = [];
  const seen = new Set<string>();
  const queue = [...seeds];
  for (let next = queue.shift(); next; next = queue.shift()) {
    const key = `${next.cls}.${next.method ?? ''}`;
    const source = classes.get(next.cls);
    const fn = next.cls === '' && next.method ? functions.get(next.method) : undefined;
    if (seen.has(key) || (!source && !fn)) continue;
    seen.add(key);
    const text = fn
      ? fn.text
      : next.method
        ? methodsOf(source!.text).find(method => method.name === next.method)?.body
        : source!.text;
    if (!text) continue;
    bodies.push({ file: fn?.path ?? source!.path, text });
    if (source) {
      for (const [, method] of text.matchAll(/\bthis\.(\w+)\(/g)) queue.push({ cls: next.cls, method });
      for (const [, field, method] of text.matchAll(/\bthis\.(\w+)\.(\w+)\(/g)) {
        const type = source.text.match(new RegExp(`\\b${escape(field)}\\s*:\\s*(\\w+)`))?.[1];
        if (type) queue.push({ cls: type, method });
      }
    }
    for (const [, cls, method] of text.matchAll(/\b([A-Z]\w*)\.(\w+)\(/g)) queue.push({ cls, method });
    // A function of the context, and a behaviour called on an instance of one of its aggregates.
    for (const [, method] of text.matchAll(/(?<![.\w])([a-z]\w*)\(/g)) queue.push({ cls: '', method });
    for (const [, method] of text.matchAll(/\b[a-z]\w*\.(\w+)\(/g))
      for (const cls of aggregates) queue.push({ cls, method });
  }
  const builtIn = (exception: string) =>
    bodies.find(body => new RegExp(`\\bnew\\s+${escape(exception)}\\s*\\(`).test(body.text));
  const own = tree.refusals.filter(refusal => refusal.context === context);
  const named = own.flatMap(refusal => {
    const at = builtIn(refusal.exception);
    return at
      ? [{ ...derived('can-refuse-with', refusal.name, at.file), edges: ruleFacts(tree, refusal.name, context) }]
      : [];
  });
  // A refusal built from the building blocks or the shared kernel is none of the context's rules (ADR 46).
  const generic = unique(
    bodies.flatMap(body => [...body.text.matchAll(/\bnew\s+(\w+Exception)\s*\(/g)].map(match => match[1])),
  )
    .filter(exception => !own.some(refusal => refusal.exception === exception))
    .map(exception =>
      derived(
        'can-refuse-with',
        publicNameOf(exception),
        builtIn(exception)!.file,
        `${exception}, of the building blocks or the shared kernel: no rule of ${context} names it`,
      ),
    );
  return [...named, ...generic];
}

const commandSeeds = (command: StormCommand) => [
  { cls: command.handler },
  ...[...command.behaviours, ...command.services].map(full => {
    const [cls, method] = full.split('.');
    return { cls, method };
  }),
];

/** A rule's statement and origin (declared), and the tests that name it (derived). */
function ruleFacts(tree: Tree, name: string, context: string): KnowledgeEdge[] {
  const rule = tree.register?.rules.find(each => each.name === name && each.context === context);
  const source = tree.register?.source ?? RULE_REGISTER_FILE;
  const declared: KnowledgeEdge[] = rule
    ? [
        { relation: 'statement', target: rule.statement, provenance: 'declared', source },
        ...(rule.origin
          ? [
              {
                relation: 'origin',
                target: describeOrigin(rule.origin),
                provenance: 'declared' as const,
                source,
                ...originFile(tree, rule.origin),
              },
            ]
          : []),
      ]
    : [];
  return [...declared, ...testsOf(tree, name, 'rule')];
}

const originFile = (tree: Tree, origin: NonNullable<RuleRegister['rules'][number]['origin']>) => {
  const path =
    'adr' in origin
      ? tree.documents.find(each => each.path.startsWith(`docs/adr/${String(origin.adr).padStart(4, '0')}-`))?.path
      : 'storm' in origin
        ? `conventions/storms/${origin.storm}.yaml`
        : undefined;
  return path ? { detail: path } : {};
};

/** A relationship of the map (declared) and the link the code carries (derived), for a contract between two contexts. */
function crossing(tree: Tree, contract: string, mechanism: string, detail: string, context?: string): KnowledgeEdge[] {
  return (
    tree.storm.links
      .filter(link => link.mechanism === mechanism && link.contracts.includes(contract))
      // An event leaves its publisher; a port is owned by the context that asks.
      .filter(link => !context || (mechanism === 'owned-port' ? link.downstream : link.upstream) === context)
      .map(link => {
        const declared = tree.map?.relationships.find(
          each =>
            each.upstream === link.upstream && each.downstream === link.downstream && each.mechanism === mechanism,
        );
        return {
          relation: 'crosses',
          target: `${link.upstream} → ${link.downstream}`,
          provenance: 'derived' as const,
          source:
            link.evidence.find(path => path.includes(contract)) ?? link.evidence[0] ?? tree.contract.contextsTree.path,
          detail: `${contract}, ${detail}`,
          edges: [
            ...(mechanism === 'integration-event' ? payloadOf(tree, contract) : []),
            ...(declared
              ? [
                  {
                    relation: 'relationship',
                    target: declared.patterns.join(', '),
                    provenance: 'declared' as const,
                    source: tree.map!.source,
                    detail: declared.why,
                  },
                ]
              : [
                  {
                    relation: 'relationship',
                    target: 'not declared in the context map',
                    provenance: 'declared' as const,
                    source: DOMAIN_FILE,
                  },
                ]),
          ],
        };
      })
  );
}

function payloadOf(tree: Tree, name: string): KnowledgeEdge[] {
  const event = tree.published?.events.find(each => each.name === name);
  const last = event && lastVersion(event);
  if (event && last)
    return [
      {
        relation: 'payload',
        target: describePayload(last.payload),
        provenance: 'declared',
        source: tree.published!.source,
        detail: `version ${last.version}${event.announces ? `; announces ${event.announces.thing} (${event.announces.id})` : ''}`,
      },
    ];
  const payload = integrationEventPayloads(tree.kernel, tree.contract.kernel.path)[name];
  const path = declaring(tree.kernel, `${name}IntegrationEvent`);
  return payload && path
    ? [{ relation: 'payload', target: describePayload(payload), provenance: 'derived', source: path }]
    : [];
}

function commandEntry(tree: Tree, context: StormContext, command: StormCommand): KnowledgeEntry {
  const policies = tree.storm.contexts.flatMap(each =>
    each.policies.filter(
      policy => policy.on.kind === 'domain-event' && command.events.includes(policy.on.event) && each.id === context.id,
    ),
  );
  const presentation = contextFiles(tree, context.id).filter(
    each =>
      /\/Presentation\//.test(each.path) && new RegExp(`\\b${escape(command.name)}CommandEvent\\b`).test(each.text),
  );
  const methods = presentation.flatMap(each =>
    methodsOf(each.text)
      .filter(method => method.body.includes(`${command.name}CommandEvent`))
      .map(method => method.name),
  );
  const routes = contextFiles(tree, context.id).filter(each =>
    methods.some(method => each.text.includes(`.${method}.bind(`)),
  );
  const aggregate = context.aggregates.find(each => each.name === command.aggregate);
  return {
    name: command.name,
    kind: 'command',
    context: context.id,
    summary: `A command of ${context.id}, asked by ${command.actor}${command.route ? ` at ${command.route}` : ', by no route'}.`,
    edges: [
      derived('context', context.id, wiringOf(tree, context.id) ?? command.file),
      derived('actor', command.actor, command.file),
      ...(command.route ? [derived('route', command.route, routes[0]?.path ?? command.file)] : []),
      ...(command.aggregate
        ? [derived('reaches', command.aggregate, aggregate?.file ?? command.file, command.behaviours.join(', '))]
        : []),
      ...command.events.map(event => derived('records', event, aggregate?.file ?? command.file)),
      ...command.services.map(service => derived('through', service, command.file)),
      ...policies.map(policy =>
        derived(
          'reacted-to-by',
          policy.name,
          policy.file,
          `on ${policy.on.event}${policy.publishes.length ? `, publishes ${policy.publishes.join(', ')}` : ''}${policy.dispatches.length ? `, dispatches ${policy.dispatches.join(', ')}` : ''}`,
        ),
      ),
      ...file(command.file, 'handler'),
      ...file(declaring(contextFiles(tree, context.id), `${command.name}CommandEvent`), 'command'),
      ...file(aggregate?.file, 'aggregate'),
      ...presentation.flatMap(each => file(each.path, 'controller')),
      ...routes.filter(each => !presentation.includes(each)).flatMap(each => file(each.path, 'routes')),
      ...file(wiringOf(tree, context.id), 'wiring'),
      ...refusalsReached(tree, context.id, commandSeeds(command)),
      ...testsOf(tree, command.name, 'command', command.route),
      ...citationsOf(tree, command.name, 'command'),
      ...unique(policies.flatMap(policy => policy.publishes)).flatMap(event =>
        crossing(tree, event, 'integration-event', 'an integration event published on what it records', context.id),
      ),
      ...command.uses.flatMap(port =>
        crossing(tree, port, 'owned-port', 'a port it owns, answered by the other context', context.id),
      ),
    ],
  };
}

function queryEntry(tree: Tree, context: StormContext, query: StormContext['readModels'][number]): KnowledgeEntry {
  const handler = declaring(contextFiles(tree, context.id), query.handler);
  const presentation = contextFiles(tree, context.id).filter(
    each => /\/Presentation\//.test(each.path) && new RegExp(`\\b${escape(query.handler)}\\b`).test(each.text),
  );
  return {
    name: query.name,
    kind: 'query',
    context: context.id,
    summary: `A query of ${context.id}, asked by ${query.actor}${query.route ? ` at ${query.route}` : ''}, answering ${query.model}.`,
    edges: [
      derived('context', context.id, wiringOf(tree, context.id) ?? handler ?? ''),
      derived('actor', query.actor, handler ?? ''),
      ...(query.route ? [derived('route', query.route, presentation[0]?.path ?? handler ?? '')] : []),
      derived('answers', query.model, handler ?? ''),
      ...file(handler, 'handler'),
      ...presentation.flatMap(each => file(each.path, 'controller')),
      ...file(wiringOf(tree, context.id), 'wiring'),
      ...refusalsReached(tree, context.id, [{ cls: query.handler }]),
      ...testsOf(tree, query.name, 'query', query.route),
      ...citationsOf(tree, query.name, 'query'),
    ],
  };
}

function domainEventEntry(tree: Tree, context: StormContext, event: StormContext['events'][number]): KnowledgeEntry {
  const policies = context.policies.filter(
    policy => policy.on.kind === 'domain-event' && policy.on.event === event.name,
  );
  const aggregate = context.aggregates.find(each => each.name === event.aggregate);
  return {
    name: event.name,
    kind: 'domain-event',
    context: context.id,
    summary: `A domain event of ${context.id}${event.aggregate ? `, recorded by ${event.aggregate}` : ''}.`,
    edges: [
      derived('context', context.id, wiringOf(tree, context.id) ?? ''),
      ...event.recordedBy.map(behaviour => derived('recorded-by', behaviour, aggregate?.file ?? '')),
      ...context.commands
        .filter(command => command.events.includes(event.name))
        .map(command => derived('recorded-on', command.name, command.file)),
      ...policies.map(policy =>
        derived(
          'reacted-to-by',
          policy.name,
          policy.file,
          policy.publishes.length ? `publishes ${policy.publishes.join(', ')}` : undefined,
        ),
      ),
      ...file(declaring(contextFiles(tree, context.id), `${event.name}Event`), 'event'),
      ...file(aggregate?.file, 'aggregate'),
      ...policies.flatMap(policy => file(policy.file, 'policy')),
      ...testsOf(tree, event.name, 'domain-event'),
      ...citationsOf(tree, event.name, 'domain-event'),
      ...unique(policies.flatMap(policy => policy.publishes)).flatMap(name =>
        crossing(tree, name, 'integration-event', 'the integration event published on it', context.id),
      ),
    ],
  };
}

function integrationEventEntry(tree: Tree, event: EventStorm['integrationEvents'][number]): KnowledgeEntry {
  const policy = (context: string, name: string) =>
    tree.storm.contexts.find(each => each.id === context)?.policies.find(each => each.name === name);
  const publishers = event.publishedBy.map(each => ({ ...each, policy: policy(each.context, each.policy) }));
  const consumers = event.consumedBy.map(each => ({ ...each, policy: policy(each.context, each.policy) }));
  const publisher = unique(event.publishedBy.map(each => each.context)).join(', ');
  return {
    name: event.name,
    kind: 'integration-event',
    context: publisher || undefined,
    summary: `An integration event published by ${publisher || 'no context'}, consumed by ${unique(event.consumedBy.map(each => each.context)).join(', ') || 'no context'}.`,
    edges: [
      ...publishers.map(each =>
        derived(
          'published-by',
          `${each.context}.${each.policy?.name ?? ''}`,
          each.policy?.file ?? '',
          each.policy && each.policy.on.kind !== 'every-operation' ? `on ${each.policy.on.event}` : undefined,
        ),
      ),
      ...consumers.map(each =>
        derived(
          'consumed-by',
          `${each.context}.${each.policy?.name ?? ''}`,
          each.policy?.file ?? '',
          each.policy?.dispatches.length ? `dispatches ${each.policy.dispatches.join(', ')}` : undefined,
        ),
      ),
      ...payloadOf(tree, event.name),
      ...file(declaring(tree.kernel, `${event.name}IntegrationEvent`), 'integration event'),
      ...[...publishers, ...consumers].flatMap(each =>
        file(each.policy?.file, each.context === publisher ? 'publishing policy' : 'consuming policy'),
      ),
      ...testsOf(tree, event.name, 'integration-event'),
      ...citationsOf(tree, event.name, 'integration-event'),
      ...crossing(tree, event.name, 'integration-event', 'this event').map(edge => ({
        ...edge,
        edges: edge.edges?.filter(each => each.relation !== 'payload'),
      })),
    ],
  };
}

function ruleEntry(tree: Tree, name: string, context: string): KnowledgeEntry {
  const refusal = tree.refusals.find(each => each.name === name && each.context === context);
  const storm = tree.storm.contexts.find(each => each.id === context);
  const returnedBy = [
    ...(storm?.commands ?? [])
      .filter(command => refusalsReached(tree, context, commandSeeds(command)).some(edge => edge.target === name))
      .map(command => derived('returned-by', command.name, command.file, 'command')),
    ...(storm?.readModels ?? [])
      .filter(query => refusalsReached(tree, context, [{ cls: query.handler }]).some(edge => edge.target === name))
      .map(query =>
        derived('returned-by', query.name, declaring(contextFiles(tree, context), query.handler) ?? '', 'query'),
      ),
  ];
  const builders = refusal
    ? contextFiles(tree, context).filter(
        each =>
          each.path !== refusal.file && new RegExp(`\\bnew\\s+${escape(refusal.exception)}\\s*\\(`).test(each.text),
      )
    : [];
  const rule = tree.register?.rules.find(each => each.name === name && each.context === context);
  return {
    name,
    kind: 'rule',
    context,
    summary: `A rule of ${context}: ${rule?.statement ?? `a refusal its code returns (${refusal?.exception})`}`,
    edges: [
      derived('context', context, refusal?.file ?? tree.register?.source ?? ''),
      ...ruleFacts(tree, name, context).filter(edge => edge.relation !== 'tested-by'),
      ...(refusal
        ? []
        : [
            {
              relation: 'refusal',
              target: 'no exception of this name is returned by the code',
              provenance: 'derived' as const,
              source: tree.contract.contextsTree.path,
            },
          ]),
      ...returnedBy,
      ...file(refusal?.file, `exception ${refusal?.exception}`),
      ...builders.flatMap(each => file(each.path, 'returns it')),
      ...testsOf(tree, name, 'rule'),
      ...citationsOf(tree, name, 'rule'),
    ],
  };
}

function aggregateEntry(
  tree: Tree,
  context: StormContext,
  aggregate: StormContext['aggregates'][number],
): KnowledgeEntry {
  const commands = context.commands.filter(command => command.aggregate === aggregate.name);
  return {
    name: aggregate.name,
    kind: 'aggregate',
    context: context.id,
    summary: `An aggregate of ${context.id}, with ${aggregate.behaviours.length} behaviour(s) that record a fact.`,
    edges: [
      derived('context', context.id, aggregate.file),
      ...aggregate.behaviours.map(behaviour =>
        derived('behaviour', behaviour.name, aggregate.file, `records ${behaviour.events.join(', ')}`),
      ),
      ...commands.map(command => derived('reached-by', command.name, command.file)),
      ...file(aggregate.file, 'aggregate'),
      ...file(declaring(contextFiles(tree, context.id), `I${aggregate.name}Repository`), 'repository port'),
      ...refusalsReached(tree, context.id, [{ cls: aggregate.name }]),
      ...testsOf(tree, aggregate.name, 'aggregate'),
      ...citationsOf(tree, aggregate.name, 'aggregate'),
    ],
  };
}

function contextEntry(tree: Tree, id: string): KnowledgeEntry {
  const context = tree.storm.contexts.find(each => each.id === id);
  const declared = tree.map?.contexts.find(each => each.id === id);
  const wiring = wiringOf(tree, id) ?? posix.join(tree.contract.contextsTree.path, id);
  const rules = tree.register?.rules.filter(rule => rule.context === id);
  const subdomain = tree.map?.subdomains.find(each => each.contexts.includes(id));
  return {
    name: id,
    kind: 'context',
    context: id,
    summary: declared?.purpose ?? `A context of the binding${tree.map ? ', with no purpose in the domain map' : ''}.`,
    edges: [
      ...(declared
        ? [{ relation: 'purpose', target: declared.purpose, provenance: 'declared' as const, source: tree.map!.source }]
        : []),
      ...(subdomain
        ? [
            {
              relation: 'subdomain',
              target: `${subdomain.name} (${subdomain.kind})`,
              provenance: 'declared' as const,
              source: tree.map!.source,
            },
          ]
        : []),
      ...(context?.commands ?? []).map(command => derived('command', command.name, command.file, command.route)),
      ...(context?.readModels ?? []).map(query => derived('query', query.name, wiring, query.route)),
      ...(context?.events ?? []).map(event => derived('domain-event', event.name, wiring)),
      ...(context?.policies ?? []).map(policy => derived('policy', policy.name, policy.file, `on ${policy.on.event}`)),
      ...(rules
        ? rules.map(rule => ({
            relation: 'rule',
            target: rule.name,
            provenance: 'declared' as const,
            source: tree.register!.source,
            detail: rule.statement,
          }))
        : tree.refusals
            .filter(refusal => refusal.context === id)
            .map(refusal => derived('rule', refusal.name, refusal.file))),
      ...file(wiringOf(tree, id), 'wiring'),
      ...(context?.aggregates ?? []).flatMap(each => file(each.file, 'aggregate')),
      ...(tree.map?.relationships ?? [])
        .filter(each => each.upstream === id || each.downstream === id)
        .map(each => ({
          relation: 'crosses',
          target: `${each.upstream} → ${each.downstream}`,
          provenance: 'declared' as const,
          source: tree.map!.source,
          detail: `${each.mechanism}, ${each.patterns.join(', ')}${each.planned ? ', planned' : ''}; carries ${tree.storm.links.find(link => link.upstream === each.upstream && link.downstream === each.downstream && link.mechanism === each.mechanism)?.contracts.join(', ') || 'nothing in the code yet'}`,
        })),
      ...tree.specs
        .filter(spec => spec.path.startsWith(`${posix.join(tree.contract.contextsTree.path, id)}/`))
        .map(spec => derived('tested-by', spec.path, spec.path)),
      ...citationsOf(tree, id, 'context'),
    ],
  };
}

/** Every known thing, by name, with how to answer for it. */
function known(tree: Tree): { name: string; kind: KnowledgeKind; answer: () => KnowledgeEntry }[] {
  const things = tree.storm.contexts.flatMap(context => [
    ...context.commands.map(command => ({
      name: command.name,
      kind: 'command' as const,
      answer: () => commandEntry(tree, context, command),
    })),
    ...context.readModels.map(query => ({
      name: query.name,
      kind: 'query' as const,
      answer: () => queryEntry(tree, context, query),
    })),
    ...context.events.map(event => ({
      name: event.name,
      kind: 'domain-event' as const,
      answer: () => domainEventEntry(tree, context, event),
    })),
    ...context.aggregates.map(aggregate => ({
      name: aggregate.name,
      kind: 'aggregate' as const,
      answer: () => aggregateEntry(tree, context, aggregate),
    })),
  ]);
  const rules = unique([
    ...tree.refusals.map(refusal => `${refusal.context}\u0000${refusal.name}`),
    ...(tree.register?.rules ?? []).map(rule => `${rule.context}\u0000${rule.name}`),
  ]).map(key => key.split('\u0000'));
  return [
    ...things,
    ...tree.storm.integrationEvents.map(event => ({
      name: event.name,
      kind: 'integration-event' as const,
      answer: () => integrationEventEntry(tree, event),
    })),
    ...rules.map(([context, name]) => ({ name, kind: 'rule' as const, answer: () => ruleEntry(tree, name, context) })),
    ...tree.contract.contexts.map(id => ({ name: id, kind: 'context' as const, answer: () => contextEntry(tree, id) })),
  ];
}

function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1)
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length];
}

/** The answer for a name, read from the tree at `root` (a repository root: the directory that holds `conventions/`). */
export function answerKnowledge(root: string, name: string): KnowledgeAnswer {
  const tree = readTree(resolve(root));
  const things = known(tree);
  const bare = name.replace(
    /(IntegrationEvent|CommandEvent|CommandHandler|QueryHandler|Command|Query|Exception|Event)$/,
    '',
  );
  const exact = things.filter(thing => thing.name === name || thing.name === bare);
  const found = exact.length ? exact : things.filter(thing => thing.name.toLowerCase() === bare.toLowerCase());
  const names = unique(things.map(thing => thing.name));
  const nearest = found.length
    ? []
    : names
        .map(each => ({
          each,
          score:
            each.toLowerCase().includes(bare.toLowerCase()) || bare.toLowerCase().includes(each.toLowerCase())
              ? 0
              : distance(each.toLowerCase(), bare.toLowerCase()),
        }))
        .filter(({ score }) => score <= Math.max(3, Math.floor(bare.length / 3)))
        .sort((a, b) => a.score - b.score || a.each.localeCompare(b.each))
        .slice(0, 8)
        .map(({ each }) => each);
  return {
    name,
    language: tree.contract.language.id,
    // An edge whose file was not found is still read from the code: it says so with the contexts tree.
    entries: found.map(thing => {
      const answered = thing.answer();
      const located = (edge: KnowledgeEdge): KnowledgeEdge => ({
        ...edge,
        source: edge.source || tree.contract.contextsTree.path,
        ...(edge.edges && { edges: edge.edges.map(located) }),
      });
      return { ...answered, edges: answered.edges.map(located) };
    }),
    nearest,
    unread: tree.unread,
  };
}

const SECTIONS: [string, (edge: KnowledgeEdge) => boolean][] = [
  ['Files', edge => edge.relation === 'file'],
  ['Rules it can refuse with', edge => edge.relation === 'can-refuse-with'],
  ['Tests', edge => edge.relation === 'tested-by'],
  ['Cited by (documents that name it)', edge => edge.relation === 'cited-by'],
  ['Contracts it crosses', edge => edge.relation === 'crosses'],
];
const SHOWN = 12;

function renderEdge(edge: KnowledgeEdge, indent = ''): string[] {
  const tag = `_${edge.provenance}: ${edge.source}_`;
  const head =
    edge.relation === 'file' || edge.relation === 'tested-by' || edge.relation === 'cited-by'
      ? `\`${edge.target}\`${edge.detail ? ` — ${edge.detail}` : ''}${edge.relation === 'file' ? '' : ` _(${edge.provenance}${edge.citation ? ', citation' : ''})_`}`
      : `${edge.relation}: **${edge.target}**${edge.detail ? ` — ${edge.detail}` : ''} ${tag}`;
  return [`${indent}- ${head}`, ...(edge.edges ?? []).flatMap(each => renderEdge(each, `${indent}  `))];
}

/** The answer in Markdown: one section per entry, each edge with its provenance and where it was read. */
export function renderKnowledge(answer: KnowledgeAnswer): string {
  const out: string[] = [];
  if (!answer.entries.length) {
    out.push(`# ${answer.name}`, '', `Nothing in this tree is called ${answer.name}.`);
    if (answer.nearest.length) out.push('', `The nearest known names: ${answer.nearest.join(', ')}.`);
    out.push('');
  }
  for (const entry of answer.entries) {
    out.push(`# ${entry.name} — ${entry.kind}${entry.context ? ` of ${entry.context}` : ''}`, '', entry.summary, '');
    const rest = entry.edges.filter(edge => !SECTIONS.some(([, belongs]) => belongs(edge)));
    out.push(
      '## What it is',
      '',
      ...(rest.length ? rest.flatMap(edge => renderEdge(edge)) : ['- nothing more read']),
      '',
    );
    for (const [title, belongs] of SECTIONS) {
      const edges = entry.edges.filter(belongs);
      if (!edges.length && title === 'Tests' && entry.kind !== 'context')
        out.push(
          '## Tests',
          '',
          `- none found _(derived: no spec of this tree names ${entry.name}${entry.kind === 'command' || entry.kind === 'query' ? ' or calls its route' : ''})_`,
          '',
        );
      if (!edges.length) continue;
      const files = title === 'Files' ? [`(derived: read from the code)`] : [];
      out.push(`## ${title}`, '', ...files, ...edges.slice(0, SHOWN).flatMap(edge => renderEdge(edge)));
      if (edges.length > SHOWN) out.push(`- … and ${edges.length - SHOWN} more (\`--json\` lists them all)`);
      out.push('');
    }
  }
  if (answer.unread.length) out.push('## Not read in this tree', '', ...answer.unread.map(line => `- ${line}`), '');
  return out.join('\n').trimEnd();
}

/**
 * `knowledge <name> [--json] [--root <dir>]`, as the CLI's subcommand and as the bundle of its own
 * (`node tools/dist/knowledge.js <name> --root <tree>`). Returns the exit code: 1 when nothing is called that.
 */
export function runKnowledge(argv: string[], cwd: string, write: (text: string) => void): number {
  const json = argv.includes('--json');
  const rootFlag = argv.includes('--root') ? argv[argv.indexOf('--root') + 1] : undefined;
  const [name] = argv.filter((arg, index) => !arg.startsWith('--') && argv[index - 1] !== '--root');
  if (!name) {
    write('usage: clean-ddd knowledge <name> [--json] [--root <dir>]\n');
    return 2;
  }
  let answer: KnowledgeAnswer;
  try {
    answer = answerKnowledge(repositoryRoot(resolve(cwd, rootFlag ?? '.')), name);
  } catch (error) {
    if (!(error instanceof ContractError)) throw error;
    write(
      json
        ? `${JSON.stringify({ error: { code: error.code, message: error.message } }, null, 2)}\n`
        : `${error.message}\n`,
    );
    return 1;
  }
  write(json ? `${JSON.stringify(answer, null, 2)}\n` : `${renderKnowledge(answer)}\n`);
  return answer.entries.length ? 0 : 1;
}
