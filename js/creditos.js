// Módulo de Gestión de Créditos

function calculateNextDueDate(startDateStr, frequency, currentCuotaNumber = 1) {
  const parts = startDateStr.split('-');
  let date = new Date(parts[0], parts[1] - 1, parts[2]);
  for (let i = 0; i < currentCuotaNumber; i++) {
    if (frequency === 'Diario') date.setDate(date.getDate() + 1);
    else if (frequency === 'Semanal') date.setDate(date.getDate() + 7);
    else if (frequency === 'Quincenal') date.setDate(date.getDate() + 15);
    else if (frequency === 'Mensual') date.setMonth(date.getMonth() + 1);
  }
  return date.toISOString().split('T')[0];
}

function openCreditoModal() {
  document.getElementById('formCredito').reset();
  document.getElementById('credito-id').value = '';
  document.getElementById('cred-fecha-entrega').value = todayStr;
  document.getElementById('modalCreditoTitle').innerText = 'Nuevo Crédito';
  document.getElementById('modalCredito').classList.add('active');
}

async function saveCredito(e) {
  e.preventDefault();
  const id = document.getElementById('credito-id').value;
  const cliente = document.getElementById('cred-cliente').value;
  const telefono = document.getElementById('cred-telefono').value;
  const frecuencia = document.getElementById('cred-frecuencia').value;
  const fecha_entrega = document.getElementById('cred-fecha-entrega').value;
  const num_cuotas = parseInt(document.getElementById('cred-num-cuotas').value);
  const valor_cuota = parseFloat(document.getElementById('cred-valor-cuota').value);
  const total_credito = num_cuotas * valor_cuota;

  const item = {
    cliente, telefono, frecuencia, fecha_entrega, num_cuotas,
    cuotas_pendientes: num_cuotas, valor_cuota, total_credito, pagado: 0,
    deuda_actual: total_credito, proximo_vencimiento: calculateNextDueDate(fecha_entrega, frecuencia, 1), estado: 'Activo'
  };

  if (supabaseClient) {
    let response;
    if (id) {
      response = await supabaseClient.from('creditos').update(item).eq('id', id);
    } else {
      response = await supabaseClient.from('creditos').insert([item]);
    }
    
    if (response.error) {
      console.error("Error en Supabase:", response.error);
      showToast("Error al guardar en Supabase: " + response.error.message);
      return;
    }
  } else {
    item.id = id || Date.now().toString();
    if (id) {
      const idx = dbCreditos.findIndex(c => c.id === id);
      if (idx !== -1) dbCreditos[idx] = { ...dbCreditos[idx], ...item };
    } else {
      dbCreditos.unshift(item);
    }
    saveDataLocal();
  }

  closeModal('modalCredito');
  showToast('Crédito guardado con éxito');
  loadData();
}

async function registerPayment(id) {
  const item = dbCreditos.find(c => c.id === id);
  if (!item || item.cuotas_pendientes <= 0) return;
  item.cuotas_pendientes -= 1;
  item.pagado += item.valor_cuota;
  item.deuda_actual -= item.valor_cuota;

  if (item.cuotas_pendientes === 0 || item.deuda_actual <= 0) {
    item.deuda_actual = 0;
    item.estado = 'Finalizado';
  } else {
    const pagadas = item.num_cuotas - item.cuotas_pendientes;
    item.proximo_vencimiento = calculateNextDueDate(item.fecha_entrega, item.frecuencia, pagadas + 1);
  }

  if (supabaseClient) {
    const { error } = await supabaseClient.from('creditos').update(item).eq('id', id);
    if (error) {
      console.error("Error en Supabase:", error);
      showToast("Error al registrar pago en Supabase: " + error.message);
      return;
    }
  } else {
    saveDataLocal();
  }

  showToast('Pago registrado correctamente');
  renderCreditos();
}

async function deleteCredito(id) {
  if (!confirm('¿Deseas eliminar este crédito?')) return;
  
  if (supabaseClient) {
    const { error } = await supabaseClient.from('creditos').delete().eq('id', id);
    if (error) {
      console.error("Error en Supabase:", error);
      showToast("Error al eliminar en Supabase: " + error.message);
      return;
    }
  } else {
    dbCreditos = dbCreditos.filter(c => c.id !== id);
    saveDataLocal();
  }
  
  loadData();
}

function renderCreditos() {
  const tbody = document.getElementById('tabla-creditos');
  if (!tbody) return;
  tbody.innerHTML = '';
  let totalCar = 0, totalDeuda = 0, totalPagado = 0, activosCount = 0;

  dbCreditos.forEach(c => {
    totalCar += c.total_credito; totalDeuda += c.deuda_actual; totalPagado += c.pagado;
    if (c.estado === 'Activo') activosCount++;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${c.cliente}</strong><br><small style="color:var(--text-muted)"><i class="fa-solid fa-phone"></i> ${c.telefono}</small></td>
      <td><span class="badge" style="background:var(--primary-light); color:var(--primary);">${c.frecuencia}</span></td>
      <td><strong>${c.cuotas_pendientes}</strong> / ${c.num_cuotas}</td>
      <td>$${formatMoney(c.valor_cuota)}</td>
      <td style="color:${c.estado === 'Activo' ? 'var(--primary)' : 'inherit'}; font-weight:700;">${c.estado === 'Activo' ? formatDate(c.proximo_vencimiento) : '-'}</td>
      <td style="font-weight:800; color:${c.deuda_actual > 0 ? '#dc2626' : '#16a34a'}">$${formatMoney(c.deuda_actual)}</td>
      <td><span class="badge ${c.estado === 'Activo' ? 'badge-agendado' : 'badge-entregado'}">${c.estado}</span></td>
      <td>
        <div class="action-btns">
          ${c.estado === 'Activo' ? `<button class="btn-action btn-pay" title="Registrar Pago" onclick="registerPayment('${c.id}')"><i class="fa-solid fa-hand-holding-dollar"></i></button>` : ''}
          <button class="btn-action btn-delete" title="Eliminar" onclick="deleteCredito('${c.id}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('stat-credito-total').innerText = '$' + formatMoney(totalCar);
  document.getElementById('stat-credito-deuda').innerText = '$' + formatMoney(totalDeuda);
  document.getElementById('stat-credito-pagado').innerText = '$' + formatMoney(totalPagado);
  document.getElementById('stat-credito-activos').innerText = activosCount;
}