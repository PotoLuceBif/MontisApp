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
| Pousse, donne le lien de preview Vercel, ouvre la PR vers `developpement` | Tranche les décisions marquées **À décider**, valide le design |
| Coche le lot ici et met à jour CLAUDE.md | Valide la preview (« fusionne ») ; demande les clés d'API quand un lot en a besoin |
| Fusionne la PR dans `developpement`, **seulement après la validation explicite du propriétaire** | Décide quand `developpement` part en production (`main`) |

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
9. Un panneau qui cache la carte se réduit d'une flèche vers le bas et se rouvre là où on l'avait laissé, pour voir la carte puis changer un réglage sans tout rouvrir (règle du propriétaire, 3 novembre 2026 ; voir CLAUDE.md).
10. Une couche qui reste affichée panneau fermé a sa pastille sur la carte : ce qui est affiché, ✕ pour l'éteindre, un appui pour la régler (règle du propriétaire, 3 novembre 2026).

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

- [x] **1.1 Soleil.** Utiliser `suncalc` : lever, coucher, heures dorées, position du soleil, durée du jour. Tests sur des valeurs connues. *Fait :* `soleil.js` (calcul, réutilisable par les lots 1.2 et 1.4) et une section Soleil dans Météo › Conditions locales, qui suit le lieu et le jour choisis et marche hors ligne. Ajouts : aube et crépuscule civils (utiles pour la frontale), course du soleil en petit graphique. Pas de repère du soleil sur la carte : il viendra avec l'ombre du relief (1.4).
- [x] **1.2 Fiche universelle du point.** Appui long n'importe où (clic droit sur ordinateur) : coordonnées, altitude, pente, orientation, soleil, météo résumée, refuge et point d'eau les plus proches. Branchée sur `peutOuvrirBalise` et `bloquerFiches`. *Fait :* `fiche-point.js`, chargé au premier appui long, dans le panneau de la fiche d'objet (une seule fiche à la fois). Pente et orientation par la méthode de Horn sur les tuiles de relief au zoom 13 (12 en repli, toujours présent dans les zones hors ligne), colorée selon les seuils du lot 1.3. Refuge le plus proche depuis `refuges.json` (hors ligne aussi), point d'eau par Overpass à 3 km, météo par Open-Meteo, soleil par `soleil.js`. Le clic qui suit l'appui long est absorbé ; `bloquerFiches` empêche l'ouverture. Pas besoin de `peutOuvrirBalise` : l'appui long ne passe pas par le clic, et un clic sur une balise ferme déjà la fiche. Calculs testés (`point-calcul.js`). Sur ordinateur, la fiche (point et objet) se place à gauche des boutons de la carte. Ajouts après les retours : pin de recherche sur le point, raccourci « Prévisions détaillées » vers Météo, isotherme 0 °C et UV, eau cherchée d'abord dans les tuiles du fond (Overpass échouait depuis le téléphone), refuge et eau à localiser puis « Y aller » (parcours depuis le point).
- [x] **1.3 Pentes et orientation.** Couches calculées depuis le relief (Terrain Tiles), à la manière de `maplibre-contour` : classes 30°, 35°, 40°, 45° et plus ; orientation en rose de couleurs. Légende claire, réglage d'opacité. Pentes aussi en pourcentage (45° = 100 %, `tan(angle) × 100`) : légende et fiche du point affichent les deux, « 35° · 70 % ». **Décidé (3 novembre 2026) :** les deux valeurs toujours, sans réglage ; les couches vont dans le panneau Relief. *Fait :* bloc « Pentes et orientation » dans Carte › Relief, en 2D et en 3D (couche drapée sur le relief) : Aucune / Pentes / Orientation, légende (degrés et pourcentages ; rose des huit secteurs), opacité, rappel de prudence. Calcul dans un travailleur (`pentes-travail.js`), par la méthode de Horn avec une bordure lue dans les tuiles voisines, donc sans raccord. Relief au zoom 13, celui des zones hors ligne, avec repli au zoom 12. La couche apparaît à partir du zoom 12 : plus loin, le relief lissé sous-estimerait les pentes. Après retour du propriétaire : les panneaux Carte et Météo se réduisent en barre (flèche vers le bas) ; chaque couche du menu Carte allumée (Pentes, Orientation, éléments de la carte) a sa pastille sur la carte, avec ✕ pour l'éteindre et un appui pour la régler ; Pentes et Orientation deviennent deux interrupteurs ; trop loin, la pastille propose « Rapprocher » et un encadré du panneau l'explique. Au zoom 12, chaque pixel garde la plus forte pente de ses cellules, pour ne jamais adoucir une pente raide. Orientation colorée seulement au-dessus de 5°. Hors ligne ou relief en échec : message dans le panneau. Calculs testés (`pente-calcul.js`).
- [x] **1.3 bis Pastilles Météo.** Même pastille que les couches de Carte pour le radar de pluie et l'analyse du vent, qui restent sur la carte panneau fermé (`couches-actives.js`). *Fait :* « Pluie 14h20 » (heure de l'image affichée) et « Vent 18h00 » (échéance, précédée du jour si ce n'est pas aujourd'hui), avec leur icône. « Radar indisponible » ou « Vent indisponible » quand le chargement échoue. La ✕ arrête le module comme sa ligne du menu (ou comme Vol libre, qui pilote le vent). Un appui sur la pastille du radar rouvre Météo sur le radar ; sur celle du vent, il ferme les panneaux Météo et Carte et agrandit le panneau du vent, que ces panneaux cachent sur téléphone. Pas de pastille avec MétéoSuisse (simple lien, rien sur la carte). Chaque module gère sa pastille, pour que le vent lancé par Vol libre ait aussi la sienne. Pas de pastille pour les conditions locales : leur pin dit déjà ce qu'il est.
- [x] **1.4 Ombre du relief.** Ombrage selon la position réelle du soleil à l'heure choisie (curseur), puis ombre portée par les montagnes voisines. *Fait :* bloc « Ombre du soleil » dans Carte › Relief, en 2D et en 3D : un interrupteur, le jour (‹ ›, ou un appui sur le jour pour le calendrier, l'année affichée si ce n'est pas la même), un curseur d'heure (pas de 5 min) avec la bande du jour, lever et coucher, « Maintenant » qui suit l'horloge, la position du soleil et un petit cadran qui tourne avec la carte. Ombrage MapLibre (`hillshade-method: basic`) éclairé depuis l'azimut et la hauteur du soleil au centre de la carte ; il remplace l'ombrage fixe de la 3D tant qu'il est allumé. Ombre portée calculée par lancer de rayons vers le soleil (`ombre-calcul.js`, testé), dans le travailleur des pentes (cache de relief commun) : relief au zoom de la tuile sur deux tuiles vers le soleil, puis quatre fois plus grossier jusqu'à 30 km. Visible à partir du zoom 10, case pour la couper. Intensité réglable, bâtiments 3D éclairés du même côté. Pastille « Soleil 9h00 » (« Nuit » soleil couché : rien n'est affiché, le panneau l'explique). Marche hors ligne dans les zones téléchargées. Heures de l'appareil, comme la section Soleil de Météo. Repère du soleil : le cadran du panneau et de la pastille, pas de dessin sur la carte. Le jour choisi n'est pas gardé après rafraîchissement (on revient à aujourd'hui) ; l'heure fixée, si.
- [x] **1.5 Frise météo commune.** Un seul composant heure par heure, réutilisé partout : vent, rafales, pluie, orage (CAPE), nuages bas, isotherme 0 °C, températures. Open-Meteo. **Décidé (6 novembre 2026) :** la frise s'ajoute au-dessus des cartes heure par heure, qui restent. *Fait :* `meteo-frise.js` dans Météo › Conditions locales (24 prochaines heures, ou le jour choisi) et dans la fiche du point (24 h, quatre lignes). Lignes sur un même axe : température (couleur froide sous 0 °C), précipitations en barres (pluie ou neige) avec la probabilité en pointillé, vent moyen et rafales aux couleurs des paliers des balises avec la direction, orage, nuages bas, isotherme 0 °C avec l'altitude du lieu (gel au lieu ombré). Un résumé par ligne (min et max, total, rafales max, pire niveau d'orage). Un appui ou un glissé lit une heure, directement sur la frise (valeur de chaque ligne à côté de son titre, heure en pastille sur l'axe ; plus de bloc dessous, retour du propriétaire du 7 novembre 2026), et souligne sa carte ; toucher une carte place la lecture. Bouton Lignes, choix gardé. Orage : CAPE ≥ 300 J/kg instabilité modérée, ≥ 1 000 forte, codes 95, 96, 99 « Orage prévu », avec légende et mention de prudence. Calculs testés (`frise-calcul.js`). Captures avec prévisions simulées (`scripts/meteo-simulee.mjs`). Reste à brancher ailleurs quand les lots le demanderont : fiche Ski, pack sortie (2.4), décollages (3.5).
- [x] **1.6 Ouverture sur sa position.** Au démarrage, l'appli s'ouvre centrée sur la position géolocalisée de l'utilisateur, comme le « retour à zéro » des Paramètres (`retourAZero` de `reglages.js`, qui le fait déjà mais à la demande). Refus ou échec de la géolocalisation : dernière vue gardée, puis position par défaut. Hors ligne : la géolocalisation marche sans réseau, le fond seulement dans les zones téléchargées. **À décider :** à chaque ouverture (la mémoire de la vue de `main.js` ne sert plus qu'en repli), ou seulement au premier lancement et après un long moment sans ouvrir l'appli, ou au choix dans les Paramètres. **Décidé (7 novembre 2026) :** au premier lancement et après une absence. *Fait :* `doitCentrerSurPosition` (`ouverture-calcul.js`, testé) : sans vue enregistrée, sans date de dernière visite, ou après 6 h sans utiliser l'appli (`derniere-visite`, notée en la quittant ou en la mettant en arrière-plan), la carte se centre sur la position GPS au zoom 12, sans haute précision ; une appli installée restée en mémoire et retrouvée après 6 h fait de même. Sinon, la dernière vue. Refus ou échec : rien ne change ; une carte déjà déplacée avant la réponse du GPS n'est pas reprise. Pas de point bleu de position (il reste au bouton de localisation).

