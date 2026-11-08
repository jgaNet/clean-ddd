/**
 * The relationships a change crosses, and the test each one asks for.
 *
 * A relationship between two contexts is crossed by a change when the change touches one of its contracts
 * (ADR 35): the contract's own file (the integration event, the port), a file whose job is the contract
 * (the upstream file that builds the event, the downstream handler that consumes it, the downstream adapter
 * that answers the port), or a mention of it the change wrote or removed in a file of either end. A file
 * that names a contract only where the change left it alone (the wiring file, a handler that already used the
 * port) does not cross it. Each relationship crossed asks for a test changed with it, named for the pair
 * (`Messaging → Moderation`), that makes the thing upstream and finds it downstream, through the API, by
 * the id the upstream answered: the place where identity, wiring and delivery across a boundary are
 * seen at once, and the one place no single context's tests can look (J5, request 64).
 */
import { execFileSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, relative } from 'path';

import { ContextLink, inspectContextLinks } from './domain';
import { ArchitectureContract } from './types';

export interface ChangedFile {
  path: string;
  text: string;
  /** The file at the base: '' when the change adds it; absent when unknown, and then every line counts as changed. */
  before?: string;
}

/** The name a relationship's test carries: `Upstream → Downstream`. */
export const relationshipName = (link: Pick<ContextLink, 'upstream' | 'downstream'>) =>
  `${link.upstream} → ${link.downstream}`;

const contextOf = (path: string, contract: ArchitectureContract): string | undefined => {
  const prefix = `${contract.contextsTree.path.replace(/\/$/, '')}/`;
  if (!path.startsWith(prefix)) return undefined;
  return path.slice(prefix.length).split('/')[0];
};

const contractPattern = (link: ContextLink, name: string) =>
  link.mechanism === 'integration-event' ? `${name}IntegrationEvent` : `I${name}`;
/** The contract's own file: the event's class, the port's interface. */
const defines = (link: ContextLink, text: string) =>
  link.contracts.some(name =>
    new RegExp(
      link.mechanism === 'integration-event' ? `\\bclass ${name}IntegrationEvent\\b` : `\\binterface I${name}\\b`,
    ).test(text),
  );
const builds = (link: ContextLink, text: string) =>
  link.mechanism === 'integration-event' &&
  link.contracts.some(name =>
    new RegExp(`\\b${name}IntegrationEvent\\.set\\(|new ${name}IntegrationEvent\\(`).test(text),
  );
/** The downstream file whose job is the contract: the handler of the event, the adapter of the port. */
const serves = (link: ContextLink, text: string) =>
  link.contracts.some(name =>
    new RegExp(
      link.mechanism === 'integration-event'
        ? `<\\s*${name}IntegrationEvent\\s*>`
        : `\\bimplements\\b[^{]*\\bI${name}\\b`,
    ).test(text),
  );

/**
 * Whether the change wrote or removed a mention of the contract in the file: the name appears a different number of
 * times before and after. A file whose base is unknown counts every mention.
 */
export function touchesName(file: ChangedFile, pattern: string): boolean {
  const count = (text: string) => (text.match(new RegExp(`\\b${pattern}\\b`, 'g')) ?? []).length;
  return file.before === undefined ? count(file.text) > 0 : count(file.text) !== count(file.before);
}

/** The relationships a set of changed files crosses: those whose contracts the change touches (ADR 35). */
export function crossedRelationships(
  links: ContextLink[],
  changed: ChangedFile[],
  contract: ArchitectureContract,
): ContextLink[] {
  const code = changed.filter(file => !/\.(spec|test)\.[a-z]+$/.test(file.path)); // a fake in a test is not the contract
  return links.filter(link =>
    code.some(file => {
      const context = contextOf(file.path, contract);
      const mentioned = () => link.contracts.some(name => touchesName(file, contractPattern(link, name)));
      if (link.mechanism !== 'integration-event') {
        // A port is the downstream side's own: another context's interface of the same name is another thing.
        return context === link.downstream && (defines(link, file.text) || serves(link, file.text) || mentioned());
      }
      if (context === undefined) return defines(link, file.text); // the event, published in the shared kernel
      if (context === link.upstream) return builds(link, file.text) || mentioned();
      if (context === link.downstream) return serves(link, file.text) || mentioned();
      return false;
    }),
  );
}

/** One line for each relationship crossed whose test the change does not carry. */
export function missingRelationshipTests(crossed: ContextLink[], changed: ChangedFile[], suffix: string): string[] {
  const tests = changed.filter(file => file.path.endsWith(suffix));
  return crossed
    .filter(link => !tests.some(file => file.text.includes(relationshipName(link))))
    .map(
      link =>
        `${relationshipName(link)} (${link.contracts.join(', ') || link.mechanism}) is crossed by this change and no test ` +
        `ending in ${suffix} changed with it is named "${relationshipName(link)}". Add one that makes the thing in ` +
        `${link.upstream} through the API and keeps the id that very request answered (its \`{ id }\`, or its operation's ` +
        `result), then reads ${link.downstream} through the API and finds the thing by that same id. When the thing is ` +
        `made about another one, the id is the made thing's, not the other's: a report of a message is found by the ` +
        `report's id, which the event must carry, not by the message's.`,
    );
}

