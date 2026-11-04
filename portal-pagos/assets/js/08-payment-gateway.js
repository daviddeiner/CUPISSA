/**
 * CUPISSA | Portal de pagos / apertura Wompi y aplicación de cuotas.
 * Wompi se abre directamente desde el navegador. Al recibir APPROVED,
 * el abono se registra en pagos_web y se actualizan los créditos existentes.
 */

function getCreditFrequency(credit) {
    return String(
        credit.frecuencia_pago || credit.frecuencia || credit.periodicidad ||
        credit.frecuencia_cuota || credit.tipo_frecuencia || 'Mensual'
    ).trim();
}

function buildCreditPaymentUpdates(amountToPay, paymentType) {
    const amount = Math.max(0, Number(amountToPay || 0));
    const credits = (activeCredits || []).filter(credit => Number(credit.deuda_actual || 0) > 0.009);
    if (!credits.length || amount <= 0) throw new Error('No hay créditos con saldo pendiente para aplicar este pago.');

    const debts = credits.map(credit => Math.max(0, Number(credit.deuda_actual || 0)));
    const totalDebt = debts.reduce((sum, debt) => sum + debt, 0);
    const quotaTotal = credits.reduce((sum, credit) => sum + Math.max(0, Number(credit.valor_cuota || 0)), 0);
    const actualAmount = Math.min(amount, totalDebt);
    const allocations = credits.map(() => 0);

    if (paymentType === 'tot') {
        credits.forEach((credit, index) => { allocations[index] = debts[index]; });
    } else {
        let remaining = actualAmount;
        const lateCharge = Math.max(0, actualAmount - Math.min(quotaTotal, totalDebt));

        credits.forEach((credit, index) => {
            if (remaining <= 0) return;
            const quota = Math.max(0, Number(credit.valor_cuota || 0));
            const lateShare = quotaTotal > 0 ? lateCharge * quota / quotaTotal : 0;
            const target = quota + lateShare;
            const paid = Math.min(debts[index], target, remaining);
            allocations[index] += paid;
            remaining -= paid;
        });

        // Redistribuye cualquier excedente causado por un crédito con saldo inferior a su cuota.
        credits.forEach((credit, index) => {
            if (remaining <= 0.009) return;
            const room = Math.max(0, debts[index] - allocations[index]);
            const extra = Math.min(room, remaining);
            allocations[index] += extra;
            remaining -= extra;
        });
    }

    return credits.map((credit, index) => {
        const debtBefore = debts[index];
        const paid = Math.min(debtBefore, Math.max(0, allocations[index]));
        const newDebt = Math.max(0, Math.round((debtBefore - paid) * 100) / 100);
        const quota = Math.max(0, Number(credit.valor_cuota || 0));
        const installmentCovered = paymentType === 'tot' || (quota > 0 && paid + 0.009 >= quota);
        const oldDueDate = credit.proximo_vencimiento || null;
        const nextDueDate = newDebt <= 0.009
            ? null
            : (installmentCovered && oldDueDate && typeof calculateNextDueDate === 'function'
                ? calculateNextDueDate(oldDueDate, getCreditFrequency(credit))
                : oldDueDate);

        return {
            id: credit.id,
            deuda_actual: newDebt,
            proximo_vencimiento: nextDueDate,
            estado: newDebt <= 0.009 ? 'PAGADO' : (credit.estado || 'ACTIVO')
        };
    });
}