## Phase 2 : la trace

Faire de Montis un outil de terrain, pas seulement de préparation.

- [x] **2.0 Balises et sites FFVL ouverts.** **Décidé (4 novembre 2026) :** premier lot de la phase 2. **Décidé (6 novembre 2026), après la comparaison :** les deux réseaux réunis, sans doublons ; terrains interdits et fermés montrés en rouge. *Vérifié :* fichiers ouverts sur data.gouv.fr (balises, relevés toutes les 5 minutes, terrains), Licence Ouverte 2.0, lisibles directement depuis le navigateur (CORS ouvert), sans relais. L'API `data.ffvl.fr` exige toujours une clé, et l'historique de 72 h n'est pas dans les fichiers ouverts : une balise FFVL n'a que son dernier relevé. La licence d'OpenWindMap admet les capteurs aux données ouvertes : c'est le cas. *Comparé :* sur 644 balises FFVL, 406 sont des Pioupiou d'OpenWindMap dont la FFVL ne publie pas les relevés ; la FFVL apporte 238 balises d'autres marques (193 avec relevé), 12 seulement à moins de 200 m d'une OpenWindMap, 96 à plus de 10 km de toute OpenWindMap (France : 629 OpenWindMap, 568 récentes ; 224 FFVL, 188 récentes). *Fait :* balises réunies (`balises-calcul.js`, testé), fiche d'une balise FFVL avec température et altitude, sans graphique (« pas d'évolution à montrer »), la balise voisine signalée ; terrains FFVL du vol libre sur la carte (`terrains-calcul.js`, testé) avec leur fiche (`terrain-fiche.js`) : statut, orientations en rose, vent de la balise la plus proche dans l'axe ou non, niveau, consignes et règles, raccourci Prévisions ; crédits FFVL et OpenWindMap. Plus de `VITE_FFVL`, de proxy `/ffvl` ni de choix de source. Ce qui a changé de plan : pas de graphique pour les balises FFVL (pas d'historique ouvert) ; terrains en ronds de couleur plutôt qu'en pins (2 400 points) ; coordonnées des responsables de balises jamais reprises.
  - **À faire pour clôturer le lot (retour du 6 novembre 2026), dès réception des pins du propriétaire :**
    1. Pins des terrains (dessinés par le propriétaire) : ronds, un par type, groupés et réduits en dézoomant comme les stations de ski et les bike parks (`zone-lieux.js`). Pin de groupe : celui fourni, sinon celui des stations.
    2. Contour du pin en huit secteurs : vert pour les orientations favorables, rouge pour celles à éviter, neutre si non renseigné. Sur les décollages **et** les atterrissages. L'anneau tourne avec la carte, le dessin du centre reste droit (deux couches). Dessiné à la volée par combinaison d'orientations.
    3. Terrains fermés ou interdits : croix grise, sans anneau.
    4. Manches à air des balises : nouveau dessin si le propriétaire en fournit un.
    5. Fiche du terrain : le cadre de la balise la plus proche devient un vrai lien (« Voir la balise › »), qui ouvre sa fiche (24 h pour OpenWindMap) ; la flèche retour de la fiche balise ramène au terrain.
    6. S'il n'y a pas de balise à moins de 100 m du terrain, en position et en altitude : lien « Analyser le vent ici » vers l'analyse du vent de Montis, centrée sur le terrain (vérifier comment `carte-vent.js` se place sur un point, par `montis:ouvrir-module`). À confirmer : la balise la plus proche (jusqu'à 15 km) reste-t-elle affichée à côté ?
    7. Captures des nouveaux écrans, puis fusion après validation.
  - **Reçu et décidé (7 novembre 2026) :** pins `terrain-decollage`, `terrain-atterrissage` et `terrain-pente-ecole` dans `public/pins/` (trois états chacun, 96×96, pointe à (48 ; 87,5), comme les autres pins ; consignes d'origine dans `Téléchargements/montis-pins-lot2/PROMPT-CLAUDE-CODE.md` du propriétaire). Pin de groupe : celui des randos et des stations. Manches à air des balises : on garde l'actuelle. Croix grise des terrains fermés : à dessiner par Claude. Treuil : pin à venir du propriétaire, en attendant celui du décollage.
  - *Fait (7 novembre 2026) :* pins des terrains dans le style de la carte (couches de symboles, `terrains-images.js`), regroupés jusqu'au zoom 10 sous l'hexagone des stations, avec un chiffre ; un appui sur un groupe s'en approche. Pente-école seule : son pin ; treuil : celui du décollage. Anneau de huit secteurs autour de la tête du pin (vert favorable, rouge à éviter, gris non renseigné), dessiné à la demande par combinaison, qui tourne avec la carte pendant que le pin reste droit. Fermés et interdits : pin gris à croix blanche (`terrain-ferme`), sans anneau, au-dessus des autres. Fiche du terrain : « Voir la balise › » ouvre la balise sur 24 h, sa flèche retour ramène au terrain (la carte y revient s'il est sorti de la vue). Sans balise à moins de 100 m en position et en altitude (`baliseSurPlace`, testé) : « Analyser le vent ici » centre la carte sur le terrain (au-dessus du panneau sur téléphone), ouvre l'onglet Vent avec le pin du terrain, et la flèche retour ramène à Sites et à la fiche ; la balise la plus proche (jusqu'à 15 km) reste affichée à côté. Terrains sur autorisation : pastille orange « ! » sur la tête du pin (choix du propriétaire du 7 novembre 2026, à la place du liseré orange des ronds). Pin du treuil : plus tard. Groupes gardés tels quels, et lot validé et fusionné le 7 novembre 2026.

