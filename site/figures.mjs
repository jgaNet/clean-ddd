/**
 * The figures both pages share, computed once from site/data.json: each architecture arm's time
 * and cost as a multiple of the plain project's, experiment by experiment, and how many runs
 * were graded. The article (build.mjs) quotes them with every other number; the home page
 * (home.mjs) quotes only these.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

/**
 * The figures a record states in prose and no log carries, each with the sentence it comes from:
 * `verifyQuotes()` reads every record and refuses a quote whose sentence is no longer there, so a
 * figure the records stop supporting cannot stay on a page unnoticed.
 */
export const quotes = {
  sqliteDomainFiles: {
    value: 0,
    record: 'docs/evaluations/2026-10-30-flow-extensions.md',
    says: "No architecture run touched a context's Domain or Application.",
  },
};

export function verifyQuotes(root) {
  for (const [name, quote] of Object.entries(quotes)) {
    const record = readFileSync(join(root, quote.record), 'utf8');
    if (!record.includes(quote.says)) {
      throw new Error(
        `${name}: ${quote.record} no longer says "${quote.says}"; the figure ${quote.value} has no source`,
      );
    }
  }
}

/** The import drift of the prose-only tree, measured after the backlog and five features later. */
export const drift = data => [data.backlog.D[1].drift.refusals, data.extensions.E3.D.drift.refusals];
