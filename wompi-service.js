/**
 * CUPISSA - Wompi & Supabase Integration Service (PRODUCCIÓN REAL CON VALIDACIÓN DE PAGO)
 */

const WOMPI_CONFIG = {
    publicKey: 'pub_prod_q69BzlCLtdFiZQEmbQFTMX9uXwr6E4Xg',
    integritySecret: 'prod_integrity_KeQNY1wOw2baT11W9qAXZ2aD82ORXnbL', 
    currency: 'COP'
};

/**
 * Genera la firma SHA-256 exigida por Wompi en Producción
 */
function generateWompiIntegritySignature(reference, amountInCents, currency, secret) {
    const rawString = `${reference}${amountInCents}${currency}${secret}`;
    return CryptoJS.SHA256(rawString).toString(CryptoJS.enc.Hex);
}

/**
 * Calcula la fecha de pago adaptada a cualquier frecuencia
 */
function calculateNextDueDate(currentDateStr, frequency) {
    if (!currentDateStr) {
        const today = new Date();
        return today.toISOString().split('T')[0];
    }

    let [year, month, day] = currentDateStr.split('-').map(Number);
    let d = new Date(year, month - 1, day);

    if (frequency === 'Diario') {
        d.setDate(d.getDate() + 1);
    } else if (frequency === 'Semanal') {
        d.setDate(d.getDate() + 7);
    } else if (frequency === 'Quincenal') {
        if (day <= 15) {
            const lastDayOfCurrentMonth = new Date(year, month, 0).getDate();
            const targetDay = Math.min(day + 15, lastDayOfCurrentMonth);
            d = new Date(year, month - 1, targetDay);
        } else {
            const baseDay = day - 15;
            let nextMonth = month;
            let nextYear = year;
            if (month === 12) {
                nextMonth = 1;
                nextYear = year + 1;
            } else {
                nextMonth = month + 1;
            }
            const lastDayOfNextMonth = new Date(nextYear, nextMonth, 0).getDate();
            const targetDay = Math.min(baseDay, lastDayOfNextMonth);
            d = new Date(nextYear, nextMonth - 1, targetDay);
        }
    } else if (frequency === 'Mensual') {
        d.setMonth(d.getMonth() + 1);
    }

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * Calcula la mora del 4% por cada 5 días de retraso
 */
function calculateMoraDetails(dueDateStr, baseAmount) {
    if (!dueDateStr || baseAmount <= 0) {
        return { daysLate: 0, latePeriods: 0, moraPercentage: 0, moraAmount: 0, totalWithMora: baseAmount };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [year, month, day] = dueDateStr.split('-').map(Number);
    const dueDate = new Date(year, month - 1, day);
    dueDate.setHours(0, 0, 0, 0);

    const diffTime = today - dueDate;
    const daysLate = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

    const latePeriods = Math.floor(daysLate / 5);
    const moraPercentage = latePeriods * 4;
    const moraAmount = Math.round(baseAmount * (moraPercentage / 100));
    const totalWithMora = baseAmount + moraAmount;

    return {
        daysLate,
        latePeriods,
        moraPercentage,
        moraAmount,
        totalWithMora
    };
}

/**
 * PROCESA EL DESCUENTO EN SUPABASE SOLO SI EL PAGO ES EXITOSO (MODO LOCAL/FRONT)
 */
async function processPaymentInSupabaseDirectly(clientId, paidAmount) {
    if (typeof supabaseClient === 'undefined') {
        console.error("supabaseClient no está definido globalmente.");
        return;
    }

    try {
        const { data: credits, error: credError } = await supabaseClient
            .from("creditos")
            .select("*, cuotas_credito(*)")
            .eq("cliente_id", clientId)
            .eq("estado", "ACTIVO");

        if (credError || !credits || credits.length === 0) return;

        let remainingPayment = Number(paidAmount);
        let totalNewDebt = 0;
        const todayStr = new Date().toISOString().split('T')[0];

        for (const cred of credits) {
            let cuotas = (cred.cuotas_credito || []).sort((a, b) => a.numero_cuota - b.numero_cuota);

            for (const cuota of cuotas) {
                if (cuota.estado === 'PAGADO' || remainingPayment <= 0) continue;

                let valorCuota = Number(cuota.valor_cuota || 0);
                if (remainingPayment >= valorCuota) {
                    remainingPayment -= valorCuota;

                    await supabaseClient
                        .from("cuotas_credito")
                        .update({ estado: 'PAGADO', fecha_pago: todayStr })
                        .eq("id", cuota.id);
                } else {
                    remainingPayment = 0;
                }
            }

            // Recalcular deuda actual de este crédito tras el pago de cuotas
            const { data: cuotasActualizadas } = await supabaseClient
                .from("cuotas_credito")
                .select("*")
                .eq("credito_id", cred.id);

            const deudaRestanteCredito = (cuotasActualizadas || [])
                .filter(c => c.estado !== 'PAGADO')
                .reduce((sum, c) => sum + Number(c.valor_cuota || 0), 0);

            let newStatus = deudaRestanteCredito <= 0 ? "PAGADO" : "ACTIVO";
            totalNewDebt += deudaRestanteCredito;

            await supabaseClient
                .from("creditos")
                .update({
                    deuda_actual: deudaRestanteCredito,
                    estado: newStatus
                })
                .eq("id", cred.id);
        }

        const { data: clientData } = await supabaseClient
            .from("clientes")
            .select("*")
            .eq("id", clientId)
            .single();

        if (clientData) {
            let cupoTotal = Number(clientData.cupo_total || 300000);
            // El cupo disponible se actualiza reflejando la nueva deuda actual (sin sumar bonos inmediatos)
            let newCupoDisponible = Math.max(0, cupoTotal - totalNewDebt);

            await supabaseClient
                .from("clientes")
                .update({
                    cupo_disponible: newCupoDisponible
                })
                .eq("id", clientId);
        }

    } catch (err) {
        console.error("Error aplicando el descuento en Supabase:", err);
    }
}

/**
 * Ejecuta el Widget de Wompi validando el estado APPROVED real
 */
function payWithWompi({ amount, client, referencePrefix = 'CUPISSA', onSuccess, onError }) {
    if (!amount || amount <= 0) {
        alert('El monto a pagar debe ser mayor a $0.');
        return;
    }

    if (typeof WidgetCheckout === 'undefined') {
        alert('Error: El SDK de Wompi no se ha cargado en esta página. Revisa tu conexión a internet.');
        return;
    }

    if (typeof CryptoJS === 'undefined') {
        alert('Error: La librería CryptoJS no se ha cargado. Verifica tu index.html.');
        return;
    }

    const amountInCents = Math.round(amount * 100);
    const reference = `${referencePrefix}_${client.id}_${Date.now()}`;
    const cleanPhone = (client.telefono || '').replace(/\D/g, '');

    const integritySignature = generateWompiIntegritySignature(
        reference,
        amountInCents,
        WOMPI_CONFIG.currency,
        WOMPI_CONFIG.integritySecret
    );

    const checkout = new WidgetCheckout({
        currency: WOMPI_CONFIG.currency,
        amountInCents: amountInCents,
        reference: reference,
        publicKey: WOMPI_CONFIG.publicKey,
        signature: {
            integrity: integritySignature
        },
        customerData: {
            email: client.correo || `${cleanPhone}@cupissa.com`,
            fullName: client.nombre,
            phoneNumber: cleanPhone,
            phoneNumberPrefix: '+57'
        }
    });

    checkout.open(async function (result) {
        const transaction = result?.transaction;
        
        // VALIDACIÓN ESTRICTA: Solo si la transacción está APROBADA se descuenta y procesa
        if (transaction && transaction.status === 'APPROVED') {
            console.log("Pago APROBADO por Wompi. Procesando descuento...", transaction);
            await processPaymentInSupabaseDirectly(client.id, amount);
            if (onSuccess) onSuccess(transaction);
        } else {
            console.warn("Pago rechazado, cancelado o no aprobado:", transaction?.status);
            if (onError) onError(transaction);
        }
    });
}