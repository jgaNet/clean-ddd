/** L’article en français : J5b d’OpenStay, les deux arbres jusqu’à cent. Sa prose autour des chiffres que build.mjs calcule. */
export const body = ctx => {
  const { O, charts, tables, link, usd, home, list, listLabel, hrefs, other } = ctx;
  const [simple, clean] = O.j5b.trees;
  const total = tree => tree.totalUsd;
  const S = O.j5b.split;
  const n = (value, digits = 0) =>
    Number(value).toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `
<header class="title">
<p class="home"><span class="crumbs"><a href="${home}">← CLEAN-DDD</a><span aria-hidden="true">·</span><a href="${list}">${listLabel}</a></span><a class="lang-switch" href="${other.href}" hreflang="${other.lang}" lang="${other.lang}" aria-label="${other.label}">${other.code}</a></p>
<h1>OpenStay : jusqu’à cent, et ce qu’il a fallu</h1>
<p class="dek">Aucun arbre d’OpenStay n’avait atteint cent fonctionnalités : J5 les avait tous arrêtés, chacun là où une règle était implicite. J5b a rejoué les demandes 51 à 100 sur un arbre par bras, avec chaque règle trouvée par J5 écrite dès la première demande, et l’arbre Clean DDD réparti entre un agent par contexte. Les deux arbres ont atteint cent. Ce qu’il a fallu, et ce que ça a coûté, en dit plus sur l’endroit où le logiciel écrit par des IA casse que sur l’architecture qui gagne.</p>
<p class="byline">13 novembre 2026 · Les expériences <a href="https://github.com/jgaNet/clean-ddd">clean-ddd</a> · Chaque chiffre ci-dessous est copié du ${link(O.records.j5b, 'compte rendu de J5b')} et de ses journaux.</p>
</header>

<div class="answer">
<p><strong>La réponse courte.</strong> Les deux arbres ont atteint cent.</p>
<ul>
<li><strong>L’arbre nu a été ${n(total(clean) / total(simple), 1)} fois moins cher :</strong> ${usd(n(total(simple), 2))} contre ${usd(n(total(clean), 2))}.</li>
<li><strong>Il a aussi livré plus de demandes au premier échelon :</strong> ${simple.atStep[0]} sur 50 contre ${clean.atStep[0]}.</li>
<li><strong>Trois demandes ont échoué à tous les échelons, et aucune sur une frontière entre contextes.</strong> Chacune a échoué là où une demande avait fixé une règle que rien d’exécutable ne tenait :
<ul>
<li>la forme d’une erreur ;</li>
<li>un <code>null</code> dans un état ultérieur ;</li>
<li>l’heure.</li>
</ul>
Énoncer la règle une fois, dans le guide de l’arbre, a laissé passer chacune.</li>
<li><strong>Répartir les demandes de l’arbre Clean DDD entre un agent par contexte a été sûr, et n’a rien apporté</strong> que nous ayons pu mesurer.</li>
</ul>
<p>Là où en étaient les arbres avant, c’est <a href="${hrefs.openstay}#j5">l’article OpenStay</a> ; les premiers benchmarks sont <a href="${hrefs.control}">le contrôle</a> et <a href="${hrefs.extensions}">quatre expériences de plus</a>.</p>
</div>

<h2>Là où J5 s’était arrêté</h2>
<p>${link(O.records.j5, 'J5')} a mené six arbres, trois par bras, vers la demande 100. Chaque arbre s’est arrêté, entre 51 et 73, sur une jointure où une règle dont l’application avait besoin était implicite :</p>
<ul>
<li>un identifiant redonné dans le contexte suivant ;</li>
<li>une commande anonyme répondue <code>202</code> ;</li>
<li>une lecture qui faisait expirer ce qu’elle lisait ;</li>
<li>un refus répondu <code>503</code>.</li>
</ul>
<p>Énoncer chaque règle a laissé passer les arbres ; le plus avancé de chaque bras a atteint 85, aucun cent. Puis la machine et ses arbres ont été perdus.</p>

<h2>Le protocole</h2>
<p>Le ${link(O.records.j5bProtocol, 'protocole de J5b')} a été écrit avant tout essai.</p>
<ul>
<li><strong>Un arbre par bras,</strong> les deux allés le plus loin : simple-3 (un projet TypeScript nu) et clean-3 (un projet créé par notre outil, tenu à son gate). Les deux sont partis de leur tête à la demande 50.</li>
<li><strong>Chaque règle trouvée par J5, dès la première demande,</strong> sous forme de sections du guide de chaque arbre. L’arbre Clean DDD avait aussi le kit sur lequel J5 s’est terminé : l’identité née une fois, une relation entre deux contextes testée de bout en bout, et l’appelant refusé tout de suite.</li>
<li><strong>L’échelle :</strong> chaque demande commence par le plus petit modèle et monte d’un échelon quand ses tests cachés ou ses vérifications échouent. Un échec est rejoué seul avant de compter.</li>
<li><strong>Une réparation par échec.</strong> Quand une demande échoue à tous les échelons, son échec est jugé au regard des demandes. Le guide de l’arbre gagne alors une section qui énonce la règle enfreinte, jamais la réponse d’un test, et la demande est rejouée. La section peut être reformulée une fois ; un second échec ensuite arrête l’arbre.</li>
<li><strong>Les 14 demandes de l’arbre Clean DDD qui traversent des contextes ont été réparties :</strong> un agent par contexte, celui en amont écrivant le contrat en premier, et un intégrateur qui fusionne, passe le gate sur le résultat et renvoie chaque échec à son propriétaire.</li>
</ul>
<p><strong>Ce qu’il ne peut pas montrer :</strong></p>
<ul>
<li>il est dans l’échantillon : chaque règle a été écrite après avoir vu des échecs sur ces mêmes demandes ;</li>
<li>il n’a qu’un arbre par bras ;</li>
<li>l’arbre Clean DDD mêle l’architecture et la répartition.</li>
</ul>

<h2 id="hundred">Les deux arbres à cent</h2>
${charts.j5bCost}
${tables.j5bTrees}
<p class="note"><code>0</code>, <code>1</code> et <code>2</code> sont l’échelon auquel une demande a été livrée : le plus petit modèle, l’intermédiaire et le plus fort. <code>R</code> est une demande qui a échoué à tous les échelons, a été réparée une fois puis livrée. Chaque arbre a tourné trois fois : une fois, puis une fois après chaque réparation.</p>
<ul>
<li><strong>L’arbre nu a fini le premier et moins cher :</strong>
<ul>
<li>le 12 novembre, ${simple.hours} heures après son départ, pour ${usd(n(total(simple), 2))} ;</li>
<li>une demande a pris ${simple.meanMinutes} minutes en moyenne, du moment où elle est donnée à sa livraison.</li>
</ul></li>
<li><strong>L’arbre Clean DDD a fini un jour plus tard :</strong>
<ul>
<li>pour ${usd(n(total(clean), 2))}, ${clean.meanMinutes} minutes par demande ;</li>
<li>à cent, ${n(clean.source)} lignes de source contre ${n(simple.source)} ;</li>
<li>${clean.contexts} contextes tenus séparés, et ${clean.adrFiles} fiches de décision écrites en chemin.</li>
</ul></li>
<li><strong>L’écart vient surtout du coût des échecs, pas de l’écriture.</strong> Sur un premier essai avec le plus petit modèle et un seul agent, l’arbre Clean DDD a coûté ${usd(n(O.j5b.firstAttempt.clean.usd, 2))} contre ${usd(n(O.j5b.firstAttempt.simple.usd, 2))}, environ 35 % de plus. Le reste de l’écart vient de ce qui suit un échec : une montée vers un plus grand modèle, une répartition, une demande échouée à tous les échelons.</li>
<li><strong>Une demande a mené les deux arbres jusqu’au modèle le plus fort,</strong> sur le même test caché : un import de calendrier doit laisser à part les blocages de l’hôte et ne rien prendre à une réservation.</li>
</ul>

<h2 id="seams">Trois échecs, trois jointures</h2>
<p>Telles que les ${link(O.records.j5bRepairs, 'réparations de J5b')} les consignent :</p>
<ul>
<li><strong>clean-3, demande 61.</strong>
<ul>
<li><em>L’échec :</em> l’erreur d’une opération se lisait <code>{ type, message }</code>, la forme que lui donne l’architecture de référence. La demande dit <code>"&lt;NOM&gt;"</code>, le seul nom de la règle.</li>
<li><em>La réparation :</em> une section qui dit que la forme qu’une demande donne l’emporte sur l’habitude du code. Elle a tenu une fois reformulée.</li>
</ul></li>
<li><strong>simple-3, demande 73.</strong>
<ul>
<li><em>L’échec :</em> le paiement d’une réservation expirée se lisait <code>null</code>, là où une demande antérieure ne le rend <code>null</code> que pour une réservation encore en attente.</li>
<li><em>La réparation :</em> une section sur ce que veut dire <code>null</code>. La première formulation a échoué, la seconde a tenu.</li>
</ul></li>
<li><strong>clean-3, demande 73.</strong>
<ul>
<li><em>L’échec :</em> le balayage qui fait expirer les réservations impayées prenait l’heure de la machine. Le reste de l’arbre prenait l’horloge que les tests décalent, donc le balayage ne voyait aucune échéance passée.</li>
<li><em>La réparation :</em> une section qui dit que l’application n’a qu’un seul « maintenant ». Elle a tenu dès la première formulation.</li>
</ul></li>
</ul>
<p><strong>Aucun des trois n’est une frontière franchie.</strong> Dans les deux bras, une demande a fixé une règle tôt ; rien d’exécutable ne la tenait là où elle est née ; une demande tardive en avait besoin. C’est de nouveau le motif de J5, sur les jointures que les règles de J5 n’avaient pas nommées.</p>
<p>L’architecture en a intégré deux :</p>
<ul>
<li>la forme d’une opération à la lecture est désormais dans son contrat (${link('docs/adr/0041-an-operation-read-is-in-the-contract.md', 'ADR 41')}) ;</li>
<li>une seule horloge, passée par le câblage, est une règle que son linter tient dans quatre langages (${link('docs/adr/0042-an-application-has-one-clock.md', 'ADR 42')}).</li>
</ul>

<h2 id="split">Un agent par contexte : sûr, et pas plus rapide</h2>
<p>Les ${S.requests} demandes de clean-3 qui traversent des contextes ont été écrites par un agent par contexte, avec un intégrateur.</p>
${tables.j5bSplit}
<ul>
<li><strong>C’était sûr.</strong> L’intégrateur a validé ${S.integrated[0]} résultats fusionnés sur ${S.integrated[1]}, en ${S.rounds} tours.</li>
<li><strong>Là où la répartition a échoué à tous les échelons, un seul agent avec le modèle le plus fort a échoué aussi,</strong> sur la même règle (${S.controls[0]} sur ${S.controls[1]} livrées).</li>
<li><strong>Elle a coûté plus cher et pris plus de temps :</strong> ${usd(n(S.usd[0], 2))} par demande contre ${usd(n(S.usd[1], 2))}, et encore ${usd(n(S.usdWithoutCostliest, 2))} sans ses trois demandes les plus chères. Les agents propriétaires ont coûté ${usd(n(S.ownersUsd, 2))}, la moitié du total de l’arbre, pour 14 demandes sur 50.</li>
<li><strong>La moitié des verdicts propres des propriétaires ont échoué</strong> (${S.ownerVerdicts[0]} sur ${S.ownerVerdicts[1]}), la plupart parce que l’autre propriétaire n’avait pas encore écrit sa part. Chacun a renvoyé un agent pour un tour qui ne pouvait pas le corriger.</li>
<li><strong>L’estimation de l’échelle elle-même recommandait un seul agent</strong> sur les ${S.estimate.asked} demandes où elle a été consultée. Ces demandes étaient petites, sous la taille où écrire en parallèle économise plus que ne coûtent le contrat et l’intégration.</li>
</ul>
<p>Rien ici ne mesure la répartition sur une fonctionnalité assez grande pour qu’elle paie. L’échelle ne répartit désormais que là où son estimation le recommande.</p>

<h2 id="bench">Le banc</h2>
<p><strong>La notation était devenue aussi longue que l’écriture.</strong> Les tests cachés de chaque demande et de toutes les précédentes tournaient un fichier à la fois, 25 à 40 minutes vers la demande 80. Une notation parallèle les fait tourner dans un seul processus, deux à la fois, et rejoue seul un fichier qui y échoue. Elle a été validée sur les deux arbres avant d’être utilisée :</p>
${tables.j5bGrading}
<p>clean-3 a été noté ainsi à partir de la demande 86 : 10 à 11 minutes par notation, aucun fichier rejoué seul. Le plan consigne le changement, et le compte rendu donne les temps de clean-3 en deux parties.</p>
<p><strong>La machine est intervenue, sans changer aucun verdict</strong> (${link(O.records.j5bIncidents, 'le journal des incidents')}) :</p>
<ul>
<li>${O.j5b.restarts} redémarrages du conteneur, chacun coûtant un essai ;</li>
<li>un essai repris qui a attendu ${O.j5b.staleSlotHours} heures une place sur la machine, que son propre identifiant de processus, réattribué, tenait ; c’est corrigé dans le banc ;</li>
<li>un disque tombé à 1,4 Go ;</li>
<li>une montée d’échelon pour le seul formatage, le genre d’intendance qu’un outil devrait faire à la place d’un agent.</li>
</ul>

<h2>Ce que J5b ajoute</h2>
<ul>
<li><strong>Avec les règles écrites dès le départ, les deux bras atteignent cent.</strong> Ce qui a arrêté les arbres de J5 n’était pas la taille du code. C’étaient des règles que personne n’avait écrites, et on peut les écrire.</li>
<li><strong>Les échecs qui restent sont dans la spécification, dans les deux bras.</strong> Une forme, un sens, une heure : des choses qu’une demande décide, que des tests et des contrats pourraient tenir là où elles naissent. Plus de couches ne les auraient pas tenues.</li>
<li><strong>Le coût de l’architecture est surtout celui de ses échecs,</strong> pas de ses premiers essais. Un premier essai coûte environ un tiers de plus ; les montées d’échelon et les répartitions font le reste.</li>
<li><strong>Les bénéfices de l’architecture ne se sont pas vus ici, parce que rien ne les a testés.</strong> Ses contextes sont restés séparés, et aucun changement n’est arrivé sans annonce. C’est la mesure que la prochaine campagne met en premier.</li>
</ul>

<h2>Ce que cela ne montre toujours pas</h2>
<ul>
<li><strong>Hors échantillon.</strong> Chaque règle a été écrite après avoir vu ces demandes échouer. La prochaine campagne fait tourner trois bras (nu, un profil Clean DDD allégé, et le complet) sur une application écrite avant tout essai, sur laquelle aucune règle n’a été réglée (${link('docs/evaluations/benchmark/three-arms/README.md', 'son protocole')}).</li>
<li><strong>La variance.</strong> Un arbre par bras ; dans J5, des arbres d’un même bras se sont arrêtés à 13 demandes d’écart.</li>
<li><strong>Si la structure paie au changement.</strong> Aucun changement n’est arrivé sans annonce dans les demandes 51 à 100.</li>
<li><strong>L’indépendance.</strong> Une seule personne a conçu l’architecture, le benchmark et les réparations, avec un assistant IA qui a aussi fait tourner le banc et, une nuit, jugé le second échec de clean-3, comme le mainteneur le lui avait délégué.</li>
</ul>

<h2>Le reproduire</h2>
<ul>
<li>${link(O.records.j5bProtocol, 'Le protocole')}, ${link('docs/evaluations/benchmark/openstay/j5/triage.md', 'la règle de tri')} et ${link(O.records.j5bRepairs, 'les réparations')} ;</li>
<li>${link(O.records.j5b, 'le compte rendu')} et ${link(O.records.j5bIncidents, 'le journal des incidents')} ;</li>
<li>les deux arbres à cent, dans le dépôt propre à OpenStay (<code>j5b/simple-3</code>, <code>j5b/clean-3</code>), avec leurs journaux et leurs notations (<code>j5b-logs/…</code>).</li>
</ul>
<p>Les chiffres de cette page sont copiés du compte rendu dans ${link('site/openstay.mjs', 'site/openstay.mjs')}.</p>

<footer>clean-ddd · expériences menées et rédigées avec un assistant IA. Corrections bienvenues en issues sur le dépôt.</footer>
`;
};
