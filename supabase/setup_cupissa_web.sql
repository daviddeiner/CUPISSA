-- CUPISSA WEB | Módulos de perfil, clientes web y pedidos web
-- Ejecutar en Supabase SQL Editor después de crear/configurar el usuario administrador.
-- No contiene claves ni contraseñas.

create extension if not exists pgcrypto;

-- Administradores autorizados del panel (auth.users se administra desde Supabase Auth).
create table if not exists public.usuarios_admin (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.is_cupissa_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
set row_security = off
as $$
  select exists (
    select 1 from public.usuarios_admin ua
    where ua.user_id = auth.uid() and ua.activo = true
  );
$$;
revoke all on function public.is_cupissa_admin() from public;
grant execute on function public.is_cupissa_admin() to authenticated;

-- Perfil de cliente: el identificador auth_user_id enlaza el perfil con Supabase Auth.
create table if not exists public.clientes_web (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  nombres text not null,
  apellidos text not null,
  telefono text not null unique,
  correo text,
  direccion text,
  barrio text,
  ciudad text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Numeración CUP0001, CUP0002, ... asignada en la base de datos para evitar duplicados.
create sequence if not exists public.pedidos_web_numero_seq start with 1 increment by 1;
create or replace function public.generar_codigo_pedido_web()
returns text
language sql
volatile
set search_path = public
as $$
  select 'CUP' || lpad(nextval('public.pedidos_web_numero_seq')::text, 4, '0');
$$;

create table if not exists public.pedidos_web (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default public.generar_codigo_pedido_web(),
  cliente_id uuid not null references public.clientes_web(id) on delete restrict,
  tipo_pedido text not null default 'VENTA' check (tipo_pedido in ('VENTA','ALQUILER')),
  fecha_entrega date,
  cliente_nombre text not null,
  telefono text not null,
  direccion text,
  barrio text,
  ciudad text,
  total numeric(14,2) not null default 0 check (total >= 0),
  envio numeric(14,2) not null default 0 check (envio >= 0),
  anticipo numeric(14,2) not null default 0 check (anticipo >= 0),
  restante numeric(14,2) generated always as (greatest(total + envio - anticipo, 0)) stored,
  productos jsonb not null default '[]'::jsonb check (jsonb_typeof(productos) = 'array'),
  estado text not null default 'AGENDADO' check (estado in ('AGENDADO','EN FABRICACIÓN','EN DEPARTAMENTO DE DESPACHO','EN CAMINO','ENTREGADO','CANCELADO')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clientes_web_auth_user on public.clientes_web(auth_user_id);
create index if not exists idx_clientes_web_telefono on public.clientes_web(telefono);
create index if not exists idx_pedidos_web_cliente on public.pedidos_web(cliente_id);
create index if not exists idx_pedidos_web_fecha on public.pedidos_web(fecha_entrega);
create index if not exists idx_pedidos_web_estado on public.pedidos_web(estado);

create or replace function public.set_updated_at_cupissa_web()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists trg_clientes_web_updated_at on public.clientes_web;
create trigger trg_clientes_web_updated_at before update on public.clientes_web
for each row execute function public.set_updated_at_cupissa_web();
drop trigger if exists trg_pedidos_web_updated_at on public.pedidos_web;
create trigger trg_pedidos_web_updated_at before update on public.pedidos_web
for each row execute function public.set_updated_at_cupissa_web();

-- RLS: acceso por propietario y administradores autenticados.
alter table public.usuarios_admin enable row level security;
alter table public.clientes_web enable row level security;
alter table public.pedidos_web enable row level security;

-- usuarios_admin: cada administrador puede consultar su propia autorización.
drop policy if exists usuarios_admin_read_self on public.usuarios_admin;
create policy usuarios_admin_read_self on public.usuarios_admin
for select to authenticated using (user_id = auth.uid() or public.is_cupissa_admin());
drop policy if exists usuarios_admin_manage on public.usuarios_admin;
create policy usuarios_admin_manage on public.usuarios_admin
for all to authenticated using (public.is_cupissa_admin()) with check (public.is_cupissa_admin());

-- Clientes: al registrarse sólo pueden crear/leer/editar su propio perfil.
drop policy if exists clientes_web_read_owner_or_admin on public.clientes_web;
create policy clientes_web_read_owner_or_admin on public.clientes_web
for select to authenticated using (auth_user_id = auth.uid() or public.is_cupissa_admin());
drop policy if exists clientes_web_insert_owner on public.clientes_web;
create policy clientes_web_insert_owner on public.clientes_web
for insert to authenticated with check (
  auth_user_id = auth.uid()
  and right(regexp_replace(coalesce(telefono,''), '[^0-9]', '', 'g'), 10) =
      right(regexp_replace(coalesce(auth.jwt()->'user_metadata'->>'telefono',''), '[^0-9]', '', 'g'), 10)
);
drop policy if exists clientes_web_update_owner_or_admin on public.clientes_web;
create policy clientes_web_update_owner_or_admin on public.clientes_web
for update to authenticated using (auth_user_id = auth.uid() or public.is_cupissa_admin())
with check (auth_user_id = auth.uid() or public.is_cupissa_admin());
drop policy if exists clientes_web_delete_admin on public.clientes_web;
create policy clientes_web_delete_admin on public.clientes_web
for delete to authenticated using (public.is_cupissa_admin());

-- El teléfono del perfil debe coincidir con el teléfono ya verificado por Supabase Auth.
-- Así una llamada directa a la API no permite cambiarlo sin completar el OTP del nuevo número.
create or replace function public.validar_telefono_verificado_cliente_web()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare telefono_auth text;
begin
  if auth.uid() is null or public.is_cupissa_admin() then
    return new;
  end if;
  select u.phone into telefono_auth from auth.users u where u.id = new.auth_user_id;
  if right(regexp_replace(coalesce(telefono_auth,''), '[^0-9]', '', 'g'), 10)
     <> right(regexp_replace(coalesce(new.telefono,''), '[^0-9]', '', 'g'), 10) then
    raise exception 'El teléfono debe verificarse mediante el código SMS de Supabase Auth.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_clientes_web_telefono_verificado on public.clientes_web;
create trigger trg_clientes_web_telefono_verificado
before insert or update of telefono, auth_user_id on public.clientes_web
for each row execute function public.validar_telefono_verificado_cliente_web();

-- Pedidos: el cliente únicamente consulta pedidos asociados a su perfil.
drop policy if exists pedidos_web_read_owner_or_admin on public.pedidos_web;
create policy pedidos_web_read_owner_or_admin on public.pedidos_web
for select to authenticated using (
  public.is_cupissa_admin() or exists (
    select 1 from public.clientes_web cw
    where cw.id = pedidos_web.cliente_id and cw.auth_user_id = auth.uid()
  )
);
drop policy if exists pedidos_web_manage_admin on public.pedidos_web;
create policy pedidos_web_manage_admin on public.pedidos_web
for all to authenticated using (public.is_cupissa_admin()) with check (public.is_cupissa_admin());

-- Tablas actuales: acceso administrativo a clientes/créditos y lectura pública de productos.
-- Los clientes autenticados pueden leer únicamente su registro antiguo por teléfono,
-- para conservar la visualización de créditos que ya existían antes del nuevo Perfil.
do $$
begin
  if to_regclass('public.clientes') is not null then
    execute 'alter table public.clientes enable row level security';
    execute 'drop policy if exists clientes_admin_all on public.clientes';
    execute 'create policy clientes_admin_all on public.clientes for all to authenticated using (public.is_cupissa_admin()) with check (public.is_cupissa_admin())';
    execute 'drop policy if exists clientes_read_own_phone on public.clientes';
    execute $p$create policy clientes_read_own_phone on public.clientes for select to authenticated using (right(regexp_replace(coalesce(telefono::text,''), '[^0-9]', '', 'g'), 10) = right(regexp_replace(coalesce(auth.jwt()->'user_metadata'->>'telefono',''), '[^0-9]', '', 'g'), 10))$p$;
    execute 'grant select, insert, update, delete on public.clientes to authenticated';
  end if;
  if to_regclass('public.creditos') is not null then
    execute 'alter table public.creditos enable row level security';
    execute 'drop policy if exists creditos_admin_all on public.creditos';
    execute 'create policy creditos_admin_all on public.creditos for all to authenticated using (public.is_cupissa_admin()) with check (public.is_cupissa_admin())';
    execute $p$create policy creditos_read_own on public.creditos for select to authenticated using (exists (select 1 from public.clientes c where c.id::text = creditos.cliente_id::text and right(regexp_replace(coalesce(c.telefono::text,''), '[^0-9]', '', 'g'), 10) = right(regexp_replace(coalesce(auth.jwt()->'user_metadata'->>'telefono',''), '[^0-9]', '', 'g'), 10)))$p$;
    execute 'grant select, insert, update, delete on public.creditos to authenticated';
  end if;
  if to_regclass('public.productos') is not null then
    execute 'alter table public.productos enable row level security';
    execute 'drop policy if exists productos_public_read on public.productos';
    execute 'create policy productos_public_read on public.productos for select to anon, authenticated using (true)';
    execute 'drop policy if exists productos_admin_write on public.productos';
    execute 'create policy productos_admin_write on public.productos for all to authenticated using (public.is_cupissa_admin()) with check (public.is_cupissa_admin())';
    execute 'grant select on public.productos to anon, authenticated';
    execute 'grant insert, update, delete on public.productos to authenticated';
  end if;
end $$;


-- Registro idempotente de transacciones Wompi verificadas en backend.
create table if not exists public.pagos_web (
  id uuid primary key default gen_random_uuid(),
  wompi_transaction_id text not null unique,
  cliente_id text not null,
  telefono text not null,
  referencia text not null,
  monto numeric(14,2) not null check (monto > 0),
  estado text not null default 'PROCESANDO' check (estado in ('PROCESANDO','APLICADO','ERROR')),
  datos jsonb not null default '{}'::jsonb,
  error_detalle text,
  aplicado_en timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_pagos_web_cliente on public.pagos_web(cliente_id);
alter table public.pagos_web enable row level security;
drop policy if exists pagos_web_read_owner_or_admin on public.pagos_web;
create policy pagos_web_read_owner_or_admin on public.pagos_web
for select to authenticated using (
  public.is_cupissa_admin() or
  right(regexp_replace(coalesce(telefono,''), '[^0-9]', '', 'g'), 10) =
  right(regexp_replace(coalesce(auth.jwt()->'user_metadata'->>'telefono',''), '[^0-9]', '', 'g'), 10)
);
drop policy if exists pagos_web_admin_manage on public.pagos_web;
create policy pagos_web_admin_manage on public.pagos_web
for all to authenticated using (public.is_cupissa_admin()) with check (public.is_cupissa_admin());

-- Permisos básicos de tabla. RLS continúa filtrando los registros.
grant select, insert, update, delete on public.usuarios_admin to authenticated;
grant select, insert, update, delete on public.clientes_web to authenticated;
grant select, insert, update, delete on public.pedidos_web to authenticated;
grant select, insert, update, delete on public.pagos_web to authenticated;
grant usage, select on sequence public.pedidos_web_numero_seq to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Fotos de los productos de los pedidos. El bucket es público para que se vean
-- las fotos asociadas al pedido; sólo los administradores autenticados pueden subir/borrar.
insert into storage.buckets (id, name, public)
values ('pedidos-web', 'pedidos-web', true)
on conflict (id) do update set public = true;
drop policy if exists pedidos_web_images_public_read on storage.objects;
create policy pedidos_web_images_public_read on storage.objects
for select to anon, authenticated using (bucket_id = 'pedidos-web');
drop policy if exists pedidos_web_images_admin_insert on storage.objects;
create policy pedidos_web_images_admin_insert on storage.objects
for insert to authenticated with check (bucket_id = 'pedidos-web' and public.is_cupissa_admin());
drop policy if exists pedidos_web_images_admin_update on storage.objects;
create policy pedidos_web_images_admin_update on storage.objects
for update to authenticated using (bucket_id = 'pedidos-web' and public.is_cupissa_admin())
with check (bucket_id = 'pedidos-web' and public.is_cupissa_admin());
drop policy if exists pedidos_web_images_admin_delete on storage.objects;
create policy pedidos_web_images_admin_delete on storage.objects
for delete to authenticated using (bucket_id = 'pedidos-web' and public.is_cupissa_admin());

-- Después de crear el usuario administrador desde Authentication > Users,
-- autorízalo ejecutando (ajusta el correo):
-- insert into public.usuarios_admin(user_id,email)
-- select id,email from auth.users where email = 'contactocupissa@gmail.com'
-- on conflict (user_id) do update set activo = true;
