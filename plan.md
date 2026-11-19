# LUNDER — plan de refonte sur `tayeb`

## Périmètre

Cette itération transforme le storefront existant en expérience premium de studio de fabrication 3D, sans supprimer les parcours métier déjà présents et sans toucher à Supabase production. Les flux d’achat, de livraison, de demande sur mesure, d’authentification et d’administration restent branchés sur leurs fonctions et politiques existantes.

## Design retenu

Trois directions évaluées :

- **Atelier cinématique graphite / rouge signal** — 0,74
- **Laboratoire clair minéral** — 0,08
- **Galerie monochrome éditoriale** — 0,05

### Mouvement esthétique
Atelier cinématique contemporain, entre showroom industriel et interface de laboratoire produit.

### Principes
1. Hiérarchie éditoriale nette : une promesse, une preuve, une action.
2. Contraste graphite, surfaces fumées et rouge signature réservé aux actions.
3. Grilles asymétriques, bordures fines et profondeur légère plutôt que surcharge d’effets.
4. Mobile-first : actions accessibles au pouce et contenu lisible sans dépendre du hover.

### Philosophie couleur
Le graphite évoque l’atelier et la précision. Le rouge LUNDER sert de signal opératoire : il attire l’œil vers les actions et les états importants, sans colorer toute l’interface. Les touches ambre indiquent la matière, le prototypage et la chaleur de fabrication.

### Paradigme de layout
Sections éditoriales pleine largeur, avec une colonne narrative et des panneaux d’atelier flottants. Les listes de produits conservent une grille responsive, mais chaque bloc est introduit par un contexte et une action claire.

### Éléments signature
- Trame de points et halos lumineux très discrets dans le hero.
- Étiquettes techniques en capitales espacées.
- Cartes produit avec ruban d’état, image immersive et flèche d’exploration.

### Interaction et animation
Transitions courtes, déplacement de 2 à 6 px et apparition progressive. Les animations sont désactivées ou réduites via `prefers-reduced-motion` et les réglages Visual Identity existants. Aucun effet ne doit retarder l’action ou le chargement du viewer 3D.

### Typographie
Inter reste la police opérationnelle existante : 10–12 px pour les métadonnées techniques, 14–16 px pour le texte courant, titres lourds et courts pour les messages de conversion.

### Voix de marque
Directe, précise, chaleureuse. Exemples : « Donnez une forme concrète à votre idée. » et « Choisissez une pièce. Nous préparons le reste. »

### Essence de marque
LUNDER transforme des idées, modèles et besoins en pièces 3D fabriquées en Algérie. Personnalité : précise, créative, fiable.

### Wordmark
Le nom reste typographique avec un monogramme carré inspiré d’une couche d’impression, afin de fonctionner dans l’en-tête, le footer et les vues admin sans dépendre d’un asset externe.

### Couleur propriétaire
Rouge signal `#E32636`, utilisé avec parcimonie comme repère de fabrication et d’action.

## Architecture et fichiers

- `src/layouts/StoreLayout.tsx` : navigation sticky, recherche, menu mobile, footer de confiance et tokens Visual Identity.
- `src/pages/store/HomePage.tsx` : hero éditorial, preuves, fabrication sur mesure, produits en vedette et CTA.
- `src/pages/store/ProductsPage.tsx` et `src/components/ProductCard.tsx` : recherche, filtres, états, cartes et pagination existants conservés et harmonisés.
- `src/index.css` : primitives de design, focus, scrollbar, motion et responsive.
- `public/manus-routes.json` : déclaration des routes page nécessaires au preview/SEO.
- `plan.md` et `TODO.md` : décisions et avancement.

## Contraintes de confiance

- Travail exclusivement sur `tayeb`.
- Aucune migration ou donnée Supabase appliquée.
- Aucune clé `service_role` côté client.
- Les prix, stocks, commandes et devis restent déterminés par les RPC/RLS existants.
- Le viewer 3D reste lazy-loadé par la page produit.
