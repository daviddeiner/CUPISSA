/**
 * CUPISSA | Catálogo / ventana de favoritos
 * Código extraído de la versión original sin cambiar la lógica.
 */

function openFavoritesModal() {
            if (typeof closeProfileModal === 'function') closeProfileModal();
            // Permite alternar entre Favoritos y Carrito con la barra inferior
            // siempre visible y operativa, sin dejar dos paneles abiertos.
            closeCartModal();
            closePortalModal();
            const container = document.getElementById('favorites-items-container');
            container.innerHTML = '';
            if (favorites.length === 0) {
                container.innerHTML = `
                    <div class="cupissa-empty-state">
                        <div class="cupissa-empty-state-icon"><i class="fa-regular fa-heart" aria-hidden="true"></i></div>
                        <h4>Aún no tienes favoritos</h4>
                        <p>Guarda aquí los productos que te gusten para encontrarlos fácilmente.</p>
                    </div>`;
            } else {
                favorites.forEach(prod => {
                    const foto = prod.fotos && prod.fotos[0] ? prod.fotos[0] : '';
                    const card = document.createElement('div');
                    card.className = "flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs";
                    card.innerHTML = `
                        <div class="flex items-center space-x-3">
                            <img src="${foto}" alt="${prod.nombre} - CUPISSA" class="w-12 h-12 object-cover rounded-xl">
                            <div>
                                <h4 class="font-extrabold text-slate-900 uppercase">${prod.nombre}</h4>
                                <span class="font-black fuchsia-text">${formatCOP(prod.precio_detal)}</span>
                            </div>
                        </div>
                        <button onclick="openOptionsModal('${prod.id}'); closeFavoritesModal();" class="px-3 py-1.5 fuchsia-btn font-bold rounded-xl text-[11px]">Ver Op.</button>
                    `;
                    container.appendChild(card);
                });
            }
            const modal = document.getElementById('modal-favorites');
            modal.classList.remove('hidden');
            modal.setAttribute('aria-hidden', 'false');
            if (typeof setMobileNavSection === 'function') setMobileNavSection('favorites');
        }

        function closeFavoritesModal() {
            const modal = document.getElementById('modal-favorites');
            if (modal) {
                modal.classList.add('hidden');
                modal.setAttribute('aria-hidden', 'true');
                if (typeof setMobileNavSection === 'function') setMobileNavSection('home');
            }
        }
