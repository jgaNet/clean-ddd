# OpenStay — Product Brief & Clean DDD Project Specification (source)

*The brief as the maintainer handed it over on 2026-10-31, kept verbatim, in its language. It is the source of the [protocol](README.md) and of the [framing](j0.md); it is never given to an agent of any arm, since it names the architecture one arm is measured against. A change to the product is made in the framing and the requests, never here.*

---

**Version :** 1.0
**Statut :** Vision produit et spécification initiale
**Projet cible :** `jgaNet/clean-ddd`
**Horizon d'évaluation :** 12 à 24 mois

## 1. Vision du produit

OpenStay est une plateforme open source de location de logements entre particuliers et professionnels, visant à proposer une alternative complète à Airbnb.

La plateforme doit être :

- **Gratuite** : aucune commission prélevée sur les réservations.
- **Transparente** : aucun frais caché ni marge sur les paiements.
- **Autosuffisante** : son objectif est de couvrir ses dépenses, sans maximiser les profits.
- **Accessible** : ouverte aux voyageurs et aux hébergeurs particuliers et professionnels.
- **Internationale à terme** : multilingue, multidevise et adaptée aux différentes réglementations.
- **Fiable** : réservations, disponibilités et paiements cohérents, sécurisés et traçables.
- **Open source** : code auditable et possibilité de contributions communautaires.

### Mission

> Permettre à chacun de proposer ou réserver un logement sans commission de plateforme, grâce à un service fiable, transparent et financièrement durable.

OpenStay doit être conçu comme un véritable produit exploitable, et non comme une application de démonstration.

## 2. Modèle économique

### 2.1 Gratuité

OpenStay ne facture :

- Aucun abonnement obligatoire.
- Aucun frais de publication d'annonce.
- Aucune commission aux voyageurs.
- Aucune commission aux hébergeurs.
- Aucune majoration sur les frais des prestataires de paiement.

### 2.2 Frais externes

Les frais réels des prestataires de paiement doivent être affichés de manière transparente.

Ils peuvent être répercutés sans marge uniquement lorsque la réglementation et les contrats des prestataires le permettent.

Les frais de paiement par carte de consommateur ne peuvent notamment pas être systématiquement ajoutés au prix dans l'Union européenne.

Lorsque la répercussion est interdite, le coût doit être supporté ou alloué par un autre mécanisme licite.

### 2.3 Financement

Les sources de financement envisagées sont :

- Dons volontaires.
- Contributions facultatives des hébergeurs et voyageurs.
- Mécénat.
- Subventions.
- Autres ressources compatibles avec la mission, sous réserve de validation.

Les contributions financières ne doivent pas influencer le classement des annonces.

### 2.4 Équilibre financier

OpenStay vise un équilibre financier pluriannuel, permettant :

- De financer les infrastructures.
- De rémunérer les équipes.
- D'assurer la sécurité et la conformité.
- De financer le support et la modération.
- De constituer des réserves.
- De maintenir et améliorer le produit.

Les éventuels excédents doivent être réinvestis dans le service et sa pérennité, selon la structure juridique retenue.

## 3. Utilisateurs

### Voyageur

Peut rechercher des logements, consulter les disponibilités, réserver, payer, annuler, communiquer avec les hôtes et publier des avis.

### Hôte particulier

Peut publier un logement, définir ses disponibilités, ses tarifs, ses règles et ses moyens de paiement, gérer ses réservations et recevoir les paiements.

### Hôte professionnel

Dispose des mêmes fonctionnalités avec des capacités supplémentaires : gestion de plusieurs logements, collaborateurs, permissions, facturation et reporting.

### Administrateur

Gère les signalements, la modération, les litiges, le support et les incidents.

### Contributeur financier

Peut effectuer une contribution volontaire sans bénéficier d'un traitement privilégié dans la recherche ou les réservations.

## 4. Fonctionnalités attendues

### 4.1 Identité et comptes

- Inscription et connexion.
- Vérification d'email et de téléphone.
- Authentification multifacteur.
- Profils particuliers et professionnels.
- Vérification d'identité lorsque nécessaire.
- Gestion des organisations et collaborateurs.
- Rôles et permissions.
- Gestion des données personnelles.

### 4.2 Annonces

