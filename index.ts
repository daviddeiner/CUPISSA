import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cupissa-hook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const hookSecret = Deno.env.get('CUPISSA_EMAIL_HOOK_SECRET')!;
const mailerUrl = Deno.env.get('CUPISSA_MAILER_URL')!;
const mailerSecret = Deno.env.get('CUPISSA_MAILER_SECRET')!;
const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' } as Record<string, string>)[c]);
const money = (v: unknown) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(v || 0));
const todayBogota = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);

async function deliver(message: { to: string; subject: string; html: string; text: string; idempotencyKey: string }) {
  const response = await fetch(mailerUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cupissa-mailer-secret': mailerSecret },
    body: JSON.stringify({ ...message, fromName: 'CUPISSA', secret: mailerSecret }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Mailer rechazó el envío (${response.status}): ${body.slice(0, 300)}`);
  let result: Record<string, unknown> = {};
  try { result = JSON.parse(body); } catch { throw new Error('El servicio de correo devolvió una respuesta inválida.'); }
  if (result.ok !== true) throw new Error(`Mailer no confirmó el envío: ${String(result.error || 'error desconocido')}`);
  return result;
}

async function getOrderEmail(source: 'pedidos' | 'pedidos_web', record: Record<string, unknown>) {
  let email = String(record.correo_cliente || '').trim();
  let name = String(record.nombre_cliente || record.cliente_nombre || 'Cliente CUPISSA').trim();
  if (source === 'pedidos_web') {
    const webId = record.cliente_web_id ? String(record.cliente_web_id) : '';
    const legacyId = record.cliente_id ? String(record.cliente_id) : '';
    if (!email && webId) {
      const { data } = await db.from('clientes_web').select('correo,nombres,apellidos').eq('id', webId).maybeSingle();
      if (data) { email = String(data.correo || '').trim(); name = `${data.nombres || ''} ${data.apellidos || ''}`.trim() || name; }
    }
    if (!email && legacyId) {
      const { data } = await db.from('clientes').select('correo,nombre').eq('id', legacyId).maybeSingle();
      if (data) { email = String(data.correo || '').trim(); name = String(data.nombre || name); }
    }
  }
  return { email, name };
}

async function sendOrderConfirmation(payload: Record<string, unknown>) {
  const source = payload.source === 'pedidos' ? 'pedidos' : 'pedidos_web';
  const record = (payload.record && typeof payload.record === 'object' ? payload.record : {}) as Record<string, unknown>;
  const { email, name } = await getOrderEmail(source, record);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: true, skipped: true, reason: 'El pedido no tiene un correo válido asociado.' };

  const orderNo = record.numero_pedido || record.id || '—';
  const date = record.fecha_entrega || record.fecha_pedido || record.created_at || '';
  const total = source === 'pedidos' ? record.total_pedido : record.total;
  const advance = source === 'pedidos' ? record.valor_anticipo : record.anticipo;
  const description = source === 'pedidos' ? record.descripcion : record.productos;
  const detail = typeof description === 'string' ? description : JSON.stringify(description || '');
  const subject = `CUPISSA | Confirmación de pedido ${orderNo}`;
  const html = `<div style="font-family:Arial,sans-serif;color:#202124;max-width:640px;margin:auto"><div style="background:#111827;color:#fff;padding:22px;text-align:center"><h1 style="margin:0;letter-spacing:2px">CUPISSA</h1></div><div style="padding:26px"><h2>¡Tu pedido ha sido registrado!</h2><p>Hola ${esc(name)}, recibimos tu pedido y quedó registrado correctamente en CUPISSA.</p><p><b>Número de pedido:</b> ${esc(orderNo)}<br><b>Fecha:</b> ${esc(date || 'Por confirmar')}<br><b>Estado:</b> ${esc(record.estado || 'Registrado')}</p>${detail ? `<p><b>Detalle:</b><br>${esc(detail)}</p>` : ''}<p><b>Total:</b> ${esc(money(total))}<br><b>Anticipo:</b> ${esc(money(advance))}</p><p>Si necesitas ayuda, responde a este correo o comunícate con nuestro equipo.</p><p>Gracias por elegir CUPISSA.</p></div></div>`;
  return await deliver({ to: email, subject, html, text: `Hola ${name}. Tu pedido ${orderNo} fue registrado en CUPISSA. Total: ${money(total)}. Anticipo: ${money(advance)}.`, idempotencyKey: `order:${source}:${String(record.id || orderNo)}` });
}

async function sendCreditReminders() {
  const today = todayBogota();
  const { data, error } = await db.from('creditos')
    .select('id,cliente_id,deuda_actual,valor_cuota,proximo_vencimiento,estado,clientes!inner(id,nombre,correo,telefono)')
    .eq('estado', 'ACTIVO').gt('deuda_actual', 0);
  if (error) throw error;
  const results = { scanned: data?.length || 0, sent: 0, skipped: 0, errors: [] as string[] };

  for (const credit of data || []) {
    const due = String(credit.proximo_vencimiento || '');
    if (!due) { results.skipped++; continue; }
    const days = dayDiff(today, due); // positivo: faltan días; negativo: vencido
    let kind = '';
    if (days === 3) kind = 'before_3_days';
    else if (days === 0) kind = 'due_today';
    else if (days <= -1 && ((Math.abs(days) - 1) % 7 === 0)) kind = `overdue_day_${Math.abs(days)}`;
    else { results.skipped++; continue; }

    const client = Array.isArray(credit.clientes) ? credit.clientes[0] : credit.clientes;
    const email = String(client?.correo || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { results.skipped++; continue; }
    const name = String(client?.nombre || 'Cliente CUPISSA');
    const overdue = days < 0;
    const subject = overdue
      ? `CUPISSA | Recordatorio de cuota vencida - Crédito ${credit.id}`
      : days === 0 ? 'CUPISSA | Tu cuota vence hoy' : 'CUPISSA | Tu cuota vence en 3 días';
    const message = overdue
      ? `Tu cuota tiene ${Math.abs(days)} día(s) de vencida. Te invitamos a ponerte al día para evitar que la obligación continúe pendiente.`
      : days === 0 ? 'Te recordamos que tu cuota de Crédito CUPISSA vence hoy.' : 'Te recordamos que tu próxima cuota de Crédito CUPISSA vence dentro de 3 días.';
    const html = `<div style="font-family:Arial,sans-serif;color:#202124;max-width:640px;margin:auto"><div style="background:#111827;color:#fff;padding:22px;text-align:center"><h1 style="margin:0;letter-spacing:2px">CUPISSA</h1></div><div style="padding:26px"><h2>${overdue ? 'Tu cuota está pendiente' : 'Recordatorio de tu cuota'}</h2><p>Hola ${esc(name)},</p><p>${esc(message)}</p><p><b>Fecha de vencimiento:</b> ${esc(due)}<br><b>Valor de la cuota:</b> ${esc(money(credit.valor_cuota))}<br><b>Saldo actual del crédito:</b> ${esc(money(credit.deuda_actual))}</p><p>Si ya realizaste el pago, puedes ignorar este mensaje mientras se actualiza tu crédito.</p><p>Equipo CUPISSA</p></div></div>`;
    try {
      await deliver({ to: email, subject, html, text: `Hola ${name}. ${message} Vencimiento: ${due}. Valor cuota: ${money(credit.valor_cuota)}. Saldo: ${money(credit.deuda_actual)}.`, idempotencyKey: `credit:${credit.id}:${due}:${kind}` });
      results.sent++;
    } catch (e) { results.errors.push(`${credit.id}: ${String(e)}`); }
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return Response.json({ error: 'Método no permitido' }, { status: 405, headers: cors });
  if (!hookSecret || req.headers.get('x-cupissa-hook-secret') !== hookSecret) return Response.json({ error: 'No autorizado' }, { status: 401, headers: cors });
  try {
    const body = await req.json();
    let result;
    if (body.action === 'daily_credit_reminders') result = await sendCreditReminders();
    else if (body.action === 'order_confirmation') result = await sendOrderConfirmation(body);
    else return Response.json({ error: 'Acción no reconocida' }, { status: 400, headers: cors });
    return Response.json({ ok: true, result }, { headers: cors });
  } catch (error) {
    console.error('[cupissa-emails]', error);
    return Response.json({ error: 'No fue posible completar el envío', detail: String(error) }, { status: 500, headers: cors });
  }
});
