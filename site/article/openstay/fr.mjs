/** L’article en français : OpenStay, cinquante fonctionnalités puis vers cent. Sa prose autour des chiffres que build.mjs calcule. */
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
<h1>OpenStay : cinquante fonctionnalités, puis vers cent</h1>
<p class="dek">Douze fonctionnalités d’une application de notes laissaient la question principale ouverte : la Clean Architecture commence-t-elle à payer quand le code ne tient plus dans la tête d’un agent ? OpenStay est le test plus long : une place de marché de logements, avec de l’argent qui passe par un prestataire de paiement et un changement de base de données non annoncé à l’avance, construite fonctionnalité par fonctionnalité par des agents sur trois arbres nus et trois arbres Clean DDD, chaque fonctionnalité à partir du plus petit modèle.</p>
<p class="byline">4 novembre 2026, mis à jour le 8 novembre 2026 avec le cinquième jalon, et le 10 novembre 2026 pour le clore · Les expériences <a href="https://github.com/jgaNet/clean-ddd">clean-ddd</a> · Chaque chiffre ci-dessous est copié des registres des jalons dans le dépôt.</p>
</header>

<div class="answer">
<p><strong>La réponse courte.</strong> À cinquante fonctionnalités, chaque arbre a livré chaque fonctionnalité. Les arbres nus n’ont jamais eu besoin de plus que le plus petit modèle et sont restés ${cheaper(osJ4)} fois moins chers ; les arbres Clean DDD ont eu besoin d’un plus grand modèle pour ${osEscalated('clean')} fonctionnalités sur ${osDelivered('clean')}. Là où les arbres Clean DDD ont été meilleurs, c’est ce que les tests ne voient pas : le passage à PostgreSQL n’y a touché aucune règle, une lecture indépendante a trouvé un double versement possible dans un arbre nu et aucun défaut sur l’argent dans aucun arbre Clean DDD, et leurs contextes sont restés séparés. Vers la centième, chaque arbre s’est arrêté, chacun sur une règle que personne n’avait écrite ; énoncer deux de ces règles a laissé passer les arbres Clean DDD.</p>
<p>Le premier benchmark, sur l’application de notes, est <a href="${hrefs.control}">un article à lui seul</a> ; les quatre expériences entre les deux en sont <a href="${hrefs.extensions}">un autre</a>.</p>
</div>

