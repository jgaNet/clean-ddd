/** L’article en français : J6 sur Tally, trois bras hors échantillon. Sa prose autour des chiffres que build.mjs calcule. */
export const body = ctx => {
  const { T, charts, tables, link, usd, fix, home, list, listLabel, hrefs, other, median } = ctx;
  const counted = arm => T.trees.filter(tree => tree.arm === arm).map(tree => tree.counted);
  const med = arm => median(counted(arm));
  const low = arm => Math.min(...counted(arm));
  const high = arm => Math.max(...counted(arm));
  const perRequest = arm => median(T.arms[arm].perRequest);
  const change = n => T.changes.find(c => c.n === n);
  const pct = count => Math.round((count / 120) * 100);
  const n = (value, digits = 0) =>
    Number(value).toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `
<header class="title">
<p class="home"><span class="crumbs"><a href="${home}">← CLEAN-DDD</a><span aria-hidden="true">·</span><a href="${list}">${listLabel}</a></span><a class="lang-switch" href="${other.href}" hreflang="${other.lang}" lang="${other.lang}" aria-label="${other.label}">${other.code}</a></p>
<h1>Trois bras sur Tally : ce que l’architecture achète, et ce qu’elle coûte</h1>
<p class="dek">On répète depuis trente ans qu’une bonne architecture coûte au début et rapporte ensuite. On le répète, on le mesure rarement, parce que l’expérience est hors de prix : la même application écrite plusieurs fois, dans plusieurs formes, par des équipes comparables, puis changée sous les mêmes demandes. Les agents de code la rendent abordable. J6 l’a menée : neuf applications écrites par des agents, trois architectures, quarante demandes sur lesquelles aucune n’avait été réglée, 360 livraisons, ${usd(n(T.usd.spent, 2))}.</p>
<p class="byline">19 novembre 2026 · Les expériences <a href="https://github.com/jgaNet/clean-ddd">clean-ddd</a> · Chaque chiffre ci-dessous est copié du ${link(T.records.run, 'compte rendu du run')}, lu contre ${link(T.records.registration, 'les bandes enregistrées avant lui')}.</p>
</header>

<div class="answer">
<p><strong>La réponse courte.</strong> Chaque arbre a livré les quarante demandes : ${T.delivered} sur ${T.delivered}, dans chaque bras.</p>
<ul>
<li><strong>L’architecture n’a pas acheté la correction.</strong> Le plus petit modèle a livré du premier coup ${pct(T.arms.S.firstStep)} % des demandes du bras nu, ${pct(T.arms.L.firstStep)} % de celles de Lite et ${pct(T.arms.F.firstStep)} % de celles de Full. Un arbre plat de 7 000 lignes et un arbre Full de 20 000 ont fini au même endroit.</li>
<li><strong>Elle a changé la nature des erreurs.</strong> Les arbres nus ont échoué, systématiquement, sur une règle portée depuis une demande antérieure ; les arbres structurés jamais. Ils ont échoué sur la mécanique : un redémarrage, un déplacement du stockage, un audit déplacé avec une fusion.</li>
<li><strong>Elle s’est payée, et ne s’était pas remboursée à la demande 40.</strong> Full a coûté ${n(med('F') / med('S'), 1)} fois le bras nu par arbre (${usd(n(med('F'), 2))} contre ${usd(n(med('S'), 2))}, médianes), et les quatre changements que personne n’annonçait lui ont coûté plus, pas moins.</li>
<li><strong>Lite n’a pas trouvé sa place.</strong> Il a convergé vers la forme de Full en quelques demandes et coûté ${Math.round((perRequest('L') / perRequest('F')) * 100)} % de Full par demande livrée, avec les mêmes erreurs et plus de régressions.</li>
</ul>
<p>D’où venait la question : <a href="${hrefs.j5b}">OpenStay jusqu’à cent</a> ; avant lui, <a href="${hrefs.openstay}">OpenStay</a>, <a href="${hrefs.extensions}">quatre expériences de plus</a> et <a href="${hrefs.control}">le contrôle</a>.</p>
</div>

<h2>Le protocole</h2>
<p>${link(T.records.protocol, 'Le protocole')} et ${link(T.records.registration, 'son enregistrement')} ont été écrits, et les hypothèses avec leurs bandes de lecture commitées, avant tout run. Personne ne pouvait déplacer la ligne d’arrivée après la course.</p>
<ul>
<li><strong>Une application, Tally :</strong> un groupe de personnes qui partagent des dépenses. Des groupes, un grand livre, des soldes, des règlements en espèces ou par un prestataire de paiement, des devises, des dépenses récurrentes, des reçus, un audit, la fusion de groupes, la suppression d’un compte. Son domaine n’apparaît dans aucun guide des bras, et ses demandes ont été écrites après leurs règles : aucun bras n’a été réglé sur l’examen qu’il passait (${link(T.records.kit, 'le kit')}).</li>
<li><strong>Quarante demandes,</strong> livrées une à une dans l’ordre, chacune avec son fragment d’API et, pour les bras structurés, un <em>event storm</em> du modèle attendu. Chacune a ses tests cachés, écrits et relus avant le run, que l’agent ne voit jamais ; ils exigent dès le premier carnet de la concurrence (vingt dépenses envoyées à deux serveurs en même temps) et de la durabilité (un serveur tué entre un commit et une publication). Quatre demandes, 10, 20, 30 et 40, sont des changements annoncés à personne : un reste de division attribué autrement, un départ avec un solde, SQLite vers PostgreSQL, une précision monétaire qui change.</li>
<li><strong>Trois bras,</strong> au sens des essais cliniques (<em>arm</em> en anglais) : trois groupes, chacun recevant un traitement et un seul, comparés entre eux ; le traitement est l’architecture donnée à l’agent, et tout le reste est identique. <strong>Nu</strong> : un projet TypeScript ordinaire et un guide, tenu par ses propres vérifications. <strong>Full</strong> : une application créée par <code>clean-ddd create</code>, avec ses contextes bornés, ses agrégats, son outbox transactionnelle, ses événements d’intégration, ses ports possédés et son câblage en données, tenue par un gate qui refuse une livraison hors du contrat. <strong>Lite</strong> : les frontières de Full sans la cérémonie à l’intérieur d’un contexte ; des cas d’usage comme fonctions pures, et l’agrégat, l’outbox ou la réaction amenés seulement quand un déclencheur l’exige.</li>
<li><strong>Trois arbres par bras,</strong> neuf en tout, trois à la fois sur une machine. Chaque demande est tentée d’abord par le plus petit modèle, puis par le suivant quand les tests cachés échouent, puis par le plus fort. Même échelle, même juge, mêmes budgets, mêmes amendements du kit pour chaque bras.</li>
</ul>

<h2 id="correctness">L’architecture n’a pas acheté la correction</h2>
<p>Les neuf arbres ont livré les quarante demandes. Aucun arbre ne s’est arrêté : les deux arrêts que le juge avait prononcés étaient des défauts du kit, trouvés en rejouant le test fautif sur la branche de l’arbre, et révoqués pour chaque bras.</p>
<p>Plus frappant : le plus petit modèle, avec un bon kit, a livré presque tout dans chaque arbre. Un arbre nu d’environ ${n(T.arms.S.source)} lignes de source et un arbre Full d’environ ${n(T.arms.F.source)} ont fini au même endroit. À cette taille, la structure n’est pas ce qui fait réussir un agent, et c’est la première chose que la référence doit cesser de laisser entendre.</p>

<h2 id="errors">Elle a changé la nature des erreurs</h2>
<p>Les échecs ne se ressemblent pas.</p>
<ul>
<li><strong>Les arbres nus ont échoué sur les mêmes demandes, pour la même raison :</strong> une règle posée par une demande antérieure et oubliée par une demande postérieure. La demande 18 (un paiement en attente compte comme payé) a mené deux arbres sur trois jusqu’au plus fort modèle ; la demande 23 (un membre parti met fin à la dépense récurrente) a fait monter les trois d’un échelon. Ce sont des erreurs de logique métier, celles qu’un client trouve en production.</li>
<li><strong>Les six arbres Lite et Full ont passé 18 et 23 au premier échelon.</strong> Leurs échecs sont ailleurs, dispersés, et portent sur la mécanique : la durabilité à travers un redémarrage (17, 24), le passage à PostgreSQL (30), un audit déplacé avec une fusion (31). Ce sont des erreurs qu’un test attrape.</li>
</ul>
<p>C’est la promesse mesurable que J6 met au jour, et elle pourrait devenir l’argument central de la référence : <strong>la structure déplace les erreurs de la logique, où un client les trouve, vers la mécanique, où un test les trouve.</strong> Avec la réserve que les comptes sont petits et qu’un seul lecteur, l’opérateur, les a classés.</p>

<h2 id="cost">Elle s’est payée, et ne s’était pas remboursée à la demande 40</h2>
${charts.tallyCost}
${tables.tallyTrees}
<p class="note">Le coût compté par arbre met de côté les tentatives qu’un défaut du kit a annulées ; le compte rendu donne les deux. Une escalade est une demande que le plus petit modèle n’a pas livrée, avec le modèle qui l’a fait.</p>
<ul>
<li><strong>Par arbre,</strong> la médiane du bras nu est de ${usd(n(med('S'), 2))} (${usd(n(low('S'), 2))} à ${usd(n(high('S'), 2))}), celle de Lite de ${usd(n(med('L'), 2))} (${usd(n(low('L'), 2))} à ${usd(n(high('L'), 2))}), celle de Full de ${usd(n(med('F'), 2))} (${usd(n(low('F'), 2))} à ${usd(n(high('F'), 2))}).</li>
<li><strong>L’écart se resserre à mesure que l’application grandit, et ne s’inverse jamais.</strong> Le rapport nu/Full passe de 1 pour ${n(T.arms.F.checkpoints[0] / T.arms.S.checkpoints[0])} au premier carnet à 1 pour ${n(T.arms.F.checkpoints[3] / T.arms.S.checkpoints[3], 1)} au quatrième. Les pentes du coût par demande ne sont pas plus plates côté Full : deux de ses trois arbres montent plus vite que le plus raide des arbres nus.</li>
</ul>
${charts.tallyCheckpoints}
<p>Les changements que personne n’annonçait tranchent plus net. L’hypothèse enregistrée disait que la structure paie au moment du changement. Elle a coûté plus cher :</p>
${charts.tallyChange}
${tables.tallyChange}
<ul>
<li><strong>La demande 30, le passage à PostgreSQL,</strong> a coûté à Full ${usd(n(change(30).F, 2))} par arbre en moyenne contre ${usd(n(change(30).S, 2))} au bras nu ; les trois arbres nus l’ont passée au premier échelon, Full une fois au premier, une fois au deuxième et une fois au troisième.</li>
<li><strong>La demande 40, la précision monétaire,</strong> ${usd(n(change(40).F, 2))} contre ${usd(n(change(40).S, 2))} ; la demande 20, ${usd(n(change(20).F, 2))} contre ${usd(n(change(20).S, 2))}.</li>
</ul>
<p>Sur ce kit et à cette taille, l’hypothèse n’est pas confirmée. Soit elle est fausse, soit elle demande une application plus grande ou des changements plus transversaux que ceux-ci. Dans les deux cas, la référence devrait cesser de l’affirmer sans cette réserve. Une prudence de plus : l’écart entre deux arbres d’un même bras (Full va de ${usd(n(low('F'), 2))} à ${usd(n(high('F'), 2))}) est aussi large que l’écart entre bras. Trois arbres par bras donnent une direction, pas un verdict.</p>

<h2 id="lite">Lite n’a pas trouvé sa place</h2>
<p>Lite devait être un Full allégé, qui n’amène l’agrégat et l’outbox que lorsque la pression l’exige. Sur Tally, la pression arrive à la demande 5. Les déclencheurs ont tiré presque aussitôt, et les trois arbres Lite ont convergé vers la forme de Full en quelques demandes : ${T.arms.L.aggregates[0]} ou ${T.arms.L.aggregates[1]} agrégats, comme Full, et ${n(T.arms.L.source[0])} à ${n(T.arms.L.source[1])} lignes de source contre ${n(T.arms.F.source)} pour Full.</p>
<ul>
<li><strong>Il a coûté ${Math.round((perRequest('L') / perRequest('F')) * 100)} % de Full par demande livrée</strong> (${usd(n(perRequest('L'), 2))} contre ${usd(n(perRequest('F'), 2))}, médianes des arbres), avec des étendues qui se chevauchent, la même signature d’erreurs et plus de régressions réelles (3 contre 1). La bande enregistrée disait Lite « supporté » à 0,6 fois Full sans chevauchement ; elle se lit <em>non supporté</em>, et la tendance ne va pas vers elle.</li>
<li><strong>Il a une qualité propre :</strong> c’est le bras le plus stable, sans un seul recours au plus fort modèle en 120 demandes livrées.</li>
</ul>
<p>Deux voies restent : abandonner Lite comme profil et le garder comme porte d’entrée (commencer par des cas d’usage ; le gate dit quand l’agrégat est dû), ou le redéfinir avec un déclencheur qui tire bien plus tard. Tel qu’il est, ce sont deux profils qui mesurent une seule chose. La décision appartient au mainteneur, avec le compte rendu pour preuve.</p>

<h2 id="bench">Ce que le run a coûté à l’examen lui-même</h2>
<p>Un protocole honnête rend compte de ses propres défauts. Les arbres en ont trouvé ${T.bench.kitDefects} dans le kit : la demande 18 nommait un intervalle seulement dans la prose de la demande 1, et le test caché de la demande 35 appelait une route que la demande 36 introduit. Les deux ont été diagnostiqués par rejeu, amendés pour chaque bras, et les tentatives mises de côté portent une mention <code>revoked</code> dans les journaux. Une règle du harnais a été amendée : un agent qui lit le texte de sa propre demande ne triche pas. ${T.bench.restarts} redémarrages de conteneur ont été absorbés, une course sur les créneaux corrigée, et le disque s’est rempli deux fois de bases de test que les arbres avaient laissées derrière eux, ${n(T.bench.databasesInAnHour)} en une heure.</p>
<p>Le tout pour ${usd(n(T.usd.spent, 2))} dépensés, ${usd(n(T.usd.counted, 2))} comptés, sur les ${usd(n(T.usd.allowed))} que les plans autorisaient.</p>

<h2 id="reference">Ce qui en est sorti pour clean-ddd</h2>
<p>Les échecs communs à Lite et Full pointaient trois absences du squelette, pas trois décisions d’architecture :</p>
<ul>
<li><strong>Aucun test ne tuait et ne redémarrait le serveur :</strong> rien ne tenait la promesse de l’outbox à travers un crash avant la demande 17.</li>
<li><strong>Aucun adaptateur PostgreSQL,</strong> ni unité de travail qui donne aux adaptateurs la connexion de la transaction et un verrou par clé pour une règle qui traverse plusieurs agrégats. La demande 30 a coûté à Full ${usd(n(change(30).F, 2))} contre ${usd(n(change(30).S, 2))} au bras nu.</li>
<li><strong>Aucun helper de test</strong> qui crée et supprime sa propre base.</li>
</ul>
<p>Les trois ont été ajoutés dans les deux jours, dans les building blocks, avec ${link(T.records.adr47, 'une décision')} qui dit d’où ils viennent.</p>
<p><strong>En une phrase :</strong> clean-ddd tient sa promesse de modèle, les règles sont portées d’une demande à l’autre et les erreurs deviennent mécaniques et testables ; il ne tient pas encore sa promesse économique, à quarante demandes la structure coûte plus du double et les changements n’ont pas été moins chers. La version suivante devrait affirmer la première, borner la seconde, décider du sort de Lite, et a déjà comblé les trois trous.</p>

<h2>Ce que ceci ne montre toujours pas</h2>
<ul>
<li><strong>Un seul kit, trois arbres par bras, un seul modèle au premier échelon.</strong> L’opérateur était l’unique lecteur des notations et l’auteur du kit.</li>
<li><strong>Pas de suite de chaos, pas de lecture indépendante de la maintenabilité, pas de mesure des décisions de Lite :</strong> ces scores ont été rayés pour Tally.</li>
<li><strong>Une cellule du tableau.</strong> Ce que J6 établit vaut pour une application de dépenses partagées de quarante demandes, écrite par des agents sur une échelle à trois échelons. Il dit laquelle. Le reste du tableau attend d’autres runs.</li>
</ul>

<h2>Le reproduire</h2>
<ul>
<li>${link(T.records.protocol, 'Le protocole')}, ${link(T.records.registration, 'l’enregistrement')} et ${link(T.records.kit, 'le kit')} : les quarante demandes, leurs fragments d’API, leurs storms et leurs tests cachés ;</li>
<li>${link(T.records.run, 'le compte rendu')}, carnet par carnet, chaque amendement daté ;</li>
<li>les neuf arbres et leurs journaux, dans <a href="${T.records.trees}">le dépôt de Tally</a> (<code>trees/&lt;arbre&gt;</code>, <code>logs/&lt;arbre&gt;</code>).</li>
</ul>
<p>Les chiffres de cette page sont copiés du compte rendu dans ${link('site/tally.mjs', 'site/tally.mjs')}.</p>

<footer>clean-ddd · expériences menées et rédigées avec un assistant IA. Les corrections sont bienvenues, en issue sur le dépôt.</footer>
`;
};
