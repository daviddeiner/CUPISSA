-- CUPISSA | Carrito y favoritos sincronizados por cuenta.
-- Ejecutar una sola vez en Supabase > SQL Editor.

CREATE TABLE IF NOT EXISTS public.cliente_catalogo_estado (
    auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    carrito jsonb NOT NULL DEFAULT '[]'::jsonb,
    favoritos jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cliente_catalogo_estado ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cliente_catalogo_estado_select_own
ON public.cliente_catalogo_estado;

CREATE POLICY cliente_catalogo_estado_select_own
ON public.cliente_catalogo_estado
FOR SELECT TO authenticated
USING (auth.uid() = auth_user_id);

DROP POLICY IF EXISTS cliente_catalogo_estado_insert_own
ON public.cliente_catalogo_estado;

CREATE POLICY cliente_catalogo_estado_insert_own
ON public.cliente_catalogo_estado
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = auth_user_id);

DROP POLICY IF EXISTS cliente_catalogo_estado_update_own
ON public.cliente_catalogo_estado;

CREATE POLICY cliente_catalogo_estado_update_own
ON public.cliente_catalogo_estado
FOR UPDATE TO authenticated
USING (auth.uid() = auth_user_id)
WITH CHECK (auth.uid() = auth_user_id);

GRANT SELECT, INSERT, UPDATE
ON public.cliente_catalogo_estado
TO authenticated;

REVOKE ALL
ON public.cliente_catalogo_estado
FROM anon;
