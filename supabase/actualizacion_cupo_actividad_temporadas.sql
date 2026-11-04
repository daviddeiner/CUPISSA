-- CUPISSA | Capacidad diaria de pedidos y métricas reales del catálogo.
-- Ejecutar una sola vez en Supabase SQL Editor.

create extension if not exists pgcrypto;

-- Límite diario configurado desde CUPISSA ADMIN.
create table if not exists public.configuracion_pedidos_web (
  id integer primary key default 1 check (id = 1),
  max_pedidos_diarios integer not null default 20 check (max_pedidos_diarios between 1 and 500),
  updated_at timestamptz not null default now()
);
insert into public.configuracion_pedidos_web (id, max_pedidos_diarios)
values (1, 20)
on conflict (id) do nothing;
alter table public.configuracion_pedidos_web enable row level security;
drop policy if exists configuracion_pedidos_web_read on public.configuracion_pedidos_web;
create policy configuracion_pedidos_web_read on public.configuracion_pedidos_web
for select to anon, authenticated using (true);
grant select on public.configuracion_pedidos_web to anon, authenticated;
grant select, insert, update, delete on public.configuracion_pedidos_web to service_role;

-- Los cupos se reservan durante el proceso de pago para evitar sobreagendar.
create table if not exists public.reservas_pedidos_web (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  referencia text not null unique,
  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE','CONFIRMADA','LIBERADA')),
  expira_en timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_reservas_pedidos_web_fecha_estado
  on public.reservas_pedidos_web (fecha, estado, expira_en);
alter table public.reservas_pedidos_web enable row level security;
grant all on public.reservas_pedidos_web to service_role;

create or replace function public.cupissa_reservar_cupo_pedido(p_fecha date, p_referencia text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max integer;
  v_orders integer;
  v_reserved integer;
begin
  if p_fecha is null or coalesce(trim(p_referencia), '') = '' then
    return false;
  end if;
  select max_pedidos_diarios into v_max
  from public.configuracion_pedidos_web where id = 1 for update;
  if v_max is null then v_max := 20; end if;

  select count(*) into v_orders
  from public.pedidos_web p
  where p.fecha_entrega = p_fecha
    and coalesce(p.tipo_pedido, 'VENTA') = 'VENTA'
    and coalesce(p.estado, '') <> 'CANCELADO';

  select count(*) into v_reserved
  from public.reservas_pedidos_web r
  where r.fecha = p_fecha and r.estado = 'PENDIENTE' and r.expira_en > now()
    and r.referencia <> p_referencia;

  if v_orders + v_reserved >= v_max then
    return false;
  end if;

  insert into public.reservas_pedidos_web (fecha, referencia, estado, expira_en)
  values (p_fecha, p_referencia, 'PENDIENTE', now() + interval '30 minutes')
  on conflict (referencia) do update
    set fecha = excluded.fecha,
        estado = 'PENDIENTE',
        expira_en = excluded.expira_en,
        updated_at = now();
  return true;
end;
$$;

create or replace function public.cupissa_liberar_cupo_pedido(p_referencia text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.reservas_pedidos_web
  set estado = 'LIBERADA', updated_at = now()
  where referencia = p_referencia and estado = 'PENDIENTE';
  return found;
end;
$$;

create or replace function public.cupissa_confirmar_cupo_pedido(p_referencia text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.reservas_pedidos_web
  set estado = 'CONFIRMADA', updated_at = now()
  where referencia = p_referencia and estado = 'PENDIENTE';
  return found;
end;
$$;

create or replace function public.cupissa_fechas_sin_cupo(p_desde date, p_hasta date)
returns table (fecha date)
language sql
stable
security definer
set search_path = public
as $$
  with config as (
    select coalesce((select max_pedidos_diarios from public.configuracion_pedidos_web where id = 1), 20) as limite
  ), calendar as (
    select generate_series(p_desde, p_hasta, interval '1 day')::date as day
  ), order_counts as (
    select p.fecha_entrega as day, count(*)::integer as qty
    from public.pedidos_web p
    where p.fecha_entrega between p_desde and p_hasta
      and coalesce(p.tipo_pedido, 'VENTA') = 'VENTA'
      and coalesce(p.estado, '') <> 'CANCELADO'
    group by p.fecha_entrega
  ), reservation_counts as (
    select r.fecha as day, count(*)::integer as qty
    from public.reservas_pedidos_web r
    where r.fecha between p_desde and p_hasta
      and r.estado = 'PENDIENTE' and r.expira_en > now()
    group by r.fecha
  )
  select c.day
  from calendar c
  cross join config cfg
  left join order_counts oc on oc.day = c.day
  left join reservation_counts rc on rc.day = c.day
  where coalesce(oc.qty, 0) + coalesce(rc.qty, 0) >= cfg.limite
  order by c.day;
$$;

-- Protección adicional: también valida las órdenes creadas desde el panel administrativo.
create or replace function public.cupissa_validar_cupo_diario_pedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max integer;
  v_orders integer;
  v_reserved integer;
  v_reference text;
  v_has_reservation boolean := false;
begin
  if coalesce(new.tipo_pedido, 'VENTA') <> 'VENTA' or coalesce(new.estado, '') = 'CANCELADO' or new.fecha_entrega is null then
    return new;
  end if;

  select elem->>'_cupissa_wompi_reference' into v_reference
  from jsonb_array_elements(coalesce(new.productos, '[]'::jsonb)) elem
  where coalesce(elem->>'_cupissa_wompi_reference', '') <> ''
  limit 1;

  if v_reference is not null then
    select exists (
      select 1 from public.reservas_pedidos_web r
      where r.referencia = v_reference and r.fecha = new.fecha_entrega
        and r.estado = 'PENDIENTE' and r.expira_en > now()
    ) into v_has_reservation;
  end if;
  if v_has_reservation then return new; end if;

  select max_pedidos_diarios into v_max
  from public.configuracion_pedidos_web where id = 1 for update;
  if v_max is null then v_max := 20; end if;

  select count(*) into v_orders
  from public.pedidos_web p
  where p.fecha_entrega = new.fecha_entrega
    and coalesce(p.tipo_pedido, 'VENTA') = 'VENTA'
    and coalesce(p.estado, '') <> 'CANCELADO'
    and (tg_op = 'INSERT' or p.id <> new.id);

  select count(*) into v_reserved
  from public.reservas_pedidos_web r
  where r.fecha = new.fecha_entrega and r.estado = 'PENDIENTE'
    and r.expira_en > now() and (v_reference is null or r.referencia <> v_reference);

  if v_orders + v_reserved >= v_max then
    raise exception 'La fecha seleccionada ya alcanzó el máximo de pedidos diarios de CUPISSA.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_cupissa_validar_cupo_diario on public.pedidos_web;
create trigger trg_cupissa_validar_cupo_diario
before insert or update of fecha_entrega, tipo_pedido, estado on public.pedidos_web
for each row execute function public.cupissa_validar_cupo_diario_pedido();

-- Métricas reales: visitantes activos (últimos 5 minutos) y unidades compradas hoy.
create table if not exists public.producto_vistas_web (
  producto_id text not null,
  visitante_id text not null,
  ultima_vista timestamptz not null default now(),
  primary key (producto_id, visitante_id)
);
create index if not exists idx_producto_vistas_web_actividad
  on public.producto_vistas_web (producto_id, ultima_vista desc);
alter table public.producto_vistas_web enable row level security;
grant all on public.producto_vistas_web to service_role;

create or replace function public.cupissa_registrar_actividad_productos_web(
  p_product_ids text[],
  p_visitante_id text
)
returns table (product_id text, personas_viendo bigint, comprados_hoy bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_start timestamptz;
  v_end timestamptz;
begin
  if coalesce(trim(p_visitante_id), '') = '' or length(p_visitante_id) > 100 then
    raise exception 'Identificador de visitante no válido.';
  end if;
  v_start := ((now() at time zone 'America/Bogota')::date::timestamp at time zone 'America/Bogota');
  v_end := v_start + interval '1 day';

  for v_id in select distinct unnest(coalesce(p_product_ids, '{}'::text[])) loop
    if v_id is null or trim(v_id) = '' then continue; end if;
    insert into public.producto_vistas_web (producto_id, visitante_id, ultima_vista)
    values (v_id, p_visitante_id, now())
    on conflict (producto_id, visitante_id) do update set ultima_vista = excluded.ultima_vista;

    product_id := v_id;
    select count(distinct v.visitante_id) into personas_viendo
    from public.producto_vistas_web v
    where v.producto_id = v_id and v.ultima_vista >= now() - interval '5 minutes';

    select coalesce(sum(greatest(case when coalesce(item->>'cantidad', '') ~ '^[0-9]+$' then (item->>'cantidad')::integer else 1 end, 0)), 0)::bigint
    into comprados_hoy
    from public.pedidos_web p
    cross join lateral jsonb_array_elements(coalesce(p.productos, '[]'::jsonb)) as item
    where coalesce(p.estado, '') <> 'CANCELADO'
      and p.created_at >= v_start and p.created_at < v_end
      and coalesce(item->>'producto_id', item->>'productId', '') = v_id;

    return next;
  end loop;
end;
$$;

-- Solo los endpoints de servidor pueden crear, liberar o confirmar reservas.
revoke all on function public.cupissa_reservar_cupo_pedido(date, text) from public, anon, authenticated;
revoke all on function public.cupissa_liberar_cupo_pedido(text) from public, anon, authenticated;
revoke all on function public.cupissa_confirmar_cupo_pedido(text) from public, anon, authenticated;
grant execute on function public.cupissa_reservar_cupo_pedido(date, text) to service_role;
grant execute on function public.cupissa_liberar_cupo_pedido(text) to service_role;
grant execute on function public.cupissa_confirmar_cupo_pedido(text) to service_role;
revoke all on function public.cupissa_fechas_sin_cupo(date, date) from public;
grant execute on function public.cupissa_fechas_sin_cupo(date, date) to anon, authenticated, service_role;
revoke all on function public.cupissa_registrar_actividad_productos_web(text[], text) from public;
grant execute on function public.cupissa_registrar_actividad_productos_web(text[], text) to anon, authenticated, service_role;


-- CUPISSA: temporada destacada seleccionada desde el administrador.
CREATE TABLE IF NOT EXISTS public.configuracion_destacados_web (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  temporada_destacada text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.configuracion_destacados_web (id, temporada_destacada)
VALUES (1, NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.configuracion_destacados_web ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS configuracion_destacados_web_read ON public.configuracion_destacados_web;
CREATE POLICY configuracion_destacados_web_read
ON public.configuracion_destacados_web
FOR SELECT TO anon, authenticated
USING (true);

GRANT SELECT ON public.configuracion_destacados_web TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.configuracion_destacados_web TO service_role;

-- Métricas individuales por producto: visitantes únicos activos en los últimos 15 minutos
-- y unidades incluidas en pedidos no cancelados creados hoy en horario de Bogotá.
CREATE TABLE IF NOT EXISTS public.producto_vistas_web (
  producto_id text NOT NULL,
  visitante_id text NOT NULL,
  ultima_vista timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (producto_id, visitante_id)
);

CREATE INDEX IF NOT EXISTS idx_producto_vistas_web_actividad
ON public.producto_vistas_web (producto_id, ultima_vista DESC);

ALTER TABLE public.producto_vistas_web ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.producto_vistas_web TO service_role;

CREATE OR REPLACE FUNCTION public.cupissa_registrar_actividad_productos_web(
  p_product_ids text[],
  p_visitante_id text
)
RETURNS TABLE (
  product_id text,
  personas_viendo bigint,
  comprados_hoy bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id text;
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF COALESCE(TRIM(p_visitante_id), '') = '' OR LENGTH(p_visitante_id) > 100 THEN
    RAISE EXCEPTION 'Identificador de visitante no válido.';
  END IF;

  v_start := ((now() AT TIME ZONE 'America/Bogota')::date::timestamp AT TIME ZONE 'America/Bogota');
  v_end := v_start + interval '1 day';

  FOR v_id IN
    SELECT DISTINCT UNNEST(COALESCE(p_product_ids, '{}'::text[]))
  LOOP
    IF v_id IS NULL OR TRIM(v_id) = '' THEN
      CONTINUE;
    END IF;

    INSERT INTO public.producto_vistas_web (producto_id, visitante_id, ultima_vista)
    VALUES (v_id, p_visitante_id, now())
    ON CONFLICT (producto_id, visitante_id)
    DO UPDATE SET ultima_vista = EXCLUDED.ultima_vista;

    product_id := v_id;

    SELECT COUNT(DISTINCT v.visitante_id)
    INTO personas_viendo
    FROM public.producto_vistas_web v
    WHERE v.producto_id = v_id
      AND v.ultima_vista >= now() - interval '15 minutes';

    SELECT COALESCE(
      SUM(GREATEST(
        CASE
          WHEN COALESCE(item->>'cantidad', '') ~ '^[0-9]+$'
            THEN (item->>'cantidad')::integer
          ELSE 1
        END, 0
      )), 0
    )::bigint
    INTO comprados_hoy
    FROM public.pedidos_web p
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.productos, '[]'::jsonb)) AS item
    WHERE COALESCE(p.estado, '') <> 'CANCELADO'
      AND COALESCE(p.tipo_pedido, 'VENTA') = 'VENTA'
      AND p.created_at >= v_start
      AND p.created_at < v_end
      AND COALESCE(item->>'producto_id', item->>'productId', '') = v_id;

    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.cupissa_registrar_actividad_productos_web(text[], text) FROM public;
GRANT EXECUTE ON FUNCTION public.cupissa_registrar_actividad_productos_web(text[], text) TO anon, authenticated, service_role;
