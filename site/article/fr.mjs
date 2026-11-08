/** L’article, en français : sa prose autour des chiffres que build.mjs calcule. */
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
    other,
  } = ctx;
  return `
<header class="title">
<p class="home"><a href="${home}">← CLEAN-DDD</a><a class="lang-switch" href="${other.href}" hreflang="${other.lang}" lang="${other.lang}" aria-label="${other.label}">${other.code}</a></p>
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
<p><strong>Puis nous avons testé là où l’architecture devrait payer.</strong> Quatre expériences de plus, écrites avant de tourner, chacune prenant une condition que la première réponse ne pouvait pas écarter :</p>
<ul>
<li><strong>Un modèle plus faible.</strong> Le projet nu a encore tout livré, et l’architecture n’a pas aidé.</li>
<li><strong>Cinq fonctionnalités de plus</strong> sur des arbres qui ont grandi. Chaque bras a continué de livrer, et le projet nu est resté le plus rapide.</li>
<li><strong>Un passage à un vrai stockage.</strong> Dans les arbres architecture, le changement est resté hors du domaine, comme promis, mais il a quand même pris deux fois plus de temps que dans le projet nu.</li>
<li><strong>Le contrat de la répartition donné à un seul agent.</strong> Il n’a pas rendu cet agent plus rapide : la vitesse de la répartition, c’est son parallélisme.</li>
</ul>
<p><strong>Puis une application plus grande, construite plus longtemps.</strong> OpenStay, une place de marché de logements, a maintenant pris cinquante fonctionnalités en trois jalons, sur trois arbres nus et trois arbres Clean DDD, chaque fonctionnalité à partir du plus petit modèle. Son argent passe par un prestataire de paiement que les tests jouent, et son stockage est passé à PostgreSQL sans préavis. Chaque arbre a livré chaque fonctionnalité et passe les 51 fichiers de tests cachés. Les arbres nus n’ont jamais eu besoin de plus que le plus petit modèle ; les arbres Clean DDD ont eu besoin d’un plus grand pour ${osEscalated('clean')} fonctionnalités sur ${osDelivered('clean')}. Le bras nu est resté ${cheaper(osJ4)} fois moins cher sur les fonctionnalités 26 à 50. Là où les arbres Clean DDD ont été meilleurs, c’est ce que les tests ne voient pas : le changement de stockage n’y a touché aucune règle et une vingtaine de fichiers de règles dans chaque arbre nu, et une lecture indépendante a trouvé un double versement possible dans un arbre nu et aucun défaut sur l’argent dans aucun arbre Clean DDD (<a href="#openstay">section 9</a>). Vers la centième fonctionnalité, chaque arbre s’est arrêté : les arbres nus à 66, 73 et 73, les arbres Clean DDD à 51, 64 et 64, chacun là où une règle était implicite. Énoncer deux de ces règles a laissé passer les arbres Clean DDD (<a href="#openstay-j5">section 9, J5</a>).</p>
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

<h2>8. Quatre expériences de plus</h2>
<p>Le contrôle a nommé ce qu’il ne pouvait pas montrer. Nous avons écrit quatre expériences de plus, avec leurs prédictions, avant de les faire tourner (${link('docs/evaluations/benchmark/extensions/README.md', 'le protocole')}). Même pilote, même correcteur, des tests cachés qu’aucun agent n’a vus. La correction a trouvé trois défauts dans notre propre kit, tous consignés comme amendements et appliqués à chaque arbre de la même façon.</p>

<h3>E1. Un modèle plus faible</h3>
<p>La littérature trouve que la documentation d’architecture aide le plus les modèles faibles. Nous avons fait tourner le backlog avec le plus petit modèle de la même famille, deux essais par bras.</p>
${charts.e1time}
${charts.e1cost}
${tables.e1}
<p>Le projet nu a livré 7/7 deux fois, en ${range(X.E1.P, 'minutes')} minutes pour ${usd(range(X.E1.P, 'usd', 2))}. L’architecture avec l’outil a livré 6/7 et 7/7 en ${range(X.E1.A, 'minutes')} minutes. Son seul échec est un 400 venu du schéma de requête, là où la demande voulait un 202 et un résultat refusé. Notre propre guide disait alors à l’agent de mettre la liste des valeurs autorisées dans le schéma. C’était un écart dans l’architecture, depuis refermé, pas une faute de l’agent. <strong>L’architecture n’a pas aidé le modèle plus faible à livrer</strong>, et le modèle plus faible a payé relativement plus pour la lire : environ ${ratio(
    X.E1.A.map(r => r.usd),
    X.E1.P.map(r => r.usd),
  )} fois le coût de P, contre ${ratio(
    A.map(r => r.usd),
    P.map(r => r.usd),
  )} fois avec le modèle fort.</p>

<h3>E2. La vitesse de la répartition venait-elle de son contrat ?</h3>
<p>Sur la fonctionnalité 8, la répartition C′ a été 21 % plus rapide qu’un agent seul. Mais C′ avait aussi une étape de contrat : un plan par contexte, des événements et des modèles de lecture gelés, et le test d’acceptation. Nous avons donné tout cela à un seul agent, depuis le même commit.</p>
${charts.e2}
${tables.e2}
<p>Avec tout le contrat, un seul agent a pris ${range(X.E2, 'minutes')} minutes, autant que sans. <strong>Le gain de la répartition était le parallélisme, pas le contrat.</strong> Le contrat est ce qui rend le parallélisme sûr ; à lui seul il n’a rien apporté de mesurable.</p>

<h3>E3. Cinq fonctionnalités de plus</h3>
<p>La dégradation architecturale est censée grandir avec la taille du code. Un arbre fini par bras a pris cinq fonctionnalités de plus qui changent ce qui existe : des commentaires, l’historique d’une note avec restauration, des éditeurs sur une note partagée, la suppression d’un compte et de tout ce qu’il possède, et la recherche.</p>
${charts.e3features}
${charts.e3growth}
${tables.e3}
<p>Chaque bras a passé chaque nouveau test, sans régression. La fonctionnalité 11 changeait à dessein une règle de la fonctionnalité 4, et seule l’ancienne assertion de cette règle a échoué. P a été le plus rapide sur quatre fonctionnalités sur cinq. Son temps par fonctionnalité a crû de ${growth('P')} %, et celui de D de ${growth('D')} %, tandis que celui de A a bougé de ${growth('A')} %. C’est la forme que l’hypothèse prédisait pour l’arbre nu, mais D la montre aussi, et chaque bras a un seul arbre. <strong>C’est une direction à mesurer sur un horizon plus long, pas un résultat.</strong></p>
<p>Sans l’outil, la structure a dérivé quand le code a grandi : l’arbre de D est passé de 20 refus des règles d’import générées dans 10 fichiers à ${X.E3.D.drift.refusals} dans ${X.E3.D.drift.files}. L’arbre de A ne peut pas dériver, puisque l’outil refuse la violation.</p>

<h3>E4. Un vrai stockage</h3>
<p>Les ports et les adaptateurs existent pour que le stockage puisse changer à un seul endroit. Un agent neuf par arbre a tout fait passer à SQLite. Un test caché a ensuite redémarré le serveur sur le même fichier et tout relu.</p>
${charts.e4time}
${charts.e4lines}
${tables.e4}
<p>Les six arbres ont réussi, sans régression. <strong>La prédiction sur l’endroit où le changement atterrit a tenu :</strong> aucun essai architecture n’a touché le domaine ni les cas d’usage d’un contexte, seulement les adaptateurs, le câblage et les briques de base. Les essais nus ont changé chaque module, puisque le stockage n’y est pas séparé des règles. <strong>Cela n’a pas rendu le changement moins cher.</strong> P a pris ${range(X.E4.P, 'minutes')} minutes, contre ${range(X.E4.A, 'minutes')} pour A et ${range(X.E4.D, 'minutes')} pour D. Au sein des bras architecture, la taille du changement a suivi un choix de conception, une table par agrégat ou un document chacun, et non le bras.</p>

<h2 id="openstay">9. Une application plus grande : OpenStay, cinquante fonctionnalités, puis vers cent</h2>
<p>Douze fonctionnalités d’une application de notes laissaient la question principale ouverte : l’architecture commence-t-elle à payer quand le code ne tient plus dans la tête d’un agent ? ${link(O.records.protocol, 'OpenStay')} est le test plus long. C’est une place de marché de logements, née d’${link(O.records.brief, 'un brief')} avec des règles sur les nuits, l’argent et les permissions, construite fonctionnalité par fonctionnalité en jalons de dix à vingt-cinq fonctionnalités.</p>
<ul>
<li><strong>Deux bras, trois arbres chacun.</strong> Le bras simple est un projet TypeScript nu tenu par <code>yarn verify</code>. Le bras Clean DDD est un projet créé par notre outil, tenu par la porte, l’event storm de chaque fonctionnalité étant décidé avec le mainteneur avant qu’elle ne tourne.</li>
<li><strong>Une échelle de modèles.</strong> Chaque fonctionnalité démarre avec le plus petit modèle de la famille, et ne monte d’un échelon que lorsque sa tentative échoue : la porte ou <code>yarn verify</code>, les tests cachés de la fonctionnalité, ou ceux d’une fonctionnalité antérieure. Un test caché qui échoue est rejoué seul avant de compter, pour que la charge de la machine ne passe pas pour un défaut.</li>
<li><strong>L’hypothèse, écrite avant tout essai :</strong> à mesure que les arbres grandissent, le bras simple a besoin des plus grands modèles plus tôt que le bras Clean DDD.</li>
</ul>
<p>Trois jalons ont tourné : le ${link(O.records.pilot, 'pilote')} (fonctionnalités 1–10 : annonces, recherche, devis, réservations), ${link(O.records.j3, 'J3')} (11–25, avec un changement de permissions non annoncé à l’avance) et ${link(O.records.j4, 'J4')} (26–50 : paiements, remboursements et versements par un prestataire que les tests jouent, des webhooks en retard, en double ou dans le désordre, et le stockage passé à PostgreSQL sans préavis).</p>
${charts.openstayCost}
${tables.openstay}
<p class="note">Chaque point est un arbre. « Au-dessus du plus petit modèle » compte les escalades qui se sont reproduites ; les autres étaient la charge de la machine ou un défaut du kit, chacune vérifiée et consignée. Le clean-1 de J3 est compté une fois, comme le registre de J4 le corrige.</p>
<p><strong>Tout le monde a livré, de nouveau.</strong> À J4, noté de nouveau un arbre à la fois sur une machine au calme, chaque arbre passe les 51 fichiers de tests cachés, 306 sur 306, et chaque arbre Clean DDD passe sa porte. Le modèle le plus fort n’a jamais été nécessaire dans aucun des deux bras.</p>
<p><strong>L’hypothèse n’est pas soutenue à cinquante fonctionnalités, et J4 pointe dans l’autre sens.</strong> Les arbres simples, 8 000 à 9 000 lignes de source, tiennent encore dans le contexte d’un agent, et n’ont eu besoin de rien au-dessus du plus petit modèle sur 150 fonctionnalités sur 150. Les arbres Clean DDD, trois fois plus grands (${fix(O.source.clean[0], 0)}–${fix(O.source.clean[1], 0)} lignes), ont eu besoin d’un plus grand modèle pour ${osEscalated('clean')} fonctionnalités sur ${osDelivered('clean')}, dont six à J4. Chacune était un défaut de la tentative : la commande d’un storm nommée autrement, un versement échoué réutilisé au lieu d’être remplacé, un webhook sur quelque chose d’inconnu refusé.</p>
<p><strong>L’écart de coût s’est resserré après le pilote, puis a tenu.</strong> Le bras simple a été ${cheaper(O.checkpoints[0])} fois moins cher sur les dix premières fonctionnalités, ${cheaper(O.checkpoints[1])} fois sur les quinze suivantes, et ${cheaper(osJ4)} fois sur les vingt-cinq de J4. À J4, sa tentative médiane a coûté 0,28–0,43 $, contre 0,82–1,08 $.</p>
<p><strong>Le changement non annoncé à l’avance a atterri là où l’architecture le disait.</strong> Les six arbres sont passés à PostgreSQL avec le plus petit modèle.</p>
<ul>
<li><strong>Dans les arbres Clean DDD, aucun agrégat et aucune règle n’a bougé,</strong> sur ${O.postgres.clean.files.join(', ')} fichiers changés : l’infrastructure des contextes et les briques de base ont tout pris. Le seul changement d’Application était la signature d’un port, dans deux arbres.</li>
<li><strong>Dans les arbres simples, les règles interrogent la base directement,</strong> et le nouveau pilote est asynchrone : environ ${O.postgres.simple.ruleFiles.join(', ')} fichiers de règles ont été réécrits, sur ${O.postgres.simple.files.join(', ')} changés.</li>
<li><strong>Cela n’a pas rendu le changement moins cher :</strong> ${usd(lowHigh(O.postgres.simple.usd))} dans le bras simple, ${usd(lowHigh(O.postgres.clean.usd))} dans le bras Clean DDD. Un petit modèle réécrit quarante fichiers mécaniquement pour peu, et le lecteur n’a trouvé aucune règle qui ait changé de sens dans aucune réécriture.</li>
</ul>
<p><strong>Ce que les tests ne voient pas, c’est là que les bras diffèrent.</strong> Trois agents neufs ont lu les six arbres finaux selon ${link('docs/evaluations/benchmark/openstay/j4/reading.md', 'une grille')} écrite avant qu’aucun arbre ne soit lu.</p>
<ul>
<li><strong>L’argent.</strong> Un arbre simple peut payer un hôte deux fois : deux serveurs qui exécutent le travail de versement au même moment écrivent chacun un versement, et rien ne refuse le second. Il passe tous les tests cachés, qui exécutent le travail d’un seul serveur à la fois. Nous avons lu le code, et l’affirmation tient. Aucun arbre Clean DDD n’échoue à un critère sur l’argent.</li>
<li><strong>Des parties séparées.</strong> Les arbres Clean DDD gardent leurs contextes séparés, dans les trois arbres ; les arbres simples en partie.</li>
<li><strong>Des règles énoncées une fois</strong> : pas mieux dans un bras que dans l’autre. Les arbres simples répètent ce qui est encore remboursable et ce qu’un versement doit ; les arbres Clean DDD répètent qui peut agir sur une annonce, une fois par contexte.</li>
<li><strong>Le coût d’un changement, lu plutôt que fait.</strong> Pour trois demandes de changement, les lecteurs ont nommé chaque fichier qu’un développeur modifierait. Un changement touche 2 à 3 fois plus de fichiers dans un arbre Clean DDD, et demande 2 à 4 fois moins de lignes pour les trouver.</li>
</ul>
<p><strong>Ce que cela ajoute à la première réponse.</strong> À cinquante fonctionnalités, sur des demandes précises, avec un seul agent qui écrit tout l’arbre, l’architecture coûte toujours plus et ne livre pas plus. Ce qu’elle apporte se voit maintenant sur une application plus grande : un changement de stockage tenu hors des règles, aucun défaut sur l’argent là où un arbre nu pouvait payer deux fois, et des contextes qui restent séparés. Un cinquième jalon a mené les arbres vers cent fonctionnalités (ci-dessous). À côté, huit expériences annexes retirent chacune une condition qui favorise le bras nu : un contexte limité, des demandes vagues, du chaos sur l’argent, un mainteneur neuf, des défauts injectés à déboguer, et des pull requests à relire, plus une répartition par contexte et du code d’amorçage généré pour le bras Clean DDD.</p>

<h3 id="openstay-j5">J5 : vers cent fonctionnalités, chaque arbre s’est arrêté (provisoire)</h3>
<p>${link(O.records.j5, 'J5')} a mené les six arbres vers la demande 100 : messagerie, avis, modération, réclamations après un séjour, preuves d’un paiement direct, support, puis langues, devises et taxes. Un arbre s’arrête désormais à la première fonctionnalité que le modèle le plus fort échoue aussi, une fois qu’${link('docs/evaluations/benchmark/openstay/j5/triage.md', 'une règle de triage')}, écrite avant les échecs qu’elle a jugés, a dit que l’échec est celui de l’arbre et non du kit.</p>
${tables.openstayJ5}
<p class="note"><code>0</code>, <code>1</code> et <code>2</code> sont le plus petit modèle, l’intermédiaire et le plus fort ; <code>F</code> est l’échec trié. Trois fonctionnalités ont échoué à cause du kit ou du harnais, non de la tentative ; elles ont été créditées, et le coût de leurs étapes supplémentaires est mis à part, comme le registre le liste.</p>
<p><strong>Aucun arbre n’a atteint cent, et les arbres nus sont allés plus loin :</strong> 59 fonctionnalités en tout, contre 26. Chaque échec est tombé sur une couture où une règle dont l’application avait besoin était implicite, et où le code l’avait déjà tranchée autrement.</p>
<ul>
<li><strong>Les arbres Clean DDD ont échoué là où deux contextes se rencontrent,</strong> en suivant les règles de l’architecture elles-mêmes, lues à la lettre.
<ul>
<li>Deux arbres ont repris un message signalé dans la Modération sous un nouvel identifiant, puisque « un agrégat génère sa propre identité », et le client ne retrouvait pas son signalement.</li>
<li>Le troisième a répondu <code>202</code> à une commande anonyme, comme le dit la grammaire de l’architecture, là où le produit disait <code>401</code>.</li>
</ul></li>
<li><strong>Les arbres nus ont échoué là où un raccourci pris tôt a rencontré une règle énoncée plus tard.</strong>
<ul>
<li>Deux arbres faisaient expirer une réservation impayée dès que quelqu’un la lisait, depuis la demande 30, et la demande 73 a dit qu’elle expire au prochain balayage.</li>
<li>Le troisième ne remboursait rien là où il restait quelque chose.</li>
</ul></li>
</ul>
<p><strong>Énoncer la règle a laissé passer les arbres Clean DDD.</strong> Le mainteneur a gardé les verdicts de J5 et a fait tourner des copies des trois arbres Clean DDD, chacune depuis là où elle s’était arrêtée, sur un kit qui dit ce que J5 a trouvé :</p>
<ul>
<li>l’identité naît une fois ;</li>
<li>une relation que deux contextes partagent est testée de bout en bout ;</li>
<li>le transport refuse d’emblée un appelant manquant.</li>
</ul>
${tables.openstayFullplus}
<ul>
<li><strong>Les deux arbres qui s’étaient arrêtés à 64 l’ont passée.</strong> Ils ont ensuite livré presque chaque demande avec le plus petit modèle, la 73 comprise, là où chaque arbre nu a échoué.</li>
<li><strong>Le troisième s’est arrêté à 61,</strong> sur la couture suivante.</li>
<li><strong>La formulation a compté.</strong> Avec le message de la porte « retrouve-le par l’identifiant que l’amont a répondu », le plus petit modèle a gardé le mauvais identifiant. Avec « l’identifiant que cette demande même a répondu : un signalement d’un message se retrouve par l’identifiant du signalement », il a livré.</li>
<li><strong>Ce que sont devenues les trois règles.</strong> L’identité née une fois et le test de relation sont maintenant ${link('docs/adr/0033-identity-is-born-once-and-a-relationship-crossed-is-tested.md', 'l’ADR 33')}. Refuser d’emblée un appelant manquant change ce que chaque serveur répond, c’est donc d’abord ${link('docs/rfc/0003-who-reaches-a-command.md', 'une RFC')}.</li>
</ul>
<p><strong>Une règle donnée tard n’atteint que le code nouveau.</strong> Une phrase a été ajoutée au guide de deux arbres nus à la demande 72 : « une lecture ne change jamais ce qui est stocké ».</p>
<ul>
<li>Avec les plus petits modèles, cela n’a rien changé : ils l’ont appliquée au code qu’ils écrivaient, et ont laissé en place les lectures qui font expirer.</li>
<li>Seul le modèle le plus fort l’a portée jusqu’au code déjà là, et l’un des deux arbres a encore laissé derrière lui un de ses tests antérieurs.</li>
<li>La phrase entre dans le guide de départ du bras nu pour la prochaine campagne. Les deux arbres continuent vers 100 à côté de Full+, comme bras séparé.</li>
</ul>
<p><strong>Deux développeurs sur une demande.</strong> La demande 64 a été partagée entre deux agents, un par propriétaire des contextes qu’elle traverse (${link('docs/evaluations/benchmark/openstay/j5/side/two-developers/results.md', 'les résultats')}). Elle a été livrée :</p>
<ul>
<li>${O.j5.twoDevelopers.old[0]} fois sur ${O.j5.twoDevelopers.old[1]} sur l’ancien kit ;</li>
<li>${O.j5.twoDevelopers.fullplus[0]} sur ${O.j5.twoDevelopers.fullplus[1]} sur le nouveau ;</li>
<li>${O.j5.twoDevelopers.integrator[0]} sur ${O.j5.twoDevelopers.integrator[1]} avec un intégrateur, qui passe la porte sur le code fusionné et remet chaque échec à son propriétaire.</li>
</ul>
<p>La règle a rendu la couture visible à chaque fois. Sans l’intégrateur, la demande qui l’aurait corrigée est arrivée à un agent dont la session était terminée.</p>
<p><strong>Ce que J5 ajoute.</strong> Sur une application plus grande, la question n’est plus quel bras a besoin d’un plus grand modèle, mais lequel s’arrête, et où. Les deux s’arrêtent là où une règle n’a jamais été écrite, et à deux coutures les règles de l’architecture, lues à la lettre, ont choisi la mauvaise réponse. Écrites, elles ont laissé passer le plus petit modèle. Reste à faire tourner : les deux bras de suite jusqu’à 100, une seconde correction, la lecture, et les expériences annexes.</p>

<h2>10. Ce que cela ne montre toujours pas</h2>
<ul>
<li><strong>La vie d’un produit.</strong> Aucun arbre OpenStay n’a atteint cent fonctionnalités sur le kit tel qu’enregistré. Les bras de suite testent, hors échantillon, si les règles que J5 a écrites y mènent les arbres.</li>
<li><strong>La concurrence et les pannes sous test.</strong> Les tests cachés d’OpenStay tuent maintenant des serveurs, en font tourner deux à la fois et rejouent des webhooks, et ont quand même manqué un double versement qu’un lecteur a trouvé. La suite de chaos du cinquième jalon teste l’argent sous panne sur chaque arbre final.</li>
<li><strong>Les gens.</strong> Ici, ce sont des agents qui lisent le code, pas des développeurs qui doivent le maintenir pendant des années. La localité que E4 montre compte pour un relecteur ; nous ne l’avons pas chiffrée.</li>
<li><strong>Une autre famille de modèles.</strong> Le modèle plus faible était le plus petit de la même famille.</li>
<li><strong>L’indépendance.</strong> Une seule personne a conçu l’architecture, le benchmark et la grille, et des agents ont noté les arbres. Le protocole asynchrone de l’API venait de l’architecture, ce qui, si cela a joué, l’a favorisée.</li>
<li><strong>La taille de l’échantillon.</strong> Deux ou trois essais par bras, et un arbre par bras dans E3.</li>
</ul>

<h2>Le reproduire</h2>
<p>Tout est dans le dépôt :</p>
<ul>
<li>les kits, écrits avant les essais : ${link('docs/evaluations/benchmark', 'benchmark/')} ;</li>
<li>les pilotes et le correcteur : ${link('.claude/flow', '.claude/flow/')} ;</li>
<li>les registres : ${link('docs/evaluations/2026-10-30-flow-phase-4-pilot.md', 'le pilote')}, ${link('docs/evaluations/2026-10-30-flow-phase-4-campaign.md', 'la campagne')}, ${link('docs/evaluations/2026-10-30-flow-control.md', 'le contrôle')} et ${link(X.source, 'les quatre expériences qui ont suivi')} ;</li>
<li>OpenStay : ${link(O.records.protocol, 'son protocole et ses kits')}, et les registres de ${link(O.records.pilot, 'son pilote')}, de ${link(O.records.j3, 'J3')}, de ${link(O.records.j4, 'J4')} et de ${link(O.records.j5, 'J5, provisoire')} ; ses six arbres sont dans leur propre dépôt, une branche par arbre et par jalon ;</li>
<li>les journaux, les notes et les lectures : ${link('docs/evaluations/flow', 'flow/')}.</li>
</ul>
<p>Les chiffres de cette page sont lus dans ces fichiers par ${link('site/collect.mjs', 'site/collect.mjs')} ; ceux d’OpenStay sont copiés des tableaux de ses registres dans ${link('site/openstay.mjs', 'site/openstay.mjs')}, chacun avec le registre dont il vient.</p>

<footer>clean-ddd · expériences menées et rédigées avec un assistant IA. Les corrections sont bienvenues en issues sur le dépôt.</footer>
`;
};
