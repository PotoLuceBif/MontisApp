# Lot 0.9 : le fond Montis, élément par élément

Direction choisie le 13 novembre 2026 : **un mélange d'IGN et d'appli moderne**. On garde les couleurs familières des cartes de randonnée, épurées, avec un relief doux et des noms très lisibles.

On passe les éléments un à un : je propose, tu regardes les captures, tu valides ou tu ajustes, puis on passe au suivant. ★★★ : ce qui change le plus la carte. ★ : finition.

Ce qu'on peut dessiner dépend des données d'OpenFreeMap (OpenStreetMap simplifié). Certaines choses n'y sont pas, c'est indiqué.

## Fait
- [x] **Ombrage du relief** en 2D et en 3D, ombres bleutées, plus doux de près.
- [x] **Rochers, éboulis, zones humides, sable, glaciers bordés de bleu.**
- [x] **Forêts et alpages plus verts** (13 novembre 2026, ta demande : vert plus accentué).

## Fait le 14 novembre 2026 (demandes du propriétaire)
- [x] **Bâtiments allumés par défaut** (élément de la carte, sans pastille).
- [x] **Bâtiments 3D** : couleur d'OpenStreetMap quand elle est connue, apparition dès le zoom 13,5, montée en douceur, dégradé vertical. Façades à fenêtres essayées puis retirées (MapLibre pose le motif aussi sur les toits). De vrais toits demanderaient une autre source de modèles 3D (swisstopo pour la Suisse) : plus tard.
- [x] **Couleurs de jour rapprochées de la DA** : papier plus froid, eau vers le cyan du logo, noms bleu nuit, sommets brun-violet, bâtiments gris lavande.
- [x] **Fond Montis Auto · Jour · Nuit** en tête de Fond de carte ; Auto par défaut, nuit après le coucher du soleil au centre de la carte.
- [x] **Première version de nuit** : voir E. Bâtiments gris au contour « laser » cyan.

## À revoir (prévu le 15 novembre 2026)
- **Voie lactée autour du globe.** Deux essais retirés le 14 novembre : contours de d3-celestial en taches floues (trop discret ou voile gris), puis photo du ciel de l'ESO (eso0932a, S. Brunier, CC BY 4.0) projetée pixel par pixel, proche du rendu de Google Earth (4 000 px, 1,3 Mo hors préchargement, éclat 55 %). Le code de l'essai photo n'est pas gardé ; la piste à reprendre est celle-là.

## A. Couleurs de base
1. ★★★ **Forêts.** Le vert vient d'être accentué. Pistes : lisière plus foncée (contour fin), petit motif d'arbres de près comme l'IGN. *Pas dans les données :* feuillus ou conifères.
2. ★★ **Prairies et alpages.** Vert pâle, distinct des forêts. Pistes : un vert-jaune plus franc pour les alpages, rien pour les cultures (la carte reste claire en vallée).
3. ★★ **Couleur du fond** (le « papier »). Aujourd'hui crème. Pistes : un blanc cassé plus neutre (moderne) ou un crème plus chaud (IGN).
4. ★★ **Eaux.** Lacs, rivières, torrents. Pistes : bord des lacs plus foncé, torrents qui s'affinent, cours d'eau temporaires en tireté, bleu plus profond ou plus turquoise.
5. ★★ **Glaciers et névés.** Pistes : léger dégradé bleuté, courbes de niveau bleues sur la glace (comme swisstopo). *Pas dans les données :* crevasses, séracs.
6. ★ **Rochers et éboulis.** Pistes : motif plus ou moins dense, gris plus chaud ou plus froid.
7. ★ **Villes et villages.** Zones habitées en gris rosé léger, bâtiments plus nets de près.
8. ★ **Parcs nationaux et réserves.** Aujourd'hui seulement dans Éléments de la carte. Piste : un liseré discret toujours visible dans le fond.

