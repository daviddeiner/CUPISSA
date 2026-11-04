/* CUPISSA | Indicadores simulados de lanzamiento por producto.
   Valores ilustrativos, estables durante el día y diferentes por producto.
   La actualización se ejecuta únicamente cuando el catálogo dibuja las tarjetas. */
(() => {
  const metricCache = new Map();
  let dayKey = '';

  function currentDayKey() {
    if (dayKey) return dayKey;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    dayKey = `${values.year}-${values.month}-${values.day}`;
    return dayKey;
  }

  function hashText(value) {
    let hash = 2166136261;
    const text = String(value || 'CUPISSA');
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function simulatedMetrics(productId) {
    const seed = `${productId}|${currentDayKey()}|CUPISSA-LAUNCH`;
    const first = hashText(seed);
    const second = hashText(`${seed}|POPULARIDAD`);
    const viewers = 20 + (first % 61); // 20 a 80
    const maxPurchases = Math.max(10, Math.min(45, viewers - 1));
    const purchases = 10 + (second % (maxPurchases - 9)); // 10 a 45, menor que las vistas
    return { viewers, purchases };
  }

  function updateVisibleCards() {
    document.querySelectorAll('[data-activity-product]').forEach(card => {
      const productId = String(card.dataset.activityProduct || '');
      if (!productId) return;

      let metrics = metricCache.get(productId);
      if (!metrics) {
        metrics = simulatedMetrics(productId);
        metricCache.set(productId, metrics);
      }

      const views = card.querySelector('[data-activity-viewers]');
      const purchases = card.querySelector('[data-activity-purchases]');
      const viewsText = `${metrics.viewers}+`;
      const purchasesText = `${metrics.purchases}+`;

      // Evita escrituras DOM innecesarias.
      if (views && views.textContent !== viewsText) views.textContent = viewsText;
      if (purchases && purchases.textContent !== purchasesText) purchases.textContent = purchasesText;
      if (card.hidden) card.hidden = false;
    });
  }

  // renderProductsGrid llama esta función después de insertar las tarjetas.
  // No usar MutationObserver: modificar textContent genera nuevas mutaciones
  // y puede provocar un ciclo continuo que bloquee el catálogo.
  window.loadProductActivityMetrics = function(products) {
    if (!Array.isArray(products)) return;
    products.forEach(product => {
      const id = String(product?.id || '');
      if (id && !metricCache.has(id)) {
        metricCache.set(id, simulatedMetrics(id));
      }
    });
    updateVisibleCards();
  };
})();
