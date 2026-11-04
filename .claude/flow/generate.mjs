#!/usr/bin/env node
/**
 * The boilerplate generator of J5's side experiment "generated boilerplate"
 * (docs/evaluations/benchmark/openstay/j5/proposal.md, "The side experiments"): how much of a Clean DDD
 * feature's cost is the layers rather than the rules.
 *
 *   node .claude/flow/generate.mjs --project <tree> --storm <storm.yaml>
 *
 * From the feature's expected storm, it writes into a TypeScript tree built on the clean-ddd architecture,
 * for each context of the storm, every piece of shape the feature needs and that the tree does not have yet:
 *   - each new domain event: an empty-payload class, appended to its aggregate's events file, or in a file of
 *     its own, where and as that tree keeps its aggregate's events;
 *   - each command: its CommandEvent (the route's parameters as payload), its handler, whose execute() refuses
 *     with a failed Result saying it is not written yet, and a spec with one pending `it.todo`;
 *   - each query: its handler, an empty read-model type, execute() refusing the same way;
 *   - each integration event a policy publishes: an empty-payload class in the shared kernel's file of the
 *     publishing context, named as that tree names those files;
 *   - each policy: its event handler, an empty reaction returning ok, and a spec with one `it.todo`;
 *   - each route: a controller method that builds the command (202 through the bus, or answered at once,
 *     as the tree's controllers do) or asks the query, a routes file, a body schema of `type: object` only,
 *     an e2e skeleton, and its registration in the composition root;
 *   - the entries listing all of these in the context's module.local.ts (and its Commands/Queries barrels).
 * Then it formats what it touched with the tree's prettier.
 *
 * It never writes a rule: no validation, no condition, no guard or `requireSignedIn`, no state change, no
 * behaviour or aggregate, no repository, port or adapter, no SQL, no payload field beyond a route's parameter,
 * no status code beyond the tree's default, no publish call in a reaction. Every body it writes is a TODO the
 * agent replaces. That is the point of the experiment: what is generated is the layers and the wiring, and what
 * the agent still pays for is the rules, so a rule found in the generated files is a defect of this generator.
 *
 * It is deterministic (no model call) and idempotent: anything that already exists — a class, a command's
 * folder, a route, a subscription to the same event in the module — is left alone. The trees diverged, so it
 * reads each tree's own shape from its files (where events live and how their files are named, the integration
 * events' file names, the controllers' prefix, whether commands answer 202 or at once, the handlers' names,
 * the composition root's mount and module expressions) rather than assuming one.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, relative, resolve } from 'node:path';

const arg = name => process.argv[process.argv.indexOf(`--${name}`) + 1];
if (!process.argv.includes('--project') || !process.argv.includes('--storm')) {
  console.error('usage: node .claude/flow/generate.mjs --project <tree> --storm <storm.yaml>');
  process.exit(2);
}
const project = resolve(arg('project'));
const require = createRequire(join(project, 'package.json'));
const yaml = require('js-yaml');
const storm = yaml.load(readFileSync(resolve(arg('storm')), 'utf8'));
const feature = storm.feature;
const binding = yaml.load(readFileSync(join(project, 'conventions/typescript.yaml'), 'utf8'));
const trees = [binding.contexts_tree, binding.kernel, binding.architecture, binding.bootstrap];
const contextsDir = join(project, binding.contexts_tree.path);
const kernelEventsDir = join(project, binding.kernel.path, 'Application/IntegrationEvents');

// ---- files -------------------------------------------------------------------------------------
const touched = new Set();
const read = path => readFileSync(path, 'utf8');
const write = (path, text) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  touched.add(path);
};
const create = (path, text) => existsSync(path) || write(path, text);
const walk = dir =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
        entry.isDirectory() ? walk(join(dir, entry.name)) : entry.name.endsWith('.ts') ? [join(dir, entry.name)] : [],
      )
    : [];
const sources = dir => walk(dir).filter(path => !path.includes('.spec.'));
const grep = (paths, regex) => paths.find(path => regex.test(read(path)));
const alias = path => {
  const tree = trees.find(each => path.startsWith(join(project, each.path) + '/'));
  return `${tree.alias}/${relative(join(project, tree.path), path).replace(/\.ts$/, '')}`;
};
const importOf = (names, path) => `import { ${[names].flat().join(', ')} } from '${alias(path)}';`;
/** Adds each import line the text does not have, after its last import. */
const withImports = (text, lines) => {
  const missing = lines.filter(line => !text.includes(line));
  if (!missing.length) return text;
  const last = [...text.matchAll(/^import [\s\S]*?;$/gm)].pop();
  const at = last ? last.index + last[0].length : 0;
  return `${text.slice(0, at)}\n${missing.join('\n')}${at ? '' : '\n'}${text.slice(at)}`;
};

