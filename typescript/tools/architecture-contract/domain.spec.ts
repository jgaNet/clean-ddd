import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { loadArchitectureContract, repositoryRoot } from './load';
import {
  checkDomainAgainstLinks,
  inspectContextLinks,
  loadDomainMap,
  loadStrategicConcepts,
  renderDomain,
  validateDomainMap,
} from './domain';
import type { DomainMap } from './domain';

/**
 * The domain map is held to the bindings and to the code: these specs pin what the check refuses
 * and what the documents render, on the repository's own map. A map in another repository is a
 * fixture built from this one.
 */

const root = repositoryRoot();
const contract = loadArchitectureContract(root);
const contracts = contract.languages.map(language => loadArchitectureContract(root, language));
const map = loadDomainMap(root)!;
const links = inspectContextLinks(contract, root);

const clone = (): DomainMap => JSON.parse(JSON.stringify(map));

describe('the domain map', () => {
  it('loads the subdomains, the contexts and the context map', () => {
    expect(map.schemaVersion).toBe(1);
    expect(map.subdomains.map(subdomain => subdomain.kind)).toEqual(['core', 'generic', 'supporting', 'generic']);
    expect(map.contexts.map(context => context.id)).toEqual(['Notes', 'Security', 'Notifications', 'Tracker']);
    expect(map.relationships).toHaveLength(4);
  });

  it('is absent in a repository that has not described its domain yet', () => {
    expect(loadDomainMap(mkdtempSync(join(tmpdir(), 'domain-')))).toBeUndefined();
  });

  it('is sound against every binding', () => {
    expect(validateDomainMap(map, contracts, root)).toEqual([]);
  });

  it('refuses a context a binding does not declare, and one left out of a subdomain', () => {
    const wrong = clone();
    wrong.contexts.push({ id: 'Billing', purpose: 'plans', language: [] });
    const problems = validateDomainMap(wrong, contracts, root);
    expect(problems).toContainEqual(
      expect.stringContaining('describes the context Billing, which conventions/typescript.yaml does not declare'),
    );
    expect(problems).toContainEqual(expect.stringContaining('the context Billing is in no subdomain'));
  });

  it('refuses a pattern the mechanism cannot carry, and a mechanism that is not a contract', () => {
    const wrong = clone();
    wrong.relationships[0].patterns = ['customer-supplier'];
    wrong.relationships[3].mechanism = 'shared-database' as never;
    const problems = validateDomainMap(wrong, contracts, root);
    expect(problems).toContainEqual(expect.stringContaining('an integration-event cannot carry "customer-supplier"'));
    expect(problems).toContainEqual(expect.stringContaining('mechanism must be integration-event or owned-port'));
  });
});

describe('the code behind the map', () => {
  it('finds every relationship the TypeScript tree carries, with its contracts', () => {
    expect(links).toContainEqual(
      expect.objectContaining({
        mechanism: 'integration-event',
        upstream: 'Notes',
        downstream: 'Notifications',
        contracts: ['NoteShared'],
      }),
    );
    expect(links).toContainEqual(
      expect.objectContaining({
        mechanism: 'integration-event',
        upstream: 'Security',
        downstream: 'Notifications',
        contracts: expect.arrayContaining(['AccountCreated', 'AccountValidated']),
      }),
    );
    expect(links).toContainEqual(
      expect.objectContaining({
        mechanism: 'integration-event',
        upstream: 'Tracker',
        downstream: 'Notifications',
        contracts: ['OperationComplete'],
      }),
    );
    expect(links).toContainEqual(
      expect.objectContaining({
        mechanism: 'owned-port',
        upstream: 'Security',
        downstream: 'Notes',
        contracts: ['AccountDirectory'],
      }),
    );
    expect(links.every(link => link.evidence.length > 0)).toBe(true);
  });

  it('matches the map both ways', () => {
    expect(checkDomainAgainstLinks(map, links, 'TypeScript')).toEqual([]);
  });

  it('refuses a link the map does not declare, and a relationship the code does not carry', () => {
    const wrong = clone();
    const [dropped] = wrong.relationships.splice(0, 1);
    wrong.relationships.push({
      ...dropped,
      upstream: 'Notifications',
      downstream: 'Tracker',
      mechanism: 'owned-port',
      patterns: ['conformist'],
    });
    const problems = checkDomainAgainstLinks(wrong, links, 'TypeScript');
    expect(problems).toContainEqual(
      expect.stringContaining(
        'makes Notifications depend on Notes over an integration-event (NoteShared), a relationship conventions/domain.yaml does not declare',
      ),
    );
    expect(problems).toContainEqual(
      expect.stringContaining(
        'declares Notifications → Tracker over an owned-port, which nothing in the TypeScript code carries',
      ),
    );
  });
});

describe('the rendered map', () => {
  const rendered = renderDomain(map, links, loadStrategicConcepts(root));

  it('draws the context map with the contracts the code carries', () => {
    expect(rendered).toContain('```mermaid');
    expect(rendered).toContain('Notes -- "published language → anti corruption layer: NoteShared" --> Notifications');
    expect(rendered).toContain(
      '| Security | Notes | customer supplier, anti corruption layer | owned port | `AccountDirectory` |',
    );
  });

  it('shows each context with its language, and where each strategic concept is', () => {
    expect(rendered).toContain('<summary><b>Notifications</b> (Communication)');
    expect(rendered).toContain('| Delivery attempt |');
    expect(rendered).toContain('#### Strategic design, where it is here');
    expect(rendered).toContain('| Bounded context |');
  });
});
