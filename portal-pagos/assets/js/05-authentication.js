/**
 * CUPISSA | Portal de pagos / inicio y cierre de sesión
 * Código extraído de la versión original sin cambiar la lógica.
 */

async function handleClientLogin(e) {
            e.preventDefault();
            const phone = document.getElementById('login-phone').value.trim();
            const password = document.getElementById('login-password').value.trim();
            const errorDiv = document.getElementById('login-error');

            const { data, error } = await supabaseClient
                .from('clientes')
                .select('*')
                .eq('telefono', phone)
                .eq('password', password)
                .maybeSingle();

            if (error || !data) {
                errorDiv.classList.remove('hidden');
                return;
            }

            currentClient = data;
            localStorage.setItem('cupissa_client_session', JSON.stringify(data));

            errorDiv.classList.add('hidden');
            document.getElementById('client-login-card').classList.add('hidden');
            document.getElementById('client-dashboard').classList.remove('hidden');
            await loadClientDashboard();
        }

        function handleLogout() {
            currentClient = null;
            activeCredits = [];
            localStorage.removeItem('cupissa_client_session');
            document.getElementById('client-dashboard').classList.add('hidden');
            document.getElementById('client-login-card').classList.remove('hidden');
            document.getElementById('client-login-form').reset();
        }
