// Módulo de Gestión de Pedidos

function toggleTipoFechas() {
  const tipo = document.getElementById('ped-tipo').value;
  if (tipo === 'Envío') {
    document.getElementById('group-fecha-entrega').style.display = 'none';
    document.getElementById('group-fecha-envio').style.display = 'flex';
  } else {
    document.getElementById('group-fecha-entrega').style.display = 'flex';
    document.getElementById('group-fecha-envio').style.display = 'none';
  }
}

function calcularTotalPedido() {
  const p = parseFloat(document.getElementById('ped-val-prod').value) || 0;
  const d = parseFloat(document.getElementById('ped-val-dom').value) || 0;
  const a = parseFloat(document.getElementById('ped-anticipo').value) || 0;
  const total = p + d;
  const saldo = Math.max(0, total - a);

  document.getElementById('ped-total-txt').innerText = formatMoney(total);
  document.getElementById('ped-saldo-txt').innerText = formatMoney(saldo);
}

function updatePedidosAutoStatus() {
  dbPedidos.forEach(p => {
    if (p.estado !== 'Entregado' && p.estado !== 'Cancelado' && p.estado !== 'En Camino') {
      if (p.tipo_entrega === 'Envío') {
        if (p.fecha_envio === todayStr) p.estado = 'En Camino';
        else if (p.fecha_envio > todayStr) p.estado = 'Agendado';
      } else {
        if (p.fecha_entrega === todayStr) p.estado = 'Es Hoy';
        else if (p.fecha_entrega > todayStr) p.estado = 'Agendado';
      }
    }
  });
}

function openPedidoModal() {
  document.getElementById('formPedido').reset();
  document.getElementById('pedido-id').value = '';
  document.getElementById('ped-fecha-entrega').value = todayStr;
  document.getElementById('ped-fecha-envio').value = todayStr;
  document.getElementById('ped-val-prod').value = 0;
  document.getElementById('ped-val-dom').value = 0;
  document.getElementById('ped-anticipo').value = 0;
  calcularTotalPedido();
  toggleTipoFechas();
  document.getElementById('modalPedidoTitle').innerText = 'Registrar Pedido';
  document.getElementById('modalPedido').classList.add('active');
}

function editPedido(id) {
  const p = dbPedidos.find(item => item.id === id);
  if (!p) return;

  document.getElementById('pedido-id').value = p.id;
  document.getElementById('ped-nombre').value = p.nombre_cliente;
  document.getElementById('ped-telefono').value = p.telefono;
  document.getElementById('ped-cedula').value = p.cedula || '';
  document.getElementById('ped-correo').value = p.correo || '';
  document.getElementById('ped-direccion').value = p.direccion;
  document.getElementById('ped-barrio').value = p.barrio;
  document.getElementById('ped-ciudad').value = p.ciudad;
  document.getElementById('ped-tipo').value = p.tipo_entrega;
  toggleTipoFechas();

  if (p.tipo_entrega === 'Envío') {
    document.getElementById('ped-fecha-envio').value = p.fecha_envio || todayStr;
  } else {
    document.getElementById('ped-fecha-entrega').value = p.fecha_entrega || todayStr;
  }

  document.getElementById('ped-val-prod').value = p.valor_producto || 0;
  document.getElementById('ped-val-dom').value = p.valor_domicilio || 0;
  document.getElementById('ped-anticipo').value = p.anticipo || 0;
  document.getElementById('ped-descripcion').value = p.descripcion || '';
  calcularTotalPedido();

  document.getElementById('modalPedidoTitle').innerText = 'Editar Pedido';
  document.getElementById('modalPedido').classList.add('active');
}

