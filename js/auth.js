document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  if (!loginForm) return;

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const phone = document.getElementById('phone').value.trim();
    const password = document.getElementById('password').value.trim();

    const { data: client, error } = await _supabase
      .from('clientes')
      .select('*')
      .eq('telefono', phone)
      .eq('password', password)
      .single();

    if (error || !client) {
      alert('Teléfono o contraseña incorrectos');
      return;
    }

    localStorage.setItem('cupissa_client_id', client.id);
    window.location.href = 'cliente.html';
  });
});