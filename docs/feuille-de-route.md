# Feuille de route de Montis

Établie le 2 novembre 2026, remise à plat le 9 novembre 2026, avec le propriétaire. À tenir à jour : cocher un lot quand sa branche est fusionnée dans `developpement`, et noter ce qui a changé de plan. Le détail des lots terminés est dans `docs/historique.md` ; ici, une ligne par lot fait.

## Objectif

Une application qui aide **n'importe quel montagnard** : très diversifiée dans ce qu'elle propose, mais d'une qualité exceptionnelle sur chaque fonction.

Le principe : on ne multiplie pas les fonctions par activité. On construit **quelques briques communes excellentes** (le point, le terrain, le temps, la trace, le hors-ligne, la sécurité), et chaque activité les réutilise. La diversité vient des activités, la qualité vient des briques.

**Appli 100 % locale (décidé le 9 novembre 2026) :** pas de compte ni de serveur de données. Tout reste sur l'appareil ; on passe d'un appareil à l'autre par la sauvegarde `.json` (Paramètres › Sauvegarde), et on partage par lien (lot 4.5).

## Comment on travaille

**Un lot = une branche depuis `developpement` = une session.** Depuis le 7 novembre 2026, le travail se fait en local dans `C:\dev\Montis`, sans GitHub : pas de push ni de PR. Pour lancer un lot, écrire dans une nouvelle session :

> /lot 2.1

Après un test, `/retour` avec des captures d'écran.

| Claude | Le propriétaire |
|---|---|
| Lit le code, code, lance `npm test`, `npm run build` et `npm run captures` | Choisit le lot suivant (ou dit « lot suivant ») |
| Vérifie l'interface au format téléphone et envoie les captures | Teste sur son PC (serveur local), puis sur un vrai téléphone ce qu'un navigateur simulé ne montre pas : GPS, boussole, soleil, gants, terrain |
| Laisse le dossier sur la branche du lot, pour le test local | Tranche les décisions marquées **À décider**, valide le design |
| Envoie une preview sur `montis-alpha.vercel.app` **seulement sur demande** | Demande la preview quand il veut tester sur téléphone ; demande les clés d'API quand un lot en a besoin |
| Coche le lot ici, met à jour CLAUDE.md et `docs/historique.md`, puis **demande clairement la fusion** | Valide (« fusionne ») ; décide quand `developpement` part en production (`main`) |

## Barre qualité

Une fonction n'est terminée que si elle passe tous ces points :

1. Utilisable d'une main, avec des gants, en plein soleil : contraste suffisant, zones de toucher d'au moins 44 px.
2. Comportement hors ligne défini : soit elle marche, soit elle est grisée avec une explication.
3. Échec de la source affiché honnêtement, jamais d'écran vide ni de donnée périmée présentée comme fraîche.
4. Traduite en français (tutoiement) et en anglais, unités métriques et impériales respectées.
5. Pas de régression de poids : code chargé à la demande, rien de gros dans `public/`.
6. Vérifiée au format téléphone avant la fusion (captures), puis sur un vrai téléphone.
7. Calculs de sécurité (pentes, soleil, portée, unités, avalanches) couverts par des tests automatiques.
8. Données de sécurité accompagnées d'une mention de prudence : Montis aide à décider, il ne décide pas.
9. Un panneau qui cache la carte se réduit d'une flèche vers le bas et se rouvre là où on l'avait laissé (règle du propriétaire, 3 novembre 2026 ; voir CLAUDE.md).
10. Une couche qui reste affichée panneau fermé a sa pastille sur la carte : ce qui est affiché, ✕ pour l'éteindre, un appui pour la régler (règle du propriétaire, 3 novembre 2026).
11. Réseau lent : chaque requête a un délai maximal (`requete()` de `requete.js`) et l'échec se lit en clair (`messageErreur()`), jamais « Failed to fetch » ni une attente sans fin (9 novembre 2026).

## Ce qui est faisable, et ce qui ne l'est pas

La grande majorité du plan est faisable avec la stack actuelle et des sources gratuites. Quelques limites viennent de la plateforme, pas du code :

