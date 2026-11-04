/* CUPISSA | Perfil de clientes. Comparte la sesión legada con el Portal de Pagos. */
(() => {
  const $ = id => document.getElementById(id);
  const clientDb = (typeof supabaseClient !== 'undefined') ? supabaseClient : null;
  const money = value => '$ ' + new Intl.NumberFormat('es-CO').format(Number(value || 0));
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const profileStatuses = ['AGENDADO','EN FABRICACIÓN','EN DEPARTAMENTO DE DESPACHO','EN CAMINO','ENTREGADO','CANCELADO'];
  let currentClient = null;
  let currentProfile = null;
  let captchaCode = '';

  function showMessage(id, message, success = false) {
    const el = $(id); if (!el) return;
    el.textContent = message; el.classList.remove('hidden','error','success'); el.classList.add(success ? 'success' : 'error');
  }
  function hideMessage(id) { const el = $(id); if (el) el.classList.add('hidden'); }
  function parseSession() {
    try { return JSON.parse(localStorage.getItem('cupissa_client_session') || 'null'); } catch (_) { return null; }
  }
  function splitName(full = '') {
    const bits = String(full).trim().split(/\s+/).filter(Boolean);
    return { nombres: bits.shift() || '', apellidos: bits.join(' ') };
  }
  function setSession(client) {
    currentClient = client;
    localStorage.setItem('cupissa_client_session', JSON.stringify(client));
  }
  function showAccount() {
    $('profile-auth-section').classList.add('hidden');
    $('profile-account-section').classList.remove('hidden');
  }
  function showAuth() {
    $('profile-account-section').classList.add('hidden');
    $('profile-auth-section').classList.remove('hidden');
  }
  function renderProfile() {
    if (!currentClient || !currentProfile) return;
    const fullName = [currentProfile.nombres, currentProfile.apellidos].filter(Boolean).join(' ').toLocaleUpperCase('es-CO');
    $('profile-heading-name').textContent = fullName || String(currentClient.nombre || 'Mi perfil').toLocaleUpperCase('es-CO');
    $('profile-heading-phone').textContent = currentProfile.telefono || currentClient.telefono || '';
    $('profile-avatar').textContent = (currentProfile.nombres || currentClient.nombre || 'CU').slice(0,2).toUpperCase();
    const fields = [
      ['Nombres', String(currentProfile.nombres || '').toLocaleUpperCase('es-CO')], ['Apellidos', String(currentProfile.apellidos || '').toLocaleUpperCase('es-CO')], ['Teléfono', currentProfile.telefono],
      ['Correo', String(currentProfile.correo || '').toLowerCase()], ['Dirección', String(currentProfile.direccion || '').toLocaleUpperCase('es-CO')], ['Barrio', String(currentProfile.barrio || '').toLocaleUpperCase('es-CO')], ['Ciudad', String(currentProfile.ciudad || '').toLocaleUpperCase('es-CO')]
    ];
    $('profile-data-view').innerHTML = fields.map(([label,value]) => `<div class="profile-field"><span>${safe(label)}</span><strong>${safe(value || 'No registrado')}</strong></div>`).join('');
    $('locked-profile-name').textContent = fullName || String(currentClient.nombre || '—').toLocaleUpperCase('es-CO');
    $('locked-profile-phone').textContent = currentProfile.telefono || currentClient.telefono || '—';
    $('edit-correo').value = String(currentProfile.correo || '').toLowerCase();
    $('edit-direccion').value = String(currentProfile.direccion || '').toLocaleUpperCase('es-CO');
    $('edit-barrio').value = String(currentProfile.barrio || '').toLocaleUpperCase('es-CO');
    $('edit-ciudad').value = String(currentProfile.ciudad || '').toLocaleUpperCase('es-CO');
    const phone = currentProfile.telefono || currentClient.telefono || '';
    const identityChange = $('profile-request-identity-change');
    if (identityChange) {
      const requestText = `Hola CUPISSA, solicito actualizar los datos fijos de mi cuenta. Nombre registrado: ${fullName || currentClient.nombre || 'No indicado'}. Teléfono registrado: ${phone || 'No indicado'}. Por favor, indíquenme el proceso para solicitar el cambio.`;
      identityChange.href = `https://wa.me/${window.CUPISSA_WHATSAPP || '573245680018'}?text=${encodeURIComponent(requestText)}`;
    }
    $('forgot-password-link').href = `https://wa.me/${window.CUPISSA_WHATSAPP || '573245680018'}?text=${encodeURIComponent(`Hola CUPISSA, solicito ayuda para cambiar la contraseña de mi cuenta. Mi teléfono registrado es ${phone}.`)}`;
  }
  async function ensureProfile(client) {
    const { data, error } = await clientDb.from('clientes_web').select('*').eq('cliente_id', String(client.id)).maybeSingle();
    if (error) throw error;
    if (data) return data;
    // Compatibilidad con perfiles creados antes de enlazar la tabla clientes antigua.
    const byPhone = await clientDb.from('clientes_web').select('*').eq('telefono', client.telefono || '').maybeSingle();
    if (byPhone.error) throw byPhone.error;
    if (byPhone.data) {
      const linked = await clientDb.from('clientes_web').update({ cliente_id: String(client.id) }).eq('id', byPhone.data.id).select('*').single();
      if (linked.error) throw linked.error;
      return linked.data;
    }
    const parsed = splitName(client.nombre || '');
    const newProfile = {
      cliente_id: String(client.id),
      nombres: parsed.nombres,
      apellidos: parsed.apellidos,
      telefono: client.telefono || '',
      correo: client.correo || '',
      direccion: '', barrio: '', ciudad: ''
    };
    const inserted = await clientDb.from('clientes_web').insert([newProfile]).select('*').single();
    if (inserted.error) throw inserted.error;
    return inserted.data;
  }
  async function loadProfile(client) {
    currentProfile = await ensureProfile(client);
    setSession(client);
    renderProfile(); showAccount();
    await loadOrders();
    const requestedOrder = new URLSearchParams(location.search).get('pedidoId');
    if (requestedOrder) {
      const found = (window.__cupissaWebOrders || []).find(order => String(order.id) === String(requestedOrder));
      if (found) {
        document.getElementById('tus-pedidos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.openProfileOrder(found.id);
      }
    }
    redirectToCheckoutIfRequested();
  }


  function redirectToCheckoutIfRequested() {
    const params = new URLSearchParams(location.search);
    if (params.get('next') !== 'checkout') return;
    if (params.get('embedded') === '1' && window.parent !== window) {
      window.parent.postMessage({ type: 'CUPISSA_PROFILE_CHECKOUT' }, location.origin);
    } else {
      location.href = '/checkout';
    }
  }

  window.showAuthMode = function(mode) {
    const login = mode === 'login';
    $('profile-login-form').classList.toggle('hidden', !login);
    $('profile-register-form').classList.toggle('hidden', login);
    $('auth-login-tab').classList.toggle('active', login);
    $('auth-register-tab').classList.toggle('active', !login);
    hideMessage('profile-login-error'); hideMessage('profile-register-error');
  };

  window.loginProfile = async function(event) {
    event.preventDefault(); hideMessage('profile-login-error');
    const phone = $('login-phone-profile').value.trim();
    const password = $('login-password-profile').value;
    const button = $('profile-login-form').querySelector('button[type="submit"]');
    button.disabled = true; button.classList.add('opacity-60');
    try {
      const { data, error } = await clientDb.from('clientes').select('*').eq('telefono', phone).eq('password', password).maybeSingle();
      if (error) throw error;
      if (!data) { showMessage('profile-login-error','Teléfono o contraseña incorrectos.'); return; }
      await loadProfile(data);
    } catch (error) {
      console.error('Error al iniciar sesión CUPISSA:', error);
      showMessage('profile-login-error','No fue posible ingresar. Verifica tu conexión e inténtalo nuevamente.');
    } finally { button.disabled = false; button.classList.remove('opacity-60'); }
  };

  function drawCaptcha() {
    const canvas = $('profile-captcha-canvas'); if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    captchaCode = Array.from({length:6}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
    ctx.clearRect(0,0,canvas.width,canvas.height); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
    for (let i=0;i<13;i++) { ctx.strokeStyle = `rgba(${130+Math.random()*100|0},${90+Math.random()*100|0},${140+Math.random()*90|0},.35)`; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(Math.random()*canvas.width,Math.random()*canvas.height); ctx.lineTo(Math.random()*canvas.width,Math.random()*canvas.height); ctx.stroke(); }
    for (let i=0;i<90;i++) { ctx.fillStyle='rgba(190,24,93,.18)'; ctx.fillRect(Math.random()*canvas.width,Math.random()*canvas.height,1.5,1.5); }
    ctx.textBaseline = 'middle'; ctx.textAlign='center';
    [...captchaCode].forEach((ch,i) => { ctx.save(); ctx.translate(25+i*42,37+(Math.random()*9-4)); ctx.rotate((Math.random()-.5)*.28); ctx.font=`900 ${27+Math.random()*5|0}px Inter, sans-serif`; ctx.fillStyle = ['#9d174d','#be185d','#7e2255','#a21caf'][i%4]; ctx.fillText(ch,0,0); ctx.restore(); });
  }
  window.refreshProfileCaptcha = drawCaptcha;

  window.registerProfile = async function(event) {
    event.preventDefault(); hideMessage('profile-register-error'); hideMessage('profile-register-success');
    const nombres = $('reg-nombres').value.trim().toLocaleUpperCase('es-CO'); const apellidos = $('reg-apellidos').value.trim().toLocaleUpperCase('es-CO');
    const telefono = $('reg-telefono').value.trim(); const password = $('reg-password').value;
    const typedCaptcha = $('reg-captcha').value.trim().toUpperCase();
    if (typedCaptcha !== captchaCode) { showMessage('profile-register-error','Las letras y números no coinciden. Inténtalo nuevamente.'); drawCaptcha(); $('reg-captcha').value=''; return; }
    const button = $('profile-register-form').querySelector('button[type="submit"]');
    button.disabled = true; button.classList.add('opacity-60');
    try {
      const { data: existing, error: checkError } = await clientDb.from('clientes').select('id').eq('telefono', telefono).maybeSingle();
      if (checkError) throw checkError;
      if (existing) { showMessage('profile-register-error','Este teléfono ya está registrado. Inicia sesión con tu contraseña actual o solicita ayuda por WhatsApp.'); return; }
      const { data: client, error: createError } = await clientDb.from('clientes').insert([{ nombre: `${nombres} ${apellidos}`.trim(), telefono, password, cupo_total: 300000, cupo_disponible: 300000 }]).select('*').single();
      if (createError) throw createError;
      const { data: existingWebProfile, error: webCheckError } = await clientDb.from('clientes_web').select('*').eq('telefono', telefono).maybeSingle();
      if (webCheckError) throw webCheckError;
      let profile;
      if (existingWebProfile) {
        const linked = await clientDb.from('clientes_web').update({ cliente_id: String(client.id), nombres, apellidos, telefono }).eq('id', existingWebProfile.id).select('*').single();
        if (linked.error) throw linked.error;
        profile = linked.data;
      } else {
        const inserted = await clientDb.from('clientes_web').insert([{ cliente_id: String(client.id), nombres, apellidos, telefono, correo: '', direccion: '', barrio: '', ciudad: '' }]).select('*').single();
        if (inserted.error) throw inserted.error;
        profile = inserted.data;
      }
      currentProfile = profile; setSession(client); renderProfile(); showAccount(); await loadOrders(); redirectToCheckoutIfRequested();
    } catch (error) {
      console.error('Error al registrar cliente CUPISSA:', error);
      showMessage('profile-register-error', error?.message || 'No fue posible crear tu cuenta. Revisa los datos e inténtalo nuevamente.');
      drawCaptcha(); $('reg-captcha').value='';
    } finally { button.disabled = false; button.classList.remove('opacity-60'); }
  };

  window.toggleProfileEdit = function(show) {
    $('profile-data-view').classList.toggle('hidden', show);
    $('profile-edit-form').classList.toggle('hidden', !show);
    $('profile-edit-button').classList.toggle('hidden', show);
    hideMessage('profile-edit-error');
  };

  window.saveProfileChanges = async function(event) {
    event.preventDefault(); hideMessage('profile-edit-error');
    const values = {
      correo: $('edit-correo').value.trim().toLowerCase(),
      direccion: $('edit-direccion').value.trim().toLocaleUpperCase('es-CO'),
      barrio: $('edit-barrio').value.trim().toLocaleUpperCase('es-CO'),
      ciudad: $('edit-ciudad').value.trim().toLocaleUpperCase('es-CO')
    };
    try {
      if (values.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.correo)) throw new Error('Escribe un correo electrónico válido.');
      const { error: profileError } = await clientDb.from('clientes_web').update(values).eq('id', currentProfile.id);
      if (profileError) throw profileError;
      currentProfile = { ...currentProfile, ...values };
      renderProfile(); toggleProfileEdit(false);
    } catch (error) {
      console.error('Error actualizando perfil:', error);
      showMessage('profile-edit-error', error?.message || 'No se pudieron guardar los cambios.');
    }
  };

  async function loadOrders() {
    const container = $('profile-orders-list');
    if (!container || !currentProfile || !currentClient) return;

    container.innerHTML = '<div class="bg-white p-5 rounded-2xl text-sm text-slate-500">Cargando tus pedidos…</div>';

    // En pedidos_web hay dos relaciones distintas:
    // cliente_web_id -> clientes_web.id
    // cliente_id     -> clientes.id (cuenta antigua)
    // Los pedidos creados por versiones anteriores también pueden tener
    // ambas relaciones vacías; por eso se contempla el teléfono registrado.
    const queries = [];
    if (currentProfile.id) {
      queries.push(clientDb.from('pedidos_web').select('*')
        .eq('cliente_web_id', String(currentProfile.id))
        .order('created_at', { ascending: false }));
    }
    if (currentClient.id) {
      queries.push(clientDb.from('pedidos_web').select('*')
        .eq('cliente_id', String(currentClient.id))
        .order('created_at', { ascending: false }));
    }
    const phone = String(currentProfile.telefono || currentClient.telefono || '').trim();
    if (phone) {
      queries.push(clientDb.from('pedidos_web').select('*')
        .eq('telefono', phone)
        .order('created_at', { ascending: false }));
    }

    const results = await Promise.all(queries);
    const errors = results.filter(result => result.error).map(result => result.error);
    const successfulResults = results.filter(result => !result.error);

    // Solo mostrar error si ninguna consulta pudo ejecutarse.
    if (!successfulResults.length) {
      console.error('Error cargando pedidos CUPISSA:', errors);
      container.innerHTML = '<div class="bg-white p-5 rounded-2xl text-sm text-rose-600">No fue posible cargar tus pedidos. Inténtalo más tarde.</div>';
      return;
    }

    // Combinar por ID: evita duplicados si un pedido coincide por teléfono
    // y también por alguna de las relaciones de cliente.
    const ordersById = new Map();
    for (const result of successfulResults) {
      for (const order of (result.data || [])) {
        if (order && order.id) ordersById.set(String(order.id), order);
      }
    }
    const orders = [...ordersById.values()].sort((a, b) =>
      new Date(b.created_at || b.updated_at || 0).getTime() -
      new Date(a.created_at || a.updated_at || 0).getTime()
    );

    $('profile-orders-count').textContent = `${orders.length} pedido${orders.length === 1 ? '' : 's'}`;
    window.__cupissaWebOrders = orders;

    if (!orders.length) {
      // Dejar en consola información útil para distinguir ausencia real de
      // pedidos de un bloqueo por políticas RLS o por columnas inexistentes.
      if (errors.length) console.warn('Algunas búsquedas de pedidos fallaron:', errors);
      container.innerHTML = '<div class="bg-white p-7 rounded-2xl border border-slate-100 text-center"><i class="fa-solid fa-box-open text-3xl text-pink-200"></i><p class="font-bold text-slate-700 mt-3">Todavía no tienes pedidos registrados</p><p class="text-xs text-slate-400 mt-1">Si ya pagaste, verifica que el pedido tenga tu teléfono o tu identificador de cliente en pedidos_web.</p></div>';
      return;
    }

    container.innerHTML = orders.map(order => {
      const products = Array.isArray(order.productos) ? order.productos : [];

      // Las tarjetas deben combinar las fotos generales del pedido con las
      // fotos guardadas dentro de cada producto. En pedidos existentes,
      // order.imagenes puede ser [] aunque cada producto sí tenga imagen_url.
      const imageUrl = value => {
        if (!value) return '';
        if (typeof value === 'string') return value.trim();
        if (typeof value === 'object') {
          return String(
            value.url || value.imagen_url || value.src || value.path || value.publicUrl || ''
          ).trim();
        }
        return '';
      };
      const collectedPhotos = [];
      const addPhoto = value => {
        const url = imageUrl(value);
        if (url && !collectedPhotos.includes(url)) collectedPhotos.push(url);
      };

      if (Array.isArray(order.imagenes)) order.imagenes.forEach(addPhoto);
      else if (order.imagenes) addPhoto(order.imagenes);

      products.forEach(item => {
        if (!item || typeof item !== 'object') return;
        [
          item.imagen_url, item.imagen, item.foto_url, item.foto,
          item.image_url, item.image, item.url_imagen, item.url
        ].forEach(addPhoto);
        if (Array.isArray(item.imagenes)) item.imagenes.forEach(addPhoto);
        if (Array.isArray(item.fotos)) item.fotos.forEach(addPhoto);
      });

      const photos = collectedPhotos.slice(0, 4);
      const photoTiles = photos.length
        ? photos.map(url => `<img class="profile-order-photo" src="${safe(url)}" alt="Producto del pedido" loading="lazy" onerror="this.style.display='none'">`).join('')
        : '<div class="profile-order-photo grid place-items-center text-slate-300"><i class="fa-solid fa-image"></i></div>';
      const remaining = order.restante != null
        ? order.restante
        : Math.max(0, Number(order.total || 0) + Number(order.envio ?? order.domicilio_envio ?? 0) - Number(order.anticipo || 0));
      return `<button type="button" class="profile-order-card" onclick="openProfileOrder('${safe(order.id)}')"><div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div class="flex items-center gap-3 min-w-0"><div class="grid grid-cols-2 gap-1">${photoTiles}</div><div class="min-w-0"><p class="font-black text-slate-900">${safe(order.codigo || order.numero_pedido || 'Pedido CUP')}</p><p class="text-[11px] text-slate-400 mt-1">${products.length} producto(s) · ${safe(order.tipo_pedido || order.tipo_servicio || 'VENTA')}</p><p class="text-xs font-bold text-slate-700 mt-2">Restante: ${money(remaining)}</p></div></div><div class="flex sm:flex-col items-center sm:items-end justify-between gap-2"><span class="profile-status">${safe(order.estado || 'AGENDADO')}</span><span class="text-[10px] text-pink-600 font-black">Ver detalle <i class="fa-solid fa-chevron-right"></i></span></div></div></button>`;
    }).join('');
  }

  window.openProfileOrder = function(id) {
    const order = (window.__cupissaWebOrders || []).find(item => String(item.id) === String(id)); if (!order) return;
    const products = Array.isArray(order.productos) ? order.productos : [];
    const images = Array.isArray(order.imagenes) ? order.imagenes : [];
    $('profile-order-modal-title').textContent = order.codigo || order.numero_pedido || 'Detalle del pedido';
    $('profile-order-detail').innerHTML = `
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">${[['Tipo',order.tipo_pedido || order.tipo_servicio],['Fecha de entrega',order.fecha_entrega],['Estado',order.estado],['Total',money(order.total)],['Domicilio / envío',money(order.envio ?? order.domicilio_envio)],['Anticipo',money(order.anticipo)],['Restante',money(order.restante)],['Contacto',order.telefono || order.contacto],['Ubicación',[order.direccion,order.barrio,order.ciudad].filter(Boolean).join(', ') || order.ubicacion]].map(([a,b])=>`<div class="profile-field"><span>${safe(a)}</span><strong>${safe(b || '—')}</strong></div>`).join('')}</div>
      <h3 class="text-sm font-black text-slate-900 mb-3">Productos solicitados</h3>
      <div class="space-y-3">${products.map((p,i)=>`<div class="border border-slate-100 rounded-xl p-3 flex gap-3">${p.imagen_url?`<img src="${safe(p.imagen_url)}" class="w-20 h-20 rounded-lg object-cover">`:''}<div class="min-w-0 flex-1"><p class="font-black text-sm text-slate-900">${i+1}. ${safe(p.nombre || p.producto || 'Producto')}</p><p class="text-xs text-slate-500 mt-1">${safe(p.referencia || '')} · Talla: ${safe(p.talla || '—')} · Color: ${safe(p.color || '—')}</p><p class="text-xs text-slate-600 mt-1">Cantidad: ${safe(p.cantidad || 1)} · Precio: ${money(p.precio)}${p.dias_alquiler ? ` · Alquiler: ${safe(p.dias_alquiler)} día(s)` : ''}</p></div></div>`).join('') || '<p class="text-xs text-slate-400">Sin detalle de productos.</p>'}</div>
      ${images.length?`<h3 class="text-sm font-black text-slate-900 mt-5 mb-3">Fotografías del pedido</h3><div class="grid grid-cols-2 sm:grid-cols-4 gap-2">${images.map(url=>`<a href="${safe(url)}" target="_blank" rel="noopener"><img src="${safe(url)}" class="w-full aspect-square object-cover rounded-xl"></a>`).join('')}</div>`:''}`;
    $('profile-order-modal').classList.remove('hidden');
  };
  window.closeProfileOrder = () => $('profile-order-modal').classList.add('hidden');

  window.requestProfilePasswordChange = function(event) {
    event.preventDefault();
    const phone = $('login-phone-profile')?.value?.trim() || currentProfile?.telefono || currentClient?.telefono || '';
    const message = `Hola CUPISSA, solicito ayuda para cambiar la contraseña de mi cuenta. Mi teléfono registrado es ${phone || 'pendiente por confirmar'}.`;
    window.open(`https://wa.me/${window.CUPISSA_WHATSAPP || '573245680018'}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  };

  window.logoutProfile = function() {
    currentClient = null; currentProfile = null; localStorage.removeItem('cupissa_client_session');
    $('profile-account-section').classList.add('hidden'); showAuth(); showAuthMode('login'); $('profile-login-form').reset();
  };
  window.returnToCatalog = function() {
    if (new URLSearchParams(location.search).get('embedded') === '1' && window.parent !== window) {
      window.parent.postMessage({ type: 'CUPISSA_PROFILE_CLOSE' }, '*');
    } else { location.href = '/catalogo'; }
  };

  document.addEventListener('DOMContentLoaded', async () => {
    if (new URLSearchParams(location.search).get('embedded') === '1') document.body.classList.add('profile-embedded');
    drawCaptcha();
    document.querySelectorAll('#profile-register-form input:not([type=\"password\"]):not([type=\"email\"]), #profile-edit-form input:not([type=\"password\"]):not([type=\"email\"])').forEach(input => {
      input.setAttribute('autocapitalize', 'characters');
      input.addEventListener('input', () => {
        const start = input.selectionStart, end = input.selectionEnd;
        input.value = input.value.toLocaleUpperCase('es-CO');
        try { input.setSelectionRange(start, end); } catch (_) {}
      });
    });
    document.querySelectorAll('#profile-register-form input[type=\"email\"], #profile-edit-form input[type=\"email\"]').forEach(input => {
      input.setAttribute('autocapitalize', 'none');
      input.addEventListener('input', () => {
        const start = input.selectionStart, end = input.selectionEnd;
        input.value = input.value.toLowerCase();
        try { input.setSelectionRange(start, end); } catch (_) {}
      });
    });
    if (!clientDb) { showMessage('profile-login-error','No se pudo inicializar la conexión con Supabase.'); return; }
    const saved = parseSession();
    if (saved?.id) {
      try { const { data, error } = await clientDb.from('clientes').select('*').eq('id', saved.id).maybeSingle(); if (error) throw error; if (data) await loadProfile(data); else showAuth(); }
      catch (error) { console.error(error); showAuth(); }
    } else { showAuth(); const requestedMode = new URLSearchParams(location.search).get('mode'); showAuthMode(requestedMode === 'register' ? 'register' : 'login'); }
  });
})();
