import { Dirent, existsSync, readFileSync, readdirSync } from 'fs';
import { join, posix } from 'path';

import { ArchitectureContract } from './types';
import { ContextLink, SourceFile, inspectContextLinks, readContextFiles } from './domain';

/**
 * The event storm, derived from the code: the stickies an event-storming session would put on
 * the wall — actors, commands, aggregates, domain events, policies, read models, external
 * systems, and the integration events that pivot from one context to the next — read from this
 * language's tree rather than written by hand, so that the board is true to the code the day it
 * is rendered and every day after.
 *
 * It reads the canonical shapes the check already imposes: a wiring file that lists its
 * commands, queries and subscriptions as data (ARCH-MODULES-DATA); an aggregate whose behaviours
 * `record()` their events (DOMAIN-RECORDS-EVENTS); a handler that guards with `requireSignedIn()`
 * or a `guard()` on a role, asks a behaviour, and publishes or dispatches; a controller that
 * builds the command a route carries. A shape it does not recognise is a shape the guides do not
 * teach; the remedy is the canonical shape, not a looser reading.
 *
 * Nothing here is declared twice: the names are the public names the API and the Tracker use
 * (API-ONE-SURFACE), the contexts are the bindings', the pivots are the context map's links.
 */

export type Actor = 'an administrator' | 'a signed-in account' | 'anyone' | 'the system';

export interface Behaviour {
  name: string;
  events: string[];
}

export interface StormAggregate {
  name: string;
  file: string;
  behaviours: Behaviour[];
}

export interface StormEvent {
  /** The public name: the class name without `Event`. */
  name: string;
  aggregate: string;
  /** The behaviours that record it, as `Aggregate.behaviour`. */
  recordedBy: string[];
  /** The policies subscribed to it, by handler name. */
  policies: string[];
  /** Laid over the board by an expected storm, not read from the code yet. */
  expected?: boolean;
}

export interface StormCommand {
  /** The public name: the class name without `CommandEvent`. */
  name: string;
  /** The handler that decides it: the first one listed, the only one when the wiring is right (ARCH-ONE-HANDLER). */
  handler: string;
  /** Every handler the wiring lists for it. */
  handlers: string[];
  file: string;
  actor: Actor;
  /** `VERB /path`, when a route carries the command. */
  route?: string;
  aggregate?: string;
  /** The behaviours it reaches, directly or through a service, as `Aggregate.behaviour`. */
  behaviours: string[];
  /** The domain events those behaviours record. */
  events: string[];
  /** The services it goes through (a domain or application service). */
  services: string[];
  /** The external systems it needs: ports that are neither a repository nor a queries port. */
  uses: string[];
  /** Laid over the board by an expected storm, not read from the code yet. */
  expected?: boolean;
}

export interface StormPolicy {
  name: string;
  file: string;
  on: { kind: 'domain-event' | 'integration-event' | 'every-operation'; event: string };
  /** Integration events it publishes, by public name. */
  publishes: string[];
  /** Commands it dispatches, by public name. */
  dispatches: string[];
  behaviours: string[];
  events: string[];
  services: string[];
  uses: string[];
  /** Laid over the board by an expected storm, not read from the code yet. */
  expected?: boolean;
}

export interface StormReadModel {
  /** The public name: the handler without `QueryHandler`. */
  name: string;
  handler: string;
  /** The read model type it answers. */
  model: string;
  actor: Actor;
  route?: string;
  /** Laid over the board by an expected storm, not read from the code yet. */
  expected?: boolean;
}

export interface StormExternal {
  /** The port without its `I`. */
  name: string;
  port: string;
  /** The context that answers it, when the port is one of the map's owned ports. */
  answeredBy?: string;
  adapters: string[];
}

export interface StormContext {
  id: string;
  aggregates: StormAggregate[];
  events: StormEvent[];
  commands: StormCommand[];
  policies: StormPolicy[];
  readModels: StormReadModel[];
  externals: StormExternal[];
  /** The commands the context's routes build, by public name, whether or not the wiring answers them. */
  routed: string[];
}

export interface StormIntegrationEvent {
  name: string;
  publishedBy: { context: string; policy: string }[];
  consumedBy: { context: string; policy: string }[];
}

export interface EventStorm {
  language: string;
  contexts: StormContext[];
  integrationEvents: StormIntegrationEvent[];
  links: ContextLink[];
}