// ---- names -------------------------------------------------------------------------------------
const camel = name => name[0].toLowerCase() + name.slice(1);
const pascal = kebab => kebab.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());
const routeOf = route => {
  const [method, path] = route.split(' ');
  const params = [...path.matchAll(/\{(\w+)\}/g)].map(match => match[1]);
  return { method: method.toLowerCase(), path: path.replace(/\{(\w+)\}/g, ':$1'), params };
};
const paramsType = params => (params.length ? `{ ${params.map(param => `${param}: string`).join('; ')} }` : null);
const todo = `TODO(generated from the storm of ${feature})`;

// ---- the tree's own shape ----------------------------------------------------------------------
const allContexts = binding.contexts;
const contextSources = Object.fromEntries(allContexts.map(c => [c, sources(join(contextsDir, c))]));
const eventFiles = Object.values(contextSources)
  .flat()
  .filter(path => /extends DomainEvent\b/.test(read(path)));
const eventsInSubdir = eventFiles.filter(path => basename(dirname(path)) === 'Events').length * 2 >= eventFiles.length;
const kernelFiles = sources(kernelEventsDir).map(path => basename(path, 'IntegrationEvents.ts'));
const pluralKernelFiles =
  kernelFiles.filter(name => allContexts.includes(name) && name.endsWith('s')).length >=
  kernelFiles.filter(name => allContexts.includes(`${name}s`)).length;
const controllers = Object.values(contextSources)
  .flat()
  .filter(path => path.includes('/Controllers/'));
const controllerPrefix =
  controllers.filter(path => basename(path).startsWith('Fastify')).length * 2 > controllers.length ? 'Fastify' : '';
