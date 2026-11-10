/** L’article en français : le premier benchmark, sur l’application de notes. Sa prose autour des chiffres que build.mjs calcule. */
export const body = ctx => {
  const {
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
    home,
    list,
    listLabel,
    hrefs,
    other,
  } = ctx;
  return `
<header class="title">
<p class="home"><span class="crumbs"><a href="${home}">← CLEAN-DDD</a><span aria-hidden="true">·</span><a href="${list}">${listLabel}</a></span><a class="lang-switch" href="${other.href}" hreflang="${other.lang}" lang="${other.lang}" aria-label="${other.label}">${other.code}</a></p>
<h1>La Clean Architecture aide-t-elle un agent IA à écrire du logiciel ?</h1>
<p class="dek">Nous avons construit une implémentation de référence de la Clean Architecture et du Domain-Driven Design dont les règles sont de la donnée, un outil qui y tient le code, et un flux qui permet à plusieurs agents de construire des fonctionnalités en parallèle. Puis nous avons mesuré si tout cela aide un agent à livrer, y compris là où cela devrait aider le plus : un modèle plus faible, une base de code qui grandit, un changement de stockage. Sur notre benchmark, non. L’architecture a bien gardé les changements à leur place, et seul l’outil a empêché la structure de dériver. Un second benchmark, plus grand, une place de marché de logements avec de l’argent et une migration de base de données, a dit la même chose pour cinquante fonctionnalités et a montré où l’architecture paie : dans ce que les tests ne voient pas. Vers la centième, chaque arbre s’est arrêté, chacun sur une règle que personne n’avait écrite.</p>
<p class="byline">30 octobre 2026, mis à jour le 4 novembre 2026 avec les cinquante premières fonctionnalités d’OpenStay, et le 8 novembre 2026 avec son cinquième jalon, provisoire · Les expériences <a href="https://github.com/jgaNet/clean-ddd">clean-ddd</a> · Chaque chiffre ci-dessous est lu dans les registres du dépôt.</p>
</header>

<div class="answer">
<p><strong>La réponse courte.</strong> Un agent de code à qui l’on a donné un projet TypeScript nu a livré les mêmes sept fonctionnalités, et passé les mêmes tests d’acceptation cachés, qu’un agent à qui l’on a donné la Clean Architecture, le DDD et notre outillage. Il a été environ ${ratio(
    A.map(r => r.minutes),
    P.map(r => r.minutes),
  )} fois plus rapide et ${ratio(
    A.map(r => r.usd),
    P.map(r => r.usd),
  )} fois moins cher. Il a aussi pris le plus grand changement du benchmark plus tôt et pour moins cher. Deux lecteurs indépendants n’ont trouvé aucune différence de qualité entre les arbres.</p>
<p><strong>Notre outil</strong> fait ce qu’il annonce : il tient le code à l’architecture exactement, et il a rendu sûre une répartition d’agents en parallèle là où le parallélisme naïf échouait. Sur ce benchmark, ni l’un ni l’autre n’a apporté quelque chose qu’un seul agent sur un projet nu ne livrait pas déjà.</p>
<p><strong>Puis nous avons testé là où l’architecture devrait payer.</strong> Quatre expériences de plus, écrites avant de tourner, chacune prenant une condition que la première réponse ne pouvait pas écarter (<a href="${hrefs.extensions}">leur article</a>) :</p>
<ul>
<li><strong>Un modèle plus faible.</strong> Le projet nu a encore tout livré, et l’architecture n’a pas aidé.</li>
<li><strong>Cinq fonctionnalités de plus</strong> sur des arbres qui ont grandi. Chaque bras a continué de livrer, et le projet nu est resté le plus rapide.</li>
<li><strong>Un passage à un vrai stockage.</strong> Dans les arbres architecture, le changement est resté hors du domaine, comme promis, mais il a quand même pris deux fois plus de temps que dans le projet nu.</li>
<li><strong>Le contrat de la répartition donné à un seul agent.</strong> Il n’a pas rendu cet agent plus rapide : la vitesse de la répartition, c’est son parallélisme.</li>
</ul>
<p><strong>Puis une application plus grande, construite plus longtemps</strong> (<a href="${hrefs.openstay}">son article</a>)<strong>.</strong> OpenStay, une place de marché de logements, a maintenant pris cinquante fonctionnalités en trois jalons, sur trois arbres nus et trois arbres Clean DDD, chaque fonctionnalité à partir du plus petit modèle. Son argent passe par un prestataire de paiement que les tests jouent, et son stockage est passé à PostgreSQL sans préavis. Chaque arbre a livré chaque fonctionnalité et passe les 51 fichiers de tests cachés. Les arbres nus n’ont jamais eu besoin de plus que le plus petit modèle ; les arbres Clean DDD ont eu besoin d’un plus grand pour ${osEscalated('clean')} fonctionnalités sur ${osDelivered('clean')}. Le bras nu est resté ${cheaper(osJ4)} fois moins cher sur les fonctionnalités 26 à 50. Là où les arbres Clean DDD ont été meilleurs, c’est ce que les tests ne voient pas : le changement de stockage n’y a touché aucune règle et une vingtaine de fichiers de règles dans chaque arbre nu, et une lecture indépendante a trouvé un double versement possible dans un arbre nu et aucun défaut sur l’argent dans aucun arbre Clean DDD (<a href="${hrefs.openstay}#reading">la lecture</a>). Vers la centième fonctionnalité, chaque arbre s’est arrêté : les arbres nus à 66, 73 et 73, les arbres Clean DDD à 51, 64 et 64, chacun là où une règle était implicite. Énoncer deux de ces règles a laissé passer les arbres Clean DDD (<a href="${hrefs.openstay}#j5">J5</a>).</p>
<p>Dans chaque expérience sur l’application de notes qui avait un bras nu, les bras architecture ont pris ${span(allTimes)} fois le temps du projet nu et ${span(allCosts)} fois son coût. Ce que l’architecture a apporté est maintenant mesuré : des changements gardés dans leur couche, et, avec notre outil seulement, une structure qui ne dérive pas quand le code grandit.</p>
<p><strong>Les limites de cette réponse :</strong> une seule famille de modèles, deux applications (douze fonctionnalités, puis cinquante), une poignée d’essais ou trois arbres par bras, et des correcteurs qui sont des agents.</p>
</div>

<div class="stats">
<div class="stat"><div class="figure">${graded}</div><div class="what">exécutions d’agents notées face aux tests cachés, en six expériences</div></div>
<div class="stat"><div class="figure">${span(allTimes)}×</div><div class="what">le temps du projet nu, pris par les bras architecture dans chaque expérience</div></div>
<div class="stat"><div class="figure">0</div><div class="what">expérience où l’architecture a livré plus, plus tôt ou moins cher</div></div>
<div class="stat"><div class="figure">${quotes.sqliteDomainFiles.value}</div><div class="what">fichier du domaine touché par le passage à SQLite dans les arbres architecture</div></div>
</div>
${charts.summaryTime}
${charts.summaryCost}
${tables.summary}
<p class="note">1 est le projet nu. La fonctionnalité 8 et les fonctionnalités 9–13 sont un arbre par bras ; les autres expériences sont des moyennes de deux ou trois essais. Les fonctionnalités 9–13 ont démarré une conversation neuve, leur coût n’est donc pas comparable à celui du backlog.</p>

<h2>Ce que nous avons construit</h2>
<p><a href="https://github.com/jgaNet/clean-ddd">clean-ddd</a> est une implémentation de référence de la Clean Architecture avec le DDD, en quatre langages. L’architecture est de la donnée : les couches, qui peut importer qui, et chaque règle sous un identifiant stable vivent dans des fichiers YAML. Les linters, une vérification des conventions et la documentation en sont générés. Autour, nous avons construit l’outillage qu’un agent IA utiliserait :</p>
<ul>
<li>une <strong>porte</strong> (gate) : un seul verdict sur le fait qu’un changement est resté dans l’architecture ;</li>
<li>des <strong>event storms attendus</strong>, qui tiennent le code au modèle qu’il a été décidé de donner à une fonctionnalité ;</li>
<li>une <strong>carte des contextes vérifiée</strong>, qui refuse un couplage entre deux contextes que personne n’a déclaré ;</li>
<li>un <strong>flux multi-agents</strong> : un agent par contexte borné, face à un contrat gelé, intégré par un seul rédacteur.</li>
</ul>
<p>Le pari était qu’une architecture rendue explicite et imposée rendrait les agents IA meilleurs pour construire du logiciel, seuls et ensemble. Cet article est le test de ce pari.</p>

<h2>Comment nous avons mesuré</h2>
<p>Un backlog de sept fonctionnalités d’une application de notes, des comptes et des notes jusqu’au partage, aux notifications, à un plan avec un quota et aux rappels. Chaque fonctionnalité était écrite en mots produit, avec l’API HTTP à laquelle elle doit répondre. Pour chaque fonctionnalité, un test d’acceptation boîte noire sur HTTP a été écrit <em>avant tout essai</em>, et aucun agent ne l’a jamais vu. Le même modèle, par le même exécuteur sans interface, a construit le backlog dans chaque bras. Le point de départ et les consignes de chaque bras différaient :</p>
<div class="scroll"><table>
<thead><tr><th>Bras</th><th>Part de</th><th>Reçoit</th><th>Est tenu par</th></tr></thead>
<tbody>
<tr><td>${legend(['A'])}</td><td>un projet créé par notre outil : briques de base, contrat, linters</td><td>la demande et son event storm</td><td>la porte</td></tr>
<tr><td>${legend(['D'])}</td><td>le même projet sans l’outil ; les règles en prose</td><td>la demande</td><td>typecheck, lint, tests</td></tr>
<tr><td>${legend(['P'])}</td><td>un projet TypeScript/Fastify nu, même chaîne d’outils</td><td>la demande</td><td>typecheck, lint, tests</td></tr>
<tr><td>${legend(['Cp'])}</td><td>comme A, un agent par contexte borné en parallèle</td><td>un contrat gelé par tranche</td><td>la porte, puis un intégrateur</td></tr>
</tbody></table></div>
<p>Chaque bras est un agent dans une conversation, qui prend les fonctionnalités dans l’ordre, sauf C′. Les protocoles, les prédictions et les biais ont été committés avant les essais : ${link('docs/evaluations/benchmark/README.md', 'le benchmark')}, ${link('docs/evaluations/benchmark/control/README.md', 'le contrôle')}. Un défaut de notre harnais, trouvé après deux essais, a été corrigé et consigné comme amendement avant les essais comptés. Une différence entre bras n’est appelée différence que lorsque leurs plages d’essais ne se recouvrent pas.</p>

<h2>1. Tout le monde a livré</h2>
<p>Les ${A.length + D.length + P.length + Cp.length} essais ont tous passé les sept tests d’acceptation cachés, dans chaque bras. La justesse, telle qu’un client la voit, n’a pas du tout séparé les bras.</p>

<h2>2. Le projet nu a été plus rapide et moins cher</h2>
${charts.lead}
${tables.lead}
${charts.cost}
<p class="note">Chaque point est un essai ; le trait couvre les essais d’un bras. Le pilote de C′ est montré sans les minutes que les défauts de notre propre harnais lui ont coûtées.</p>
<p>Le projet nu (P) a pris ${range(P, 'minutes')} minutes et ${usd(range(P, 'usd', 2))}. L’architecture avec l’outil (A) a pris ${range(A, 'minutes')} minutes et ${usd(range(A, 'usd', 2))}, et l’architecture en prose (D) ${range(D, 'minutes')} minutes et ${usd(range(D, 'usd', 2))}. Les plages de P ne recouvrent ni celles de A ni celles de D. Celles de A et de D se recouvrent sur le temps. Le coût de D est sous celui de A dans ses deux essais, mais deux essais sont trop peu pour appeler cela une différence. <strong>Le coût est celui de l’architecture, pas celui de l’outil.</strong></p>
${charts.features}
${tables.features}
<p>L’écart est le plus grand sur la fonctionnalité 1, qui met en place deux contextes bornés dans les bras architecture, et il persiste sur chaque fonctionnalité suivante. La fonctionnalité 1 est celle où le projet nu a dû écrire son propre protocole de commande asynchrone, que les bras architecture trouvaient tout fait. Il a quand même fini premier.</p>

<h2>3. L’architecture a écrit quatre fois plus de code</h2>
${charts.written}
${tables.written}
<p>Pour le même comportement, les bras architecture ont ajouté environ quatre fois plus de lignes de source et environ deux fois plus de lignes de test que le projet nu. Agrégats, objets-valeurs, ports, adaptateurs, handlers et câblage sont le vocabulaire de l’architecture, et un agent paie chaque token qu’il lit et écrit. C’est l’essentiel de la différence de coût.</p>

<h2>4. Le grand changement n’a pas favorisé l’architecture</h2>
<p>La fonctionnalité 8 ajoute des espaces d’équipe à l’application finie : membres, rôles, invitations, sièges, recherche et piste d’audit, sur six contextes, dont trois nouveaux. Nous avions prédit, avant les essais, que si l’architecture paie quelque part, c’est ici. Un agent neuf l’a prise sur un arbre fini de chaque bras. C′ a fait tourner six agents en parallèle.</p>
${charts.f8time}
${charts.f8cost}
${tables.f8}
<p>L’arbre nu l’a prise en ${fix(f8.P.minutes, 1)} minutes pour ${usd(f8.P.usd)}, en changeant ${f8.P.written.added.source} lignes de source et en en retirant ${f8.P.written.removed.source}, sans régression. Les bras architecture ont pris deux à trois fois plus de temps.</p>
<p>D a échoué à l’un des huit tests. Il a enregistré le créateur d’un espace comme l’ayant « rejoint », un point que la demande laisse ouvert et que le storm donné à A avait tranché. Ce sont des essais uniques : ils montrent une direction, pas un résultat.</p>

<h2>5. Ce que les tests ne voient pas</h2>
<p>Les tests boîte noire ne voient pas où vit une règle, si un mot de passe est haché, ni jusqu’où un changement se propage. Deux agents qui n’avaient pas fait tourner le benchmark ont lu les huit arbres, sous des noms neutres, selon une grille écrite avant la lecture. Les sept critères de la grille s’appliquent à n’importe quelle structure :</p>
<ul>
<li>les mots de passe ;</li>
<li>le propriétaire pris de l’appelant ;</li>
<li>chaque règle à un seul endroit ;</li>
<li>les refus comme résultats ;</li>
<li>le temps injectable ;</li>
<li>des parties qui changent séparément ;</li>
<li>des règles sous test.</li>
</ul>
<p>Les deux lecteurs ont lu un critère différemment, le tableau donne donc les deux lectures.</p>
<div class="scroll"><table>
<thead><tr><th>Bras</th><th>Essai</th><th>Critères réussis (une décision par comportement)</th><th>Critères réussis (une fonction par règle)</th></tr></thead>
<tbody>${readingRows}</tbody></table></div>
<p><strong>Aucune différence de qualité n’a été montrée, sous aucune des deux lectures.</strong> Les échecs différaient par leur nature :</p>
<ul>
<li>Deux arbres en couches ont décidé une règle dans deux contextes (l’échéance d’un rappel, dans les notes et de nouveau dans les notifications).</li>
<li>Un arbre en couches a répondu à un champ manquant par un 400 au lieu d’un refus. ${link('docs/adr/0032-a-command-body-is-refused-for-its-shape-only.md', 'L’ADR 32')}, écrit plus tard, en fait la réponse attendue : un champ manquant relève de la forme du corps.</li>
<li>Deux arbres nus ont couplé les notes et les notifications par des types internes.</li>
</ul>
<p>Les lecteurs ont aussi nommé, pour trois demandes de changement, chaque fichier qu’un développeur modifierait :</p>
${charts.probes}
${tables.probes}
<p>Sur cet indicateur, les changements étaient plus locaux dans les arbres nus. Un changement en couches se répartit sur plus de fichiers, plus petits : un objet du domaine, un handler, un port, un adaptateur, le câblage, et leurs tests. Les trouver a demandé de lire environ deux fois plus de lignes.</p>
<p>Les constats de sécurité des lecteurs vont dans les deux sens :</p>
<ul>
<li>Les jetons de connexion des arbres nus n’expirent jamais. Les arbres architecture signent les leurs et les font expirer.</li>
<li>Un arbre architecture signe ses jetons avec un secret de repli fixe. L’agent a copié ce motif de notre propre référence, qui a le même repli. C’est un défaut que nous corrigerons.</li>
</ul>

<h2>6. Notre outil est-il pertinent ?</h2>
<p>Nous séparons ce qu’il a fait de ce qu’il a apporté.</p>
<ul>
<li><strong>Il tient l’architecture exactement, et l’écart grandit avec le code.</strong> Aucun import n’a franchi une frontière dans aucun arbre A. Sans l’outil, les arbres de D avaient 0 et 20 refus après le backlog, aucun dans du code de production. Cinq fonctionnalités plus tard, l’arbre de D qui avait grandi en avait ${X.E3.D.drift.refusals}. Un modèle à qui l’on dit les règles en prose les tient à peu près, pas exactement, et la différence s’accumule. Le modèle plus faible les a tenues aussi bien que le fort : 2 et 0 refus.</li>
<li><strong>Il tient ce que dit le contrat, rien de plus.</strong> Avec le modèle plus faible, un essai de A a répondu à un plan inconnu par un 400 venu de son schéma de requête, là où la demande voulait un refus sur l’opération. Notre propre guide appelait « forme » une liste de valeurs autorisées, l’agent l’a donc suivi et la porte l’a laissé passer à bon droit. L’écart était dans le contrat, et ${link('docs/adr/0032-a-command-body-is-refused-for-its-shape-only.md', 'l’ADR 32')} l’a depuis refermé : le corps d’une commande n’est refusé que pour sa forme.</li>
<li><strong>Ses storms et sa carte des contextes sont une cérémonie qu’un agent seul paie.</strong> Dans les transcriptions de A, l’essentiel de ce que l’outil a attrapé était sa propre comptabilité : un storm non marqué terminé, un document à régénérer, un contexte absent de la carte. Il a attrapé une chose de fond : une fonctionnalité tardive a remodelé une commande antérieure, et la vérification du storm l’a dit.</li>
<li><strong>Il a fait fonctionner une répartition en parallèle.</strong> Des agents parallèles naïfs ont perdu trois fonctionnalités sur sept à des conflits dans un contexte. Avec le contexte comme clé de conflit, un contrat gelé et un seul rédacteur intégrateur, chaque fonctionnalité a atterri. Sur la fonctionnalité à six contextes, cette répartition a été 21 % plus rapide qu’un agent seul sur l’architecture, pour 1,7 fois le coût. Donner le même contrat à un seul agent ne l’a pas rendu plus rapide (E2), le gain est donc le parallélisme, et le contrat est ce qui rend le parallélisme sûr. C’était encore plus lent qu’un agent seul sur un projet nu.</li>
<li><strong>Sa commande de stratégie</strong> recommande un seul agent sauf si une fonctionnalité est large et que son temps compte plus que son coût. Cette règle est juste dans sa portée. Elle devrait maintenant dire aussi qu’un petit backlog n’a pas du tout besoin de l’architecture.</li>
</ul>
<p><strong>Notre verdict :</strong> l’outil est pertinent à deux endroits. Il coordonne plusieurs agents qui travaillent en parallèle. Il impose l’architecture aux équipes qui l’ont déjà choisie, et plus elles travaillent longtemps, plus cela compte. Ce n’est pas une aide à la productivité pour un agent seul, fort ou faible. Choisir la Clean Architecture avec le DDD pour le bien d’un agent IA n’est pas soutenu par ces résultats. La choisir pour ce qu’elle fait au code, des changements gardés dans leur couche, est un choix que ces résultats peuvent chiffrer : environ deux fois le temps de l’agent.</p>

<h2>7. Comment cela rejoint ce que d’autres ont trouvé</h2>
<p>Les résultats concordent avec l’essentiel de la littérature que nous avons passée en revue (${link('docs/research/related-work.md', 'travaux connexes')}) :</p>
<ul>
<li>Les modèles forts se conforment à une architecture donnée en prose : un pilote hexagonal a trouvé 0 % d’imports interdits pour un modèle de pointe, contre 80 % pour un petit. Ici, le plus petit modèle de la famille s’est conformé presque aussi bien que le fort. Ses arbres en prose seule avaient 2 et 0 refus, cet écart peut donc dépendre de la famille de modèles plus que de la taille.</li>
<li>Empiler des contraintes de Clean Architecture sur des agents coûte des points de justesse plutôt qu’il n’en ajoute.</li>
<li>Les fichiers de consignes d’un dépôt sont suivis mais élèvent rarement le taux de réussite des tâches.</li>
<li>Les systèmes multi-agents ne battent un agent seul fort que sur un travail qui se découpe proprement.</li>
</ul>
<p>Notre contribution, c’est le contrôle. Le même backlog, le même modèle et les mêmes tests cachés ont tourné avec et sans l’architecture, et avec et sans l’outil qui l’impose. Quatre tests de plus ont suivi, chacun sur une condition où l’architecture est censée payer.</p>

<h2>8. Ce que cela ne montre toujours pas</h2>
<ul>
<li><strong>Là où l’architecture devrait payer.</strong> Un modèle plus faible, une base de code qui grandit, un changement de stockage, le contrat de la répartition donné à un seul agent : chacun a été testé après ce benchmark, dans <a href="${hrefs.extensions}">quatre expériences de plus</a>.</li>
<li><strong>La vie d’un produit.</strong> Douze fonctionnalités, c’est une petite application. <a href="${hrefs.openstay}">OpenStay</a> a construit une place de marché de logements jusqu’à cinquante fonctionnalités et vers cent, et c’est là que le prix de l’architecture et ce qu’elle rapporte se lisent à plus grande échelle.</li>
<li><strong>Les gens.</strong> Ici, ce sont des agents qui lisent le code, pas des développeurs qui doivent le maintenir pendant des années. La localité d’un changement compte pour un relecteur ; nous ne l’avons pas chiffrée.</li>
<li><strong>Une autre famille de modèles.</strong> Une seule famille de modèles, et dans ce benchmark son membre le plus fort.</li>
<li><strong>L’indépendance.</strong> Une seule personne a conçu l’architecture, le benchmark et la grille, et des agents ont noté les arbres. Le protocole asynchrone de l’API venait de l’architecture, ce qui, si cela a joué, l’a favorisée.</li>
<li><strong>La taille de l’échantillon.</strong> Deux ou trois essais par bras, et un arbre par bras sur la fonctionnalité 8.</li>
</ul>

<h2>Le reproduire</h2>
<p>Tout est dans le dépôt :</p>
<ul>
<li>les kits, écrits avant les essais : ${link('docs/evaluations/benchmark', 'benchmark/')} ;</li>
<li>les pilotes et le correcteur : ${link('.claude/flow', '.claude/flow/')} ;</li>
<li>les registres : ${link('docs/evaluations/2026-10-30-flow-phase-4-pilot.md', 'le pilote')}, ${link('docs/evaluations/2026-10-30-flow-phase-4-campaign.md', 'la campagne')} et ${link('docs/evaluations/2026-10-30-flow-control.md', 'le contrôle')} ;</li>
<li>les journaux, les notes et les lectures : ${link('docs/evaluations/flow', 'flow/')}.</li>
</ul>
<p>Les chiffres de cette page sont lus dans ces fichiers par ${link('site/collect.mjs', 'site/collect.mjs')} ; les graphiques de synthèse lisent aussi les quatre expériences qui ont suivi et citent les registres d’OpenStay.</p>

<footer>clean-ddd · expériences menées et rédigées avec un assistant IA. Les corrections sont bienvenues en issues sur le dépôt.</footer>
`;
};
