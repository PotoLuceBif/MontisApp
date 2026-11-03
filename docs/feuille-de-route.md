# Feuille de route de Montis

Établie le 2 novembre 2026, avec le propriétaire. À tenir à jour : cocher un lot quand sa PR est fusionnée, et noter ce qui a changé de plan.

## Objectif

Une application qui aide **n'importe quel montagnard** : très diversifiée dans ce qu'elle propose, mais d'une qualité exceptionnelle sur chaque fonction.

Le principe : on ne multiplie pas les fonctions par activité. On construit **quelques briques communes excellentes** (le point, le terrain, le temps, la trace, le hors-ligne, la sécurité), et chaque activité les réutilise. La diversité vient des activités, la qualité vient des briques.

## Comment on travaille

**Un lot = une branche depuis `developpement` = une session = une PR vers `developpement`.** `main` (la production) ne reçoit que les versions, quand le propriétaire le décide. Chaque lot doit pouvoir se terminer en une session et se vérifier sur la preview Vercel.

Pour lancer un lot, il suffit d'écrire dans une nouvelle session :

> /lot 1.2

(ou « Lis `docs/feuille-de-route.md` et fais le lot 1.2 »). Après un test de la preview, `/retour` avec des captures d'écran.

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
| Voies d'alpinisme et d'escalade | Pas d'annuaire ouvert parfait ; camptocamp.org (CC BY-SA) et OSM sont les meilleures sources | Vérifier les conditions d'usage de l'API camptocamp avant la cinquième activité |
| Ombres portées réelles | Calcul plus lourd que l'ombrage classique | Ombrage simple d'abord, ombre portée ensuite (lot 1.4) |

## Phase 0 : fondations

Prérequis à tout le reste : sans eux, chaque ajout alourdit et fragilise l'appli.

- [x] **0.1 Ménage.** Supprimer `public/pins/png/`, traduire les messages de statut qui ne changent de langue qu'à l'actualisation, mettre CLAUDE.md à jour. *Fini quand* la preview en anglais n'affiche plus de français.
- [x] **0.2 Découpage du bundle.** Mesure : sur 1,54 Mo, MapLibre pèse 1,1 Mo et le code de Montis 0,44 Mo. MapLibre est maintenant dans son propre fichier : il reste en cache d'un déploiement à l'autre, et chaque mise à jour ne recharge plus que le code de Montis (447 Ko, 148 Ko compressé).
- [x] **0.2 bis Activités chargées à la demande.** Activités, Météo et Analyse du vent (avec le Volume 3D) se chargent à leur première ouverture. Code au démarrage : 447 Ko → 229 Ko (148 → 75 Ko compressé). Le service worker précharge tous les morceaux : hors ligne, même une activité jamais ouverte s'ouvre.
- [x] **0.3 Tests automatiques.** Vitest, `npm test`, premiers tests sur `unites.js`, `vent-calcul.js`, `portee.js`, `parcours-analyse.js`. *Fini quand* `npm test` passe et que la commande figure dans CLAUDE.md.
- [x] **0.4 Captures automatiques.** Script Playwright qui ouvre l'appli au format téléphone (et ordinateur), parcourt les écrans clés et enregistre des captures, pour que Claude vérifie chaque lot visuellement avant de pousser. *Fini quand* une commande produit les captures d'un parcours type.
- [x] **0.5 Activités et pratiques.** Météo et Carte s'ouvrent par-dessus l'activité sans l'arrêter (sur téléphone, le panneau de l'activité se masque puis revient) ; Parapente devient Vol libre. Le choix de pratique commun à toutes les activités viendra avec la première nouvelle pratique (phase 3) : tant qu'une activité n'en a qu'une, il n'y a rien à choisir, donc rien à afficher.
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

## Phase 3 : nouvelles pratiques

