# Feuille de route de Montis

Établie le 2 novembre 2026, avec le propriétaire. À tenir à jour : cocher un lot quand sa PR est fusionnée, et noter ce qui a changé de plan.

## Objectif

Une application qui aide **n'importe quel montagnard** : très diversifiée dans ce qu'elle propose, mais d'une qualité exceptionnelle sur chaque fonction.

Le principe : on ne multiplie pas les fonctions par activité. On construit **quelques briques communes excellentes** (le point, le terrain, le temps, la trace, le hors-ligne, la sécurité), et chaque activité les réutilise. La diversité vient des activités, la qualité vient des briques.

## Comment on travaille

**Un lot = une branche depuis `main` = une session = une PR.** Chaque lot doit pouvoir se terminer en une session et se vérifier sur la preview Vercel.

Pour lancer un lot, il suffit d'écrire dans une nouvelle session :

> Lis `docs/feuille-de-route.md` et fais le lot 1.2.

| Claude | Le propriétaire |
|---|---|
| Lit le code, code, lance `npm run build` et les tests | Choisit le lot suivant (ou dit « lot suivant ») |
| Vérifie l'interface dans Chromium au format téléphone et envoie des captures | Teste sur un vrai téléphone ce qu'un navigateur simulé ne montre pas : GPS, boussole, soleil, gants, terrain |
| Pousse, donne le lien de preview Vercel, ouvre la PR si demandé | Tranche les décisions marquées **À décider**, valide le design |
| Coche le lot ici et met à jour CLAUDE.md | Fusionne la PR ; demande les clés d'API quand un lot en a besoin |

Ordre de grandeur : une trentaine de lots. À deux ou trois lots par semaine, il faut compter trois à quatre mois pour tout, mais chaque phase apporte déjà quelque chose d'utilisable.

## Barre qualité

Une fonction n'est terminée que si elle passe tous ces points :

1. Utilisable d'une main, avec des gants, en plein soleil : contraste suffisant, zones de toucher d'au moins 44 px.
2. Comportement hors ligne défini : soit elle marche, soit elle est grisée avec une explication.
3. Échec de la source affiché honnêtement, jamais d'écran vide ni de donnée périmée présentée comme fraîche.
4. Traduite en français et en anglais, unités métriques et impériales respectées.
5. Pas de régression de poids : code chargé à la demande, rien de gros dans `public/`.
6. Vérifiée au format téléphone avant la PR (captures), puis sur un vrai téléphone via la preview.
7. Calculs de sécurité (pentes, soleil, portée, unités, avalanches) couverts par des tests automatiques.
8. Données de sécurité accompagnées d'une mention de prudence : Montis aide à décider, il ne décide pas.

## Ce qui est faisable, et ce qui ne l'est pas

La grande majorité du plan est faisable avec la stack actuelle et des sources gratuites. Quelques limites viennent de la plateforme, pas du code :

