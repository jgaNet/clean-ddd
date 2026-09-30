#!/usr/bin/env tsx
/**
 * `yarn architecture <command>`: the contract, asked from a terminal or by a tool.
 *
 *   yarn architecture inspect                 what the contract holds
 *   yarn architecture rule <ID>               one rule: statement, why, remediation, references
 *   yarn architecture concept <id>            one concept: canonical files, rules, decisions
 *   yarn architecture can-import <file> <specifier>   would ESLint allow it, and which rule says
 *   yarn architecture rules | concepts        the lists
 *
 * Every command takes --json: valid JSON only on stdout, nothing decorative, exit 1 on an
 * unknown id with a structured error. That output is the stable interface for coding agents.
 */

import { ContractError } from './types';
import { loadArchitectureContract } from './load';
import { canImport, getConcept, getRule, rulesOf } from './query';

const args = process.argv.slice(2);
const json = args.includes('--json');
const [command, ...rest] = args.filter(arg => arg !== '--json');

const out = (value: unknown, text: () => string) => {
  process.stdout.write(json ? `${JSON.stringify(value, null, 2)}\n` : `${text()}\n`);
};
const fail = (code: string, message: string): never => {
  if (json) process.stdout.write(`${JSON.stringify({ error: { code, message } }, null, 2)}\n`);
  else process.stderr.write(`${message}\n`);
  process.exit(1);
};

const list = (title: string, items: string[]) => (items.length ? `${title}:\n  ${items.join('\n  ')}` : '');

async function main(): Promise<void> {
  let contract;
  try {
    contract = loadArchitectureContract();
  } catch (error) {
    if (error instanceof ContractError) return fail(error.code, error.message);
    throw error;
  }
  const schemaVersion = contract.schemaVersion;

  switch (command) {
    case 'inspect': {
      return out(
        {
          schemaVersion,
          contexts: contract.contexts,
          trees: { architecture: contract.architecture, kernel: contract.kernel },
          layers: contract.layers,
          rules: contract.rules.length,
          concepts: contract.concepts.length,
          sources: contract.sources,
        },
        () =>
          [
            'Architecture contract',
            '',
            list('Contexts', contract.contexts),
            list('Trees', [
              `${contract.architecture.alias} → ${contract.architecture.path}`,
              `${contract.kernel.alias} → ${contract.kernel.path}`,
            ]),
            list('Layers', contract.layers),
            '',
            `Rules: ${contract.rules.length} (yarn architecture rules)`,
            `Concepts: ${contract.concepts.length} (yarn architecture concepts)`,
            '',
            list('Sources', [contract.sources.architecture, contract.sources.concepts]),
          ].join('\n'),
      );
    }
    case 'rules':
      return out(
        { schemaVersion, rules: contract.rules.map(({ id, name, enforcement }) => ({ id, name, enforcement })) },
        () =>
          contract.rules.map(rule => `${rule.id.padEnd(30)} ${rule.enforcement.padEnd(12)} ${rule.name}`).join('\n'),
      );
    case 'concepts':
      return out(
        { schemaVersion, concepts: contract.concepts.map(({ id, layer, canonical }) => ({ id, layer, canonical })) },
        () =>
          contract.concepts
            .map(concept => `${concept.id.padEnd(34)} ${concept.layer.padEnd(15)} ${concept.canonical[0] ?? ''}`)
            .join('\n'),
      );
    case 'rule': {
      const [id] = rest;
      if (!id) return fail('usage', 'usage: yarn architecture rule <ID>');
      const rule = getRule(contract, id);
      if (!rule) return fail('unknown-rule', `No rule ${id}. Try: yarn architecture rules`);
      return out({ schemaVersion, ...rule }, () =>
        [
          `${rule.id} (${rule.name}) — enforced by ${rule.enforcement}`,
          '',
          rule.statement,
          '',
          `Why:\n  ${rule.why}`,
          '',
          `Remediation:\n  ${rule.remediation}`,
          rule.dependency ? `\nMay import:\n  ${rule.dependency.mayImport.join(', ') || '(nothing)'}` : '',
          rule.references.length ? `\n${list('References', rule.references)}` : '',
        ]
          .filter(line => line !== '')
          .join('\n'),
      );
    }
    case 'concept': {
      const [id] = rest;
      if (!id) return fail('usage', 'usage: yarn architecture concept <id>');
      const concept = getConcept(contract, id);
      if (!concept) return fail('unknown-concept', `No concept "${id}". Try: yarn architecture concepts`);
      const rules = rulesOf(contract, concept).map(({ id, statement }) => ({ id, statement }));
      return out({ schemaVersion, ...concept, rules }, () =>
        [
          `${concept.name.replace(/\*/g, '')} (${concept.id}, ${concept.layer} layer)`,
          '',
          concept.description.replace(/\[`([^`]+)`\]\([^)]+\)/g, '$1'),
          '',
          list('Canonical', concept.canonical),
          list('Also', concept.examples),
          list(
            'Rules',
            rules.map(rule => `${rule.id}: ${rule.statement}`),
          ),
          list('Decisions', concept.references),
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }
    case 'can-import': {
      const [file, specifier] = rest;
      if (!file || !specifier) return fail('usage', 'usage: yarn architecture can-import <file> <specifier>');
      const verdict = await canImport(file, specifier);
      const rule = verdict.rule ? getRule(contract, verdict.rule) : undefined;
      out({ schemaVersion, ...verdict, remediation: rule?.remediation }, () =>
        verdict.allowed
          ? `allowed: ${file} may import '${specifier}'`
          : `refused by ${verdict.rule ?? 'the import rules'}: ${file} may not import '${specifier}'\n\n${rule?.why ?? ''}\n\nRemediation:\n  ${rule?.remediation ?? ''}`,
      );
      return process.exit(verdict.allowed ? 0 : 1);
    }
    default:
      return fail(
        'usage',
        'usage: yarn architecture <inspect | rules | concepts | rule <ID> | concept <id> | can-import <file> <specifier>> [--json]',
      );
  }
}

main().catch(error => {
  fail('error', error instanceof Error ? error.message : String(error));
});
