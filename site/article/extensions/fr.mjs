/** L’article en français : les quatre expériences qui ont suivi. Sa prose autour des chiffres que build.mjs calcule. */
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
<h1>Là où l’architecture devrait payer : quatre expériences de plus</h1>
<p class="dek">Le premier benchmark a dit que la Clean Architecture et le DDD n’aidaient pas un agent IA à livrer une petite application, et a nommé ce qu’il ne pouvait pas montrer. Quatre expériences, chacune écrite avec sa prédiction avant de tourner, ont pris une condition sous laquelle l’architecture est censée payer : un modèle plus faible, une base de code qui grandit, un changement de stockage, et le contrat de la répartition donné à un seul agent.</p>
<p class="byline">30 octobre 2026 · Les expériences <a href="https://github.com/jgaNet/clean-ddd">clean-ddd</a> · Chaque chiffre ci-dessous est lu dans les registres du dépôt.</p>
</header>

<div class="answer">
<p><strong>La réponse courte.</strong> Aucune des quatre conditions n’a retourné la première réponse. Le projet nu a encore tout livré avec un modèle plus faible, est resté le plus rapide quand les arbres ont grandi, et a pris le passage à un vrai stockage en moitié moins de temps que l’architecture. Le contrat de la répartition, donné à un seul agent, ne l’a pas rendu plus rapide : le gain de la répartition, c’est son parallélisme. Ce que l’architecture a apporté est mesuré ici : le changement de stockage est resté hors du domaine, et seul l’outil a empêché la structure de dériver.</p>
<p>Les bras, les tests cachés et le correcteur sont ceux du <a href="${hrefs.control}">premier benchmark</a> : A est l’architecture avec notre outil, D l’architecture en prose, P un projet TypeScript nu, C′ la répartition par contexte.</p>
</div>

<h2>Le protocole</h2>
<p><a href="${hrefs.control}">Le contrôle</a> a nommé ce qu’il ne pouvait pas montrer. Nous avons écrit quatre expériences de plus, avec leurs prédictions, avant de les faire tourner (${link('docs/evaluations/benchmark/extensions/README.md', 'le protocole')}). Même pilote, même correcteur, des tests cachés qu’aucun agent n’a vus. La correction a trouvé trois défauts dans notre propre kit, tous consignés comme amendements et appliqués à chaque arbre de la même façon.</p>

<h2>E1. Un modèle plus faible</h2>
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

<h2>E2. La vitesse de la répartition venait-elle de son contrat ?</h2>
<p>Sur la fonctionnalité 8, la répartition C′ a été 21 % plus rapide qu’un agent seul. Mais C′ avait aussi une étape de contrat : un plan par contexte, des événements et des modèles de lecture gelés, et le test d’acceptation. Nous avons donné tout cela à un seul agent, depuis le même commit.</p>
${charts.e2}
${tables.e2}
<p>Avec tout le contrat, un seul agent a pris ${range(X.E2, 'minutes')} minutes, autant que sans. <strong>Le gain de la répartition était le parallélisme, pas le contrat.</strong> Le contrat est ce qui rend le parallélisme sûr ; à lui seul il n’a rien apporté de mesurable.</p>

