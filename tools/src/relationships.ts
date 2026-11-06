/**
 * The relationships a change crosses, and the test each one asks for.
 *
 * A relationship between two contexts is crossed by a change when the change touches either end of
 * it: a file of the downstream context that names one of its contracts (the integration event it
 * consumes, the port it adapts), or a file of the upstream context that builds one of its integration
 * events. Each relationship crossed asks for a test changed with it, named for the pair
 * (`Messaging → Moderation`), that makes the thing upstream and finds it downstream, through the API, by
 * the id the upstream answered: the place where identity, wiring and delivery across a boundary are
 * seen at once, and the one place no single context's tests can look (J5, request 64).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { ContextLink, inspectContextLinks } from './domain';
import { ArchitectureContract } from './types';

export interface ChangedFile {
  path: string;
  text: string;
}

/** The name a relationship's test carries: `Upstream → Downstream`. */
export const relationshipName = (link: Pick<ContextLink, 'upstream' | 'downstream'>) =>
  `${link.upstream} → ${link.downstream}`;

const contextOf = (path: string, contract: ArchitectureContract): string | undefined => {
  const prefix = `${contract.contextsTree.path.replace(/\/$/, '')}/`;
  if (!path.startsWith(prefix)) return undefined;
  return path.slice(prefix.length).split('/')[0];
};

const names = (link: ContextLink, text: string) =>
  link.contracts.some(name =>
    link.mechanism === 'integration-event'
      ? new RegExp(`\\b${name}IntegrationEvent\\b`).test(text)
      : new RegExp(`\\bI${name}\\b`).test(text),
  );
const builds = (link: ContextLink, text: string) =>
  link.mechanism === 'integration-event' &&
  link.contracts.some(name =>
    new RegExp(`\\b${name}IntegrationEvent\\.set\\(|new ${name}IntegrationEvent\\(`).test(text),
  );

/** The relationships a set of changed files crosses. */
export function crossedRelationships(
  links: ContextLink[],
  changed: ChangedFile[],
  contract: ArchitectureContract,
): ContextLink[] {
  return links.filter(link =>
    changed.some(file => {
      const context = contextOf(file.path, contract);
      if (context === link.downstream && names(link, file.text)) return true;
      return context === link.upstream && builds(link, file.text);
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
        `ending in ${suffix} changed with it is named "${relationshipName(link)}": add one that makes the thing in ` +
        `${link.upstream} through the API and finds it in ${link.downstream} through the API, by the id ${link.upstream} answered.`,
    );
}

/** The gate's step: the relationships the change crosses, each with its test (empty: nothing is owed). */
export function checkRelationshipTests(contract: ArchitectureContract, root: string, changed: string[]): string[] {
  if (!contract.relationshipTests) return [];
  const read = (path: string): ChangedFile | undefined => {
    try {
      return { path, text: readFileSync(join(root, path), 'utf8') };
    } catch {
      return undefined; // deleted by the change
    }
  };
  const files = changed.map(read).filter((file): file is ChangedFile => file !== undefined);
  const crossed = crossedRelationships(inspectContextLinks(contract, root), files, contract);
  return missingRelationshipTests(crossed, files, contract.relationshipTests.suffix);
}
