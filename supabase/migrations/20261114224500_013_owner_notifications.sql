-- 013 — Notifications privées du propriétaire pour les nouveaux événements métier.
-- Les triggers s’exécutent dans la transaction qui crée la commande ou la demande :
-- toute opération métier annulée annule aussi sa notification.

CREATE TABLE IF NOT EXISTS public.owner_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('new_order', 'new_custom_request')),
  event_id uuid NOT NULL,
  -- Une notification sans entité à ouvrir n’est plus utile : elle est supprimée avec sa cible.
  related_order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  related_request_id uuid REFERENCES public.custom_requests(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 180),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT owner_notifications_related_entity_check CHECK (
    (event_type = 'new_order' AND related_order_id IS NOT NULL AND related_request_id IS NULL)
    OR
    (event_type = 'new_custom_request' AND related_request_id IS NOT NULL AND related_order_id IS NULL)
  ),
  CONSTRAINT owner_notifications_event_unique UNIQUE (owner_id, event_type, event_id)
);

CREATE INDEX IF NOT EXISTS idx_owner_notifications_unread
  ON public.owner_notifications (owner_id, created_at DESC)
  WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_owner_notifications_recent
  ON public.owner_notifications (owner_id, created_at DESC);

ALTER TABLE public.owner_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.owner_notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.owner_notifications TO authenticated;
GRANT UPDATE (read_at) ON public.owner_notifications TO authenticated;

DROP POLICY IF EXISTS owner_read_notifications ON public.owner_notifications;
CREATE POLICY owner_read_notifications ON public.owner_notifications FOR SELECT
  TO authenticated USING (owner_id = auth.uid() AND public.is_owner());

DROP POLICY IF EXISTS owner_mark_notifications_read ON public.owner_notifications;
CREATE POLICY owner_mark_notifications_read ON public.owner_notifications FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid() AND public.is_owner())
  WITH CHECK (owner_id = auth.uid() AND public.is_owner());

CREATE OR REPLACE FUNCTION public.notify_owner_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Une commande créée par approbation propriétaire d’une demande sur mesure
  -- n’est pas une nouvelle commande client et ne réclame pas une seconde alerte.
  IF NEW.source IS DISTINCT FROM 'custom' THEN
    INSERT INTO public.owner_notifications (
      owner_id, event_type, event_id, related_order_id, title, description
    )
    SELECT
      p.id,
      'new_order',
      NEW.id,
      NEW.id,
      left('Nouvelle commande ' || NEW.order_number, 180),
      left(NEW.customer_name || ' vient de passer une commande.', 500)
    FROM public.profiles AS p
    WHERE p.role = 'owner'
    ON CONFLICT (owner_id, event_type, event_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_owner_new_order() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS owner_notification_on_order_insert ON public.orders;
CREATE TRIGGER owner_notification_on_order_insert
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_owner_new_order();

CREATE OR REPLACE FUNCTION public.notify_owner_new_custom_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.owner_notifications (
    owner_id, event_type, event_id, related_request_id, title, description
  )
  SELECT
    p.id,
    'new_custom_request',
    NEW.id,
    NEW.id,
    left('Nouvelle demande sur mesure ' || NEW.request_number, 180),
    left(NEW.customer_name || ' a envoyé une demande : ' || NEW.title, 500)
  FROM public.profiles AS p
  WHERE p.role = 'owner'
  ON CONFLICT (owner_id, event_type, event_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_owner_new_custom_request() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS owner_notification_on_custom_request_insert ON public.custom_requests;
CREATE TRIGGER owner_notification_on_custom_request_insert
  AFTER INSERT ON public.custom_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_owner_new_custom_request();

-- Active Realtime uniquement si la publication Supabase existe; l’interface garde
-- un repli de rafraîchissement léger si Realtime n’est pas activé côté projet.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'owner_notifications'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.owner_notifications;
  END IF;
END;
$$;
