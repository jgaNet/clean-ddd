import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * K4, task 5 (a refactoring that changes the structure and not the behaviour): Messaging and Notifications take
 * every time they decide or record from OpenStay's one clock, the one the application is wired with (request 57,
 * the tree's "OpenStay's now"); nothing in them falls back to the machine's time. What a client sees is held by
 * the regression grading (the kit's requests 51 to 56, 75 and 76, and the tree's own tests), not here: this test
 * holds the structure only.
 *
 * It reads the source of the two contexts, as the tree has it (the grader runs it from the tree's root), leaves
 * the tests and the comments out, and refuses any read of the machine's time: `new Date()` with no argument, or
 * `Date.now()`.
 */
const CONTEXTS = ['Messaging', 'Notifications'];
const MACHINE_TIME = /new\s+Date\s*\(\s*\)|Date\s*\.\s*now\s*\(\s*\)/g;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith('.ts') && !/\.(spec|test)\.ts$/.test(name) ? [path] : [];
  });
}

/** The code of a TypeScript file without its comments (a string that holds `//` is rare enough here to be left as code). */
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

describe('one clock in Messaging and Notifications', () => {
  it('reads the machine time nowhere in the two contexts: every time comes from the clock they are given', () => {
    const root = join(process.cwd(), 'src', 'Contexts');
    const reads = CONTEXTS.flatMap(context =>
      sources(join(root, context)).flatMap(file =>
        withoutComments(readFileSync(file, 'utf8'))
          .split('\n')
          .flatMap((line, index) =>
            line.match(MACHINE_TIME) ? [`${relative(process.cwd(), file)}:${index + 1}: ${line.trim()}`] : [],
          ),
      ),
    );
    expect(reads).toEqual([]);
  });
});
