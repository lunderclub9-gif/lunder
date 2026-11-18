# LUNDER — guide des migrations Supabase

## Règle de sécurité principale

La base de migration est une histoire forward-only. Une migration déjà committée ou potentiellement appliquée ne doit pas être réécrite, renommée, supprimée ou fusionnée pour rendre le dossier plus court. Toute correction de schéma ou de permission doit être portée par un nouveau fichier horodaté. Le projet de production confirmé est `bavsrogbmfbalvpmbozc` : aucune commande de migration ne doit viser ce projet sans autorisation explicite.

La seule restauration effectuée pendant l’audit est la remise en conformité de `20261113170000_011_custom_workflow_and_delivered_deletion.sql` avec `main`. Cette migration historique avait divergé sur un `REVOKE`; la permission plus stricte est déjà portée par `20261116170000_019_public_view_and_function_privileges.sql`. Le schéma effectif de la chaîne reste donc inchangé, mais l’historique de `tayeb` ne contient plus de drift silencieux par rapport à `main`.

## Convention de nommage

Chaque fichier doit respecter `YYYYMMDDHHMMSS_description.sql`, avec un timestamp strictement croissant et une description en minuscules séparée par des tirets bas. Le timestamp est l’identifiant d’ordre ; le nom numérique interne d’une feature peut être conservé dans la description mais ne remplace jamais l’ordre temporel.

Créer une migration avec Supabase CLI dans un environnement local ou de test, puis vérifier le contenu avant commit :

```bash
supabase migration new description_courte
python3 scripts/check-migrations.py
```

Le validateur ne se connecte à aucune base. Il détecte les identifiants dupliqués, l’ordre invalide, les objets non-fonction répétés de façon suspecte et les fonctions `SECURITY DEFINER` sans `SET search_path`. Les `CREATE OR REPLACE FUNCTION` sont signalés comme évolutions à relire, pas supprimés automatiquement.

## Inventaire audité

