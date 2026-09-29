import { join } from 'path';
import { ESLint } from 'eslint';

import { ArchitectureContract, Concept, Rule } from './types';
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
  const eslint = new ESLint({ cwd: root });
  const [result] = await eslint.lintText(`import { probe } from '${specifier}';\nexport const p = probe;\n`, {
    filePath: join(root, file),
  });
  const refusal = result.messages.find(message => message.ruleId === 'no-restricted-imports');
  if (!refusal) return { file, specifier, allowed: true };
  const rule = refusal.message.match(/\b([A-Z]+-[A-Z0-9-]+):/)?.[1];
  return { file, specifier, allowed: false, rule, message: refusal.message };
}
