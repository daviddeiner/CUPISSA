/* CUPISSA | Checkout de compras y alquileres con Wompi directo. | build 2026-11-04-2 */
(() => {
  'use strict';

  console.info('[CUPISSA] Checkout de pedidos con Wompi directo · build 2026-11-04-2');

  const $ = id => document.getElementById(id);
  const money = value => '$ ' + new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Number(value || 0));
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const SESSION_KEY = 'cupissa_client_session';
  const CART_KEY = 'cupissa_cart';

  let clientSession = null;
  let clientProfile = null;
  let currentCart = [];
  let productsById = new Map();
  let productLines = [];
  let cartTotal = 0;
  let advanceTotal = 0;
  let preparedDays = 0;
  let earliestDelivery = '';
  let saleDatePicker = null;
  let rentalDatePicker = null;
  let fullSaleDates = new Set();
  let rentalDays = 1;
  let selectedPaymentMode = '';

  function showAlert(message, kind = 'error') {
    const el = $('checkout-alert');
    if (!el) return;

    el.className = `checkout-alert ${kind === 'success' ? 'success' : ''}`;
    el.textContent = message;
    el.classList.remove('hidden');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideAlert() {
    $('checkout-alert')?.classList.add('hidden');
  }

  function sessionFromStorage() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    } catch (_) {
      return null;
    }
  }

  function redirectToProfile() {
    const returnUrl = encodeURIComponent('/checkout');
    location.replace(`/perfil?next=checkout&mode=register&return=${returnUrl}`);
  }

  function localDateKey(date = new Date()) {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);

    const v = Object.fromEntries(p.map(x => [x.type, x.value]));

    return `${v.year}-${v.month}-${v.day}`;
  }

  function addDays(key, count) {
    const [y, m, d] = key.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d + count, 12));

    return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`;
  }

  function weekday(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  }

  function fmtKey(key) {
    if (!key) return '';

    const [y, m, d] = key.split('-').map(Number);

    return new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'long',
      timeZone: 'UTC'
    }).format(new Date(Date.UTC(y, m - 1, d, 12)));
  }

  function easterDate(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a - b + d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);

    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;

    return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }

  function moveToMonday(key) {
    return weekday(key) === 1
      ? key
      : addDays(key, (8 - weekday(key)) % 7 || 7);
  }

  function colombianHolidays(year) {
    const set = new Set();

    const fixed = [
      `${year}-01-01`,
      `${year}-05-01`,
      `${year}-07-20`,
      `${year}-08-07`,
      `${year}-12-08`,
      `${year}-12-25`
    ];

    fixed.forEach(x => set.add(x));

    const moved = [
      `${year}-01-06`,
      `${year}-03-19`,
      `${year}-06-29`,
      `${year}-08-15`,
      `${year}-10-12`,
      `${year}-11-01`,
      `${year}-11-11`
    ];

    moved.forEach(x => set.add(moveToMonday(x)));

    const easter = easterDate(year);

    set.add(addDays(easter, -3));
    set.add(addDays(easter, -2));

    [39, 60, 68].forEach(n =>
      set.add(moveToMonday(addDays(easter, n)))
    );

    return set;
  }

  const holidayCache = new Map();

  function isHoliday(key) {
    const y = Number(key.slice(0, 4));

    if (!holidayCache.has(y)) {
      holidayCache.set(y, colombianHolidays(y));
    }

    return holidayCache.get(y).has(key);
  }

  function isBlockedDate(date) {
    const key = date instanceof Date
      ? `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
      : date;

    return weekday(key) === 0 || isHoliday(key);
  }

  function isProductionDay(key) {
    return !isBlockedDate(key);
  }

  function getEarliestDelivery(days) {
    const today = localDateKey();

    let candidate = today;
    let remaining = Math.max(0, Number(days || 0));

    if (remaining > 0) {
      candidate = addDays(candidate, 1);

      while (remaining > 0) {
        if (isProductionDay(candidate)) remaining--;
        candidate = addDays(candidate, 1);
      }
    }

    while (isBlockedDate(candidate) || candidate < today) {
      candidate = addDays(candidate, 1);
    }

    return candidate;
  }

  function parseJsonArray(value) {
    if (Array.isArray(value)) return value;

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    }

    return [];
  }

  function optionExtra(options, selected) {
    if (!selected) return 0;

    const match = parseJsonArray(options).find(
      o => String(o.nombre ?? o.name ?? '') === String(selected)
    );

    if (!match) {
      throw new Error(
        `La opción “${selected}” ya no está disponible en uno de tus productos. Regresa al catálogo y actualiza el carrito.`
      );
    }

    return Number(match.incremento || match.adicional || 0);
  }

  function baseUnitPrice(product, item) {
    const rental = String(item.modalidad || '').toUpperCase() === 'ALQUILER';

    let unit = rental
      ? Number(product.precio_alquiler || 0)
      : Number(product.precio_detal || product.precio || product.price || 0);

    const qty = Math.max(1, Number(item.cantidad || 1));

    if (
      !rental &&
      Number(product.cant_min_mayorista || 0) > 0 &&
      qty >= Number(product.cant_min_mayorista) &&
      Number(product.precio_mayorista || 0) > 0
    ) {
      unit = Number(product.precio_mayorista);
    }

    unit += optionExtra(product.tallas, item.talla);
    unit += optionExtra(product.colores, item.color);
    unit += optionExtra(product.accesorios, item.accesorio);

    return unit;
  }

  function safeProductPhotos(product) {
    const photos = parseJsonArray(product.fotos);

    if (photos.length) {
      return photos
        .filter(x => typeof x === 'string' && /^https?:\/\//i.test(x))
        .slice(0, 6);
    }

    if (
      typeof product.fotos === 'string' &&
      /^https?:\/\//i.test(product.fotos)
    ) {
      return [product.fotos];
    }

    return [];
  }

  function rentalPriceFactor(days = rentalDays) {
    return 1 + (Math.max(1, Math.min(5, Number(days || 1))) - 1) * 0.5;
  }

  function renderMiniCart() {
    const container = $('checkout-mini-cart');
    if (!container) return;

    if (!Array.isArray(productLines) || !productLines.length) {
      container.innerHTML = '<p class="text-xs text-slate-400">No hay productos en el pedido.</p>';
      if ($('cart-item-count')) $('cart-item-count').textContent = '0 productos';
      if ($('checkout-mini-total')) $('checkout-mini-total').textContent = money(0);
      return;
    }

    container.innerHTML = productLines.map(line => `
      <article class="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
        <img src="${escapeHtml(line.foto || 'catalogo/assets/images/favicon.png')}" alt="${escapeHtml(line.nombre)}" class="w-14 h-14 rounded-xl object-cover bg-slate-100 flex-shrink-0" loading="lazy">
        <div class="min-w-0 flex-1">
          <strong class="block text-xs font-extrabold text-slate-900 line-clamp-2">${escapeHtml(line.nombre)}</strong>
          <p class="text-[10px] text-slate-500 mt-1">${line.cantidad} unidad(es) · ${line.modalidad === 'ALQUILER' ? `ALQUILER · ${line.diasAlquiler || rentalDays} día(s)` : 'VENTA'}${line.accesorio ? ` · Accesorio: ${escapeHtml(line.accesorio)}` : ''}</p>
          ${line.deposito ? `<p class="text-[10px] text-amber-700 font-semibold">Depósito reembolsable: ${money(line.deposito)}</p>` : ''}
        </div>
        <strong class="text-xs font-black text-slate-900 whitespace-nowrap">${money(line.total)}</strong>
      </article>
    `).join('');

    const units = productLines.reduce((sum, line) => sum + Number(line.cantidad || 0), 0);
    if ($('cart-item-count')) $('cart-item-count').textContent = `${units} producto${units === 1 ? '' : 's'}`;
    if ($('checkout-mini-total')) $('checkout-mini-total').textContent = money(cartTotal);
  }

  function recalculateCartAmounts() {
    productLines.forEach(line => {
      const factor = line.modalidad === 'ALQUILER' ? rentalPriceFactor(rentalDays) : 1;
      line.precioUnitario = Math.round(line.precioInicial * factor);
      line.total = Math.round(line.precioUnitario * line.cantidad);
      line.anticipoCalculado = Math.round(line.total * line.porcentajeAnticipo / 100);
      line.diasAlquiler = line.modalidad === 'ALQUILER' ? rentalDays : 0;
    });
    cartTotal = productLines.reduce((sum, line) => sum + line.total, 0);
    advanceTotal = productLines.reduce((sum, line) => sum + line.anticipoCalculado, 0);
    const saleLines = productLines.filter(line => line.modalidad !== 'ALQUILER');
    const saleUnits = saleLines.reduce((sum, line) => sum + line.cantidad, 0);
    const longestPrep = saleLines.reduce((max, line) => Math.max(max, line.diasPreparacion), 0);
    preparedDays = saleUnits > 0 ? longestPrep + saleUnits - 1 : 0;
    earliestDelivery = saleUnits > 0 ? getEarliestDelivery(preparedDays) : addDays(localDateKey(), 1);
  }

  function parseStoredCartValue(raw) {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function checkoutAccountCartKey(accountId) {
    return `cupissa_cart_account_${encodeURIComponent(String(accountId))}`;
  }

  function resolveCheckoutCart() {
    // El checkout utiliza la misma clave global que el catálogo. No depende
    // del usuario que inició sesión ni de una fila adicional en Supabase.
    const sharedCart = parseStoredCartValue(localStorage.getItem(CART_KEY));
    if (sharedCart.length) return sharedCart;

    // Compatibilidad: recupera una lista guardada por cuenta en versiones
    // anteriores y la migra una sola vez a la clave compartida.
    const candidates = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('cupissa_cart_account_')) continue;

      const accountPart = key.slice('cupissa_cart_account_'.length);
      const updatedKey = `cupissa_catalog_updated_account_${accountPart}`;
      const updatedValue = localStorage.getItem(updatedKey);
      const timestamp = updatedValue ? new Date(updatedValue).getTime() : 0;
      candidates.push({
        key,
        timestamp: Number.isFinite(timestamp) ? timestamp : 0
      });
    }
    candidates.sort((a, b) => b.timestamp - a.timestamp);

    for (const candidate of candidates) {
      const recovered = parseStoredCartValue(localStorage.getItem(candidate.key));
      if (!recovered.length) continue;
      try {
        localStorage.setItem(CART_KEY, JSON.stringify(recovered));
      } catch (error) {
        console.warn('No fue posible guardar la migración del carrito compartido:', error);
      }
      return recovered;
    }

    return [];
  }

  async function loadCartAndProducts() {
    currentCart = await resolveCheckoutCart();

    if (!Array.isArray(currentCart) || !currentCart.length) {
      throw new Error('Tu carrito está vacío. Regresa al catálogo, agrega los productos y vuelve a procesar el pedido.');
    }

    // Compatibilidad con carritos creados por versiones anteriores.
    currentCart = currentCart.map(item => ({
      ...item,
      productId: String(item.productId ?? item.product_id ?? item.producto_id ?? '')
    })).filter(item => item.productId);

    if (!currentCart.length) {
      throw new Error('Los productos guardados en tu carrito ya no tienen una referencia válida. Regresa al catálogo y agrégalos nuevamente.');
    }

    const ids = [...new Set(currentCart.map(item => String(item.productId)).filter(Boolean))];
    const { data, error } = await supabaseClient.from('productos').select('*').in('id', ids);
    if (error) throw error;

    productsById = new Map((data || []).map(product => [String(product.id), product]));
    if (productsById.size !== ids.length) {
      throw new Error('Uno o más productos ya no están disponibles. Regresa al catálogo y actualiza el carrito.');
    }

    productLines = currentCart.map(item => {
      const product = productsById.get(String(item.productId));
      const quantity = Math.max(1, Number(item.cantidad || 1));
      const mode = String(item.modalidad || 'VENTA').toUpperCase();
      const initialUnit = baseUnitPrice(product, item);
      const percentage = Number(product.porcentaje_anticipo || item.porcentajeAnticipo || 20);
      const rental = mode === 'ALQUILER';
      const photos = safeProductPhotos(product);
      return {
        productId: String(item.productId),
        nombre: String(product.nombre || item.nombre || 'Producto CUPISSA'),
        modalidad: mode,
        cantidad: quantity,
        talla: item.talla || '',
        color: item.color || '',
        accesorio: item.accesorio || '',
        customText: item.customText || '',
        precioInicial: initialUnit,
        precioUnitario: initialUnit,
        total: Math.round(initialUnit * quantity),
        porcentajeAnticipo: Math.max(0, Math.min(100, percentage)),
        anticipoCalculado: Math.round(initialUnit * quantity * percentage / 100),
        deposito: rental ? Number(product.valor_deposito || item.deposito || 0) * quantity : 0,
        diasPreparacion: rental ? 0 : Math.max(0, Number(product.dias_preparacion || 0)),
        diasAlquiler: rental ? rentalDays : 0,
        fotos: photos,
        foto: photos[0] || item.foto || ''
      };
    });

    recalculateCartAmounts();
  }

  async function loadFullSaleDates() {
    const from = localDateKey();
    const to = addDays(from, 370);
    try {
      const { data, error } = await supabaseClient.rpc('cupissa_fechas_sin_cupo', {
        p_desde: from,
        p_hasta: to
      });
      if (error) throw error;
      fullSaleDates = new Set((data || []).map(row => typeof row === 'string' ? row : row.fecha).filter(Boolean));
    } catch (error) {
      console.warn('No fue posible consultar el cupo de las fechas:', error);
      fullSaleDates = new Set();
    }
  }

  function asDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }

  async function initCalendar() {
    const hasSale = productLines.some(line => line.modalidad !== 'ALQUILER');
    const hasRental = productLines.some(line => line.modalidad === 'ALQUILER');
    const saleField = $('sale-date-field');
    const rentalField = $('rental-date-field');
    const rentalDaysField = $('rental-days-field');
    const saleNote = $('delivery-date-note');
    const rentalNoteElement = $('rental-date-note');
    if (saleField) saleField.classList.toggle('hidden', !hasSale);
    if (rentalField) rentalField.classList.toggle('hidden', !hasRental);
    if (rentalDaysField) rentalDaysField.classList.toggle('hidden', !hasRental);
    if (saleNote) saleNote.classList.toggle('hidden', !hasSale);
    if (rentalNoteElement) rentalNoteElement.classList.toggle('hidden', !hasRental);
    $('delivery-date').required = hasSale;
    $('rental-date').required = hasRental;

    if (hasSale) await loadFullSaleDates();
    if (!window.flatpickr) {
      showAlert('No se pudo cargar el calendario. Recarga la página.');
      return;
    }
    if (window.flatpickr.l10ns?.es) flatpickr.localize(flatpickr.l10ns.es);

    if (hasSale) {
      const note = $('delivery-date-note');
      if (note) { note.classList.remove('hidden'); note.innerHTML = `<i class="fa-regular fa-calendar-check"></i><span>${preparedDays ? `Este pedido requiere ${preparedDays} día(s) hábil(es) de producción. Primera fecha disponible: ${escapeHtml(fmtKey(earliestDelivery))}.` : `Selecciona la fecha de entrega de tu compra. Primera fecha disponible: ${escapeHtml(fmtKey(earliestDelivery))}.`} Los domingos, festivos y fechas sin cupo no están disponibles.</span>`; }
      saleDatePicker = flatpickr('#delivery-date', {
        dateFormat: 'Y-m-d', altInput: true, altFormat: 'l, j F Y', minDate: earliestDelivery,
        disable: [date => isBlockedDate(date) || fullSaleDates.has(asDateKey(date))],
        allowInput: false,
        onChange: () => $('delivery-date').setCustomValidity('')
      });
    }
    if (hasRental) {
      const rentalNote = $('rental-date-note');
      if (rentalNote) { rentalNote.classList.remove('hidden'); rentalNote.innerHTML = '<i class="fa-regular fa-calendar-check"></i><span>EL ALQUILER ES POR 24 HORAS, SOLICITA TU PEDIDO PARA UN DIA ANTES DE LA FECHA DEL EVENTO.</span>'; }
      rentalDatePicker = flatpickr('#rental-date', {
        dateFormat: 'Y-m-d', altInput: true, altFormat: 'l, j F Y', minDate: addDays(localDateKey(), 1),
        allowInput: false,
        onChange: () => $('rental-date').setCustomValidity('')
      });
    }
  }

  function updateRentalDays() {
    rentalDays = Math.max(1, Math.min(5, Number($('rental-days')?.value || 1)));
    recalculateCartAmounts();
    renderMiniCart();
    if (!$('checkout-step-2').classList.contains('hidden')) renderSummary();
  }

  async function loadCustomerProfile() {
    clientSession = sessionFromStorage();

    if (!clientSession?.id || !clientSession?.password) {
      localStorage.removeItem(SESSION_KEY);
      redirectToProfile();
      return false;
    }

    const {
      data: legacy,
      error: legacyError
    } = await supabaseClient
      .from('clientes')
      .select('*')
      .eq('id', clientSession.id)
      .eq('password', clientSession.password)
      .maybeSingle();

    if (legacyError) throw legacyError;

    if (!legacy) {
      localStorage.removeItem(SESSION_KEY);
      redirectToProfile();
      return false;
    }

    clientSession = legacy;

    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify(legacy)
    );

    let { data, error } = await supabaseClient
      .from('clientes_web')
      .select('*')
      .eq('cliente_id', String(legacy.id))
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      const {
        data: byPhone,
        error: phoneError
      } = await supabaseClient
        .from('clientes_web')
        .select('*')
        .eq('telefono', String(legacy.telefono || ''))
        .maybeSingle();

      if (phoneError) throw phoneError;

      data = byPhone;
    }

    clientProfile = data;

    if (!clientProfile) {
      const full = String(legacy.nombre || '').trim().split(/\s+/);

      const inserted = await supabaseClient
        .from('clientes_web')
        .insert([{
          cliente_id: String(legacy.id),
          nombres: full.shift() || '',
          apellidos: full.join(' '),
          telefono: legacy.telefono || '',
          correo: legacy.correo || '',
          direccion: '',
          barrio: '',
          ciudad: ''
        }])
        .select('*')
        .single();

      if (inserted.error) throw inserted.error;

      clientProfile = inserted.data;
    }

    return true;
  }

  function fillCustomerForm(profile) {
    const fullName = `${profile.nombres || ''} ${profile.apellidos || ''}`.trim().split(/\s+/);
    $('customer-first-name').value = String(profile.nombres || fullName.shift() || '').toLocaleUpperCase('es-CO');
    $('customer-last-name').value = String(profile.apellidos || fullName.join(' ')).toLocaleUpperCase('es-CO');
    $('customer-email').value = String(profile.correo || clientSession?.correo || '').toLowerCase();
    $('customer-phone').value = profile.telefono || clientSession?.telefono || '';
    $('customer-address').value = String(profile.direccion || '').toLocaleUpperCase('es-CO');
    $('customer-city').value = String(profile.ciudad || '').toLocaleUpperCase('es-CO');
    $('customer-neighborhood').value = String(profile.barrio || '').toLocaleUpperCase('es-CO');
  }

  function getFormData() {
    const hasSale = productLines.some(line => line.modalidad !== 'ALQUILER');
    const hasRental = productLines.some(line => line.modalidad === 'ALQUILER');
    const saleDate = hasSale ? $('delivery-date').value.trim() : '';
    const rentalDate = hasRental ? $('rental-date').value.trim() : '';
    return {
      nombres: $('customer-first-name').value.trim().toLocaleUpperCase('es-CO'),
      apellidos: $('customer-last-name').value.trim().toLocaleUpperCase('es-CO'),
      correo: $('customer-email').value.trim().toLowerCase(),
      telefono: $('customer-phone').value.trim(),
      direccion: $('customer-address').value.trim().toLocaleUpperCase('es-CO'),
      ciudad: $('customer-city').value.trim().toLocaleUpperCase('es-CO'),
      barrio: $('customer-neighborhood').value.trim().toLocaleUpperCase('es-CO'),
      fecha_venta: saleDate,
      fecha_alquiler: rentalDate,
      fecha_entrega: saleDate || rentalDate
    };
  }

  function validateDeliveryDate(key, mode) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      return mode === 'ALQUILER' ? 'Selecciona la fecha para tu alquiler.' : 'Selecciona una fecha de entrega para tu compra.';
    }
    if (mode === 'ALQUILER') {
      const minimumRental = addDays(localDateKey(), 1);
      return key < minimumRental ? `Para alquileres, solicita tu pedido con al menos un día de anticipación. Primera fecha disponible: ${fmtKey(minimumRental)}.` : '';
    }
    if (key < earliestDelivery) return `La fecha más cercana disponible es ${fmtKey(earliestDelivery)}.`;
    if (isBlockedDate(key)) return 'No se puede agendar una compra para domingos ni festivos colombianos.';
    if (fullSaleDates.has(key)) return 'Esta fecha ya alcanzó la cantidad máxima de pedidos. Selecciona otra fecha.';
    return '';
  }

  function validateForm() {
    const form = $('customer-details-form');
    const visibleFields = Array.from(form.querySelectorAll('input[required]'))
      .filter(field => field.id !== 'delivery-date' && field.id !== 'rental-date' && field.offsetParent !== null);
    for (const field of visibleFields) if (!field.reportValidity()) return false;

    const data = getFormData();
    for (const [key, label] of Object.entries({
      nombres: 'Nombres', apellidos: 'Apellidos', correo: 'Correo', telefono: 'Teléfono',
      direccion: 'Dirección exacta', ciudad: 'Ciudad', barrio: 'Barrio'
    })) {
      if (!data[key]) { showAlert(`El campo ${label} es obligatorio.`); return false; }
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.correo)) {
      showAlert('Escribe un correo electrónico válido.'); return false;
    }
    const phoneDigits = data.telefono.replace(/\D/g, '');
    if (phoneDigits.length < 7 || phoneDigits.length > 15) {
      showAlert('Escribe un número de teléfono válido.'); return false;
    }

    const hasSale = productLines.some(line => line.modalidad !== 'ALQUILER');
    const hasRental = productLines.some(line => line.modalidad === 'ALQUILER');
    if (hasSale) {
      const dateError = validateDeliveryDate(data.fecha_venta, 'VENTA');
      if (dateError) { showAlert(dateError); return false; }
    }
    if (hasRental) {
      const dateError = validateDeliveryDate(data.fecha_alquiler, 'ALQUILER');
      if (dateError) { showAlert(dateError); return false; }
    }
    hideAlert();
    return true;
  }

  function renderSummary() {
    const data = getFormData();
    const hasSale = productLines.some(line => line.modalidad !== 'ALQUILER');
    const hasRental = productLines.some(line => line.modalidad === 'ALQUILER');
    const dateSummary = [];
    if (hasSale) dateSummary.push(`<div><span>Fecha de entrega de la compra</span><strong>${escapeHtml(fmtKey(data.fecha_venta))}</strong></div>`);
    if (hasRental) dateSummary.push(`<div><span>Fecha del alquiler</span><strong>${escapeHtml(fmtKey(data.fecha_alquiler))}</strong></div>`);
    $('checkout-customer-summary').innerHTML = `
      <div><span>Cliente</span><strong>${escapeHtml(data.nombres)} ${escapeHtml(data.apellidos)}</strong></div>
      <div><span>Contacto</span><strong>${escapeHtml(data.telefono)} · ${escapeHtml(data.correo)}</strong></div>
      <div><span>Entrega</span><strong>${escapeHtml(data.direccion)}, ${escapeHtml(data.barrio)}, ${escapeHtml(data.ciudad)}</strong></div>
      ${dateSummary.join('')}
    `;

    const orderGroups = [
      { type:'VENTA', label:'PEDIDO DE COMPRA', lines:productLines.filter(line => line.modalidad !== 'ALQUILER') },
      { type:'ALQUILER', label:'PEDIDO DE ALQUILER', lines:productLines.filter(line => line.modalidad === 'ALQUILER') }
    ].filter(group => group.lines.length);

    $('checkout-product-summary').innerHTML = orderGroups.map(group => `
      <section class="rounded-xl border border-slate-100 p-3 space-y-2">
        <h3 class="text-[10px] font-black tracking-wider text-pink-700">${group.label}</h3>
        ${group.lines.map(item => `
          <div class="flex gap-3 py-2 border-b border-slate-100 last:border-0">
            <img src="${escapeHtml(item.foto || 'catalogo/assets/images/favicon.png')}" class="w-16 h-16 object-cover rounded-xl bg-slate-100" alt="${escapeHtml(item.nombre)}">
            <div class="flex-1 min-w-0">
              <strong class="text-sm text-slate-900">${escapeHtml(item.nombre)}</strong>
              <p class="text-[11px] text-slate-500 mt-1">Cantidad: ${item.cantidad}${item.talla ? ` · Talla: ${escapeHtml(item.talla)}` : ''}${item.color ? ` · Color: ${escapeHtml(item.color)}` : ''}${item.accesorio ? ` · Accesorio: ${escapeHtml(item.accesorio)}` : ''}${item.modalidad === 'ALQUILER' ? ` · ${item.diasAlquiler} día(s)` : ''}</p>
              ${item.customText ? `<p class="text-[11px] text-slate-500">Referencia: ${escapeHtml(item.customText)}</p>` : ''}
              ${item.deposito ? `<p class="text-[10px] text-amber-700 font-semibold">Depósito: ${money(item.deposito)} (REEMBOLSABLE AL MOMENTO DE RECOGER)</p>` : ''}
              <p class="text-xs font-black text-slate-800 mt-1">${money(item.precioUnitario)} c/u · ${money(item.total)}</p>
            </div>
          </div>`).join('')}
      </section>`).join('');

    $('checkout-subtotal').textContent = money(cartTotal);
    $('checkout-grand-total').textContent = money(cartTotal);
    $('checkout-advance').textContent = money(advanceTotal);
    $('pay-total-value').textContent = money(cartTotal);
    $('pay-advance-value').textContent = money(advanceTotal);
    const splitNote = $('split-orders-note');
    if (splitNote) splitNote.classList.toggle('hidden', !(hasSale && hasRental));
  }

  function showStep(step) {
    $('checkout-step-1').classList.toggle('hidden', step !== 1);
    $('checkout-step-2').classList.toggle('hidden', step !== 2);

    $('step-indicator-1').classList.toggle('active', step === 1);
    $('step-indicator-2').classList.toggle('active', step === 2);

    hideAlert();

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }

  function advanceToSummary() {
    renderSummary();
    showStep(2);
  }

  function continueFromForm() {
    if (!validateForm()) return;
    selectedPaymentMode = '';
    document.querySelectorAll('.checkout-pay-option').forEach(button => {
      button.classList.remove('selected');
      button.setAttribute('aria-pressed', 'false');
    });
    const goButton = $('go-to-payment-button');
    if (goButton) goButton.disabled = true;
    renderSummary();
    showStep(2);
  }

  function selectPaymentMode(mode) {
    if (!['full','deposit'].includes(mode)) return;
    selectedPaymentMode = mode;
    document.querySelectorAll('.checkout-pay-option').forEach(button => {
      const selected = button.id === (mode === 'full' ? 'pay-total-button' : 'pay-advance-button');
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    const goButton = $('go-to-payment-button');
    if (goButton) goButton.disabled = false;
    const amount = mode === 'full' ? cartTotal : advanceTotal;
    if (goButton) goButton.textContent = `Ir a pagar · ${money(amount)}`;
  }

  function setProcessing(show, title = '', message = '') {
    const modal = $('payment-processing');

    if (!modal) return;

    const heading = modal.querySelector('h2');
    const description = modal.querySelector('p');

    if (heading && title) heading.textContent = title;
    if (description && message) description.textContent = message;

    modal.classList.toggle('hidden', !show);
  }

  function createOrderUuid() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }

  function buildOrderPayloads(mode, customer) {
    if (!clientProfile?.id) throw new Error('No se encontró el perfil del cliente para registrar el pedido.');
    const groups = [
      { type: 'VENTA', lines: productLines.filter(line => line.modalidad !== 'ALQUILER') },
      { type: 'ALQUILER', lines: productLines.filter(line => line.modalidad === 'ALQUILER') }
    ].filter(group => group.lines.length);

    return groups.map(group => {
      const groupTotal = Math.round(group.lines.reduce((sum, line) => sum + Number(line.total || 0), 0));
      const groupAdvance = Math.round(group.lines.reduce((sum, line) => sum + Number(line.anticipoCalculado || 0), 0));
      const paidInThisOrder = mode === 'full' ? groupTotal : groupAdvance;
      const products = group.lines.map(line => ({
        product_id: String(line.productId),
        nombre: String(line.nombre || 'Producto CUPISSA'),
        referencia: String(line.customText || ''),
        modalidad: group.type,
        cantidad: Math.max(1, Number(line.cantidad || 1)),
        precio: Number(line.precioUnitario || 0),
        total: Number(line.total || 0),
        talla: String(line.talla || ''),
        color: String(line.color || ''),
        accesorio: String(line.accesorio || ''),
        dias_alquiler: group.type === 'ALQUILER' ? Number(line.diasAlquiler || rentalDays || 1) : null,
        imagen_url: String(line.foto || line.fotos?.[0] || ''),
        imagenes: Array.isArray(line.fotos) ? line.fotos : []
      }));

      return {
        id: createOrderUuid(),
        // Las dos FK apuntan a tablas diferentes:
        // cliente_id -> clientes.id; cliente_web_id -> clientes_web.id.
        cliente_id: String(clientSession.id),
        cliente_web_id: String(clientProfile.id),
        tipo_pedido: group.type,
        fecha_entrega: group.type === 'ALQUILER' ? customer.fecha_alquiler : customer.fecha_venta,
        cliente_nombre: `${customer.nombres} ${customer.apellidos}`.trim(),
        telefono: customer.telefono,
        direccion: customer.direccion,
        barrio: customer.barrio,
        ciudad: customer.ciudad,
        total: groupTotal,
        envio: 0,
        anticipo: paidInThisOrder,
        productos: products,
        estado: 'AGENDADO'
      };
    });
  }

  function savePendingWebPayment(pending) {
    localStorage.setItem('cupissa_pending_web_payment', JSON.stringify(pending));
  }

  // Pago directo con Wompi: el checkout de pedidos no invoca Edge Functions.
  async function startWebPayment(mode) {
    if (!['full','deposit'].includes(mode)) return;
    if (!validateForm()) { showStep(1); return; }
    const amount = mode === 'full' ? cartTotal : advanceTotal;
    if (amount <= 0) { showAlert('El monto a pagar debe ser mayor a $0.'); return; }

    const button = $('go-to-payment-button');
    if (button) { button.disabled = true; button.textContent = 'Abriendo Wompi…'; }
    setProcessing(true, 'Preparando tu pago', 'Estamos preparando la información de tu pedido para Wompi.');

    try {
      const customer = getFormData();
      if (!window.CUPISSA_WOMPI || typeof window.CUPISSA_WOMPI.preparePayment !== 'function' || typeof window.CUPISSA_WOMPI.openCheckout !== 'function') {
        throw new Error('No se cargó la integración directa de Wompi. Actualiza la página y vuelve a intentarlo.');
      }
      const payment = await window.CUPISSA_WOMPI.preparePayment(amount, { referencePrefix: 'CUPISSA-PEDIDO' });
      const orderPayloads = buildOrderPayloads(mode, customer);
      const pending = {
        reference: payment.reference,
        amount: payment.amount,
        amountInCents: payment.amountInCents,
        mode,
        customer,
        orderPayloads,
        clientId: String(clientSession.id),
        clientProfileId: String(clientProfile.id),
        createdAt: new Date().toISOString()
      };
      savePendingWebPayment(pending);

      const transaction = await window.CUPISSA_WOMPI.openCheckout(payment, customer);
      pending.transaction = transaction;
      savePendingWebPayment(pending);
      await confirmPayment(transaction, pending);
    } catch (error) {
      console.error('No fue posible iniciar o registrar el pago:', error);
      setProcessing(false);
      showAlert(error?.message || 'No fue posible iniciar el pago. Verifica tus datos e inténtalo nuevamente.');
    } finally {
      if (button && $('payment-result').classList.contains('hidden')) {
        button.disabled = false;
        button.textContent = 'Ir a pagar';
      }
    }
  }

  function transactionMatchesPayment(transaction, pending) {
    if (!transaction || !pending) return false;
    return String(transaction.reference || '') === String(pending.reference || '') &&
      Number(transaction.amount_in_cents) === Number(pending.amountInCents) &&
      String(transaction.currency || 'COP') === 'COP';
  }

  async function getOrCreateWebPaymentRow(transaction, pending) {
    const transactionId = String(transaction.id || '').trim();
    if (!transactionId) throw new Error('Wompi no devolvió el identificador de la transacción.');

    const found = await supabaseClient.from('pagos_web').select('*').eq('wompi_transaction_id', transactionId).maybeSingle();
    if (found.error) throw found.error;
    if (found.data) return found.data;

    const paymentData = {
      wompi_transaction_id: transactionId,
      cliente_id: String(pending.clientId || clientSession.id),
      telefono: String(pending.customer?.telefono || clientSession.telefono || ''),
      referencia: String(pending.reference),
      monto: Number(pending.amount),
      estado: 'PROCESANDO',
      datos: {
        tipo: 'PEDIDO_WEB',
        modalidad_pago: pending.mode,
        amount_in_cents: Number(pending.amountInCents),
        currency: 'COP',
        pedido_ids: (pending.orderPayloads || []).map(order => order.id),
        pedidos_payload: pending.orderPayloads || [],
        wompi_status: String(transaction.status || '')
      }
    };
    const inserted = await supabaseClient.from('pagos_web').insert([paymentData]).select('*').single();
    if (!inserted.error) return inserted.data;

    // Si el callback se repite, recupera el registro que ya creó la primera ejecución.
    const duplicate = await supabaseClient.from('pagos_web').select('*').eq('wompi_transaction_id', transactionId).maybeSingle();
    if (duplicate.error || !duplicate.data) throw inserted.error;
    return duplicate.data;
  }

  async function persistApprovedWebOrder(transaction, pending) {
    let paymentRow = await getOrCreateWebPaymentRow(transaction, pending);
    let orderPayloads = Array.isArray(paymentRow.datos?.pedidos_payload) && paymentRow.datos.pedidos_payload.length
      ? paymentRow.datos.pedidos_payload
      : (pending.orderPayloads || []);
    const orderIds = orderPayloads.map(order => order.id).filter(Boolean);
    if (!orderPayloads.length || !orderIds.length) throw new Error('No se encontraron los datos del pedido que se deben agendar.');

    // Si el pago ya fue aplicado, no vuelve a crear ni modificar pedidos.
    if (paymentRow.estado === 'APLICADO') {
      const savedOrders = await supabaseClient.from('pedidos_web').select('*').in('id', orderIds);
      if (savedOrders.error) throw savedOrders.error;
      // En carritos mixtos deben existir TODOS los pedidos (venta y alquiler).
      // Si faltó alguno en un intento previo, se completa sin duplicar el que sí existe.
      if ((savedOrders.data || []).length === orderIds.length) {
        return { orders: savedOrders.data, alreadyApplied: true };
      }
    }

    const customer = pending.customer || {};
    const profileUpdate = await supabaseClient
      .from('clientes_web')
      .update({
        nombres: customer.nombres,
        apellidos: customer.apellidos,
        telefono: customer.telefono,
        correo: customer.correo,
        direccion: customer.direccion,
        barrio: customer.barrio,
        ciudad: customer.ciudad
      })
      .eq('id', String(pending.clientProfileId || clientProfile.id));
    if (profileUpdate.error) throw profileUpdate.error;

    // IDs generados antes de abrir Wompi: un reintento conserva los mismos IDs y no duplica pedidos.
    const orderWrite = await supabaseClient
      .from('pedidos_web')
      .upsert(orderPayloads, { onConflict: 'id', ignoreDuplicates: true });
    if (orderWrite.error) throw orderWrite.error;

    const savedOrders = await supabaseClient.from('pedidos_web').select('*').in('id', orderIds);
    if (savedOrders.error) throw savedOrders.error;
    if ((savedOrders.data || []).length !== orderIds.length) {
      throw new Error('El pago fue aprobado, pero no fue posible confirmar todos los pedidos en la agenda. Puedes reintentar el registro sin volver a pagar.');
    }

    const finalData = {
      ...(paymentRow.datos || {}),
      tipo: 'PEDIDO_WEB',
      modalidad_pago: pending.mode,
      pedido_ids: orderIds,
      pedidos_payload: orderPayloads,
      wompi_status: String(transaction.status || 'APPROVED'),
      wompi_payment_method: transaction.payment_method_type || null,
      wompi_finalized_at: transaction.finalized_at || null
    };
    const applied = await supabaseClient
      .from('pagos_web')
      .update({ estado: 'APLICADO', aplicado_en: new Date().toISOString(), error_detalle: null, datos: finalData })
      .eq('id', paymentRow.id);
    if (applied.error) throw applied.error;

    return { orders: savedOrders.data, alreadyApplied: false };
  }

  async function confirmPayment(transaction, pending) {
    if (!transaction || !pending) return;
    setProcessing(true, 'Verificando tu pago', 'Estamos registrando el pago aprobado y agendando tu pedido.');
    hideAlert();

    try {
      if (transaction.status === 'PENDING') {
        setProcessing(false);
        showAlert('Wompi reportó la transacción como PENDIENTE. El pedido todavía no se agenda ni se registra como pagado. La agenda se completará únicamente cuando Wompi confirme APPROVED.');
        return;
      }
      if (transaction.status !== 'APPROVED') {
        setProcessing(false);
        localStorage.removeItem('cupissa_pending_web_payment');
        showAlert(`El pago no fue aprobado por Wompi (${transaction.status || 'sin estado'}). No se agendó el pedido.`);
        return;
      }
      if (!transactionMatchesPayment(transaction, pending)) {
        throw new Error('Los datos de la transacción recibida no coinciden con el pago solicitado. No se agendó el pedido.');
      }

      const result = await persistApprovedWebOrder(transaction, pending);
      setProcessing(false);
      showSuccess(result);
    } catch (error) {
      console.error('Error registrando la transacción aprobada:', error);
      setProcessing(false);
      showAlert(error?.message || 'El pago fue recibido, pero no se pudo completar el registro del pedido. Reintenta el registro sin volver a pagar.');
      addRetryButton(transaction, pending);
    }
  }

  function addRetryButton(transaction, pending) {
    const alert = $('checkout-alert');
    if (!alert || alert.querySelector('[data-retry-payment]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.retryPayment = '1';
    button.className = 'font-black underline ml-2';
    button.textContent = transaction?.status === 'APPROVED' ? 'Reintentar registro del pedido' : 'Consultar / reintentar';
    button.addEventListener('click', () => confirmPayment(transaction, pending));
    alert.appendChild(button);
  }

  // ================================================
  // PAGO APROBADO
  // ================================================

  function showSuccess(result) {
    localStorage.removeItem('cupissa_pending_web_payment');
    localStorage.setItem(CART_KEY, '[]');
    try {
      if (typeof cart !== 'undefined' && Array.isArray(cart)) {
        cart.length = 0;
        if (typeof saveCart === 'function') saveCart();
      }
    } catch (_) {}

    const orders = Array.isArray(result?.orders) && result.orders.length
      ? result.orders
      : (result?.order ? [result.order] : []);
    $('checkout-workflow').classList.add('hidden');
    $('payment-result').classList.remove('hidden');
    $('payment-result-title').textContent = 'Tu pedido fue registrado';
    $('payment-result-message').textContent = orders.length > 1
      ? 'Tus pedidos de compra y alquiler quedaron registrados por separado en tu perfil CUPISSA.'
      : 'Tu pedido ya está disponible en tu perfil CUPISSA.';
    $('payment-result-order').textContent = orders.map(order => order.codigo || order.numero_pedido || order.id || '').filter(Boolean).map(code => `Pedido ${code}`).join(' · ');
    const firstOrder = orders[0];
    $('view-order-profile').href = firstOrder?.id
      ? `/perfil?pedidoId=${encodeURIComponent(firstOrder.id)}#tus-pedidos`
      : '/perfil#tus-pedidos';
    $('back-catalog-after-payment').href = '/catalogo';
    window.scrollTo({ top:0, behavior:'smooth' });
  }

  // ================================================
  // RECUPERAR UN REGISTRO APROBADO PENDIENTE DE GUARDAR
  // ================================================
  async function recoverApprovedPayment() {
    try {
      const pending = JSON.parse(localStorage.getItem('cupissa_pending_web_payment') || 'null');
      if (pending?.transaction?.status === 'APPROVED' && pending?.reference) {
        await confirmPayment(pending.transaction, pending);
        return true;
      }
    } catch (error) {
      console.warn('No fue posible recuperar el registro pendiente:', error);
    }
    return false;
  }

  // ================================================
  // INICIALIZACIÓN
  // ================================================

  async function init() {
    try {
      if (typeof supabaseClient === 'undefined' || !supabaseClient) {
        throw new Error('No se pudo inicializar la conexión con CUPISSA.');
      }
      if (!await loadCustomerProfile()) return;
      await loadCartAndProducts();
      renderMiniCart();
      await initCalendar();

      $('rental-days')?.addEventListener('change', updateRentalDays);
      $('customer-details-form').querySelectorAll('input:not([type="email"]):not([type="password"])').forEach(input => {
        input.addEventListener('input', () => {
          const start = input.selectionStart;
          const end = input.selectionEnd;
          input.value = input.value.toLocaleUpperCase('es-CO');
          try { input.setSelectionRange(start, end); } catch (_) {}
        });
      });
      $('customer-email').addEventListener('input', () => {
        const start = $('customer-email').selectionStart;
        const end = $('customer-email').selectionEnd;
        $('customer-email').value = $('customer-email').value.toLowerCase();
        try { $('customer-email').setSelectionRange(start, end); } catch (_) {}
      });
      $('customer-details-form').addEventListener('submit', event => {
        event.preventDefault();
        continueFromForm();
      });
      $('edit-details').addEventListener('click', () => showStep(1));
      $('pay-total-button').addEventListener('click', () => selectPaymentMode('full'));
      $('pay-advance-button').addEventListener('click', () => selectPaymentMode('deposit'));
      $('go-to-payment-button').addEventListener('click', () => startWebPayment(selectedPaymentMode));

      fillCustomerForm(clientProfile);
      const recovered = await recoverApprovedPayment();
      if (recovered) return;
    } catch (error) {
      console.error('Error inicializando checkout CUPISSA:', error);
      showAlert(error.message || 'No fue posible preparar tu compra.');
    }
  }

  document.addEventListener(
    'DOMContentLoaded',
    init
  );

})();