- [ ] **2.1 Suivi en direct.** Position et cap sur la carte, distance et dénivelé restants sur le parcours affiché, alerte de sortie de trace, écran gardé allumé si demandé. Rando, vélo et toutes les activités à trace.
- [ ] **2.2 Enregistrement et carnet de sorties.** Enregistrer sa trace réelle, la ranger avec date, durée, dénivelé ; carnet consultable hors ligne, inclus dans la sauvegarde `.json`.
- [ ] **2.3 Revoir une sortie.** Statistiques, profil, replay animé en 3D ; import IGC pour le parapente.
- [ ] **2.4 Pack sortie hors ligne.** D'un geste depuis un parcours : carte et relief de la zone, frise météo du jour, bulletin d'avalanche, trace.
- [ ] **2.5 Sécurité.** Mode urgence (coordonnées en grand, altitude, 112 et secours en montagne par pays, sans réseau), heure de retour prévue, envoi de sa position par SMS ou partage du téléphone, sans serveur.

## Phase 3 : nouvelles pratiques

Chaque lot ajoute des pratiques à une activité existante (voir « Structure de l'appli ») et réutilise les briques des phases 1 et 2. Une pratique par version mineure (1.1, 1.2…), dans l'ordre que choisit le propriétaire.

**Randonnée**
- [ ] **3.0 Itinéraire de randonnée.** Le calcul de « Créer un parcours » privilégie les sentiers et les pistes plutôt que les routes. Même brique que le Vélo (`parcours-routage.js`), avec un autre profil : aujourd'hui BRouter `hiking-mountain`, puis Valhalla `pedestrian` en secours. Pistes : un profil BRouter personnalisé (pénalité forte sur les routes revêtues, bonus aux `path` et `track`, prise en compte de `sac_scale`), ou OpenRouteService `foot-hiking` (clé via le relais 0.6, à vérifier). Comparer les trois sur quelques parcours connus avant de choisir. Une pratique qui change de profil (trail, raquettes) en profite.
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
- [ ] **3.8 Nature et règles.** Un élément du menu Carte, pas une activité : réserves et parcs avec leurs règles (bivouac, chiens, drones), observations de faune et de flore ouvertes. Calque « Faune et flore » : observations GBIF, iNaturalist et INPN-OpenObs (licences de chaque jeu à vérifier, souvent CC BY ou CC BY-NC) ; dans la fiche du point au clic, « Espèces observées autour » (nombre, espèces les plus vues, photos quand la licence le permet, lien vers la source). Pas de localisation précise pour les espèces sensibles : suivre le floutage des sources. **Décidé (8 novembre 2026) :** reporté, à repenser avec le propriétaire avant de coder ; il ira dans la rubrique « Nature et sous-sol » du menu Carte créée par le lot 3.9. *Vérifié :* les tuiles de densité d'observations de GBIF (`api.gbif.org/v2/map/occurrence/density`, hexagones) répondent ; GBIF regroupe déjà iNaturalist et une partie des données françaises. Les règles des parcs (bivouac, chiens, drones) n'existent presque pas en données : à saisir à la main, au moins pour les parcs nationaux.
- [x] **3.9 Géologie.** Calque « Géologie » dans Carte : carte géologique BRGM au 1/50 000 (service WMS du BRGM, conditions et crédit à vérifier), avec opacité et légende ; dans la fiche du point, la formation géologique sous le doigt (requête `GetFeatureInfo`). France seulement : hors de France, le calque le dit. Non téléchargeable hors ligne, comme les autres fonds non Montis. **Décidé (8 novembre 2026) :** prochain lot. Nouvelle rubrique « Nature et sous-sol » dans le menu Carte, qui accueillera ensuite la faune et la flore (3.8) ; la géologie y est un calque superposé au fond, avec opacité, légende et pastille. *Vérifié :* la carte géologique au 1/50 000 est servie par la Géoplateforme de l'IGN, sans clé, comme le plan IGN (`data.geopf.fr/wmts`, couche `BRGM_SCAN_D_GEOL50` ; aussi `BRGM_SCAN_F_GEOL250` et `BRGM_SCAN_F_GEOL1M` pour les petites échelles) ; le service WMS du BRGM (`geoservices.brgm.fr/geologie`) répond, à vérifier pour `GetFeatureInfo` (formation sous le doigt). **Fait (8 novembre 2026), avec un changement de plan :** la carte au 1/50 000 n'est pas interrogeable (ni à l'IGN ni au BRGM), donc la fiche du point donne, sur décision du propriétaire, la roche dominante de la carte lithologique au 1/1 000 000 (`LITHO_1M_SIMPLIFIEE`), la feuille au 1/50 000 (`SCAN_F_GEOL50_CATALOG`) et le lien vers sa notice PDF (`ficheinfoterre.brgm.fr`, en http), qui contient la légende détaillée. Pas de légende commune publiée, et les couleurs du 1/50 000 changent d'une feuille à l'autre. Après deux essais (repères de couleurs, puis lettres de notation), le propriétaire a choisi deux vues : « Simple » par défaut, la carte lithologique du BRGM au 1/1 000 000 (WMS `LITHO_1M_SIMPLIFIEE`, onze familles aux couleurs fixes), avec pour chaque famille un résumé d'une ligne et, en dépliant, ce qu'elle change sur le terrain ; « Détaillée », le scan au 1/50 000, sans légende fixe mais avec « touche pour savoir » : un appui ouvre une bulle (couleur sous le doigt, famille du secteur, feuille et notice). Tuiles de la Géoplateforme (`PM_0_15`, JPEG) : le blanc devient transparent, ce qui sert aussi à dire « hors de France » sous le centre de la carte.
- [ ] **3.10 Fonds topo.** Nouveaux fonds dans `fond-de-carte.js` (une entrée dans `FONDS` chacun) : Top 25 / SCAN 25 de l'IGN (Géoplateforme, clé ou conditions d'accès à vérifier ; aujourd'hui seuls le plan IGN et l'orthophoto sont en place), carte des pentes de l'IGN (en calque, à comparer avec Pentes du lot 1.3), SwissTopo (carte nationale, Suisse). OpenTopoMap est déjà en place. Crédit de chaque fond dans la carte, zone de couverture dans le choix du fond. **Décidé (8 novembre 2026) :** après la géologie. *Vérifié :* le SCAN 25 n'est pas dans le service ouvert de la Géoplateforme (seuls `IGNF_CARTES_SCAN-REGIONAL`, `IGNF_CARTES_SCAN-1000` et `SCAN50.1950`) : il demande une clé, donc le relais 0.6, et reste pour plus tard. Ouverts et prêts : SwissTopo (`wmts.geo.admin.ch`, `ch.swisstopo.pixelkarte-farbe`), carte des pentes montagne de l'IGN (`GEOGRAPHICALGRIDSYSTEMS.SLOPES.MOUNTAIN`).


**Plus tard : la cinquième activité**, pour l'escalade, la via ferrata, l'alpinisme et le canyon. Reportée après la 1.0, le temps de mûrir son périmètre (voir « Structure de l'appli »). Sources pressenties : camptocamp.org (CC BY-SA, conditions de l'API à vérifier) et OSM `sport=climbing`, `highway=via_ferrata`. Topos spécialisés par l'API camptocamp.org : voies d'escalade, courses d'alpinisme et itinéraires de ski de rando (ces derniers utiles dès le lot 3.3), avec leur fiche (cotation, orientation, conditions récentes) et un lien vers la page d'origine.

## Phase 4 : les effets « waouh »

- [ ] **4.1 Panorama des sommets.** Vue 3D orientée comme le téléphone (boussole), avec les sommets nommés ; recalage au doigt.
- [ ] **4.2 Où aller ce week-end ?** Suggestions selon l'activité, le niveau, la météo et la distance, à partir des données déjà présentes.
- [ ] **4.3 Check-list de matériel.** Générée selon la sortie : altitude, saison, durée, activité, météo.
- [ ] **4.4 Webcams.** Calque « Webcams » dans Carte › Éléments de la carte : chaque webcam localisée sur la carte par un pin, avec sa dernière image en aperçu et sa fiche (image, heure de la prise de vue, lien vers la source). Source : API Windy Webcams (clé via le relais 0.6, attribution Windy obligatoire et visible). Webcams proches dans la fiche du point. Dans la fiche d'une station de ski, raccourci « Webcams » : celles de l'API, sinon un lien vers la page de la station chez Skaping, Roundshot ou Viewsurf, qui n'ont pas d'API ouverte. Une image trop ancienne est datée, jamais présentée comme actuelle.
- [ ] **4.5 Partage par lien.** Un lien ouvre la vue, un parcours ou un point, sans compte (tout dans l'URL).

## Plus tard

Fonctions qui attendent un prérequis hors de portée d'une appli web.

- [ ] **P.1 Enregistrer un trajet.** Bouton « Démarrer un trajet » commun à toutes les activités à trace (ski, vélo, vol libre, randonnée) : trace GPS, statistiques propres à l'activité (vitesse et dénivelé de descente pour le ski, vitesse moyenne pour le vélo, plafond et distance pour le vol libre…), enregistrement dans « Mes parcours », export GPX. **Prérequis :** passage en appli native (Capacitor par exemple), car une appli web perd le GPS écran verrouillé (voir « Ce qui est faisable »). En attendant, le lot 2.2 enregistre une trace écran allumé.

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

**Décidé :** structure en activités et pratiques (2 novembre 2026), Météo et Carte qui n'arrêtent plus l'activité (2 novembre 2026), texte de la mention de prudence (3 novembre 2026) : en entier une fois, « Montis aide à préparer, il ne décide pas à ta place. Pente, météo et distances sont des estimations : vérifie sur le terrain et auprès des sources officielles. », puis en rappel court sur les données de sécurité, « Estimations : à vérifier sur le terrain. ».