/** The handlers a `handlers: [...]` list constructs, at its own level: a `new` inside a handler's arguments is a port, not a handler. */
const listedHandlers = (list: string): string[] => {
  const found: string[] = [];
  let depth = 0;
  for (const match of list.matchAll(/new (\w+)\(|[()]/g)) {
    if (match[0] === '(') depth += 1;
    else if (match[0] === ')') depth -= 1;
    else {
      if (depth === 0) found.push(match[1]);
      depth += 1;
    }
  }
  return found;
};

/** The public name of a class: its intent or its fact, without the suffix of its kind (API-ONE-SURFACE). */
export const publicName = (className: string): string =>
  className.replace(/(CommandEvent|IntegrationEvent|CommandHandler|QueryHandler|EventHandler|Handler|Event)$/, '');

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const unique = <T>(values: T[]): T[] => [...new Set(values)];

/** The text between the brackets that follow `key:` in a wiring file, brackets balanced. */
function section(text: string, key: string): string {
  const start = text.search(new RegExp(`\\b${key}:\\s*\\[`));
  if (start < 0) return '';
  let depth = 0;
  for (let index = text.indexOf('[', start); index < text.length; index += 1) {
    if (text[index] === '[') depth += 1;
    if (text[index] === ']') depth -= 1;
    if (depth === 0) return text.slice(text.indexOf('[', start) + 1, index);
  }
  return '';
}

/** A class's methods, by the two-space indentation prettier gives them: name and body up to the next one. */
function methodsOf(text: string): { name: string; body: string }[] {
  const header = /^  (?:(?:static|async|private|protected|public|readonly) )*(\w+)\s*\(/gm;
  const starts = [...text.matchAll(header)].map(match => ({ name: match[1], at: match.index! }));
  return starts
    .map((start, index) => ({ name: start.name, body: text.slice(start.at, starts[index + 1]?.at ?? text.length) }))
    .filter(method => !['constructor', 'if', 'for', 'while', 'switch', 'return'].includes(method.name));
}

const classDeclared = (text: string, name: string) => new RegExp(`export class ${escape(name)}\\b`).test(text);
const fileOf = (files: SourceFile[], className: string) => files.find(file => classDeclared(file.text, className));

/**
 * Who may call: `requireSignedIn()` says a signed-in account (an administrator may see more, the
 * handler says so itself); a `guard()` that admits the administrator role alone says an
 * administrator; a guard on any other role says a signed-in account; nothing says anyone.
 */
const actorOf = (text: string): Actor => {
  if (/requireSignedIn\(/.test(text)) return 'a signed-in account';
  if (/\bguard\(/.test(text) && /Role\.ADMIN/.test(text) && !/Role\.USER/.test(text)) return 'an administrator';
  if (/\bguard\(/.test(text) && /Role\./.test(text)) return 'a signed-in account';
  return 'anyone';
};

interface ServiceMethod {
  service: string;
  method: string;
  behaviours: string[];
  uses: string[];
}

/** What one context's code says, sticky by sticky. */
function inspectContext(
  context: string,
  files: SourceFile[],
  contract: ArchitectureContract,
  links: ContextLink[],
  mounts: Map<string, string>,
): StormContext {
  const wiring = files.find(file => file.path.endsWith(`/${contract.wiring}`));
  const wiringText = wiring?.text ?? '';

  // Aggregates and the events their behaviours record.
  const aggregates: StormAggregate[] = files
    .filter(file => /extends AggregateRoot\b/.test(file.text))
    .map(file => {
      const name = file.text.match(/export class (\w+) extends AggregateRoot/)![1];
      const behaviours = methodsOf(file.text)
        .map(method => ({
          name: method.name,
          events: unique([...method.body.matchAll(/record\(\s*(\w+Event)\b/g)].map(match => publicName(match[1]))),
        }))
        .filter(method => method.events.length > 0 && method.name !== 'fromSnapshot');
      return { name, file: file.path, behaviours };
    });

  const events: StormEvent[] = files.flatMap(file =>
    [...file.text.matchAll(/export class (\w+Event) extends DomainEvent\b/g)].map(match => {
      const name = publicName(match[1]);
      const aggregate = file.path.match(/\/Domain\/([^/]+)\//)?.[1] ?? '';
      const recordedBy = aggregates.flatMap(each =>
        each.behaviours
          .filter(behaviour => behaviour.events.includes(name))
          .map(behaviour => `${each.name}.${behaviour.name}`),
      );
      return { name, aggregate, recordedBy, policies: [] };
    }),
  );

  // The ports: a repository or a queries port is a store, a port the map says another context answers is
  // that context, anything else is an external system (a hasher, a token issuer, a channel, a suggestion).
  const ports = unique(
    files
      .filter(file => /\/I[A-Z]\w*\.ts$/.test(file.path))
      .flatMap(file => [...file.text.matchAll(/export interface (I\w+)\b/g)].map(match => match[1])),
  );
  const foreign = new Map(
    links
      .filter(link => link.mechanism === 'owned-port' && link.downstream === context)
      .flatMap(link => link.contracts.map(contract => [`I${contract}`, link.upstream] as [string, string])),
  );
  const isStore = (port: string) => /(Repository|Queries|Records|DataSource)$/.test(port);
  const externalPorts = ports.filter(port => !isStore(port));
  const externals: StormExternal[] = externalPorts.map(port => ({
    name: port.replace(/^I/, ''),
    port,
    ...(foreign.has(port) && { answeredBy: foreign.get(port) }),
    adapters: files
      .filter(file => new RegExp(`implements ${escape(port)}\\b`).test(file.text))
      .map(file => file.text.match(/export class (\w+)/)?.[1] ?? file.path),
  }));
  const usesOf = (text: string) =>
    externalPorts.filter(port => new RegExp(`\\b${escape(port)}\\b`).test(text)).map(port => port.replace(/^I/, ''));

  // Behaviours reached from a text: an aggregate's method called on an instance or statically.
  const behavioursOf = (text: string) =>
    aggregates.flatMap(each =>
      each.behaviours
        .filter(behaviour => new RegExp(`\\b(?:${escape(each.name)}|\\w+)\\.${escape(behaviour.name)}\\(`).test(text))
        .map(behaviour => `${each.name}.${behaviour.name}`),
    );
  const eventsOf = (behaviours: string[]) =>
    unique(
      behaviours.flatMap(full => {
        const [aggregate, name] = full.split('.');
        return (
          aggregates.find(each => each.name === aggregate)?.behaviours.find(each => each.name === name)?.events ?? []
        );
      }),
    );

  // Services: any other class whose methods reach a behaviour (a domain service, an application service).
  const serviceMethods: ServiceMethod[] = files.flatMap(file => {
    const name = file.text.match(/export class (\w+)/)?.[1];
    if (
      !name ||
      /extends (AggregateRoot|Entity|ValueObject|DomainEvent|CommandEvent|IntegrationEvent|Exception|\w*Handler)\b/.test(
        file.text,
      )
    )
      return [];
    if (/extends \w+Exception\b|implements I\w+\b/.test(file.text)) return [];
    return methodsOf(file.text)
      .map(method => ({
        service: name,
        method: method.name,
        behaviours: behavioursOf(method.body),
        uses: usesOf(file.text),
      }))
      .filter(method => method.behaviours.length > 0);
  });
  const through = (text: string) =>
    serviceMethods.filter(
      candidate => text.includes(candidate.service) && new RegExp(`\\.${escape(candidate.method)}\\(`).test(text),
    );

  // Routes: the controller method a route binds, and the command or query that method builds.
  const mount = mounts.get(context) ?? '';
  const routeOf = new Map<string, string>();
  const routed = new Set<string>();
  for (const controller of files.filter(
    file => /CommandEvent\.set\(|getQuery\(/.test(file.text) && /Presentation/.test(file.path),
  )) {
    const byMethod = new Map(methodsOf(controller.text).map(method => [method.name, method.body]));
    for (const routes of files.filter(file => /fastify\.(get|post|put|patch|delete)/.test(file.text))) {
      for (const match of routes.text.matchAll(
        /fastify\.(get|post|put|patch|delete)(?:<[^']*?>)?\(\s*'([^']*)'[\s\S]*?\.(\w+)\.bind\(/g,
      )) {
        const body = byMethod.get(match[3]);
        if (!body) continue;
        const path = posix.normalize(`${mount}/${match[2]}`).replace(/\/$/, '') || '/';
        const route = `${match[1].toUpperCase()} ${path}`;
        for (const command of body.matchAll(/(\w+)CommandEvent\.set\(/g)) {
          routeOf.set(publicName(command[1]), route);
          routed.add(publicName(command[1]));
        }
        for (const query of body.matchAll(/getQuery\((\w+)\)/g)) routeOf.set(publicName(query[1]), route);
      }
    }
  }

  const analyse = (text: string) => {
    const services = through(text);
    const behaviours = unique([...behavioursOf(text), ...services.flatMap(service => service.behaviours)]);
    return {
      behaviours,
      events: eventsOf(behaviours),
      services: unique(services.map(service => `${service.service}.${service.method}`)),
      uses: unique([...usesOf(text), ...services.flatMap(service => service.uses)]),
    };
  };

  const commands: StormCommand[] = [
    ...section(wiringText, 'commands').matchAll(/event:\s*(\w+)CommandEvent,\s*handlers:\s*\[([^\]]*)\]/g),
  ].map(match => {
    const handlers = listedHandlers(match[2]);
    const handler = handlers[0] ? fileOf(files, handlers[0]) : undefined;
    const text = handler?.text ?? '';
    const found = analyse(text);
    const aggregate = found.behaviours[0]?.split('.')[0] ?? aggregates.find(each => text.includes(each.name))?.name;
    return {
      name: publicName(match[1]),
      handler: handlers[0] ?? '',
      handlers,
      file: handler?.path ?? '',
      actor: actorOf(text),
      ...(routeOf.has(publicName(match[1])) && { route: routeOf.get(publicName(match[1])) }),
      ...(aggregate && { aggregate }),
      ...found,
    };
  });

  const policyFrom = (handlerName: string, on: StormPolicy['on']): StormPolicy => {
    const handler = fileOf(files, handlerName);
    const text = handler?.text ?? '';
    return {
      name: handlerName,
      file: handler?.path ?? '',
      on,
      publishes: unique([...text.matchAll(/publish\(\s*(\w+)IntegrationEvent\.set\(/g)].map(match => match[1])),
      dispatches: unique(
        [...text.matchAll(/(?:dispatch|publish)\(\s*(\w+)CommandEvent\.set\(/g)].map(match => match[1]),
      ),
      ...analyse(text),
    };
  };
  const subscriptions = (key: string, kind: 'domain-event' | 'integration-event') =>
    [...section(wiringText, key).matchAll(/event:\s*(\w+),\s*handlers:\s*\[([^\]]*)\]/g)].flatMap(match =>
      [...match[2].matchAll(/new (\w+)\(/g)].map(handler =>
        policyFrom(handler[1], { kind, event: publicName(match[1]) }),
      ),
    );
  const policies: StormPolicy[] = [
    ...subscriptions('domainEvents', 'domain-event'),
    ...subscriptions('integrationEvents', 'integration-event'),
  ];
  // A publisher that is not a subscribed handler reacts to every operation: the Tracker's decorated bus.
  for (const file of files) {
    const name = file.text.match(/export class (\w+)/)?.[1];
    if (
      !name ||
      policies.some(policy => policy.name === name) ||
      !/publish\(\s*\w+IntegrationEvent\.set\(/.test(file.text)
    )
      continue;
    if (commands.some(command => command.handler === name)) continue;
    policies.push(policyFrom(name, { kind: 'every-operation', event: 'every operation' }));
  }
  for (const event of events) {
    event.policies = policies
      .filter(policy => policy.on.kind === 'domain-event' && policy.on.event === event.name)
      .map(policy => policy.name);
  }

  const readModels: StormReadModel[] = [...section(wiringText, 'queries').matchAll(/new (\w+)\(/g)].map(match => {
    const handler = fileOf(files, match[1]);
    const text = handler?.text ?? '';
    const model = text.match(/extends QueryHandler<[\s\S]*?,\s*IResult<([^>]+)>\s*>/)?.[1]?.trim() ?? '';
    return {
      name: publicName(match[1]),
      handler: match[1],
      model,
      actor: actorOf(text),
      ...(routeOf.has(publicName(match[1])) && { route: routeOf.get(publicName(match[1])) }),
    };
  });

  return { id: context, aggregates, events, commands, policies, readModels, externals, routed: [...routed].sort() };
}

/**
 * ARCH-ONE-HANDLER: a command has exactly one handler. The wiring lists it once, with one
 * handler; every command a route or a policy builds is one the wiring lists. A fact may have
 * any number of subscribers; a command's outcome is its handler's result, so two handlers
 * would answer twice and none not at all.
 */
export function oneHandlerProblems(storm: EventStorm): string[] {
  const problems: string[] = [];
  for (const context of storm.contexts) {
    const listed = new Map<string, string[]>();
    for (const command of context.commands.filter(command => !command.expected)) {
      listed.set(command.name, [...(listed.get(command.name) ?? []), ...command.handlers]);
    }
    for (const [name, handlers] of listed) {
      if (handlers.length !== 1)
        problems.push(
          `ARCH-ONE-HANDLER: ${context.id}: command ${name} has ${handlers.length} handlers (${handlers.join(', ')}); a command has exactly one`,
        );
    }
    for (const name of context.routed) {
      if (!listed.has(name))
        problems.push(
          `ARCH-ONE-HANDLER: ${context.id}: command ${name} is built by a route and no handler in the Module answers it`,
        );
    }
    for (const policy of context.policies.filter(policy => !policy.expected)) {
      for (const name of policy.dispatches) {
        if (!listed.has(name))
          problems.push(
            `ARCH-ONE-HANDLER: ${context.id}: command ${name} is dispatched by ${policy.name} and no handler in the Module answers it`,
          );
      }
    }
  }
  return problems;
}

/** Where each context's routes are mounted, read from the composition root (`registerRoutes('/notes', noteRoutes, …)`). */
function routeMounts(
  contract: ArchitectureContract,
  files: Map<string, SourceFile[]>,
  root: string,
): Map<string, string> {
  const mounts = new Map<string, string>();
  const bootstrap = join(root, contract.bootstrap.path);
  const texts: string[] = [];
  const read = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true }) as Dirent[]) {
      if (entry.isDirectory()) read(join(dir, entry.name));
      else if (entry.name.endsWith('.ts') && !entry.name.includes('.spec.'))
        texts.push(readFileSync(join(dir, entry.name), 'utf8'));
    }
  };
  read(bootstrap);
  for (const text of texts) {
    for (const match of text.matchAll(/registerRoutes\(\s*'([^']*)',\s*(\w+)/g)) {
      const routesFn = match[2];
      for (const [context, own] of files) {
        if (
          own.some(file =>
            new RegExp(`export (?:const|function|async function) ${escape(routesFn)}\\b`).test(file.text),
          )
        ) {
          mounts.set(context, match[1] === '/' ? '' : match[1]);
        }
      }
    }
  }
  return mounts;
}

/** The storm of this language's tree. */
export function inspectEventStorm(contract: ArchitectureContract, root: string): EventStorm {
  const files = readContextFiles(contract, root);
  const links = inspectContextLinks(contract, root);
  const mounts = routeMounts(contract, files, root);
  const contexts = contract.contexts.map(context =>
    inspectContext(context, files.get(context) ?? [], contract, links, mounts),
  );

  const integration = new Map<string, StormIntegrationEvent>();
  const entry = (name: string) => {
    const existing = integration.get(name) ?? { name, publishedBy: [], consumedBy: [] };
    integration.set(name, existing);
    return existing;
  };
  for (const context of contexts) {
    for (const policy of context.policies) {
      for (const name of policy.publishes) entry(name).publishedBy.push({ context: context.id, policy: policy.name });
      if (policy.on.kind === 'integration-event')
        entry(policy.on.event).consumedBy.push({ context: context.id, policy: policy.name });
    }
  }
  return { language: contract.language.name, contexts, integrationEvents: [...integration.values()], links };
}

// ---------------------------------------------------------------------------------------------
// Rendering: Markdown with Mermaid for the documents, SVG for the board, words for the terminal.

const COLOURS = {
  actor: '#fff3b0',
  command: '#a9cdfb',
  aggregate: '#ffe066',
  event: '#ffb347',
  integration: '#ff8c42',
  policy: '#d4b3ff',
  readmodel: '#b6f0b6',
  external: '#ffb3d9',
} as const;
type Kind = keyof typeof COLOURS;

const KIND_LABEL: Record<Kind, string> = {
  actor: 'actor',
  command: 'command',
  aggregate: 'aggregate',
  event: 'domain event',
  integration: 'integration event',
  policy: 'policy',
  readmodel: 'read model',
  external: 'external system',
};

const id = (text: string) => text.replace(/[^A-Za-z0-9]/g, '_');
const cell = (value: string) => value.replace(/\|/g, '\\|');
const row = (cells: string[]) => `| ${cells.map(cell).join(' | ')} |`;
const table = (headers: string[], rows: string[][]) =>
  [row(headers), row(headers.map(() => '---')), ...rows.map(row)].join('\n');
const code = (values: string[]) => values.map(value => `\`${value}\``).join(', ') || '—';
const externalLabel = (context: StormContext, name: string) => {
  const external = context.externals.find(each => each.name === name);
  return external?.answeredBy ? `${name} (${external.answeredBy})` : name;
};

const classDefs = [
  ...(Object.keys(COLOURS) as Kind[]).map(kind => `  classDef ${kind} fill:${COLOURS[kind]},stroke:#333,color:#111`),
  // A sticky an expected storm lays over the board, not read from the code yet: dashed.
  '  classDef planned stroke-dasharray: 6 4,stroke-width:2px',
].join('\n');

/** The names of the events an expected storm brings to a context, not yet in the code. */
const plannedEvents = (context: StormContext) =>
  new Set(context.events.filter(event => event.expected).map(event => event.name));

/** The big picture: the domain events of each context in a lane, and the integration events that pivot between lanes. */
export function renderBigPicture(storm: EventStorm): string {
  const lines = ['```mermaid', 'flowchart LR'];
  for (const context of storm.contexts) {
    lines.push(`  subgraph ${id(context.id)}["${context.id}"]`, '    direction TB');
    const ordered = unique([
      ...context.commands.flatMap(command => command.events),
      ...context.policies.flatMap(policy => policy.events),
      ...context.events.map(event => event.name),
    ]);
    const planned = plannedEvents(context);
    for (const name of ordered) {
      lines.push(`    e_${id(context.id)}_${id(name)}["${name}"]:::event`);
      if (planned.has(name)) lines.push(`    class e_${id(context.id)}_${id(name)} planned`);
    }
    if (!ordered.length) lines.push(`    e_${id(context.id)}_none["(no domain event: a projection)"]:::readmodel`);
    lines.push('  end');
  }
  for (const integration of storm.integrationEvents) {
    lines.push(`  ie_${id(integration.name)}{{"${integration.name}"}}:::integration`);
    for (const publisher of integration.publishedBy) {
      const context = storm.contexts.find(each => each.id === publisher.context)!;
      const policy = context.policies.find(each => each.name === publisher.policy)!;
      const from =
        policy.on.kind === 'domain-event'
          ? `e_${id(context.id)}_${id(policy.on.event)}`
          : context.events.length
            ? `e_${id(context.id)}_${id(context.events[0].name)}`
            : `e_${id(context.id)}_none`;
      lines.push(`  ${from} -- "${publisher.policy}" --> ie_${id(integration.name)}`);
    }
    for (const consumer of integration.consumedBy) {
      const context = storm.contexts.find(each => each.id === consumer.context)!;
      const policy = context.policies.find(each => each.name === consumer.policy)!;
      const targets = policy.events.length
        ? policy.events.map(event => `e_${id(context.id)}_${id(event)}`)
        : [id(context.id)];
      for (const target of targets) lines.push(`  ie_${id(integration.name)} -- "${consumer.policy}" --> ${target}`);
    }
  }
  lines.push(classDefs, '```');
  return lines.join('\n');
}

/** The process level of one context: actor → command → aggregate → event → policy, read models, external systems. */
export function renderProcess(context: StormContext, storm: EventStorm): string {
  const lines = ['```mermaid', 'flowchart LR'];
  const nodes = new Set<string>();
  const planned = plannedEvents(context);
  const node = (key: string, label: string, kind: Kind, shape: [string, string] = ['["', '"]'], expected = false) => {
    if (nodes.has(key)) return key;
    nodes.add(key);
    lines.push(`  ${key}${shape[0]}${label}${shape[1]}:::${kind}`);
    if (expected) lines.push(`  class ${key} planned`);
    return key;
  };
  const eventNode = (event: string) => node(`e_${c}_${id(event)}`, event, 'event', ['["', '"]'], planned.has(event));
  const edge = (from: string, to: string, label = '', dotted = false) => {
    const arrow = dotted ? (label ? `-. "${label}" .->` : '-.->') : label ? `-- "${label}" -->` : '-->';
    lines.push(`  ${from} ${arrow} ${to}`);
  };
  const c = id(context.id);

  for (const command of context.commands) {
    const actor = node(`a_${c}_${id(command.actor)}`, command.actor, 'actor');
    const cmd = node(
      `c_${c}_${id(command.name)}`,
      command.route ? `${command.name}<br/>${command.route}` : command.name,
      'command',
      ['["', '"]'],
      command.expected,
    );
    edge(actor, cmd);
    let last = cmd;
    if (command.aggregate) {
      const aggregate = node(`ag_${c}_${id(command.aggregate)}`, command.aggregate, 'aggregate');
      edge(cmd, aggregate, command.behaviours.map(each => each.split('.')[1]).join(', '));
      last = aggregate;
    }
    for (const event of command.events) edge(last, eventNode(event));
    for (const external of command.uses)
      edge(cmd, node(`x_${c}_${id(external)}`, externalLabel(context, external), 'external'), '', true);
  }
  for (const policy of context.policies) {
    const trigger =
      policy.on.kind === 'domain-event'
        ? eventNode(policy.on.event)
        : policy.on.kind === 'integration-event'
          ? node(`ie_${id(policy.on.event)}`, policy.on.event, 'integration', ['{{"', '"}}'])
          : node(`op_${c}`, policy.on.event, 'event');
    const pol = node(`p_${c}_${id(policy.name)}`, policy.name, 'policy', ['["', '"]'], policy.expected);
    edge(trigger, pol);
    for (const name of policy.publishes) edge(pol, node(`ie_${id(name)}`, name, 'integration', ['{{"', '"}}']));
    for (const name of policy.dispatches) edge(pol, node(`c_${c}_${id(name)}`, name, 'command'));
    let last = pol;
    const aggregate = policy.behaviours[0]?.split('.')[0];
    if (aggregate) {
      last = node(`ag_${c}_${id(aggregate)}`, aggregate, 'aggregate');
      edge(pol, last, policy.behaviours.map(each => each.split('.')[1]).join(', '));
    }
    for (const event of policy.events) edge(last, eventNode(event));
    for (const external of policy.uses)
      edge(pol, node(`x_${c}_${id(external)}`, externalLabel(context, external), 'external'), '', true);
  }
  for (const readModel of context.readModels) {
    const actor = node(`a_${c}_${id(readModel.actor)}`, readModel.actor, 'actor');
    const rm = node(
      `rm_${c}_${id(readModel.name)}`,
      `${readModel.name}${readModel.model ? `<br/>${readModel.model}` : ''}${readModel.route ? `<br/>${readModel.route}` : ''}`,
      'readmodel',
      ['["', '"]'],
      readModel.expected,
    );
    edge(actor, rm);
  }
  lines.push(classDefs, '```');
  void storm;
  return lines.join('\n');
}

export const STORM_MARKER = '<!-- generated from the code (event storm); run the conventions check with --write -->';

/** The whole storm as Markdown: the big picture, then each context at process level with its tables. */
export function renderEventStorm(storm: EventStorm): string {
  const parts = [
    `Read from the ${storm.language} tree. Colours are the ones a wall would have: actors in pale yellow, commands in blue, aggregates in yellow, domain events in orange, integration events in dark orange, policies in purple, read models in green, external systems in pink.`,
    '',
    '### The big picture',
    '',
    'Each lane is a bounded context and holds its domain events, in the order the commands produce them; a hexagon is an integration event, the pivot from one context to the next, with the policy that publishes it on the way in and the one that consumes it on the way out.',
    '',
    renderBigPicture(storm),
  ];
  for (const context of storm.contexts) {
    parts.push('', `### ${context.id}`, '', renderProcess(context, storm));
    if (context.commands.length) {
      parts.push(
        '',
        table(
          ['Actor', 'Command', 'Route', 'Aggregate · behaviour', 'Events', 'Needs'],
          context.commands.map(command => [
            command.actor,
            `\`${command.name}\`${command.expected ? ' *(planned)*' : ''}`,
            command.route ? `\`${command.route}\`` : '—',
            command.behaviours.length ? code(command.behaviours) : command.aggregate ? `\`${command.aggregate}\`` : '—',
            code(command.events),
            [...command.uses.map(use => externalLabel(context, use)), ...command.services]
              .map(each => `\`${each}\``)
              .join(', ') || '—',
          ]),
        ),
      );
    }
    if (context.policies.length) {
      parts.push(
        '',
        table(
          ['On', 'Policy', 'Does'],
          context.policies.map(policy => [
            policy.on.kind === 'integration-event'
              ? `\`${policy.on.event}\` (integration event)`
              : policy.on.kind === 'every-operation'
                ? policy.on.event
                : `\`${policy.on.event}\``,
            `\`${policy.name}\`${policy.expected ? ' *(planned)*' : ''}`,
            [
              ...policy.publishes.map(name => `publishes \`${name}\``),
              ...policy.dispatches.map(name => `dispatches \`${name}\``),
              ...policy.behaviours.map(name => `asks \`${name}\``),
              ...policy.events.map(name => `→ \`${name}\``),
              ...policy.uses.map(name => `needs \`${externalLabel(context, name)}\``),
            ].join(', ') || 'logs',
          ]),
        ),
      );
    }
    if (context.readModels.length) {
      parts.push(
        '',
        table(
          ['Actor', 'Query', 'Route', 'Read model'],
          context.readModels.map(readModel => [
            readModel.actor,
            `\`${readModel.name}\``,
            readModel.route ? `\`${readModel.route}\`` : '—',
            readModel.model ? `\`${readModel.model}\`` : '—',
          ]),
        ),
      );
    }
    if (context.externals.length) {
      parts.push(
        '',
        table(
          ['External system', 'Port', 'Answered by', 'Adapters'],
          context.externals.map(external => [
            external.name,
            `\`${external.port}\``,
            external.answeredBy ?? 'an adapter of this context',
            code(external.adapters),
          ]),
        ),
      );
    }
    const unhandled = context.events.filter(event => !event.policies.length);
    if (unhandled.length)
      parts.push(
        '',
        `Recorded and handled by nobody yet (the Tracker still records them): ${code(unhandled.map(event => event.name))}.`,
      );
  }
  return parts.join('\n');
}

/** The board as one SVG: a lane per context, a row per flow, stickies in the colours of the wall. */
export function renderEventStormSvg(storm: EventStorm): string {
  const W = 184;
  const H = 64;
  const GX = 212;
  const GY = 88;
  const LEFT = 40;
  type Sticky = {
    col: number;
    kind: Kind;
    title: string;
    subtitle?: string;
    arrow?: boolean;
    dotted?: boolean;
    planned?: boolean;
  };
  type Row = Sticky[];
  const lanes: { title: string; rows: Row[] }[] = [];
  for (const context of storm.contexts) {
    const rows: Row[] = [];
    const planned = plannedEvents(context);
    for (const command of context.commands) {
      const row: Row = [
        { col: 0, kind: 'actor', title: command.actor },
        {
          col: 1,
          kind: 'command',
          title: command.name,
          subtitle: command.route,
          arrow: true,
          planned: command.expected,
        },
      ];
      let col = 2;
      if (command.aggregate)
        row.push({
          col: col++,
          kind: 'aggregate',
          title: command.aggregate,
          subtitle: command.behaviours.map(each => each.split('.')[1]).join(', '),
          arrow: true,
        });
      for (const event of command.events) {
        row.push({ col: col++, kind: 'event', title: event, arrow: true, planned: planned.has(event) });
      }
      for (const use of command.uses)
        row.push({ col: col++, kind: 'external', title: externalLabel(context, use), dotted: true });
      rows.push(row);
    }
    for (const policy of context.policies) {
      const row: Row = [
        policy.on.kind === 'integration-event'
          ? { col: 0, kind: 'integration', title: policy.on.event, subtitle: 'from another context' }
          : policy.on.kind === 'every-operation'
            ? { col: 0, kind: 'event', title: 'every operation' }
            : { col: 0, kind: 'event', title: policy.on.event },
        { col: 1, kind: 'policy', title: policy.name, arrow: true, planned: policy.expected },
      ];
      let col = 2;
      const aggregate = policy.behaviours[0]?.split('.')[0];
      if (aggregate)
        row.push({
          col: col++,
          kind: 'aggregate',
          title: aggregate,
          subtitle: policy.behaviours.map(each => each.split('.')[1]).join(', '),
          arrow: true,
        });
      for (const event of policy.events) {
        row.push({ col: col++, kind: 'event', title: event, arrow: true, planned: planned.has(event) });
      }
      for (const name of policy.publishes)
        row.push({ col: col++, kind: 'integration', title: name, subtitle: 'published', arrow: true });
      for (const name of policy.dispatches)
        row.push({ col: col++, kind: 'command', title: name, subtitle: 'dispatched', arrow: true });
      for (const use of policy.uses)
        row.push({ col: col++, kind: 'external', title: externalLabel(context, use), dotted: true });
      rows.push(row);
    }
    for (const readModel of context.readModels) {
      rows.push([
        { col: 0, kind: 'actor', title: readModel.actor },
        {
          col: 1,
          kind: 'readmodel',
          title: readModel.name,
          subtitle: readModel.route ?? readModel.model,
          arrow: true,
          planned: readModel.expected,
        },
      ]);
    }
    lanes.push({ title: context.id, rows });
  }

  const cols = Math.max(1, ...lanes.flatMap(lane => lane.rows.flatMap(row => row.map(sticky => sticky.col + 1))));
  const width = LEFT * 2 + cols * GX;
  const legendHeight = 70;
  const laneHeights = lanes.map(lane => 44 + Math.max(1, lane.rows.length) * GY);
  const height = legendHeight + laneHeights.reduce((sum, each) => sum + each + 20, 0) + 20;
  const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="12">`,
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#333"/></marker></defs>`,
    `<rect width="100%" height="100%" fill="#fafafa"/>`,
    `<text x="${LEFT}" y="26" font-size="16" font-weight="600">Event storm — ${esc(storm.language)}, read from the code</text>`,
  ];
  let lx = LEFT;
  for (const kind of Object.keys(COLOURS) as Kind[]) {
    out.push(
      `<rect x="${lx}" y="38" width="14" height="14" fill="${COLOURS[kind]}" stroke="#333"/>`,
      `<text x="${lx + 18}" y="49">${KIND_LABEL[kind]}</text>`,
    );
    lx += 18 + KIND_LABEL[kind].length * 7 + 16;
  }
  let y = legendHeight;
  lanes.forEach((lane, index) => {
    const laneHeight = laneHeights[index];
    out.push(
      `<rect x="${LEFT / 2}" y="${y}" width="${width - LEFT}" height="${laneHeight}" fill="#ffffff" stroke="#ccc" rx="6"/>`,
      `<text x="${LEFT}" y="${y + 24}" font-size="14" font-weight="600">${esc(lane.title)}</text>`,
    );
    let ry = y + 40;
    for (const row of lane.rows) {
      for (const sticky of row) {
        const x = LEFT + sticky.col * GX;
        if (sticky.arrow || sticky.dotted) {
          const previous = row.find(each => each.col === sticky.col - 1) ?? row[0];
          const px = LEFT + previous.col * GX + W;
          const mid = ry + H / 2;
          // Two events in a row are two outcomes of the same behaviour, not a sequence: "or" between them.
          if (sticky.kind === 'event' && previous.kind === 'event') {
            out.push(
              `<line x1="${px}" y1="${mid}" x2="${x}" y2="${mid}" stroke="#333" stroke-width="1.2" stroke-dasharray="2 3"/>`,
              `<text x="${(px + x) / 2}" y="${mid - 5}" font-size="10" text-anchor="middle" fill="#333">or</text>`,
            );
          } else {
            out.push(
              `<line x1="${px}" y1="${mid}" x2="${x}" y2="${mid}" stroke="#333" stroke-width="1.2" marker-end="url(#arrow)"${sticky.dotted ? ' stroke-dasharray="4 3"' : ''}/>`,
            );
          }
        }
        const stroke = sticky.kind === 'integration' ? '#7a2e00' : '#333';
        const subtitle = sticky.subtitle ?? (sticky.planned ? 'planned' : undefined);
        out.push(
          `<rect x="${x}" y="${ry}" width="${W}" height="${H}" fill="${COLOURS[sticky.kind]}" stroke="${stroke}" stroke-width="${sticky.kind === 'integration' || sticky.planned ? 2 : 1}" rx="3"${sticky.planned ? ' stroke-dasharray="6 4"' : ''}/>`,
          `<text x="${x + 10}" y="${ry + (subtitle ? 27 : 36)}" font-weight="600">${esc(clip(sticky.title, 27))}</text>`,
        );
        if (subtitle)
          out.push(`<text x="${x + 10}" y="${ry + 46}" font-size="10" fill="#333">${esc(clip(subtitle, 33))}</text>`);
      }
      ry += GY;
    }
    y += laneHeight + 20;
  });
  out.push('</svg>');
  return out.join('\n');
}

/** `yarn architecture storm`, in words. */
export function describeEventStorm(storm: EventStorm): string {
  const lines: string[] = [];
  for (const context of storm.contexts) {
    lines.push(`${context.id}`);
    for (const command of context.commands) {
      lines.push(
        `  ${command.actor} → ${command.name}${command.route ? ` (${command.route})` : ''}${command.aggregate ? ` → ${command.aggregate}` : ''}${command.events.length ? ` → ${command.events.join(', ')}` : ''}${command.uses.length ? ` [needs ${command.uses.map(use => externalLabel(context, use)).join(', ')}]` : ''}`,
      );
    }
    for (const policy of context.policies) {
      const does = [
        ...policy.publishes.map(name => `publishes ${name}`),
        ...policy.dispatches.map(name => `dispatches ${name}`),
        ...policy.events.map(name => `→ ${name}`),
      ].join(', ');
      lines.push(`  on ${policy.on.event}: ${policy.name}${does ? ` ${does}` : ''}`);
    }
    for (const readModel of context.readModels) {
      lines.push(
        `  ${readModel.actor} reads ${readModel.name}${readModel.model ? ` → ${readModel.model}` : ''}${readModel.route ? ` (${readModel.route})` : ''}`,
      );
    }
    lines.push('');
  }
  lines.push('Integration events:');
  for (const integration of storm.integrationEvents) {
    lines.push(
      `  ${integration.name}: ${integration.publishedBy.map(each => each.context).join(', ') || 'nobody'} → ${integration.consumedBy.map(each => each.context).join(', ') || 'nobody'}`,
    );
  }
  return lines.join('\n');
}
