import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, posix } from 'path';

import type { ArchitectureContract, CompatibilityRoute } from './types';
import type { Inventory } from './inventory';

/**
 * A migrated application keeps its behaviour and chooses the wire it answers on (ADR 35). The
 * choice is the binding's `migration`: `api: native` (the contract's grammar alone) or
 * `api: compat` (the legacy's routes beside it, served by compatibility routes in the transport).
 * Nothing of a context differs between the two; what the check holds is the façade:
 *
 * - every compatibility route is declared with the one command or query of the inventory it
 *   stands for, is served from a file under the transport, and says when it retires — a date
 *   the check holds, or the condition in words;
 * - under `native`, none is declared;
 * - nothing outside the transport waits for an operation: a command's route answers 202, and a
 *   controller that waited would be a second HTTP grammar inside a context.
 *
 * The data is validated with the contract (any language); the inventory and the tree are asked
 * by the check, for the tree this tooling reads or the inventory the language's tool wrote.
 */

export const MIGRATION_RULE = 'ARCH-COMPAT-ROUTE';

/** The concept whose canonical file is the wait a compatibility route uses. */
export const AWAITED_OPERATION = 'awaited-operation';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today as the binding writes a date: `YYYY-MM-DD`, so that a date compares as a string. */
export const isoToday = (): string => new Date().toISOString().slice(0, 10);

const under = (file: string, tree: string) => file === tree || file.startsWith(`${tree}/`);
const label = (route: CompatibilityRoute) => `${route.method} ${route.path}`;

/** The setting against the contract and the files: what needs neither the inventory nor the tree. */
export function validateMigration(contract: ArchitectureContract, root: string, today: string = isoToday()): string[] {
  const { migration } = contract;
  if (!migration) return [];
  const where = `${contract.sources.binding} migration`;
  const problems: string[] = [];

  const apis = Object.keys(contract.migrationApis);
  if (!apis.includes(migration.api)) {
    problems.push(`${where}: "api" is ${migration.api}; ${contract.sources.architecture} knows ${apis.join(', ')}`);
  }
  if (migration.api === 'native' && migration.routes.length) {
    problems.push(
      `${MIGRATION_RULE}: ${where} says api: native and still declares ${migration.routes.length} compatibility route(s): remove them, or say api: compat while the clients move`,
    );
  }

  const seen = new Set<string>();
  for (const route of migration.routes) {
    const at = `${where} route ${label(route)}`;
    if (!METHODS.includes(route.method)) problems.push(`${at}: "method" must be one of ${METHODS.join(', ')}`);
    if (!route.path.startsWith('/')) problems.push(`${at}: "path" must start with /`);
    if (seen.has(label(route))) problems.push(`${at}: is declared twice`);
    seen.add(label(route));
    if (!route.operation) problems.push(`${at}: "operation" names no command or query`);
    if (!route.file) problems.push(`${at}: "file" is missing`);
    else if (!existsSync(join(root, route.file))) problems.push(`${at}: names ${route.file}, which does not exist`);
    else if (!under(route.file, contract.bootstrap.path)) {
      problems.push(
        `${MIGRATION_RULE}: ${at} is served from ${route.file}, outside the transport (${contract.bootstrap.path}); a compatibility route lives in the transport and nowhere else`,
      );
    }
    if (!route.retires) {
      problems.push(
        `${MIGRATION_RULE}: ${at} does not say when it retires; "retires" is a date (YYYY-MM-DD) or the condition in words`,
      );
    } else if (DATE.test(route.retires) && route.retires < today) {
      problems.push(
        `${MIGRATION_RULE}: ${at} was to retire on ${route.retires}; remove it, or decide again and write the new date`,
      );
    }
  }
  return problems;
}

/** Against the inventory: every compatibility route stands for a command or a query the application has. */
export function checkMigrationAgainstInventory(contract: ArchitectureContract, inventory: Inventory): string[] {
  const { migration } = contract;
  if (!migration) return [];
  const operations = new Set(
    inventory.contexts.flatMap(context => [
      ...context.commands.map(command => command.name),
      ...context.queries.map(query => query.name),
    ]),
  );
  return migration.routes
    .filter(route => route.operation && !operations.has(route.operation))
    .map(
      route =>
        `${MIGRATION_RULE}: ${contract.sources.binding} migration route ${label(route)} is bound to ${route.operation}, which no context's inventory lists as a command or a query`,
    );
}

/** The alias path of a file in a tree: `src/Architecture/Application/AwaitOperation.ts` → `@Architecture/Application/AwaitOperation`. */
function aliased(file: string, tree: { alias: string; path: string }): string | undefined {
  if (!under(file, tree.path)) return undefined;
  return posix.join(tree.alias, file.slice(tree.path.length + 1).replace(/\.ts$/, ''));
}

/**
 * Against the tree this tooling reads: nothing outside the transport imports the wait. The
 * building blocks hold it and their specs show it; a spec elsewhere may use it as a helper; a
 * file of a context or of the shared kernel may not — its route answers 202.
 */
export function waitsOutsideTransport(contract: ArchitectureContract, root: string): string[] {
  const canonical = contract.concepts.find(concept => concept.id === AWAITED_OPERATION)?.canonical[0];
  if (!canonical || !existsSync(join(root, canonical))) return [];
  const source = readFileSync(join(root, canonical), 'utf8');
  const exported = new Set(
    [...source.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/gm)].map(match => match[1]),
  );
  const module = aliased(canonical, contract.architecture);
  const barrel = module && posix.dirname(module);
  if (!module || !exported.size) return [];

  const walk = (dir: string): string[] =>
    existsSync(join(root, dir))
      ? readdirSync(join(root, dir), { withFileTypes: true }).flatMap(entry =>
          entry.isDirectory()
            ? entry.name === 'node_modules'
              ? []
              : walk(`${dir}/${entry.name}`)
            : entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') && !entry.name.endsWith('.d.ts')
              ? [`${dir}/${entry.name}`]
              : [],
        )
      : [];
  const files = walk(posix.join(contract.language.root, 'src')).filter(
    file => !under(file, contract.bootstrap.path) && !under(file, contract.architecture.path),
  );

  const problems: string[] = [];
  for (const file of files) {
    const text = readFileSync(join(root, file), 'utf8');
    const names = new Set<string>();
    for (const match of text.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g)) {
      const [, imported, specifier] = match;
      const bindings = imported
        .split(',')
        .map(
          each =>
            each
              .trim()
              .replace(/^type\s+/, '')
              .split(/\s+as\s+/)[0],
        )
        .filter(Boolean);
      if (specifier === module) bindings.forEach(name => names.add(name));
      else if (specifier === barrel) bindings.filter(name => exported.has(name)).forEach(name => names.add(name));
    }
    if (names.size) {
      problems.push(
        `${MIGRATION_RULE}: ${file} waits for an operation (${[...names].join(', ')}); a command's route answers 202, and only a compatibility route in the transport (${contract.bootstrap.path}) waits`,
      );
    }
  }
  return problems;
}

/** The setting, for the terminal. */
export function describeMigration(contract: ArchitectureContract): string[] {
  const { migration } = contract;
  if (!migration) return [];
  return [
    `Migration: api ${migration.api} — ${contract.migrationApis[migration.api] ?? ''}`,
    ...migration.routes.map(
      route => `  ${label(route)} → ${route.operation} (${route.file}; retires ${route.retires})`,
    ),
  ];
}
