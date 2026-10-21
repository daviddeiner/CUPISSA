document.addEventListener('DOMContentLoaded', async () => {
  const clientId = localStorage.getItem('cupissa_client_id');
  if (!clientId) {
    window.location.href = 'index.html';
    return;
  }

  document.getElementById('btn-logout').addEventListener('click', () => {
    localStorage.removeItem('cupissa_client_id');
    window.location.href = 'index.html';
  });

  await loadClientData(clientId);
});

async function loadClientData(clientId) {
  const { data: client } = await _supabase
    .from('clientes')
    .select('*')
    .eq('id', clientId)
    .single();

  const { data: credits } = await _supabase
    .from('creditos')
    .select('*')
    .eq('cliente_id', clientId)
    .eq('estado', 'ACTIVO');

  document.getElementById('client-name').textContent = client.nombre;
  document.getElementById('cupo-disponible').textContent = `$${client.cupo_disponible.toLocaleString()}`;

  let totalDebt = 0;
  let minPayment = 0;
  let nextDueDate = null;

  if (credits && credits.length > 0) {
    credits.forEach(credit => {
      totalDebt += credit.deuda_actual;
      if (credit.deuda_actual > 0) {
        minPayment += credit.valor_cuota;
        if (!nextDueDate || new Date(credit.proximo_vencimiento) < new Date(nextDueDate)) {
          nextDueDate = credit.proximo_vencimiento;
        }
      }
    });
  }

  document.getElementById('deuda-actual').textContent = `$${totalDebt.toLocaleString()}`;

  const expirationCard = document.getElementById('expiration-card');
  const noDebtCard = document.getElementById('nodebt-card');
  const actionCard = document.getElementById('action-card');

  if (totalDebt <= 0) {
    expirationCard.classList.add('hidden');
    actionCard.classList.add('hidden');
    noDebtCard.classList.remove('hidden');
  } else {
    noDebtCard.classList.add('hidden');
    expirationCard.classList.remove('hidden');
    actionCard.classList.remove('hidden');

    let extraFee = 0;
    if (nextDueDate) {
      extraFee = ScheduleEngine.calculateLateFee(nextDueDate, minPayment);
    }

    document.getElementById('proximo-vencimiento').textContent = nextDueDate || 'N/A';
    document.getElementById('cuota-minima-val').textContent = `$${(minPayment + extraFee).toLocaleString()}`;
    document.getElementById('monto-pagar').value = minPayment + extraFee;
  }
}

function selectPayOption(type) {
  const debtText = document.getElementById('deuda-actual').textContent.replace(/[^0-9]/g, '');
  const minText = document.getElementById('cuota-minima-val').textContent.replace(/[^0-9]/g, '');
  
  if (type === 'min') {
    document.getElementById('monto-pagar').value = minText;
  } else {
    document.getElementById('monto-pagar').value = debtText;
  }
}

function processPayment() {
  alert('Redirigiendo a pasarela de pagos Wompi...');
}