Chaque lot ajoute des pratiques à une activité existante (voir « Structure de l'appli ») et réutilise les briques des phases 1 et 2. Une pratique par version mineure (1.1, 1.2…), dans l'ordre que choisit le propriétaire.

**Randonnée**
- [ ] **3.1 Trail.** Temps de passage cibles, ravitaillements et points d'eau, allure selon la pente.
- [ ] **3.2 Raquettes.** Pentes, bulletin d'avalanche et enneigement allumés par défaut, vitesse adaptée.

**Ski**
- [ ] **3.3 Ski de rando.** Pentes, orientation, bulletin d'avalanche et trace réunis ; itinéraires d'OSM (`piste:type=skitour`) ; routage de montée.
- [ ] **3.4 Hors-piste.** Pentes au-dessus et autour des domaines, orientation, avalanches ; mention de prudence renforcée.

**Vol libre** (l'actuel Parapente)
- [ ] **3.5 Thermiques et plafond.** Base des nuages, gradient, CAPE ; fiche de décollage avec feu vert, orange ou rouge.
- [ ] **3.6 Espaces aériens.** OpenAIP (clé via le relais 0.6), affichés aussi sur la portée de vol. Indispensable avant le paramoteur.
- [ ] **3.7 Deltaplane, paramoteur, speed riding.** Mêmes données que le parapente, réglages propres : finesse et vitesse pour le delta, espaces aériens et terrains plats pour le paramoteur, pentes et neige pour le speed riding.

**Transverse**
- [ ] **3.8 Nature et règles.** Un élément du menu Carte, pas une activité : réserves et parcs avec leurs règles (bivouac, chiens, drones), observations de faune et de flore ouvertes (GBIF).

**Plus tard : la cinquième activité**, pour l'escalade, la via ferrata, l'alpinisme et le canyon. Reportée après la 1.0, le temps de mûrir son périmètre (voir « Structure de l'appli »). Sources pressenties : camptocamp.org (CC BY-SA, conditions de l'API à vérifier) et OSM `sport=climbing`, `highway=via_ferrata`.

## Phase 4 : les effets « waouh »

- [ ] **4.1 Panorama des sommets.** Vue 3D orientée comme le téléphone (boussole), avec les sommets nommés ; recalage au doigt.
- [ ] **4.2 Où aller ce week-end ?** Suggestions selon l'activité, le niveau, la météo et la distance, à partir des données déjà présentes.
- [ ] **4.3 Check-list de matériel.** Générée selon la sortie : altitude, saison, durée, activité, météo.
- [ ] **4.4 Webcams.** Webcams proches d'un point (source à choisir ; clé via le relais si nécessaire).
- [ ] **4.5 Partage par lien.** Un lien ouvre la vue, un parcours ou un point, sans compte (tout dans l'URL).

## Structure de l'appli

Décidée le 2 novembre 2026. Elle évite que les nouvelles pratiques se chevauchent.

**Étage 1 : peu d'activités, des pratiques à l'intérieur.** Une seule activité active à la fois ; la pratique règle le routage, les vitesses, les couches allumées par défaut et les repères.

| Activité | Pratiques | État |
|---|---|---|
| Randonnée | Randonnée, Trail, Raquettes | Randonnée en place |
| Vélo | VTT, Gravel, Route | En place |
| Ski | Piste, Ski de rando, Hors-piste | Piste en place |
| Vol libre | Parapente, Deltaplane, Paramoteur, Speed riding | Parapente en place |
| *Cinquième activité* | *Escalade, via ferrata, alpinisme, canyon* | *Reportée après la 1.0* |

**Étage 2 : les briques communes, hors des activités.** Pentes, orientation et ombres dans Carte ; frise météo, isotherme et avalanches dans Météo. Une activité ou une pratique les **allume par défaut**, l'utilisateur peut toujours les allumer lui-même. Règle : chaque donnée a un seul module propriétaire, plusieurs activités l'affichent.

**Étage 3 : toujours disponible, quelle que soit l'activité.** Le point (appui long), la sortie GPS (bouton sur la carte, jamais coupée par un changement de panneau), le carnet, l'urgence.

**Changement de règle, effectif au lot 0.5 :** Météo et Carte s'ouvrent par-dessus l'activité **sans l'arrêter**. Seul le passage à une autre activité arrête la précédente.

### Pistes pour la cinquième activité

À trancher plus tard. Ce qui réunit ces pratiques, c'est le baudrier et la corde, et un terrain où la carte seule ne suffit pas.

| Proposition | Contenu | Pour | Contre |
|---|---|---|---|
| 🧗 **Vertical**, une seule activité | Escalade, via ferrata, alpinisme, canyon | Simple, cohérent avec « baudrier » | Large ; le canyon a des besoins très différents (eau, crues) |
| 🧗 **Rocher** et 🏔️ **Haute montagne** | Escalade et via ferrata ; alpinisme et cascade de glace | Chaque activité reste précise | Six activités ; frontière floue sur les courses mixtes |
| 🏔️ **Alpinisme** seul d'abord | Alpinisme, puis escalade et via ferrata comme pratiques | Démarre petit, le plus « montagnard » | Le grimpeur de falaise ne s'y reconnaît pas forcément |

Le canyon pourrait aussi rejoindre plus tard une activité « eaux vives » (canyon, kayak, rafting) : à voir selon la demande.

## Versions

| Version | Contenu |
|---|---|
| 1.0.0-alpha.1 | L'état de `main` au 2 novembre 2026, après la PR #1 (sans tag) |
| 1.0 alpha suivantes | Phase 0 |
| 1.0 beta | Phases 1 et 2 |
| 1.0 | Stable, testée sur le terrain |
| 1.1, 1.2… | Une nouvelle pratique ou un effet « waouh » par version |

## Décisions à prendre

| Décision | Quand | Proposition |
|---|---|---|
| Compte utilisateur ou appli 100 % locale | Avant la phase 2 | Rester local ; sauvegarde `.json` et partage par lien suffisent |
| Ordre des nouvelles pratiques | Avant la phase 3 | Ski de rando et thermiques d'abord : ils réutilisent le plus |
| Périmètre et nom de la cinquième activité | Après la 1.0 | Voir « Pistes pour la cinquième activité » |
| Texte de la mention de prudence | Lot 1.2 | Court, visible une fois, rappelé sur les couches de sécurité |

**Décidé :** structure en activités et pratiques (2 novembre 2026), Météo et Carte qui n'arrêtent plus l'activité (2 novembre 2026).
