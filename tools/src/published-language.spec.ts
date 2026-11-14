import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  checkInventoryAgainstPublishedLanguage,
  frozenVersionChanges,
  loadDomainMap,
  loadPublishedLanguage,
  parsePublishedLanguage,
  PUBLISHED_LANGUAGE_FILE,
  publishedLanguageAt,
  validatePublishedLanguage,
} from './index';
import { inspectInventory } from './inventory';
import type { Inventory } from './inventory';
import { loadArchitectureContract, repositoryRoot } from './load';

/**
 * The published language (ADR 44, CTX-PUBLISHED-LANGUAGE): the file is loaded and held to the domain map,
 * every inventory is held to the last version of each event, and the gate's reading of the history refuses
 * a merged version changed in place.
 */

const root = repositoryRoot();
const published = loadPublishedLanguage(root)!;
const contexts = loadDomainMap(root)!.contexts.map(context => context.id);
const inventory = inspectInventory(loadArchitectureContract(root), root);
const clone = (): Inventory => JSON.parse(JSON.stringify(inventory));

const file = (events: string) => parsePublishedLanguage(`events:\n${events}`);

describe('the published language', () => {
  it('loads every event with its publisher, what it announces and its versions', () => {
    expect(published.source).toBe(PUBLISHED_LANGUAGE_FILE);
    expect(published.events.map(event => event.name)).toEqual([
      'AccountCreated',
      'AccountValidated',
      'NoteShared',
      'OperationComplete',
    ]);
    expect(published.events[0]).toEqual({
      name: 'AccountCreated',
      publisher: 'Security',
      announces: { thing: 'Account', id: 'accountId' },
      versions: [{ version: 1, payload: { accountId: 'string', email: 'string', validationToken: 'string' } }],
    });
    expect(validatePublishedLanguage(published, contexts)).toEqual([]);
  });

  it('is absent from a tree that declares no event, and empty in one whose file declares none', () => {
    const empty = mkdtempSync(join(tmpdir(), 'published-'));
    try {
      expect(loadPublishedLanguage(empty)).toBeUndefined();
      mkdirSync(join(empty, 'conventions'));
      writeFileSync(join(empty, PUBLISHED_LANGUAGE_FILE), '# nothing yet\nevents: {}\n');
      expect(loadPublishedLanguage(empty)).toEqual({ source: PUBLISHED_LANGUAGE_FILE, events: [] });
      writeFileSync(join(empty, PUBLISHED_LANGUAGE_FILE), 'events: [NoteShared]\n');
      expect(() => loadPublishedLanguage(empty)).toThrow(/"events" must be a mapping/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('refuses a publisher that is not a context, versions out of order, a type not of the six, a name with its suffix', () => {
    const wrong = file(
      [
        '  NoteSharedIntegrationEvent:',
        '    publisher: Billing',
        '    versions:',
        '      - version: 2',
        '        payload: { noteId: string, note_title: str }',
        '  NoteArchived:',
        '    versions: []',
      ].join('\n'),
    );
    expect(validatePublishedLanguage(wrong, contexts)).toEqual([
      'CTX-PUBLISHED-LANGUAGE: conventions/integration-events.yaml event NoteSharedIntegrationEvent: the name is not a public name (PascalCase, without the suffix of its kind: NoteShared, not NoteSharedIntegrationEvent)',
      'CTX-PUBLISHED-LANGUAGE: conventions/integration-events.yaml event NoteSharedIntegrationEvent: publisher Billing is not a context of the domain map (Notes, Security, Notifications, Tracker)',
      'CTX-PUBLISHED-LANGUAGE: conventions/integration-events.yaml event NoteSharedIntegrationEvent: version 2 is listed 1st; versions are numbered 1, 2, … oldest first',
      'CTX-PUBLISHED-LANGUAGE: conventions/integration-events.yaml event NoteSharedIntegrationEvent, version 1: the field note_title is not a public name in lowerCamel',
      'CTX-PUBLISHED-LANGUAGE: conventions/integration-events.yaml event NoteSharedIntegrationEvent, version 1: the field note_title is "str", not one of string, number, boolean, object, array, any (with "?" when it may be absent)',
      'CTX-PUBLISHED-LANGUAGE: conventions/integration-events.yaml event NoteArchived: "publisher" is missing',
      'CTX-PUBLISHED-LANGUAGE: conventions/integration-events.yaml event NoteArchived: "versions" is missing or empty; the first is version 1',
    ]);
  });

  it('refuses an event that announces a thing without carrying its id as a string of the last version', () => {
    const announcing = (payload: string) =>
      file(
        [
          '  AccountCreated:',
          '    publisher: Security',
          '    announces: { thing: Account, id: accountId }',
          '    versions:',
          '      - version: 1',
          '        payload: { accountId: string, email: string }',
          '      - version: 2',
          `        payload: ${payload}`,
        ].join('\n'),
      );
    expect(validatePublishedLanguage(announcing('{ accountId: string, email: string? }'), contexts)).toEqual([]);
    expect(validatePublishedLanguage(announcing('{ email: string }'), contexts)).toEqual([
      "CTX-PUBLISHED-LANGUAGE: conventions/integration-events.yaml event AccountCreated: announces Account by the field accountId, which is not a field of the last version's payload; the id a thing was born with is a string the event carries (DOMAIN-IDENTITY)",
    ]);
    expect(validatePublishedLanguage(announcing('{ accountId: string?, email: string }'), contexts)).toEqual([
      'CTX-PUBLISHED-LANGUAGE: conventions/integration-events.yaml event AccountCreated: announces Account by the field accountId, which is "string?" in the last version\'s payload; the id a thing was born with is a string the event carries (DOMAIN-IDENTITY)',
    ]);
  });
});

describe('every inventory, held to the published language', () => {
  it('finds the TypeScript tree carrying the last version of every event, field for field', () => {
    expect(checkInventoryAgainstPublishedLanguage(published, inventory)).toEqual([]);
  });

  it('names, with the language and the event, a payload, a publisher or an event that differs', () => {
    const other = clone();
    other.language = 'rust';
    const events = other.integrationEvents!;
    // OperationComplete as Rust once carried it: `kind` for `type`, and the field `error` required (ADR 44's two cases).
    const operation = events.find(event => event.name === 'OperationComplete')!;
    operation.payload = { ...operation.payload, kind: 'string', error: 'string' };
    delete operation.payload.type;
    events.find(event => event.name === 'NoteShared')!.publisher = 'Notifications';
    other.integrationEvents = events.filter(event => event.name !== 'AccountValidated');
    other.integrationEvents.push({ name: 'NoteArchived', publisher: 'Notes', payload: { noteId: 'string' } });

    expect(checkInventoryAgainstPublishedLanguage(published, other)).toEqual([
      'CTX-PUBLISHED-LANGUAGE: rust: AccountValidated is declared in conventions/integration-events.yaml, published by Security, and the rust tree publishes it nowhere',
      'CTX-PUBLISHED-LANGUAGE: rust: NoteShared is published by Notifications, and conventions/integration-events.yaml says Notes',
      "CTX-PUBLISHED-LANGUAGE: rust: OperationComplete's payload is not version 1 of conventions/integration-events.yaml: error is string, declared string?; type (string) is missing; kind (string) is not declared",
      'CTX-PUBLISHED-LANGUAGE: rust: Notes publishes NoteArchived { noteId: string }, which conventions/integration-events.yaml does not declare; declare it before the code publishes it',
    ]);
  });

  it('says once that an inventory its tool wrote before ADR 44 carries no payloads', () => {
    const before = clone();
    before.language = 'go';
    delete before.integrationEvents;
    expect(checkInventoryAgainstPublishedLanguage(published, before)).toEqual([
      'CTX-PUBLISHED-LANGUAGE: go: its inventory records no integrationEvents, so nothing holds its payloads to conventions/integration-events.yaml; its tool writes them (ADR 44)',
    ]);
    expect(checkInventoryAgainstPublishedLanguage({ ...published, events: [] }, before)).toEqual([]);
  });
});

describe('a merged version is frozen (the gate)', () => {
  const base = file(
    [
      '  NoteShared:',
      '    publisher: Notes',
      '    versions:',
      '      - version: 1',
      '        payload: { noteId: string, title: string }',
      '  NoteArchived:',
      '    publisher: Notes',
      '    versions:',
      '      - version: 1',
      '        payload: { noteId: string }',
    ].join('\n'),
  );
  const head = (noteShared: string[], rest: string[] = []) =>
    file(['  NoteShared:', '    publisher: Notes', '    versions:', ...noteShared, ...rest].join('\n'));
  const archived = [
    '  NoteArchived:',
    '    publisher: Notes',
    '    versions:',
    '      - version: 1',
    '        payload: { noteId: string }',
  ];

  it('allows an added optional field, a version appended, and an event removed whole', () => {
    expect(
      frozenVersionChanges(
        base,
        head([
          '      - version: 1',
          '        payload: { noteId: string, title: string, sharedAt: string? }',
          '      - version: 2',
          '        payload: { noteId: string, heading: string }',
        ]),
      ),
    ).toEqual([]);
  });

  it('refuses a field removed, renamed, retyped or required in a merged version, and a merged version gone', () => {
    expect(
      frozenVersionChanges(
        base,
        head(
          ['      - version: 1', '        payload: { noteId: number, heading: string, sharedAt: string }'],
          archived,
        ),
      ),
    ).toEqual([
      'CTX-PUBLISHED-LANGUAGE: conventions/integration-events.yaml: NoteShared version 1 was changed in place: noteId string → number; title (string) removed; heading (string) added, and it is not optional; sharedAt (string) added, and it is not optional; append version 2 instead (only an added optional field may change a merged version)',
    ]);
    expect(
      frozenVersionChanges(base, head(['      - version: 2', '        payload: { noteId: string }'], archived)),
    ).toEqual([
      'CTX-PUBLISHED-LANGUAGE: conventions/integration-events.yaml: NoteShared version 1 was merged and is gone; a version once merged stays in the history',
    ]);
  });

  it('reads the base with git: the file at the merge base, or nothing where the base had none', () => {
    const repository = mkdtempSync(join(tmpdir(), 'published-git-'));
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=spec', '-c', 'user.email=spec@example.com', ...args], {
        cwd: repository,
        encoding: 'utf8',
      });
    try {
      git('init', '-q');
      writeFileSync(join(repository, 'README.md'), 'nothing\n');
      git('add', '-A');
      git('commit', '-q', '-m', 'first');
      expect(publishedLanguageAt('HEAD', repository)).toBeUndefined();
      mkdirSync(join(repository, 'conventions'));
      writeFileSync(join(repository, PUBLISHED_LANGUAGE_FILE), 'events:\n  NoteShared: { publisher: Notes }\n');
      git('add', '-A');
      git('commit', '-q', '-m', 'second');
      expect(publishedLanguageAt('HEAD', repository)?.events.map(event => event.name)).toEqual(['NoteShared']);
      expect(publishedLanguageAt('working', repository)?.events.map(event => event.name)).toEqual(['NoteShared']);
      expect(publishedLanguageAt('HEAD~1', repository)).toBeUndefined();
    } finally {
      rmSync(repository, { recursive: true, force: true });
    }
  });
});