| Sujet | Réalité | Conséquence |
|---|---|---|
| GPS écran éteint | Une PWA perd la géolocalisation en arrière-plan, surtout sur iPhone | Suivi en direct écran allumé (Wake Lock), mode économie d'énergie ; pas d'enregistrement écran éteint fiable |
| Notifications hors de l'appli | Exigent un serveur d'envoi | Alertes seulement appli ouverte |
| Boussole (panorama) | Permission demandée sur iPhone, précision variable selon le téléphone | Recalage manuel prévu (faire glisser l'horizon) |
| Clés d'API (OpenAIP, Windy, SCAN 25) | Une clé `VITE_` est lisible par tous | Relais serveur en Vercel Functions (`api/`), monté par le premier lot qui en a besoin (voir 0.6) |
| Voies d'alpinisme et d'escalade | Pas d'annuaire ouvert parfait ; camptocamp.org (CC BY-SA) et OSM sont les meilleures sources | Vérifier les conditions d'usage de l'API camptocamp avant la cinquième activité |

## Fait

- **Phase 0, fondations :** 0.1 Ménage · 0.2 Découpage du bundle · 0.2 bis Activités chargées à la demande · 0.3 Tests automatiques · 0.4 Captures automatiques · 0.5 Activités et pratiques · 0.7 Robustesse.
- **Phase 1, le point et le terrain :** 1.1 Soleil · 1.2 Fiche universelle du point · 1.3 Pentes et orientation · 1.3 bis Pastilles Météo · 1.4 Ombre du relief · 1.4 bis Soleil en 3D et ombre dans les visites · 1.5 Frise météo commune · 1.6 Ouverture sur sa position.
- **Phase 2, revoir ses sorties :** 2.1 Import et Mes traces · 2.2 Vue d'une sortie · 2.3 Curseur et lecture · 2.4 Le contexte de la sortie.
- **Hors phase :** 2.0 Balises et terrains FFVL · 3.9 Géologie · 3.10 Fonds topo · 4.5 Partage par lien.

- [x] **0.7 Robustesse** (9 novembre 2026, demandée par le propriétaire). Relecture de toute l'appli et essais « réseau coupé » et « réseau qui traîne ». Interface posée dès que le style est prêt, plus après les premières tuiles (avant : plus d'une minute sans menu ni recherche sur un réseau lent). Délai maximal sur chaque requête de service (recherche, radar, itinéraire, balises, neige, avalanches, Waymarked Trails, portée, zones hors ligne), messages d'échec lisibles, zone hors ligne surtout vide comptée comme un échec, sauvegarde vérifiée étape par étape, textes au tutoiement, MapLibre 6.17. Détail dans `docs/historique.md`.

**Le relais serveur (ancien lot 0.6) n'est plus un lot à part :** dossier `api/` en Vercel Functions, avec cache et limites, monté par le premier lot qui demande une clé d'API (3.6 Espaces aériens, 4.4 Webcams ou le SCAN 25 de l'IGN).

## À faire, dans l'ordre

### Phase 1 : fin

- [x] **1.4 bis Soleil en 3D et ombre dans les visites** (9 novembre 2026). Soleil dessiné dans le ciel en 3D quand l'ombre du soleil est allumée, pâli derrière le relief ; hors du champ, petit soleil au bord de l'écran avec une flèche, dans sa direction sur le sol (comme le cadran), écarté des boutons et panneaux. Bouton « Ombre du soleil » dans les visites de stations et de bike parks, avec jour, curseur d'heure et position du soleil (fiche réduite : l'heure seule). Détail dans `docs/historique.md`.

### Phase 2 : revoir ses sorties (vers la 1.0 beta)

Revue avec le propriétaire le 9 novembre 2026. Les gens enregistrent leurs sorties avec leur montre ; Montis ne refait pas l'enregistrement, il en fait **la plus belle visualisation** : relief, 3D, curseur du temps, soleil et météo du jour. Les autres applis montrent une trace 2D, et font payer la 3D. Pas de suivi en direct ni d'alerte de sortie de trace : le propriétaire n'en veut pas.

**Mes traces** (nom choisi par le propriétaire) : une entrée du menu, accessible quelle que soit l'activité, avec deux onglets, **Sorties** (ce que tu as fait, importé de la montre) et **Parcours** (ce que tu prévois).

