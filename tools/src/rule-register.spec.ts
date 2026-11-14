import { readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  checkRuleRegister,
  describeOrigin,
  inspectRuleEvidence,
  loadDomainMap,
  loadRuleRegister,
  parseRuleRegister,
  publicNameOf,
  RULE_REGISTER_FILE,
  validateRuleRegister,
} from './index';
import type { RuleEvidence } from './index';
import { loadArchitectureContract, repositoryRoot } from './load';

/**
 * The rule register (ADR 46, DOMAIN-RULE-NAMED): the file is loaded and held to the domain map and to the
 * decisions and storms its origins name; in the TypeScript tree, every refusal a context returns is named by a
 * rule, every rule has its exception, and a test of its context names it.
 */

const root = repositoryRoot();
const contract = loadArchitectureContract(root);
const register = loadRuleRegister(root)!;
const contexts = loadDomainMap(root)!.contexts.map(context => context.id);
const evidence = inspectRuleEvidence(contract, root);
const text = readFileSync(join(root, RULE_REGISTER_FILE), 'utf8');

/** The reference's register with one rule taken out, as the file would read without its entry. */
const without = (name: string) => parseRuleRegister(text.replace(new RegExp(`\\n  ${name}:\\n(    .*\\n)+`), '\n'));

describe('the rule register', () => {
  it('loads every rule with its context, its statement and its origin', () => {
    expect(register.source).toBe(RULE_REGISTER_FILE);
    expect(register.rules).toHaveLength(24);
    expect(register.rules.find(rule => rule.name === 'RecipientNotFound')).toEqual({
      name: 'RecipientNotFound',
      context: 'Notes',
      statement: 'A note is shared only with an account that exists.',
      origin: { storm: 'share-a-note' },
    });
    expect(describeOrigin({ adr: 32 })).toBe('ADR 32');
    expect(describeOrigin({ storm: 'share-a-note' })).toBe('the storm share-a-note');
    expect(describeOrigin({ request: 'R12' })).toBe('request R12');
    expect(validateRuleRegister(register, contexts, root)).toEqual([]);
    expect(contract.ruleRegister).toBe(true);
  });

  it('is absent from a tree that names no rule, and empty in one whose file names none', () => {
    const empty = mkdtempSync(join(tmpdir(), 'rules-'));
    try {
      expect(loadRuleRegister(empty)).toBeUndefined();
      mkdirSync(join(empty, 'conventions'));
      writeFileSync(join(empty, RULE_REGISTER_FILE), '# nothing yet\nrules: {}\n');
      expect(loadRuleRegister(empty)).toEqual({ source: RULE_REGISTER_FILE, rules: [] });
      writeFileSync(join(empty, RULE_REGISTER_FILE), 'rules: [NoteNotFound]\n');
      expect(() => loadRuleRegister(empty)).toThrow(/"rules" must be a mapping/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('refuses a name with its suffix, a context of no map, no statement, and an origin that is none or names nothing', () => {
    const wrong = parseRuleRegister(
      [
        'rules:',
        '  NoteNotFoundException: { context: Notes, statement: A note exists., origin: { adr: 1 } }',
        '  Overdrawn: { context: Billing, statement: An account stays in credit., origin: { adr: 999 } }',
        '  Silent: { context: Notes, origin: { storm: pin-a-planet } }',
        '  Twice: { context: Notes, statement: Said once., origin: { adr: 1, storm: share-a-note } }',
        '  Asked: { context: Notes, statement: Asked for., origin: { request: " " } }',
        '  Told: { context: Notes, statement: Asked for., origin: { request: R12 } }',
      ].join('\n'),
    );
    expect(validateRuleRegister(wrong, contexts, root)).toEqual([
      'DOMAIN-RULE-NAMED: conventions/rules.yaml rule NoteNotFoundException: the name is not a public name (PascalCase, without the suffix of its kind: NoteNotFound, not NoteNotFoundException)',
      'DOMAIN-RULE-NAMED: conventions/rules.yaml rule Overdrawn: context Billing is not a context of the domain map (Notes, Security, Notifications, Tracker)',
      'DOMAIN-RULE-NAMED: conventions/rules.yaml rule Overdrawn: origin is ADR 999, and docs/adr has no 0999-….md',
      'DOMAIN-RULE-NAMED: conventions/rules.yaml rule Silent: "statement" is missing; the rule in the business\'s words, one sentence',
      'DOMAIN-RULE-NAMED: conventions/rules.yaml rule Silent: origin is the storm pin-a-planet, and conventions/storms has no pin-a-planet.yaml',
      'DOMAIN-RULE-NAMED: conventions/rules.yaml rule Twice: "origin" is missing, or is not one of { adr: <n> }, { storm: <feature> }, { request: <id> }',
      "DOMAIN-RULE-NAMED: conventions/rules.yaml rule Asked: origin's request names no request",
    ]);
  });
});

describe('the evidence of the rules, read from the TypeScript tree', () => {
  it('finds every refusal a context returns, and no base exception that is only extended', () => {
    const names = evidence.refusals.map(refusal => `${refusal.context}:${refusal.name}`);
    expect(names).toHaveLength(24);
    expect(names).toEqual(expect.arrayContaining(['Notes:NoteNotFound', 'Security:InvalidCredentials']));
    expect(evidence.refusals.find(refusal => refusal.name === 'NoteNotFound')).toEqual({
      name: 'NoteNotFound',
      exception: 'NoteNotFoundException',
      context: 'Notes',
      file: 'typescript/src/Contexts/Notes/Domain/Note/NoteExceptions.ts',
    });
    for (const base of ['NoteDomain', 'AccountDomain', 'NotificationDomain'])
      expect(names.some(name => name.endsWith(`:${base}`))).toBe(false);
    expect(publicNameOf('NoteNotFoundException')).toBe('NoteNotFound');
  });

  it('holds the reference: every refusal named, every rule returned and named by a test', () => {
    expect(checkRuleRegister(register, evidence)).toEqual([]);
  });

  it('names the refusal no rule names: the probe, with one rule taken out of the reference', () => {
    expect(checkRuleRegister(without('NoteAlreadyShared'), evidence)).toEqual([
      'DOMAIN-RULE-NAMED: Notes returns NoteAlreadyShared (NoteAlreadySharedException, typescript/src/Contexts/Notes/Domain/Note/NoteExceptions.ts), which no rule of conventions/rules.yaml names; name it there — its context, its statement, its origin — before the code returns it',
    ]);
  });

  it('names a refusal another context has a rule for, under the context that returns it', () => {
    const moved = parseRuleRegister(text.replace(/(\n {2}NoteAlreadyShared:\n {4}context:) Notes/, '$1 Security'));
    expect(checkRuleRegister(moved, evidence)).toEqual([
      expect.stringMatching(
        /^DOMAIN-RULE-NAMED: Notes returns NoteAlreadyShared .* which no rule of conventions\/rules\.yaml names under Notes \(it names one under Security\)/,
      ),
      'DOMAIN-RULE-NAMED: conventions/rules.yaml rule NoteAlreadyShared (Security): no exception of Security returns it — no NoteAlreadySharedException under its Domain or Application that its code instantiates; remove the rule with the last code that returned it',
      'DOMAIN-RULE-NAMED: conventions/rules.yaml rule NoteAlreadyShared (Security): no test of Security names it — NoteAlreadyShared or NoteAlreadySharedException in a *.spec.ts under typescript/src/Contexts/Security',
    ]);
  });

  it('names a rule no code returns, and a rule no test names', () => {
    const more = parseRuleRegister(
      `${text}  NoteTooLong:\n    context: Notes\n    statement: A note is short.\n    origin: { adr: 19 }\n`,
    );
    expect(checkRuleRegister(more, evidence)).toEqual([
      'DOMAIN-RULE-NAMED: conventions/rules.yaml rule NoteTooLong (Notes): no exception of Notes returns it — no NoteTooLongException under its Domain or Application that its code instantiates; remove the rule with the last code that returned it',
      'DOMAIN-RULE-NAMED: conventions/rules.yaml rule NoteTooLong (Notes): no test of Notes names it — NoteTooLong or NoteTooLongException in a *.spec.ts under typescript/src/Contexts/Notes',
    ]);
    const untested: RuleEvidence = {
      ...evidence,
      tests: new Map([
        ...evidence.tests,
        [
          'Notes',
          (evidence.tests.get('Notes') ?? []).map(test => ({
            ...test,
            text: test.text.replace(/RecipientNotFound/g, 'SomeoneElse'),
          })),
        ],
      ]),
    };
    expect(checkRuleRegister(register, untested)).toEqual([
      'DOMAIN-RULE-NAMED: conventions/rules.yaml rule RecipientNotFound (Notes): no test of Notes names it — RecipientNotFound or RecipientNotFoundException in a *.spec.ts under typescript/src/Contexts/Notes',
    ]);
  });
});
