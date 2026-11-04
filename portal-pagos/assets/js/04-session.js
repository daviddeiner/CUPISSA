/**
 * CUPISSA | Portal de pagos / restauración de sesión
 * Código extraído de la versión original sin cambiar la lógica.
 */

window.addEventListener('message', function(event) {
            if (typeof event.data === 'object' && event.data !== null) {
                if (event.data.type === 'COMMAND' || event.data.type === 'INITIALIZATION') {
                    // Procesamiento interno
                }
            }
        }, false);

        window.addEventListener('DOMContentLoaded', async function() {
            const savedSession = localStorage.getItem('cupissa_client_session');
            if (savedSession) {
                try {
                    currentClient = JSON.parse(savedSession);
                    document.getElementById('client-login-card').classList.add('hidden');
                    document.getElementById('client-dashboard').classList.remove('hidden');
                    await loadClientDashboard();
                } catch (e) {
                    console.error("Error al restaurar sesión:", e);
                    localStorage.removeItem('cupissa_client_session');
                }
            }
        });
