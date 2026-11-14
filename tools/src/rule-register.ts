import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, posix } from 'path';
import { load } from 'js-yaml';

import { readContextFiles } from './domain';
import type { SourceFile } from './domain';
import { ArchitectureContract, ContractError, NamedRule, RULE_REGISTER_FILE, RuleOrigin, RuleRegister } from './types';

/**
 * The rule register: conventions/rules.yaml (ADR 46). Every refusal a context's domain can return, declared
 * once by its public name — the operation's `error.type` without the suffix of its kind (`NoteNotFound`) — with
 * the context that decides it, the rule in the business's words and where it was decided. Like the domain map
 * and the published language, it names no file of any language.
 *
 * Its evidence is read from the code, never declared (`inspectRuleEvidence`): the exceptions a context's Domain
 * or Application declares and its code instantiates, and the specs of that context. The check holds the three
 * together (`checkRuleRegister`): a refusal no rule names, a rule no code returns, a rule no test names, each
 * under DOMAIN-RULE-NAMED. A class that is only extended (a context's base exception) is not a refusal.
 *
 * The TypeScript tree holds it (ADR 46); the other languages after J6. A tree with no file holds nothing here.
 */

export const RULE_NAMED = 'DOMAIN-RULE-NAMED';

type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A text that is not yet known to be a rule register: a mapping with `rules`, a mapping of public names too. */
export function parseRuleRegister(text: string, source: string = RULE_REGISTER_FILE): RuleRegister {
  const raw = load(text);
  if (!isObject(raw)) throw new ContractError(`${source} is not a YAML mapping`, 'malformed');
  // `rules: {}` is the register of an application that refuses nothing yet; `rules:` alone says the same.
  const rules = raw.rules ?? {};
  if (!isObject(rules))
    throw new ContractError(`${source}: "rules" must be a mapping of public names to rules`, 'malformed');
  return {
    source,
    rules: Object.entries(rules).map(([name, entry]): NamedRule => {
      const rule = isObject(entry) ? entry : {};
      const origin = originOf(rule.origin);
      return {
        name,
        context: typeof rule.context === 'string' ? rule.context : '',
        statement: typeof rule.statement === 'string' ? rule.statement.trim() : '',
        ...(origin && { origin }),
      };
    }),
  };
}

/** `{ adr: 1 }`, `{ storm: share-a-note }`, `{ request: R12 }`: exactly one of the three, or nothing. */
function originOf(raw: unknown): RuleOrigin | undefined {
  if (!isObject(raw)) return undefined;
  const keys = Object.keys(raw);
  if (keys.length !== 1) return undefined;
  const [key] = keys;
  if (key === 'adr') return { adr: typeof raw.adr === 'number' ? raw.adr : Number.NaN };
  if (key === 'storm') return { storm: String(raw.storm ?? '') };
  if (key === 'request') return { request: String(raw.request ?? '') };
  return undefined;
}

/** The rule register, or undefined when the repository has none; throws a ContractError when the file is not one. */
export function loadRuleRegister(root: string): RuleRegister | undefined {
  const path = join(root, RULE_REGISTER_FILE);
  if (!existsSync(path)) return undefined;
  return parseRuleRegister(readFileSync(path, 'utf8'));
}

const PUBLIC_NAME = /^[A-Z][A-Za-z0-9]*$/;

/** The public name of a refusal: its exception's class name without the suffix of its kind. */
export const publicNameOf = (exception: string): string => exception.replace(/Exception$/, '');

/** Where an origin says the rule was decided, in words: `ADR 19`, `the storm share-a-note`, `request R12`. */
export const describeOrigin = (origin: RuleOrigin): string =>
  'adr' in origin ? `ADR ${origin.adr}` : 'storm' in origin ? `the storm ${origin.storm}` : `request ${origin.request}`;

/**
 * Everything the file can get wrong on its own and against the repository: a public name with the suffix of its
 * kind; a context that is not one of the domain map (or, with no map, of the binding); no statement; an origin that
 * is not one of the three, or names a decision under docs/adr or a storm under conventions/storms that does not exist.
 */