- Création et modification de logements.
- Photos et descriptions.
- Localisation géographique.
- Capacité d'accueil.
- Équipements et services.
- Règles du logement.
- Conditions d'arrivée et de départ.
- Publication, suspension et archivage.
- Gestion de plusieurs logements.

### 4.3 Recherche

- Recherche par destination.
- Recherche par dates.
- Nombre de voyageurs.
- Filtres de prix et d'équipements.
- Recherche géographique sur carte.
- Tri et classement transparents.
- Favoris.
- Disponibilités actualisées.

### 4.4 Calendriers

- Disponibilités.
- Blocage de dates.
- Durée minimale et maximale.
- Délais de réservation.
- Restrictions d'arrivée et de départ.
- Synchronisation iCalendar.
- Prévention des doubles réservations.
- Gestion des réservations concurrentes.

### 4.5 Tarification

- Prix par nuit.
- Tarification saisonnière.
- Réductions.
- Frais de ménage et autres frais autorisés.
- Taxes applicables.
- Devises.
- Calcul du prix total avant confirmation.
- Historique des devis et des conditions acceptées.

### 4.6 Réservations

- Réservation instantanée ou sur demande.
- Option temporaire sur les dates.
- Acceptation et refus par l'hôte.
- Confirmation.
- Modification.
- Annulation.
- Expiration.
- Historique des transitions.
- Politique d'annulation versionnée.

### 4.7 Paiement via OpenStay

OpenStay orchestre les paiements à travers un prestataire agréé.

Fonctionnalités :

- Paiement sécurisé.
- Authentification forte lorsque requise.
- Encaissement.
- Remboursement total ou partiel.
- Reversement aux hôtes.
- Traitement des échecs.
- Webhooks.
- Rapprochement financier.
- Gestion des contestations et chargebacks.
- Traçabilité des opérations.

OpenStay ne doit pas détenir directement les fonds des utilisateurs sans autorisation réglementaire appropriée.

L'intégration initiale peut utiliser Stripe Connect en environnement de test, avec une architecture permettant d'évaluer ou remplacer le prestataire.

### 4.8 Paiement direct à l'hôte

Le voyageur et l'hôte peuvent choisir un paiement direct, par exemple par virement SEPA, lorsque ce mode est disponible et accepté.

Fonctionnalités :

- Sélection explicite du mode de paiement.
- Instructions de paiement sécurisées.
- Confirmation déclarative par l'hôte.
- Dépôt éventuel de justificatifs.
- Délais de paiement.
- Gestion des paiements non confirmés.
- Contestation.
- Suivi des remboursements directs.

OpenStay ne doit jamais présenter un paiement direct comme vérifié par une banque si cette vérification n'a pas réellement eu lieu.

La plateforme ne garantit pas l'exécution des remboursements effectués directement entre utilisateurs.

### 4.9 Messagerie

- Conversations voyageurs-hôtes.
- Notifications.
- Pièces jointes sécurisées.
- Historique.
- Signalement des abus.
- Protection contre les tentatives de fraude.

### 4.10 Avis

- Avis après séjour.
- Notes et commentaires.
- Prévention des faux avis.
- Modération.
- Droit de réponse.
- Règles de publication transparentes.

### 4.11 Confiance et sécurité

- Détection de fraude.
- Vérification des annonces.
- Signalements.
- Modération.
- Gestion des litiges.
- Protection contre les faux RIB.
- Détection des comptes suspects.
- Journalisation des décisions sensibles.

### 4.12 Administration

- Tableau de bord opérationnel.
- Gestion des comptes et annonces.
- Support.
- Modération.
- Traitement des incidents.
- Gestion des litiges.
- Audit des opérations.
- Gestion des politiques et configurations.

### 4.13 Sustainability

Domaine chargé de mesurer la viabilité économique :

- Coût par réservation.
- Coût par utilisateur actif.
- Coût des paiements.
- Coût du support.
- Revenus de dons et mécénat.
- Prévisions budgétaires.
- Suivi de l'équilibre financier.
- Publication d'indicateurs de transparence.

## 5. Invariants métier

Les invariants suivants sont prioritaires :

