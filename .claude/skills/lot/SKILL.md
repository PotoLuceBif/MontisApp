---
name: lot
description: Réaliser un lot de la feuille de route de Montis (docs/feuille-de-route.md) de bout en bout, du plan au résumé avec preview. À utiliser quand le propriétaire écrit « /lot 1.2 », « fais le lot 1.2 » ou « lot suivant ».
---

# Réaliser un lot de la feuille de route

Argument : le numéro du lot (`1.2`). « Lot suivant » : le premier lot non coché, dans l'ordre du fichier.

Suivre la section « Façon de travailler avec le propriétaire » de CLAUDE.md à chaque étape.

## 1. Comprendre
- Partir de `developpement` à jour : `git fetch origin developpement`, puis créer ou repartir la branche de travail depuis `origin/developpement`. Si la branche imposée contient déjà des commits non fusionnés, les garder et les rebaser sur `origin/developpement`.
- Lire le lot dans `docs/feuille-de-route.md`, avec son critère « Fini quand », la barre qualité et les décisions marquées **À décider** qui le concernent.
- Lire le code concerné avant de proposer quoi que ce soit.
- Une décision **À décider** bloque le lot : poser la question (et notifier avec `PushNotification` si le propriétaire peut être absent), puis avancer sur ce qui n'en dépend pas.

## 2. Proposer un plan court
- Une ligne par partie, chaque partie donnant un commit.
- Signaler ce qui changera visiblement et ce qui reste à décider.
- Enchaîner sans attendre, sauf si le propriétaire a demandé de valider le plan ou si une partie dépend d'une question ouverte.

## 3. Réaliser, une partie à la fois
Pour chaque partie :
- coder en respectant CLAUDE.md (règles de conception, conventions, pièges connus) ;
- un calcul ajouté ou modifié reçoit son test dans `tests/` ;
- `npm test` et `npm run build` ;
- pour l'interface, `npm run captures -- <écrans>` : regarder les captures, lire `captures/rapport.txt` ; un nouvel écran va dans `ECRANS` de `scripts/captures.mjs` ;
- vérifier au format téléphone et ordinateur, en 2D et en 3D quand la carte est concernée ;
- commit en français, au présent, sans préfixe.

S'arrêter et demander pour un changement visible non prévu par le lot.

## 4. Pousser et vérifier
- `npm test`, `npm run build` et `npm run captures` complet : aucune erreur dans le rapport.
- Pousser sur la branche de la session. Si le propriétaire l'a demandé, ouvrir une PR **vers `developpement`**, jamais vers `main`.
- Cocher le lot dans `docs/feuille-de-route.md` et noter ce qui a changé de plan.
- Mettre à jour CLAUDE.md : « État actuel », arborescence, pièges découverts.
- Committer ces mises à jour et pousser.
- Notifier (`PushNotification`) : « Lot X prêt sur la preview : <ce qu'il faut regarder> ».

## 5. Résumer au propriétaire
Dans cet ordre, court :
1. **Lien de preview** (format dans CLAUDE.md).
2. **Ce qui a changé**, partie par partie, du point de vue de l'utilisateur.
3. **Captures** téléphone des écrans modifiés (`SendUserFile`, une planche).
4. **À tester sur ton téléphone** : ce que Claude n'a pas pu voir.
5. **Décisions prises seul** et **questions en suspens**.
6. Demander un retour, idéalement en captures d'écran, à traiter avec `/retour`.
