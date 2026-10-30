import type { ArchitectureContract } from './types';
import type { DomainMap } from './domain';
import type { ExpectedStorm } from './storms';

/**
 * How to staff a feature with agents (RFC 0001, phase 6): one agent, or one agent per bounded
 * context against a frozen contract, integrated by one writer — chosen from what the storm says
 * the feature is, and from whether its time matters more than its cost.
 *
 * It decides nothing and runs nothing: it reads the storm, the binding and the context map, and
 * says what the measurements so far recommend, with its inputs, so a driver can log the choice
 * beside the run it made. The model is the one phase 4 measured, and it is coarse: a feature's
 * size is the count of its commands, queries and policies, and the minutes below are the ones
 * that reproduce every verdict of the campaign (the clean-ddd reference's
 * `docs/evaluations/2026-10-30-flow-phase-4-campaign.md`):
 *
 * - one agent took about START + PER_STICKY × the feature's stickies: 2–5 minutes for a
 *   two-sticky feature, 24 for the 44 of team spaces;
 * - the fan-out took the contract, then its longest slice — a fresh agent, START + PER_STICKY ×
 *   its context's stickies — then the integration;
 * - the fan-out always cost more, 1.35 to 1.74 times one agent, because each slice is a fresh
 *   agent that reads before it writes, where one agent keeps its context cached.
 *
 * So the fan-out can only win on time, and only when the stickies outside the largest context
 * outweigh the contract and the integration. A strategy nobody has measured is named as such.
 */

export type Priority = 'cost' | 'time';
export type StrategyName = 'one-agent' | 'fan-out-by-context';

/** The minutes and ratios phase 4 measured; change them with the record that measures new ones. */
export const CALIBRATION = {
  /** A fresh agent's minutes before its first sticky: reading the guide or the pack, the gate at the end. */
  startMinutes: 2.5,
  /** One command, query or policy, written and held by the gate. */
  minutesPerSticky: 0.5,
  /** The single writer: the slices' patches applied, the contract marked carried, the gate and the acceptance test. */
  integrationMinutes: 2.5,
  /** The contract stage per context touched, by an agent playing the person; a person is slower. */
  contractMinutesPerContext: 0.6,
  /** The fan-out's cost over one agent's, lowest and highest measured. */
  fanOutCostRatio: [1.35, 1.74] as const,
  record: 'docs/evaluations/2026-10-30-flow-phase-4-campaign.md',
};

export interface StrategyContext {
  id: string;
  /** Not declared in the binding yet: an architecture task declares it first. */
  new: boolean;
  /** Its commands, queries and policies in the storm. */
  stickies: number;
}

export interface StrategyAdvice {
  feature: string;
  storm: string;
  strategy: StrategyName;
  inputs: {
    contexts: StrategyContext[];
    stickies: number;
    largest: StrategyContext;
    priority: Priority;
    contractMinutes: number;
    contractMinutesGiven: boolean;
    /** What an architecture task does first and alone, whichever strategy runs the feature. */
    prerequisites: { contexts: string[]; relationships: string[] };
  };
  /** Minutes, from the calibration; the fan-out's is absent when there is nothing to split. */
  estimate: {
    oneAgent: number;
    fanOut?: number;
    fanOutCostRatio: readonly [number, number];
    /** The stickies outside the largest context above which the fan-out is sooner. */
    breakEven?: number;
  };
  reasons: string[];
  /** Strategies the measurements do not cover yet, with what is predicted of them. */
  notMeasured: string[];
}

const round = (minutes: number) => Math.round(minutes * 10) / 10;

