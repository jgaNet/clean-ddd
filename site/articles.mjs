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
        'A controlled benchmark with and without the architecture, on a strong and a weaker model, over a growing codebase and a change of storage, then a lodging marketplace built to fifty features.',
    },
    fr: {
      file: 'article.fr.html',
      title: 'La Clean Architecture aide-t-elle un agent IA à écrire du logiciel ?',
      description:
        'Un benchmark contrôlé avec et sans l’architecture, sur un modèle fort et un plus faible, sur une base de code qui grandit et un changement de stockage, puis une place de marché de logements construite jusqu’à cinquante fonctionnalités.',
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
