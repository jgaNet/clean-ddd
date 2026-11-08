#!/usr/bin/env node
/**
 * The article, built from site/data.json (node site/collect.mjs writes it from the records):
 *
 *   node site/collect.mjs && node site/build.mjs   → every article of site/articles.mjs, in English and in French
 *
 * The prose is in site/article/<article>/<language>.mjs; this file computes the figures, draws the charts and tables in the
 * language being rendered, and hands them to the prose. `yarn site`, at the root, builds the whole site.
 *
 * The page that presents the project, site/index.html, is built by node site/home.mjs and links here.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { articles } from './articles.mjs';
import * as control from './article/control/index.mjs';
import * as extensions from './article/extensions/index.mjs';
import * as openstay from './article/openstay/index.mjs';
import { ARMS, bars, dotRange, groupedColumns, legend, setLanguage, table } from './charts.mjs';
import { figures, mean, quotes, span as spanIn, verifyQuotes } from './figures.mjs';
import { openstay as O } from './openstay.mjs';
import { page } from './page.mjs';

const here = new URL('.', import.meta.url).pathname;

// The language being rendered: every label, number and amount is formatted for it.
let lang = 'en';
const locale = () => (lang === 'fr' ? 'fr-FR' : 'en-US');
const t = (en, fr) => (lang === 'fr' ? fr : en);
const fix = (value, digits = 1) =>
  Number(value).toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
const usd = value => {
  const text = typeof value === 'number' ? fix(value, 2) : value;
  return lang === 'fr' ? `${text} $` : `$${text}`;
};
const span = values => spanIn(values, locale());
const runName = run => t(run, run.replace('pilot', 'pilote').replace('run', 'essai'));
const experimentName = e =>
  t(
    e.name,
    {
      Backlog: 'Backlog',
      'Backlog, weaker model': 'Backlog, modèle plus faible',
      'Feature 8': 'Fonctionnalité 8',
      'Features 9–13': 'Fonctionnalités 9–13',
      'Move to SQLite': 'Passage à SQLite',
    }[e.name],
  );
const data = JSON.parse(readFileSync(join(here, 'data.json'), 'utf8'));
const repo = 'https://github.com/jgaNet/clean-ddd/blob/main';
const link = (path, text) => `<a href="${repo}/${path}">${text}</a>`;

const { A, P, D, Cp } = data.backlog;
const f8 = data.feature8;
const X = data.extensions;
const sum = (features, from = 0) => features.slice(from).reduce((total, f) => total + f.minutes, 0);
const perFeature = {
  before: arm => sum(X.E3[arm].before, 1) / (X.E3[arm].before.length - 1),
  after: arm => X.E3[arm].minutes / X.E3[arm].features.length,
};
const growth = arm => Math.round((perFeature.after(arm) / perFeature.before(arm) - 1) * 100);
const horizon = () =>
  t(
    ['Comments', 'History', 'Editors', 'Delete account', 'Search'],
    ['Commentaires', 'Historique', 'Éditeurs', 'Suppression de compte', 'Recherche'],
  );
const range = (runs, key, digits = 1) => {
  const values = runs.map(run => run[key]);
  const [low, high] = [fix(Math.min(...values), digits), fix(Math.max(...values), digits)];
  return low === high ? low : `${low}–${high}`;
};
const ratio = (a, b) => fix(mean(a) / mean(b), 1);
const short = () =>
  t(
    ['Accounts & notes', 'Pin', 'Tags', 'Share', 'Notify', 'Plan & quota', 'Remind'],
    ['Comptes & notes', 'Épingler', 'Tags', 'Partager', 'Notifier', 'Plan & quota', 'Rappeler'],
  );
// Each architecture arm's time and cost as a multiple of the plain project's, experiment by experiment (site/figures.mjs).
const { experiments, times, graded, allTimes, allCosts } = figures(data);
verifyQuotes(join(here, '..'));

// OpenStay, checkpoint by checkpoint (site/openstay.mjs, copied from its three records).
const lowHigh = (values, digits = 2) => `${fix(Math.min(...values), digits)}–${fix(Math.max(...values), digits)}`;
// How many times cheaper the simple arm was: the cheapest Clean DDD tree over the dearest simple one, up to the reverse.
const cheaper = c =>
  `${fix(Math.min(...c.cost.clean) / Math.max(...c.cost.simple), 1)}–${fix(Math.max(...c.cost.clean) / Math.min(...c.cost.simple), 1)}`;
const osJ4 = O.checkpoints[2];
const osEscalated = arm => O.checkpoints.reduce((total, c) => total + c.escalated[arm][0], 0);
const osDelivered = arm => O.checkpoints.reduce((total, c) => total + c.escalated[arm][1], 0);

// The reading, harmonized (docs/evaluations/flow/control/reading/README.md).
const reading = {
  rows: [
    ['A', 'pilot', 7, 6],
    ['A', 'run 2', 6, 6],
    ['A', 'run 3', 6, 5],
    ['D', 'run 1', 7, 7],
    ['D', 'run 2', 6, 6],
    ['P', 'run 1', 6, 5],
    ['P', 'run 2', 6, 5],
    ['P', 'run 3', 7, 6],
  ],
  // Files to edit per change probe, mean over each arm's trees.
  probes: {
    A: [3.1, 5, 10.7],
    D: [3, 3, 12],
    P: [2, 2, 5],
  },
};

function render(language) {
  lang = language;
  setLanguage(language);
  const charts = {
    summaryTime: groupedColumns({
      id: 'chart-summary-time',
      title: t(
        'Every experiment: time each architecture arm took, as a multiple of the plain project’s',
        'Chaque expérience : le temps de chaque bras architecture, en multiple de celui du projet nu',
      ),
      unit: t('× P’s time', '× le temps de P'),
      categories: experiments.map(experimentName),
      series: ['A', 'D'].map(arm => ({ arm, values: experiments.map(e => times(e, arm)) })),
    }),
    summaryCost: groupedColumns({
      id: 'chart-summary-cost',
      title: t(
        'Every experiment: reported cost of each architecture arm, as a multiple of the plain project’s',
        'Chaque expérience : le coût déclaré de chaque bras architecture, en multiple de celui du projet nu',
      ),
      unit: t('× P’s cost', '× le coût de P'),
      categories: experiments.map(experimentName),
      series: ['A', 'D'].map(arm => ({ arm, values: experiments.map(e => times(e, arm, 'usd')) })),
    }),
    lead: dotRange({
      id: 'chart-lead',
      title: t(
        'Time to deliver the seven-feature backlog, per run (minutes of agent activity)',
        'Temps pour livrer le backlog de sept fonctionnalités, par essai (minutes d’activité de l’agent)',
      ),
      unit: 'min',
      rows: [
        { arm: 'A', values: A.map(r => ({ label: `A, ${runName(r.run)}`, value: r.minutes })) },
        { arm: 'D', values: D.map(r => ({ label: `D, ${runName(r.run)}`, value: r.minutes })) },
        { arm: 'P', values: P.map(r => ({ label: `P, ${runName(r.run)}`, value: r.minutes })) },
        { arm: 'Cp', values: Cp.map(r => ({ label: `C′, ${runName(r.run)}`, value: r.minutes })) },
      ],
    }),
    cost: dotRange({
      id: 'chart-cost',
      title: t(
        'Reported cost of the seven-feature backlog, per run (US dollars)',
        'Coût déclaré du backlog de sept fonctionnalités, par essai (dollars US)',
      ),
      unit: '',
      prefix: '$',
      digits: 2,
      rows: [
        { arm: 'A', values: A.map(r => ({ label: `A, ${runName(r.run)}`, value: r.usd })) },
        { arm: 'D', values: D.map(r => ({ label: `D, ${runName(r.run)}`, value: r.usd })) },
        { arm: 'P', values: P.map(r => ({ label: `P, ${runName(r.run)}`, value: r.usd })) },
        { arm: 'Cp', values: Cp.map(r => ({ label: `C′, ${runName(r.run)}`, value: r.usd })) },
      ],
    }),
    features: groupedColumns({
      id: 'chart-features',
      title: t(
        'Minutes per feature, mean of each arm’s runs',
        'Minutes par fonctionnalité, moyenne des essais de chaque bras',
      ),
      unit: 'min',
      categories: short(),
      series: ['A', 'D', 'P'].map(arm => ({
        arm,
        values: data.features.map((_, i) => mean(data.backlog[arm].map(run => run.features[i].minutes))),
      })),
    }),
    written: groupedColumns({
      id: 'chart-written',
      title: t(
        'Lines the agent added to deliver the backlog, mean of each arm’s runs',
        'Lignes ajoutées par l’agent pour livrer le backlog, moyenne des essais de chaque bras',
      ),
      unit: t('lines', 'lignes'),
      digits: 0,
      categories: ['Source', 'Tests'],
      series: ['A', 'D', 'P'].map(arm => ({
        arm,
        values: [
          mean(data.backlog[arm].map(run => run.written.added.source)),
          mean(data.backlog[arm].map(run => run.written.added.tests)),
        ],
      })),
    }),
    f8time: bars({
      id: 'chart-f8-time',
      title: t(
        'Feature 8, team spaces across six contexts: active minutes (one run per arm)',
        'Fonctionnalité 8, les espaces d’équipe sur six contextes : minutes actives (un essai par bras)',
      ),
      unit: 'min',
      items: [
        { arm: 'A', value: f8.A.minutes, note: '8/8 tests' },
        { arm: 'Cp', value: f8.Cp.minutes, note: t('8/8 tests, six slices', '8/8 tests, six tranches') },
        { arm: 'D', value: f8.D.minutes, note: '7/8 tests' },
        { arm: 'P', value: f8.P.minutes, note: '8/8 tests' },
      ],
    }),
    f8cost: bars({
      id: 'chart-f8-cost',
      title: t('Feature 8: reported cost (one run per arm)', 'Fonctionnalité 8 : coût déclaré (un essai par bras)'),
      prefix: '$',
      digits: 2,
      items: [
        { arm: 'A', value: f8.A.usd },
        { arm: 'Cp', value: f8.Cp.usd },
        { arm: 'D', value: f8.D.usd },
        { arm: 'P', value: f8.P.usd },
      ],
    }),
    e1time: dotRange({
      id: 'chart-e1-time',
      title: t(
        'E1, a weaker model: time to deliver the seven-feature backlog (minutes), beside the strong model',
        'E1, un modèle plus faible : temps pour livrer le backlog de sept fonctionnalités (minutes), à côté du modèle fort',
      ),
      unit: 'min',
      rows: [
        ...['A', 'D', 'P'].map(arm => ({
          arm,
          label: `${arm}, ${t('weaker model', 'modèle plus faible')}`,
          values: X.E1[arm].map(r => ({
            label: `${arm} ${t('weaker', 'faible')}, ${runName(r.run)} (${r.accepted}/7)`,
            value: r.minutes,
          })),
        })),
        {
          arm: 'A',
          label: t('A, strong model', 'A, modèle fort'),
          values: A.map(r => ({ label: `A ${t('strong', 'fort')}, ${runName(r.run)}`, value: r.minutes })),
        },
        {
          arm: 'P',
          label: t('P, strong model', 'P, modèle fort'),
          values: P.map(r => ({ label: `P ${t('strong', 'fort')}, ${runName(r.run)}`, value: r.minutes })),
        },
      ],
    }),
    e1cost: dotRange({
      id: 'chart-e1-cost',
      title: t(
        'E1, a weaker model: reported cost of the backlog (US dollars)',
        'E1, un modèle plus faible : coût déclaré du backlog (dollars US)',
      ),
      prefix: '$',
      digits: 2,
      rows: ['A', 'D', 'P'].map(arm => ({
        arm,
        label: `${arm}, ${t('weaker model', 'modèle plus faible')}`,
        values: X.E1[arm].map(r => ({ label: `${arm} ${t('weaker', 'faible')}, ${runName(r.run)}`, value: r.usd })),
      })),
    }),
    e2: bars({
      id: 'chart-e2',
      title: t(
        'E2, feature 8: active minutes of one agent with the fan-out’s whole contract (A+)',
        'E2, fonctionnalité 8 : minutes actives d’un seul agent avec tout le contrat de la répartition (A+)',
      ),
      unit: 'min',
      items: [
        {
          arm: 'A',
          label: t('A, request and storm', 'A, demande et storm'),
          value: f8.A.minutes,
          note: t('campaign', 'campagne'),
        },
        ...X.E2.map(r => ({
          arm: 'A',
          label: `A+, ${runName(r.run)}`,
          value: r.minutes,
          note: t('8/8 tests, no regression', '8/8 tests, aucune régression'),
        })),
        {
          arm: 'Cp',
          label: t('C′, six slices', 'C′, six tranches'),
          value: f8.Cp.minutes,
          note: t('campaign', 'campagne'),
        },
      ],
    }),
    e3features: groupedColumns({
      id: 'chart-e3-features',
      title: t(
        'E3, five more features: minutes per feature, one tree per arm',
        'E3, cinq fonctionnalités de plus : minutes par fonctionnalité, un arbre par bras',
      ),
      unit: 'min',
      categories: horizon(),
      series: ['A', 'D', 'P'].map(arm => ({ arm, values: X.E3[arm].features.map(f => f.minutes) })),
    }),
    e3growth: groupedColumns({
      id: 'chart-e3-growth',
      title: t(
        'E3: mean minutes per feature, on the same tree, before and after it grew',
        'E3 : minutes moyennes par fonctionnalité, sur le même arbre, avant et après sa croissance',
      ),
      unit: 'min',
      categories: t(['Features 2–7', 'Features 9–13'], ['Fonctionnalités 2–7', 'Fonctionnalités 9–13']),
      series: ['A', 'D', 'P'].map(arm => ({ arm, values: [perFeature.before(arm), perFeature.after(arm)] })),
    }),
    e4time: dotRange({
      id: 'chart-e4-time',
      title: t(
        'E4, storage moved to SQLite: active minutes, two trees per arm',
        'E4, le stockage passé à SQLite : minutes actives, deux arbres par bras',
      ),
      unit: 'min',
      rows: ['A', 'D', 'P'].map(arm => ({
        arm,
        values: X.E4[arm].map(r => ({ label: `${arm}, ${runName(r.run)}`, value: r.minutes })),
      })),
    }),
    e4lines: bars({
      id: 'chart-e4-lines',
      title: t(
        'E4: source lines the storage change added, per tree',
        'E4 : lignes de source ajoutées par le changement de stockage, par arbre',
      ),
      unit: t('lines', 'lignes'),
      digits: 0,
      items: ['A', 'D', 'P'].flatMap(arm =>
        X.E4[arm].map(r => ({
          arm,
          label: `${arm}, ${runName(r.run)}`,
          value: r.written.added.source,
          note: `${r.written.filesTouched} ${t('files touched', 'fichiers touchés')}`,
        })),
      ),
    }),
    openstayCost: dotRange({
      id: 'chart-openstay-cost',
      title: t(
        'OpenStay: cost per tree at each checkpoint, each agent counted once',
        'OpenStay : coût par arbre à chaque jalon, chaque agent compté une fois',
      ),
      unit: '',
      prefix: '$',
      digits: 2,
      rows: O.checkpoints.flatMap(c => [
        {
          arm: 'P',
          label: `${c.name}, simple`,
          values: c.cost.simple.map((usd, i) => ({ label: `${c.name}, simple-${i + 1}`, value: usd })),
        },
        {
          arm: 'A',
          label: `${c.name}, Clean DDD`,
          values: c.cost.clean.map((usd, i) => ({ label: `${c.name}, clean-${i + 1}`, value: usd })),
        },
      ]),
    }),
    probes: groupedColumns({
      id: 'chart-probes',
      title: t(
        'Files a developer would edit for each change request, mean of each arm’s trees',
        'Fichiers qu’un développeur modifierait pour chaque demande de changement, moyenne des arbres de chaque bras',
      ),
      unit: t('files', 'fichiers'),
      categories: t(
        ['Titles up to 200 chars', 'Case-insensitive tags', 'Email a due reminder'],
        ['Titres jusqu’à 200 caractères', 'Tags insensibles à la casse', 'Rappel échu par e-mail'],
      ),
      series: ['A', 'D', 'P'].map(arm => ({ arm, values: reading.probes[arm] })),
    }),
  };

  const tables = {
    summary: table(
      t('Every experiment, as a multiple of the plain project', 'Chaque expérience, en multiple du projet nu'),
      t(
        ['Experiment', 'A, time', 'D, time', 'A, cost', 'D, cost'],
        ['Expérience', 'A, temps', 'D, temps', 'A, coût', 'D, coût'],
      ),
      experiments.map(e => [
        experimentName(e),
        `${fix(times(e, 'A'), 1)}×`,
        `${fix(times(e, 'D'), 1)}×`,
        `${fix(times(e, 'A', 'usd'), 1)}×`,
        `${fix(times(e, 'D', 'usd'), 1)}×`,
      ]),
    ),
    lead: table(
      t('Backlog runs', 'Les essais du backlog'),
      t(
        ['Arm', 'Run', 'Minutes', 'Cost', 'Features passing'],
        ['Bras', 'Essai', 'Minutes', 'Coût', 'Fonctionnalités réussies'],
      ),
      [...A.map(r => ['A', r]), ...D.map(r => ['D', r]), ...P.map(r => ['P', r]), ...Cp.map(r => ['C′', r])].map(
        ([arm, r]) => [arm, runName(r.run), fix(r.minutes, 1), usd(r.usd), `${r.accepted}/7`],
      ),
    ),
    features: table(
      t('Minutes per feature', 'Minutes par fonctionnalité'),
      t(['Feature', 'A', 'D', 'P'], ['Fonctionnalité', 'A', 'D', 'P']),
      data.features.map((_, i) => [
        short()[i],
        ...['A', 'D', 'P'].map(arm => fix(mean(data.backlog[arm].map(run => run.features[i].minutes)), 1)),
      ]),
    ),
    written: table(
      t('Lines added and test cases', 'Lignes ajoutées et cas de test'),
      t(
        ['Arm', 'Run', 'Source lines', 'Test lines', 'Test cases', 'Files touched'],
        ['Bras', 'Essai', 'Lignes de source', 'Lignes de test', 'Cas de test', 'Fichiers touchés'],
      ),
      [...A.map(r => ['A', r]), ...D.map(r => ['D', r]), ...P.map(r => ['P', r])].map(([arm, r]) => [
        arm,
        runName(r.run),
        r.written.added.source,
        r.written.added.tests,
        r.written.testCases,
        r.written.filesTouched,
      ]),
    ),
    f8: table(
      t('Feature 8', 'Fonctionnalité 8'),
      t(
        ['Arm', 'Minutes', 'Cost', 'Feature 8 tests', 'Features 1–7 afterwards'],
        ['Bras', 'Minutes', 'Coût', 'Tests de la fonctionnalité 8', 'Fonctionnalités 1–7 ensuite'],
      ),
      [
        ['A', fix(f8.A.minutes, 1), usd(f8.A.usd), '8/8', 'no regression'],
        ['C′', fix(f8.Cp.minutes, 1), usd(f8.Cp.usd), '8/8', 'no regression'],
        ['D', fix(f8.D.minutes, 1), usd(f8.D.usd), '7/8', 'no regression'],
        ['P', fix(f8.P.minutes, 1), usd(f8.P.usd), '8/8', 'no regression'],
      ],
    ),
    e1: table(
      t('E1, a weaker model', 'E1, un modèle plus faible'),
      t(
        ['Arm', 'Run', 'Minutes', 'Cost', 'Features passing', 'Import refusals'],
        ['Bras', 'Essai', 'Minutes', 'Coût', 'Fonctionnalités réussies', 'Refus d’import'],
      ),
      ['A', 'D', 'P'].flatMap(arm =>
        X.E1[arm].map(r => [
          arm,
          runName(r.run),
          fix(r.minutes, 1),
          usd(r.usd),
          `${r.accepted}/7`,
          r.drift ? r.drift.refusals : '—',
        ]),
      ),
    ),
    e2: table(
      t('E2, feature 8', 'E2, fonctionnalité 8'),
      t(
        ['Agent', 'Minutes', 'Cost', 'Feature 8 tests', 'Features 1–7 afterwards'],
        ['Agent', 'Minutes', 'Coût', 'Tests de la fonctionnalité 8', 'Fonctionnalités 1–7 ensuite'],
      ),
      [
        [
          t('A, request and storm', 'A, demande et storm'),
          fix(f8.A.minutes, 1),
          usd(f8.A.usd),
          '8/8',
          t('no regression', 'aucune régression'),
        ],
        ...X.E2.map(r => [
          `A+, ${runName(r.run)}`,
          fix(r.minutes, 1),
          usd(r.usd),
          '8/8',
          t('no regression', 'aucune régression'),
        ]),
        [
          t('C′, six slices', 'C′, six tranches'),
          fix(f8.Cp.minutes, 1),
          usd(f8.Cp.usd),
          '8/8',
          t('no regression', 'aucune régression'),
        ],
      ],
    ),
    e3: table(
      t('E3, five more features', 'E3, cinq fonctionnalités de plus'),
      [
        ...t(['Arm', 'Tree'], ['Bras', 'Arbre']),
        ...horizon(),
        ...t(
          ['Per feature, 2–7', 'Per feature, 9–13', 'Cost, 9–13', 'Tests passing'],
          ['Par fonctionnalité, 2–7', 'Par fonctionnalité, 9–13', 'Coût, 9–13', 'Tests réussis'],
        ),
      ],
      ['A', 'D', 'P'].map(arm => [
        arm,
        runName(X.E3[arm].tree),
        ...X.E3[arm].features.map(f => fix(f.minutes, 1)),
        fix(perFeature.before(arm), 1),
        fix(perFeature.after(arm), 1),
        usd(X.E3[arm].usd),
        `${X.E3[arm].accepted}/5`,
      ]),
    ),
    e4: table(
      t('E4, storage in SQLite', 'E4, le stockage dans SQLite'),
      t(
        ['Arm', 'Tree', 'Minutes', 'Cost', 'Hidden test', 'Regressions', 'Source lines added', 'Files touched'],
        [
          'Bras',
          'Arbre',
          'Minutes',
          'Coût',
          'Test caché',
          'Régressions',
          'Lignes de source ajoutées',
          'Fichiers touchés',
        ],
      ),
      ['A', 'D', 'P'].flatMap(arm =>
        X.E4[arm].map(r => [
          arm,
          runName(r.run),
          fix(r.minutes, 1),
          usd(r.usd),
          r.accepted ? t('pass', 'réussi') : t('fail', 'échoué'),
          r.regressions,
          r.written.added.source,
          r.written.filesTouched,
        ]),
      ),
    ),
    probes: table(
      t('Files to edit per change request', 'Fichiers à modifier par demande de changement'),
      t(['Arm', 'Titles', 'Tags', 'Email'], ['Bras', 'Titres', 'Tags', 'E-mail']),
      ['A', 'D', 'P'].map(arm => [arm, ...reading.probes[arm].map(v => fix(v, 1))]),
    ),
  };

  tables.openstay = table(
    t('OpenStay: each checkpoint, by arm', 'OpenStay : chaque jalon, par bras'),
    t(
      [
        'Checkpoint',
        'Features',
        'Above the smallest model, simple',
        'Above the smallest model, Clean DDD',
        'Cost per tree, simple',
        'Cost per tree, Clean DDD',
        'Simple cheaper by',
      ],
      [
        'Jalon',
        'Fonctionnalités',
        'Au-dessus du plus petit modèle, simple',
        'Au-dessus du plus petit modèle, Clean DDD',
        'Coût par arbre, simple',
        'Coût par arbre, Clean DDD',
        'Simple moins cher de',
      ],
    ),
    O.checkpoints.map(c => [
      c.name,
      c.features,
      `${c.escalated.simple[0]} ${t('of', 'sur')} ${c.escalated.simple[1]}`,
      `${c.escalated.clean[0]} ${t('of', 'sur')} ${c.escalated.clean[1]}`,
      usd(lowHigh(c.cost.simple)),
      usd(lowHigh(c.cost.clean)),
      `${cheaper(c)}×`,
    ]),
  );

  tables.openstayJ5 = table(
    t(
      "OpenStay's J5 (provisional): where each tree stopped, the step of each request from 51",
      'J5 d’OpenStay (provisoire) : où chaque arbre s’est arrêté, l’échelon de chaque demande à partir de 51',
    ),
    t(
      ['Tree', 'Steps from 51', 'Delivered', 'Stopped at', 'Cost'],
      ['Arbre', 'Échelons depuis 51', 'Livrées', 'Arrêté à', 'Coût'],
    ),
    O.j5.trees.map(t => [t.tree, `<code>${t.steps}</code>`, t.delivered, t.stopped, usd(t.usd)]),
  );
  tables.openstayFullplus = table(
    t(
      'Full+ (still running): the Clean DDD trees from where each stopped, on a kit that states what J5 found',
      'Full+ (en cours) : les arbres Clean DDD repris là où chacun s’est arrêté, sur un kit qui énonce ce que J5 a trouvé',
    ),
    t(
      ['Tree', 'From', 'Steps', 'Delivered so far', 'Cost so far'],
      ['Arbre', 'Depuis', 'Échelons', 'Livrées à ce jour', 'Coût à ce jour'],
    ),
    O.j5.fullplus.map(t => [t.tree, t.from, `<code>${t.steps}</code>`, t.delivered, usd(t.usd)]),
  );

  const readingRows = reading.rows
    .map(
      ([arm, run, lenient, strict]) =>
        `<tr><td>${ARMS[arm].name}</td><td>${runName(run)}</td><td>${lenient}/7</td><td>${strict}/7</td></tr>`,
    )
    .join('');

  const site = 'https://jganet.github.io/clean-ddd/';
  // The prose of each article, by slug; a new article is a new entry here, in the registry and under site/article/.
  const bodies = {
    'architecture-and-ai-agents': control,
    'where-the-architecture-should-pay': extensions,
    openstay,
  };
  const other =
    language === 'en'
      ? { code: 'FR', lang: 'fr', label: 'Version française' }
      : { code: 'EN', lang: 'en', label: 'English version' };
  const where = {
    en: { home: 'en/', list: 'en/articles.html', listLabel: 'The articles' },
    fr: { home: './', list: 'articles.html', listLabel: 'Les articles' },
  }[language];
  // Each article's file in the language being rendered, by its short name, for the links between them.
  const hrefs = Object.fromEntries(
    [
      ['control', 'architecture-and-ai-agents'],
      ['extensions', 'where-the-architecture-should-pay'],
      ['openstay', 'openstay'],
    ].map(([name, slug]) => [name, articles.find(article => article.slug === slug)[language].file]),
  );
  const shared = {
    A,
    D,
    P,
    Cp,
    f8,
    X,
    O,
    charts,
    tables,
    legend,
    link,
    ratio,
    range,
    span,
    graded,
    quotes,
    allTimes,
    allCosts,
    osEscalated,
    osDelivered,
    cheaper,
    osJ4,
    lowHigh,
    growth,
    readingRows,
    fix,
    usd,
    hrefs,
    ...where,
  };
  for (const meta of articles) {
    const { file, title, description } = meta[language];
    const body = bodies[meta.slug][language];
    const ctx = { ...shared, other: { ...other, href: meta[other.lang].file } };
    writeFileSync(
      join(here, file),
      page({
        lang: language,
        title,
        description,
        url: `${site}${file}`,
        alternates: { en: `${site}${meta.en.file}`, fr: `${site}${meta.fr.file}` },
        body: body(ctx),
      }),
    );
    process.stdout.write(`site/${file} written\n`);
  }
}

render('en');
render('fr');
