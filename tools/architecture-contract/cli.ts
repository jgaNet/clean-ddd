#!/usr/bin/env tsx
/**
 * `yarn architecture <command>`: the contract, asked from a terminal or by a tool.
 *
 *   yarn architecture inspect                 what the contract holds
 *   yarn architecture rule <ID>               one rule: statement, why, remediation, references
 *   yarn architecture concept <id>            one concept: canonical files, rules, decisions
 *   yarn architecture can-import <file> <specifier>   would ESLint allow it, and which rule says
 *                                             (several pairs at once: file specifier file specifier …)
 *   yarn architecture verb <intent>           which HTTP verb and path shape a use case takes
 *   yarn architecture checklist <kind>        what a new aggregate, value object, command … is made of
 *   yarn architecture place <kind>            where it goes, path only
 *   yarn architecture create <dir> [--name x] a new application on this architecture, with none of its business
 *   yarn architecture mode feature [--base <ref>]     did this change leave the architecture alone
 *   yarn architecture mode architecture [--base <ref>] does it record the decision it makes
 *   yarn architecture plan validate <file>    is this intended change legal, before writing it
 *   yarn architecture plan explain <file>     the files, rules and examples it implies
 *   yarn architecture rules | concepts | verbs | checklists   the lists
 *
 * Every command takes --json: valid JSON only on stdout, nothing decorative, exit 1 on an
 * unknown id with a structured error. That output is the stable interface for coding agents.
 */

