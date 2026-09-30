import { execFileSync } from 'child_process';

import { ArchitectureContract, Mode, ModeName } from './types';
import { repositoryRoot } from './load';

/**
 * The two modes a change can be made in. They are checked against a *diff*, not against the
 * tree: the question is not "is the architecture sound" (that is `check:conventions`) but
 * "did this change touch it, and was it entitled to".
 *
 * Neither is a CI gate. The maintainer changes the architecture on purpose; these are for
 * whoever has agreed to work under a constraint — an agent told to add a feature and nothing
 * else, an evaluation whose rules of engagement say the docs are off limits, a reviewer
 * asking what kind of change they are reading.
 */

export interface ModeVerdict {
  mode: ModeName;
  base: string;
  changed: string[];
  /** The changed files the mode forbids, or the ones that needed a decision and did not get one. */
  offending: string[];
  ok: boolean;
  problems: string[];
}

const under = (file: string, trees: string[]) => trees.some(tree => file === tree || file.startsWith(`${tree}/`));

/** What this change touches: the files that differ from `base`, or everything uncommitted with `working`. */
export function changedFiles(base: string, root: string = repositoryRoot()): string[] {
  const git = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  if (base === 'working') {
    return git(['status', '--porcelain'])
      .split('\n')
      .filter(Boolean)
      .map(line => line.slice(3).trim())
      .map(path => path.split(' -> ').pop() as string);
  }
  const merged = git(['diff', '--name-only', `${base}...HEAD`]);
  return merged.split('\n').filter(Boolean);
}

export function checkMode(
  mode: ModeName,
  changed: string[],
  contract: ArchitectureContract,
  base: string,
): ModeVerdict {
  const rules: Mode = contract.modes[mode];
  const problems: string[] = [];
  let offending: string[] = [];

  if (mode === 'feature') {
    offending = changed.filter(file => under(file, rules.protected ?? []) && !under(file, rules.allowed ?? []));
    for (const file of offending) {
      problems.push(
        `${file} is part of the architecture, which a feature does not change. If the feature really needs it, that is the finding: make it an architecture change and write the decision down.`,
      );
    }
  } else {
    const decisive = changed.filter(file => under(file, rules.decides ?? []));
    const decisions = changed.filter(file => under(file, [rules.records ?? 'docs/adr']) && file.endsWith('.md'));
    if (decisive.length && !decisions.length) {
      offending = decisive;
      problems.push(
        `this change touches ${decisive.join(', ')} and records no decision: add an ADR under ${rules.records}, and link it from its index and from where the rule is stated.`,
      );
    }
  }

  return { mode, base, changed, offending, ok: problems.length === 0, problems };
}