const atOnce = files => {
  const own = files.filter(path => path.includes('/Controllers/')).map(read);
  const pool = own.some(text => /answerAtOnce\(|eventBus\.publish\(/.test(text)) ? own : controllers.map(read);
  return (
    pool.filter(text => text.includes('answerAtOnce(')).length >
    pool.filter(text => text.includes('eventBus.publish(')).length
  );
};
const publishPrefix = Object.values(contextSources)
  .flat()
  .some(path => /\/Application\/Events\/Publish\w+Handler\.ts$/.test(path));
const root = walk(join(project, binding.bootstrap.path)).find(
  path => !path.includes('.spec.') && read(path).includes('.registerRoutes('),
);

// ---- the module, as data -----------------------------------------------------------------------
/** The [start, end] of the object literal opening at `open` (a `{`), strings and comments skipped. */
const objectAt = (text, open) => {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === "'" || c === '"' || c === '`') {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === '\\') i++;
    } else if (c === '/' && text[i + 1] === '/') i = text.indexOf('\n', i);
    else if (c === '/' && text[i + 1] === '*') i = text.indexOf('*/', i) + 1;
    else if ('{[('.includes(c)) depth++;
    else if ('}])'.includes(c) && --depth === 0) return [open, i];
  }
  throw new Error('unbalanced module object');
};
/** Lists `entry` under `key` (commands, queries, domainEvents, integrationEvents) in the context's `new Module({...})`. */
const listInModule = (text, context, key, entry) => {
  const opens = [...text.matchAll(/new Module\(\s*\{/g)].map(match => match.index + match[0].length - 1);
  // The context's Module; where the wiring builds a bare one too (no notifier configured), the whole one: the largest.
  const [start, end] = opens
    .map(open => objectAt(text, open))
    .filter(([s, e]) => text.slice(s, e).includes(`'${context}'`))
    .sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0];
  const array = text.slice(start, end).match(new RegExp(`\\b${key}\\s*:\\s*\\[`));
  if (!array) {
    const before = text.slice(0, end).trimEnd();
    return `${before}${/[,{]$/.test(before) ? '' : ','} ${key}: [${entry}],\n${text.slice(end)}`;
  }
  const at = start + array.index + array[0].length;
  return `${text.slice(0, at)}\n${entry},${text.slice(at)}`;
};

// ---- the storm ---------------------------------------------------------------------------------
const wiring = {}; // context -> { imports: [], entries: [[key, entry]] }
const wire = (context, imports, key, entry) => {
  wiring[context] ??= { imports: [], entries: [] };
  wiring[context].imports.push(...imports);
  wiring[context].entries.push([key, entry]);
};
const findClass = (paths, name) => grep(paths, new RegExp(`export class ${name}\\b`));
const kernelPaths = () => sources(kernelEventsDir);

/** The integration event `name`, published by `context`, in the shared kernel's file for that context. */
function integrationEvent(context, name) {
  if (findClass(kernelPaths(), `${name}IntegrationEvent`)) return;
  const names = pluralKernelFiles ? [context, context.replace(/s$/, '')] : [context.replace(/s$/, ''), context];
  const path =
    names.map(n => join(kernelEventsDir, `${n}IntegrationEvents.ts`)).find(existsSync) ??
    join(kernelEventsDir, `${names[0]}IntegrationEvents.ts`);
  const head = existsSync(path)
    ? read(path).trimEnd() + '\n'
    : "import { IntegrationEvent } from '@Architecture/Domain';\n";
  write(
    path,
    `${head}\n/** Published by ${context}. ${todo}: the payload a consumer needs, so it never queries back. */\nexport class ${name}IntegrationEvent extends IntegrationEvent<Record<string, never>> {}\n`,
  );
}

/** The domain event `name` of `aggregate`, where the tree keeps that aggregate's events. */
function domainEvent(context, name, aggregate) {
  const domain = join(contextsDir, context, 'Domain');
  const files = sources(domain);
  if (findClass(files, `${name}Event`)) return;
  const declaration = `\n/** ${todo}: what ${aggregate} records, and the minimum a subscriber needs to know. */\nexport class ${name}Event extends DomainEvent<Record<string, never>> {}\n`;
  const own = files.find(
    path => basename(path) === `${aggregate}Events.ts` && /extends DomainEvent\b/.test(read(path)),
  );
  if (own) return write(own, read(own).trimEnd() + '\n' + declaration);
  // An aggregate whose events are one per file: a new file beside the ones it imports, named as they are.
  const aggregateFile = files.find(path => basename(path) === `${aggregate}.ts`);
  const imported = aggregateFile
    ? [...read(aggregateFile).matchAll(/from '([^']+)'/g)]
        .map(([, from]) => {
          if (from.startsWith('./')) return join(dirname(aggregateFile), `${from}.ts`);
          const tree = trees.find(each => from.startsWith(each.alias + '/'));
          return tree && join(project, tree.path, `${from.slice(tree.alias.length + 1)}.ts`);
        })
        .filter(path => path && existsSync(path) && (read(path).match(/extends DomainEvent\b/g) ?? []).length === 1)
    : [];
  const single = imported.find(path => !basename(path).endsWith('Events.ts'));
  if (single) {
    const suffix = basename(single, '.ts').endsWith('Event') ? 'Event' : '';
    return create(
      join(dirname(single), `${name}${suffix}.ts`),
      `import { DomainEvent } from '@Architecture/Domain';\n${declaration}`,
    );
  }
  const dir = eventsInSubdir ? join(domain, aggregate, 'Events') : join(domain, aggregate);
  create(join(dir, `${aggregate}Events.ts`), `import { DomainEvent } from '@Architecture/Domain';\n${declaration}`);
}

const commandsDir = context => join(contextsDir, context, 'Application/Commands');
const queriesDir = context => join(contextsDir, context, 'Application/Queries');
const barrel = (dir, lines) => {
  const index = join(dir, 'index.ts');
  if (!existsSync(index)) return;
  const text = read(index);
  const missing = lines.filter(line => !text.includes(line));
  if (missing.length) write(index, `${text.trimEnd()}\n${missing.join('\n')}\n`);
};

function command(context, { name, actor, route, aggregate, events = [] }) {
  const dir = join(commandsDir(context), name);
  const event = join(dir, `${name}CommandEvent.ts`);
  const handler = join(dir, `${name}CommandHandler.ts`);
  const params = route ? routeOf(route).params : [];
  if (!existsSync(dir)) {
    write(
      event,
      `import { CommandEvent } from '@Architecture/Domain';\n\n/** ${actor ? actor[0].toUpperCase() + actor.slice(1) : 'Someone'} asks ${route ? `it at ${route}` : 'for it'}. ${todo}: the body's fields. */\nexport class ${name}CommandEvent extends CommandEvent<${paramsType(params) ?? 'Record<string, never>'}> {}\n`,
    );
    write(
      handler,
      `import { CommandHandler, ExecutionContext } from '@Architecture/Application';\nimport { IResult, Result, UnknownException } from '@Architecture/Domain';\n\n${importOf(`${name}CommandEvent`, event)}\n\n/**\n * ${todo}: ${actor ?? 'the caller'} asks it; it reaches ${aggregate ?? 'its aggregate'}${events.length ? `, which records ${events.join(', ')}` : ''}.\n * Not written yet: it refuses every call until the rule is.\n */\nexport class ${name}CommandHandler extends CommandHandler<${name}CommandEvent> {\n  async execute(_: ${name}CommandEvent, __: ExecutionContext): Promise<IResult<unknown>> {\n    return Result.fail(new UnknownException('${name} is not written yet'));\n  }\n}\n`,
    );
    write(
      join(dir, `${name}CommandHandler.spec.ts`),
      `import { describe, it } from '@jest/globals';\n\ndescribe('${name}CommandHandler', () => {\n  it.todo('${name}: the way it goes when it is allowed, and each refusal (${todo})');\n});\n`,
    );
    barrel(commandsDir(context), [
      `export { ${name}CommandEvent } from '${alias(event)}';`,
      `export { ${name}CommandHandler } from '${alias(handler)}';`,
    ]);
  }
  wire(
    context,
    [importOf(`${name}CommandEvent`, event), importOf(`${name}CommandHandler`, handler)],
    'commands',
    `{ event: ${name}CommandEvent, handlers: [new ${name}CommandHandler()] }`,
  );
}

function query(context, { name, actor, route }) {
  const dir = join(queriesDir(context), name);
  const handler = join(dir, `${name}QueryHandler.ts`);
  const params = paramsType(route ? routeOf(route).params : []) ?? 'void';
  if (!existsSync(dir)) {
    write(
      handler,
      `import { ExecutionContext, QueryHandler } from '@Architecture/Application';\nimport { IResult, Result, UnknownException } from '@Architecture/Domain';\n\n/** ${todo}: the read model's fields. */\nexport type ${name}ReadModel = Record<string, never>;\n\n/**\n * ${todo}: ${actor ?? 'the caller'} asks it${route ? ` at ${route}` : ''}; it reads its queries port and nothing else.\n * Not written yet: it refuses every call until the read is.\n */\nexport class ${name}QueryHandler extends QueryHandler<undefined, ${params}, IResult<${name}ReadModel>> {\n  constructor() {\n    super(undefined);\n  }\n\n  async execute(_: ${params}, __: ExecutionContext): Promise<IResult<${name}ReadModel>> {\n    return Result.fail(new UnknownException('${name} is not written yet'));\n  }\n}\n`,
    );
    barrel(queriesDir(context), [`export { ${name}QueryHandler } from '${alias(handler)}';`]);
  }
  wire(context, [importOf(`${name}QueryHandler`, handler)], 'queries', `new ${name}QueryHandler()`);
}

function policy(context, { on, kind, publishes = [], events = [] }) {
  const domain = kind === 'domain-event';
  const eventClass = domain ? `${on}Event` : `${on}IntegrationEvent`;
  const eventPath = findClass(domain ? sources(join(contextsDir, context, 'Domain')) : kernelPaths(), eventClass);
  if (!eventPath)
    throw new Error(`${context}: the policy on ${on} subscribes to ${eventClass}, which the tree does not have`);
  const module = join(contextsDir, context, binding.wiring);
  if (new RegExp(`event:\\s*${eventClass},`).test(read(module))) return; // a reaction to it is already wired
  const name = domain
    ? `${publishPrefix && publishes.length ? 'Publish' : ''}${on}Handler`
    : `${on}IntegrationEventHandler`;
  const path = join(contextsDir, context, 'Application/Events', `${name}.ts`);
  const does = [
    publishes.length && `publishes ${publishes.join(', ')}`,
    events.length && `reaches ${events.join(', ')}`,
  ]
    .filter(Boolean)
    .join(' and ');
  create(
    path,
    `import { EventHandler, ExecutionContext } from '@Architecture/Application';\nimport { IResult, Result } from '@Architecture/Domain';\n\n${importOf(eventClass, eventPath)}\n\n/** ${todo}: ${context}'s reaction to ${on}${does ? `, which ${does}` : ''}. Not written yet: it does nothing. */\nexport class ${name} extends EventHandler<${eventClass}> {\n  async execute(_: ${eventClass}, __: ExecutionContext): Promise<IResult<unknown>> {\n    return Result.ok();\n  }\n}\n`,
  );
  create(
    path.replace(/\.ts$/, '.spec.ts'),
    `import { describe, it } from '@jest/globals';\n\ndescribe('${name}', () => {\n  it.todo('on ${on}, ${does || 'its reaction'} (${todo})');\n});\n`,
  );
  wire(
    context,
    [importOf(eventClass, eventPath), importOf(name, path)],
    domain ? 'domainEvents' : 'integrationEvents',
    `{ event: ${eventClass}, handlers: [new ${name}()] }`,
  );
}

/** The routes of the storm in `context`: a controller, a routes file, its schemas, an e2e skeleton, the mount. */
function routes(context, operations, routesName) {
  const rest = join(contextsDir, context, 'Presentation/API/REST');
  const routeFiles = sources(join(rest, 'Routes')).map(read).join('\n');
  const todoRoutes = operations
    .map(op => ({ ...op, ...routeOf(op.route) }))
    .filter(
      op =>
        !new RegExp(`fastify\\.${op.method}(<[^']*?>)?\\(\\s*'${op.path.replace(/[/:]/g, '\\$&')}'`).test(routeFiles),
    );
  if (!todoRoutes.length) return;
  const routesPath = join(rest, 'Routes', `${feature}.routes.ts`);
  if (existsSync(routesPath)) return;
  const once = atOnce(contextSources[context]);
  const controllerName = `${controllerPrefix}${pascal(feature)}Controller`;
  const controllerPath = join(rest, 'Controllers', `${controllerName}.ts`);
  const usesModule = once || todoRoutes.some(op => op.kind === 'query');
  const usesRefuse = usesModule;
  const imports = new Set();
  const methods = todoRoutes.map(op => {
    const req = `req: FastifyRequest${op.params.length ? `<{ Params: ${paramsType(op.params)} }>` : ''}`;
    const payload = op.params.length
      ? `{ ${op.params.map(p => `${p}: req.params.${p}`).join(', ')} }`
      : op.kind === 'query'
        ? 'undefined'
        : '{}';
    const method = camel(op.name);
    if (op.kind === 'query') {
      imports.add(importOf(`${op.name}QueryHandler`, join(queriesDir(context), op.name, `${op.name}QueryHandler.ts`)));
      return `  async ${method}(${req}, reply: FastifyReply) {\n    const result = await this.#module.getQuery(${op.name}QueryHandler).handle(${payload}, req.executionContext);\n    return result.isFailure() ? this.refuse(reply, result.error) : result.data;\n  }`;
    }
    const dir = join(commandsDir(context), op.name);
    imports.add(importOf(`${op.name}CommandEvent`, join(dir, `${op.name}CommandEvent.ts`)));
    if (!once)
      return `  async ${method}(${req}, reply: FastifyReply) {\n    const operation = req.executionContext.eventBus.publish(${op.name}CommandEvent.set(${payload}), req.executionContext);\n    return reply.code(202).send({ operationId: operation.id });\n  }`;
    imports.add(importOf(`${op.name}CommandHandler`, join(dir, `${op.name}CommandHandler.ts`)));
    return `  async ${method}(${req}, reply: FastifyReply) {\n    const result = await answerAtOnce(this.#module.getCommand(${op.name}CommandHandler), ${op.name}CommandEvent.set(${payload}), req.executionContext);\n    if (result.isFailure()) return this.refuse(reply, result.error);\n    reply.code(204);\n    return undefined;\n  }`;
  });
  const domainImports = usesRefuse
    ? ['ConcurrencyConflictException', 'Exception', 'NotAllowedException', 'NotFoundException', 'UnknownException']
    : [];
  write(
    controllerPath,
    [
      "import { FastifyReply, FastifyRequest } from 'fastify';\n",
      usesModule && "import { Module } from '@Architecture/Application';",
      domainImports.length && `import { ${domainImports.join(', ')} } from '@Architecture/Domain';`,
      once && "import { answerAtOnce } from '@Architecture/Presentation/answerAtOnce';",
      '',
      ...[...imports].sort(),
      '',
      `/** The ${context} context's routes of ${feature}: each builds its command or asks its query, and nothing else. ${todo}: the status each answers, the body's fields. */`,
      `export class ${controllerName} {`,
      usesModule &&
        '  readonly #module: Module;\n\n  constructor({ module }: { module: Module }) {\n    this.#module = module;\n  }\n',
      methods.join('\n\n'),
      usesRefuse &&
        '\n  private refuse(reply: FastifyReply, error: Exception) {\n    if (error instanceof NotAllowedException) reply.code(401);\n    else if (error instanceof NotFoundException) reply.code(404);\n    else if (error instanceof ConcurrencyConflictException) reply.code(409);\n    else if (error instanceof UnknownException) reply.code(500);\n    else reply.code(422);\n    return { message: error.message };\n  }',
      '}\n',
    ]
      .filter(line => line !== false && line !== 0)
      .join('\n'),
  );

  // A body schema, `type: object` only, where a body is sure to come: a PUT or PATCH, or a POST that creates (no path
  // parameter). A POST on an action of an existing thing (`/{id}/suspend`) may come with no body, which the schema would refuse.
  const bodies = todoRoutes.filter(
    op =>
      op.kind === 'command' && (['put', 'patch'].includes(op.method) || (op.method === 'post' && !op.params.length)),
  );
  const schemaPath = join(rest, 'Routes', `${feature}.routes.schema.ts`);
  if (bodies.length)
    create(
      schemaPath,
      `// The bodies' shapes, by type only (API-BODY-SHAPE). ${todo}: each field, its type and whether it is required; whether a value is allowed is the domain's to refuse.\n\n${bodies.map(op => `export const ${op.name}BodySchema = { type: 'object' };`).join('\n')}\n`,
    );
  const moduleKey = `${camel(context)}Module`;
  write(
    routesPath,
    [
      "import { FastifyInstance } from 'fastify';\n",
      "import { Module } from '@Architecture/Application';\n",
      importOf(controllerName, controllerPath),
      bodies.length &&
        importOf(
          bodies.map(op => `${op.name}BodySchema`),
          schemaPath,
        ),
      `\n/** The ${context} context's routes of ${feature}, generated from its storm. */`,
      `export const ${routesName} = function (\n  fastify: FastifyInstance,\n  ${usesModule ? `{ ${moduleKey} }` : '_options'}: { ${moduleKey}: Module },\n  done: () => void,\n) {`,
      `  const controller = new ${controllerName}(${usesModule ? `{ module: ${moduleKey} }` : ''});\n`,
      ...todoRoutes.map(
        op =>
          `  fastify.${op.method}('${op.path}', ${bodies.includes(op) ? `{ schema: { body: ${op.name}BodySchema } }` : '{}'}, controller.${camel(op.name)}.bind(controller));\n`,
      ),
      '  done();\n};\n',
    ]
      .filter(Boolean)
      .join('\n'),
  );
  create(
    join(rest, 'Routes', `${feature}.routes.e2e.spec.ts`),
    `import { describe, it } from '@jest/globals';\n\ndescribe('${feature} in ${context}', () => {\n${todoRoutes.map(op => `  it.todo('${op.route} (${todo})');`).join('\n')}\n});\n`,
  );

  // The mount, in the composition root, beside the other contexts' routes, on the module the root registers.
  let text = read(root);
  const registered = [...text.matchAll(/\.registerModule\(((?:[^()]|\([^()]*\))*)\)/g)].map(m => m[1].trim());
  const expression = registered.find(
    e =>
      !e.includes('(') &&
      e
        .toLowerCase()
        .replace(/[^a-z]/g, '')
        .includes(context.toLowerCase()),
  );
  if (!expression)
    throw new Error(`${context}: the composition root registers no module expression for it to mount routes on`);
  const mounts = [...text.matchAll(/\.registerRoutes\(\s*'([^']*)'/g)].map(m => m[1]);
  const mount = mounts.sort((a, b) => mounts.filter(m => m === b).length - mounts.filter(m => m === a).length)[0];
  const first = text.match(/\n\s*\.registerRoutes\(/);
  text = `${text.slice(0, first.index)}\n.registerRoutes('${mount}', ${routesName}, { ${expression === moduleKey ? moduleKey : `${moduleKey}: ${expression}`} })${text.slice(first.index)}`;
  write(root, withImports(text, [importOf(routesName, routesPath)]));
}

// ---- in order: the contracts first, then the facts, then what decides, what reacts, what asks -----
for (const context of storm.contexts)
  for (const p of context.policies ?? []) for (const name of p.publishes ?? []) integrationEvent(context.id, name);
for (const context of storm.contexts) {
  const of = new Map((context.commands ?? []).flatMap(c => (c.events ?? []).map(e => [e, c.aggregate])));
  const aggregates = readdirSync(join(contextsDir, context.id)).includes('Domain')
    ? readdirSync(join(contextsDir, context.id, 'Domain'))
    : [];
  for (const name of new Set([...(context.events ?? []), ...of.keys()])) {
    const aggregate =
      of.get(name) ??
      aggregates.filter(a => name.startsWith(a)).sort((a, b) => b.length - a.length)[0] ??
      name.match(/^[A-Z][a-z]*/)[0];
    domainEvent(context.id, name, aggregate);
  }
}
const routed = storm.contexts.filter(c => [...(c.commands ?? []), ...(c.queries ?? [])].some(op => op.route));
for (const context of storm.contexts) {
  for (const c of context.commands ?? []) command(context.id, c);
  for (const q of context.queries ?? []) query(context.id, q);
  for (const p of context.policies ?? []) policy(context.id, p);
  const operations = [
    ...(context.commands ?? []).map(c => ({ ...c, kind: 'command' })),
    ...(context.queries ?? []).map(q => ({ ...q, kind: 'query' })),
  ].filter(op => op.route);
  if (operations.length)
    routes(context.id, operations, `${camel(pascal(feature))}${routed.length > 1 ? context.id : ''}Routes`);
}
for (const [context, { imports, entries }] of Object.entries(wiring)) {
  const path = join(contextsDir, context, binding.wiring);
  let text = read(path);
  const fresh = entries.filter(([, entry]) => !text.includes(entry.match(/new (\w+)\(/)[0]));
  if (!fresh.length) continue;
  for (const key of new Set(fresh.map(([key]) => key)))
    text = listInModule(
      text,
      context,
      key,
      fresh
        .filter(([k]) => k === key)
        .map(([, entry]) => entry)
        .join(',\n'),
    );
  write(
    path,
    withImports(
      text,
      [...new Set(imports)].filter(line =>
        fresh.some(([, entry]) =>
          line
            .split(/[{}]/)[1]
            .split(',')
            .some(n => entry.includes(n.trim())),
        ),
      ),
    ),
  );
}

if (touched.size)
  execFileSync(join(project, 'node_modules/.bin/prettier'), ['--write', '--log-level', 'warn', ...touched], {
    cwd: project,
    stdio: 'inherit',
  });
for (const path of [...touched].sort()) console.log(relative(project, path));
