import { posix } from 'path';

import { ArchitectureContract, Concept, Rule } from './types';
import { isLocalLink } from './load';

/**
 * The Markdown the README and CLAUDE.md show between their "generated from" markers, rendered
 * from the contract. One source, several views: the tables are never edited by hand.
 *
 * A contract speaks repository-relative paths; a document lives somewhere in the repository.
 * Every renderer takes `at`, the directory of the document it renders into (relative to the
 * repository root, '.' for the root), and writes its links relative to it, so the same cell is
 * right in the root README and in a language's.
 */

const cell = (text: string) => text.replace(/\|/g, '\\|');
const row = (cells: string[]) => `| ${cells.map(cell).join(' | ')} |`;
const table = (headers: string[], rows: string[][]) =>
  [row(headers), row(headers.map(() => '---')), ...rows.map(row)].join('\n');

/** A repository-relative path, as a document at `at` links to it. */
export const relativeTo = (at: string, path: string): string => posix.relative(at, path) || '.';

/** The same Markdown with every local link rewritten for a document at `at`. */
export const relink = (text: string, at: string): string =>
  text.replace(/\]\(([^)\s]+)\)/g, (whole, target: string) =>
    isLocalLink(target) ? `](${relativeTo(at, target)})` : whole,
  );

const link = (path: string, at: string) => `[\`${path.split('/').pop()}\`](${relativeTo(at, path)})`;
const exampleCell = (concept: Concept, at: string) =>
  concept.example ? relink(concept.example, at) : concept.canonical.map(path => link(path, at)).join(', ');
const notesCell = (concept: Concept, at: string) =>
  [concept.description, concept.notes]
    .filter(Boolean)
    .map(text => relink(text as string, at))
    .join('; ');

export const SECTION_MARKER = (id: string) =>
  `<!-- generated from conventions/concepts.yaml (${id}); edit the YAML, then run yarn conventions:write -->`;
export const RULES_MARKER = (view: string) =>
  `<!-- generated from conventions/architecture.yaml (${view}); edit the YAML, then run yarn conventions:write -->`;
export const END_MARKER = '<!-- end generated -->';

/** A concept this language shows: the binding names at least one file for it. */
export const shown = (concept: Concept): boolean => concept.canonical.length > 0;

/** One language's map of a layer: concept, canonical example, notes. */
export function renderConceptLayer(contract: ArchitectureContract, layer: Concept['layer'], at = '.'): string {
  const concepts = contract.concepts.filter(concept => concept.layer === layer && shown(concept));
  const headers =
    layer === 'presentation' ? ['Concept', 'Canonical example'] : ['Concept', 'Canonical example', 'Notes'];
  return table(
    headers,
    concepts.map(concept =>
      layer === 'presentation'
        ? [concept.name, exampleCell(concept, at)]
        : [concept.name, exampleCell(concept, at), notesCell(concept, at)],
    ),
  );
}

/**
 * The map across languages: one row per concept of a layer, one column per language, the
 * canonical file in each — or a dash where a language does not show the concept yet. The
 * contracts are the same contract loaded for each language; the first one's concepts are the
 * rows, since the concepts are the contract's and not a language's.
 */
export function renderConceptMatrix(contracts: ArchitectureContract[], layer: Concept['layer'], at = '.'): string {
  const [first] = contracts;
  const concepts = first.concepts.filter(concept => concept.layer === layer);
  return table(
    ['Concept', ...contracts.map(contract => contract.language.name), 'Notes'],
    concepts.map(concept => [
      concept.name,
      ...contracts.map(contract => {
        const own = contract.concepts.find(candidate => candidate.id === concept.id);
        return own && shown(own) ? own.canonical.map(path => link(path, at)).join(', ') : '—';
      }),
      relink(concept.description, at),
    ]),
  );
}

export const renderTests = (contract: ArchitectureContract, at = '.'): string =>
  table(
    ['Layer', 'Example', 'Doubles'],
    contract.tests.map(test => [test.layer, relink(test.example, at), relink(test.doubles, at)]),
  );

export const renderVocabulary = (contract: ArchitectureContract, at = '.'): string =>
  table(
    ['Word', 'Here it means', 'See'],
    contract.vocabulary.map(entry => [entry.word, entry.meaning, relink(entry.see, at)]),
  );

const referenceLinks = (paths: string[], at: string) =>
  paths.map(path => `[${path.split('/').pop()}](${relativeTo(at, path)})`).join(', ');

const listed = (rule: Rule) => !rule.dependency || rule.id === 'ARCH-RELATIVE';

/**
 * The rules table. The language view says what holds each rule here and which file shows it;
 * the contract view (`languages: false`) says only how the rule is held, in the contract's
 * words, and what explains it — that is the root README's, the same for every language.
 */
export const renderRulesTable = (contract: ArchitectureContract, at = '.', language = true): string =>
  table(
    ['Rule', 'Enforced by'],
    contract.rules
      .filter(listed)
      .map(rule => [
        `**${rule.id}** — ${rule.statement}`,
        [
          language ? contract.enforcers[rule.enforcement] : rule.enforcement,
          referenceLinks(language ? [...rule.references, ...rule.examples] : rule.references, at),
        ]
          .filter(Boolean)
          .join(' · '),
      ]),
  );

/** CLAUDE.md's rules list: statement, why, remediation, in one bullet each. */
export const renderRulesList = (contract: ArchitectureContract): string =>
  contract.rules
    .filter(listed)
    .map(rule => `- **${rule.statement}** ${rule.why} *Fix:* ${rule.remediation} *(${rule.id}; ${rule.enforcement})*`)
    .join('\n');

/** The dependency table, for the README: one line per layer, what it may import. */
export const renderDependencyTable = (contract: ArchitectureContract): string =>
  table(
    ['A file in…', 'may import', 'Rule'],
    contract.rules
      .filter(rule => rule.dependency && rule.id !== 'ARCH-RELATIVE')
      .map(rule => [rule.dependency!.layer, rule.dependency!.mayImport.map(unit => `\`${unit}\``).join(', '), rule.id]),
  );

/** The languages table, for the root README: each language, its directory, its guide. */
export const renderLanguages = (contracts: ArchitectureContract[], at = '.'): string =>
  table(
    ['Language', 'Where', 'Contexts', 'Concepts shown', 'Read'],
    contracts.map(contract => [
      contract.language.name,
      `[\`${contract.language.root}/\`](${relativeTo(at, contract.language.root)})`,
      contract.contexts.join(', ') || '—',
      `${contract.concepts.filter(shown).length} / ${contract.concepts.length}`,
      `[README](${relativeTo(at, posix.join(contract.language.root, 'README.md'))}), [CLAUDE.md](${relativeTo(at, posix.join(contract.language.root, 'CLAUDE.md'))})`,
    ]),
  );