async function savePedido(e) {
  e.preventDefault();
  const id = document.getElementById('pedido-id').value;
  const nombre_cliente = document.getElementById('ped-nombre').value;
  const telefono = document.getElementById('ped-telefono').value;
  const cedula = document.getElementById('ped-cedula').value;
  const correo = document.getElementById('ped-correo').value;
  const direccion = document.getElementById('ped-direccion').value;
  const barrio = document.getElementById('ped-barrio').value;
  const ciudad = document.getElementById('ped-ciudad').value;
  const tipo_entrega = document.getElementById('ped-tipo').value;
  const descripcion = document.getElementById('ped-descripcion').value;

  let fecha_entrega = tipo_entrega === 'Domicilio' ? document.getElementById('ped-fecha-entrega').value : null;
  let fecha_envio = tipo_entrega === 'Envío' ? document.getElementById('ped-fecha-envio').value : null;

  const valor_producto = parseFloat(document.getElementById('ped-val-prod').value) || 0;
  const valor_domicilio = parseFloat(document.getElementById('ped-val-dom').value) || 0;
  const anticipo = parseFloat(document.getElementById('ped-anticipo').value) || 0;
  const total_pedido = valor_producto + valor_domicilio;
  const saldo_restante = Math.max(0, total_pedido - anticipo);

  let estado = 'Agendado';
  if (tipo_entrega === 'Envío' && fecha_envio === todayStr) estado = 'En Camino';
  else if (tipo_entrega === 'Domicilio' && fecha_entrega === todayStr) estado = 'Es Hoy';

  const fileInput = document.getElementById('ped-fotos-files');

  const processData = async (fotos_urls = []) => {
    const item = {
      nombre_cliente, telefono, cedula, correo,
      direccion, barrio, ciudad, tipo_entrega,
      fecha_entrega, fecha_envio, valor_producto, valor_domicilio,
      anticipo, total_pedido, saldo_restante, estado, descripcion, fotos_urls
    };

    if (supabaseClient) {
      let response;
      if (id) {
        response = await supabaseClient.from('pedidos').update(item).eq('id', id);
      } else {
        response = await supabaseClient.from('pedidos').insert([item]);
      }

      if (response.error) {
        console.error("Error en Supabase:", response.error);
        showToast("Error al guardar en Supabase: " + response.error.message);
        return;
      }
    } else {
      item.id = id || Date.now().toString();
      if (id) {
        const idx = dbPedidos.findIndex(x => x.id === id);
        if (idx !== -1) dbPedidos[idx] = { ...dbPedidos[idx], ...item };
      } else {
        dbPedidos.push(item);
      }
      saveDataLocal();
    }

    closeModal('modalPedido');
    showToast('Pedido guardado correctamente');
    loadData();
  };

  let existingFotos = [];
  if (id) {
    const currentP = dbPedidos.find(x => x.id === id);
    if (currentP && currentP.fotos_urls) existingFotos = currentP.fotos_urls;
  }

  if (fileInput.files && fileInput.files.length > 0) {
    let loadedCount = 0;
    let newBase64s = [...existingFotos];

    Array.from(fileInput.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = function(uploadEvent) {
        newBase64s.push(uploadEvent.target.result);
        loadedCount++;
        if (loadedCount === fileInput.files.length) {
          processData(newBase64s);
        }
      };
      reader.readAsDataURL(file);
    });
  } else {
    processData(existingFotos);
  }
}

async function changePedidoStatus(id, newStatus) {
  const item = dbPedidos.find(p => p.id === id);
  if (!item) return;
  item.estado = newStatus;

  let updateData = { estado: newStatus };
  if (newStatus === 'Entregado') {
    item.fecha_entrega_real = todayStr;
    updateData.fecha_entrega_real = todayStr;
  }

  if (supabaseClient) {
    const { error } = await supabaseClient.from('pedidos').update(updateData).eq('id', id);
    if (error) {
      console.error("Error en Supabase:", error);
      showToast("Error al cambiar estado en Supabase: " + error.message);
      return;
    }
  } else {
    saveDataLocal();
  }

  showToast(`Estado cambiado a ${newStatus}`);
  renderPedidos();
}

async function deletePedido(id) {
  if (!confirm('¿Deseas eliminar este pedido?')) return;
  
  if (supabaseClient) {
    const { error } = await supabaseClient.from('pedidos').delete().eq('id', id);
    if (error) {
      console.error("Error en Supabase:", error);
      showToast("Error al eliminar pedido en Supabase: " + error.message);
      return;
    }
  } else {
    dbPedidos = dbPedidos.filter(p => p.id !== id);
    saveDataLocal();
  }
  
  loadData();
}

function viewProductDetails(id) {
  const p = dbPedidos.find(item => item.id === id);
  if (!p) return;

  const galeria = document.getElementById('ver-galeria-imgs');
  const noImg = document.getElementById('ver-noimg');
  const desc = document.getElementById('ver-producto-desc');

  if (!galeria || !desc) return;
  galeria.innerHTML = '';

  if (p.fotos_urls && p.fotos_urls.length > 0) {
    noImg.style.display = 'none';
    p.fotos_urls.forEach(url => {
      const img = document.createElement('img');
      img.src = url;
      img.style.cssText = 'height: 140px; width: 140px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border-color); cursor: pointer;';
      img.onclick = () => window.open(url);
      galeria.appendChild(img);
    });
  } else {
    noImg.style.display = 'block';
  }

  desc.innerText = p.descripcion && p.descripcion.trim() !== '' ? p.descripcion : 'Sin descripción registrada.';
  document.getElementById('modalVerProducto').classList.add('active');
}