## B. Relief
9. ★★★ **Courbes de niveau.** *Fait le 13 novembre 2026 : 50 m au zoom 12, 20 m aux zooms 13 et 14, 10 m au-delà ; maîtresses marquées.* Le plus gros chantier visible de près : elles sont trop denses et trop brunes. Pistes : maîtresses marquées, intermédiaires très fines, intervalle adapté au zoom, couleur selon le terrain (brun sur la terre, bleu sur les glaciers, gris sur les rochers), cotes mieux espacées et dans le sens de la pente.
10. ★★ **Force et couleur de l'ombrage.** Plus ou moins contrasté, ombres plus bleues ou plus grises, lumière plus chaude.
11. ★ **Teintes d'altitude.** Vallées vertes, hauts versants plus clairs, à la suisse. Écartées pour l'instant, à essayer si tu veux.
12. *Pas dans les données :* falaises et barres rocheuses en trait. À chercher plus tard (calcul depuis le relief, sur l'appareil).

## C. Routes et chemins
13. ★★★ **Routes.** *Fait le 14 novembre 2026 : violets de la DA de Montis (version « montis » de `VERSIONS_ROUTES`), un peu plus profonds après un premier essai trop effacé ; cerne pour toutes les routes, largeur selon la classe, tunnels estompés. Versions IGN, juste milieu, doux et moderne gardées pour comparer. En mode nuit (23) : les mêmes en « laser » magenta et violet.*
    - *IGN* : autoroutes rouges, nationales rouge-orangé, départementales jaunes, petites routes blanches cerclées ;
    - *Moderne* : routes blanches ou gris clair avec un fin liseré, seules les grandes en couleur douce (orange pâle).
14. ★★★ **Sentiers.** *Fait le 14 novembre 2026 : tireté rouge sur liseré couleur papier, marches en tireté serré, trottoirs et allées en gris fin.* Le cœur de Montis. Pistes : tireté rouge-brun bien visible comme l'IGN, épaisseur selon le zoom, sentiers balisés (GR) mis en avant, marches et passages raides marqués. *Pas dans les données :* la difficulté des sentiers (`sac_scale`).
15. ★★ **Pistes et chemins carrossables.** *Fait le 14 novembre 2026 : trait continu gris-brun, distinct des courbes.* Trait continu fin ou double tireté, entre route et sentier.
16. ★★ **Remontées mécaniques.** Téléphériques et télésièges en trait fin noir avec pylônes, comme les cartes de ski. Le trait orange vers l'aiguille du Midi est à vérifier.
17. ★ **Voies ferrées** (trait noir et blanc), **ponts et tunnels** (tunnels en tireté).

## D. Noms et symboles
18. ★★★ **Police.** Une police servie par Montis, plus élégante, qui ne dépend plus du serveur de démonstration de MapLibre. À choisir ensemble (deux ou trois essais en captures).
19. ★★★ **Sommets.** *Fait le 15 novembre 2026, à valider : petit triangle coloré par le style (jour et nuit), altitude en plus petit sous le nom, plus de « 0 m », les plus hauts gardés en priorité, cols sans triangle.* Petit triangle, nom et altitude bien hiérarchisés ; corriger les « 0 m » (sommets sans altitude dans OpenStreetMap : n'afficher que le nom, ou rien s'il n'y a pas de nom).
20. ★★ **Villes et villages.** Taille selon l'importance, capitales mieux marquées.
21. ★★ **Cols, glaciers, lacs, vallées.** Cols avec leur altitude, noms des glaciers en bleu italique, noms des lacs dans le lac.
22. ★ **Points utiles.** Parkings, abris, points d'eau, en petits pictos discrets de près.

## E. Thème sombre
23. ★★★ **Version sombre du fond** (idée du 14 novembre 2026 : routes « laser » magenta et violet avec halo, sentiers corail néon, eau et glaciers cyan du logo ; le jour en est la version calme), assortie aux thèmes sombre et cyberpunk (aujourd'hui la carte reste claire quand l'interface est sombre). On la fait en dernier : elle décline tout le reste.

## F. Selon le zoom
24. ★★ **Vue de loin** (pays, massifs) : ce qui apparaît, ce qui disparaît, passage au globe.
25. ★ **3D** : contrôle final de chaque élément incliné.

## Ordre proposé
1. Courbes (9)
2. Sentiers puis routes (14, 13, 15)
3. Sommets et police (19, 18)
4. Eaux, glaciers, prairies, papier (4, 5, 2, 3)
5. Remontées, cols et autres noms (16, 21, 20)
6. Finitions (reste de A et D, 10, 24)
7. Version sombre (23)