| Sujet | Réalité | Conséquence |
|---|---|---|
| GPS écran éteint | Une PWA perd la géolocalisation en arrière-plan, surtout sur iPhone | Suivi en direct écran allumé (Wake Lock), mode économie d'énergie ; pas d'enregistrement écran éteint fiable |
| Notifications hors de l'appli | Exigent un serveur d'envoi | Alertes seulement appli ouverte, au début |
| Boussole (panorama) | Permission demandée sur iPhone, précision variable selon le téléphone | Recalage manuel prévu (faire glisser l'horizon) |
| Clés d'API (OpenAIP, Windy) | Une clé `VITE_` est lisible par tous | Relais serveur en Vercel Functions (`api/`), lot 0.6 |
| Voies d'alpinisme et d'escalade | Pas d'annuaire ouvert parfait ; camptocamp.org (CC BY-SA) et OSM sont les meilleures sources | Vérifier les conditions d'usage de l'API camptocamp avant le lot 3.2 |
| Ombres portées réelles | Calcul plus lourd que l'ombrage classique | Ombrage simple d'abord, ombre portée ensuite (lot 1.4) |

## Phase 0 : fondations

Prérequis à tout le reste : sans eux, chaque ajout alourdit et fragilise l'appli.

- [ ] **0.1 Ménage.** Supprimer `public/pins/png/`, traduire les messages de statut qui ne changent de langue qu'à l'actualisation, mettre CLAUDE.md à jour. *Fini quand* la preview en anglais n'affiche plus de français.
- [ ] **0.2 Découpage du bundle.** Charger chaque activité et chaque outil à la demande (`import()` dans `menu.js`). Mesurer le JavaScript initial avant et après. *Fini quand* l'alerte des 500 Ko disparaît et que chaque menu s'ouvre toujours, en ligne comme hors ligne (le service worker doit précharger les morceaux).
- [ ] **0.3 Tests automatiques.** Vitest, `npm test`, premiers tests sur `unites.js`, `vent-calcul.js`, `portee.js`, `parcours-analyse.js`. *Fini quand* `npm test` passe et que la commande figure dans CLAUDE.md.
- [ ] **0.4 Captures automatiques.** Script Playwright qui ouvre l'appli au format téléphone (et ordinateur), parcourt les écrans clés et enregistre des captures, pour que Claude vérifie chaque lot visuellement avant de pousser. *Fini quand* une commande produit les captures d'un parcours type.
- [ ] **0.5 Menu à dix activités.** **À décider** par le propriétaire : regroupement (Air, Neige, Sentier, Roche…), activité favorite mise en avant, ou autre. Maquette en captures, puis réalisation. *Fini quand* le menu accueille au moins dix activités sans scroll pénible sur téléphone.
- [ ] **0.6 Relais serveur.** Dossier `api/` en Vercel Functions, avec cache et limites. Premier usage : celui du premier lot qui demande une clé. À faire au moment où il devient nécessaire.

## Phase 1 : le point et le terrain

Ce que tout montagnard utilise, quelle que soit son activité.

- [ ] **1.1 Soleil.** Utiliser `suncalc` : lever, coucher, heures dorées, position du soleil, durée du jour. Tests sur des valeurs connues.
- [ ] **1.2 Fiche universelle du point.** Appui long n'importe où (clic droit sur ordinateur) : coordonnées, altitude, pente, orientation, soleil, météo résumée, refuge et point d'eau les plus proches. Branchée sur `peutOuvrirBalise` et `bloquerFiches`.
- [ ] **1.3 Pentes et orientation.** Couches calculées depuis le relief (Terrain Tiles), à la manière de `maplibre-contour` : classes 30°, 35°, 40°, 45° et plus ; orientation en rose de couleurs. Légende claire, réglage d'opacité.
- [ ] **1.4 Ombre du relief.** Ombrage selon la position réelle du soleil à l'heure choisie (curseur), puis ombre portée par les montagnes voisines.
- [ ] **1.5 Frise météo commune.** Un seul composant heure par heure, réutilisé partout : vent, rafales, pluie, orage (CAPE), nuages bas, isotherme 0 °C, températures. Open-Meteo.

## Phase 2 : la trace

Faire de Montis un outil de terrain, pas seulement de préparation.

- [ ] **2.1 Suivi en direct.** Position et cap sur la carte, distance et dénivelé restants sur le parcours affiché, alerte de sortie de trace, écran gardé allumé si demandé. Rando, vélo et toutes les activités à trace.
- [ ] **2.2 Enregistrement et carnet de sorties.** Enregistrer sa trace réelle, la ranger avec date, durée, dénivelé ; carnet consultable hors ligne, inclus dans la sauvegarde `.json`.
- [ ] **2.3 Revoir une sortie.** Statistiques, profil, replay animé en 3D ; import IGC pour le parapente.
- [ ] **2.4 Pack sortie hors ligne.** D'un geste depuis un parcours : carte et relief de la zone, frise météo du jour, bulletin d'avalanche, trace.
- [ ] **2.5 Sécurité.** Mode urgence (coordonnées en grand, altitude, 112 et secours en montagne par pays, sans réseau), heure de retour prévue, envoi de sa position par SMS ou partage du téléphone, sans serveur.

## Phase 3 : nouveaux profils

Chacun réutilise les briques des phases 1 et 2. L'ordre reste à confirmer selon les priorités du propriétaire.

- [ ] **3.1 Ski de rando et raquettes.** Pentes, orientation, bulletin d'avalanche et trace réunis ; itinéraires de ski de rando d'OSM (`piste:type=skitour`).
- [ ] **3.2 Alpinisme.** Voies et refuges (camptocamp.org, OSM), isotherme 0 °C, fenêtre météo, glaciers et crevasses déjà affichés.
- [ ] **3.3 Escalade.** Sites et secteurs (OSM `sport=climbing`, camptocamp), orientation de la falaise, heures d'ombre et de soleil, roche probablement sèche après la pluie.
- [ ] **3.4 Trail.** Trace avec temps de passage cibles, ravitaillements et points d'eau, allure selon la pente.
- [ ] **3.5 Parapente avancé.** Plafond et thermiques (base des nuages, gradient, CAPE), fiche de décollage avec feu vert, orange ou rouge, espaces aériens (OpenAIP, clé via le relais 0.6), affichés aussi sur la portée de vol.
- [ ] **3.6 Via ferrata et canyon.** Accès, cotations d'OSM, alerte orage et crue.
- [ ] **3.7 Nature et règles.** Réserves et parcs avec leurs règles (bivouac, chiens, drones), observations de faune et de flore ouvertes (GBIF).

## Phase 4 : les effets « waouh »

- [ ] **4.1 Panorama des sommets.** Vue 3D orientée comme le téléphone (boussole), avec les sommets nommés ; recalage au doigt.
- [ ] **4.2 Où aller ce week-end ?** Suggestions selon l'activité, le niveau, la météo et la distance, à partir des données déjà présentes.
- [ ] **4.3 Check-list de matériel.** Générée selon la sortie : altitude, saison, durée, activité, météo.
- [ ] **4.4 Webcams.** Webcams proches d'un point (source à choisir ; clé via le relais si nécessaire).
- [ ] **4.5 Partage par lien.** Un lien ouvre la vue, un parcours ou un point, sans compte (tout dans l'URL).

## Décisions à prendre

| Décision | Quand | Proposition |
|---|---|---|
| Organisation du menu à dix activités | Avant le lot 0.5 | Regroupement par milieu, avec activité favorite en tête |
| Compte utilisateur ou appli 100 % locale | Avant la phase 2 | Rester local ; sauvegarde `.json` et partage par lien suffisent |
| Ordre des nouveaux profils | Avant la phase 3 | Ski de rando, alpinisme, escalade d'abord : ils réutilisent le plus |
| Texte de la mention de prudence | Lot 1.2 | Court, visible une fois, rappelé sur les couches de sécurité |
