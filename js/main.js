// Archivo Principal de Inicialización y Utilidades

window.addEventListener('DOMContentLoaded', () => {
  // Cargar Tema Guardado con persistencia
  if (localStorage.getItem('cupissa_theme') === 'dark') {
    document.body.classList.add('dark-mode');
    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) themeIcon.className = 'fa-solid fa-sun';
  }

  loadData();
});

function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  localStorage.setItem('cupissa_theme', isDark ? 'dark' : 'light');
  const themeIcon = document.getElementById('theme-icon');
  if (themeIcon) themeIcon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
}

function switchTab(tab) {
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  if (tab === 'creditos') {
    document.querySelectorAll('.nav-btn')[0].classList.add('active');
    document.getElementById('tab-creditos').classList.add('active');
  } else {
    document.querySelectorAll('.nav-btn')[1].classList.add('active');
    document.getElementById('tab-pedidos').classList.add('active');
  }
}

function closeModal(id) { 
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active'); 
}

function formatMoney(num) { 
  return new Intl.NumberFormat('es-CO').format(num || 0); 
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-msg');
  if (!toast || !toastMsg) return;
  toastMsg.innerText = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}