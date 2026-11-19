# LUNDER — TODO de livraison

## Sprint qualité produit — 19 novembre 2026
- [x] Ajouter des expériences dédiées Décorer, Offrir, Prototyper et Personnaliser.
- [x] Afficher de vraies recommandations catalogue quand Supabase répond, avec fallback de sélection récente en cas de recherche sans résultat.
- [x] Tester les quatre routes dans le navigateur sandbox et vérifier l’action principale Personnaliser vers le formulaire sur mesure.
- [x] Ajouter les quatre routes au manifeste `public/manus-routes.json`.
- [ ] Exécuter les régressions SQL sur une base Supabase locale isolée : bloqué tant que Supabase CLI/Docker ne sont pas disponibles.
- [ ] Tester les interactions sur viewport mobile réel et réseau dégradé : partiellement bloqué par l’absence d’un outil de redimensionnement browser dans cet environnement.

## Refonte storefront premium
- [ ] Le storefront présente une identité cohérente de studio 3D, avec hero, hiérarchie éditoriale, appels à l’action et footer professionnel.
- [ ] Les parcours Accueil, Boutique, Produit, Panier, Commande, Suivi, Compte et Sur mesure restent accessibles par la navigation desktop et mobile.
- [ ] Les états de chargement, erreur, vide, disponibilité et navigation clavier restent explicites.
- [ ] Le rendu mobile conserve des zones tactiles confortables et une navigation fermable par Escape.

## Expérience catalogue et produit
- [ ] La recherche, les catégories, le tri, la pagination et les liens produit restent fonctionnels.
- [ ] Les cartes exposent image, catégorie, disponibilité, prix et action d’exploration.
- [ ] La page produit conserve les variantes, le stock, la quantité, le viewer 3D, l’ajout au panier et les informations de livraison.

## Identité visuelle administrable
- [ ] Le storefront continue de consommer l’identité publiée par Visual Identity Studio sans créer un second système de réglages.
- [ ] Les réglages de logo, couleurs, médias, sections et motion continuent d’être appliqués via les variables existantes.

## Qualité et sécurité
- [ ] `npm run lint`, `npm run typecheck`, `npm test` et `npm run build` passent après les changements.
- [ ] Aucune migration n’est appliquée et aucune donnée de production n’est modifiée.
- [ ] La branche `main` conserve le SHA `3228bd0c77ab727ac059fdadc57335377f422a0b`.
- [ ] Les changements sont commités explicitement sur `tayeb` avec un rapport final et les limitations restantes.