<h2>Le protocole</h2>
<p>${link(O.records.protocol, 'OpenStay')} est une place de marché de logements, née d’${link(O.records.brief, 'un brief')} avec des règles sur les nuits, l’argent et les permissions, construite fonctionnalité par fonctionnalité en jalons de dix à vingt-cinq fonctionnalités.</p>
<ul>
<li><strong>Deux bras, trois arbres chacun.</strong> Le bras simple est un projet TypeScript nu tenu par <code>yarn verify</code>. Le bras Clean DDD est un projet créé par notre outil, tenu par la porte, l’event storm de chaque fonctionnalité étant décidé avec le mainteneur avant qu’elle ne tourne.</li>
<li><strong>Une échelle de modèles.</strong> Chaque fonctionnalité démarre avec le plus petit modèle de la famille, et ne monte d’un échelon que lorsque sa tentative échoue : la porte ou <code>yarn verify</code>, les tests cachés de la fonctionnalité, ou ceux d’une fonctionnalité antérieure. Un test caché qui échoue est rejoué seul avant de compter, pour que la charge de la machine ne passe pas pour un défaut.</li>
<li><strong>L’hypothèse, écrite avant tout essai :</strong> à mesure que les arbres grandissent, le bras simple a besoin des plus grands modèles plus tôt que le bras Clean DDD.</li>
</ul>
<h2 id="fifty">Cinquante fonctionnalités, en trois jalons</h2>
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
<h2 id="reading">Ce que les tests ne voient pas</h2>
<p><strong>Ce que les tests ne voient pas, c’est là que les bras diffèrent.</strong> Trois agents neufs ont lu les six arbres finaux selon ${link('docs/evaluations/benchmark/openstay/j4/reading.md', 'une grille')} écrite avant qu’aucun arbre ne soit lu.</p>
<ul>
<li><strong>L’argent.</strong> Un arbre simple peut payer un hôte deux fois : deux serveurs qui exécutent le travail de versement au même moment écrivent chacun un versement, et rien ne refuse le second. Il passe tous les tests cachés, qui exécutent le travail d’un seul serveur à la fois. Nous avons lu le code, et l’affirmation tient. Aucun arbre Clean DDD n’échoue à un critère sur l’argent.</li>
<li><strong>Des parties séparées.</strong> Les arbres Clean DDD gardent leurs contextes séparés, dans les trois arbres ; les arbres simples en partie.</li>
<li><strong>Des règles énoncées une fois</strong> : pas mieux dans un bras que dans l’autre. Les arbres simples répètent ce qui est encore remboursable et ce qu’un versement doit ; les arbres Clean DDD répètent qui peut agir sur une annonce, une fois par contexte.</li>
<li><strong>Le coût d’un changement, lu plutôt que fait.</strong> Pour trois demandes de changement, les lecteurs ont nommé chaque fichier qu’un développeur modifierait. Un changement touche 2 à 3 fois plus de fichiers dans un arbre Clean DDD, et demande 2 à 4 fois moins de lignes pour les trouver.</li>
</ul>
<p><strong>Ce que cela ajoute à la première réponse.</strong> À cinquante fonctionnalités, sur des demandes précises, avec un seul agent qui écrit tout l’arbre, l’architecture coûte toujours plus et ne livre pas plus. Ce qu’elle apporte se voit maintenant sur une application plus grande : un changement de stockage tenu hors des règles, aucun défaut sur l’argent là où un arbre nu pouvait payer deux fois, et des contextes qui restent séparés. Un cinquième jalon a mené les arbres vers cent fonctionnalités (<a href="#j5">ci-dessous</a>). À côté, huit expériences annexes étaient prévues, chacune retirant une condition qui favorise le bras nu : un contexte limité, des demandes vagues, du chaos sur l’argent, un mainteneur neuf, des défauts injectés à déboguer, et des pull requests à relire, plus une répartition par contexte et du code d’amorçage généré pour le bras Clean DDD. Seule une sonde à deux développeurs sur une demande a tourné avant la clôture de J5.</p>

