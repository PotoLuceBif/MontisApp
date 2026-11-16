# Montis

Appli web de montagne : carte 2D/3D qui devient un globe au dézoom, quatre activités (Vol libre, Randonnée, Vélo, Ski) et des outils Météo et Carte. Installable (PWA) et utilisable hors ligne. Interface, code et commits sont en français.

Stack : Vite 8 et JavaScript vanilla (pas de framework, pas de TypeScript), MapLibre GL 6, `maplibre-contour` pour les courbes de niveau. Hébergée sur Vercel, déployée depuis GitHub (`PotoLuceBif/MontisApp`). Pas de `vercel.json` : Vercel détecte Vite et publie `dist/`, et chaque fichier de `api/` devient une fonction serveur (relais), servie aussi par `npm run dev` et `npm run preview` (`relais` de `vite.config.js`).

Le propriétaire du projet code surtout depuis son téléphone, en session cloud : pas d'accès à sa machine, et un seul moyen de voir le résultat, le déploiement. Le `README.md` décrit les fonctions côté utilisateur.

## Commandes

```bash
npm ci            # installer (Node 22.12 ou plus récent, exigé par Vite 8)
npm run dev       # développement
npm run build     # build de production dans dist/, avec /sw.js généré
npm run preview   # sert dist/ : seul moyen de tester le service worker et le hors-ligne
npm test          # tests automatiques (Vitest, dans tests/)
npm run captures  # captures téléphone et ordinateur dans captures/, avec rapport (voir ci-dessous)
```

