import { join } from 'path';
import { ESLint } from 'eslint';

import { ArchitectureContract, Checklist, Concept, Rule, Verb } from './types';
import { repositoryRoot } from './load';

/** The questions a person, a check or an agent asks the contract. Pure functions over the loaded data. */

export const listRules = (contract: ArchitectureContract): Rule[] => contract.rules;
export const getRule = (contract: ArchitectureContract, id: string): Rule | undefined =>
  contract.rules.find(rule => rule.id === id.toUpperCase());

export const listConcepts = (contract: ArchitectureContract): Concept[] => contract.concepts;
export const getConcept = (contract: ArchitectureContract, id: string): Concept | undefined =>
  contract.concepts.find(concept => concept.id === id.toLowerCase());

/** The rules that govern a concept, resolved. */
export const rulesOf = (contract: ArchitectureContract, concept: Concept): Rule[] =>
  concept.rules.map(id => getRule(contract, id)).filter((rule): rule is Rule => rule !== undefined);

export const listVerbs = (contract: ArchitectureContract): Verb[] => contract.verbs;
/** The verbs for an intent (`remove`), or every verb whose intent or method matches the word (`DELETE`). */
export const getVerbs = (contract: ArchitectureContract, intent: string): Verb[] => {
  const wanted = intent.toLowerCase();
  const exact = contract.verbs.filter(verb => verb.intent === wanted);
  return exact.length ? exact : contract.verbs.filter(verb => verb.verb.toLowerCase() === wanted);
};

export const listChecklists = (contract: ArchitectureContract): Checklist[] => contract.checklists;
export const getChecklist = (contract: ArchitectureContract, kind: string): Checklist | undefined =>
  contract.checklists.find(checklist => checklist.kind === kind.toLowerCase());

export interface ImportVerdict {
  file: string;
  specifier: string;
  allowed: boolean;
  /** The id of the rule that refused it, when refused. */
  rule?: string;
  message?: string;
}

/**
 * Would a file at `file` be allowed to import `specifier`? Asked of the same ESLint configuration
 * the build runs, on a one-line synthetic module, so the answer is the enforcement's, not a
 * re-implementation of it. The refusing message starts with the rule id, which is how the id is
 * read back.
 */
export async function canImport(
  file: string,
  specifier: string,
  root: string = repositoryRoot(),
): Promise<ImportVerdict> {
  const [verdict] = await canImportAll([[file, specifier]], root);
  return verdict;
}

/**
 * The same question for several pairs, on one ESLint instance: a caller checking a planned
 * layout asks once instead of spawning a process per import.
 */
export async function canImportAll(
  probes: [file: string, specifier: string][],
  root: string = repositoryRoot(),
): Promise<ImportVerdict[]> {
  const eslint = new ESLint({ cwd: root });
  return Promise.all(
    probes.map(async ([file, specifier]) => {
      const [result] = await eslint.lintText(`import { probe } from '${specifier}';\nexport const p = probe;\n`, {
        filePath: join(root, file),
      });
      const refusal = result.messages.find(message => message.ruleId === 'no-restricted-imports');
      if (!refusal) return { file, specifier, allowed: true };
      const rule = refusal.message.match(/\b([A-Z]+-[A-Z0-9-]+):/)?.[1];
      return { file, specifier, allowed: false, rule, message: refusal.message };
    }),
  );
}
