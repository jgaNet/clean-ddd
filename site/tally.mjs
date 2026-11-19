/**
 * J6 on Tally, the three-arms campaign: the figures of its record, copied by hand (the record is prose tables,
 * not grades the collector reads). Each figure names where it comes from.
 *
 *   docs/evaluations/benchmark/three-arms/tally-run-2026-11-17.md   the run, checkpoint by checkpoint, closed on 19 November
 *   docs/evaluations/benchmark/three-arms/registration.md           the hypotheses, the bands and the budgets, before any run
 *   docs/evaluations/benchmark/three-arms/README.md                 the protocol
 *   docs/evaluations/benchmark/three-arms/app/README.md             the kit: the forty requests, the hidden tests, the storms
 */
export const tally = {
  records: {
    run: 'docs/evaluations/benchmark/three-arms/tally-run-2026-11-17.md',
    registration: 'docs/evaluations/benchmark/three-arms/registration.md',
    protocol: 'docs/evaluations/benchmark/three-arms/README.md',
    kit: 'docs/evaluations/benchmark/three-arms/app/README.md',
    brief: 'docs/evaluations/benchmark/three-arms/app/brief.md',
    adr47: 'docs/adr/0047-the-building-blocks-carry-a-database-and-a-restart-is-tested.md',
    trees: 'https://github.com/jgaNet/tally',
  },
  // The run, closed: every tree delivered the forty requests. Costs in dollars; `counted` sets aside the attempts a
  // `revoked` cancelled (a kit defect found after the fact), `inAll` is what was spent. Escalations by request and
  // the model that delivered it; `regressions` the requests whose own earlier tests a delivery broke.
  trees: [
    { tree: 'plain-1', arm: 'S', counted: 16.19, inAll: 22.32, escalations: '18 opus, 23 sonnet', regressions: '–' },
    { tree: 'plain-2', arm: 'S', counted: 19.05, inAll: 20.83, escalations: '18, 23 sonnet', regressions: '–' },
    { tree: 'plain-3', arm: 'S', counted: 21.24, inAll: 21.24, escalations: '23 sonnet', regressions: '–' },
    { tree: 'lite-1', arm: 'L', counted: 30.16, inAll: 38.2, escalations: '17 sonnet', regressions: '–' },
    { tree: 'lite-2', arm: 'L', counted: 29.45, inAll: 29.45, escalations: '30 sonnet', regressions: '30' },
    { tree: 'lite-3', arm: 'L', counted: 36.05, inAll: 38.8, escalations: '18, 24, 33 sonnet', regressions: '18, 33' },
    {
      tree: 'full-1',
      arm: 'F',
      counted: 45.51,
      inAll: 47.3,
      escalations: '1, 24, 30, 35, 40 sonnet',
      regressions: '30',
    },
    { tree: 'full-2', arm: 'F', counted: 31.74, inAll: 31.74, escalations: '17 opus, 33 sonnet', regressions: '–' },
    {
      tree: 'full-3',
      arm: 'F',
      counted: 51.01,
      inAll: 51.55,
      escalations: '1, 35 sonnet; 30, 31 opus',
      regressions: '–',
    },
  ],
  arms: {
    // Per arm: the median cost per delivered request, per tree; the mean cost per request at each checkpoint (every
    // attempt counted); the least-squares slope of cost per request against the request's index, per tree; the
    // escalations and those that reached opus; the requests haiku delivered at the first step, of 120.
    S: {
      perRequest: [0.27, 0.39, 0.23],
      checkpoints: [0.09, 0.27, 0.77, 0.76],
      slopes: [0.018, 0.022, 0.031],
      escalations: [5, 1],
      firstStep: 115,
      source: 7000,
    },
    L: {
      perRequest: [0.6, 0.55, 0.62],
      checkpoints: [0.4, 0.59, 1.15, 1.06],
      slopes: [0.024, 0.019, 0.031],
      escalations: [5, 0],
      firstStep: 115,
      source: [14000, 16000],
      aggregates: [12, 13],
    },
    F: {
      perRequest: [0.7, 0.61, 0.63],
      checkpoints: [0.6, 0.64, 1.4, 1.63],
      slopes: [0.037, 0.021, 0.053],
      escalations: [11, 3],
      firstStep: 109,
      source: 20000,
    },
  },
  // Score 1, the cost of change: the four requests not announced in advance, mean cost per arm, and the steps.
  changes: [
    { n: 10, en: 'the remainder', fr: 'le reste', S: 0.11, L: 0.08, F: 0.03, steps: { S: 0, L: 0, F: 0 } },
    {
      n: 20,
      en: 'leave with a balance',
      fr: 'partir avec un solde',
      S: 0.37,
      L: 0.8,
      F: 0.77,
      steps: { S: 0, L: 0, F: 0 },
    },
    { n: 30, en: 'PostgreSQL', fr: 'PostgreSQL', S: 2.64, L: 3.12, F: 6.09, steps: { S: 0, L: 1, F: 2 } },
    {
      n: 40,
      en: 'currency precision',
      fr: 'la précision monétaire',
      S: 0.56,
      L: 0.8,
      F: 1.23,
      steps: { S: 0, L: 0, F: 1 },
    },
  ],
  // What was spent, what was counted, what the plans allowed.
  usd: { spent: 301.44, counted: 280.41, allowed: 1800 },
  delivered: 360,
  // What the run cost the kit and the harness: dated in the record.
  bench: { kitDefects: 2, restarts: 4, databasesInAnHour: 1600 },
};

/** The median of a list of numbers. */
export const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
