-- CUPISSA | Opciones de accesorios e incrementos por producto
-- Ejecutar una sola vez en Supabase > SQL Editor.
-- Es una columna JSONB independiente; no modifica tallas, colores ni productos existentes.

ALTER TABLE public.productos
ADD COLUMN IF NOT EXISTS accesorios jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.productos
SET accesorios = '[]'::jsonb
WHERE accesorios IS NULL;

ALTER TABLE public.productos
ALTER COLUMN accesorios SET DEFAULT '[]'::jsonb,
ALTER COLUMN accesorios SET NOT NULL;
