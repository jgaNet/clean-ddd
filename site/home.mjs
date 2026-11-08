#!/usr/bin/env node
/**
 * The page that presents the project, site/index.html, in French and in English, in the visual codes of exostic.com: dark
 * ground, Inter, the orange → pink → violet gradient, pill buttons, translucent panels. The
 * articles are pages of their own (node site/build.mjs), listed by the articles page this file also writes
 * (site/articles.html, site/en/articles.html) from site/articles.mjs.
 *
 *   node site/home.mjs   → site/index.html, site/articles.html (French); site/en/index.html, site/en/articles.html (English)   (yarn site, at the root, builds the whole site)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { articles, day } from './articles.mjs';
import { drift, figures, quotes, span, verifyQuotes } from './figures.mjs';

const here = new URL('.', import.meta.url).pathname;
const data = JSON.parse(readFileSync(join(here, 'data.json'), 'utf8'));
const { graded, allTimes, allCosts } = figures(data);
verifyQuotes(join(here, '..'));
const [driftBefore, driftAfter] = drift(data);

const repo = 'https://github.com/jgaNet/clean-ddd';
const blob = path => `${repo}/blob/main/${path}`;
// The year the site was published; a clock here would make the built page differ from one day to the next.
const year = 2026;

// Icons: one path each, drawn on a 24-unit grid, stroked with the current colour.
const icon = {
  cube: 'M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Zm0 0v18M4 7.5l8 4.5 8-4.5',
  layers: 'm12 4 8 4-8 4-8-4 8-4Zm-8 8 8 4 8-4M4 16l8 4 8-4',
  bolt: 'M13 3 5 14h6l-1 7 9-12h-6l1-6Z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  shield: 'M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Zm-3 9 2 2 4-4',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2',
  tag: 'M4 4h7l9 9-7 7-9-9V4Zm4 3.5h.01',
  doc: 'M7 3h7l5 5v13H7V3Zm7 0v5h5M10 13h6M10 17h6',
  branch: 'M7 4v12M7 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM17 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 4c0 4-10 4-10 8',
  arrows: 'M4 8h13m0 0-3-3m3 3-3 3M20 16H7m0 0 3-3m-3 3 3 3',
  check: 'm5 12 5 5L20 7',
  terminal: 'M4 5h16v14H4V5Zm3 4 3 3-3 3m5 0h5',
  map: 'M3 6 9 4l6 2 6-2v14l-6 2-6-2-6 2V6Zm6-2v14m6-12v14',
  people: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20a5 5 0 0 1 10 0m-2 0a5 5 0 0 1 10 0',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c-3 3-3 15 0 18m0-18c3 3 3 15 0 18M3 12h18',
  storm: 'M6 16a4 4 0 0 1 .5-8 6 6 0 0 1 11.5 1.5 3.5 3.5 0 0 1 .5 6.5H6Zm7-3-2 5h3l-2 5',
};
const svg = (name, cls = 'icon') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icon[name]}"/></svg>`;

const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// A terminal panel: the prompt lines in the accent colour, the rest as the CLI printed it.
const terminal = (title, lines) => `<div class="terminal" role="img" aria-label="${title}" lang="en">
<div class="terminal-bar"><span></span><span></span><span></span><em>${title}</em></div>
<pre>${lines
  .map(line => (line.startsWith('$ ') ? `<b>$</b> <i>${escape(line.slice(2))}</i>` : escape(line)))
  .join('\n')}</pre>
</div>`;

// Every word the page says, in each of its languages; the CLI's output in the terminal panels stays as printed.
const locales = {
  fr: {
    lang: 'fr',
    locale: 'fr-FR',
    path: '',
    other: { code: 'EN', path: 'en/', label: 'English version', lang: 'en' },
    article: 'article.fr.html',
    articles: 'articles.html',
    list: {
      title: 'Les articles',
      description: 'Ce que les expériences de clean-ddd ont trouvé, article par article : le titre, l’auteur, la date.',
      tagline: 'Articles',
      sub: 'Chaque article lit ses chiffres dans les registres du dépôt ; une correction est une issue, une mise à jour une nouvelle date.',
      by: 'par',
      published: 'publié le',
      updated: 'mis à jour le',
      read: 'Lire l’article',
      only: 'en anglais seulement',
    },
    title: 'CLEAN-DDD — Clean Architecture & DDD, une implémentation de référence',
    description:
      'Une implémentation de référence de la Clean Architecture et du Domain-Driven Design, écrite pour être lue, en TypeScript, Rust, Python et Go, depuis une seule architecture qui est de la donnée et que l’outillage fait respecter ; puis mesurée avec des agents de code IA.',
    ogDescription:
      'Une architecture que l’outillage fait respecter, en quatre langages, mesurée avec des agents IA : elle ne rend pas un agent plus rapide, elle l’empêche de dériver.',
    ogImage: 'open-graph.png',
    home: 'CLEAN-DDD, accueil',
    menu: 'Ouvrir le menu',
    navLabel: 'Navigation principale',
    nav: {
      what: 'Le projet',
      measured: 'Mesures',
      concepts: 'Concepts',
      tooling: 'Outillage',
      languages: 'Langages',
      articles: 'Articles',
    },
    hero: {
      tagline: 'Clean Architecture &amp; DDD · TypeScript · Rust · Python · Go',
      title: 'Une architecture que l’outillage fait respecter, <br>mesurée avec des agents IA',
      text: 'Une implémentation de référence, écrite pour être lue, dont les règles sont de la donnée. Verdict mesuré : elle ne rend pas un agent plus rapide ; elle l’empêche de dériver.',
      read: 'Lire les articles',
      code: 'Voir le code',
      proofLabel: 'En chiffres',
      proof: [
        'exécutions d’agents notées',
        'le temps du projet nu',
        'fichier du domaine touché par un changement de base',
        'violations d’import sans l’outillage, aucune avec',
      ],
    },
    what: {
      tagline: 'Le projet',
      title: 'Une architecture, quatre langages, zéro convention tacite',
      pillars: [
        [
          'cube',
          'Une petite application, lisible',
          'Des notes partagées, des comptes, des notifications, le suivi de chaque opération. Chaque concept DDD et Clean Architecture y apparaît exactement une fois.',
        ],
        [
          'layers',
          'Une architecture qui est de la donnée',
          'Les couches, qui importe qui, chaque règle sous un identifiant stable : un contrat YAML dont sont générés le linter et les vérifications. Une frontière qui cède quand ça arrange n’en est pas une.',
        ],
        [
          'globe',
          'Quatre langages, une seule API',
          'TypeScript, Rust, Python et Go, chacun avec sa chaîne d’outils. Un même scénario boîte noire passe sur les quatre serveurs ; un même inventaire les tient égaux.',
        ],
      ],
    },
    measured: {
      tagline: 'Mesures',
      title: 'Ce que ça coûte, ce que ça apporte',
      sub: 'Deux benchmarks ont fait construire la même application par des agents, avec et sans l’architecture, face à des tests cachés. Le résultat est écrit tel quel.',
      costTitle: 'Ça coûte : du temps et de l’argent.',
      cost: (time, cost) =>
        `Dans chaque expérience, le projet nu a livré autant, pour ${time} fois moins de temps et ${cost} fois moins cher. Un modèle plus faible n’a pas été aidé non plus.`,
      buysTitle: 'Ça apporte : une structure qui tient.',
      buys: 'Les changements restent dans leur couche, les contextes restent séparés, l’argent n’est pas payé deux fois, et plusieurs agents travaillent sur une même base de code sans conflit.',
      note: article =>
        `Un garde-fou et un coordinateur pour les agents, pas un accélérateur. <a href="${article}">L’article</a> détaille chaque expérience, chaque chiffre lu dans les registres du dépôt.`,
    },
    concepts: {
      tagline: 'Concepts',
      title: 'Chaque concept, une fois, au même endroit dans chaque langage',
      list: [
        ['cube', 'Racine d’agrégat', 'génère son identité, enregistre ses événements, porte sa version.'],
        ['tag', 'Objet-valeur', 'valide une fois : create() refuse, fromSnapshot() lève.'],
        ['bolt', 'Événement de domaine', 'un fait, durable avec l’état, publié après le commit.'],
        ['arrows', 'Événement d’intégration', 'le contrat entre deux contextes, dans le noyau partagé.'],
        ['terminal', 'Commande et requête', 'un seul handler par commande ; une requête renvoie un modèle de lecture.'],
        ['doc', 'Result, pas exception', 'un refus est une valeur ; lever est réservé aux bugs.'],
        ['clock', 'Outbox', 'les événements sont stockés avec l’état et relayés ensuite.'],
        ['branch', 'Concurrence optimiste', 'save() refuse un agrégat périmé ; le handler redécide, trois fois.'],
        ['link', 'Ports et adaptateurs', 'tout ce qui n’est pas fonction de l’état métier passe par un port.'],
        ['map', 'Carte des contextes', 'chaque relation déclarée une fois, tenue au code par la vérification.'],
        ['storm', 'Politique', 'une réaction à un fait, dans sa propre transaction.'],
        ['shield', 'Deux modes', 'une fonctionnalité reste dans l’architecture ; la changer est une décision.'],
      ],
    },
    tooling: {
      tagline: 'Outillage',
      title: 'L’architecture répond, puis vérifie',
      askTitle: 'Avant d’écrire : demander',
      ask: [
        ['Une règle, expliquée', 'L’énoncé, la raison, la remédiation, le fichier qui la montre.'],
        ['Un import, jugé', 'Ce fichier peut-il importer celui-là, et quelle règle le dit.'],
        [
          'Une fonctionnalité, décidée',
          'Un event storm facilité, écrit en mots communs aux quatre langages ; une checklist dit quoi écrire et où.',
        ],
      ],
      proveTitle: 'Après avoir écrit : prouver',
      prove: [
        [
          'Le mode fonctionnalité',
          'Refuse tout changement hors des contextes : briques de base, noyau partagé, conventions, décisions.',
        ],
        [
          'La vérification des conventions',
          'Chaque fichier nommé existe, chaque lien résout, chaque sonde d’import se comporte, la carte des contextes est vraie.',
        ],
        [
          'Un inventaire, quatre arbres',
          'Chaque langage écrit ce que son arbre dit de l’application ; la vérification en refuse deux qui diffèrent.',
        ],
      ],
      checks: 'les vérifications',
    },
    languages: {
      tagline: 'Langages',
      title: 'Lancez-la dans le langage que vous lisez le mieux',
      sub: 'Même port, même API sous <code>/v1</code>. Le README de chaque langage suit une requête de bout en bout ; son guide dit comment y travailler, à la main ou avec un agent.',
      run: 'Lancer le serveur',
      check: 'La tenir à l’architecture',
    },
    founder: {
      tagline: 'Qui le fait',
      text: 'Ingénierie produit, logicielle et système. Référence, outillage et expériences sont construits et rédigés avec un assistant IA ; les corrections sont bienvenues en issues.',
      issue: 'Ouvrir une issue',
    },
    footer: {
      articles: 'Les articles',
      decisions: 'Décisions',
      records: 'Registres',
      legal: 'Licence MIT · <code>npm i clean-ddd</code> pour l’outillage',
      note: 'une architecture, quatre langages, chaque chiffre lu dans les registres.',
    },
  },
  en: {
    lang: 'en',
    locale: 'en-GB',
    path: 'en/',
    other: { code: 'FR', path: '../', label: 'Version française', lang: 'fr' },
    article: 'article.html',
    articles: 'articles.html',
    list: {
      title: 'The articles',
      description: 'What the clean-ddd experiments found, article by article: the title, the author, the date.',
      tagline: 'Articles',
      sub: 'Every article reads its figures from the repository’s records; a correction is an issue, an update a new date.',
      by: 'by',
      published: 'published',
      updated: 'updated',
      read: 'Read the article',
      only: 'in French only',
    },
    title: 'CLEAN-DDD — Clean Architecture & DDD, a reference implementation',
    description:
      'A reference implementation of Clean Architecture and Domain-Driven Design, written to be read, in TypeScript, Rust, Python and Go, from one architecture that is data and that tooling holds the code to; then measured with AI coding agents.',
    ogDescription:
      'An architecture tooling holds the code to, in four languages, measured with AI agents: it does not make an agent faster, it keeps it from drifting.',
    ogImage: 'open-graph.en.png',
    home: 'CLEAN-DDD, home',
    menu: 'Open the menu',
    navLabel: 'Main navigation',
    nav: {
      what: 'The project',
      measured: 'Measured',
      concepts: 'Concepts',
      tooling: 'Tooling',
      languages: 'Languages',
      articles: 'Articles',
    },
    hero: {
      tagline: 'Clean Architecture &amp; DDD · TypeScript · Rust · Python · Go',
      title: 'An architecture tooling holds the code to, <br>measured with AI agents',
      text: 'A reference implementation, written to be read, whose rules are data. The measured verdict: it does not make an agent faster; it keeps it from drifting.',
      read: 'Read the articles',
      code: 'See the code',
      proofLabel: 'In figures',
      proof: [
        'agent runs graded',
        'the plain project’s time',
        'domain file touched by a change of storage',
        'import violations without the tooling, none with it',
      ],
    },
    what: {
      tagline: 'The project',
      title: 'One architecture, four languages, no tacit convention',
      pillars: [
        [
          'cube',
          'One small application, readable',
          'Shared notes, accounts, notifications, the tracking of every operation. Every DDD and Clean Architecture concept appears in it exactly once.',
        ],
        [
          'layers',
          'An architecture that is data',
          'The layers, who imports whom, every rule under a stable id: a YAML contract the linter and the checks are generated from. A boundary that gives way when convenient is not one.',
        ],
        [
          'globe',
          'Four languages, one API',
          'TypeScript, Rust, Python and Go, each with its own toolchain. One black-box scenario passes against the four servers; one inventory holds them equal.',
        ],
      ],
    },
    measured: {
      tagline: 'Measured',
      title: 'What it costs, what it buys',
      sub: 'Two benchmarks had agents build the same application, with and without the architecture, against hidden tests. The result is written as it came.',
      costTitle: 'It costs: time and money.',
      cost: (time, cost) =>
        `In every experiment the plain project delivered as much, in ${time} times less time and ${cost} times cheaper. A weaker model was not helped either.`,
      buysTitle: 'It buys: a structure that holds.',
      buys: 'Changes stay in their layer, contexts stay apart, money is not paid twice, and several agents work on one codebase without conflicts.',
      note: article =>
        `A guardrail and a coordinator for agents, not an accelerator. <a href="${article}">The article</a> details every experiment, every figure read from the repository’s records.`,
    },
    concepts: {
      tagline: 'Concepts',
      title: 'Every concept, once, in the same place in each language',
      list: [
        ['cube', 'Aggregate root', 'generates its identity, records its events, carries its version.'],
        ['tag', 'Value object', 'validates once: create() refuses, fromSnapshot() throws.'],
        ['bolt', 'Domain event', 'a fact, durable with the state, published after the commit.'],
        ['arrows', 'Integration event', 'the contract between two contexts, in the shared kernel.'],
        ['terminal', 'Command and query', 'one handler per command; a query returns a read model.'],
        ['doc', 'Result, not exception', 'a refusal is a value; throwing is for bugs.'],
        ['clock', 'Outbox', 'events are stored with the state and relayed afterwards.'],
        ['branch', 'Optimistic concurrency', 'save() refuses a stale aggregate; the handler re-decides, three times.'],
        ['link', 'Ports and adapters', 'anything that is not a function of the business state goes through a port.'],
        ['map', 'Context map', 'every relationship declared once, held to the code by the check.'],
        ['storm', 'Policy', 'a reaction to a fact, in a transaction of its own.'],
        ['shield', 'Two modes', 'a feature stays inside the architecture; changing it is a decision.'],
      ],
    },
    tooling: {
      tagline: 'Tooling',
      title: 'The architecture answers, then checks',
      askTitle: 'Before writing: ask',
      ask: [
        ['A rule, explained', 'The statement, the reason, the remediation, the file that shows it.'],
        ['An import, judged', 'May this file import that one, and which rule says so.'],
        [
          'A feature, decided',
          'A facilitated event storm, written in words the four languages share; a checklist says what to write and where.',
        ],
      ],
      proveTitle: 'After writing: prove',
      prove: [
        [
          'The feature mode',
          'Refuses any change outside the contexts: building blocks, shared kernel, conventions, decisions.',
        ],
        [
          'The conventions check',
          'Every named file exists, every link resolves, every import probe behaves, the context map is true.',
        ],
        [
          'One inventory, four trees',
          'Each language writes what its tree says the application is; the check refuses two that differ.',
        ],
      ],
      checks: 'the checks',
    },
    languages: {
      tagline: 'Languages',
      title: 'Run it in the language you read best',
      sub: 'Same port, same API under <code>/v1</code>. Each language’s README follows one request end to end; its guide says how to work in it, by hand or with an agent.',
      run: 'Run the server',
      check: 'Hold it to the architecture',
    },
    founder: {
      tagline: 'Who makes it',
      text: 'Product, software and system engineering. Reference, tooling and experiments are built and written up with an AI assistant; corrections are welcome as issues.',
      issue: 'Open an issue',
    },
    footer: {
      articles: 'The articles',
      decisions: 'Decisions',
      records: 'Records',
      legal: 'MIT license · <code>npm i clean-ddd</code> for the tooling',
      note: 'one architecture, four languages, every figure read from the records.',
    },
  },
};

const languages = [
  {
    name: 'TypeScript',
    run: 'cd typescript && yarn install && yarn start:dev',
    check: 'yarn check:conventions && yarn lint && yarn test:e2e',
  },
  {
    name: 'Rust',
    run: 'cd rust && cargo run -p bootstrap',
    check: 'cargo run -p conventions && cargo clippy && cargo test',
  },
  {
    name: 'Python',
    run: 'cd python && uv sync && uv run python -m bootstrap',
    check: 'uv run python -m tools.conventions && uv run pytest',
  },
  {
    name: 'Go',
    run: 'cd go && go run ./bootstrap/cmd/application',
    check: 'go run ./tools/conventions && go test ./...',
  },
];

const item = ([title, text]) =>
  `<div class="content-item"><span class="bullet">${svg('check', 'bullet-icon')}</span><div><h4>${title}</h4><p>${text}</p></div></div>`;

// The body of the page in one language; `up` leads from the page's directory back to the site's root.
// The index's main: the hero, the pillars, the measures, the concepts, the tooling, the languages, who makes it.
const indexMain = (L, up) => {
  const article = `${up}${L.article}`;
  return `
<section class="hero">
<div class="hero-picture" aria-hidden="true"><div class="glow glow-a"></div><div class="glow glow-b"></div><div class="glow glow-c"></div></div>
<div class="hero-content">
<p class="tagline">${L.hero.tagline}</p>
<h1>${L.hero.title}</h1>
<p>${L.hero.text}</p>
<div class="hero-actions">
<a class="btn btn-primary" href="${L.articles}">${L.hero.read}</a>
<a class="btn" href="${repo}" target="_blank" rel="noopener">${L.hero.code}</a>
</div>
<ul class="proof" aria-label="${L.hero.proofLabel}">
<li><b>${graded}</b> ${L.hero.proof[0]}</li>
<li><b>${span(allTimes)}×</b> ${L.hero.proof[1]}</li>
<li><b>${quotes.sqliteDomainFiles.value}</b> ${L.hero.proof[2]}</li>
<li><b>${driftBefore}→${driftAfter}</b> ${L.hero.proof[3]}</li>
</ul>
</div>
</section>

<section id="what" class="section">
<div class="section-inner">
<div class="headline">
<p class="tagline">${L.what.tagline}</p>
<h2>${L.what.title}</h2>
</div>
<div class="cards">
${L.what.pillars
  .map(
    ([name, title, text]) => `<div class="card">
${svg(name)}
<h3>${title}</h3>
<p>${text}</p>
</div>`,
  )
  .join('\n')}
</div>
</div>
</section>

<section id="measured" class="section">
<div class="section-inner narrow">
<div class="headline">
<p class="tagline">${L.measured.tagline}</p>
<h2>${L.measured.title}</h2>
<p class="sub">${L.measured.sub}</p>
</div>
<div class="verdict">
<div>
<h3>${L.measured.costTitle}</h3>
<p>${L.measured.cost(span(allTimes), span(allCosts))}</p>
</div>
<div>
<h3>${L.measured.buysTitle}</h3>
<p>${L.measured.buys}</p>
</div>
</div>
<p class="verdict-note">${L.measured.note(article)}</p>
</div>
</section>

<section id="concepts" class="section">
<div class="section-inner narrow">
<div class="headline">
<p class="tagline">${L.concepts.tagline}</p>
<h2>${L.concepts.title}</h2>
</div>
<div class="domains compact">
${L.concepts.list
  .map(
    ([name, title, text], index) => `<div class="domain">
${svg(name, `icon${index % 2 ? ' is-primary' : ''}`)}
<p><strong>${title}</strong> ${text}</p>
</div>`,
  )
  .join('\n')}
</div>
</div>
</section>

<section id="tooling" class="content">
<div class="content-head">
<p class="tagline">${L.tooling.tagline}</p>
<h2>${L.tooling.title}</h2>
</div>
<div class="content-body">
<div class="content-row">
<div class="content-text">
<h3 class="lead">${L.tooling.askTitle}</h3>
<div class="content-items">
${L.tooling.ask.map(item).join('\n')}
</div>
</div>
<div class="content-image">
${terminal('yarn architecture', [
  '$ yarn architecture rule ARCH-INWARD',
  'ARCH-INWARD (dependencies-point-inward) — enforced by linter',
  'Dependencies point inward and contexts stay apart — each file',
  'imports only what its row of the dependency table allows;',
  'there is no exception and none may be added.',
  '',
  '$ yarn architecture can-import typescript/src/Contexts/Notes/Domain/Note/Note.ts \\',
  '    @Contexts/Security/Domain/Account/Account',
  'refused by ARCH-DOMAIN: typescript/src/Contexts/Notes/Domain/Note/Note.ts',
  "may not import '@Contexts/Security/Domain/Account/Account'",
  '',
  '$ yarn architecture checklist command --language rust',
  'A new command goes in rust/src/contexts/<context>/application/',
  '  src/commands/<use_case>.rs',
  'Canonical example:',
  '  rust/src/contexts/notes/application/src/commands/edit_note.rs',
])}
</div>
</div>
</div>
<div class="content-body">
<div class="content-row reversed">
<div class="content-text">
<h3 class="lead">${L.tooling.proveTitle}</h3>
<div class="content-items">
${L.tooling.prove.map(item).join('\n')}
</div>
</div>
<div class="content-image">
${terminal(L.tooling.checks, [
  '$ yarn architecture mode feature --base main',
  'feature mode: the 3 changed file(s) are within it.',
  '',
  '$ yarn architecture storm --expect conventions/storms/share-a-note.yaml',
  'The code carries the storm: the typescript inventory is the expected one.',
  '',
  '$ yarn architecture inventory rust',
  'rust: the same application as typescript',
  '',
  '$ yarn check:conventions',
  '✓ contract v1, TypeScript binding: 30 rules, 49 concepts, 4 contexts',
  '  match the tree; every documentation link resolves; no eslint-disable;',
  '  1365 import probes behave and name their rule; the context map is',
  '  true to the code (4 links); one application in 4 inventories.',
])}
</div>
</div>
</div>
</section>

<section id="languages" class="section">
<div class="section-inner">
<div class="headline">
<p class="tagline">${L.languages.tagline}</p>
<h2>${L.languages.title}</h2>
<p class="sub">${L.languages.sub}</p>
</div>
<div class="cards languages">
${languages
  .map(
    language => `<div class="card">
<h3>${language.name}</h3>
<p class="label">${L.languages.run}</p>
<pre><code>${escape(language.run)}</code></pre>
<p class="label">${L.languages.check}</p>
<pre><code>${escape(language.check)}</code></pre>
</div>`,
  )
  .join('\n')}
</div>
</div>
</section>

<section class="founder">
<div class="founder-box">
<img src="${up}assets/img/exostic.svg" width="144" height="21" alt="Exostic">
<div class="founder-text">
<p class="tagline">${L.founder.tagline}</p>
<h2>Jérémy Gay, Exostic</h2>
<p>${L.founder.text}</p>
</div>
<div class="founder-actions">
<a class="btn btn-sm" href="https://exostic.com/" target="_blank" rel="noopener">exostic.com</a>
<a class="founder-link" href="${repo}/issues" target="_blank" rel="noopener">${L.founder.issue}</a>
</div>
</div>
</section>
`;
};

// The list of the articles: each in the page's language when it has one, its title, its author, its dates.
const articlesMain = (L, up) => `
<section class="section list">
<div class="section-inner narrow">
<div class="headline">
<p class="tagline">${L.list.tagline}</p>
<h2>${L.list.title}</h2>
<p class="sub">${L.list.sub}</p>
</div>
<div class="posts">
${articles
  .map(article => {
    const version = article[L.lang] ?? article[L.other.lang];
    const lang = article[L.lang] ? L.lang : L.other.lang;
    const dates = `${L.list.published} ${day(article.published, L.locale)}${
      article.updated && article.updated !== article.published
        ? ` · ${L.list.updated} ${day(article.updated, L.locale)}`
        : ''
    }`;
    return `<article class="post"${lang === L.lang ? '' : ` lang="${lang}"`}>
<p class="dates"><time datetime="${article.published}">${dates}</time>${lang === L.lang ? '' : ` · <span lang="${L.lang}">${L.list.only}</span>`}</p>
<h3><a href="${up}${version.file}"${lang === L.lang ? '' : ` hreflang="${lang}"`}>${version.title.replace('&', '&amp;')}</a></h3>
<p>${version.description}</p>
<p class="meta">${L.list.by} <a href="${article.author.url}" target="_blank" rel="noopener">${article.author.name}</a> · <a href="${up}${version.file}">${L.list.read}</a></p>
</article>`;
  })
  .join('\n')}
</div>
</div>
</section>
`;

// The header and the footer around a page's main, on the index's anchors from any page of the language.
const chrome = (L, up, main) => {
  // The index and the list of the articles live in the language's own directory, beside this page.
  const index = './';
  const list = L.articles;
  return `
<header id="header">
<div class="header-backdrop"></div>
<div class="header-inner">
<div class="header-brand">
<a class="header-logo" href="./" aria-label="${L.home}"><span class="wordmark">CLEAN-DDD</span></a>
<button class="menu-toggle" type="button" aria-controls="main-nav" aria-expanded="false" aria-label="${L.menu}">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path class="bar-top" d="M4 6h16"/><path class="bar-mid" d="M4 12h16"/><path class="bar-bottom" d="M4 18h16"/></svg>
</button>
</div>
<nav id="main-nav" class="header-nav" aria-label="${L.navLabel}">
<ul>
<li><a href="${index}#what">${L.nav.what}</a></li>
<li><a href="${index}#measured">${L.nav.measured}</a></li>
<li><a href="${index}#concepts">${L.nav.concepts}</a></li>
<li><a href="${index}#tooling">${L.nav.tooling}</a></li>
<li><a href="${index}#languages">${L.nav.languages}</a></li>
<li><a href="${list}">${L.nav.articles}</a></li>
</ul>
</nav>
<div class="header-actions">
<a class="lang-switch" href="${L.other.path}" hreflang="${L.other.lang}" lang="${L.other.lang}" aria-label="${L.other.label}">${L.other.code}</a>
<a class="btn btn-primary btn-sm" href="${repo}" target="_blank" rel="noopener">GITHUB</a>
</div>
</div>
</header>

<main>
${main}
</main>

<footer>
<div class="footer-inner">
<div class="footer-card">
<a class="brand" href="./">CLEAN-DDD</a>
<p class="footer-links"><a href="${list}">${L.footer.articles}</a> · <a href="${repo}" target="_blank" rel="noopener">GitHub</a> · <a href="${blob('docs/adr')}" target="_blank" rel="noopener">${L.footer.decisions}</a> · <a href="${blob('docs/evaluations/README.md')}" target="_blank" rel="noopener">${L.footer.records}</a></p>
<p class="legal first">${L.footer.legal}</p>
</div>
<p class="footer-note">© ${year} <a href="https://exostic.com/" target="_blank" rel="noopener">Exostic</a> · ${L.footer.note}</p>
</div>
</footer>
`;
};

const site = 'https://jganet.github.io/clean-ddd/';
const page = (L, up, view) => `<!doctype html>
<html lang="${L.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${view.title.replace('&', '&amp;')}</title>
<meta name="description" content="${view.description}">
<link rel="alternate" hreflang="fr" href="${site}${view.alternates.fr}">
<link rel="alternate" hreflang="en" href="${site}en/${view.alternates.en}">
<link rel="alternate" hreflang="x-default" href="${site}${view.alternates.fr}">
<meta property="og:title" content="${view.title.replace('&', '&amp;')}">
<meta property="og:description" content="${view.ogDescription}">
<meta property="og:type" content="website">
<meta property="og:url" content="${site}${L.path}${view.file}">
<meta property="og:image" content="${site}assets/img/${L.ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${up}favicon.svg" type="image/svg+xml">
<link rel="preload" href="${up}assets/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<style>
@font-face {
  font-family: 'Inter Variable';
  font-style: normal;
  font-display: swap;
  font-weight: 100 900;
  src: url('${up}assets/fonts/inter-latin-wght-normal.woff2') format('woff2-variations');
}
:root {
  --bg: #0b012e;
  --bg-panel: rgba(51, 51, 51, 0.2);
  --text: rgb(229 236 246);
  --text-soft: #cbd5e1;
  --text-muted: rgb(229 236 246 / 0.66);
  --text-dim: #94a3b8;
  --primary: #e43b7d;
  --secondary: #ff5211;
  --accent: #4c3584;
  --border: #475569;
  --gradient: linear-gradient(to right, #ff5211, #e43b7d, #4c3584);
  --gradient-text: linear-gradient(to right, #ff5211, #e43b7d, #b08ae6);
  --font: 'Inter Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --container: 80rem;
  color-scheme: dark;
}
*, *::before, *::after { box-sizing: border-box; border: 0 solid var(--border); margin: 0; padding: 0; }
html { font-family: var(--font); line-height: 1.5; -webkit-text-size-adjust: 100%; overflow-x: hidden; scroll-behavior: smooth; scroll-padding-top: 5rem; }
@media (min-width: 1536px) { html { font-size: 20px; } }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
body { background: var(--bg); color: var(--text); letter-spacing: -0.025em; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; overflow-x: hidden; min-height: 100vh; }
img, svg { display: block; max-width: 100%; }
a { color: inherit; text-decoration: none; }
button { font: inherit; color: inherit; background: none; cursor: pointer; }
h1, h2, h3, h4 { font-weight: 700; line-height: 1.2; letter-spacing: -0.05em; }
code { font-family: var(--mono); font-size: 0.9em; letter-spacing: 0; }
.icon { width: 1em; height: 1em; flex-shrink: 0; }

/* ---------- Buttons ---------- */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.25rem; border-radius: 9999px; border: 1px solid #64748b; background: transparent; color: var(--text-soft); font-weight: 500; font-size: 1rem; line-height: 1.375; text-align: center; padding: 0.875rem 1.5rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1); transition: background-color 0.2s ease-in, border-color 0.2s ease-in; }
.btn:hover { background-color: #1e293b; border-color: #1e293b; }
.btn:focus-visible { outline: 2px solid #ec4899; outline-offset: 2px; }
.btn-primary { font-weight: 600; color: #fff; border: none; background-image: var(--gradient); background-size: 200% auto; background-position: left; transition: background-position 0.5s; }
.btn-primary:hover { background-position: right; color: #fff; }
.btn small { font-size: 0.8em; font-weight: 500; opacity: 0.85; margin-left: 0.25rem; }
.btn-sm { padding: 0.375rem 0.5rem; font-size: 0.75rem; font-weight: 600; box-shadow: none; }
@media (min-width: 768px) { .btn { padding-left: 2rem; padding-right: 2rem; } .btn-sm { padding-left: 0.75rem; padding-right: 0.75rem; } }
.btn-gradient-vertical { background-image: linear-gradient(180deg, #4c3584, #e43b7d, #ff5211); background-size: 300% 300%; animation: gradient-shift 30s ease infinite; }
@keyframes gradient-shift { 0% { background-position: 50% 0%; } 50% { background-position: 50% 100%; } 100% { background-position: 50% 0%; } }

/* ---------- Header ---------- */
#header { position: fixed; top: 0; left: 0; right: 0; z-index: 40; width: 100%; background: var(--bg); }
#header .header-backdrop { position: absolute; inset: 0; transition: background-color 0.2s, box-shadow 0.2s; }
#header .header-inner { position: relative; max-width: var(--container); margin: 0 auto; padding: 0.75rem; width: 100%; }
.header-brand { display: flex; justify-content: space-between; align-items: center; }
.header-logo { display: flex; align-items: center; margin-left: 0.5rem; }
.wordmark { font-weight: 800; font-size: 1.25rem; letter-spacing: -0.04em; background: var(--gradient-text); -webkit-background-clip: text; background-clip: text; color: transparent; }
.menu-toggle { display: inline-flex; align-items: center; margin-left: 0.375rem; padding: 0.625rem; border-radius: 0.5rem; color: #9ca3af; transition: background-color 0.15s; }
.menu-toggle:hover { background-color: #1f2937; }
.menu-toggle:focus-visible { outline: 4px solid #374151; }
.menu-toggle svg { width: 1.5rem; height: 1.5rem; }
.menu-toggle path { transition: transform 0.2s, opacity 0.2s; transform-box: fill-box; transform-origin: center; }
.menu-open .menu-toggle .bar-top { transform: translateY(6px) rotate(45deg); }
.menu-open .menu-toggle .bar-mid { opacity: 0; }
.menu-open .menu-toggle .bar-bottom { transform: translateY(-6px) rotate(-45deg); }
.header-nav { display: none; width: 100%; overflow-y: auto; }
.header-nav ul { list-style: none; display: flex; flex-direction: column; width: 100%; font-size: 1.25rem; font-weight: 500; letter-spacing: 0.01rem; }
.header-nav a { display: flex; margin: 0 0.5rem; padding: 0.75rem 1rem; border-radius: 0.25rem; }
.header-nav a:hover { color: #fff; }
.header-actions { display: none; position: fixed; left: 0; right: 0; bottom: 0; justify-content: flex-end; padding: 0.75rem; }
.header-actions .btn { margin-left: 0.5rem; }
.lang-switch { display: inline-flex; align-items: center; padding: 0.375rem 0.5rem; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.05em; line-height: 1; border: 1px solid rgba(255, 255, 255, 0.35); border-radius: 0.25rem; color: #fff; }
.lang-switch:hover { border-color: #fff; }
.menu-open #header { height: 100vh; height: 100dvh; }
.menu-open .header-nav { display: block; position: fixed; top: 70px; left: 0; right: 0; bottom: 70px; padding: 0 5px; }
.menu-open .header-actions { display: flex; }
.menu-open main, .menu-open footer { display: none; }
@media (min-width: 768px) {
  #header { background: transparent; }
  #header.scroll .header-backdrop { background-color: rgba(51, 51, 51, 0.2); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }
  #header .header-inner { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1.5rem; }
  .menu-toggle { display: none; }
  .header-nav { display: flex; width: auto; align-items: center; margin: 0 1.25rem; overflow: visible; }
  .header-nav ul { flex-direction: row; width: auto; font-size: 0.9375rem; }
  .header-nav a { padding: 0.25rem 1rem; }
  .header-actions { display: flex; position: static; padding: 0; }
}

/* ---------- Hero ---------- */
.hero { position: relative; min-height: 100svh; width: 100%; overflow: hidden; }
.hero-picture { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 120%, rgba(76, 53, 132, 0.55), transparent 60%); }
.glow { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.55; }
.glow-a { width: 42vw; height: 42vw; left: -8vw; top: 8vh; background: #4c3584; }
.glow-b { width: 36vw; height: 36vw; right: -6vw; top: 18vh; background: rgba(228, 59, 125, 0.45); }
.glow-c { width: 30vw; height: 30vw; left: 38vw; bottom: -14vh; background: rgba(255, 82, 17, 0.3); }
.hero-content { position: relative; min-height: 100svh; padding: 6rem 1.5rem 3rem; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
.hero .tagline { margin-bottom: 1rem; }
.hero h1 { font-size: 2.25rem; line-height: 1.1; margin-bottom: 1.25rem; color: #e5e7eb; max-width: 30ch; }
.hero h1 br { display: none; }
.hero p:not(.tagline) { max-width: 48rem; margin: 0 auto 1.5rem; font-size: 1.125rem; line-height: 1.65rem; color: var(--text-soft); }
.hero-actions { max-width: 20rem; margin: 0 auto; padding-top: 0.5rem; display: flex; flex-direction: column; gap: 1rem; width: 100%; }
.hero-actions .btn { width: 100%; }
@media (min-width: 640px) {
  .hero-content { padding-left: 0; padding-right: 0; }
  .hero h1 { font-size: 3rem; }
  .hero h1 br { display: initial; }
  .hero p:not(.tagline) { font-size: 1.25rem; line-height: 1.75rem; }
  .hero-actions { max-width: 32rem; flex-direction: row; justify-content: center; }
  .hero-actions .btn { width: auto; }
}

/* ---------- Proof strip ---------- */
.proof { list-style: none; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem 1.5rem; width: 100%; max-width: 56rem; margin: 3rem auto 0; padding-top: 1.5rem; border-top: 1px solid rgba(255, 255, 255, 0.1); font-size: 0.875rem; line-height: 1.3; color: var(--text-muted); }
.proof b { display: block; font-size: 1.75rem; font-weight: 800; letter-spacing: -0.04em; line-height: 1.1; background: var(--gradient-text); -webkit-background-clip: text; background-clip: text; color: transparent; font-variant-numeric: tabular-nums; }
@media (min-width: 768px) { .proof { grid-template-columns: repeat(4, minmax(0, 1fr)); } }

/* ---------- Sections ---------- */
.section { position: relative; }
.section-inner { position: relative; max-width: var(--container); margin: 0 auto; padding: 3rem 1rem; }
.section-inner.narrow { max-width: 64rem; }
@media (min-width: 768px) { .section-inner { padding: 4rem 1.5rem; } }
@media (min-width: 1024px) { .section-inner { padding: 5rem 1.5rem; } }
.headline { max-width: 48rem; margin: 0 auto 2rem; text-align: center; }
.tagline { font-size: 1rem; font-weight: 700; letter-spacing: 0.025em; text-transform: uppercase; color: var(--secondary); }
.headline h2 { font-size: 1.875rem; line-height: 1.2; }
.headline p.sub { margin-top: 1rem; font-size: 1.25rem; line-height: 1.75rem; color: var(--text-muted); }
@media (min-width: 768px) { .headline { margin-bottom: 3rem; } .headline h2 { font-size: 2.25rem; } }

/* ---------- Cards ---------- */
.cards { display: grid; gap: 1rem; }
.card { position: relative; display: flex; flex-direction: column; padding: 1.5rem; background: var(--bg-panel); box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1); }
.card .icon { width: 3rem; height: 3rem; margin-bottom: 1.5rem; color: var(--primary); }
.card h3 { font-size: 1.25rem; line-height: 1.75rem; letter-spacing: -0.025em; }
.card p { margin-top: 0.5rem; color: var(--text-muted); }
.card .label { margin-top: 1rem; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-dim); }
.card pre { margin-top: 0.375rem; padding: 0.625rem 0.75rem; border-radius: 0.375rem; background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.08); color: var(--text-soft); font-size: 0.8125rem; line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; }
.card pre code { font-size: 1em; }
@media (min-width: 640px) { .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (min-width: 768px) { .cards { gap: 1.5rem; } }
@media (min-width: 1024px) { .cards { grid-template-columns: repeat(3, minmax(0, 1fr)); } .cards.languages { grid-template-columns: repeat(4, minmax(0, 1fr)); } }

/* ---------- The articles ---------- */
.list .section-inner { padding-top: 8rem; }
.posts { display: grid; gap: 1.5rem; }
.post { padding: 1.5rem; background: var(--bg-panel); border: 1px solid var(--border); border-radius: 0.375rem; }
.post .dates { font-size: 0.8125rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: #bfdbfe; }
.post h3 { margin-top: 0.5rem; font-size: 1.5rem; line-height: 1.25; letter-spacing: -0.03em; }
.post h3 a:hover { color: #fff; text-decoration: underline; text-underline-offset: 0.2em; }
.post p:not(.dates):not(.meta) { margin-top: 0.75rem; color: var(--text-muted); }
.post .meta { margin-top: 1rem; font-size: 0.9375rem; color: var(--text-soft); }
.post .meta a { text-decoration: underline; text-underline-offset: 0.2em; }
.post .meta a:hover { color: #fff; }

/* ---------- Measured ---------- */
.verdict { display: grid; gap: 1.5rem; }
.verdict { margin-top: 0.5rem; }
.verdict h3 { font-size: 1.25rem; line-height: 1.75rem; letter-spacing: -0.025em; color: #fff; }
.verdict p { margin-top: 0.75rem; color: var(--text-muted); }
@media (min-width: 768px) { .verdict { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3rem; } }
.verdict-note { margin-top: 2rem; text-align: center; color: var(--text-dim); }

/* ---------- Concepts ---------- */
.domains { display: grid; gap: 3rem 2rem; }
.domain { display: flex; max-width: 28rem; }
.domain .icon { width: 2.5rem; height: 2.5rem; padding: 0.5rem; margin-right: 1rem; border-radius: 9999px; background: var(--secondary); color: #fff; }
.domain .icon.is-primary { background: var(--primary); }
.domain h3 { font-size: 1.25rem; line-height: 1.75rem; letter-spacing: -0.025em; }
.domain p { margin-top: 0.75rem; color: var(--text-muted); }
@media (min-width: 640px) { .domains { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.domains.compact { gap: 1.5rem 2rem; }
.domains.compact .domain { align-items: center; }
.domains.compact .domain p { margin: 0; color: var(--text-muted); }
.domains.compact .domain strong { color: #fff; font-weight: 600; }
.domains.compact .icon { width: 2.5rem; height: 2.5rem; padding: 0.5rem; }
@media (min-width: 768px) { .domain .icon { width: 3rem; height: 3rem; padding: 0.75rem; } .domain h3 { font-size: 1.3rem; } }

/* ---------- Content blocks (text + terminal) ---------- */
.content { padding: 4rem 0; }
.content-head { max-width: 48rem; margin: 0 auto 2.5rem; padding: 0 1rem; text-align: center; }
.content-head .tagline { font-weight: 600; color: #bfdbfe; }
.content-head h2 { font-size: 2.25rem; margin-bottom: 1rem; }
.content-body { max-width: var(--container); margin: 0 auto; padding: 1rem; }
.content-body + .content-body { padding-top: 3rem; }
.content-row { display: flex; flex-direction: column; }
.content-text { align-self: center; }
.content-text h3.lead { font-size: 1.5rem; line-height: 2rem; letter-spacing: -0.025em; color: #fff; margin-bottom: 2rem; }
.content-items { display: flex; flex-direction: column; gap: 2rem; }
.content-item { display: flex; }
.content-item .bullet { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 1.75rem; height: 1.75rem; border-radius: 9999px; background: var(--primary); color: #f9fafb; }
.content-item .bullet-icon { width: 1.125rem; height: 1.125rem; }
.content-item > div { margin-left: 1rem; }
.content-item h4 { font-size: 1.125rem; line-height: 1.5rem; font-weight: 500; letter-spacing: -0.025em; color: #fff; }
.content-item p { margin-top: 0.5rem; color: var(--text-dim); }
.content-image { margin-top: 2.5rem; }
.terminal { max-width: 560px; margin: 0 auto; border-radius: 0.5rem; background: #07011f; border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.3), 0 4px 6px -4px rgb(0 0 0 / 0.3); overflow: hidden; }
.terminal-bar { display: flex; align-items: center; gap: 0.375rem; padding: 0.625rem 0.875rem; background: rgba(255, 255, 255, 0.04); border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
.terminal-bar span { width: 0.625rem; height: 0.625rem; border-radius: 50%; background: #334155; }
.terminal-bar span:nth-child(1) { background: var(--secondary); }
.terminal-bar span:nth-child(2) { background: var(--primary); }
.terminal-bar span:nth-child(3) { background: var(--accent); }
.terminal-bar em { margin-left: 0.5rem; font-style: normal; font-size: 0.75rem; color: var(--text-dim); letter-spacing: 0; }
.terminal pre { padding: 1rem 1.125rem; font-family: var(--mono); font-size: 0.78rem; line-height: 1.55; letter-spacing: 0; color: var(--text-soft); overflow-x: auto; white-space: pre; }
.terminal pre b { color: var(--primary); font-weight: 700; }
.terminal pre i { color: #fff; font-style: normal; }
@media (min-width: 768px) {
  .content { padding: 5rem 0; }
  .content-head { margin-bottom: 3rem; }
  .content-head h2 { font-size: 3rem; line-height: 1.1; }
  .content-body { padding: 1rem 2rem; }
  .content-body + .content-body { padding-top: 4rem; }
  .content-row { flex-direction: row; gap: 4rem; align-items: center; }
  .content-row.reversed { flex-direction: row-reverse; }
  .content-text, .content-image { flex-basis: 50%; min-width: 0; }
  .content-image { margin-top: 0; }
  .content-text h3.lead { font-size: 1.875rem; line-height: 2.25rem; }
}

/* ---------- Founder card ---------- */
.founder { max-width: 72rem; margin: 0 auto; padding: 0 1rem 3rem; }
.founder-box { display: flex; flex-wrap: wrap; align-items: center; gap: 1.25rem; max-width: 48rem; margin: 0 auto; padding: 1.25rem 1.5rem; border: 1px solid var(--border); border-radius: 0.375rem; background: var(--bg-panel); }
.founder-box img { flex: none; width: 7rem; height: auto; }
.founder-text { flex: 1 1 18rem; min-width: 0; }
.founder-text .tagline { margin: 0; font-size: 0.8125rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: #bfdbfe; }
.founder-text h2 { margin: 0.25rem 0; font-size: 1.25rem; line-height: 1.4; }
.founder-text p:last-child { margin: 0; font-size: 0.9375rem; line-height: 1.5rem; color: var(--text-soft); }
.founder-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; }
.founder-link { font-size: 0.875rem; color: var(--text-soft); text-decoration: underline; text-underline-offset: 0.2em; }
.founder-link:hover { color: #fff; }
@media (min-width: 640px) { .founder { padding-left: 1.5rem; padding-right: 1.5rem; } }

/* ---------- Footer ---------- */
footer { position: relative; padding: 1.5rem; overflow: hidden; background: radial-gradient(ellipse at 50% 100%, rgba(76, 53, 132, 0.5), transparent 70%); }
.footer-inner { position: relative; max-width: var(--container); margin: 0 auto; padding: 0 1rem; color: var(--text-soft); }
.footer-card { position: relative; max-width: 24rem; margin: 0 auto 1rem; padding: 1rem; text-align: center; background: rgba(51, 51, 51, 0.2); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); }
.footer-card .brand { display: inline-block; font-weight: 700; font-size: 1.25rem; background: var(--gradient-text); -webkit-background-clip: text; background-clip: text; color: transparent; }
.footer-links { margin-top: 0.5rem; font-size: 0.875rem; }
.footer-links a { text-decoration: underline; text-underline-offset: 0.2em; }
.footer-card .legal { font-size: 0.75rem; line-height: 1rem; opacity: 0.8; }
.footer-card .legal.first { margin-top: 0.5rem; }
.footer-note { font-size: 0.875rem; line-height: 1.25rem; text-align: center; }
.footer-note a { text-decoration: underline; text-underline-offset: 0.2em; }
</style>
</head>
<body>
${chrome(L, up, view.main)}
<script>
// The header takes its backdrop once the page has scrolled; the menu button opens the navigation on a phone.
const header = document.getElementById('header');
const onScroll = () => header.classList.toggle('scroll', window.scrollY > 24);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });
const toggle = document.querySelector('.menu-toggle');
const close = () => { document.body.classList.remove('menu-open'); toggle.setAttribute('aria-expanded', 'false'); };
toggle.addEventListener('click', () => {
  const open = document.body.classList.toggle('menu-open');
  toggle.setAttribute('aria-expanded', String(open));
});
document.querySelectorAll('.header-nav a').forEach(link => link.addEventListener('click', close));
</script>
</body>
</html>
`;

for (const [L, directory, up] of [
  [locales.fr, '', ''],
  [locales.en, 'en', '../'],
]) {
  mkdirSync(join(here, directory), { recursive: true });
  const views = {
    'index.html': {
      title: L.title,
      description: L.description,
      ogDescription: L.ogDescription,
      alternates: { fr: '', en: '' },
      file: '',
      main: indexMain(L, up),
    },
    [L.articles]: {
      title: `${L.list.title} — CLEAN-DDD`,
      description: L.list.description,
      ogDescription: L.list.description,
      alternates: { fr: locales.fr.articles, en: locales.en.articles },
      file: L.articles,
      main: articlesMain(L, up),
    },
  };
  for (const [file, view] of Object.entries(views)) {
    writeFileSync(join(here, directory, file), page(L, up, view));
    process.stdout.write(`site/${directory ? `${directory}/` : ''}${file} written\n`);
  }
}