- [x] **2.1 Import et Mes traces** (9 novembre 2026). Lecture des fichiers GPX, FIT, TCX et IGC (testée), section Mes traces du menu avec ses lignes Sorties et Parcours, type de sortie deviné ou choisi, sorties dans IndexedDB et dans la sauvegarde `.json`, trace d'une sortie sur la carte avec ses premiers chiffres. Détail dans `docs/historique.md`.
- [x] **2.2 Vue d'une sortie** (9 novembre 2026). Trace colorée au choix (vitesse, altitude, pente, cardio, selon le fichier) avec sa légende, temps en mouvement et pauses, stats selon l'activité (rando, vélo, ski, vol), points marquants sur la carte et dans le panneau, en 2D et en 3D. Détail dans `docs/historique.md`.
- [x] **2.3 Curseur et lecture** (9 novembre 2026). Frise de la sortie (altitude, vitesse, cardio, vario pour un vol, puissance), lue au doigt ; point sur la carte, trace pas encore parcourue estompée ; lecture animée à trois vitesses, caméra qui suit. Détail dans `docs/historique.md`.
- [x] **2.4 Le contexte de la sortie** (9 novembre 2026). Bouton « Ombre du soleil » : ombrage et ombre portée pour le soleil de l'instant et du lieu du curseur, soleil dans le ciel en 3D, qui suivent la frise et la lecture. Option « Météo du jour » (archives d'Open-Meteo) : résumé dans le panneau et lignes température et vent dans la frise, gardée avec la sortie. Heures à l'heure du lieu. Détail dans `docs/historique.md`.

Pour plus tard : comparer une sortie au parcours prévu, exporter une vidéo du replay. **Sécurité** (mode urgence, 112, heure de retour), **pack sortie hors ligne** et **position et cap sur la carte** : à revoir avec le propriétaire, sans date.

Puis **4.5 Partage par lien** (voir phase 4), avancé ici : fait le 10 novembre 2026. La phase 2 et le partage complets, `developpement` est prêt pour la 1.0 beta, sur demande du propriétaire.

### Phase 3 : nouvelles pratiques

Chaque lot ajoute des pratiques à une activité existante (voir « Structure de l'appli ») et réutilise les briques des phases 1 et 2. Le choix de pratique apparaît avec la première pratique ajoutée à une activité. Ordre validé le 9 novembre 2026.

- [x] **3.0 Itinéraire de randonnée.** Fait le 10 novembre 2026 (préférences de routage, Rando et Vélo ; détail dans `docs/historique.md`). Le calcul de « Créer un parcours » privilégie les sentiers et les pistes plutôt que les routes. Même brique que le Vélo (`parcours-routage.js`), avec un autre profil : aujourd'hui BRouter `hiking-mountain`, puis Valhalla `pedestrian` en secours. Pistes : un profil BRouter personnalisé (pénalité forte sur les routes revêtues, bonus aux `path` et `track`, prise en compte de `sac_scale`), ou OpenRouteService `foot-hiking` (clé via le relais). Comparer sur quelques parcours connus avant de choisir. Prérequis du trail et des raquettes.
- [x] **3.3 Ski de rando** (10 novembre 2026). Choix Piste ou Ski de rando en tête du panneau Ski ; menu de la Randonnée (créer un parcours, rechercher ici, Mes parcours, GPX) ; itinéraires d'OSM (`piste:type=skitour`, Overpass) sur la carte, que le routage suit (Montis calcule lui-même sur leur réseau : BRouter ignore les traces sans chemin) ; bloc « Avalanches ici » pour le massif au centre de la carte (EAWS) ; pentes allumées avec la pratique ; bulletin détaillé (niveaux par altitude, problèmes, textes, neige récente) et pentes du bulletin sur la carte. Pas de routage qui évite les pentes à avalanche : à envisager. Détail dans `docs/historique.md`.
- [ ] **3.3 bis Avalanches observées.** Avalanches récentes sur la carte et dans « Avalanches ici ». Sources : data-avalanche.org (France, observations de la communauté et de l’ANENA, accès à demander par le propriétaire), LAWIS (Autriche, API ouverte), Camptocamp (incidents, relais à monter). **À décider :** demander l’accès à data-avalanche.org.
- [ ] **3.5 Thermiques et plafond.** Base des nuages, gradient, CAPE ; fiche de décollage avec feu vert, orange ou rouge.
- [ ] **3.11 Plus de balises de vent, et leur nouveau style** (ancien P.2). Montis n'affiche que des sources ouvertes (OpenWindMap, fichiers de la FFVL), surtout en France. SpotAir ne se réutilise pas (licence limitée à son propre affichage, vérifié le 8 novembre 2026). À vérifier une par une (licence, crédit, CORS ou relais) : MétéoSuisse (SwissMetNet) et Météo-France (stations d'observation, Licence Ouverte) d'abord, qui n'exigent l'accord de personne ; puis Holfuy (API sur demande), MADIS de la NOAA (États-Unis). Chaque réseau s'ajoute dans `BALISES` (`balises-sources.js`), sans doublon (`fusionnerReseaux`), OpenWindMap restant à part (sa licence interdit de mêler ses mesures à des capteurs non ouverts). Nouveau dessin des manches à air et des pastilles, sur un dessin du propriétaire, qui distingue le réseau de chaque balise.
- [ ] **3.6 Espaces aériens.** OpenAIP (clé via le relais, à monter dans ce lot), affichés aussi sur la portée de vol. Indispensable avant le paramoteur.
- [ ] **3.1 Trail.** Temps de passage cibles, ravitaillements et points d'eau, allure selon la pente.
- [ ] **3.2 Raquettes.** Pentes, bulletin d'avalanche et enneigement allumés par défaut, vitesse adaptée.
- [ ] **3.4 Hors-piste.** Pentes au-dessus et autour des domaines, orientation, avalanches ; mention de prudence renforcée.
- [ ] **3.7 Deltaplane, paramoteur, speed riding.** Mêmes données que le parapente, réglages propres : finesse et vitesse pour le delta, espaces aériens et terrains plats pour le paramoteur, pentes et neige pour le speed riding.