export function validateRuleRegister(register: RuleRegister, contexts: string[], root: string): string[] {
  const problems: string[] = [];
  const decisions = existsSync(join(root, 'docs/adr')) ? readdirSync(join(root, 'docs/adr')) : [];
  for (const rule of register.rules) {
    const where = `${RULE_NAMED}: ${register.source} rule ${rule.name}`;
    if (!PUBLIC_NAME.test(rule.name) || /Exception$/.test(rule.name))
      problems.push(
        `${where}: the name is not a public name (PascalCase, without the suffix of its kind: NoteNotFound, not NoteNotFoundException)`,
      );
    if (!rule.context) problems.push(`${where}: "context" is missing`);
    else if (!contexts.includes(rule.context))
      problems.push(
        `${where}: context ${rule.context} is not a context of the domain map (${contexts.join(', ') || 'none'})`,
      );
    if (!rule.statement)
      problems.push(`${where}: "statement" is missing; the rule in the business's words, one sentence`);
    const origin = rule.origin;
    if (!origin) {
      problems.push(
        `${where}: "origin" is missing, or is not one of { adr: <n> }, { storm: <feature> }, { request: <id> }`,
      );
    } else if ('adr' in origin) {
      const prefix = `${String(origin.adr).padStart(4, '0')}-`;
      if (!Number.isInteger(origin.adr) || origin.adr < 1)
        problems.push(`${where}: origin's adr is not the number of a decision`);
      else if (!decisions.some(file => file.startsWith(prefix) && file.endsWith('.md')))
        problems.push(`${where}: origin is ADR ${origin.adr}, and docs/adr has no ${prefix}….md`);
    } else if ('storm' in origin) {
      if (!existsSync(join(root, 'conventions/storms', `${origin.storm}.yaml`)))
        problems.push(
          `${where}: origin is the storm ${origin.storm || '(none)'}, and conventions/storms has no ${origin.storm || '(none)'}.yaml`,
        );
    } else if (!origin.request.trim()) {
      problems.push(`${where}: origin's request names no request`);
    }
  }
  return problems;
}

/** A refusal the code can return: an exception a context's Domain or Application declares and its code instantiates. */
export interface Refusal {
  /** Its public name: the class without `Exception`. */
  name: string;
  exception: string;
  context: string;
  /** The file that declares it, repository-relative. */
  file: string;
}

/** What the code says about the rules of each context: the refusals it can return, and its tests. */
export interface RuleEvidence {
  refusals: Refusal[];
  /** Every spec (`*.spec.ts`, end-to-end ones included) under each context's directory, by context. */
  tests: Map<string, SourceFile[]>;
  /** The contexts tree, repository-relative, for the findings. */
  contextsTree: string;
}

