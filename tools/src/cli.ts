/**
 * `yarn architecture <command>` (`clean-ddd <command>` from an installed package): the contract, asked
 * from a terminal or by a tool.
 *
 *   yarn check:conventions                    = `architecture check [--write]`: the conventions and the code agree
 *   yarn architecture inspect                 what the contract holds, for this language
 *   yarn architecture rule <ID>               one rule: statement, why, remediation, references, examples
 *   yarn architecture concept <id>            one concept: canonical files, rules, decisions
 *   yarn architecture can-import <file> <specifier>   would ESLint allow it, and which rule says
 *                                             (several pairs at once: file specifier file specifier …)
 *   yarn architecture verb <intent>           which HTTP verb and path shape a use case takes
 *   yarn architecture checklist <kind>        what a new aggregate, value object, command … is made of
 *   yarn architecture place <kind>            where it goes, path only
 *   yarn architecture create <dir> [--name x] [--language <id>]   a new application on this architecture, in that language, with none of its business
 *   yarn architecture mode feature [--base <ref>]     did this change leave the architecture alone
 *   yarn architecture mode architecture [--base <ref>] does it record the decision it makes
 *   yarn architecture gate [--base <ref>]     is this change done: the feature mode, the conventions check and the
 *                                             language's checks, one verdict (--json for a script; exit 1 when it fails)
 *   yarn architecture plan validate <file>    is this intended change legal, before writing it
 *   yarn architecture plan explain <file>     the files, rules and examples it implies
 *   yarn architecture domain                  the subdomains and the context map, its contracts read from the code
 *   yarn architecture context <id>            one bounded context: purpose, language, what it depends on and who depends on it
 *   yarn architecture storm [<context>]       the event storm read from the code (--markdown, --svg for the board, --json)
 *   yarn architecture storm validate <file>   an expected storm (conventions/storms/*.yaml) against the contract, the map and the code
 *   yarn architecture storm --expect <file>   what the code still owes an expected storm; --markdown, --svg lay its stickies on the board
 *   yarn architecture inventory [<language>]  what the tree says the application is, in words every language shares;
 *                                             with a language, where that language's committed inventory differs
 *   yarn architecture rules | concepts | verbs | checklists   the lists
 *
 * Every command takes --json: valid JSON only on stdout, nothing decorative, exit 1 on an
 * unknown id with a structured error. That output is the stable interface for coding agents.
 *
 * Every command answers for one language's binding: the one the command was typed in (from
 * `rust/`, `yarn --cwd .. architecture checklist command` answers in Rust), or the one
 * `--language <id>` names, or the reference's (TypeScript). `check` is the exception: it holds
 * the tree this tooling reads, and ignores where it was typed.
 *
 * The repository root is the nearest directory at or above where the command was typed that
 * holds `conventions/` — this repository's root, or an application `create` made. Paths are
 * printed relative to it; a path given on the command line is read relative to where the
 * command was typed (`yarn` records it as INIT_CWD), so `src/…` from `typescript/` and
 * `typescript/src/…` from the root name the same file.
 */

import { relative, resolve } from 'path';

import { ContractError, SUPPORTED_SCHEMA_VERSION } from './types';
import { loadArchitectureContract, repositoryRoot, typedFrom } from './load';
import { checkConventions } from './check';
import { canImportAll, getChecklist, getConcept, getRule, getVerbs, rulesOf } from './query';
import { explainPlan, loadFeaturePlan, validatePlan } from './plan';
import { changedFiles, checkMode } from './modes';
import { DOMAIN_FILE, describeContext, describeDomain, inspectContextLinks, loadDomainMap } from './domain';
import { describeEventStorm, inspectEventStorm, renderEventStorm, renderEventStormSvg, renderProcess } from './storm';
import { compareInventories, describeInventory, inspectInventory, loadInventories } from './inventory';
import {
  checkExpectedStorm,
  describeExpectation,
  loadExpectedStorm,
  overlayExpectedStorm,
  validateExpectedStorm,
} from './storms';
import { createApplication, referenceSource } from './create';
import { describeGate, runGate } from './gate';
import type { ModeName } from './types';

