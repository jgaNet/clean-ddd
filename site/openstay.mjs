/**
 * OpenStay, the larger benchmark, checkpoint by checkpoint: the figures of its three records, copied by hand
 * (the records are prose tables, not grades the collector reads). Each figure names the record it comes from.
 *
 *   docs/evaluations/2026-11-01-openstay-pilot.md   features 1–10
 *   docs/evaluations/2026-11-02-openstay-j3.md      features 11–25
 *   docs/evaluations/2026-11-03-openstay-j4.md      the defect report 25.1 and features 26–50
 */
export const openstay = {
  records: {
    pilot: 'docs/evaluations/2026-11-01-openstay-pilot.md',
    j3: 'docs/evaluations/2026-11-02-openstay-j3.md',
    j4: 'docs/evaluations/2026-11-03-openstay-j4.md',
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
};
