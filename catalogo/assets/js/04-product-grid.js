/** CUPISSA | Grilla principal y destacados de temporada. */

function catalogProductCard(prod, options = {}) {
    const isFav = favorites.some(f => String(f.id) === String(prod.id));
    const mainFoto = prod.fotos && prod.fotos.length > 0 ? prod.fotos[0] : 'https://via.placeholder.com/400x400?text=Cupissa';
    const hasRentalPrice = Boolean(prod.alquiler && Number(prod.precio_alquiler) > 0);
    const basePrice = hasRentalPrice ? Number(prod.precio_alquiler) : Number(prod.precio_detal || 0);
    const basePriceLabel = 'Desde';
    const card = document.createElement('div');
    card.className = options.featured
        ? 'bg-white rounded-2xl overflow-hidden border border-pink-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group'
        : 'bg-white rounded-2xl sm:rounded-3xl overflow-hidden border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group';
    card.innerHTML = `
        <div>
            <div class="relative bg-slate-100 aspect-square overflow-hidden">
                <img src="${mainFoto}" alt="${prod.nombre} - CUPISSA Colombia" title="${prod.nombre} - CUPISSA" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
                <div class="absolute top-2 left-2 sm:top-3 sm:left-3 flex flex-col gap-1 items-start">
                    ${prod.temporada ? `<span class="bg-pink-600 text-white font-black text-[8px] sm:text-[9px] uppercase tracking-wider px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full shadow-sm">${prod.temporada}</span>` : ''}
                </div>
                <button onclick="toggleFavorite('${prod.id}', event)" class="absolute top-2 right-2 sm:top-3 sm:right-3 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/80 backdrop-blur-md text-slate-400 hover:text-pink-600 flex items-center justify-center transition-colors shadow-sm" aria-label="Agregar a favoritos">
                    <i class="${isFav ? 'fa-solid fa-heart text-pink-600 text-xs sm:text-sm' : 'fa-regular fa-heart text-xs sm:text-sm'}"></i>
                </button>
            </div>
            <div class="p-2.5 sm:p-4 space-y-1 sm:space-y-2">
                <span class="text-[9px] sm:text-[10px] font-black uppercase text-pink-600 tracking-wider">${prod.subcategoria || prod.categoria || 'TEXTIL'}</span>
                <h3 class="product-card-title font-extrabold text-slate-900 text-[10px] leading-snug sm:text-xs uppercase tracking-tight">${prod.nombre}</h3>
                <div class="product-activity" data-activity-product="${String(prod.id)}" hidden aria-live="polite">
                    <span><i class="fa-regular fa-eye"></i><strong data-activity-viewers>20+</strong> personas viendo</span>
                    <span><i class="fa-solid fa-bag-shopping"></i><strong data-activity-purchases>10+</strong> comprados hoy</span>
                    <small class="activity-disclaimer"></small>
                </div>
            </div>
        </div>
        <div class="p-2.5 sm:p-4 pt-0 flex flex-col sm:flex-row sm:items-center justify-between border-t border-slate-50 mt-1 sm:mt-2 gap-1.5 sm:gap-2">
            <div>
                <span class="text-[8px] sm:text-[10px] text-slate-400 block font-semibold">${basePriceLabel}</span>
                <span class="font-black text-slate-900 text-xs sm:text-base">${formatCOP(basePrice)}</span>
            </div>
            <button type="button" onclick="openOptionsModal('${prod.id}')" class="product-card-cart-button w-10 h-9 sm:w-12 sm:h-11 fuchsia-btn font-extrabold rounded-xl sm:rounded-2xl shadow-md transition-all flex items-center justify-center" aria-label="Ver opciones y agregar ${prod.nombre} al carrito" title="Agregar al carrito">
                <i class="fa-solid fa-cart-shopping text-sm sm:text-base" aria-hidden="true"></i>
            </button>
        </div>`;
    return card;
}

function renderSeasonFeatured() {
    updateFeaturedSeasonProducts(false);
    const section = document.getElementById('season-featured');
    const name = document.getElementById('season-featured-name');
    const grid = document.getElementById('season-featured-grid');
    if (!section || !grid) return;
    if (!featuredSeasonProducts.length) {
        section.classList.add('hidden');
        grid.innerHTML = '';
        return;
    }
    section.classList.remove('hidden');
    if (name) name.textContent = featuredSeasonName ? `· ${featuredSeasonName}` : '';
    grid.innerHTML = '';
    featuredSeasonProducts.forEach(product => grid.appendChild(catalogProductCard(product, { featured:true })));
}

function renderProductsGrid() {
    const grid = document.getElementById('products-grid');
    grid.innerHTML = '';
    const statusContainer = document.getElementById('scroll-status-container');
    const loadingMsg = document.getElementById('scroll-loading-msg');
    const endMsg = document.getElementById('scroll-end-msg');

    const searchValue = (document.getElementById('smart-search-input')?.value || '').trim();
    const hasActiveFilters = activeMundo !== 'TODOS'
        || activeTemporada !== 'TODAS'
        || activeCategoria !== 'TODAS'
        || activeSubcategoria !== 'TODAS'
        || searchValue.length > 0;

    const featuredSection = document.getElementById('season-featured');
    if (hasActiveFilters) {
        if (featuredSection) featuredSection.classList.add('hidden');
    } else {
        renderSeasonFeatured();
    }

    if (filteredProducts.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full cupissa-empty-state cupissa-empty-catalog">
                <div class="cupissa-empty-state-icon"><i class="fa-solid fa-box-open" aria-hidden="true"></i></div>
                <h3>Por aquí todavía no hay productos</h3>
                <p>Prueba con otro mundo o ajusta los filtros para descubrir más de CUPISSA.</p>
            </div>`;
        statusContainer.classList.add('hidden');
        return;
    }

    const productsToShow = filteredProducts.slice(0, displayLimit);
    const query = searchValue;

    productsToShow.forEach((prod, index) => {
        if (query && currentNonMatches.length > 0 && index === currentMatches.length) {
            const separator = document.createElement('div');
            separator.className = 'col-span-full my-4 flex items-center justify-center';
            separator.innerHTML = `
                <div class="flex-grow border-t border-slate-300"></div>
                <span class="flex-shrink mx-4 text-xs font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-4 py-1.5 rounded-full shadow-xs">Más productos del catálogo</span>
                <div class="flex-grow border-t border-slate-300"></div>`;
            grid.appendChild(separator);
        }
        grid.appendChild(catalogProductCard(prod));
    });

    if (typeof window.loadProductActivityMetrics === 'function') {
        const activityProducts = hasActiveFilters
            ? productsToShow
            : [...featuredSeasonProducts, ...productsToShow];
        window.loadProductActivityMetrics(activityProducts);
    }
    statusContainer.classList.remove('hidden');
    loadingMsg.classList.add('hidden');
    if (displayLimit >= filteredProducts.length) endMsg.classList.remove('hidden');
    else endMsg.classList.add('hidden');
}