const args = process.argv.slice(2);
const json = args.includes('--json');
const languageFlag = args.includes('--language') ? args[args.indexOf('--language') + 1] : undefined;
const valued = ['--language', '--expect'];
const expectFlag = args.includes('--expect') ? args[args.indexOf('--expect') + 1] : undefined;
const flagged = ['--json', '--language', '--markdown', '--svg', '--expect', '--write'];
const [command, ...rest] = args.filter((arg, index) => !flagged.includes(arg) && !valued.includes(args[index - 1]));

const here = typedFrom();

/** The language whose directory the command was typed in, if it is one of the reference's. */
function languageTypedIn(languages: string[]): string | undefined {
  const from = resolve(here);
  return languages.find(language => {
    const languageDir = resolve(root, loadArchitectureContract(root, language).language.root);
    return from === languageDir || from.startsWith(`${languageDir}/`);
  });
}
/** A path as typed, made repository-relative. */
const fromHere = (path: string) => relative(root, resolve(here, path)).split('\\').join('/');

const out = (value: unknown, text: () => string) => {
  process.stdout.write(json ? `${JSON.stringify(value, null, 2)}\n` : `${text()}\n`);
};
const fail = (code: string, message: string): never => {
  if (json) process.stdout.write(`${JSON.stringify({ error: { code, message } }, null, 2)}\n`);
  else process.stderr.write(`${message}\n`);
  process.exit(1);
};

const list = (title: string, items: string[]) => (items.length ? `${title}:\n  ${items.join('\n  ')}` : '');

let root = '';