| Migration | Objet principal | Classification |
|---|---|---|
| `20261112190919_001_lunders_catalog_and_auth.sql` | Profils, catégories, produits, images, fonctions de base et RLS catalogue | Fondation |
| `20261112193000_002_owner_access_and_profile_hardening.sql` | Rôle propriétaire, profil, accès aux brouillons et anti-escalade | Durcissement incrémental |
| `20261112200000_003_catalog_variants_and_media_limits.sql` | Options, valeurs, variantes et limites média | Extension catalogue |
| `20261112210000_004_algeria_geography.sql` | Wilayas et communes | Données de référence |
| `20261112211000_005_delivery_and_orders.sql` | Livraison, points relais, commandes, suivi et RPC invité | Fondation commandes |
| `20261112220000_006_custom_requests_and_quotes.sql` | Demandes sur mesure, fichiers, devis et intake invité | Fondation sur mesure |
| `20261112230000_007_costs_settings_and_audit.sql` | Matières, coûts, réglages publics et journal d’audit | Finance et audit |
| `20261113140000_008_auto_manufacturing_pricing.sql` | Tarification de fabrication et devis automatiques | Extension métier |
| `20261113150000_009_order_archive_source_and_security.sql` | Archivage commandes, source et remplacement de RPC | Durcissement incrémental |
| `20261113160000_010_pricing_security_and_public_estimate.sql` | Estimations publiques et vue matières | Surface publique contrôlée |
| `20261113170000_011_custom_workflow_and_delivered_deletion.sql` | Workflow sur mesure, approbation et suppression livrée | Workflow incrémental |
| `20261113180000_012_owner_approval_and_safe_request_deletion.sql` | Approbation propriétaire, suppression sûre, suppression de `approve_custom_quote` | Nettoyage fonctionnel forward-only |
| `20261114224500_013_owner_notifications.sql` | Notifications propriétaire et triggers | Extension opérationnelle |
| `20261116100000_014_multi_model_custom_requests.sql` | Plusieurs modèles par demande et vue de suivi enrichie | Extension sur mesure |
| `20261116120000_015_profit_analytics.sql` | Dépenses, coûts snapshot et date de livraison | Analyse financière |
| `20261116140000_016_security_financial_accuracy_hardening.sql` | Search paths, privilèges par défaut et schéma public | Durcissement sécurité |
| `20261116150000_017_variant_combination_integrity.sql` | Clé d’unicité des combinaisons de variantes | Intégrité données |
| `20261116160000_018_guest_api_rate_limits.sql` | Schéma privé et limites commandes, demandes et tracking | Anti-abus |
| `20261116170000_019_public_view_and_function_privileges.sql` | Vue publique sûre et surface RPC explicite | Correction sécurité effective |
| `20261116180000_020_custom_upload_storage_limits.sql` | Limites de stockage des uploads sur mesure | Anti-abus stockage |
| `20261116190000_021_rls_performance_and_fk_indexes.sql` | Recréation contrôlée des politiques et index FK | Performance/RLS |
| `20261116200000_022_guest_estimate_rate_limits.sql` | Limites des estimations et sauvegardes de modèles | Anti-abus incrémental |
| `20261117230000_023_customer_quote_breakdown_allowlist.sql` | Allowlist de sortie du breakdown client | Réduction d’exposition |
| `20261118000656_revoke_anon_access_to_private_tables.sql` | Retrait des grants anon sur tables privées | Moindre privilège |
| `20261118090000_024_immutable_custom_quotations.sql` | Snapshots et immutabilité des devis | Intégrité commerciale |
| `20261118100000_025_inventory_movement_ledger.sql` | Ledger d’inventaire et réservations atomiques | Stock |
| `20261118110000_026_storage_atomic_quotas.sql` | Quotas storage atomiques et politiques storage | Anti-abus stockage |
| `20261118120000_027_tracking_attempt_serialization.sql` | Sérialisation des tentatives de tracking | Anti-abus concurrent |
| `20261118130000_028_manufacturing_cost_engine.sql` | Fournisseurs, historique prix, moteur de coûts et devis | Finance avancée |
| `20261118140000_029_visual_identity_studio.sql` | Versions de design et publication d’identité | Configuration produit |
| `20261118150000_030_customer_account_ownership.sql` | Liaison compte client, vues et RLS de propriété | Espace client |

## Lecture des répétitions

Les fonctions répétées dans plusieurs migrations sont principalement des remplacements intentionnels : `get_custom_request_by_token`, `decide_custom_quote`, `delete_order`, `track_order`, `customer_quote_breakdown` et `owner_approve_custom_request` évoluent avec les exigences du workflow et de sécurité. Elles ne doivent pas être fusionnées rétroactivement.

Le cas `approve_custom_quote` est différent : sa suppression est déjà explicitement portée par la migration 012. Les anciennes définitions restent dans les fichiers historiques pour rendre la chaîne reproductible ; elles ne représentent pas un doublon vivant dans le schéma final.

Les politiques et triggers répétés dans 019, 021 et 026 suivent un motif `DROP IF EXISTS` puis `CREATE` pour remplacer une définition antérieure. Ce sont des remplacements contrôlés, pas des créations concurrentes.

## Procédure de test

Sur une base locale ou un projet de test jetable uniquement :

```bash
supabase start
supabase db reset
supabase test db
python3 scripts/check-migrations.py
```

Puis exécuter les régressions SQL de `supabase/tests/` sur cette base isolée. Les fichiers de tests ne constituent pas une preuve de validation production tant qu’ils n’ont pas été exécutés contre une base de test compatible.

Avant de pousser une migration :

1. vérifier que l’objet et son état actuel sont compris ;
2. rechercher les callers TypeScript et les signatures RPC ;
3. ajouter les grants/revokes explicitement ;
4. pinner `search_path` pour chaque `SECURITY DEFINER` ;
5. ajouter ou ajuster une régression SQL ;
6. exécuter le validateur et les tests applicatifs ;
7. documenter si la migration remplace une fonction ou une politique existante.

Ne pas utiliser `IF NOT EXISTS` pour masquer une divergence de schéma. Il est acceptable uniquement lorsque l’idempotence est explicitement recherchée et que la définition existante est compatible.
