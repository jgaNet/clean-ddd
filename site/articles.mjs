/**
 * The articles the site publishes, one entry each, in every language it is written in: what the
 * list page shows (title, author, dates) and what each article's page takes for its own head.
 * Dates are ISO days; the pages format them for their language. A new article is a new entry
 * here, its prose under site/article/, and a build.
 */
export const articles = [
  {
    slug: 'architecture-and-ai-agents',
    author: { name: 'Jérémy Gay', url: 'https://exostic.com/' },
    published: '2026-10-30',
    updated: '2026-11-08',
    en: {
      file: 'article.html',
      title: 'Does Clean Architecture help an AI agent write software?',
      description:
        'A controlled benchmark on a notes application: the same seven features built by coding agents with and without the architecture, against hidden tests, and what the tests cannot see read by independent readers.',
    },
    fr: {
      file: 'article.fr.html',
      title: 'La Clean Architecture aide-t-elle un agent IA à écrire du logiciel ?',
      description:
        'Un benchmark contrôlé sur une application de notes : les mêmes sept fonctionnalités construites par des agents de code avec et sans l’architecture, face à des tests cachés, et ce que les tests ne voient pas lu par des lecteurs indépendants.',
    },
  },
  {
    slug: 'where-the-architecture-should-pay',
    author: { name: 'Jérémy Gay', url: 'https://exostic.com/' },
    published: '2026-10-30',
    en: {
      file: 'four-more-experiments.html',
      title: 'Where the architecture should pay: four more experiments',
      description:
        'A weaker model, a growing codebase, a change of storage, the fan-out’s contract given to one agent: four conditions the architecture is claimed to pay under, each run with its prediction written before.',
    },
    fr: {
      file: 'four-more-experiments.fr.html',
      title: 'Là où l’architecture devrait payer : quatre expériences de plus',
      description:
        'Un modèle plus faible, une base de code qui grandit, un changement de stockage, le contrat de la répartition donné à un seul agent : quatre conditions sous lesquelles l’architecture est censée payer, chacune avec sa prédiction écrite avant.',
    },
  },
  {
    slug: 'openstay',
    author: { name: 'Jérémy Gay', url: 'https://exostic.com/' },
    published: '2026-11-04',
    updated: '2026-11-08',
    en: {
      file: 'openstay.html',
      title: 'OpenStay: fifty features, then toward a hundred',
      description:
        'A lodging marketplace built feature by feature by agents, on three plain trees and three Clean DDD trees, with money through a payment provider and a change of database not announced in advance; what the tests see, what they cannot, and where every tree stopped.',
    },
    fr: {
      file: 'openstay.fr.html',
      title: 'OpenStay : cinquante fonctionnalités, puis vers cent',
      description:
        'Une place de marché de logements construite fonctionnalité par fonctionnalité par des agents, sur trois arbres nus et trois arbres Clean DDD, avec de l’argent par un prestataire de paiement et un changement de base non annoncé ; ce que les tests voient, ce qu’ils ne voient pas, et où chaque arbre s’est arrêté.',
    },
  },
];

/** A day, written for a language: `30 October 2026`, `30 octobre 2026`. */
export const day = (iso, locale) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
