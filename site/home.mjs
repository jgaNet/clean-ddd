#!/usr/bin/env node
/**
 * The page that presents the project, site/index.html, in French, in the visual codes of exostic.com: dark
 * ground, Inter, the orange → pink → violet gradient, pill buttons, translucent panels. The
 * article is a page of its own, site/article.html (node site/build.mjs), reached from here.
 *
 *   node site/home.mjs   → site/index.html
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { figures, span } from './figures.mjs';

const here = new URL('.', import.meta.url).pathname;
const data = JSON.parse(readFileSync(join(here, 'data.json'), 'utf8'));
const { graded, allTimes, allCosts } = figures(data);

const repo = 'https://github.com/jgaNet/clean-ddd';
const blob = path => `${repo}/blob/main/${path}`;
const article = 'article.html';
const year = new Date().getUTCFullYear();

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

const whatItIs = [
  {
    icon: 'cube',
    title: 'Une petite application',
    text: 'Des notes que l’on partage, des comptes, des notifications, le suivi de chaque opération. Le métier est petit à dessein : ce qui compte, c’est la forme.',
  },
  {
    icon: 'globe',
    title: 'Quatre langages, une architecture',
    text: 'TypeScript, Rust, Python et Go, chacun dans son répertoire avec sa propre chaîne d’outils. Les mêmes couches, les mêmes règles, la même API HTTP.',
  },
  {
    icon: 'layers',
    title: 'L’architecture est de la donnée',
    text: 'Les couches, qui peut importer qui, chaque règle sous un identifiant stable, la grammaire HTTP : un contrat YAML dont sont générées les règles d’import de chaque langage.',
  },
  {
    icon: 'shield',
    title: 'Des règles tenues par l’outillage',
    text: 'Un linter généré depuis la table, une vérification des conventions, le compilateur et les tests. Une frontière que l’on franchit quand ça arrange n’est pas une frontière.',
  },
  {
    icon: 'storm',
    title: 'Décidé en storm, tenu dans le code',
    text: 'Le modèle d’une fonctionnalité se décide dans une session d’event storming facilitée, s’écrit, et le code y est tenu jusqu’à ce que plus rien ne manque.',
  },
  {
    icon: 'people',
    title: 'Mesuré avec des agents IA',
    text: 'Deux benchmarks ont fait travailler des agents de code avec et sans l’architecture, face à des tests cachés, et ont consigné ce qu’elle apporte et ce qu’elle coûte.',
  },
];

const concepts = [
  [
    'cube',
    'Racine d’agrégat',
    'Génère sa propre identité, enregistre ses événements dans un comportement, porte la version à laquelle elle a été lue.',
  ],
  [
    'tag',
    'Objet-valeur',
    'Valide une fois et sert aux deux chemins : create() renvoie un refus, fromSnapshot() lève sur une donnée corrompue.',
  ],
  [
    'bolt',
    'Événement de domaine',
    'Un fait qu’un agrégat a enregistré, rendu durable avec l’état dans la même transaction et publié après le commit.',
  ],
  [
    'arrows',
    'Événement d’intégration',
    'Le contrat entre deux contextes, publié dans le noyau partagé dans les mots publics du contexte qui l’annonce.',
  ],
  [
    'terminal',
    'Commande et requête',
    'Une commande a exactement un handler et reçoit sa réponse plus tard ; une requête renvoie un modèle de lecture taillé pour un écran, jamais un agrégat.',
  ],
  [
    'doc',
    'Un Result, pas une exception',
    'Une commande refusée est un Result en échec qui porte l’exception de la règle ; lever est réservé aux erreurs de programmation.',
  ],
  [
    'clock',
    'Outbox',
    'Les événements sont stockés avec l’état et relayés après le commit : un abonné ne voit jamais que des faits durables.',
  ],
  [
    'branch',
    'Concurrence optimiste',
    'save() stocke version + 1 et refuse un agrégat périmé ; le handler relit et redécide, jusqu’à trois tentatives.',
  ],
  [
    'link',
    'Ports et adaptateurs',
    'Tout ce qui n’est pas fonction de l’état métier vit derrière un port nommé d’après ce qu’il décide.',
  ],
  [
    'map',
    'Carte des contextes',
    'Chaque relation entre deux contextes est déclarée une fois, avec son motif, son mécanisme et sa raison ; la vérification la tient au code.',
  ],
  [
    'storm',
    'Politique',
    'Une réaction à un fait, dans sa propre transaction ; une seconde réaction à la même intention, jamais un second handler.',
  ],
  [
    'shield',
    'Deux modes de travail',
    'Une fonctionnalité reste dans l’architecture ; un changement de l’architecture est une décision, avec l’ADR qui l’explique.',
  ],
];

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

const body = `
<header id="header">
<div class="header-backdrop"></div>
<div class="header-inner">
<div class="header-brand">
<a class="header-logo" href="./" aria-label="CLEAN-DDD, accueil"><span class="wordmark">CLEAN-DDD</span></a>
<button class="menu-toggle" type="button" aria-controls="main-nav" aria-expanded="false" aria-label="Ouvrir le menu">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path class="bar-top" d="M4 6h16"/><path class="bar-mid" d="M4 12h16"/><path class="bar-bottom" d="M4 18h16"/></svg>
</button>
</div>
<nav id="main-nav" class="header-nav" aria-label="Navigation principale">
<ul>
<li><a href="#what">Le projet</a></li>
<li><a href="#measured">Mesures</a></li>
<li><a href="#concepts">Concepts</a></li>
<li><a href="#tooling">Outillage</a></li>
<li><a href="#languages">Langages</a></li>
</ul>
</nav>
<div class="header-actions">
<a class="lang-switch" href="${article}" hreflang="en" lang="en">L’ARTICLE</a>
<a class="btn btn-primary btn-sm" href="${repo}" target="_blank" rel="noopener">GITHUB</a>
</div>
</div>
</header>

<main>
<section class="hero">
<div class="hero-picture" aria-hidden="true"><div class="glow glow-a"></div><div class="glow glow-b"></div><div class="glow glow-c"></div></div>
<div class="hero-content">
<p class="tagline">Clean Architecture &amp; Domain-Driven Design</p>
<h1>Une implémentation de référence,<br>écrite pour être lue</h1>
<p>Une petite application, chaque concept exactement une fois, en TypeScript, Rust, Python et Go, depuis une seule architecture qui est de la donnée et que l’outillage fait respecter plutôt que la convention. Puis mesurée : est-ce que tout cela aide un agent IA à écrire du logiciel ?</p>
<div class="hero-actions">
<a class="btn btn-primary" href="${article}">Lire l’article</a>
<a class="btn" href="${repo}" target="_blank" rel="noopener">Parcourir le dépôt</a>
</div>
</div>
</section>

<section id="what" class="section">
<div class="section-inner">
<div class="headline">
<p class="tagline">Le projet</p>
<h2>Une architecture, rendue en quatre langages</h2>
<p class="sub">Chaque concept du Domain-Driven Design et de la Clean Architecture apparaît exactement une fois, dans la forme la plus simple qui fasse encore son travail. Les règles sont vérifiées par l’outillage, dans chaque langage, sous les mêmes identifiants.</p>
</div>
<div class="cards">
${whatItIs
  .map(
    card => `<div class="card">
${svg(card.icon)}
<h3>${card.title}</h3>
<p>${card.text}</p>
</div>`,
  )
  .join('\n')}
</div>
</div>
</section>

<section id="measured" class="section">
<div class="section-inner narrow">
<div class="headline">
<p class="tagline">Mesures</p>
<h2>Ce que ça apporte, et ce que ça coûte</h2>
<p class="sub">Le dépôt est né d’un pari : une architecture explicite et imposée rend les agents IA meilleurs pour construire du logiciel. Le pari a ensuite été mesuré, dans deux benchmarks, face à des tests d’acceptation cachés qu’aucun agent n’a vus.</p>
</div>
<div class="stats">
<div class="stat"><div class="figure">${graded}</div><div class="what">exécutions d’agents notées face aux tests cachés, en six expériences sur l’application de notes</div></div>
<div class="stat"><div class="figure">${span(allTimes)}×</div><div class="what">le temps du projet nu, pris par les bras architecture dans chaque expérience</div></div>
<div class="stat"><div class="figure">${span(allCosts)}×</div><div class="what">le coût du projet nu, dans chaque expérience</div></div>
<div class="stat"><div class="figure">0</div><div class="what">fichier du domaine touché par le passage à SQLite dans les arbres architecture</div></div>
</div>
<div class="verdict">
<div>
<h3>Elle ne rend pas un agent plus rapide ni meilleur.</h3>
<p>Dans chaque expérience, le projet nu a livré autant, plus tôt et moins cher ; un modèle plus faible n’en a pas profité non plus. Une place de marché de logements construite jusqu’à cinquante fonctionnalités a dit la même chose, et vers la centième chaque arbre s’est arrêté sur une règle que personne n’avait écrite.</p>
</div>
<div>
<h3>Elle apporte quatre choses, chacune mesurée.</h3>
<p>Les changements restent dans leur couche. Moins de défauts invisibles aux tests, là où il y a de l’argent. Une structure qui ne dérive pas, avec l’outillage. Et plusieurs agents sur une même base de code, un par contexte borné, sans conflit.</p>
</div>
</div>
<p class="verdict-note">Le projet se présente donc comme un garde-fou et un coordinateur pour les agents, pas comme un accélérateur. Chaque chiffre, journal et note est dans le dépôt, et l’article les y lit.</p>
</div>
</section>

<section class="cta">
<div class="cta-box">
<h2>La Clean Architecture aide-t-elle un agent IA à écrire du logiciel ?</h2>
<p>L’article, en anglais : deux benchmarks, avec et sans l’architecture, sur un modèle fort et un plus faible, sur une base de code qui grandit, un changement de stockage, puis une place de marché où circule de l’argent.</p>
<a class="btn btn-primary btn-gradient-vertical" href="${article}">Lire l’article</a>
</div>
</section>

<section id="concepts" class="section">
<div class="section-inner narrow">
<div class="headline">
<p class="tagline">Concepts</p>
<h2>Chaque concept, une fois, dans chaque langage</h2>
<p class="sub">Le vocabulaire aussi est de la donnée. Chaque concept nomme ses règles et ses décisions, et le binding de chaque langage nomme le fichier unique qui le montre. La carte dit ce qu’un langage doit encore.</p>
</div>
<div class="domains">
${concepts
  .map(
    ([name, title, text], index) => `<div class="domain">
${svg(name, `icon${index % 2 ? ' is-primary' : ''}`)}
<div>
<h3>${title}</h3>
<p>${text}</p>
</div>
</div>`,
  )
  .join('\n')}
</div>
</div>
</section>

<section id="tooling" class="content">
<div class="content-head">
<p class="tagline">Outillage</p>
<h2>L’interroger, la changer, la tenir</h2>
</div>
<div class="content-body">
<div class="content-row">
<div class="content-text">
<h3 class="lead">L’architecture répond depuis ses propres données</h3>
<div class="content-items">
<div class="content-item"><span class="bullet">${svg('check', 'bullet-icon')}</span><div><h4>N’importe quelle règle, expliquée</h4><p>L’énoncé, la raison, la remédiation et le fichier qui la montre, dans le langage depuis lequel on demande ; <code>--json</code> pour un outil.</p></div></div>
<div class="content-item"><span class="bullet">${svg('check', 'bullet-icon')}</span><div><h4>N’importe quel import, jugé avant d’être écrit</h4><p>Ce fichier aurait-il le droit d’importer celui-là, et quelle règle le dit.</p></div></div>
<div class="content-item"><span class="bullet">${svg('check', 'bullet-icon')}</span><div><h4>Le domaine, le storm, l’inventaire</h4><p>La carte des contextes avec ses contrats lus dans le code, l’event storm et son tableau, ce que chaque arbre dit que l’application est.</p></div></div>
</div>
</div>
<div class="content-image">
${terminal('yarn architecture', [
  '$ yarn architecture rule ARCH-INWARD',
  'ARCH-INWARD (dependencies-point-inward) — enforced by linter',
  'Dependencies point inward and contexts stay apart — each file',
  'imports only what its row of the dependency table allows;',
  'there is no exception and none may be added.',
  'Why:',
  '  A boundary that can be crossed when convenient is not a',
  '  boundary; the table is the architecture.',
  '',
  '$ yarn architecture can-import typescript/src/Contexts/Notes/Domain/Note/Note.ts \\',
  '    @Contexts/Security/Domain/Account/Account',
  'refused by ARCH-DOMAIN: typescript/src/Contexts/Notes/Domain/Note/Note.ts',
  "may not import '@Contexts/Security/Domain/Account/Account'",
  'The Domain layer depends on nothing outside its own Domain, the',
  "building blocks' Domain and the shared kernel's Domain.",
])}
</div>
</div>
</div>
<div class="content-body">
<div class="content-row reversed">
<div class="content-text">
<h3 class="lead">Une fonctionnalité se décide d’abord, puis se tient</h3>
<div class="content-items">
<div class="content-item"><span class="bullet">${svg('check', 'bullet-icon')}</span><div><h4>Un storm avant le code</h4><p>Les faits d’abord, puis qui les demande, ce qui décide, ce qui réagit, ce qu’un écran attend. Ce que la session a décidé s’écrit, dans des mots que tous les langages partagent.</p></div></div>
<div class="content-item"><span class="bullet">${svg('check', 'bullet-icon')}</span><div><h4>Une checklist pour chaque sorte de chose</h4><p>De quoi une nouvelle commande est faite et où elle va, avec le fichier canonique à copier, dans le langage que l’on écrit.</p></div></div>
<div class="content-item"><span class="bullet">${svg('check', 'bullet-icon')}</span><div><h4>Deux modes, imposés</h4><p>Le mode fonctionnalité refuse un changement des briques de base, du noyau partagé, des conventions ou des décisions. Le mode architecture demande l’ADR.</p></div></div>
</div>
</div>
<div class="content-image">
${terminal('une fonctionnalité, de bout en bout', [
  '$ yarn architecture storm --expect conventions/storms/share-a-note.yaml',
  'share-a-note (done): The owner of a note shares it with another',
  'account, which can then read it, and the people a note is shared',
  'with are told about it.',
  'The code carries the storm: the typescript inventory is the expected one.',
  '',
  '$ yarn architecture checklist command --language rust',
  'A new command goes in rust/src/contexts/<context>/application/',
  '  src/commands/<use_case>.rs',
  '- The command: a struct with a named payload and nothing more …',
  '- The handler in the same file …',
  'Canonical example:',
  '  rust/src/contexts/notes/application/src/commands/edit_note.rs',
  '',
  '$ yarn architecture mode feature --base main',
  'feature mode: the 3 changed file(s) are within it.',
])}
</div>
</div>
</div>
<div class="content-body">
<div class="content-row">
<div class="content-text">
<h3 class="lead">Chaque arbre dit la même application</h3>
<div class="content-items">
<div class="content-item"><span class="bullet">${svg('check', 'bullet-icon')}</span><div><h4>Une API, un scénario</h4><p>Un client boîte noire de 32 étapes parcourt le serveur qui tourne et passe sur chacun : les mêmes routes, codes de statut, formes de corps et noms publics.</p></div></div>
<div class="content-item"><span class="bullet">${svg('check', 'bullet-icon')}</span><div><h4>Un inventaire, tenu égal</h4><p>L’outil de chaque langage écrit ce que son arbre dit que l’application est ; la vérification en refuse deux qui diffèrent. Une différence se ferme dans l’arbre, jamais dans l’inventaire.</p></div></div>
<div class="content-item"><span class="bullet">${svg('check', 'bullet-icon')}</span><div><h4>Une carte qui est vraie</h4><p>Chaque fichier que nomme la carte des concepts existe, chaque lien résout, rien ne réduit le linter au silence, et les règles d’import générées refusent et autorisent ce que disent les sondes.</p></div></div>
</div>
</div>
<div class="content-image">
${terminal('les vérifications', [
  '$ yarn architecture inventory rust',
  'rust: the same application as typescript',
  '',
  '$ yarn check:conventions',
  '✓ contract v1, TypeScript binding: 30 rules, 49 concepts, 4 contexts',
  '  match the tree; 4 language(s) in the map; the documents are rendered',
  '  from it; every documentation link resolves; no eslint-disable;',
  '  1365 import probes behave and name their rule; the context map is',
  '  true to the code (4 links); the event storm is read from the code',
  '  (11 commands, 9 policies); one application in 4 inventories.',
])}
</div>
</div>
</div>
</section>

<section id="languages" class="section">
<div class="section-inner">
<div class="headline">
<p class="tagline">Langages</p>
<h2>La lancer, dans le langage que vous lisez le mieux</h2>
<p class="sub">Chaque serveur écoute sur le même port et répond à la même API sous <code>/v1</code>. Chaque langage a son README, où la requête est suivie de bout en bout, et son guide pour y travailler, à la main ou avec un agent.</p>
</div>
<div class="cards languages">
${languages
  .map(
    language => `<div class="card">
<h3>${language.name}</h3>
<p class="label">Lancer le serveur</p>
<pre><code>${escape(language.run)}</code></pre>
<p class="label">La tenir à l’architecture</p>
<pre><code>${escape(language.check)}</code></pre>
</div>`,
  )
  .join('\n')}
</div>
</div>
</section>

<section class="founder">
<div class="founder-box">
<img src="assets/img/exostic.svg" width="144" height="21" alt="Exostic">
<div class="founder-text">
<p class="tagline">Qui le fait</p>
<h2>Jérémy Gay, Exostic</h2>
<p>Ingénierie produit, logicielle et système. La référence, son outillage et les expériences sont construits et rédigés avec un assistant IA ; les corrections sont bienvenues en issues sur le dépôt.</p>
</div>
<div class="founder-actions">
<a class="btn btn-sm" href="https://exostic.com/" target="_blank" rel="noopener">exostic.com</a>
<a class="founder-link" href="${repo}/issues" target="_blank" rel="noopener">Ouvrir une issue</a>
</div>
</div>
</section>
</main>

<footer>
<div class="footer-inner">
<div class="footer-card">
<a class="brand" href="./">CLEAN-DDD</a>
<p class="footer-links"><a href="${article}" hreflang="en">L’article</a> · <a href="${repo}" target="_blank" rel="noopener">GitHub</a> · <a href="${blob('docs/adr')}" target="_blank" rel="noopener">Décisions</a> · <a href="${blob('docs/evaluations/README.md')}" target="_blank" rel="noopener">Registres</a></p>
<p class="legal first">Licence MIT · <code>npm i clean-ddd</code> pour l’outillage</p>
</div>
<p class="footer-note">© ${year} <a href="https://exostic.com/" target="_blank" rel="noopener">Exostic</a> · une architecture, quatre langages, chaque chiffre lu dans les registres.</p>
</div>
</footer>
`;

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CLEAN-DDD — Clean Architecture &amp; DDD, une implémentation de référence</title>
<meta name="description" content="Une implémentation de référence de la Clean Architecture et du Domain-Driven Design, écrite pour être lue, en TypeScript, Rust, Python et Go, depuis une seule architecture qui est de la donnée et que l’outillage fait respecter ; puis mesurée avec des agents de code IA.">
<meta property="og:title" content="CLEAN-DDD — Clean Architecture &amp; DDD, une implémentation de référence">
<meta property="og:description" content="Une petite application, chaque concept une fois, quatre langages, une architecture qui est de la donnée. Mesurée avec des agents IA.">
<meta property="og:type" content="website">
<link rel="preload" href="assets/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<style>
@font-face {
  font-family: 'Inter Variable';
  font-style: normal;
  font-display: swap;
  font-weight: 100 900;
  src: url('assets/fonts/inter-latin-wght-normal.woff2') format('woff2-variations');
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
.hero { position: relative; height: 100vh; height: 100svh; min-height: 640px; width: 100%; overflow: hidden; }
.hero-picture { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 120%, rgba(76, 53, 132, 0.55), transparent 60%); }
.glow { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.55; }
.glow-a { width: 42vw; height: 42vw; left: -8vw; top: 8vh; background: #4c3584; }
.glow-b { width: 36vw; height: 36vw; right: -6vw; top: 18vh; background: rgba(228, 59, 125, 0.45); }
.glow-c { width: 30vw; height: 30vw; left: 38vw; bottom: -14vh; background: rgba(255, 82, 17, 0.3); }
.hero-content { position: absolute; inset: 0; padding: 5.5rem 1.5rem 2.5rem; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
.hero .tagline { margin-bottom: 1rem; }
.hero h1 { font-size: 2.5rem; line-height: 1.1; margin-bottom: 1.25rem; color: #e5e7eb; max-width: 34ch; }
.hero p:not(.tagline) { max-width: 48rem; margin: 0 auto 1.5rem; font-size: 1.125rem; line-height: 1.65rem; color: var(--text-soft); }
.hero-actions { max-width: 20rem; margin: 0 auto; padding-top: 0.5rem; display: flex; flex-direction: column; gap: 1rem; width: 100%; }
.hero-actions .btn { width: 100%; }
@media (min-width: 640px) {
  .hero-content { padding-left: 0; padding-right: 0; }
  .hero h1 { font-size: 3.25rem; }
  .hero p:not(.tagline) { font-size: 1.25rem; line-height: 1.75rem; }
  .hero-actions { max-width: 32rem; flex-direction: row; justify-content: center; }
  .hero-actions .btn { width: auto; }
}

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

/* ---------- Measured ---------- */
.stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; margin-bottom: 2rem; }
.stat { padding: 1.25rem 1.5rem; background: var(--bg-panel); border: 1px solid var(--border); border-radius: 0.375rem; }
.stat .figure { font-size: 2.25rem; font-weight: 800; line-height: 1.1; letter-spacing: -0.04em; background: var(--gradient-text); -webkit-background-clip: text; background-clip: text; color: transparent; font-variant-numeric: tabular-nums; }
.stat .what { margin-top: 0.5rem; font-size: 0.9rem; line-height: 1.35; color: var(--text-muted); }
@media (min-width: 768px) { .stats { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1.5rem; } }
.verdict { display: grid; gap: 1.5rem; }
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
@media (min-width: 768px) { .domain .icon { width: 3rem; height: 3rem; padding: 0.75rem; } .domain h3 { font-size: 1.3rem; } }

/* ---------- Call to action ---------- */
.cta { max-width: 72rem; margin: 0 auto; padding: 3rem 1rem; }
.cta-box { max-width: 48rem; margin: 0 auto; padding: 1.5rem; text-align: center; border: 1px solid var(--border); border-radius: 0.375rem; }
.cta-box h2 { font-size: 1.75rem; line-height: 1.2; margin-bottom: 1rem; }
.cta-box p { font-size: 1.125rem; line-height: 1.65rem; color: var(--text-dim); }
.cta-box .btn { margin-top: 1.5rem; width: 100%; max-width: 20rem; }
@media (min-width: 640px) { .cta { padding-left: 1.5rem; padding-right: 1.5rem; } .cta-box h2 { font-size: 2.25rem; } .cta-box p { font-size: 1.25rem; line-height: 1.75rem; } .cta-box .btn { width: auto; } }
@media (min-width: 768px) { .cta { padding-top: 5rem; padding-bottom: 5rem; } }

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
${body}
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

writeFileSync(join(here, 'index.html'), html);
process.stdout.write('site/index.html written\n');