<h2 id="j5">J5 : vers cent fonctionnalités, chaque arbre s’est arrêté</h2>
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
<p class="note">Les échelons et les coûts après le 8 novembre étaient dans les journaux perdus ; seules les livraisons et les arrêts sont connus.</p>
<ul>
<li><strong>Les deux arbres qui s’étaient arrêtés à 64 l’ont passée.</strong> Ils ont ensuite livré presque chaque demande avec le plus petit modèle, la 73 comprise, là où chaque arbre nu a échoué.</li>
<li><strong>Le troisième s’est arrêté à 61,</strong> sur la couture suivante.</li>
<li><strong>clean-1 s’est arrêté à 80,</strong> sur le même refus que l’arbre nu simple-3. Les deux répondaient <code>503</code> à un don sans prestataire, une convention que chacun avait prise à la demande 26 ; la demande 1 dit qu’un refus est un <code>4xx</code> ou une opération qui finit en <code>ERROR</code>.</li>
<li><strong>clean-3 a atteint 85,</strong> et a été vu en dernier à 86.</li>
<li><strong>La formulation a compté.</strong> Avec le message de la porte « retrouve-le par l’identifiant que l’amont a répondu », le plus petit modèle a gardé le mauvais identifiant. Avec « l’identifiant que cette demande même a répondu : un signalement d’un message se retrouve par l’identifiant du signalement », il a livré.</li>
<li><strong>Ce que sont devenues les trois règles.</strong> L’identité née une fois et le test de relation sont maintenant ${link('docs/adr/0033-identity-is-born-once-and-a-relationship-crossed-is-tested.md', 'l’ADR 33')}. Refuser d’emblée un appelant manquant change ce que chaque serveur répond, c’est donc d’abord ${link('docs/rfc/0003-who-reaches-a-command.md', 'une RFC')}.</li>
</ul>
<p><strong>Une règle donnée tard n’atteint que le code nouveau.</strong> Une phrase a été ajoutée au guide de deux arbres nus à la demande 72 : « une lecture ne change jamais ce qui est stocké ».</p>
<ul>
<li>Avec les plus petits modèles, cela n’a rien changé : ils l’ont appliquée au code qu’ils écrivaient, et ont laissé en place les lectures qui font expirer.</li>
<li>Seul le modèle le plus fort l’a portée jusqu’au code déjà là, et l’un des deux arbres a encore laissé derrière lui un de ses tests antérieurs.</li>
<li>La phrase entre dans le guide de départ du bras nu pour la prochaine campagne.</li>
</ul>
<p>Les deux arbres ont ensuite continué comme bras séparé, Simple+ :</p>
<ul>
<li><strong>simple-3 a livré de 74 à 79 et s’est arrêté à 80,</strong> sur le même <code>503</code> que clean-1 de Full+.</li>
<li><strong>simple-1 a de nouveau échoué à 73.</strong> La phrase disait ce qu’une lecture ne doit pas faire, pas qu’une lecture montre quand même ce que le temps a changé.</li>
<li><strong>simple-2 n’a pas été poursuivi.</strong></li>
</ul>
<p><strong>Une réparation par échec trié.</strong> Les deux bras de suite n’avaient pas été traités de la même façon : trois corrections pour Full+, une phrase pour Simple+. À partir du 9 novembre, chaque arbre des deux bras a été réparé une fois après un échec trié (${link('docs/evaluations/benchmark/openstay/j5/repairs.md', 'la règle et ses corrections')}) :</p>
<ul>
<li>la demande antérieure dont l’arbre a enfreint la règle est nommée ;</li>
<li>une section du guide de l’arbre énonce cette règle pour chaque fonctionnalité, jamais la réponse d’un test ;</li>
<li>l’arbre rejoue la demande qu’il a échouée, et ce rejeu est la sonde de la correction.</li>
</ul>
<p>Ce que cela a donné :</p>
<ul>
<li><strong>Chaque correction essayée a tenu dès sa première formulation :</strong> le refus dans les deux bras, le temps et les lectures dans le bras nu.</li>
<li><strong>L’arbre le plus avancé de chaque bras a atteint 85 :</strong> simple-3 après sa réparation, Full+ clean-3 sans en avoir besoin. simple-3 a rejoué 80 avec le plus petit modèle et a atteint 85 ; clean-1 a rejoué 80 et a été vu en dernier sur 84 ; simple-1 a rejoué 73 et attendait un créneau à 77.</li>
<li><strong>Aucun n’a atteint cent, et deux réparations n’ont jamais tourné,</strong> celles de clean-2 de Full+ et de simple-2.</li>
<li><strong>Chaque échec réparé était une règle qu’une demande avait tranchée et que l’arbre n’avait pas tenue,</strong> dans les deux bras. Énoncer la règle une fois l’a corrigé, pas un plus grand modèle.</li>
</ul>
<p><strong>Deux développeurs sur une demande.</strong> La demande 64 a été partagée entre deux agents, un par propriétaire des contextes qu’elle traverse (${link('docs/evaluations/benchmark/openstay/j5/side/two-developers/results.md', 'les résultats')}). Elle a été livrée :</p>
<ul>
<li>${O.j5.twoDevelopers.old[0]} fois sur ${O.j5.twoDevelopers.old[1]} sur l’ancien kit ;</li>
<li>${O.j5.twoDevelopers.fullplus[0]} sur ${O.j5.twoDevelopers.fullplus[1]} sur le nouveau ;</li>
<li>${O.j5.twoDevelopers.integrator[0]} sur ${O.j5.twoDevelopers.integrator[1]} avec un intégrateur, qui passe la porte sur le code fusionné et remet chaque échec à son propriétaire.</li>
</ul>
<p>La règle a rendu la couture visible à chaque fois. Sans l’intégrateur, la demande qui l’aurait corrigée est arrivée à un agent dont la session était terminée.</p>
<p><strong>Ce que J5 ajoute.</strong> Sur une application plus grande, la question n’est plus quel bras a besoin d’un plus grand modèle, mais lequel s’arrête, et où. Les deux s’arrêtent là où une règle n’a jamais été écrite, et à deux coutures les règles de l’architecture, lues à la lettre, ont choisi la mauvaise réponse. Écrites, elles ont laissé passer le plus petit modèle.</p>
<p><strong>J5 est clos sur ce que l’on sait.</strong> Le 10 novembre, la machine de la session a été remplacée, et les arbres et leurs journaux sont partis avec elle (${link('docs/evaluations/benchmark/openstay/j5/lost-on-10-november.md', 'ce qui a été perdu')}).</p>
<ul>
<li>Les résultats jusqu’au 8 novembre sont lus dans les journaux.</li>
<li>Ce qui a suivi vient des notes de la session, et ne peut pas être vérifié.</li>
<li>Les bras de suite n’ont pas atteint 100 ; la seconde correction, la lecture et les autres expériences annexes n’ont pas tourné.</li>
</ul>
<p><strong>J5b a mené un arbre de chaque bras jusqu’à cent,</strong> avec chaque règle trouvée par J5 écrite dès la première demande : <a href="${hrefs.j5b}">l’article suivant</a>.</p>