<h2>E3. Cinq fonctionnalités de plus</h2>
<p>La dégradation architecturale est censée grandir avec la taille du code. Un arbre fini par bras a pris cinq fonctionnalités de plus qui changent ce qui existe : des commentaires, l’historique d’une note avec restauration, des éditeurs sur une note partagée, la suppression d’un compte et de tout ce qu’il possède, et la recherche.</p>
${charts.e3features}
${charts.e3growth}
${tables.e3}
<p>Chaque bras a passé chaque nouveau test, sans régression. La fonctionnalité 11 changeait à dessein une règle de la fonctionnalité 4, et seule l’ancienne assertion de cette règle a échoué. P a été le plus rapide sur quatre fonctionnalités sur cinq. Son temps par fonctionnalité a crû de ${growth('P')} %, et celui de D de ${growth('D')} %, tandis que celui de A a bougé de ${growth('A')} %. C’est la forme que l’hypothèse prédisait pour l’arbre nu, mais D la montre aussi, et chaque bras a un seul arbre. <strong>C’est une direction à mesurer sur un horizon plus long, pas un résultat.</strong></p>
<p>Sans l’outil, la structure a dérivé quand le code a grandi : l’arbre de D est passé de 20 refus des règles d’import générées dans 10 fichiers à ${X.E3.D.drift.refusals} dans ${X.E3.D.drift.files}. L’arbre de A ne peut pas dériver, puisque l’outil refuse la violation.</p>

<h2>E4. Un vrai stockage</h2>
<p>Les ports et les adaptateurs existent pour que le stockage puisse changer à un seul endroit. Un agent neuf par arbre a tout fait passer à SQLite. Un test caché a ensuite redémarré le serveur sur le même fichier et tout relu.</p>
${charts.e4time}
${charts.e4lines}
${tables.e4}
<p>Les six arbres ont réussi, sans régression. <strong>La prédiction sur l’endroit où le changement atterrit a tenu :</strong> aucun essai architecture n’a touché le domaine ni les cas d’usage d’un contexte, seulement les adaptateurs, le câblage et les briques de base. Les essais nus ont changé chaque module, puisque le stockage n’y est pas séparé des règles. <strong>Cela n’a pas rendu le changement moins cher.</strong> P a pris ${range(X.E4.P, 'minutes')} minutes, contre ${range(X.E4.A, 'minutes')} pour A et ${range(X.E4.D, 'minutes')} pour D. Au sein des bras architecture, la taille du changement a suivi un choix de conception, une table par agrégat ou un document chacun, et non le bras.</p>

<h2>Ce que les quatre ajoutent à la première réponse</h2>
<p>Sur une petite application, l’architecture coûte plus sous chaque condition où elle était censée payer, et ne livre pas plus. Deux de ses promesses tiennent et sont maintenant mesurées : un changement de stockage reste hors du domaine, et la structure ne dérive pas quand l’outil la tient. Savoir si ce rendement grandit avec le code, c’est ce qu’<a href="${hrefs.openstay}">OpenStay</a>, une application plus grande construite plus longtemps, a ensuite été lancé pour voir.</p>

<h2>Ce que cela ne montre toujours pas</h2>
<ul>
<li><strong>Un horizon plus long.</strong> Cinq fonctionnalités de plus sur un arbre par bras montrent une direction, pas un résultat ; OpenStay porte la même question au-delà de cinquante fonctionnalités.</li>
<li><strong>Une autre famille de modèles.</strong> Le modèle plus faible était le plus petit de la même famille.</li>
<li><strong>La taille de l’échantillon.</strong> Deux essais par bras dans E1 et E4, un arbre par bras dans E3, deux dans E2.</li>
</ul>

<h2>Le reproduire</h2>
<p>Tout est dans le dépôt :</p>
<ul>
<li>le protocole et ses prédictions, écrits avant les essais : ${link('docs/evaluations/benchmark/extensions/README.md', 'extensions/')} ;</li>
<li>les pilotes et le correcteur : ${link('.claude/flow', '.claude/flow/')} ;</li>
<li>le registre : ${link(X.source, 'les quatre expériences')} ;</li>
<li>les journaux, les notes et les lectures : ${link('docs/evaluations/flow/extensions', 'flow/extensions/')}.</li>
</ul>
<p>Les chiffres de cette page sont lus dans ces fichiers par ${link('site/collect.mjs', 'site/collect.mjs')}.</p>

<footer>clean-ddd · expériences menées et rédigées avec un assistant IA. Les corrections sont bienvenues en issues sur le dépôt.</footer>
`;
};