async function registerAndApplyCreditPayment(paymentData, transaction) {
    const transactionId = String(transaction?.id || '').trim();
    if (!transactionId) throw new Error('Wompi no devolvió el identificador de la transacción.');

    const existingResult = await supabaseClient
        .from('pagos_web')
        .select('*')
        .eq('wompi_transaction_id', transactionId)
        .maybeSingle();
    if (existingResult.error) throw existingResult.error;

    let paymentRow = existingResult.data;
    if (paymentRow?.estado === 'APLICADO') return { alreadyApplied: true };

    if (!paymentRow) {
        const amount = Number(paymentData.amount);
        const creditUpdates = buildCreditPaymentUpdates(amount, selectedOption);
        const inserted = await supabaseClient
            .from('pagos_web')
            .insert([{
                wompi_transaction_id: transactionId,
                cliente_id: String(currentClient.id),
                telefono: String(currentClient.telefono || ''),
                referencia: String(paymentData.reference),
                monto: amount,
                estado: 'PROCESANDO',
                datos: {
                    tipo: 'CREDITO_CUPISSA',
                    modalidad: selectedOption,
                    amount_in_cents: Number(paymentData.amountInCents),
                    currency: 'COP',
                    creditos_actualizados: creditUpdates,
                    wompi_status: String(transaction.status || '')
                }
            }])
            .select('*')
            .single();
        if (inserted.error) {
            // Una notificación repetida puede coincidir con una inserción anterior.
            const duplicate = await supabaseClient.from('pagos_web').select('*').eq('wompi_transaction_id', transactionId).maybeSingle();
            if (duplicate.error || !duplicate.data) throw inserted.error;
            paymentRow = duplicate.data;
            if (paymentRow.estado === 'APLICADO') return { alreadyApplied: true };
        } else {
            paymentRow = inserted.data;
        }
    }

    const savedUpdates = Array.isArray(paymentRow?.datos?.creditos_actualizados)
        ? paymentRow.datos.creditos_actualizados
        : buildCreditPaymentUpdates(Number(paymentData.amount), selectedOption);

    // Se escriben valores finales (no incrementos) para que un reintento no duplique el abono.
    for (const creditUpdate of savedUpdates) {
        const { id, ...values } = creditUpdate;
        const { error } = await supabaseClient.from('creditos').update(values).eq('id', id);
        if (error) throw error;
    }

    const updatedPayment = await supabaseClient
        .from('pagos_web')
        .update({
            estado: 'APLICADO',
            aplicado_en: new Date().toISOString(),
            error_detalle: null,
            datos: {
                ...(paymentRow.datos || {}),
                wompi_status: String(transaction.status || 'APPROVED'),
                wompi_payment_method: transaction.payment_method_type || null,
                wompi_finalized_at: transaction.finalized_at || null,
                creditos_actualizados: savedUpdates
            }
        })
        .eq('id', paymentRow.id);
    if (updatedPayment.error) throw updatedPayment.error;

    return { alreadyApplied: false };
}

async function recoverApprovedCreditPayment() {
    let pending = null;
    try {
        pending = JSON.parse(localStorage.getItem('cupissa_pending_credit_payment') || 'null');
        if (!pending?.transaction || pending.transaction.status !== 'APPROVED') return false;
        if (!currentClient?.id || String(currentClient.id) !== String(pending.clientId)) return false;

        const paymentData = {
            reference: pending.reference,
            amount: Number(pending.amount),
            amountInCents: Number(pending.amountInCents)
        };
        const transaction = pending.transaction;
        if (
            String(transaction.reference || '') !== String(paymentData.reference || '') ||
            Number(transaction.amount_in_cents) !== paymentData.amountInCents ||
            String(transaction.currency || 'COP') !== 'COP'
        ) {
            throw new Error('Los datos del pago guardado no coinciden con la transacción de Wompi.');
        }

        const previousOption = selectedOption;
        selectedOption = pending.mode === 'tot' ? 'tot' : 'min';
        try {
            const applied = await registerAndApplyCreditPayment(paymentData, transaction);
            localStorage.removeItem('cupissa_pending_credit_payment');
            try {
                await loadClientDashboard();
            } catch (refreshError) {
                console.warn('El abono quedó aplicado, pero no se pudo refrescar el panel:', refreshError);
            }
            showToast(applied.alreadyApplied
                ? 'Este pago ya estaba aplicado. Tu crédito está actualizado.'
                : '¡Pago aprobado! Se recuperó el registro y tu crédito quedó actualizado.', false);
            return true;
        } finally {
            selectedOption = previousOption;
        }
    } catch (error) {
        console.error('No fue posible recuperar el abono aprobado:', error);
        showToast('Wompi aprobó el pago, pero el abono aún no se ha aplicado. Recarga el portal para reintentar el registro.', true);
        return false;
    }
}