/**
 * The changed files with their text now and at the base. The base is the point the change forked from (`base...HEAD`,
 * as the changed files are listed), or HEAD for `working`; a file the change deletes is left out.
 */
export function readChangedFiles(root: string, changed: string[], base: string): ChangedFile[] {
  const git = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  let from: string | undefined;
  try {
    from = base === 'working' ? git(['rev-parse', 'HEAD']).trim() : git(['merge-base', base, 'HEAD']).trim();
  } catch {
    from = undefined; // no history to read: every line of a changed file counts
  }
  const atBase = (path: string) => {
    if (!from) return undefined;
    try {
      return git(['show', `${from}:${path}`]);
    } catch {
      return ''; // a file the change adds
    }
  };
  return changed.flatMap(path => {
    const file = join(root, path);
    if (!existsSync(file)) return [];
    return [{ path, text: readFileSync(file, 'utf8'), before: atBase(path) }];
  });
}

/** The gate's step: the relationships the change crosses, each with its test (empty: nothing is owed). */
export function checkRelationshipTests(
  contract: ArchitectureContract,
  root: string,
  changed: string[],
  base = 'working',
): string[] {
  if (!contract.relationshipTests) return [];
  const files = readChangedFiles(root, changed, base);
  const crossed = crossedRelationships(inspectContextLinks(contract, root), files, contract);
  return missingRelationshipTests(crossed, files, contract.relationshipTests.suffix);
}

/** The changed tests named for a relationship the change crosses: the ones the executed half runs at the base. */
export function crossedRelationshipTests(
  contract: ArchitectureContract,
  root: string,
  changed: string[],
  base = 'working',
): string[] {
  if (!contract.relationshipTests) return [];
  const suffix = contract.relationshipTests.suffix;
  const files = readChangedFiles(root, changed, base);
  const names = crossedRelationships(inspectContextLinks(contract, root), files, contract).map(relationshipName);
  return files
    .filter(file => file.path.endsWith(suffix) && names.some(name => file.text.includes(name)))
    .map(file => file.path);
}

/** The titles of the test cases a file declares: `it('…')`, `test('…')`. */
export function testTitles(text: string): string[] {
  return [...text.matchAll(/\b(?:it|test)\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g)].map(match => match[2]);
}

/** How a command runs in a directory; the gate passes its own, a spec a fake. */
export type RunCommand = (command: string, cwd: string) => { code: number; output: string };

/**
 * The executed half of the step (ADR 34): a relationship test that adds a case must see the change. Each changed
 * relationship test whose file declares a case the base did not is run at the base, in a worktree of its own, with
 * the new file and the base's code; if it passes there, its new cases do not see what the change does across the
 * pair, and the line says so. A test that only changes cases the base already had (a rename, a refactor) is not run.
 */
export function relationshipTestsThatMissTheChange({
  root,
  base,
  tests,
  run,
  languageRoot,
  exec,
}: {
  root: string;
  base: string;
  tests: string[];
  run: string;
  languageRoot: string;
  exec: RunCommand;
}): string[] {
  if (base === 'working') return [];
  const git = (args: string[], cwd = root) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  const atBase = (path: string) => {
    try {
      return git(['show', `${base}:${path}`]);
    } catch {
      return ''; // a file the change adds
    }
  };
  const adding = tests
    .map(path => {
      const before = new Set(testTitles(atBase(path)));
      const added = testTitles(readFileSync(join(root, path), 'utf8')).filter(title => !before.has(title));
      return { path, added };
    })
    .filter(test => test.added.length > 0);
  if (!adding.length) return [];

  const worktree = mkdtempSync(join(tmpdir(), 'clean-ddd-relationship-'));
  rmSync(worktree, { recursive: true, force: true });
  git(['worktree', 'add', '--detach', worktree, base]);
  try {
    const languageDir = join(worktree, languageRoot);
    const modules = join(root, languageRoot, 'node_modules');
    if (existsSync(modules) && !existsSync(join(languageDir, 'node_modules')))
      symlinkSync(modules, join(languageDir, 'node_modules'), 'dir');
    for (const test of adding) {
      mkdirSync(dirname(join(worktree, test.path)), { recursive: true });
      cpSync(join(root, test.path), join(worktree, test.path));
    }
    const files = adding.map(test => relative(join(root, languageRoot), join(root, test.path))).join(' ');
    const result = exec(run.replace('{files}', files), languageDir);
    if (result.code !== 0) return [];
    return adding.map(
      test =>
        `${test.path}: its new case${test.added.length > 1 ? 's' : ''} (${test.added.map(t => `"${t}"`).join(', ')}) ` +
        `pass${test.added.length > 1 ? '' : 'es'} without the change, at ${base}: the test does not see what the change ` +
        `does across the pair. Assert what the change brings: the thing made upstream through the API, found downstream ` +
        `by the id that very request answered.`,
    );
  } finally {
    try {
      git(['worktree', 'remove', '--force', worktree]);
    } catch {
      rmSync(worktree, { recursive: true, force: true });
    }
  }
}