1. `platformCommission = 0`.
2. `paymentMarkup = 0`.
3. Aucune réservation confirmée ne peut créer de conflit de disponibilité.
4. Une même opération financière ne peut pas être exécutée deux fois à cause d'un retry.
5. Un remboursement ne peut pas dépasser le montant encore remboursable.
6. Un reversement ne peut pas dépasser les fonds disponibles et éligibles.
7. Une réservation annulée et un paiement remboursé sont deux états distincts.
8. Le prix et les conditions acceptés doivent être conservés sous forme d'instantané.
9. Un don ne doit pas influencer le classement des annonces.
10. Les frais externes doivent être identifiés et présentés avant engagement.
11. Les paiements directs ne doivent jamais être déclarés vérifiés sans preuve fiable.
12. Les événements asynchrones doivent pouvoir être rejoués sans corrompre l'état métier.

Ces invariants doivent être complétés par des règles explicites concernant la fiscalité, les permissions, la conservation des données et les litiges.

## 6. Architecture cible

L'architecture doit être définie selon les principes de `clean-ddd`.

### Bounded contexts candidats

- Identity
- Organizations
- Authorization
- Hosts
- Listings
- Search
- Availability
- Pricing
- Booking
- Payment Orchestration
- Direct Payments
- Refunds
- Payouts
- Payment Ledger
- Messaging
- Reviews
- Trust & Safety
- Disputes
- Notifications
- Administration
- Sustainability
- Compliance

Ces frontières sont des hypothèses initiales, à valider par une analyse Strategic DDD.

### Principes techniques

- Domain-Driven Design.
- Clean Architecture.
- Dépendances orientées vers le domaine.
- Contrats explicites entre bounded contexts.
- Value objects pour les concepts métier.
- Use cases indépendants des frameworks.
- Événements métier explicites.
- Idempotence.
- Transactional outbox lorsque nécessaire.
- Orchestration ou chorégraphie de sagas selon les cas.
- Observabilité.
- Tests automatisés.
- Gestion des évolutions et migrations.

Le choix du langage, des frameworks, des bases de données et des infrastructures doit faire l'objet de décisions architecturales documentées.

## 7. Interface utilisateur

OpenStay doit proposer une interface web et mobile responsive.

Les principales interfaces sont :

- Recherche de logements.
- Carte interactive.
- Fiche logement.
- Calendrier.
- Réservation.
- Paiement.
- Messagerie.
- Tableau de bord hôte.
- Administration.

### IA conversationnelle

Une interface conversationnelle avec Generative UI pourra être intégrée pour permettre des interactions telles que :

« Trouve-moi une maison pour six personnes à Bordeaux du 10 au 17 août, pour moins de 1 200 €. »

Le LLM peut interpréter une intention, proposer des actions et générer des interfaces adaptées.

Il ne peut pas exécuter directement une opération sensible sans passer par les use cases, les contrôles d'autorisation et les confirmations nécessaires.

L'interface traditionnelle doit rester pleinement utilisable sans IA.

## 8. Réglementation et conformité

Le projet doit intégrer un catalogue réglementaire versionné.

Domaines à étudier :

- RGPD.
- Digital Services Act.
- Protection des consommateurs.
- Obligations d'information sur les prix.
- Obligations des plateformes de location.
- DAC7 et obligations déclaratives applicables.
- Réglementation des paiements.
- Règles de facturation et de fiscalité.
- Obligations locales relatives aux meublés touristiques.
- Accessibilité numérique.
- Sécurité informatique.
- Modération des contenus et signalements.

Les obligations dépendent notamment du pays, du statut des hôtes, du type de logement et des flux de paiement.

Les interprétations juridiques doivent être identifiées comme telles et validées avant mise en production.

## 9. Objectif du benchmark Clean DDD

OpenStay doit permettre de mesurer la pertinence de `clean-ddd` sur un produit réel, avec une complexité croissante.

### Approches à comparer

**A. Baseline**

Développement avec une architecture simple, sans contraintes Clean DDD supplémentaires.

**B. Clean DDD**

Développement utilisant les principes et mécanismes du dépôt `clean-ddd`.

**C. Clean DDD Multi-Agent**

Développement avec orchestration de plusieurs agents spécialisés et coordination des modifications transversales.

### Métriques

- Temps de développement.
- Tokens consommés.
- Coût des appels LLM.
- Nombre d'itérations.
- Temps de revue.
- Défauts détectés.
- Défauts échappés en production.
- Couverture des tests métier.
- Régressions.
- Complexité des modifications.
- Couplage entre modules.
- Violations architecturales.
- Temps de correction.
- Coût des changements transversaux.
- Maintenabilité.
- Évolution des performances.