import { ContractError } from './types';
import { loadArchitectureContract } from './load';
import { canImportAll, getChecklist, getConcept, getRule, getVerbs, rulesOf } from './query';
import { explainPlan, loadFeaturePlan, validatePlan } from './plan';
import { changedFiles, checkMode } from './modes';
import { createApplication } from './create';
import type { ModeName } from './types';
import { repositoryRoot } from './load';

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
          verbs: contract.verbs.length,
          checklists: contract.checklists.length,
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
            `Verbs: ${contract.verbs.length} (yarn architecture verbs)`,
            `Modes: ${Object.keys(contract.modes).join(', ')} (yarn architecture mode <name>)`,
            `Checklists: ${contract.checklists.length} (yarn architecture checklists)`,
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
    case 'verbs':
      return out({ schemaVersion, verbs: contract.verbs }, () =>
        contract.verbs.map(verb => `${verb.intent.padEnd(18)} ${verb.verb.padEnd(7)} ${verb.shape}`).join('\n'),
      );
    case 'checklists':
      return out(
        {
          schemaVersion,
          checklists: contract.checklists.map(({ kind, place, concept }) => ({ kind, place, concept })),
        },
        () => contract.checklists.map(checklist => `${checklist.kind.padEnd(16)} ${checklist.place}`).join('\n'),
      );
    case 'verb': {
      const [intent] = rest;
      if (!intent) return fail('usage', 'usage: yarn architecture verb <intent>');
      const verbs = getVerbs(contract, intent);
      if (!verbs.length) return fail('unknown-intent', `No verb for "${intent}". Try: yarn architecture verbs`);
      const rule = getRule(contract, contract.rules.find(r => r.id === 'ARCH-PRESENTATION')?.id ?? '');
      return out({ schemaVersion, verbs, rule: rule?.id }, () =>
        // The shape already begins with the verb ("POST /notes"); printing both said it twice.
        verbs
          .map(verb => `${verb.shape}\n  ${verb.when}${verb.example ? `\n  See: ${verb.example}` : ''}`)
          .join('\n\n'),
      );
    }
    case 'checklist':
    case 'place': {
      const [kind] = rest;
      if (!kind) return fail('usage', `usage: yarn architecture ${command} <kind>`);
      const checklist = getChecklist(contract, kind);
      if (!checklist) return fail('unknown-kind', `No checklist for "${kind}". Try: yarn architecture checklists`);
      if (command === 'place') {
        return out(
          { schemaVersion, kind: checklist.kind, place: checklist.place, concept: checklist.concept },
          () => checklist.place,
        );
      }
      const concept = getConcept(contract, checklist.concept);
      return out(
        { schemaVersion, ...checklist, canonical: concept?.canonical ?? [], rules: concept?.rules ?? [] },
        () =>
          [
            `A new ${checklist.kind} goes in ${checklist.place}`,
            '',
            ...checklist.parts.map(part => `- ${part}`),
            concept?.canonical.length ? `\n${list('Canonical example', concept.canonical)}` : '',
          ]
            .filter(line => line !== '')
            .join('\n'),
      );
    }
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
    case 'create': {
      const [directory] = rest;
      if (!directory) return fail('usage', 'usage: yarn architecture create <dir> [--name <name>]');
      const name = rest.includes('--name')
        ? rest[rest.indexOf('--name') + 1]
        : directory.split('/').filter(Boolean).pop();
      let created;
      try {
        created = createApplication(directory, name ?? 'my-app');
      } catch (error) {
        return fail('cannot-create', error instanceof Error ? error.message : String(error));
      }
      return out({ schemaVersion, ...created }, () =>
        [
          `${created.name}: ${created.files} files in ${created.directory}`,
          '',
          `The building blocks, the shared kernel, the tooling and the contract — ${created.rules} rules,`,
          `${created.concepts} concepts — and no business: src/Contexts is yours to fill.`,
          '',
          'Next:',
          `  cd ${created.directory} && yarn install`,
          '  yarn check:conventions && yarn test:units',
          '  yarn architecture checklist context',
        ].join('\n'),
      );
    }
    case 'mode': {
      const mode = rest[0] as ModeName;
      if (!['feature', 'architecture'].includes(mode)) {
        return fail('usage', 'usage: yarn architecture mode <feature | architecture> [--base <ref> | --base working]');
      }
      const base =
        rest[rest.indexOf('--base') + 1] && rest.includes('--base') ? rest[rest.indexOf('--base') + 1] : 'origin/main';
      let changed;
      try {
        changed = changedFiles(base);
      } catch {
        return fail(
          'no-such-base',
          `Cannot compare with "${base}": no such ref. Try --base main, or --base working for uncommitted changes.`,
        );
      }
      const verdict = checkMode(mode, changed, contract, base);
      out({ schemaVersion, ...verdict, why: contract.modes[mode]?.why }, () =>
        verdict.ok
          ? `${mode} mode: the ${changed.length} changed file(s) are within it.`
          : [
              `${mode} mode: ${verdict.problems.length} problem(s) over ${changed.length} changed file(s)`,
              '',
              ...verdict.problems.map(problem => `  ✗ ${problem}`),
              '',
              contract.modes[mode]?.why ?? '',
            ].join('\n'),
      );
      return process.exit(verdict.ok ? 0 : 1);
    }
    case 'plan': {
      const [action, file] = rest;
      if (!['validate', 'explain'].includes(action) || !file) {
        return fail('usage', 'usage: yarn architecture plan <validate | explain> <file>');
      }
      let plan;
      try {
        plan = loadFeaturePlan(file, repositoryRoot());
      } catch (error) {
        if (error instanceof ContractError) return fail(error.code, error.message);
        throw error;
      }
      if (action === 'validate') {
        const problems = validatePlan(plan, contract, repositoryRoot());
        out({ schemaVersion, feature: plan.feature, valid: problems.length === 0, problems }, () =>
          problems.length
            ? `${plan.feature}: ${problems.length} problem(s)\n${problems.map(problem => `  ✗ ${problem}`).join('\n')}`
            : `${plan.feature}: the plan is legal against the contract (${plan.changes.length} changes, context ${plan.context}).`,
        );
        return process.exit(problems.length ? 1 : 0);
      }
      const explained = explainPlan(plan, contract);
      return out({ schemaVersion, ...explained }, () =>
        [
          `${explained.feature} — ${explained.context}`,
          '',
          explained.intent,
          '',
          ...explained.changes.flatMap(change => [
            `${change.new ? 'Add' : 'Change'} the ${change.kind} ${change.name} — ${change.place}`,
            ...(change.verb ? [`  ${change.route ?? change.verb.shape} — ${change.verb.when}`] : []),
            ...change.parts.map(part => `  - ${part}`),
            ...(change.canonical.length ? [`  Copy the shape of: ${change.canonical.join(', ')}`] : []),
            '',
          ]),
          'Rules this plan is bound by:',
          ...explained.rules.map(rule => `  ${rule.id}: ${rule.statement}`),
          '',
          `Before it is done: ${explained.checks.join(', ')}.`,
        ].join('\n'),
      );
    }
    case 'can-import': {
      if (rest.length < 2 || rest.length % 2 !== 0) {
        return fail('usage', 'usage: yarn architecture can-import <file> <specifier> [<file> <specifier> …]');
      }
      const pairs: [string, string][] = [];
      for (let i = 0; i < rest.length; i += 2) pairs.push([rest[i], rest[i + 1]]);
      const verdicts = await canImportAll(pairs);
      const answers = verdicts.map(verdict => ({
        ...verdict,
        remediation: verdict.rule ? getRule(contract, verdict.rule)?.remediation : undefined,
      }));
      out(answers.length === 1 ? { schemaVersion, ...answers[0] } : { schemaVersion, imports: answers }, () =>
        answers
          .map(answer => {
            const rule = answer.rule ? getRule(contract, answer.rule) : undefined;
            return answer.allowed
              ? `allowed: ${answer.file} may import '${answer.specifier}'`
              : `refused by ${answer.rule ?? 'the import rules'}: ${answer.file} may not import '${answer.specifier}'\n\n${rule?.why ?? ''}\n\nRemediation:\n  ${rule?.remediation ?? ''}`;
          })
          .join('\n\n'),
      );
      return process.exit(answers.every(answer => answer.allowed) ? 0 : 1);
    }
    default:
      return fail(
        'usage',
        'usage: yarn architecture <inspect | rules | concepts | verbs | checklists | rule <ID> | concept <id> | verb <intent> | checklist <kind> | place <kind> | mode <feature|architecture> | plan <validate|explain> <file> | create <dir> | can-import <file> <specifier> …> [--json]',
      );
  }
}

main().catch(error => {
  fail('error', error instanceof Error ? error.message : String(error));
});