### Phase 4 : les effets « waouh »

- [ ] **4.1 Panorama des sommets.** Vue 3D orientée comme le téléphone (boussole), avec les sommets nommés ; recalage au doigt.
- [ ] **4.2 Où aller ce week-end ?** Suggestions selon l'activité, le niveau, la météo et la distance, à partir des données déjà présentes.
- [ ] **4.3 Check-list de matériel.** Générée selon la sortie : altitude, saison, durée, activité, météo.
- [ ] **4.4 Webcams.** Calque « Webcams » dans Carte › Éléments de la carte : pin, dernière image en aperçu, fiche (image, heure de la prise de vue, lien vers la source). Source : API Windy Webcams (clé via le relais, attribution Windy visible). Webcams proches dans la fiche du point ; dans la fiche d'une station, raccourci « Webcams », sinon lien vers Skaping, Roundshot ou Viewsurf. Une image trop ancienne est datée, jamais présentée comme actuelle.
- [x] **4.5 Partage par lien** (10 novembre 2026). « Partager cette vue » dans le menu, « Partager ce point » dans la fiche du point, partage d'un parcours dans l'éditeur ; tout dans l'adresse après « # », parcours compressé avec tout son tracé, ouvert sans recalcul ni enregistrement. Feuille de partage du téléphone, sinon lien copié. Détail dans `docs/historique.md`.

## En réflexion, sans date

- **3.8 Faune et flore, règles des parcs.** Reporté le 8 novembre 2026, à repenser avec le propriétaire avant de coder ; il ira dans Carte › Nature et sous-sol. *Vérifié :* tuiles de densité d'observations de GBIF (`api.gbif.org/v2/map/occurrence/density`), qui regroupe déjà iNaturalist et une partie des données françaises. Les règles des parcs (bivouac, chiens, drones) n'existent presque pas en données : à saisir à la main, au moins pour les parcs nationaux. Pas de localisation précise pour les espèces sensibles.
- **La cinquième activité** (escalade, via ferrata, alpinisme, canyon), après la 1.0. Voir « Pistes pour la cinquième activité ».
- **P.1 Enregistrer un trajet depuis Montis.** Écarté le 9 novembre 2026 : les montres le font mieux. Écran verrouillé, il exigerait une appli native (Capacitor par exemple), une appli web perdant le GPS.
- **Sécurité, pack sortie hors ligne, position et cap sur la carte** (anciens 2.5, 2.4 et une partie du 2.1) : sortis de la phase 2 le 9 novembre 2026, à revoir.

