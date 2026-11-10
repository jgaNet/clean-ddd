/**
 * OpenStay, the larger benchmark, checkpoint by checkpoint: the figures of its three records, copied by hand
 * (the records are prose tables, not grades the collector reads). Each figure names the record it comes from.
 *
 *   docs/evaluations/2026-11-01-openstay-pilot.md   features 1–10
 *   docs/evaluations/2026-11-02-openstay-j3.md      features 11–25
 *   docs/evaluations/2026-11-03-openstay-j4.md      the defect report 25.1 and features 26–50
 *   docs/evaluations/2026-11-08-openstay-j5.md      features 51–100 (closed on what is known, 10 November)
 */
export const openstay = {
  records: {
    pilot: 'docs/evaluations/2026-11-01-openstay-pilot.md',
    j3: 'docs/evaluations/2026-11-02-openstay-j3.md',
    j4: 'docs/evaluations/2026-11-03-openstay-j4.md',
    j5: 'docs/evaluations/2026-11-08-openstay-j5.md',
    protocol: 'docs/evaluations/benchmark/openstay/README.md',
    brief: 'docs/evaluations/benchmark/openstay/brief.md',
  },
  checkpoints: [
    {
      name: 'Pilot',
      features: '1–10',
      // Deliveries above the smallest model that reproduced, of the features each arm delivered.
      escalated: { simple: [0, 30], clean: [1, 30] },
      hidden: 'all 30 per arm when delivered; 79 of 80 files at the second grading (a notice lost under a crash)',
      // Each agent counted once, in dollars, one figure per tree.
      cost: { simple: [1.39, 1.82, 1.07], clean: [7.18, 6.42, 8.19] },
    },
    {
      name: 'J3',
      features: '11–25',
      escalated: { simple: [0, 45], clean: [1, 45] },
      hidden: '150 of 150 at the second grading',
      // clean-1 counted once, as J4's record corrects it ($9.65, where J3's record says $10.10).
      cost: { simple: [6.84, 4.46, 3.47], clean: [9.65, 10.31, 12.33] },
    },
    {
      name: 'J4',
      features: '25.1, 26–50',
      escalated: { simple: [0, 75], clean: [6, 77] },
      hidden: '306 of 306 at the second grading',
      cost: { simple: [17.39, 12.16, 14.58], clean: [26.84, 42.5, 44.85] },
    },
  ],
  // J4: the storage change not announced in advance (request 40), per tree.
  postgres: {
    simple: { files: [86, 93, 91], ruleFiles: [22, 19, 21], usd: [2.59, 1.31, 5.78] },
    clean: { files: [129, 115, 126], ruleFiles: [0, 1, 1], usd: [2.72, 3.31, 10.24] },
  },
  // J4: source lines at the end, per arm (range of the three trees).
  source: { simple: [8264, 9213], clean: [26821, 28890] },

  // J5, from its record: where each tree stopped, the step of each request from 51 ('F' the triaged
  // failure), and its cost with the kit's failures set apart.
  j5: {
    trees: [
      {
        tree: 'simple-1',
        steps: '0000000000000000000001F',
        delivered: '51–72',
        stopped: '73 transfer proof',
        usd: 15.66,
      },
      { tree: 'simple-2', steps: '000000001001000F', delivered: '51–65', stopped: '66 suspending accounts', usd: 12.5 },
      {
        tree: 'simple-3',
        steps: '0000000000100002000000F',
        delivered: '51–72',
        stopped: '73 transfer proof',
        usd: 20.8,
      },
      { tree: 'clean-1', steps: '0000000000010F', delivered: '51–63', stopped: '64 moderation queue', usd: 21.43 },
      { tree: 'clean-2', steps: 'F', delivered: 'none', stopped: '51 conversations', usd: 8.06 },
      { tree: 'clean-3', steps: '0000000000000F', delivered: '51–63', stopped: '64 moderation queue', usd: 21.77 },
    ],
    // Full+, the Clean DDD trees from where each stopped, on the kit that says what J5 found. The steps and costs
    // after 8 November were in the lost logs; only the deliveries and the stops are known. `stepsTo` is the span
    // the steps cover where it is not the whole delivery; `stopped: null` is a tree last seen at `lastSeen`;
    // `usdAt` is a cost known at a later request, from the session's notes.
    fullplus: [
      {
        tree: 'clean-1',
        from: 64,
        steps: '2100000000',
        stepsTo: '64–73',
        delivered: '64–79 (16)',
        stopped: '80 donations',
        usd: 38.01,
      },
      {
        tree: 'clean-2',
        from: 51,
        steps: '0000000001F',
        delivered: '51–60 (10)',
        stopped: '61 review rules',
        usd: 21.38,
      },
      {
        tree: 'clean-3',
        from: 64,
        steps: '120100000000',
        stepsTo: '64–75',
        delivered: '64–85 (22)',
        stopped: null,
        lastSeen: 86,
        usd: 32.38,
        usdAt: [66.93, 85],
      },
    ],
    // Two developers on request 64, delivered of two runs per arm.
    twoDevelopers: { old: [0, 2], fullplus: [0, 2], integrator: [2, 2] },
  },
};
