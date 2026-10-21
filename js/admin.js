document.addEventListener('DOMContentLoaded', async () => {
  await loadClients();

  document.getElementById('form-new-client').addEventListener('submit', async (e) => {
    e.preventDefault();
    await createClient();
  });

  document.getElementById('freq-select').addEventListener('change', autoCalcCredit);
  document.getElementById('cuotas-input').addEventListener('input', autoCalcCredit);
  document.getElementById('monto-credit-input').addEventListener('input', autoCalcCredit);
});

async function loadClients() {
  const { data: clients } = await _supabase.from('clientes').select('*');
  const tbody = document.getElementById('clients-tbody');
  tbody.innerHTML = '';

  clients.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${c.nombre}</td>
      <td>${c.telefono}</td>
      <td>$${c.cupo_disponible.toLocaleString()}</td>
      <td>
        <button class="btn btn-secondary" onclick="openManageModal('${c.id}')">Administrar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function autoCalcCredit() {
  const monto = parseFloat(document.getElementById('monto-credit-input').value) || 0;
  const cuotas = parseInt(document.getElementById('cuotas-input').value) || 1;
  const valorCuota = Math.round(monto / cuotas);
  document.getElementById('valor-cuota-input').value = valorCuota;
}

async function createClient() {
  const nombre = document.getElementById('client-name-input').value;
  const telefono = document.getElementById('client-phone-input').value;
  const password = document.getElementById('client-pass-input').value;
  const cupo = parseFloat(document.getElementById('client-cupo-input').value);

  const { data: client, error } = await _supabase
    .from('clientes')
    .insert([{ nombre, telefono, password, cupo_disponible: cupo }])
    .select()
    .single();

  if (error) {
    alert('Error al crear cliente');
    return;
  }

  const montoCredit = parseFloat(document.getElementById('monto-credit-input').value);
  const frecuencia = document.getElementById('freq-select').value;
  const cuotas = parseInt(document.getElementById('cuotas-input').value);
  const valorCuota = parseFloat(document.getElementById('valor-cuota-input').value);
  const fechaInicio = document.getElementById('start-date-input').value;

  const dates = ScheduleEngine.generateDates(fechaInicio, frecuencia, cuotas);

  await _supabase.from('creditos').insert([{
    cliente_id: client.id,
    monto_total: montoCredit,
    deuda_actual: montoCredit,
    frecuencia,
    numero_cuotas: cuotas,
    valor_cuota: valorCuota,
    proximo_vencimiento: dates[0],
    estado: 'ACTIVO'
  }]);

  await _supabase.from('clientes').update({
    cupo_disponible: client.cupo_disponible - montoCredit
  }).eq('id', client.id);

  closeModal('modal-new-client');
  await loadClients();
}

async function openManageModal(clientId) {
  const { data: client } = await _supabase.from('clientes').select('*').eq('id', clientId).single();
  const { data: credits } = await _supabase.from('creditos').select('*').eq('cliente_id', clientId);

  document.getElementById('manage-client-id').value = client.id;
  document.getElementById('edit-cupo-input').value = client.cupo_disponible;

  const container = document.getElementById('credits-container');
  container.innerHTML = '';

  credits.forEach(cr => {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <p><strong>Monto Total:</strong> $${cr.monto_total.toLocaleString()}</p>
      <p><strong>Deuda Actual:</strong> $${cr.deuda_actual.toLocaleString()}</p>
      <p><strong>Frecuencia:</strong> ${cr.frecuencia}</p>
      <p><strong>Cuota Mínima:</strong> $${cr.valor_cuota.toLocaleString()}</p>
      <p><strong>Estado:</strong> ${cr.estado}</p>
    `;
    container.appendChild(div);
  });

  document.getElementById('modal-manage-client').classList.remove('hidden');
}

async function saveCupoOnly() {
  const clientId = document.getElementById('manage-client-id').value;
  const newCupo = parseFloat(document.getElementById('edit-cupo-input').value);

  await _supabase.from('clientes').update({ cupo_disponible: newCupo }).eq('id', clientId);
  closeModal('modal-manage-client');
  await loadClients();
}

function openAddDebtModal() {
  closeModal('modal-manage-client');
  document.getElementById('modal-add-debt').classList.remove('hidden');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
}