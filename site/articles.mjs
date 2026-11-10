/**
 * The articles the site publishes, one entry each, in every language it is written in: what the
 * articles page shows (the research journey, step by step: title, author, dates, the question each
 * step asked, what it found, what it left open) and what each article's page takes for its own head.
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
      step: 'The control',
      question:
        'Does an architecture made explicit and enforced make an AI agent better at building a small application?',
      found:
        'No. The plain project delivered the same seven features, sooner and cheaper, with no difference in quality two readers could see. The tool did what it claims: it held the architecture exactly and made a fan-out of agents safe.',
      left: 'Where the architecture should pay: a weaker model, a growing codebase, a change of storage.',
    },
    fr: {
      file: 'article.fr.html',
      title: 'La Clean Architecture aide-t-elle un agent IA à écrire du logiciel ?',
      description:
        'Un benchmark contrôlé sur une application de notes : les mêmes sept fonctionnalités construites par des agents de code avec et sans l’architecture, face à des tests cachés, et ce que les tests ne voient pas lu par des lecteurs indépendants.',
      step: 'Le contrôle',
      question:
        'Une architecture explicite et imposée rend-elle un agent IA meilleur pour construire une petite application ?',
      found:
        'Non. Le projet nu a livré les mêmes sept fonctionnalités, plus tôt et moins cher, sans différence de qualité que deux lecteurs aient pu voir. L’outil a fait ce qu’il annonce : il a tenu l’architecture exactement et rendu sûre une répartition d’agents.',
      left: 'Là où l’architecture devrait payer : un modèle plus faible, une base de code qui grandit, un changement de stockage.',
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
      step: 'The conditions',
      question: 'Does it pay under the conditions it is claimed to pay under?',
      found:
        'Not on a small application. The plain project still delivered everything with a weaker model and stayed the soonest as the trees grew; the storage change stayed out of the domain, as promised, and still took twice the time.',
      left: 'Whether the return grows with the code, on an application that no longer fits in an agent’s head.',
    },
    fr: {
      file: 'four-more-experiments.fr.html',
      title: 'Là où l’architecture devrait payer : quatre expériences de plus',
      description:
        'Un modèle plus faible, une base de code qui grandit, un changement de stockage, le contrat de la répartition donné à un seul agent : quatre conditions sous lesquelles l’architecture est censée payer, chacune avec sa prédiction écrite avant.',
      step: 'Les conditions',
      question: 'Paie-t-elle sous les conditions où elle est censée payer ?',
      found:
        'Pas sur une petite application. Le projet nu a encore tout livré avec un modèle plus faible et est resté le plus rapide quand les arbres ont grandi ; le changement de stockage est resté hors du domaine, comme promis, et a quand même pris deux fois plus de temps.',
      left: 'Savoir si ce rendement grandit avec le code, sur une application qui ne tient plus dans la tête d’un agent.',
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
      step: 'The scale',
      question: 'Does it start to pay at fifty features, then toward a hundred?',
      found:
        'At fifty, every tree delivered and the plain trees stayed cheaper; the Clean DDD trees won in what the tests cannot see: the money, the contexts kept apart, a change of database kept out of the rules. Toward a hundred, every tree stopped on a rule nobody had written down, and stating it let the Clean DDD trees through.',
      left: 'The follow-on arms to a hundred, a second grading, the reading, and the side experiments.',
    },
    fr: {
      file: 'openstay.fr.html',
      title: 'OpenStay : cinquante fonctionnalités, puis vers cent',
      description:
        'Une place de marché de logements construite fonctionnalité par fonctionnalité par des agents, sur trois arbres nus et trois arbres Clean DDD, avec de l’argent par un prestataire de paiement et un changement de base non annoncé ; ce que les tests voient, ce qu’ils ne voient pas, et où chaque arbre s’est arrêté.',
      step: 'L’échelle',
      question: 'Commence-t-elle à payer à cinquante fonctionnalités, puis vers cent ?',
      found:
        'À cinquante, chaque arbre a livré et les arbres nus sont restés moins chers ; les arbres Clean DDD l’ont emporté sur ce que les tests ne voient pas : l’argent, les contextes séparés, un changement de base tenu hors des règles. Vers cent, chaque arbre s’est arrêté sur une règle que personne n’avait écrite, et l’énoncer a laissé passer les arbres Clean DDD.',
      left: 'Les bras de suite jusqu’à cent, une seconde correction, la lecture, et les expériences annexes.',
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
