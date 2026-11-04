/**
 * CUPISSA | Portal de pagos / panel del cliente.
 * Mantiene los datos en las tablas actuales clientes y creditos.
 */

async function loadClientDashboard() {
    if (!currentClient) return;

    const { data: updatedClient, error: clientError } = await supabaseClient
        .from('clientes')
        .select('*')
        .eq('id', currentClient.id)
        .maybeSingle();

    if (clientError) throw clientError;
    if (updatedClient) {
        currentClient = updatedClient;
        localStorage.setItem('cupissa_client_session', JSON.stringify(updatedClient));
    }

    const clientName = String(currentClient.nombre || 'Cliente CUPISSA');
    document.getElementById('client-name').innerText = `Hola, ${clientName}`;
    document.getElementById('client-phone').innerHTML = `<i class="fa-solid fa-phone text-[10px] mr-1"></i>${String(currentClient.telefono || '')}`;
    document.getElementById('client-email').innerText = currentClient.correo || '';
    document.getElementById('client-avatar').innerText = clientName.substring(0, 2).toUpperCase();
    document.getElementById('val-cupo-disponible').innerText = formatCOP(currentClient.cupo_disponible || 0);

    const { data: creditos, error: creditsError } = await supabaseClient
        .from('creditos')
        .select('*')
        .eq('cliente_id', currentClient.id)
        .eq('estado', 'ACTIVO');

    if (creditsError) throw creditsError;

    // Un crédito con saldo cero no debe mostrar fecha próxima ni seguir apareciendo como deuda.
    activeCredits = (creditos || []).filter(credit => Number(credit.deuda_actual || 0) > 0.009);
    activeCredits.sort((a, b) => String(a.proximo_vencimiento || '9999-12-31').localeCompare(String(b.proximo_vencimiento || '9999-12-31')));

    if (activeCredits.length > 0) {
        totalAmount = activeCredits.reduce((acc, credit) => acc + Math.max(0, Number(credit.deuda_actual || 0)), 0);
        baseMinAmount = activeCredits.reduce((acc, credit) => acc + Math.max(0, Number(credit.valor_cuota || 0)), 0);

        const firstDueDate = activeCredits.find(credit => credit.proximo_vencimiento)?.proximo_vencimiento || null;
        let moraCalc = { totalWithMora: baseMinAmount, latePeriods: 0, daysLate: 0, moraPercentage: 0, moraAmount: 0 };
        if (typeof calculateMoraDetails === 'function') {
            moraCalc = calculateMoraDetails(firstDueDate, baseMinAmount);
        }

        // Nunca permitir que la cuota mínima supere el saldo total pendiente.
        minAmountWithMora = Math.min(Number(moraCalc.totalWithMora || baseMinAmount), totalAmount);

        document.getElementById('val-deuda-total').innerText = formatCOP(totalAmount);
        document.getElementById('val-creditos-count').innerText = `${activeCredits.length} Crédito(s) Activo(s)`;
        document.getElementById('val-proximo-vencimiento').innerText = totalAmount > 0 ? formatDate(firstDueDate) : 'N/A';

        document.getElementById('opt-val-min').innerText = formatCOP(minAmountWithMora);
        document.getElementById('opt-fecha-min').innerText = totalAmount > 0 ? formatDate(firstDueDate) : 'N/A';
        document.getElementById('opt-val-tot').innerText = formatCOP(totalAmount);

        const moraDetailElem = document.getElementById('opt-mora-detail-min');
        if (moraCalc.latePeriods > 0 && moraCalc.moraAmount > 0) {
            moraDetailElem.innerText = `Incluye +${moraCalc.moraPercentage}% recargo por ${moraCalc.daysLate} días de mora (${formatCOP(moraCalc.moraAmount)})`;
            moraDetailElem.classList.remove('hidden');
        } else {
            moraDetailElem.classList.add('hidden');
        }
    } else {
        totalAmount = 0;
        baseMinAmount = 0;
        minAmountWithMora = 0;
        document.getElementById('val-deuda-total').innerText = '$ 0';
        document.getElementById('val-creditos-count').innerText = '0 Créditos Activos';
        document.getElementById('val-proximo-vencimiento').innerText = 'N/A';
        document.getElementById('opt-val-min').innerText = '$ 0';
        document.getElementById('opt-val-tot').innerText = '$ 0';
        document.getElementById('opt-fecha-min').innerText = 'N/A';
        document.getElementById('opt-mora-detail-min').classList.add('hidden');
    }

    selectPaymentOption('min');

    // Si el usuario cerró o recargó la página después de una aprobación,
    // reintenta aplicar el abono guardado sin abrir otro cobro en Wompi.
    if (typeof recoverApprovedCreditPayment === 'function') {
        await recoverApprovedCreditPayment();
    }
}