const DECLARATION = /\bclass\s+(\w+)(?:\s*<[^>{]*>)?\s+extends\s+(\w+)/g;
const isSpec = (name: string) => /\.spec\.ts$/.test(name);

/** Every `.ts` file under a directory, repository-relative, with its text; `specs` chooses the specs or the rest. */
function filesUnder(root: string, dir: string, specs: boolean): SourceFile[] {
  const at = join(root, dir);
  if (!existsSync(at)) return [];
  return readdirSync(at, { withFileTypes: true }).flatMap(entry => {
    const path = posix.join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(root, path, specs);
    if (!entry.name.endsWith('.ts') || /\.spec-helper\.ts$/.test(entry.name) || isSpec(entry.name) !== specs) return [];
    return [{ path, text: readFileSync(join(root, path), 'utf8') }];
  });
}

/**
 * The refusals of each context and its tests, read from the TypeScript tree the binding describes. An exception is
 * a class that extends the building blocks' `Exception`, directly or through another exception (one of the building
 * blocks', of the shared kernel's, or of the context's own); a refusal is one the context's Domain or Application
 * declares and its code instantiates (`new X(`), so a base that is only extended is none.
 */
export function inspectRuleEvidence(contract: ArchitectureContract, root: string): RuleEvidence {
  const contextFiles = readContextFiles(contract, root);
  const declarations: { name: string; parent: string; context?: string; file: string }[] = [];
  for (const tree of [contract.architecture.path, contract.kernel.path]) {
    for (const file of filesUnder(root, tree, false))
      for (const [, name, parent] of file.text.matchAll(DECLARATION))
        declarations.push({ name, parent, file: file.path });
  }
  const layerOf = (context: string, path: string) =>
    path.slice(`${contract.contextsTree.path}/${context}/`.length).split('/')[0].toLowerCase();
  for (const [context, files] of contextFiles) {
    for (const file of files.filter(each => ['domain', 'application'].includes(layerOf(context, each.path))))
      for (const [, name, parent] of file.text.matchAll(DECLARATION))
        declarations.push({ name, parent, context, file: file.path });
  }
  // The exceptions, to a fixpoint: a class whose parent is one.
  const exceptions = new Set(['Exception']);
  for (let grew = true; grew;) {
    grew = false;
    for (const declaration of declarations)
      if (exceptions.has(declaration.parent) && !exceptions.has(declaration.name)) {
        exceptions.add(declaration.name);
        grew = true;
      }
  }
  const refusals: Refusal[] = [];
  for (const declaration of declarations) {
    const { name, context, file } = declaration;
    if (!context || !exceptions.has(name)) continue;
    const built = new RegExp(`\\bnew\\s+${name}\\s*\\(`);
    if (!(contextFiles.get(context) ?? []).some(each => built.test(each.text))) continue;
    refusals.push({ name: publicNameOf(name), exception: name, context, file });
  }
  const tests = new Map(
    contract.contexts.map(context => [
      context,
      filesUnder(root, posix.join(contract.contextsTree.path, context), true),
    ]),
  );
  return { refusals, tests, contextsTree: contract.contextsTree.path };
}

/**
 * Where the code and the register disagree, one line each, under DOMAIN-RULE-NAMED: a refusal a context returns
 * that no rule of that context names; a rule whose context returns no exception of its name; a rule no test of
 * its context names, by its public name or its exception's.
 */
export function checkRuleRegister(register: RuleRegister, evidence: RuleEvidence): string[] {
  const problems: string[] = [];
  const named = (name: string, context: string) =>
    register.rules.find(rule => rule.name === name && rule.context === context);
  for (const refusal of evidence.refusals) {
    if (named(refusal.name, refusal.context)) continue;
    const elsewhere = register.rules.find(rule => rule.name === refusal.name);
    problems.push(
      `${RULE_NAMED}: ${refusal.context} returns ${refusal.name} (${refusal.exception}, ${refusal.file}), which no rule of ${register.source} names${elsewhere ? ` under ${refusal.context} (it names one under ${elsewhere.context || 'no context'})` : ''}; name it there — its context, its statement, its origin — before the code returns it`,
    );
  }
  for (const rule of register.rules) {
    const where = `${RULE_NAMED}: ${register.source} rule ${rule.name} (${rule.context || 'no context'})`;
    if (!evidence.refusals.some(refusal => refusal.name === rule.name && refusal.context === rule.context))
      problems.push(
        `${where}: no exception of ${rule.context || 'its context'} returns it — no ${rule.name}Exception under its Domain or Application that its code instantiates; remove the rule with the last code that returned it`,
      );
    const mentions = new RegExp(`\\b${rule.name}(?:Exception)?\\b`);
    if (!(evidence.tests.get(rule.context) ?? []).some(test => mentions.test(test.text)))
      problems.push(
        `${where}: no test of ${rule.context || 'its context'} names it — ${rule.name} or ${rule.name}Exception in a *.spec.ts under ${posix.join(evidence.contextsTree, rule.context || '<Context>')}`,
      );
  }
  return problems;
}
