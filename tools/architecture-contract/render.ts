import { ArchitectureContract, Concept, Rule } from './types';

/**
 * The Markdown the README and CLAUDE.md show between their "generated from" markers, rendered
 * from the contract. One source, several views: the tables are never edited by hand.
 */

const cell = (text: string) => text.replace(/\|/g, '\\|');
const row = (cells: string[]) => `| ${cells.map(cell).join(' | ')} |`;
const table = (headers: string[], rows: string[][]) =>
  [row(headers), row(headers.map(() => '---')), ...rows.map(row)].join('\n');

const link = (path: string) => `[\`${path.split('/').pop()}\`](${path})`;
const exampleCell = (concept: Concept) => concept.example ?? concept.canonical.map(link).join(', ');

export const SECTION_MARKER = (id: string) =>
  `<!-- generated from conventions/concepts.yaml (${id}); edit the YAML, then run yarn conventions:write -->`;
export const RULES_MARKER = (view: string) =>
  `<!-- generated from conventions/architecture.yaml (${view}); edit the YAML, then run yarn conventions:write -->`;
export const END_MARKER = '<!-- end generated -->';

export function renderConceptLayer(contract: ArchitectureContract, layer: Concept['layer']): string {
  const concepts = contract.concepts.filter(concept => concept.layer === layer);
  const headers =
    layer === 'presentation' ? ['Concept', 'Canonical example'] : ['Concept', 'Canonical example', 'Notes'];
  return table(
    headers,
    concepts.map(concept =>
      layer === 'presentation'
        ? [concept.name, exampleCell(concept)]
        : [concept.name, exampleCell(concept), concept.description],
    ),
  );
}

export const renderTests = (contract: ArchitectureContract): string =>
  table(
    ['Layer', 'Example', 'Doubles'],
    contract.tests.map(test => [test.layer, test.example, test.doubles]),
  );

export const renderVocabulary = (contract: ArchitectureContract): string =>
  table(
    ['Word', 'Here it means', 'See'],
    contract.vocabulary.map(entry => [entry.word, entry.meaning, entry.see]),
  );

const ENFORCED_BY: Record<Rule['enforcement'], string> = {
  eslint: 'ESLint, generated from `architecture.yaml`',
  check: '`yarn check:conventions`',
  types: 'the type checker',
  tests: 'a spec',
  review: 'review (stated here, not yet mechanical)',
  evaluations: 'fresh-agent evaluations',
};

const referenceLinks = (rule: Rule) =>
  rule.references.map(reference => `[${reference.split('/').pop()}](${reference})`).join(', ');

/** The README's rules table: what the rule is, and what holds it. */
export const renderRulesTable = (contract: ArchitectureContract): string =>
  table(
    ['Rule', 'Enforced by'],
    contract.rules
      .filter(rule => !rule.dependency || rule.id === 'ARCH-RELATIVE')
      .map(rule => [
        `**${rule.id}** — ${rule.statement}`,
        [ENFORCED_BY[rule.enforcement], referenceLinks(rule)].filter(Boolean).join(' · '),
      ]),
  );

/** CLAUDE.md's rules list: statement, why, remediation, in one bullet each. */
export const renderRulesList = (contract: ArchitectureContract): string =>
  contract.rules
    .filter(rule => !rule.dependency || rule.id === 'ARCH-RELATIVE')
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