`npm test` vérifie les calculs purs (ouverture sur sa position, géologie, unités, vent, portée de vol, analyse de parcours, GPX, soleil, pente et distances de la fiche du point, frise météo, soleil dans le ciel, couches de pente et d'orientation, ombre portée, couverture et découpage des fonds de carte, lecture d'une sauvegarde, délai des requêtes, lecture des fichiers de sortie GPX, FIT, TCX et IGC, profil vertical et thermiques, carte des plafonds, adresse de « S'y rendre », guidage), dans un navigateur simulé (jsdom). Un calcul ajouté ou modifié reçoit son test. Ni les tests ni `npm run build` ne détectent une erreur d'interface : une modification d'interface se vérifie avec `npm run captures` (Playwright et Chromium, préinstallés en session cloud). Le script lance son serveur, ouvre chaque écran (accueil, menu, Paramètres, chaque activité, chaque outil Météo et Carte) aux deux formats, et écrit `captures/rapport.txt` : erreurs JavaScript et textes restés en français après passage en anglais (un nom propre, comme celui d'une station, peut y figurer sans être une erreur). `npm run captures -- meteo` ne fait que les écrans dont le nom contient « meteo ». **Captures propres au lot** (décision du propriétaire du 10 novembre 2026) : pour un lot ou une correction, seulement les écrans de ce qui a changé, plus `accueil` et `menu` (par exemple `npm run captures -- accueil menu randonnee velo point partage parcours`) ; la série complète (environ 250 captures, plus d'une heure) seulement avant une version (PR vers `main`) ou après une refonte d'un fichier commun (`style.css`, `main.js`, `menu.js`) qui touche tous les écrans. Regarder les captures avant de pousser, et les envoyer au propriétaire quand l'interface change. Un nouvel écran s'ajoute dans `ECRANS`. Le réseau des sessions cloud bloque certains serveurs (OpenFreeMap, polices de la carte, Open-Meteo…) : le fond, les textes de la carte ou les prévisions peuvent manquer sur les captures, le rapport le signale. En développement, la carte est accessible par `window.map`.

Variables d'environnement : aucune n'est nécessaire (voir `.env.example`).

## Règles de conception

Ces règles sont celles du propriétaire. Les respecter sans qu'il ait à les redemander.

**Comportement**
- Activités exclusives : jamais deux activités actives en même temps (`exclusif: true` dans `menu.js`). Météo, Carte et Soleil et Lune s'ouvrent par-dessus l'activité sans l'arrêter ; sur téléphone, le panneau de l'activité est masqué le temps qu'un de leurs panneaux est ouvert, puis revient.
- La météo affichée (radar, analyse du vent, météo locale) reste sur la carte quand on ouvre le menu, le panneau Carte ou une activité. Elle ne se retire que quand un outil d'activité prend la carte : Créer un parcours, Rechercher ici, recherche de stations ou de bike parks (zone ou nom), Portée de vol. Ces outils appellent `annoncerOutilActivite()` (`outil-activite.js`) ; un nouvel outil de ce genre doit faire de même. Exception : le pin de la météo locale, sans pastille, se cache tant que le panneau Météo est fermé (réduit, il reste), et revient avec lui (demande du propriétaire du 13 novembre 2026, `majVisibilitePin` de `meteo.js`).
- Quatre activités, chacune avec ses pratiques : Randonnée (randonnée, puis trail, raquettes), Vélo (VTT, gravel, route), Ski (piste, puis ski de rando, hors-piste), Vol libre (parapente, puis deltaplane, paramoteur, speed riding). Une nouvelle pratique s'ajoute dans son activité, pas comme une nouvelle activité. Le choix de pratique n’apparaît qu’à partir de deux pratiques : en tête du panneau de l’activité, en boutons segmentés, comme Piste · Ski de rando (décision du propriétaire du 10 novembre 2026, `activite-ski.js`) ; Vélo garde le sien dans l’éditeur de parcours.
- Tous les réglages sont sauvegardés dans le localStorage et conservés après rafraîchissement. Passer par `lire` et `ecrire` de `reglages.js`.
- 2D : inclinaison bloquée, rotation et déplacement autorisés. 3D : inclinaison autorisée, sans angle imposé au passage en 3D (`appliquerMode` dans `main.js`).
- Les panneaux n'affichent que les options utiles au mode actuel : pas d'options grisées, on les masque (`data-seulement="2d"` ou `"3d"`, voir `relief.js`). Seule exception, déjà en place : hors ligne, les fonctions qui exigent Internet sont grisées.
- Randonnée et Vélo partagent la même structure de menus : créer un parcours, enregistrer, import GPX (`activite-parcours.js`). Une fonction ajoutée à l'une se pose la question de l'autre.

**Mobile**
- Sur téléphone, les outils sont de petits panneaux flottants réductibles, avec flèche retour (`panneau-carte.js`).
- **Tout panneau qui cache la carte se réduit** (flèche vers le bas), sur téléphone comme sur ordinateur, dès que c'est utile : réduit, il ne garde que sa barre de titre avec ce qui est ouvert dedans (« Carte · Relief »), en bas de l'écran sur téléphone ; un appui sur la barre le rouvre exactement où on l'avait laissé (sous-menu, réglages, défilement). Le but : voir l'effet d'un réglage sur la carte, puis en changer sans tout rouvrir. Un clic sur la carte ne ferme pas un panneau réduit. En place : panneaux Carte et Météo (`reduirePanneau` dans `menu.js`), panneaux posés sur la carte (`panneau-carte.js`). Un nouveau panneau se pose la question.
- **Une couche qui reste sur la carte panneau fermé a sa pastille** (`creerPastilleCouche` de `couches-actives.js`) : rangée en haut à gauche sur téléphone (elle défile), à gauche des boutons sur ordinateur. La pastille dit ce qui est affiché (avec une mini-légende si utile), sa ✕ l'éteint, un appui ouvre son réglage dans le panneau (même réduit). Fermer un panneau n'éteint jamais ses couches. En place : Pentes ou Orientation, Ombre du soleil, chaque élément de la carte, radar de pluie, analyse du vent. L'activité en cours a aussi la sienne, en tête de rangée (`suivreActivite` de `menu.js`, demande du propriétaire du 8 novembre 2026) : son nom et son icône, ✕ l'arrête comme sa ligne du menu, un appui rouvre le menu sur elle. En place aussi : la géologie et les calques officiels du fond de carte. **Regroupement par rubrique** (décision du propriétaire du 12 novembre 2026) : dès que deux couches d'une même rubrique de Carte sont allumées (Relief, Nature et sous-sol, Éléments de la carte, Fond de carte), une pastille « Éléments de la carte · 3 » les remplace ; un appui ouvre la rubrique, sa ✕ les éteint toutes ; seule, une couche garde sa pastille détaillée (option `rubrique` de `creerPastilleCouche`). Radar, vent, plafonds, pentes du bulletin et activité restent à part. Pas de pastille pour le fond ni pour les courbes (toujours là, ou allumées par défaut), ni pour le pin des conditions locales. Le radar et le vent créent leur pastille eux-mêmes ; leur ✕ appelle le `onFermer` reçu dans `activer`, pour que le menu (ou Vol libre) sache que le module s'arrête. La pastille du vent émet `montrerCarte()` (événement `montis:montrer-carte`, écouté par `menu.js`) pour fermer Météo et Carte, qui cachent son panneau sur téléphone.
- Tout doit fonctionner aussi bien sur téléphone que sur ordinateur : prévoir le tactile, l'appui long à la place du survol, et des zones de toucher suffisantes.

**Direction artistique**
- Sombre et pro, pas de blanc ou de bleu « enfantin ». L'interface reste propre, intuitive et professionnelle.
- L'interface **tutoie** (« Vérifie ta connexion », « Touche la carte ») : décision du propriétaire du 9 novembre 2026. Messages d'échec en minuscule après les deux-points quand ils complètent une phrase (« Radar indisponible : le service ne répond pas pour l'instant. »).
- Icônes d'activités : carrés arrondis avec dégradé et personnage blanc, dans le style du logo parapente (`public/icons/activites/`).
- Pins de carte en forme de goutte (`public/pins/`).

## Façon de travailler avec le propriétaire

Le propriétaire ne voit l'appli que sur la preview Vercel, depuis son téléphone. Claude, lui, ne voit ni le fond de carte, ni la météo, ni Vercel (réseau bloqué en session cloud). Le dialogue comble cet écart.

**Avant de coder**
- Proposer un plan court (une ligne par partie), puis enchaîner sauf si le propriétaire a demandé d'attendre.
- Une demande qui peut se comprendre de deux façons : poser la question plutôt que choisir. Une décision technique sans effet visible : la prendre et l'expliquer.

**Pendant**
- S'arrêter et demander pour tout ce qui change l'apparence, un comportement visible ou une règle de conception non couverte par ce fichier.
- En attendant une réponse, avancer sur ce qui n'en dépend pas.

**Notifications** (outil `PushNotification`, message court sur une ligne, sans markdown), seulement dans trois cas :
- bloqué par une décision du propriétaire : la question elle-même ;
- preview prête : ce qu'il faut regarder ;
- tâche longue terminée, avec le résultat (y compris un échec).
Jamais pour un simple avancement.

**Après**
- Envoyer les captures téléphone des écrans modifiés (`SendUserFile`).
- Donner le lien de preview et une liste « À tester sur ton téléphone » : ce que Claude n'a pas pu voir (fond de carte, données météo réelles, GPS, rendu sur l'appareil, gestes tactiles).
- Lister les questions en suspens et les décisions prises seul.
- Demander un retour, de préférence en captures d'écran.

**Lien de preview :** `https://montisapp-git-<branche, « / » remplacé par « - »>-luce-team.vercel.app` (équipe Vercel `luce-team`, projet `montisapp`). Version en cours, toujours à jour : `https://montisapp-git-developpement-luce-team.vercel.app`. Format déduit, pas encore confirmé par le propriétaire.

**Skills du dépôt** (`.claude/skills/`) : `/lot X` déroule un lot de la feuille de route de bout en bout ; `/retour` traite les remarques du propriétaire après un test de la preview.

## Workflow

- **Branches :** `main` est la production (adresse principale de l'appli, chez tous les utilisateurs) ; `developpement` reçoit le travail en cours. Chaque tâche a sa propre branche, créée depuis `developpement`, et sa PR vise `developpement`, jamais `main`. `main` ne change qu'à une version (1.0 beta, 1.0, 1.1…), par une PR de `developpement` vers `main`, et seulement sur demande du propriétaire.
- **Fusion :** c'est Claude qui fusionne la PR d'une tâche dans `developpement`, mais toujours après avoir demandé et obtenu la validation explicite du propriétaire (« fusionne », « c'est bon »). Sans réponse claire, ne pas fusionner. Jamais de fusion vers `main` sans demande expresse.
- Si la session impose une branche de travail, la repartir de `origin/developpement` avant de commencer (`git fetch origin developpement && git checkout -B <branche> origin/developpement`).
- `npm test` et `npm run build` doivent passer avant de pousser ; pour une modification d'interface, `npm run captures` aussi, limité aux écrans du lot (voir Commandes).
- Commits clairs en français, au présent, sans préfixe : « Ajoute les EuroVelo et la visite des bike parks ».
- Ne jamais commiter de secret. Toute variable `VITE_` finit lisible dans le JavaScript livré : une vraie clé d'API doit rester côté serveur, derrière un relais.
- Linux distingue les majuscules, contrairement à Windows : respecter la casse exacte dans les imports et les chemins d'assets.

## Conventions de code

- Modules ES, noms en français (`creerPanneauCarte`, `chargerPrevisions`). Fabriques en `creerX` ou `initX`, qui reçoivent `map` et renvoient leur interface.
- Un module de menu expose `{ id, label, icone, panneau, activer(), desactiver() }`, et `menu.js` l'orchestre. Pour ajouter une activité ou un outil, ajouter une entrée dans `categories`.
- Activités, Météo et Analyse du vent se chargent à leur première ouverture : `differer({ id, labelCle, icone }, () => import('./x.js').then(…))` (`module-differe.js`). Ne jamais les importer statiquement depuis un module du démarrage, sinon leur code revient dans le fichier principal. Un module qui en pilote un autre passe par `facade()` (Vol libre → vent). Les rubriques de Carte restent `immediat()` : elles rétablissent le fond et les éléments au démarrage.
- Texte d'interface : `poser(element, 'clé', variables)` plutôt que `textContent = t(…)`, pour qu'il suive un changement de langue (voir l'en-tête de `i18n.js`).
- Version : `version` de `package.json`, affichée en bas des Paramètres. Pas de tag git : le propriétaire n'en veut pas, ne pas le proposer.
- Commentaires courts, seulement pour expliquer un pourquoi. Le DOM se construit à la main (`createElement` ou `innerHTML`).
- Tout le CSS est dans `src/style.css`, avec les thèmes (`data-theme`) en variables. Thèmes : cyberpunk (par défaut), clair, sombre, auto.

## Pièges connus

- **Ombre du soleil :** tant qu'elle est allumée, `etat.ombresSoleil` masque l'ombrage fixe de la 3D (`appliquerMode` de `main.js`) ; la couche `ombre-soleil` partage sa source `ombrage`. L'adresse des tuiles d'ombre portée contient l'azimut et la hauteur arrondis (`montis-ombre://az/h/z/x/y`) : changer l'heure recalcule les tuiles, d'où l'attente de 350 ms pendant un glissement du curseur.
- **Couches de pente :** `pente-calcul.js` est chargé au démarrage : ne pas lui faire importer un module chargé à la demande (`point-calcul.js`, `vent-calcul.js`…), sinon celui-ci rejoint le code de démarrage. C'est `point-calcul.js` qui importe ses seuils.
- **Marqueurs MapLibre :** MapLibre place l'élément d'un `Marker` avec `transform` et `position: absolute`. Ne pas lui mettre de `transform` ni de `position: relative` : l'image va dans un parent (`creerPinSeul`, `.maplibregl-marker.rando-repere`).
- **Pins :** image 96×96, pointe à (48 ; 87,5), affichée en 48 px. Toujours `anchor: 'bottom'` et `offset: DECALAGE_PIN` (`pins.js`). Chaque pin a trois états : `<nom>.svg`, `-selected`, `-disabled`. Exception : les terrains FFVL (2 400) sont des images du style (`terrains-images.js`, `icon-offset` de 4,25 px), pas des marqueurs HTML.
- **Images à la demande :** `map.setMissingStyleImageResolver` n'accepte qu'un résolveur pour toute la carte, posé par `parapente.js` pour les images `terrain-*`. Un autre module qui en voudrait un doit passer par celui-ci. En MapLibre 6, `styleimagemissing` ne suffit plus.
- **Captures et attente :** `page.waitForFunction` de Playwright bloque le rendu de la carte ; attendre avec `attendreSur` de `scripts/captures.mjs`. Un module chargé à la demande n'a pas encore ses boutons juste après son ouverture : attendre son sélecteur avant de cliquer (`ongletSites`).
- **Service worker :** `src/sw-modele.js` n'est pas importé. `vite.config.js` y inscrit la version et la liste des fichiers, puis publie `/sw.js`. Il est inactif en développement. Tout `public/` est préchargé, sauf `/data/pistes/` et `/data/bike-parks/` : un nouveau gros fichier public alourdit le cache de chaque utilisateur.
- **Carte géologique :** les tuiles passent par `montis-geol://` (`geologie.js`) pour rendre le blanc transparent ; MapLibre charge ces tuiles raster un niveau plus haut que le zoom affiché, d'où la recherche de couverture sur tous les niveaux déjà reçus (`centreCouvert`). Une emprise de `GetFeatureInfo` trop petite sort de l'échelle des couches du BRGM et ne renvoie rien (`adresseInfoBrgm`, 0,02° de demi-côté).
- **Fonds nationaux et ordre des couches :** une carte nationale passe par `montis-fond://<id>/z/x/y` (`fonds-protocole.js`) : tuile hors du pays jamais demandée, tuile à cheval découpée au contour du pays. Elle se pose au-dessus de tout le fond Montis (`appliquerFond` y déplace routes et noms de Montis), qui complète au-delà. Pentes, ombres, géologie et calques officiels s'insèrent sous le repère `REPERE_CALQUES` (`style-montis.js`), jamais sous `montis-road-casing` : sinon une carte nationale les cache. swisstopo dessine ses tuiles 3857 avec des textes deux fois trop gros : ses sources sont déclarées en 128 px (`TUILE_SWISSTOPO`).
- **Clé de tuile :** `cleTuile()` existe dans `sw-modele.js` et dans `zones-hors-ligne.js`. Les deux doivent rester identiques.
- **Ordre au démarrage :** l'interface et les couches se posent à `style.load` (`main.js`), jamais à `load` : `load` attend les premières tuiles, et sur un réseau lent l'appli restait plus d'une minute sans menu ni recherche. Utiliser `quandPret(map, action)` pour agir sur le style (pas `isStyleLoaded()`, qui repasse à faux pendant le chargement des tuiles).
- **Source OpenFreeMap :** ne jamais la déclarer par `url` (TileJSON). Si le TileJSON échoue, MapLibre n'émet jamais `load` et rien de Montis n'apparaît. `definitionSourceVecteur()` donne des `tiles` directes ; `suivreDescriptionFond()` met à jour la version et affiche « Fond de carte indisponible » en cas d'échec.
- **Caméra MapLibre :** MapLibre 6 n'expose ni `getFreeCameraOptions` ni `map.transform`. La position de la caméra se calcule avec `positionCamera` (`soleil-ciel-calcul.js`) ; `getVerticalFieldOfView()` est en degrés.
- **Visite et panneaux :** pendant une visite (`visite-station.js`), sur téléphone, la caméra garde une marge basse égale à la hauteur du panneau posé sur la carte (analyse du vent…), pour laisser la station visible au-dessus. Un panneau météo porte la classe `bf-meteo` : la fiche d'un bike park ne se ferme pas pour lui (`velo-bike-parks.js`), la visite continue.
- **Clics sur la carte :** `peutOuvrirBalise` et `bloquerFiches` empêchent un clic d'ouvrir deux choses à la fois. Un outil qui capte les clics doit s'y brancher. `bloquerFiches(true)` coupe aussi l'appui long (fiche du point). Après un appui long, `fiche.js` absorbe le clic suivant en phase de capture sur le conteneur de la carte : MapLibre et les autres outils ne le voient pas.
- **Raccourcis entre modules :** un module chargé à la demande ne s'importe pas depuis un autre. On passe par des événements : `montis:ouvrir-module` (`{ categorie, module }`, écouté par `menu.js`) ouvre un panneau flottant sur un module ; `montis:meteo-ici` (`{ longitude, latitude }`, écouté par `meteo.js`) change le lieu des prévisions. L'émetteur écrit aussi `meteo-position` dans les réglages, pour le cas où Météo n'est pas encore chargée. Pour une activité, `montis:ouvrir-module` avec `categorie: 'activites'` l'active comme sa ligne du menu, et la demande passe par `deposer` / `reprendre` (`demandes.js`). `montis:ouvrir-point` (`{ lng, lat, cible }`, écouté par `fiche.js`) rouvre la fiche d'un point : c'est la flèche retour de l'éditeur ouvert par « Y aller ». `montis:ouvrir-module` accepte aussi `retour` : la croix du panneau flottant arrête alors le module et appelle `retour` (Météo ouverte depuis la fiche).
- **Eau de la fiche du point :** Overpass échoue souvent depuis un téléphone. L'eau se cherche d'abord dans les tuiles déjà chargées du fond Montis (`querySourceFeatures` sur `water`, `water_name`, `waterway`, `poi`), ce qui marche hors ligne ; Overpass n'ajoute que fontaines et sources. Ces tuiles ne couvrent que la vue affichée, et les petits cours d'eau n'apparaissent qu'en zoomant.
- **`window.map` en développement :** tant que `main.js` ne l'a pas posé, `window.map` désigne l'élément `#map` (accès par identifiant du navigateur). Attendre `window.map.on` dans un script de test.
- **Sorties et IndexedDB :** les sorties ne passent pas par `reglages.js` (localStorage, trop petit) mais par `sorties-stockage.js`. La sauvegarde est donc asynchrone (`creerSauvegarde`, `appliquerSauvegarde`) et importe ce module à la demande, pour qu'il ne rejoigne pas le code de démarrage. Les tests (jsdom) n'ont pas IndexedDB : seuls la lecture des fichiers et la vérification de la sauvegarde sont testées. Les vraies traces du propriétaire vont dans `exemples/`, ignoré par git et par Vercel (positions personnelles).
- **Ombrages fixes :** deux couches, jamais ensemble, réglées par `majOmbrage` (`options-carte.js`) : `montis-relief` (fond Montis, 2D et 3D, sous routes et noms) et `ombrage` (3D, autres fonds). Ombre du soleil et ombre d'une sortie les remplacent ; `etat.fond` (`montis`, `national`, `autre`) est posé par `appliquerFond`. Les motifs du fond (éboulis, rocher, zone humide) sont ajoutés par `ajouterMotifsMontis` au tout début de `style.load`.
- **Fond de jour et de nuit :** le jour est le style lui-même (`style-montis.js`) ; la nuit repeint les couches listées dans `NUIT` de `fond-palette.js` et garde leurs valeurs de jour pour revenir. Une couche ajoutée plus tard (élément de la carte, bâtiments 3D) appelle `peindreCoucheFond(map, id)` juste après son `addLayer`, sinon elle reste de jour la nuit. La nuit ne vaut que pour le fond Montis seul (`etat.fond === 'montis'`) ; `appliquerFond` appelle `etat.majPaletteFond` avant de repeindre les courbes. Mode Auto par défaut (`fond-montis-mode`) : nuit quand le soleil est couché au centre de la carte, vérifié au déplacement et chaque minute. Les captures figent le mode Jour (option `fond` d'un écran pour la nuit).
- **Ombre d'une sortie :** tant qu'elle est allumée, `etat.ombreSortie` fait passer en retrait l'ombre de Soleil et Lune (`ombres.js`) et l'ombrage fixe de la 3D (`main.js`) ; à l'extinction, `sortie-ombre.js` rappelle `etat.majOmbres`.
- **Heure d'une sortie :** jamais `heureCourte` ni `formatDate` seuls, qui donnent l'heure de l'appareil : passer par `heureSortie` et `dateSortie` (`traces-commun.js`), qui appliquent le fuseau du lieu (`decalage` de la sortie, lu dans le FIT, sinon celui de sa météo). Les instants restent en temps universel (soleil, météo).
- **Lien partagé :** `partage.js` lit l'adresse dès son import (avant `style.load`) : la vue d'un lien remplace la dernière vue et l'ouverture sur sa position (`vueDemandee` dans `main.js`), puis `ouvrirLienRecu` ouvre point ou parcours une fois menu et fiches posés, et efface l'adresse. Un parcours reçu passe par la demande `parcours-partage-<activité>`. Tout ce qui vient d'un lien est vérifié (`deplierParcours`) : une voie inconnue ferait échouer le dessin du tracé (`VOIES_CONNUES` doit suivre `VOIES` de `parcours-analyse.js`). En lecture, la ligne d'état de l'éditeur est masquée : les messages passent par la bulle `annoncer`.
- **Ski de rando :** c'est une pratique de l'activité `ski`, avec ses propres parcours (`activite: 'skirando'`, `montis.skirando-parcours`). `montis:ouvrir-module` traduit `module: 'skirando'` en `ski`, et `activite-ski.js` choisit la pratique quand une demande `…-skirando` attend (`enAttente` de `demandes.js`). Une pratique peut router elle-même un tronçon (`tronconLocal`, source `skitour`) avant BRouter. Les pentes se règlent par `etat.pentes` (`pentes-panneau.js`), sans import ; `skirando-pentes-auto` retient que c'est la pratique qui les a allumées.
- **Pentes du bulletin :** genre `exposees` du protocole `montis-pente://exposees/<zones>/z/x/y` (`zonesVersTexte` de `pente-calcul.js`), couche `pentes-exposees` posée par `afficherPentesExposees` (`pentes-couche.js`). Elles masquent les pentes de Carte › Relief (`etat.pentes`) et les rétablissent à l’extinction.
- **Poids des requêtes Open-Meteo :** au-delà de 10 variables, une requête compte pour plusieurs appels, et chaque point pour un appel (limite gratuite : 600 par minute, 5 000 par heure). Une carte qui couvre la vue point par point n'y tient pas : la carte des plafonds passe par le relais `api/plafonds.js` (GFS de la NOAA, une demande par heure).
- **Relais (`api/`) :** signature Node classique `(req, res)`, la même sur Vercel et dans `vite.config.js` ; `api/_lib/` n'est pas une route. La réponse doit dire `Cache-Control: s-maxage` pour que Vercel la garde : c'est ce qui limite les téléchargements chez la source à un par heure. Code commun avec l'appli : seulement des modules purs de `src/` (`plafonds-calcul.js`), sans DOM ni `i18n`.
- **Playwright n'est pas dans `package.json` :** un `npm install` ou `npm uninstall` d'un autre paquet le retire de `node_modules`. Le remettre avec `npm install --no-save playwright` (navigateurs déjà présents).
- **Pôles du globe :** les tuiles s'arrêtent à 85° de latitude ; au-delà, MapLibre comble le pôle en étirant la dernière rangée de pixels vers le centre. Une image détaillée y fait des rayons : `melangerTuile` (`globe-nuit-calcul.js`) fond le bord vers une couleur unie à partir de 80°. Toute nouvelle couche photo visible au dézoom doit faire de même. Une couche raster ne dessine rien au-delà de 85° : c'est la couche du dessous qui s'y voit. Le globe jour et nuit y pose deux calottes (`globe-calottes`, `couleurCalotte`), des bandes GeoJSON au bord du monde que MapLibre étire jusqu'au pôle. Le bord du globe à l'écran se calcule avec `limbeGlobe` (`globe-nuit-calcul.js`) : incliné, c'est une ellipse, pas un cercle ; sa taille plafonne la latitude à 85,05° comme MapLibre (`planetScaleAtLatitude`), sinon, face à un pôle, le halo se resserrait en anneau autour du pôle. Au zoom 0, une seule tuile touche les deux pôles : la couleur de fondu se choisit ligne par ligne (`melangerTuile`), sinon le pôle Sud se fondait dans le bleu de l'Arctique (anneau bleu autour de la glace). L'ombrage fixe de la 3D, lui, s'efface de 70° à 78° de latitude (`majOmbragePolaire` de `main.js`) : près des pôles, il faisait des traînées grises.
- **Galaxies du ciel :** une image posée par transformation (`poseGalaxie`) grandit sans limite quand sa direction approche l'angle droit de la visée : `ciel.js` ne la dessine pas si elle dépasse la taille de l'écran (sinon tout le ciel devenait beige, à certains angles près de l'équateur).
- **Profils BRouter :** sous Windows, les `.brf` sont extraits en CRLF : `profilMontis` découpe sur `\r?\n`, sinon les commentaires restent.
- **Parcours modifiés ailleurs :** un parcours renommé, supprimé ou enregistré émet `montis:parcours-modifies` ; les listes de Rando, Vélo et Mes traces › Parcours se redessinent. Un parcours touché dans Mes traces s'ouvre dans son activité par la demande `ouvrir-parcours-<activité>`.

## Arborescence

```
index.html              Point d'entrée, ne contient que #map
vite.config.js          Génération de /sw.js
.env.example            Variables possibles, sans valeur
api/                    Relais Vercel (fonctions serveur) ; _lib/ : leurs modules
scripts/                Extraction des données (voir Données locales) ; captures.mjs : captures d'écran
tests/                  Tests Vitest des calculs purs
.claude/skills/          Skills du dépôt : lot (réaliser un lot), retour (traiter un retour de test)
public/
  data/                 Données locales (voir Données locales)
  icons/                Icônes PWA ; activites/ : icônes des quatre activités
  logos/                Logo et logotype Montis
  pins/                 Pins SVG
  manifest.webmanifest  Manifeste PWA
src/                    Tout le code (détail ci-dessous)
```

**Socle**
| Fichier | Rôle |
|---|---|
| `main.js`, `ouverture-calcul.js` | Crée la carte, relief et courbes, globe, ciel, bascule 2D/3D, mémoire de la vue ; ouverture sur sa position après une absence (testé) |
| `ciel.js`, `ciel-calcul.js` | Ciel autour du globe : étoiles (catalogue `public/data/ciel/etoiles.json`) et Lune avec sa phase, sur une toile derrière la carte, seulement au dézoom ; calculs purs : temps sidéral, direction d'une étoile, projection, éclat, couleur, catalogue (testés). Base des constellations |
| `voie-lactee-calcul.js`, `voie-lactee-travail.js` | Voie lactée du ciel du globe : carte du ciel galactique générée (bande, bulbe, poussières, nébuleuses), semis de petites étoiles, passage écran ↔ galactique, dessin (testés) ; travailleur qui la génère (avec les images des galaxies) et la garde en WebP dans le cache `ciel` (hors préfixe `montis-`, que le service worker efface à chaque version) |
| `galaxies-calcul.js` | Galaxies voisines du ciel (`GALAXIES` : Andromède et M32, M110, Triangle, Nuages de Magellan) : image générée (spirale, elliptique, irrégulière), pose à l'écran à leur place et dans leur angle (testé) ; dessinées par `ciel.js` |
| `globe-nuit.js`, `globe-nuit-calcul.js` | Globe jour et nuit au dézoom (images de la NASA mélangées selon le soleil, `montis-globe://<instant>/z/x/y`) ; calculs purs : point subsolaire, hauteur du soleil, crépuscule, mélange d'une tuile (testés) |
| `globe-atmosphere.js` | Atmosphère du globe au dézoom : halo dans l'espace (toile derrière la carte) et liseré sur le bord (toile par-dessus), éclairés du côté du soleil, bord assombri côté nuit ; même fondu que le ciel |
| `menu.js`, `module-differe.js` | Bouton logo, tiroir, panneaux flottants, activation exclusive des modules ; chargement à la première ouverture |
| `reglages.js` | `lire`, `ecrire`, `quandPret`, `retourAZero` (localStorage `montis.reglages`) |
| `options-carte.js` | État partagé entre le bouton 3D et le menu (`etat`), courbes |
| `style.css` | Tous les styles et les thèmes |
| `apparence.js` | Thème et couleur d'accent |
| `parametres.js` | Page Paramètres |
| `barre-haut.js`, `bascule-mode.js` | Barre du haut, sélecteur 2D/3D |
| `bandeau-menu.js` | Illustration en tête du menu |
| `panneau-carte.js` | Panneau posé sur la carte, réductible sur téléphone |
| `echelle-carte.js` | Échelle de la carte, qui évite les panneaux |
| `pins.js` | Images de pins, décalage de la pointe, pin seul à états |
| `recherche.js` | Barre de recherche générale et son repère |
| `fiche.js` | Fiche d'un objet de la carte touché (via Overpass) ; appui long et clic droit pour la fiche du point |
| `fiche-point.js`, `point-calcul.js` | Fiche d'un point quelconque (chargée au premier appui long) ; ses calculs purs : pente, orientation, distances, plus proche (testés) |
| `relief-donnees.js`, `overpass.js` | Altitude, pente et orientation lues dans les tuiles de relief ; requêtes Overpass avec serveurs de repli et délai par serveur |
| `dialogue.js` | `demanderChoix()` : petite fenêtre de question (titre, texte, champ facultatif, boutons), par-dessus tout |
| `requete.js` | `requete()` : fetch avec délai maximal (15 s par défaut, erreur `TimeoutError`) ; `messageErreur()` : message lisible d'un échec (hors réseau, trop long, trop de demandes, service en panne) |
| `demandes.js` | Demandes déposées pour un module chargé à la demande, reprises à son ouverture (« Y aller » vers Randonnée ou Vélo) |
| `partage.js`, `partage-calcul.js` | Partage par lien : feuille de partage ou lien copié, bulle d'annonce, ouverture d'un lien reçu ; calculs purs : adresses de vue, de point et de parcours, polyligne, simplification, compression (testés) |

**Carte (menu Carte et fond)**
| Fichier | Rôle |
|---|---|
| `style-montis.js`, `source-vecteur.js` | Style du fond Montis ; source OpenFreeMap déclarée par adresses de tuiles, TileJSON suivi à côté |
| `fond-de-carte.js` | Panneau Fond de carte (onglets Ici, Monde, Pays, Anciennes), fond affiché et ordre des couches |
| `fonds-catalogue.js` | Fonds et calques officiels, par pays ; en ajouter un = une entrée dans `FONDS` ou `CALQUES` |
| `fonds-protocole.js`, `fonds-calcul.js` | Tuiles d'une carte nationale découpées à la frontière (`montis-fond://`) ; calculs purs : couverture d'un point, tuile dedans, dehors ou au bord (testés) |
| `fonds-zones.js`, `fonds-emprises.js` | Contours simplifiés des pays (chargés à la demande) et leurs rectangles, générés par `scripts/extraire-zones-fonds.mjs` |
| `calques-officiels.js` | Calques officiels à superposer (pentes IGN, itinéraires swisstopo…) : couches, opacité, pastilles |
| `relief.js` | Options de relief selon le mode |
| `pentes-panneau.js`, `pentes-couche.js` | Bloc Pentes et orientation du panneau Relief ; couches et protocole `montis-pente://` |
| `pentes-travail.js`, `pentes-tuile.js`, `pente-calcul.js` | Travailleur qui calcule une tuile (pente, orientation ou ombre) ; lecture du relief et repli ; calculs purs, couleurs, pourcentage (testés) |
| `soleil-lune.js` | Rubrique Soleil et Lune (bouton sous Météo et Carte) : jour et heure communs en tête (réglage chargé à la première ouverture ou si l'ombre est allumée), abonnements du soleil et de la Lune |
| `ombres-panneau.js`, `ombres.js` | Ligne Ombre du soleil de Soleil et Lune ; couches d'ombrage et d'ombre portée, soleil et Lune dans le ciel en 3D, pastille (chargé à la première activation) |
| `lune.js`, `lune-calcul.js` | Ligne Lune de Soleil et Lune : phase, éclairement, position, lever et coucher, prochaines phases (chargée à la première ouverture) ; calculs purs, dessin de la phase (testés) |
| `exposition.js` | Raccourci « Évaluer l'exposition » des fiches et de l'éditeur : cadre la carte, allume l'ombre, ouvre Soleil et Lune, retour |
| `soleil-reglage.js`, `ombre-couches.js` | Réglage du jour et de l'heure avec la position du soleil ; tuiles d'ombre portée et peinture de l'ombrage : communs à Carte › Relief et aux visites |
| `soleil-ciel.js`, `soleil-ciel-calcul.js` | Soleil dans le ciel en 3D, ou au bord de l'écran ; calculs purs : position à l'écran, bord, position de la caméra (testés) |
| `ombre-tuile.js`, `ombre-calcul.js` | Relief lu vers le soleil pour une tuile ; calcul pur de l'ombre portée (testé) |
| `nature-sous-sol.js`, `geologie-familles.js` | Rubrique Nature et sous-sol : bloc Géologie (interrupteur, vues Simple et Détaillée, opacité, familles de roches dépliables) ; les onze familles du BRGM, leur code et leur couleur (testé) ; accueillera la faune et la flore (lot 3.8) |
| `geologie-bulle.js` | Bulle « Sous ton doigt » de la vue détaillée |
| `geologie.js`, `geologie-calcul.js` | Carte géologique du BRGM, vues simple et détaillée (protocole `montis-geol://<vue>/z/x/y`, blanc du 1/50 000 rendu transparent, hors de France, pastille ; chargée à la première activation) ; calculs purs : transparence, couverture d'un point, lecture du `GetFeatureInfo` du BRGM, feuille et notice (testés) |
| `points-utiles.js` | Parkings, abris et points d'eau d'Éléments de la carte (couche `poi` du fond) : couches, pictos dans la DA (`dessinerPicto`, aussi en tête de la fiche d'un parking) |
| `transports.js` | Voies ferrées (couches `montis-rail` du style, montrées ou cachées sur tous les fonds) et gares (couche `poi`, classe `railway`) d'Éléments de la carte › Construit |
| `elements-carte.js` | Éléments à afficher ; en ajouter un = une ligne (et son nom court `elements.court-<clé>` pour sa pastille) |
| `couches-actives.js` | Pastilles des couches allumées depuis Carte ou Météo : nom, mini-légende, ✕, ouverture du réglage |
| `nature.js`, `lieux.js`, `sommets.js`, `batiments.js` | Forêts, eaux, glaciers, parcs ; villes, refuges, frontières ; sommets ; bâtiments |
| `zones-hors-ligne.js` | Cartes hors ligne : cadrage, estimation, téléchargement |
| `hors-ligne.js`, `sw-modele.js` | État du réseau et indicateur ; service worker |

**Météo**
| Fichier | Rôle |
|---|---|
| `meteo.js`, `meteo-icone.js` | Conditions locales et prévisions, radar de pluie ; pictogramme et description d'un code météo |
| `meteo-frise.js`, `frise-calcul.js` | Frise heure par heure (Météo et fiche du point) ; ses calculs : orage, échelles, heures |
| `soleil.js`, `meteo-soleil.js` | Calcul du soleil (`suncalc`) : lever, coucher, heures dorées, position ; section Soleil des conditions locales |
| `carte-vent.js` | Analyse du vent sur la carte (panneau, grille, niveaux, échéances) |
| `vent-calcul.js`, `vent-cadran.js` | Calcul du vent ; échelle de couleurs et cadran communs |
| `vent-couche-carte.js`, `vent-volume-3d.js` | Flèches et traînées sur la carte ; bloc 3D du vent |
| `vent-profil.js`, `profil-calcul.js` | Onglet Profil de l'analyse du vent (heures × altitudes au repère) ; calculs purs : colonne d'air, vent par altitude, thermiques par la particule, base des cumulus, nuages (testés) |

**Vol libre** (fichiers nommés `parapente`, identifiant de module `parapente`)
| Fichier | Rôle |
|---|---|
| `activite-parapente.js`, `parapente.js` | Menu de l'activité ; balises et sites |
| `balises-sources.js`, `balises-couche.js` | Réseaux OpenWindMap et FFVL, chargés ensemble (`BALISES`) ; pastilles et manches à air sur la carte |
| `balises-calcul.js` | Lecture des fichiers FFVL, réunion des deux réseaux sans doublons (testé) |
| `terrain-fiche.js`, `terrains-calcul.js` | Fiche d'un terrain FFVL ; lecture des terrains, statut, orientations, vent dans l'axe, pin et anneau, balise sur place (testé) |
| `terrains-images.js` | Images des terrains dans le style de la carte : pins, groupe, pastille « ! », anneaux d'orientation dessinés à la demande |
| `balise-fiche.js`, `balise-graphique.js` | Fiche d'une balise ; graphique de son évolution |
| `portee.js`, `portee-calcul.js` | Portée de vol depuis un point ; calcul pur du chemin le plus court (testé) |
| `plafonds.js`, `plafonds-calcul.js` | Carte des plafonds (bouton Plafonds) : épaisseur de la couche par heure, servie par le relais, tuiles `montis-plafond://` (épaisseur lissée + relief fin, tranches de 500 m), curseur des heures, pastille ; calculs purs communs au relais : codage, épaisseur en un point, pixels d'une tuile (testés) |
| `api/plafonds.js`, `api/_lib/grib2.js` | Relais Vercel : épaisseur de la couche limite de GFS chez la NOAA, une maille par octet, gardée une heure ; lecture GRIB2, gabarits 5.0 et 5.3 (testé) |

**Mes traces**
| Fichier | Rôle |
|---|---|
| `mes-traces.js` | Section Mes traces du menu : lignes Sorties (import, liste, vue d'une sortie sur la carte) et Parcours (Mes parcours de Rando et Vélo réunis) |
| `sortie-lecture.js`, `sortie-fit.js` | Lecture des fichiers GPX, FIT, TCX et IGC en sortie à colonnes (`points.t`, `lng`, `lat`, `alt`, `fc`…), type deviné, résumé (testé) ; décodeur FIT sans dépendance |
| `sortie-vue.js`, `sortie-analyse.js` | Vue d'une sortie : trace colorée, légende, stats selon l'activité, points marquants ; ses calculs : vitesse, pente, pauses, ski, vol, couleurs (testés) |
| `sortie-frise.js` | Frise d'une sortie : lignes empilées sur l'axe du temps, lue au doigt |
| `sortie-ombre.js`, `sortie-meteo-calcul.js` | Ombre du soleil à l'heure de la sortie ; météo de ce jour-là (archives d'Open-Meteo) : adresse, interpolation, résumé (testés) |
| `traces-commun.js` | Types de sortie, icônes, noms et durées communs à la liste et à la vue |
| `sorties-stockage.js` | Sorties dans IndexedDB (base `montis` : fiches et points à part), doublons, lecture et restauration pour la sauvegarde |

**Randonnée et Vélo**
| Fichier | Rôle |
|---|---|
| `activite-parcours.js` | Menu commun : mêmes actions, filtres et liste |
| `activite-randonnee.js`, `activite-velo.js` | Configuration de chaque activité |
| `parcours-editeur.js`, `trajet-calcul.js` | Tracé sur la carte : points déplaçables, routage, annuler et rétablir, aide des boutons (« ? » et appui long), question « Enregistrer ce tracé ? » en quittant, « S'y rendre » ; adresse du trajet vers le départ selon le téléphone (testé) |
| `parcours-guidage.js`, `guidage-calcul.js` | Mode guidage (« Démarrer la sortie », lot 3.14) : position suivie, reste, deux temps, prochains repères, chemin pour rejoindre la trace au retour sur l'appli, écran allumé (Wake Lock) ; calculs purs : position sur la trace, restant, repères, temps (testés). Écrans `guidage*` (option `position` d'un écran : GPS simulé) |
| `parcours-routage.js` | BRouter, puis Valhalla en secours |
| `parcours-preferences.js`, `profils-brouter/` | Préférences de routage (« Privilégier », bouton filtre de l'éditeur) : profils BRouter standard complétés de variables `montis_*`, envoyés une fois par session (`/brouter/profile`) puis réglés par l'adresse ; options Valhalla équivalentes (testé). Profils copiés de brouter.de (`profiles2/`), à recopier si BRouter les fait évoluer |
| `parcours-analyse.js`, `parcours-profil.js` | Pentes, durée, surfaces, difficulté ; profil coloré |
| `parcours-decouverte.js` | Repères après « Rechercher ici » (Rando, Vélo ; ski de rando par `poser`, avec ses tracés déjà connus) |
| `parcours-itineraires.js` | Grands itinéraires en tronçons (EuroVelo, GR) |
| `parcours-gpx.js`, `parcours-stockage.js` | Lecture GPX ; « Mes parcours » |
| `rando-api.js`, `rando-profil.js` | API Waymarked Trails ; altitudes, dénivelé, export GPX |
| `velo-bike-parks.js` | Bike parks |

**Ski et lieux**
| Fichier | Rôle |
|---|---|
| `activite-ski.js`, `ski-conditions.js` | Stations ; enneigement et risque d'avalanche |
| `zone-lieux.js`, `fiche-lieu.js` | Recherche par nom ou zone et repères groupés ; fiche commune aux stations et bike parks |
| `visite-station.js` | Visite 3D d'une station ou d'un bike park |
| `activite-skirando.js` | Pratique Ski de rando : configuration du menu commun (`activite-parcours.js`), pratique de routage, bloc Avalanches ici |
| `skirando-itineraires.js`, `skirando-avalanches.js` | « Rechercher ici » : itinéraires `piste:type=skitour` des carrés de la vue (`/data/skitour`) sur la carte et en liste, réseau donné au routage ; niveau d'avalanche du massif au centre de la carte |
| `bulletin-detaille.js`, `bulletin-calcul.js` | Bulletin d'avalanche détaillé (CAAML de l'EAWS : niveaux par altitude, rose, problèmes, textes du service) et neige récente (Open-Meteo) ; calculs purs : fichier d'un massif, lecture du bulletin, cumuls de neige, zones des pentes concernées (testés) |
| `skirando-calcul.js` | Calculs purs : massif d'un point, niveaux du jour, carrés de la vue et lecture des itinéraires, plus court chemin sur leur réseau, durée (testés) |

## Données locales

Fichiers générés par `scripts/`, à relancer seulement pour rafraîchir les données (réseau requis, longue durée). Licence ODbL, à créditer.

| Données | Taille | Script |
|---|---|---|
| `public/data/stations-ski.json`, `pistes/` (355 fichiers) | 2,3 Mo et 18 Mo | `node scripts/extraire-stations-ski.mjs` (OpenSkiData) |
| `public/data/bike-parks.json`, `bike-parks/` (38 fichiers) | 2,7 Mo | `node scripts/extraire-bike-parks.mjs` (OSM via Overpass) |
| `public/data/refuges.json` | 1,9 Mo | `MONTIS_CONTACT_EMAIL=... node scripts/extraire-refuges.mjs` (Overpass) |
| `public/data/ciel/etoiles.json` (5 044 étoiles jusqu'à la magnitude 6) | 93 Ko | `node scripts/extraire-etoiles.mjs` (d3-celestial, BSD-3, Hipparcos ; à créditer) |
| `src/fonds-zones.js`, `src/fonds-emprises.js` | 50 Ko | `node scripts/extraire-zones-fonds.mjs` (Natural Earth, domaine public) |
| `public/data/skitour/` (6 446 itinéraires, 294 carrés de 1° et `index.json`) | 3,4 Mo | `node scripts/extraire-skitour.mjs` (OpenSkiData) ; hors du préchargement |
| `public/data/avalanches/massifs.json` (627 massifs simplifiés) | 488 Ko | `node scripts/extraire-massifs-avalanche.mjs` (EAWS, CC BY 4.0) ; hors du préchargement, comme `pistes/` |

Les caches `scripts/cache-*.json` sont ignorés par git : un clone neuf repart de zéro.

Les bike parks sont des secteurs de pistes de descente d'OSM rattachés à la station voisine, pas un annuaire officiel : ni ouverture ni horaires.

## Sources de données et limites

Aucune de ces sources n'a de clé d'API ni de garantie de service : toujours prévoir l'échec et l'afficher honnêtement. Une requête vers un service passe par `requete()` (`requete.js`) : en montagne la liaison traîne plus souvent qu'elle ne coupe, et sans délai l'attente ne finit jamais. L'utilisateur lit `messageErreur()`, jamais le message technique (« Failed to fetch »). Seules exceptions : les tuiles (MapLibre les annule lui-même) et le travailleur des pentes, qui n'a pas accès au DOM.

| Usage | Source | Limites connues |
|---|---|---|
| Fond Montis | OpenFreeMap | Hors ligne : 3 000 tuiles ou 50 Mo par téléchargement, 4 requêtes en parallèle |
| Polices de la carte | Noto Sans d'OpenFreeMap (`tiles.openfreemap.org/fonts`, `polices.js`) : normal, gras, italique | Une police par pile : les piles combinées (« A,B ») ne sont pas servies |
| Relief, courbes, altitudes | Terrain Tiles (AWS) | Zoom 15 au plus |
| Autres fonds | Monde : OSM, OpenTopoMap, TopPlusOpen (BKG), Esri, CyclOSM. Pays : IGN (`data.geopf.fr`), swisstopo (`wmts.geo.admin.ch`), basemap.at, IGN Espagne, ICGC, Kartverket, NGI, USGS, Toporama (WMS de RNCan), GSI | Tous sans clé, vérifiés le 8 novembre 2026 (CORS compris). Non téléchargeables : sans réseau, retour au fond Montis. Écartés : Top 25 IGN, Ordnance Survey, Lantmäteriet, MML, LINZ, Thunderforest, Mapy.cz (clé) ; IGM italien (http seulement) |
| Globe jour et nuit | NASA GIBS (`gibs.earthdata.nasa.gov/wmts`, `BlueMarble_ShadedRelief_Bathymetry` et `VIIRS_Black_Marble`) | Domaine public, sans clé, CORS ouvert. Zoom 8 au plus ; lumières de 2016 |
| Recherche | Photon (Komoot) | Service public |
| Fiches d'objets | Overpass (3 serveurs en repli) | Lent ou saturé par moments |
| Carte des plafonds | GFS de la NOAA (`nomads.ncep.noaa.gov`, `filter_gfs_0p25.pl`), par le relais `api/plafonds.js` | Domaine public. Mailles de 25 km : vallées et sommets isolés lissés. Calculs publiés environ 4 h après 00, 06, 12 et 18 h UTC ; pas de CORS, d'où le relais. ICON-EU (DWD) écarté : son « sommet de la convection sèche » sous-estime les plafonds, et sa compression CCSDS n'a pas de décodeur JavaScript |
| Prévisions, vent, neige, météo du jour d'une sortie | Open-Meteo (archives : `archive-api.open-meteo.com`) | Peut répondre 429 (limite de requêtes) ; un message est prévu |
| Radar de pluie | RainViewer ; lien vers MétéoSuisse | Zoom 7 au plus |
| Balises de vent | OpenWindMap (`api.pioupiou.fr`) | Créditer avec lien visible ; interdit de mêler ses mesures à des capteurs non ouverts sans licence étendue |
| Balises et terrains FFVL | Fichiers de data.gouv.fr (`www.data.gouv.fr/api/1/datasets/r/<ressource>`, redirigés vers `static.data.gouv.fr`) | Licence Ouverte 2.0, citer la FFVL. Dernier relevé seulement, pas d'historique. Relevés toutes les 5 min, balises et terrains une fois par jour (terrains : 3,6 Mo, 750 Ko compressé). L'API `data.ffvl.fr` exige toujours une clé : ne pas l'utiliser. La liste des balises contient les coordonnées des responsables : ne jamais les afficher |
| Itinéraires balisés, EuroVelo | Waymarked Trails | Écritures exactes (« GR5 » et « GR 5 » diffèrent) ; un itinéraire entier peut peser environ 10 Mo |
| Routage | BRouter, puis Valhalla | BRouter abandonne au-delà de 3 s de calcul ; un tronçon non calculé apparaît en tireté |
| Carte géologique | Vue détaillée : BRGM via la Géoplateforme (`data.geopf.fr/wmts`, `BRGM_SCAN_D_GEOL50`). Vue simple, roche et feuille au point : WMS du BRGM (`geoservices.brgm.fr/geologie`, `LITHO_1M_SIMPLIFIEE`, `SCAN_F_GEOL50_CATALOG`) | France seulement. WMS du BRGM lent (environ 1 s par tuile de 512 px), vide hors des échelles 1/25 000 à 1/10 000 000. Tuiles JPEG blanches hors couverture. La carte 1/50 000 n'est pas interrogeable : la fiche donne la roche dominante au 1/1 000 000 et la feuille. Notices en http seulement (`ficheinfoterre.brgm.fr`). Non téléchargeable (tuiles vues récemment gardées par le service worker) |
| Avalanches | Bulletins EAWS (`static.avalanche.report` : niveaux `<date>.ratings.json`, bulletins CAAML `<date>-<service>[.<langue>].json`, liste du jour par la page du dossier) ; contours des massifs : `regions.avalanches.org` (générés en local) | Selon la couverture et la saison (presque vides en novembre). Textes dans la langue du service (Météo-France en français, Tyrol et Italie traduits). Avalanches observées : pas encore (data-avalanche.org sans accès public, LAWIS ouvert pour l’Autriche, Camptocamp derrière un relais) |
| Itinéraires de ski de rando | OpenSkiData (usage `skitour`), rangés par carré de 1° dans `public/data/skitour/` | Pas Overpass (saturé, aucun résultat chez le propriétaire le 10 novembre 2026), ni Waymarked Trails (ne les a pas), ni les tuiles d'OpenSkiMap (réservées à leur site). BRouter ignore ceux sans `highway` (la plupart) : Montis route lui-même sur leur réseau |

## État actuel et prochaines étapes

Établi d'après le code et l'historique git au 3 novembre 2026.

**En place**
- Carte 2D/3D et globe, fonds multiples, thèmes, PWA et mode hors ligne.
- Vol libre (ex-Parapente) : balises OpenWindMap et FFVL réunies et leur fiche, terrains FFVL (décollages, atterrissages, interdits) et leur fiche, analyse du vent et volume 3D, portée de vol.
- Randonnée et Vélo : menu commun, création de parcours, Mes parcours, import GPX, profil, itinéraires balisés.
- Vélo : calque vélo, alertes de passages raides, EuroVelo, bike parks.
- Ski : stations, pistes, enneigement, avalanches, visite 3D (aussi pour les bike parks).
- Pins en goutte : station, bike park, rando, route, mes parcours, départ, recherche, météo, parapente.
- Paramètres en sections : Thème, Unités (métrique ou impérial, unité du vent à part), Langue (FR/EN, `src/i18n/`, `t('clé')`), Données hors ligne (espace par type, zones, vider le cache, Wi-Fi uniquement sur Chrome Android), Sauvegarde (export et import `.json` des réglages, de Mes parcours et des sorties de Mes traces).
- Portée de vol par chemin le plus court (Dijkstra), qui contourne le relief.
- La manche à air de la carte suit le curseur du graphique d'une balise.
- Fiche du point (lot 1.2) : appui long ou clic droit n'importe où, marqué par le pin de recherche ; coordonnées, altitude, pente et orientation, soleil, météo résumée avec isotherme 0 °C et UV, raccourci « Prévisions sur 5 jours » vers Météo › Conditions locales (sa croix ramène à la fiche), refuge et point d'eau les plus proches (lacs et cours d'eau des tuiles du fond, fontaines et sources d'OSM), à toucher pour les localiser puis « Y aller » (parcours Randonnée, ou Vélo si c'est l'activité en cours), rappel de prudence. Écran `point` dans les captures.
- Pentes et orientation (lot 1.3) dans Carte › Relief, en 2D et en 3D : classes 30°, 35°, 40°, 45°, rose des orientations, opacité. Pentes toujours en degrés et en pourcentage (« 35° · 70 % », `formatPente` de `unites.js`), aussi dans la fiche du point. Calculées dans un travailleur depuis le relief au zoom 13 (zones hors ligne comprises), visibles à partir du zoom 12 ; plus loin, leur pastille passe à « Trop loin · Rapprocher » et un encadré du panneau l'explique. Pentes et Orientation sont deux interrupteurs exclusifs (plus de bouton Aucune). Écrans `carte-pentes`, `carte-orientation`, `carte-pentes-3d`, `carte-pentes-loin`, `carte-pentes-loin-ferme`, `carte-pentes-rapprocher`, `carte-pastilles`, `carte-pastille-ouvre`, `carte-reduit`, `carte-rouvert` et `meteo-reduit` dans les captures.
- Soleil (lot 1.1) dans Météo › Conditions locales : lever, coucher, durée du jour, midi solaire, heures dorées, aube et crépuscule, position actuelle et course du jour. Calculé sur l'appareil, donc hors ligne aussi. Heures au fuseau du lieu (`utc_offset_seconds` d'Open-Meteo), sinon à celui de l'appareil, indiqué. Horizon supposé dégagé, le relief n'est pas pris en compte (lot 1.4).
- Ombre du soleil (lot 1.4) dans Carte › Relief, passée dans Soleil et Lune au lot 4.7, en 2D et en 3D : jour (flèches ou calendrier), curseur d'heure, « Maintenant », position du soleil et cadran ; ombrage éclairé par le soleil réel et ombre portée par les montagnes (à partir du zoom 10, jusqu'à 30 km), intensité, pastille « Soleil 9h00 » ou « Nuit ». Calculée sur l'appareil, hors ligne dans les zones téléchargées. Écrans `ciel-ombres`, `ciel-ombres-3d`, `ciel-ombres-ferme`, `ciel-ombres-jour`, `ciel-ombres-nuit` dans les captures.
- Soleil en 3D et ombre dans les visites (lot 1.4 bis) : en 3D, ombre du soleil allumée, le soleil est dessiné dans le ciel (pâli derrière le relief) ; hors du champ, un petit soleil fléché au bord de l'écran donne sa direction sur le sol, écarté des boutons et panneaux (`soleil-ciel.js`). Visites de stations et de bike parks : bouton « Ombre du soleil » (ombrage et ombre portée, jour, heure ; fiche réduite : l'heure seule). Écrans `ciel-ombres-3d-soleil` et `visite-ombres` dans les captures.
- Frise météo (lot 1.5) : `meteo-frise.js`, commune à Météo › Conditions locales (au-dessus des cartes horaires, qui restent) et à la fiche du point (24 h : température, précipitations, vent, orage). Lignes empilées sur un même axe du temps : température (froide sous 0 °C), précipitations (pluie ou neige) et leur probabilité, vent moyen et rafales aux couleurs des paliers avec la direction, orage, nuages bas, isotherme 0 °C avec l'altitude du lieu. Un appui ou un glissé lit une heure et souligne sa carte, et toucher une carte place la lecture. Choix des lignes gardé (`meteo-frise-lignes`). Orage : CAPE ≥ 300 J/kg « Instabilité modérée », ≥ 1 000 « Instabilité forte », codes 95, 96, 99 « Orage prévu » (`frise-calcul.js`, testé). Les captures `meteo`, `meteo-frise*`, `point` et `point-frise` utilisent des prévisions simulées (`scripts/meteo-simulee.mjs`, option `simuler` d'un écran), Open-Meteo étant bloqué en session cloud.
- Balises et terrains FFVL (lot 2.0), décision du propriétaire du 6 novembre 2026 : les deux réseaux réunis. Les balises FFVL de type OpenWindMap sont écartées (la FFVL n'en publie pas les relevés) ; à moins de 200 m, la balise qui mesure la plus récente reste et sa fiche signale l'autre (`fusionnerReseaux`). Identifiants FFVL préfixés `ffvl-` (ceux d'OpenWindMap restent nus, l'archive les utilise) ; `reseauDe(station)` donne le réseau d'une station (historique, lien, crédit). Si un réseau ne répond pas, l'autre s'affiche et le panneau le dit. Fiche FFVL : température, altitude, maintenance, « pas d'évolution » à la place du graphique. Terrains : pins décollage, atterrissage et pente-école (treuil : celui du décollage), pin gris à croix pour un terrain fermé ou interdit (au-dessus des autres), pastille orange « ! » sur le pin d'un terrain sur autorisation ; regroupés jusqu'au zoom 10 ; anneau de huit secteurs autour de la tête (vert favorable, rouge à éviter), qui tourne avec la carte ; sous les balises. Fiche du terrain : statut, alerte FFVL, rose des orientations avec le vent de la balise la plus proche à moins de 15 km (« Dans l'axe » ou non, décollages seulement ; « Voir la balise › » ouvre sa fiche sur 24 h, dont la flèche retour ramène au terrain), « Analyser le vent ici » sans balise à moins de 100 m (onglet Vent centré sur le terrain, retour à sa fiche), niveau IPPI, marche, consignes, restrictions, règles de vol, conditions idéales, description et accès repliés, raccourci Prévisions (sa croix ramène à la fiche), mention de prudence. Les textes de la FFVL restent en français. Hors ligne : relevés et terrains enregistrés par le service worker (`www.data.gouv.fr/api/1/datasets/r/` dans `DONNEES`). Écrans `parapente-sites`, `parapente-sites-carte`, `parapente-terrains-pins`, `parapente-terrain`, `parapente-terrain-balise`, `parapente-terrain-retour`, `parapente-terrain-vent`, `parapente-terrain-vent-retour`, `parapente-terrain-autorisation`, `parapente-terrain-interdit`, `parapente-balise-ffvl` (réseau requis : `api.pioupiou.fr`, `www.data.gouv.fr`, `static.data.gouv.fr`, ouverts dans l'environnement cloud « MontisApp » ; le script réessaie data.gouv.fr, que le proxy coupe souvent).
- Ouverture sur sa position (lot 1.6) : au premier lancement et après 6 h sans utiliser l'appli (`derniere-visite` des réglages, aussi au retour d'une appli restée en mémoire), la carte se centre sur la position GPS au zoom 12 ; sinon la dernière vue (`main.js`, `ouverture-calcul.js`, testé). Refus ou échec : rien ne change.
- Géologie (lot 3.9) dans Carte › Nature et sous-sol, nouvelle rubrique : géologie superposée au fond (sous ombres, pentes, routes et courbes), en 2D et en 3D, en deux vues (décision du propriétaire) : « Simple » par défaut, carte des roches du BRGM au 1/1 000 000 (zoom 5 à 13, agrandie au-delà ; plus loin, « trop loin »), légende des onze familles avec résumé et « sur le terrain » dépliable ; « Détaillée », scan au 1/50 000, dont les couleurs changent d'une feuille à l'autre : un appui sur la carte ouvre la bulle « Sous ton doigt » (`geologie-bulle.js` : couleur lue dans la tuile, famille du secteur avec résumé et « Sur le terrain », feuille et notice), sauf sur un élément qui a sa fiche ou quand un outil a pris les clics (`fichesBloquees` de `fiche.js`). Opacité commune, pastille « Géologie » ou « Géologie · hors de France » (centre de la carte hors couverture, d'après le blanc des tuiles), « indisponible » (aucune tuile reçue ; quelques échecs seulement : note « incomplète » dans le panneau), « hors ligne ». Interrupteur grisé hors ligne (mais toujours éteignable). Fiche du point : famille de roche (couleur, nom, résumé, « Sur le terrain » dépliable), feuille au 1/50 000 et lien vers sa notice PDF. Frontières des pays dans Éléments de la carte › Lieux (trait clair en tirets avec halo, fond vectoriel, sous les noms), demandées pendant ce lot. Écrans `carte-geologie`, `carte-geologie-legende`, `carte-geologie-detaillee`, `carte-geologie-bulle`, `carte-frontieres`, `carte-geologie-ferme`, `carte-geologie-3d`, `carte-geologie-suisse`, `point-geologie` dans les captures.
- Fonds topo (lot 3.10) dans Carte › Fond de carte : 22 fonds et 6 calques sans clé, en quatre onglets : Ici (ce qui couvre la vue), Monde, Pays (dépliés par région, badges « ici » et « en cours »), Anciennes (Cassini, état-major, IGN 1950, Dufour, Siegfried). Une carte nationale s'arrête à sa frontière, le fond Montis complète ; l'encadré du panneau le dit, ou « Rapproche-toi » sous le zoom minimal. Calques officiels sous « À superposer » avec opacité et pastille (« · hors zone » hors de leur pays). Écrans `carte-fond*` dans les captures.
- Soleil et Lune (lot 4.7, 16 novembre 2026) : rubrique à part, troisième bouton sous Météo et Carte (décision du propriétaire). Jour et heure en tête, communs au soleil et à la Lune, avec la position du soleil ; Ombre du soleil (venue de Carte › Relief) ; Lune : phase, pourcentage éclairé, position, lever, passage au plus haut, coucher, prochaines pleine et nouvelle lune. En 3D, ombre allumée, la Lune est dans le ciel avec sa phase (au bord de l'écran hors du champ). Phase de la Lune aussi dans Météo › Conditions locales. « Évaluer l'exposition » dans l'éditeur de parcours (lecture), la fiche d'une station (hors visite), d'un terrain et d'une balise : Soleil et Lune ouvert, ombre allumée, carte cadrée ; la croix ramène d'où l'on vient et éteint l'ombre si le raccourci l'a allumée (événement `montis:allumer-ombres`). Constellations écartées du lot. Écrans `ciel`, `ciel-lune`, `ciel-lune-3d`, `meteo-lune`, `parapente-terrain-exposition`, `parcours-lecture-exposition`, `parcours-exposition`.
- Pastilles Météo (lot 1.3 bis) : radar de pluie (« Pluie 14h20 ») et analyse du vent (« Vent 18h00 »), ou « indisponible » en cas d'échec. Écrans `meteo-radar-pastille`, `meteo-vent-pastille`, `meteo-vent-pastille-ouvre` dans les captures.

- Mes traces (lot 2.1), section du menu sous Activités, toujours disponible : **Sorties**, import de fichiers GPX, FIT, TCX et IGC (un ou plusieurs, `.gz` compris) de la montre, du compteur ou du vario, liste (icône de l'activité, date, distance, durée, D+), renommer, supprimer, type deviné ou choisi ; un appui montre la trace sur la carte et ses premiers chiffres (distance, durée, dénivelés, altitudes, données du fichier), par-dessus l'activité. **Parcours** : Mes parcours de Rando et Vélo réunis, ouverts dans leur activité. Sorties dans IndexedDB et dans la sauvegarde `.json` (version 2). Écrans `traces-*` dans les captures (fichiers fabriqués par `scripts/sorties-demo.mjs`). Vue d'une sortie (lot 2.2) : trace colorée au choix (vitesse, altitude, pente, cardio) avec légende, distance et temps en mouvement, stats selon l'activité (rando : vitesse moyenne, vitesse de montée, pauses ; vélo : vitesses, puissance, cadence ; ski : descentes, dénivelé descendu ; vol : durée, gain, vario), cardio, points marquants sur la carte (point haut, vitesse max, pauses, décollage). Curseur et lecture (lot 2.3) : frise de la sortie (altitude, vitesse, cardio, vario pour un vol) lue au doigt, point sur la carte, trace pas encore parcourue estompée, lecture animée à trois vitesses avec caméra qui suit. Contexte (lot 2.4) : deux options côte à côte, « Ombre du soleil » qui suit le curseur et la lecture (ombrage, ombre portée, soleil dans le ciel en 3D) et « Météo du jour » (archives d'Open-Meteo : résumé et lignes température et vent dans la frise, gardée avec la sortie). Heures à l'heure du lieu (fuseau de la montre, sinon de la météo).

- Préférences de routage (lot 3.0) : bouton filtre de l'éditeur de parcours, bloc « Privilégier » à choix multiples (Rando : sentiers, chemins blancs, itinéraires balisés, petites routes ; Vélo : pistes cyclables et véloroutes, petites routes, chemins blancs, single tracks), rien de coché par défaut. Préférence, jamais interdiction : profil BRouter Montis (`parcours-preferences.js`). Écrans `parcours-preferences-*` dans les captures.

- Partage par lien (lot 4.5) : « Partager cette vue » en bas du menu, « Partager ce point » dans la fiche du point, icône de partage à côté de GPX dans l'éditeur de parcours. Tout dans l'adresse après « # » (`#vue=zoom/lat/lng/cap/inclinaison&3d=1&fond=…`, `#point=lat/lng&z=14`, `#parcours=<tracé compressé>`), aucun serveur. Feuille de partage du téléphone, sinon lien copié (bulle `annoncer` de `partage.js`). Un parcours reçu s'ouvre dans son activité avec tout son tracé, sans recalcul ni enregistrement ; simplifié au-delà de 8 000 caractères. Écrans `partage-*` dans les captures.

- Ski de rando (lot 3.3) : choix Piste ou Ski de rando en tête du panneau Ski (premier sélecteur de pratique, `ski-pratique`). Menu de la Randonnée : créer un parcours, « Rechercher ici » (itinéraires `piste:type=skitour` d'OSM en pins de ski de rando regroupés comme ceux de la Randonnée, demande du propriétaire du 10 novembre 2026, et listés ; un appui en ouvre un dans l'éditeur), Mes parcours, GPX. Le routage suit les itinéraires chargés (chargés aussi sans bruit à « Créer un parcours »), BRouter au-delà ; durée pour 400 m/h à la montée ; montées raides au-delà de 30 %. Bloc « Avalanches ici » : niveau du jour du massif au centre de la carte (EAWS), suivi au déplacement ; « Bulletin détaillé » à déplier (demande du propriétaire du 10 novembre 2026, inspirée de l’appli ARVA) : niveaux par altitude et moment de la journée, rose des pentes les plus exposées, problèmes d’avalanche, neige récente 24, 48, 72 h et au sol, textes du service officiel dans sa langue (activité, manteau, météo, tendance) ; « Voir ces pentes sur la carte » : pentes de 30° et plus aux orientations et altitudes du bulletin, avec la pastille « Pentes du bulletin », à la place des pentes de Carte › Relief le temps de leur affichage. Écrans `ski-rando-bulletin*` (bulletin d’hiver de Météo-France simulé, option `bulletin` d’un écran). Pentes allumées avec la pratique, éteintes en la quittant si c'est elle qui les a allumées. Le bulletin détaillé est aussi dans l'onglet Sécurité de la fiche d'une station (massif de la station, demande du propriétaire du 11 novembre 2026) ; pendant une visite, ses pentes se posent sur le décor (`pentesBulletin` de `visite-station.js`, couche `visite-pentes-bulletin`), à la place des pentes de la visite. Écrans `visite-bulletin*`. Parcours dans Mes traces, la sauvegarde et les liens. Écrans `ski-rando*` dans les captures.

- Thermiques et plafond (lot 3.5) : onglet « Profil » de l'analyse du vent (Carte · Volume 3D · Profil), grille heures × altitudes au repère (centre de la carte à l'ouverture) : vent, thermiques, base des cumulus, nuages, rafales, pluie ; une heure touchée se lit et place le curseur ; bouton « Jusqu'à 10 000 m » (4 000 m par défaut, choix gardé `vent-profil-haut`). Volume 3D : « Hauteur au-dessus du sol » 500, 1 000, 2 000, 5 000 ou 10 000 m (décision du propriétaire du 11 novembre 2026 ; l'axe de gauche donne l'altitude, relief compris), couches espacées selon la hauteur (`couchesVolume` de `vent-calcul.js`) ; les niveaux 400, 300 et 250 hPa ne sont demandés qu'au-delà de 3 000 m (poids des requêtes Open-Meteo). Bouton « Plafonds » de Vol libre (quatre boutons en 2 × 2) : sur le modèle de Meteo-Parapente (demande du propriétaire du 11 novembre 2026), une carte de toute la Terre par heure, servie par le relais `api/plafonds.js` (épaisseur de la couche limite de GFS, 0,25°), lissée entre les mailles ; sélecteur en tête du panneau, « Au-dessus du sol » par défaut (l'épaisseur, tranches 300, 600, 1 000, 1 500, 2 000, 2 500 m et plus) ou « Au-dessus de la mer » (épaisseur + relief fin des tuiles de pente, qui suit crêtes et vallées ; tranches de 500 m jusqu'à 5 000 m et plus), décisions du propriétaire du 11 novembre 2026, choix gardé (`plafonds-reference`) ; tuiles `montis-plafond://<sol|mer>/<heure>/z/x/y` jusqu'au zoom 12 ; tranches nettes de 500 m, gris léger sans thermique exploitable (couche de moins de 300 m), curseur des heures, valeur au centre, pastille. Plafond calculé par la méthode de la particule sur les niveaux de pression de Météo-France (pas de couche limite dans ce modèle), testé. Pas de feu vert sur les décollages (décision du propriétaire). Fiches de balise et de terrain : « Analyser le vent ici » et « Prévisions sur 5 jours », avec retour à la fiche. Écrans `meteo-vent-profil*`, `parapente-plafonds*`, `parapente-balise-raccourcis`, `parapente-balise-profil` (météo simulée : niveaux de pression et requêtes à plusieurs points).

- Échelle des vents (11 novembre 2026, demande du propriétaire) : paliers < 10, 10–20, 20–30, 30–40, 40–70 (violet) et 70+ km/h (blanc, flèche à double pointe : `VENT_TRES_FORT`, `iconeVent` de `vent-cadran.js`), communs au vent prévu, aux balises et aux légendes ; rappelée sous le profil.

- Globe jour et nuit (12 novembre 2026, demande du propriétaire, d'après Plans d'Apple) : au dézoom, image du jour avec relief et fonds marins, et villes éclairées la nuit, mélangées selon la hauteur réelle du soleil (crépuscule de −8° à +1°), recalculées toutes les dix minutes ; plein jusqu'au zoom 6, effacé au zoom 8,5 (15 novembre 2026 : entre les deux, le fond Montis était presque vide), océan éclairci côté jour (`oceanClair`), au-dessus de tous les fonds (sous le repère des calques). Écrans `globe-nuit`, `globe-nuit-terminateur` (centré sur la ligne jour-nuit), `globe-nuit-fondu`.

- Voie lactée (15 novembre 2026, demande du propriétaire : « ciel de jungle loin de toute ville, un peu exagéré ») : à sa vraie place autour du globe, derrière les étoiles, avec le même fondu au dézoom. Carte du ciel en coordonnées galactiques générée sur l'appareil (cœur orangé doux vers le Sagittaire, bande gris bleuté, Grand Rift, nuages et filaments de poussière, nébuleuses à peine teintées : le propriétaire ne veut ni blanc vif ni taches rouges) et 25 000 petites étoiles semées selon sa lumière. Galaxies voisines en vraies galaxies (demande du même jour), agrandies comme la Lune, à leur place et dans leur angle : Andromède (doublée, ×2, avec M32 et M110), galaxie du Triangle, Grand et Petit Nuage de Magellan (irrégulières, barre et amas). Générée une fois dans un travailleur (quelques secondes, fondu d'apparition), puis relue du cache `ciel` (`CLE` à renuméroter quand le calcul change). Dessinée en basse définition (`PIXELS_VOIE_LACTEE`) puis agrandie. Écrans `globe-voie-lactee` (centre galactique derrière la Terre), `globe-andromede` et `globe-magellan` (3D inclinée vers la galaxie : à ce zoom, MapLibre limite la latitude du centre vers ±52°) ; les captures attendent `data-voie-lactee` de la toile du ciel.

- Atmosphère du globe (14 novembre 2026, demande du propriétaire, d'après Plans d'Apple) : liseré blanc-bleu et halo sur le bord éclairé, bord assombri côté nuit (`globe-atmosphere.js`) ; nuit en bleu profond avec les lumières des villes réchauffées (`teinteNuit`), jour qui baisse près de la ligne jour-nuit (`eclairageJour`, `globe-nuit-calcul.js`).

- Ciel du globe (12 novembre 2026, demande du propriétaire) : étoiles visibles à l'œil nu à leur vraie place et à l'heure réelle, couleur et éclat selon l'étoile, et Lune avec sa phase (côté éclairé vers le soleil, agrandie : 10 px de rayon), sur une toile derrière la carte (le globe les cache) ; même fondu que le globe jour et nuit (pleines jusqu'au zoom 4, effacées au zoom 6). Constellations : plus tard, sur la même base (tracés de d3-celestial). Écran `globe-ciel-lune` (la Terre cadrée pour voir la Lune près du bord).

- Fond Montis (lot 0.9, fait le 16 novembre 2026, détail dans `docs/lot-0-9-fond.md`) : relief ombré en 2D et 3D, rochers, éboulis, glaciers, zones humides ; forêts plus vertes ; courbes allégées (maîtresses marquées) ; sentiers en tireté rouge sur liseré, trottoirs gris, chemins carrossables gris-brun ; remontées mécaniques à pylônes, voies ferrées, cours d'eau temporaires en tireté, alpages vert-jaune ; routes aux violets de la DA (décision du propriétaire du 14 novembre 2026) ; couleurs de jour rapprochées de la DA (papier froid, eau cyan, noms bleu nuit). **Jour et nuit** (demande du propriétaire du 14 novembre 2026) : en tête de Carte › Fond de carte, Auto (par défaut, nuit après le coucher du soleil au centre de la carte), Jour, Nuit ; nuit cyberpunk (fond bleu nuit, routes « laser » magenta et violet avec halo, sentiers corail, eau cyan), bâtiments gris au contour « laser » cyan si l'élément Bâtiments est allumé. Bâtiments allumés par défaut, sans pastille (comme les courbes). Écrans `fond-*` et `fond-nuit-*` dans les captures Finitions : lisière des forêts, zones habitées gris rosé, liseré des parcs, frontières fines d'elles-mêmes au dézoom (`montis-frontieres`, au-dessus de l'image du globe) ; parkings, abris et points d'eau dans Éléments de la carte, éteints par défaut, pictos dans la DA (`points-utiles.js` : leurs couches suivent leur réglage sur tous les fonds, comme les voies ferrées), fiche d'un parking dans `fiche.js` (Overpass).

**Points ouverts constatés**
- Au démarrage : 315 Ko de code Montis (partage par lien compris) (100 Ko compressé), en deux fichiers : le code (176 Ko, dont 17 Ko pour le catalogue et le panneau des fonds du lot 3.10) et les deux fichiers de langue (135 Ko) ; MapLibre (1,1 Mo) à part. Les contours des pays (50 Ko) se chargent à la demande.
- Les crédits de la carte (attribution MapLibre) restent dans la langue du chargement jusqu'à l'actualisation.

**Feuille de route :** `docs/feuille-de-route.md` découpe la suite en lots (un lot = une branche), dans l'ordre validé le 9 novembre 2026, avec la barre qualité que chaque fonction doit franchir. Le détail des lots faits est dans `docs/historique.md` : y ajouter celui de chaque lot terminé. Quand le propriétaire demande « le lot X », le faire tel qu'il y est décrit, puis cocher le lot. Pour les décisions marquées « À décider », demander au propriétaire plutôt que supposer.
