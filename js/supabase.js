// Módulo de Sincronización y Base de Datos (Supabase / Local)

async function loadData() {
  if (supabaseClient) {
    try {
      const { data: creds, error: errCred } = await supabaseClient.from('creditos').select('*').order('created_at', { ascending: false });
      if (!errCred && creds) dbCreditos = creds;

      const { data: peds, error: errPed } = await supabaseClient.from('pedidos').select('*');
      if (!errPed && peds) dbPedidos = peds;

      updateCloudBadge(true);
    } catch (err) {
      console.warn("Fallo conexión con Supabase, usando modo local:", err);
      loadLocal();
      updateCloudBadge(false);
    }
  } else {
    loadLocal();
    updateCloudBadge(false);
  }

  updatePedidosAutoStatus();
  renderCreditos();
  renderPedidos();
}

function loadLocal() {
  dbCreditos = JSON.parse(localStorage.getItem('cupissa_creditos')) || [];
  dbPedidos = JSON.parse(localStorage.getItem('cupissa_pedidos')) || [];
}

function saveDataLocal() {
  localStorage.setItem('cupissa_creditos', JSON.stringify(dbCreditos));
  localStorage.setItem('cupissa_pedidos', JSON.stringify(dbPedidos));
}

function updateCloudBadge(isOnline) {
  const badge = document.getElementById('cloudBadge');
  const text = document.getElementById('cloudText');
  if (!badge || !text) return;

  if (isOnline && supabaseClient) {
    badge.className = 'status-badge-cloud cloud-online';
    text.innerText = 'Supabase Conectado';
  } else {
    badge.className = 'status-badge-cloud cloud-local';
    text.innerText = 'Modo Local / Sin Conexión';
  }
}