import { readdirSync } from 'fs';

import {
  adviseStrategy,
  describeStrategy,
  loadArchitectureContract,
  loadDomainMap,
  loadExpectedStorm,
  repositoryRoot,
} from './index';

/**
 * One agent or a fan-out by context (RFC 0001, phase 6): the rule must give back what phase 4
 * measured on the storms it measured — one agent on every feature of the backlog, the fan-out
 * sooner on team spaces and only when its time matters more than its cost.
 */

const root = repositoryRoot();
const contract = loadArchitectureContract(root);
const map = loadDomainMap(root);
const backlog = 'docs/evaluations/benchmark/storms';
const teamSpaces = 'docs/evaluations/benchmark/feature-8/storms/team-spaces.yaml';
const storm = (file: string) => loadExpectedStorm(file, root);

describe('clean-ddd strategy', () => {
  it('chooses what the campaign measured', () => {
    for (const file of readdirSync(`${root}/${backlog}`)) {
      const advice = adviseStrategy(storm(`${backlog}/${file}`), contract, map, { priority: 'time' });
      expect([file, advice.strategy]).toEqual([file, 'one-agent']);
    }
    const advice = adviseStrategy(storm(teamSpaces), contract, map, { priority: 'time' });
    expect(advice.strategy).toBe('fan-out-by-context');
    // Measured: 23.8 minutes for one agent, 16.3 for the fan-out without its intervention.
    expect(Math.abs(advice.estimate.oneAgent - 23.8)).toBeLessThan(1);
    expect(Math.abs(advice.estimate.fanOut! - 16.3)).toBeLessThan(1);
  });

  it('keeps one agent when the cost comes first, and says when the fan-out would be sooner', () => {
    const advice = adviseStrategy(storm(teamSpaces), contract, map);
    expect(advice.inputs.priority).toBe('cost');
    expect(advice.strategy).toBe('one-agent');
    expect(advice.reasons.join('\n')).toContain('--priority time');
  });

  it('counts a person’s contract stage against the fan-out', () => {
    const advice = adviseStrategy(storm(teamSpaces), contract, map, { priority: 'time', contractMinutes: 20 });
    expect(advice.strategy).toBe('one-agent');
    expect(advice.estimate.breakEven).toBe(45);
  });

  it('has nothing to split in one context', () => {
    const advice = adviseStrategy(storm(`${backlog}/pin-a-note.yaml`), contract, map, { priority: 'time' });
    expect(advice.strategy).toBe('one-agent');
    expect(advice.estimate.fanOut).toBeUndefined();
    expect(advice.reasons[0]).toContain('one context, Notes');
  });

  it('names the architecture task the storm needs first, from the binding and the map', () => {
    const advice = adviseStrategy(storm(`${backlog}/notify-on-archive.yaml`), contract, map);
    // The reference declares both contexts and relates them already.
    expect(advice.inputs.prerequisites).toEqual({ contexts: [], relationships: [] });
    const spaces = adviseStrategy(storm(teamSpaces), contract, map);
    expect(spaces.inputs.prerequisites.contexts).toEqual(expect.arrayContaining(['Teams', 'Search', 'Audit']));
    expect(spaces.inputs.prerequisites.relationships).toContain('Teams → Notes (owned-port)');
    expect(describeStrategy(spaces)).toContain('First, alone: an architecture task');
  });
});