<h2>Ce que cela ne montre toujours pas</h2>
<ul>
<li><strong>La vie d’un produit.</strong> Aucun arbre OpenStay n’a atteint cent fonctionnalités dans J5, ni sur le kit tel qu’enregistré ni dans les bras de suite ; les plus avancés ont atteint 85. J5b y a mené un arbre par bras, dans l’échantillon (<a href="${hrefs.j5b}">son article</a>). J5 a été clos sur ce que l’on sait après la perte de la machine et de ses arbres, et ce qui a suivi le 8 novembre vient des notes de la session et ne peut pas être vérifié.</li>
<li><strong>La concurrence et les pannes sous test.</strong> Les tests cachés d’OpenStay tuent maintenant des serveurs, en font tourner deux à la fois et rejouent des webhooks, et ont quand même manqué un double versement qu’un lecteur a trouvé. La suite de chaos prévue au cinquième jalon, l’argent sous panne sur chaque arbre final, n’a pas tourné.</li>
<li><strong>Les gens.</strong> Ici, ce sont des agents qui lisent le code, pas des développeurs qui doivent le maintenir pendant des années. Un changement touche plus de fichiers dans un arbre Clean DDD et demande moins de lignes pour les trouver ; ce que cela coûte à un relecteur, nous ne l’avons pas chiffré.</li>
<li><strong>L’indépendance.</strong> Une seule personne a conçu l’architecture, le benchmark et la grille, et des agents ont noté les arbres.</li>
<li><strong>La taille de l’échantillon.</strong> Trois arbres par bras.</li>
</ul>

<h2>Le reproduire</h2>
<p>Tout est dans le dépôt :</p>
<ul>
<li>${link(O.records.protocol, 'le protocole et les kits')}, écrits avant les essais, et ${link('docs/evaluations/benchmark/openstay/j5/triage.md', 'la règle de triage de J5')} ;</li>
<li>les registres du ${link(O.records.pilot, 'pilote')}, de ${link(O.records.j3, 'J3')}, de ${link(O.records.j4, 'J4')} et de ${link(O.records.j5, 'J5')}, et ${link('docs/evaluations/benchmark/openstay/j4/reading.md', 'la grille de la lecture')} ;</li>
<li>les six arbres jusqu’à J4, dans leur propre dépôt, une branche par arbre et par jalon (les arbres de J5 ont été perdus).</li>
</ul>
<p>Les chiffres de cette page sont copiés des tableaux des registres dans ${link('site/openstay.mjs', 'site/openstay.mjs')}, chacun avec le registre dont il vient.</p>

<footer>clean-ddd · expériences menées et rédigées avec un assistant IA. Les corrections sont bienvenues en issues sur le dépôt.</footer>
`;
};
