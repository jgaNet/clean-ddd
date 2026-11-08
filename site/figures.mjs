/**
 * The figures both pages share, computed once from site/data.json: each architecture arm's time
 * and cost as a multiple of the plain project's, experiment by experiment, and how many runs
 * were graded. The article (build.mjs) quotes them with every other number; the home page
 * (home.mjs) quotes only these.
 */
export const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
export const span = values => `${Math.min(...values).toFixed(1)}–${Math.max(...values).toFixed(1)}`;

export function figures(data) {
  const { A, P, D } = data.backlog;
  const f8 = data.feature8;
  const X = data.extensions;
  const experiments = [
    { name: 'Backlog', runs: { A, D, P } },
    { name: 'Backlog, weaker model', runs: X.E1 },
    { name: 'Feature 8', runs: { A: [f8.A], D: [f8.D], P: [f8.P] } },
    { name: 'Features 9–13', runs: { A: [X.E3.A], D: [X.E3.D], P: [X.E3.P] } },
    { name: 'Move to SQLite', runs: X.E4 },
  ];
  const times = (e, arm, key = 'minutes') => mean(e.runs[arm].map(r => r[key])) / mean(e.runs.P.map(r => r[key]));
  const graded = 11 + 4 + [X.E1.A, X.E1.D, X.E1.P, X.E2, X.E4.A, X.E4.D, X.E4.P].flat().length + 3;
  const allTimes = experiments.flatMap(e => ['A', 'D'].map(arm => times(e, arm)));
  const allCosts = experiments.flatMap(e => ['A', 'D'].map(arm => times(e, arm, 'usd')));
  return { experiments, times, graded, allTimes, allCosts };
}