function renderPedidos() {
  const tbody = document.getElementById('tabla-pedidos');
  if (!tbody) return;
  tbody.innerHTML = '';

  const sorted = [...dbPedidos].sort((a, b) => {
    const order = { 'Es Hoy': 1, 'Agendado': 2, 'En Camino': 3, 'Entregado': 4, 'Cancelado': 5 };
    return (order[a.estado] || 99) - (order[b.estado] || 99);
  });

  let cntTotal = dbPedidos.length, cntHoy = 0, cntCamino = 0, cntEntregados = 0;

  sorted.forEach(p => {
    if (p.estado === 'Es Hoy') cntHoy++;
    if (p.estado === 'En Camino') cntCamino++;
    if (p.estado === 'Entregado') cntEntregados++;

    let rowClass = p.estado === 'Cancelado' ? 'row-cancelado' : (p.estado === 'Es Hoy' ? 'row-eshoy' : '');
    let badgeClass = p.estado === 'Es Hoy' ? 'badge-eshoy' : (p.estado === 'En Camino' ? 'badge-encamino' : (p.estado === 'Entregado' ? 'badge-entregado' : (p.estado === 'Cancelado' ? 'badge-cancelado' : 'badge-agendado')));

    const tr = document.createElement('tr');
    tr.className = rowClass;
    tr.innerHTML = `
      <td><strong>${p.nombre_cliente}</strong>${p.cedula ? `<br><small style="color:var(--text-muted)">C.C: ${p.cedula}</small>` : ''}</td>
      <td><i class="fa-solid fa-phone"></i> ${p.telefono}${p.correo ? `<br><small style="color:var(--text-muted)">${p.correo}</small>` : ''}</td>
      <td><strong>${p.direccion}</strong><br><small style="color:var(--text-muted)">${p.barrio}, ${p.ciudad}</small></td>
      <td>
        ${p.tipo_entrega === 'Envío' ? `<small>F. Envío: ${formatDate(p.fecha_envio)}</small><br>` : ''}
        ${p.fecha_entrega_real ? `<strong style="color:#16a34a">F. Recibido: ${formatDate(p.fecha_entrega_real)}</strong>` : `Entrega: ${formatDate(p.fecha_entrega)}`}
      </td>
      <td>
        <span class="badge" style="background:var(--primary-light); color:var(--primary);">${p.tipo_entrega}</span><br>
        <strong>Total: $${formatMoney(p.total_pedido)}</strong><br>
        <small style="color:var(--text-muted)">Anticipo: $${formatMoney(p.anticipo)}</small><br>
        <strong style="color:${p.saldo_restante > 0 ? '#dc2626' : '#16a34a'}">Saldo: $${formatMoney(p.saldo_restante)}</strong>
      </td>
      <td>
        <button class="btn-action btn-view" title="Ver Fotos y Descripción" onclick="viewProductDetails('${p.id}')">
          <i class="fa-solid fa-eye"></i>
        </button>
      </td>
      <td>
        <select style="padding:4px 8px; border-radius:12px; font-weight:700; font-size:0.75rem;" 
                class="${badgeClass}" 
                onchange="changePedidoStatus('${p.id}', this.value)">
          <option value="Agendado" ${p.estado === 'Agendado' ? 'selected' : ''}>AGENDADO</option>
          <option value="Es Hoy" ${p.estado === 'Es Hoy' ? 'selected' : ''}>⚡ ES HOY</option>
          <option value="En Camino" ${p.estado === 'En Camino' ? 'selected' : ''}>EN CAMINO</option>
          <option value="Entregado" ${p.estado === 'Entregado' ? 'selected' : ''}>ENTREGADO</option>
          <option value="Cancelado" ${p.estado === 'Cancelado' ? 'selected' : ''}>CANCELADO</option>
        </select>
      </td>
      <td>
        <div class="action-btns">
          <button class="btn-action btn-edit" title="Editar Pedido" onclick="editPedido('${p.id}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-action btn-delete" title="Eliminar" onclick="deletePedido('${p.id}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('stat-pedidos-total').innerText = cntTotal;
  document.getElementById('stat-pedidos-hoy').innerText = cntHoy;
  document.getElementById('stat-pedidos-camino').innerText = cntCamino;
  document.getElementById('stat-pedidos-entregados').innerText = cntEntregados;
}