function create(): void {
  const [directory] = rest;
  if (!directory) return fail('usage', 'usage: yarn architecture create <dir> [--name <name>]');
  const name = rest.includes('--name') ? rest[rest.indexOf('--name') + 1] : directory.split('/').filter(Boolean).pop();
  let created;
  try {
    created = createApplication(resolve(here, directory), name ?? 'my-app', referenceSource(here), languageFlag);
  } catch (error) {
    return fail('cannot-create', error instanceof Error ? error.message : String(error));
  }
  return out({ schemaVersion: SUPPORTED_SCHEMA_VERSION, ...created }, () =>
    [
      `${created.name}: ${created.files} files in ${created.directory}`,
      '',
      `The building blocks, the shared kernel, the tooling and the contract — ${created.rules} rules,`,
      `${created.concepts} concepts — and no business: ${created.contexts.length ? `${created.contexts.join(', ')} to follow every command, and ` : ''}the contexts are yours to write.`,
      '',
      'Next:',
      ...created.next.map(line => `  ${line}`),
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  let contract;
  try {
    // `create` needs no repository: from an installed package it copies the reference it carries.
    if (command === 'create') return create();
    root = repositoryRoot(here);
    if (command === 'check') {
      const write = args.includes('--write');
      const report = await checkConventions(root, write);
      if (report.problems.length) {
        if (json) process.stdout.write(`${JSON.stringify({ ok: false, problems: report.problems }, null, 2)}\n`);
        else for (const message of report.problems) process.stderr.write(`✗ ${message}\n`);
        process.exit(1);
      }
      return out({ ok: true, problems: [] }, () => report.summary);
    }
    contract = loadArchitectureContract(root);
    const language = languageFlag ?? languageTypedIn(contract.languages);
    if (language && !contract.languages.includes(language)) {
      return fail('unknown-language', `No binding for "${language}". Languages: ${contract.languages.join(', ')}`);
    }
    if (language && language !== contract.language.id) contract = loadArchitectureContract(root, language);
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
          language: contract.language,
          languages: contract.languages,
          contexts: contract.contexts,
          trees: {
            contexts: contract.contextsTree,
            architecture: contract.architecture,
            kernel: contract.kernel,
            bootstrap: contract.bootstrap,
          },
          layers: contract.layers,
          rules: contract.rules.length,
          concepts: contract.concepts.length,
          verbs: contract.verbs.length,
          checklists: contract.checklists.length,
          sources: contract.sources,
        },
        () =>
          [
            `Architecture contract, ${contract.language.name} binding (${contract.language.root}/)`,
            '',
            list('Languages', contract.languages),
            list('Contexts', contract.contexts),
            list('Trees', [
              `${contract.contextsTree.alias} → ${contract.contextsTree.path}`,
              `${contract.architecture.alias} → ${contract.architecture.path}`,
              `${contract.kernel.alias} → ${contract.kernel.path}`,
              `${contract.bootstrap.alias} → ${contract.bootstrap.path}`,
            ]),
            list('Layers', contract.layers),
            '',
            `Rules: ${contract.rules.length} (yarn architecture rules)`,
            `Concepts: ${contract.concepts.length} (yarn architecture concepts)`,
            `Verbs: ${contract.verbs.length} (yarn architecture verbs)`,
            `Modes: ${Object.keys(contract.modes).join(', ')} (yarn architecture mode <name>)`,
            `Checklists: ${contract.checklists.length} (yarn architecture checklists)`,
            '',
            list('Sources', [contract.sources.architecture, contract.sources.concepts, contract.sources.binding]),
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
            .map(
              concept =>
                `${concept.id.padEnd(34)} ${concept.layer.padEnd(15)} ${concept.canonical[0] ?? `(not shown in ${contract.language.id} yet)`}`,
            )
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
      if (!kind) {
        const kinds = contract.checklists.map(checklist => checklist.kind).join(' | ');
        return fail('usage', `usage: yarn architecture ${command} <${kinds}>`);
      }
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
      return out({ schemaVersion, ...rule, enforcedBy: contract.enforcers[rule.enforcement] }, () =>
        [
          `${rule.id} (${rule.name}) — enforced by ${rule.enforcement}: ${contract.enforcers[rule.enforcement]}`,
          '',
          rule.statement,
          '',
          `Why:\n  ${rule.why}`,
          '',
          `Remediation:\n  ${rule.remediation}`,
          rule.dependency ? `\nMay import:\n  ${rule.dependency.mayImport.join(', ') || '(nothing)'}` : '',
          rule.references.length ? `\n${list('References', rule.references)}` : '',
          rule.examples.length ? `\n${list(`Shown in ${contract.language.name} by`, rule.examples)}` : '',
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
          concept.canonical.length
            ? list('Canonical', concept.canonical)
            : `Not shown in ${contract.language.name} yet: ${contract.sources.binding} names no file for it.`,
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
    case 'domain': {
      const map = loadDomainMap(root);
      if (!map) return fail('no-domain-map', `No ${DOMAIN_FILE}: this repository has not described its domain yet`);
      const links = inspectContextLinks(contract, root);
      return out({ ...map, schemaVersion, links }, () => describeDomain(map, links));
    }
    case 'context': {
      const [id] = rest;
      if (!id) return fail('usage', 'usage: yarn architecture context <id>');
      const map = loadDomainMap(root);
      if (!map) return fail('no-domain-map', `No ${DOMAIN_FILE}: this repository has not described its domain yet`);
      const context = map.contexts.find(candidate => candidate.id.toLowerCase() === id.toLowerCase());
      if (!context) {
        return fail('unknown-context', `No context "${id}". Contexts: ${map.contexts.map(each => each.id).join(', ')}`);
      }
      const links = inspectContextLinks(contract, root);
      const subdomain = map.subdomains.find(candidate => candidate.contexts.includes(context.id));
      return out(
        {
          schemaVersion,
          ...context,
          subdomain: subdomain ? { id: subdomain.id, name: subdomain.name, kind: subdomain.kind } : undefined,
          directory: `${contract.contextsTree.path}/${context.id}`,
          dependsOn: map.relationships.filter(relationship => relationship.downstream === context.id),
          dependedOnBy: map.relationships.filter(relationship => relationship.upstream === context.id),
          links: links.filter(link => link.upstream === context.id || link.downstream === context.id),
        },
        () => describeContext(map, context, links, contract),
      );
    }
    case 'storm': {
      if (rest[0] === 'validate') {
        const [, file] = rest;
        if (!file) return fail('usage', 'usage: yarn architecture storm validate <file>');
        let expected;
        try {
          expected = loadExpectedStorm(fromHere(file), root);
        } catch (error) {
          if (error instanceof ContractError) return fail(error.code, error.message);
          throw error;
        }
        const actual = inspectInventory(contract, root);
        const problems = [
          ...validateExpectedStorm(expected, contract, actual, root),
          ...checkExpectedStorm(expected, actual),
        ];
        const verdict = problems.length
          ? problems.join('\n')
          : `${expected.feature}: legal against the contract and the map; ${expected.done ? 'carried by the code' : 'not in the code yet'}`;
        out(
          { schemaVersion, feature: expected.feature, done: expected.done, valid: !problems.length, problems },
          () => verdict,
        );
        if (problems.length) process.exit(1);
        return;
      }
      let storm = inspectEventStorm(contract, root);
      if (expectFlag) {
        let expected;
        try {
          expected = loadExpectedStorm(fromHere(expectFlag), root);
        } catch (error) {
          if (error instanceof ContractError) return fail(error.code, error.message);
          throw error;
        }
        const actual = inspectInventory(contract, root);
        if (!args.includes('--markdown') && !args.includes('--svg')) {
          return out(
            {
              schemaVersion,
              feature: expected.feature,
              done: expected.done,
              problems: checkExpectedStorm(expected, actual),
            },
            () => describeExpectation(expected, actual),
          );
        }
        storm = overlayExpectedStorm(storm, expected, actual);
      }
      const [contextId] = rest;
      if (args.includes('--svg')) {
        process.stdout.write(`${renderEventStormSvg(storm)}\n`);
        return;
      }
      if (contextId) {
        const context = storm.contexts.find(candidate => candidate.id.toLowerCase() === contextId.toLowerCase());
        if (!context) {
          return fail(
            'unknown-context',
            `No context "${contextId}". Contexts: ${storm.contexts.map(each => each.id).join(', ')}`,
          );
        }
        return out({ schemaVersion, language: storm.language, ...context }, () =>
          args.includes('--markdown')
            ? renderProcess(context, storm)
            : describeEventStorm({ ...storm, contexts: [context] }),
        );
      }
      return out({ schemaVersion, ...storm }, () =>
        args.includes('--markdown') ? renderEventStorm(storm) : describeEventStorm(storm),
      );
    }
    case 'inventory': {
      const inventory = inspectInventory(contract, root);
      const [other] = rest;
      if (other) {
        const committed = loadInventories(root).get(other);
        if (!committed) {
          return fail('unknown-language', `No committed inventory for "${other}" under docs/inventory`);
        }
        const problems = compareInventories(inventory, committed);
        return out({ schemaVersion, reference: inventory.language, other, problems }, () =>
          problems.length ? problems.join('\n') : `${other}: the same application as ${inventory.language}`,
        );
      }
      return out({ ...inventory, schemaVersion }, () => describeInventory(inventory));
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
        changed = changedFiles(base, root);
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
    case 'gate': {
      const base =
        rest[rest.indexOf('--base') + 1] && rest.includes('--base') ? rest[rest.indexOf('--base') + 1] : 'origin/main';
      try {
        changedFiles(base, root);
      } catch {
        return fail(
          'no-such-base',
          `Cannot compare with "${base}": no such ref. Try --base main, or --base working for uncommitted changes.`,
        );
      }
      const report = await runGate({ root, base, language: contract.language.id });
      out(report, () => describeGate(report));
      return process.exit(report.verdict === 'pass' ? 0 : 1);
    }
    case 'plan': {
      const [action, file] = rest;
      if (!['validate', 'explain'].includes(action) || !file) {
        return fail('usage', 'usage: yarn architecture plan <validate | explain> <file>');
      }
      let plan;
      try {
        plan = loadFeaturePlan(fromHere(file), root);
      } catch (error) {
        if (error instanceof ContractError) return fail(error.code, error.message);
        throw error;
      }
      // A plan for another language of the reference is checked against that language's binding.
      const bound =
        plan.language && plan.language !== contract.language.id && contract.languages.includes(plan.language)
          ? loadArchitectureContract(root, plan.language)
          : contract;
      if (action === 'validate') {
        const problems = validatePlan(plan, bound, root);
        out(
          { schemaVersion, feature: plan.feature, language: bound.language.id, valid: problems.length === 0, problems },
          () =>
            problems.length
              ? `${plan.feature}: ${problems.length} problem(s)\n${problems.map(problem => `  ✗ ${problem}`).join('\n')}`
              : `${plan.feature}: the plan is legal against the ${bound.language.id} binding (${plan.changes.length} changes, context ${plan.context}).`,
        );
        return process.exit(problems.length ? 1 : 0);
      }
      const explained = explainPlan(plan, bound);
      return out({ schemaVersion, ...explained }, () =>
        [
          `${explained.feature} — ${explained.context}, in ${explained.language}`,
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
      for (let i = 0; i < rest.length; i += 2) pairs.push([fromHere(rest[i]), rest[i + 1]]);
      const verdicts = await canImportAll(pairs, contract, root);
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
