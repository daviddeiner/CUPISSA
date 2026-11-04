/**
 * CUPISSA | Catálogo / inicialización y scroll progresivo.
 * El lote siguiente se agrega antes de que el usuario alcance el final en móvil y escritorio.
 */

let productsInfiniteObserver = null;

function loadNextProductsBatch() {
    if (isLoadingMore || displayLimit >= filteredProducts.length) return;

    isLoadingMore = true;
    const statusContainer = document.getElementById('scroll-status-container');
    const loadingMsg = document.getElementById('scroll-loading-msg');
    const endMsg = document.getElementById('scroll-end-msg');

    if (statusContainer) statusContainer.classList.remove('hidden');
    if (loadingMsg) loadingMsg.classList.remove('hidden');
    if (endMsg) endMsg.classList.add('hidden');

    window.setTimeout(() => {
        displayLimit = Math.min(displayLimit + 12, filteredProducts.length);
        renderProductsGrid();
        isLoadingMore = false;

        // Si el lote recién añadido todavía deja la sentinela cerca, carga otro lote
        // para evitar que el usuario vea un hueco o tenga que llegar al pie de página.
        window.requestAnimationFrame(() => {
            const sentinel = document.getElementById('scroll-status-container');
            if (!sentinel || displayLimit >= filteredProducts.length) return;
            const nearViewport = sentinel.getBoundingClientRect().top <= window.innerHeight + 700;
            if (nearViewport) loadNextProductsBatch();
        });
    }, 160);
}

function setupInfiniteProductLoading() {
    const sentinel = document.getElementById('scroll-status-container');
    if (!sentinel) return;

    if ('IntersectionObserver' in window) {
        productsInfiniteObserver = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) loadNextProductsBatch();
        }, {
            root: null,
            rootMargin: '700px 0px',
            threshold: 0
        });
        productsInfiniteObserver.observe(sentinel);
    } else {
        window.addEventListener('scroll', () => {
            if (isLoadingMore || displayLimit >= filteredProducts.length) return;
            const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 900;
            if (nearBottom) loadNextProductsBatch();
        }, { passive: true });
    }
}

window.onload = function() {
    updateBadges();
    setupInfiniteProductLoading();
    fetchCatalogProducts();
    if (typeof initializeCatalogAccountState === 'function') {
        Promise.resolve(initializeCatalogAccountState()).catch(error => {
            console.warn('No fue posible restaurar el carrito y favoritos de la cuenta:', error);
        });
    }
};