export function adviseStrategy(
  storm: ExpectedStorm,
  contract: ArchitectureContract,
  map: DomainMap | undefined,
  options: { priority?: Priority; contractMinutes?: number } = {},
): StrategyAdvice {
  const { startMinutes, minutesPerSticky, integrationMinutes, contractMinutesPerContext, fanOutCostRatio } =
    CALIBRATION;
  const priority = options.priority ?? 'cost';
  const contexts: StrategyContext[] = storm.contexts.map(context => ({
    id: context.id,
    new: !contract.contexts.includes(context.id),
    stickies: context.commands.length + context.queries.length + context.policies.length,
  }));
  const stickies = contexts.reduce((sum, context) => sum + context.stickies, 0);
  const largest = contexts.reduce((a, b) => (b.stickies > a.stickies ? b : a));
  const contractMinutesGiven = options.contractMinutes !== undefined;
  const contractMinutes = options.contractMinutes ?? round(contractMinutesPerContext * contexts.length);
  const relates = (link: ExpectedStorm['links'][number]) =>
    map?.relationships.some(
      relationship =>
        relationship.upstream === link.upstream &&
        relationship.downstream === link.downstream &&
        relationship.mechanism === link.mechanism,
    ) ?? false;
  const prerequisites = {
    contexts: contexts.filter(context => context.new).map(context => context.id),
    relationships: storm.links
      .filter(link => !relates(link))
      .map(link => `${link.upstream} → ${link.downstream} (${link.mechanism})`),
  };

  const oneAgent = round(startMinutes + minutesPerSticky * stickies);
  const split = contexts.length > 1;
  const fanOut = split
    ? round(contractMinutes + startMinutes + minutesPerSticky * largest.stickies + integrationMinutes)
    : undefined;
  // Sooner when PER_STICKY × (stickies − largest) > contract + integration.
  const breakEven = split ? round((contractMinutes + integrationMinutes) / minutesPerSticky) : undefined;
  const outside = stickies - largest.stickies;
  const sooner = fanOut !== undefined && fanOut < oneAgent;

  const reasons: string[] = [];
  let strategy: StrategyName = 'one-agent';
  if (!split) {
    reasons.push(`The feature touches one context, ${largest.id}: there is nothing to split by context.`);
  } else if (priority === 'cost') {
    reasons.push(
      `Cost comes first: the fan-out cost ${fanOutCostRatio[0]} to ${fanOutCostRatio[1]} times one agent in every measured run, since each slice is a fresh agent that reads before it writes.`,
    );
    if (sooner) {
      reasons.push(
        `It would be sooner here (about ${fanOut} minutes against ${oneAgent}): ask with --priority time if the time matters more than the cost.`,
      );
    }
  } else if (sooner) {
    strategy = 'fan-out-by-context';
    reasons.push(
      `${outside} stickies lie outside the largest context (${largest.id}, ${largest.stickies}); above ${breakEven}, the slices written at once save more than the contract and the integration cost.`,
      `Expect about ${fanOut} minutes against ${oneAgent}, at ${fanOutCostRatio[0]} to ${fanOutCostRatio[1]} times the cost.`,
    );
  } else {
    reasons.push(
      `Only ${outside} stickies lie outside the largest context (${largest.id}, ${largest.stickies}); below ${breakEven}, the contract and the integration cost more than the slices written at once save.`,
    );
  }
  if (split && !contractMinutesGiven) {
    reasons.push(
      `The contract stage is counted at ${contractMinutes} minutes, what an agent playing the person took; pass --contract-minutes with a person's own time, which moves the break-even (two stickies per minute).`,
    );
  }
  if (prerequisites.contexts.length || prerequisites.relationships.length) {
    reasons.push(
      'An architecture task runs first and alone in either strategy: it declares what the storm needs and the binding or the map does not have yet.',
    );
  }

  return {
    feature: storm.feature,
    storm: storm.source,
    strategy,
    inputs: { contexts, stickies, largest, priority, contractMinutes, contractMinutesGiven, prerequisites },
    estimate: { oneAgent, ...(fanOut !== undefined ? { fanOut, breakEven } : {}), fanOutCostRatio },
    reasons,
    notMeasured: [
      'By layer (Domain and Application, then the adapters): predicted slower than by context — the Domain is the longest slice and its skeleton must be frozen before the adapters start — and possibly better placed, since an adapter-only agent cannot hide a rule of the Domain.',
      'Features in parallel (RFC phase 5): features whose contexts are disjoint need no contract between them; predicted the largest saving on a backlog, not measured.',
    ],
  };
}

export function describeStrategy(advice: StrategyAdvice): string {
  const { inputs, estimate } = advice;
  const context = (c: StrategyContext) => `${c.id} (${c.new ? 'new, ' : ''}${c.stickies})`;
  const { contexts, relationships } = inputs.prerequisites;
  return [
    `${advice.feature}: ${advice.strategy === 'one-agent' ? 'one agent' : 'a fan-out by context'}`,
    '',
    `Contexts: ${inputs.contexts.map(context).join(', ')} — ${inputs.stickies} stickies, priority ${inputs.priority}`,
    ...(contexts.length || relationships.length
      ? [
          'First, alone: an architecture task that declares',
          ...contexts.map(id => `  the context ${id}`),
          ...relationships.map(pair => `  the relationship ${pair}`),
        ]
      : []),
    `Estimate: one agent about ${estimate.oneAgent} min${
      estimate.fanOut !== undefined
        ? `; fan-out about ${estimate.fanOut} min (contract ${inputs.contractMinutes}), at ${estimate.fanOutCostRatio[0]}–${estimate.fanOutCostRatio[1]}× the cost`
        : ''
    }`,
    '',
    ...advice.reasons,
    '',
    'Not measured yet:',
    ...advice.notMeasured.map(line => `  ${line}`),
    '',
    `Calibrated on the clean-ddd reference's ${CALIBRATION.record}; coarse — a sticky is a command, a query or a policy.`,
  ].join('\n');
}