### Méthodologie

Les trois approches doivent recevoir les mêmes exigences fonctionnelles, critères d'acceptation et tests d'évaluation.

Les expériences doivent être reproductibles, avec les versions de modèles, prompts, outils, configurations et budgets documentés.

Les fonctionnalités développées dans les branches expérimentales ne doivent pas être automatiquement déployées en production.

## 10. Plan de développement

### Phase 0 — Discovery et architecture

- Event Storming.
- Domain Storytelling.
- Context Mapping.
- Identification des agrégats.
- Définition des invariants.
- Analyse des risques.
- Décisions techniques.
- Backlog initial.
- Protocole de benchmark.

### Phase 1 — Marketplace fondamentale

- Identité.
- Hôtes.
- Annonces.
- Recherche.
- Calendriers.
- Réservations sans paiement réel.

### Phase 2 — Transactions

- Paiements via PSP.
- Paiements directs.
- Remboursements.
- Reversements.
- Annulations.
- Réconciliation.

### Phase 3 — Marketplace complète

- Messagerie.
- Avis.
- Modération.
- Litiges.
- Notifications.
- Support.

### Phase 4 — Internationalisation

- Langues.
- Devises.
- Réglementations locales.
- Fiscalité.
- Synchronisation des calendriers.

### Phase 5 — Maturité

- Performance.
- Résilience.
- Scalabilité.
- Observabilité.
- Optimisation des coûts.
- Automatisation.
- Gouvernance communautaire.

## 11. Livrables attendus de clean-ddd

Avant toute implémentation, produire :

1. Une analyse de faisabilité.
2. Un modèle de domaine stratégique.
3. Une context map.
4. Un catalogue d'invariants.
5. Une liste des agrégats et événements métier.
6. Une architecture cible et les ADR associés.
7. Un backlog hiérarchisé en epics, features, user stories et use cases.
8. Une stratégie de test.
9. Une stratégie de benchmark.
10. Une roadmap d'implémentation incrémentale.
11. Un registre des risques techniques, financiers et réglementaires.
12. Une liste des questions ouvertes et décisions à valider.

**Ne pas commencer à coder avant la validation de ces livrables.**

## 12. Critères de réussite

Le projet sera considéré comme réussi si :

- La plateforme permet de réaliser de véritables réservations de bout en bout.
- Les deux modes de paiement fonctionnent conformément à leurs garanties annoncées.
- Les commissions OpenStay restent nulles.
- Les frais sont transparents et juridiquement conformes.
- La plateforme peut mesurer son coût réel de fonctionnement.
- Les domaines métier restent cohérents malgré leur complexité.
- Les changements fonctionnels sont réalisables sans régressions disproportionnées.
- Les expérimentations architecturales produisent des résultats comparables et reproductibles.
- L'application peut être maintenue et développée sur plusieurs années.

**Directive finale :**

Traiter OpenStay comme un produit réel, complet et évolutif. Utiliser Clean DDD comme un cadre à éprouver empiriquement, et non comme une solution présumée supérieure. Documenter les compromis, mesurer les résultats et privilégier la qualité métier, la sécurité et la maintenabilité.

---

## Notes de l'auteur du brief

Une recommandation pour le benchmark : ne pas commencer par créer les 22 bounded contexts comme des microservices séparés. Privilégier un monolithe modulaire avec des frontières métier explicites, puis utiliser les évolutions du produit pour mesurer quand une séparation technique devient réellement intéressante. Cela permettra notamment de tester si Clean DDD aide à gérer les changements transversaux et la complexité croissante, sans introduire artificiellement les coûts d'une architecture distribuée dès le premier jour.

## La consigne du mainteneur (2026-10-31)

> Garde le protocole que l'on a prévu avec l'évolution. Juste prépare le travail avant de commencer.

Le protocole en question est celui des checkpoints, du plus petit modèle d'abord et de la bascule par fonctionnalité vers un modèle plus fort, d'un cran à la fois (2026-10-31 : « pas directement au meilleur, un modèle intermédiaire, meilleur mais moins cher ») ; il est écrit dans [le README](README.md).