async function openPaymentGateway() {
    const amountToPay = selectedOption === 'min'
        ? Math.min(Number(minAmountWithMora), Number(totalAmount))
        : Number(totalAmount);

    if (!currentClient || !currentClient.id) {
        showToast('Tu sesión expiró. Ingresa nuevamente al Portal de Pagos.', true);
        return;
    }
    if (!Number.isFinite(amountToPay) || amountToPay <= 0) {
        showToast('No tienes deudas pendientes por pagar.', true);
        return;
    }

    const button = document.querySelector('button[onclick="openPaymentGateway()"]');
    if (button?.dataset.processing === '1') return;
    if (button) {
        button.dataset.processing = '1';
        button.disabled = true;
        button.classList.add('opacity-70', 'cursor-wait');
        const text = document.getElementById('btn-pay-text');
        if (text) text.innerText = 'Abriendo Wompi...';
    }

    let approvedPaymentForRecovery = null;
    try {
        const payment = await payWithWompi({ amount: amountToPay, client: currentClient });
        const transaction = payment.transaction;
        const transactionAmount = Number(transaction.amount_in_cents);
        if (transaction.status !== 'APPROVED') {
            localStorage.removeItem('cupissa_pending_credit_payment');
            if (transaction.status === 'PENDING') {
                showToast('Wompi reportó el pago como PENDIENTE. El crédito no se modificó ni se marcó como pagado.', true);
            } else {
                showToast(`El pago no fue aprobado por Wompi (${transaction.status || 'sin estado'}).`, true);
            }
            return;
        }
        if (String(transaction.reference || '') !== payment.reference || transactionAmount !== payment.amountInCents || String(transaction.currency || 'COP') !== 'COP') {
            throw new Error('Los datos de la transacción recibida no coinciden con el pago solicitado. No se aplicó el abono.');
        }

        approvedPaymentForRecovery = {
            reference: payment.reference,
            amount: payment.amount,
            amountInCents: payment.amountInCents,
            clientId: String(currentClient.id),
            mode: selectedOption,
            transaction,
            createdAt: new Date().toISOString()
        };
        localStorage.setItem('cupissa_pending_credit_payment', JSON.stringify(approvedPaymentForRecovery));

        const applied = await registerAndApplyCreditPayment(payment, transaction);
        localStorage.removeItem('cupissa_pending_credit_payment');
        await loadClientDashboard();
        showToast(applied.alreadyApplied ? 'Este pago ya estaba aplicado. Tu crédito está actualizado.' : '¡Pago aprobado! Tu abono se aplicó correctamente y se actualizó tu próxima fecha de pago.', false);
    } catch (error) {
        console.error('No fue posible abrir o aplicar el pago Wompi:', error);
        if (approvedPaymentForRecovery) {
            try { localStorage.setItem('cupissa_pending_credit_payment', JSON.stringify(approvedPaymentForRecovery)); } catch (_) {}
            showToast('Wompi aprobó el pago, pero no se pudo terminar de aplicar el abono. Recarga el portal para completar el registro sin volver a pagar.', true);
        } else {
            localStorage.removeItem('cupissa_pending_credit_payment');
            showToast(error?.message || 'No fue posible completar el pago. Inténtalo nuevamente.', true);
        }
    } finally {
        if (button) {
            button.dataset.processing = '0';
            button.disabled = false;
            button.classList.remove('opacity-70', 'cursor-wait');
            selectPaymentOption(selectedOption);
        }
    }
}