## Structure de l'appli

Décidée le 2 novembre 2026. Elle évite que les nouvelles pratiques se chevauchent.

**Étage 1 : peu d'activités, des pratiques à l'intérieur.** Une seule activité active à la fois ; la pratique règle le routage, les vitesses, les couches allumées par défaut et les repères.

| Activité | Pratiques | État |
|---|---|---|
| Randonnée | Randonnée, Trail, Raquettes | Randonnée en place |
| Vélo | VTT, Gravel, Route | En place |
| Ski | Piste, Ski de rando, Hors-piste | Piste et Ski de rando en place |
| Vol libre | Parapente, Deltaplane, Paramoteur, Speed riding | Parapente en place |
| *Cinquième activité* | *Escalade, via ferrata, alpinisme, canyon* | *Après la 1.0* |

**Étage 2 : les briques communes, hors des activités.** Pentes, orientation, ombres et géologie dans Carte ; frise météo, isotherme et avalanches dans Météo. Une activité ou une pratique les **allume par défaut**, l'utilisateur peut toujours les allumer lui-même. Règle : chaque donnée a un seul module propriétaire, plusieurs activités l'affichent.

**Étage 3 : toujours disponible, quelle que soit l'activité.** Le point (appui long), Mes traces (sorties et parcours), plus tard l'urgence.

Météo et Carte s'ouvrent par-dessus l'activité **sans l'arrêter**. Seul le passage à une autre activité arrête la précédente.

### Pistes pour la cinquième activité

À trancher après la 1.0. Ce qui réunit ces pratiques, c'est le baudrier et la corde, et un terrain où la carte seule ne suffit pas. Sources pressenties : camptocamp.org (CC BY-SA, conditions de l'API à vérifier) et OSM `sport=climbing`, `highway=via_ferrata`.

| Proposition | Contenu | Pour | Contre |
|---|---|---|---|
| 🧗 **Vertical**, une seule activité | Escalade, via ferrata, alpinisme, canyon | Simple, cohérent avec « baudrier » | Large ; le canyon a des besoins très différents (eau, crues) |
| 🧗 **Rocher** et 🏔️ **Haute montagne** | Escalade et via ferrata ; alpinisme et cascade de glace | Chaque activité reste précise | Six activités ; frontière floue sur les courses mixtes |
| 🏔️ **Alpinisme** seul d'abord | Alpinisme, puis escalade et via ferrata comme pratiques | Démarre petit, le plus « montagnard » | Le grimpeur de falaise ne s'y reconnaît pas forcément |

Le canyon pourrait aussi rejoindre plus tard une activité « eaux vives » (canyon, kayak, rafting).

## Versions

| Version | Contenu |
|---|---|
| 1.0.0-alpha.1 | L'état de `main` au 2 novembre 2026 (sans tag) |
| 1.0 alpha suivantes | Phases 0 et 1 |
| 1.0 beta | Phase 2 et le partage par lien |
| 1.0 | Stable, testée sur le terrain |
| 1.1, 1.2… | Une nouvelle pratique ou un effet « waouh » par version |

## Décisions

**Prises :** structure en activités et pratiques (2 novembre 2026) ; Météo et Carte qui n'arrêtent plus l'activité (2 novembre 2026) ; texte de la mention de prudence (3 novembre 2026), en entier une fois, « Montis aide à préparer, il ne décide pas à ta place. Pente, météo et distances sont des estimations : vérifie sur le terrain et auprès des sources officielles. », puis en rappel court, « Estimations : à vérifier sur le terrain. » ; appli 100 % locale, sans compte (9 novembre 2026) ; tutoiement dans toute l'interface (9 novembre 2026) ; ordre des phases 2 et 3 ci-dessus (9 novembre 2026) ; phase 2 recentrée sur la visualisation des sorties de la montre, section « Mes traces », formats GPX, FIT, IGC et TCX (9 novembre 2026).

**À prendre :** périmètre et nom de la cinquième activité (après la 1.0).
