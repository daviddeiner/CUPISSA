/** CUPISSA | Restaura sesión compartida con Mi Perfil. */
let cupissaPortalAuthSyncRunning = false;
window.addEventListener('DOMContentLoaded', async function() {
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session?.user?.email && !cupissaPortalAuthSyncRunning) {
            cupissaPortalAuthSyncRunning = true;
            setTimeout(async () => {
                try {
                    const linked = await window.CUPISSAAuth.getLinkedAccount();
                    if (linked?.client) await showClientDashboard(linked.client);
                } catch (error) { console.warn('[CUPISSA PORTAL] No se sincronizó la sesión:', error); }
                finally { cupissaPortalAuthSyncRunning = false; }
            }, 0);
        }
        if (event === 'SIGNED_OUT') {
            currentClient = null;
            document.getElementById('client-dashboard')?.classList.add('hidden');
            document.getElementById('client-login-card')?.classList.remove('hidden');
        }
    });
    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        if (error) throw error;
        if (!session?.user?.email) return;
        const linked = await window.CUPISSAAuth.getLinkedAccount();
        if (!linked?.client) throw new Error('La sesión está activa, pero el correo no está vinculado a una cuenta CUPISSA.');
        await showClientDashboard(linked.client);
    } catch (error) {
        console.warn('No fue posible restaurar la sesión del portal:', error);
        // No cerrar la sesión global: Perfil y Portal comparten autenticación.
        document.getElementById('client-login-card')?.classList.remove('hidden');
    }
});
