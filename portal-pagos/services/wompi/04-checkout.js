/**
 * CUPISSA | Integración directa con Wompi Widget Checkout.
 * No invoca funciones Edge ni necesita Supabase para abrir la pasarela.
 * Los dos valores de configuración se completan en /shared/js/supabase-config.js.
 */
(function (global) {
  'use strict';

  const CURRENCY = 'COP';

  function getConfig() {
    const config = global.CUPISSA_WOMPI_CONFIG || {};
    const publicKey = String(config.publicKey || '').trim();
    const integritySecret = String(config.integritySecret || '').trim();

    if (!publicKey || publicKey.startsWith('REEMPLAZAR_')) {
      throw new Error('Falta configurar la llave pública de Wompi en shared/js/supabase-config.js.');
    }
    if (!integritySecret || integritySecret.startsWith('REEMPLAZAR_')) {
      throw new Error('Falta configurar el secreto de integridad de Wompi en shared/js/supabase-config.js.');
    }
    return { publicKey, integritySecret, currency: config.currency || CURRENCY };
  }

  function createReference(prefix) {
    const randomBytes = new Uint8Array(8);
    global.crypto.getRandomValues(randomBytes);
    const randomPart = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
    const safePrefix = String(prefix || 'CUPISSA').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 35) || 'CUPISSA';
    return `${safePrefix}-${Date.now()}-${randomPart}`;
  }

  async function sha256Hex(value) {
    if (!global.crypto?.subtle || !global.TextEncoder) {
      throw new Error('El navegador no permite generar la firma Wompi. Abre CUPISSA usando HTTPS en un navegador actualizado.');
    }
    const encoded = new global.TextEncoder().encode(value);
    const digest = await global.crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function preparePayment(amount, options = {}) {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw new Error('El monto a pagar debe ser mayor a $0.');
    }

    const config = getConfig();
    const amountInCents = Math.round(numericAmount * 100);
    if (!Number.isSafeInteger(amountInCents) || amountInCents <= 0) {
      throw new Error('El monto no es válido para Wompi.');
    }

    const reference = options.reference || createReference(options.referencePrefix || 'CUPISSA');
    const signature = await sha256Hex(`${reference}${amountInCents}${config.currency}${config.integritySecret}`);

    return {
      reference,
      amount: numericAmount,
      amountInCents,
      currency: config.currency,
      publicKey: config.publicKey,
      signature
    };
  }

  function openCheckout(payment, customer = {}) {
    return new Promise((resolve, reject) => {
      if (typeof global.WidgetCheckout !== 'function') {
        reject(new Error('No se cargó el servicio de Wompi. Recarga la página e inténtalo nuevamente.'));
        return;
      }

      const phone = String(customer.telefono || customer.phoneNumber || '').replace(/\D/g, '').replace(/^57/, '');
      const fullName = String(customer.fullName || [customer.nombres, customer.apellidos].filter(Boolean).join(' ') || customer.nombre || 'Cliente CUPISSA').trim();
      const email = String(customer.correo || customer.email || '').trim();

      try {
        const checkout = new global.WidgetCheckout({
          currency: payment.currency || CURRENCY,
          amountInCents: Number(payment.amountInCents),
          reference: String(payment.reference),
          publicKey: String(payment.publicKey),
          signature: { integrity: String(payment.signature) },
          customerData: {
            email,
            fullName,
            phoneNumber: phone,
            phoneNumberPrefix: '+57'
          }
        });

        checkout.open(result => {
          const transaction = result?.transaction || (result?.id ? result : null);
          if (!transaction) {
            reject(new Error('Wompi terminó el proceso, pero no devolvió los datos de la transacción.'));
            return;
          }
          resolve(transaction);
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error('No fue posible abrir el checkout de Wompi.'));
      }
    });
  }

  async function payWithWompi({ amount, client }) {
    if (!client?.id) throw new Error('No se encontró la sesión del cliente. Ingresa nuevamente al Portal de Pagos.');
    const payment = await preparePayment(amount, { referencePrefix: 'CUPISSA-CREDITO' });

    try {
      global.localStorage.setItem('cupissa_pending_credit_payment', JSON.stringify({
        reference: payment.reference,
        amount: payment.amount,
        amountInCents: payment.amountInCents,
        clientId: String(client.id),
        createdAt: new Date().toISOString()
      }));
    } catch (error) {
      console.warn('No fue posible guardar la referencia del pago:', error);
    }

    const transaction = await openCheckout(payment, client);
    return { ...payment, transaction };
  }

  global.CUPISSA_WOMPI = Object.freeze({
    createReference,
    preparePayment,
    openCheckout
  });
  global.payWithWompi = payWithWompi;
})(window);
