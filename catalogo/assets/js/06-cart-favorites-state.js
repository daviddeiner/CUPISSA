/**
 * CUPISSA | Catálogo / estado del carrito y favoritos
 * Código extraído de la versión original sin cambiar la lógica.
 */

function addModalProductToCart() {
            if (!selectedProductModal) return;

            const selectTalla = document.getElementById('opt-select-talla');
            const selectColor = document.getElementById('opt-select-color');
            const inputCustom = document.getElementById('opt-input-custom');
            const selectAccesorio = document.getElementById('opt-select-accesorio');

            const talla = selectTalla && selectTalla.value ? selectTalla.value : null;
            const color = selectColor && selectColor.value ? selectColor.value : null;
            const customText = inputCustom ? inputCustom.value.trim() : '';
            const accesorio = selectAccesorio && selectAccesorio.value ? selectAccesorio.value : null;
            const accesorioFoto = selectAccesorio && selectAccesorio.selectedOptions[0] ? (selectAccesorio.selectedOptions[0].dataset.photo || '') : '';

            let unitPrice = selectedModalidad === 'alquiler' ? (selectedProductModal.precio_alquiler || 0) : selectedProductModal.precio_detal;
            if (selectedModalidad === 'venta' && selectedProductModal.cant_min_mayorista && selectedQtyModal >= selectedProductModal.cant_min_mayorista && selectedProductModal.precio_mayorista) {
                unitPrice = selectedProductModal.precio_mayorista;
            }

            if (selectTalla && selectTalla.selectedOptions[0]) unitPrice += parseFloat(selectTalla.selectedOptions[0].dataset.inc || 0);
            if (selectColor && selectColor.selectedOptions[0]) unitPrice += parseFloat(selectColor.selectedOptions[0].dataset.inc || 0);
            if (selectAccesorio && selectAccesorio.selectedOptions[0]) unitPrice += parseFloat(selectAccesorio.selectedOptions[0].dataset.inc || 0);

            const cartItem = {
                cartId: `${selectedProductModal.id}_${Date.now()}`,
                productId: selectedProductModal.id,
                nombre: selectedProductModal.nombre,
                modalidad: selectedModalidad.toUpperCase(),
                foto: selectedProductModal.fotos && selectedProductModal.fotos[0] ? selectedProductModal.fotos[0] : '',
                talla,
                color,
                accesorio,
                accesorioFoto,
                customText,
                cantidad: selectedQtyModal,
                precioUnitario: unitPrice,
                total: unitPrice * selectedQtyModal,
                deposito: selectedModalidad === 'alquiler' ? (selectedProductModal.valor_deposito || 0) * selectedQtyModal : 0,
                porcentajeAnticipo: selectedProductModal.porcentaje_anticipo || 20,
                valorAnticipo: Math.round((unitPrice * selectedQtyModal) * ((selectedProductModal.porcentaje_anticipo || 20) / 100))
            };

            cart.push(cartItem);
            saveCart();

            // Mantener al cliente en la ficha del producto y confirmar visualmente
            // que se agregó al carrito, sin abrir ni cambiar de sección.
            animateProductToCart(cartItem.foto);
            showCartAddedFeedback();
        }

        // Estado compartido del catálogo: carrito y favoritos se guardan en el navegador,
        // sin separarlos por cuenta. Así el checkout siempre lee la misma lista visible.
        function parseStoredArray(value) {
            try {
                const parsed = JSON.parse(value || '[]');
                return Array.isArray(parsed) ? parsed : [];
            } catch (_) {
                return [];
            }
        }

        function getAccountScopedCandidates(prefix) {
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(`${prefix}_account_`)) keys.push(key);
            }

            // Conserva el carrito más recientemente actualizado como migración
            // de los datos que se habían guardado en las versiones por cuenta.
            return keys.map(key => {
                const accountPart = key.slice(`${prefix}_account_`.length);
                const updatedKey = `cupissa_catalog_updated_account_${accountPart}`;
                const updatedAt = localStorage.getItem(updatedKey);
                const timestamp = updatedAt ? new Date(updatedAt).getTime() : 0;
                return { key, timestamp: Number.isFinite(timestamp) ? timestamp : 0 };
            }).sort((a, b) => b.timestamp - a.timestamp);
        }

        function restoreSharedValue(storageKey, scopedPrefix) {
            const current = parseStoredArray(localStorage.getItem(storageKey));
            if (current.length) return current;

            for (const candidate of getAccountScopedCandidates(scopedPrefix)) {
                const legacy = parseStoredArray(localStorage.getItem(candidate.key));
                if (legacy.length) {
                    try {
                        localStorage.setItem(storageKey, JSON.stringify(legacy));
                    } catch (error) {
                        console.warn(`No fue posible migrar ${storageKey}:`, error);
                    }
                    return legacy;
                }
            }
            return current;
        }

        function initializeCatalogAccountState() {
            // Se mantiene el nombre de inicialización para no cambiar los módulos
            // que ya lo invocan, pero ya no se requiere sesión ni consulta remota.
            cart = restoreSharedValue('cupissa_cart', 'cupissa_cart');
            favorites = restoreSharedValue('cupissa_favs', 'cupissa_favs');
            updateBadges();
            return Promise.resolve({ cart, favorites });
        }

        function saveCart() {
            try {
                localStorage.setItem('cupissa_cart', JSON.stringify(cart));
            } catch (error) {
                console.error('No fue posible guardar el carrito CUPISSA:', error);
            }
            updateBadges();
        }

        function saveFavorites() {
            try {
                localStorage.setItem('cupissa_favs', JSON.stringify(favorites));
            } catch (error) {
                console.error('No fue posible guardar los favoritos CUPISSA:', error);
            }
            updateBadges();
            applyFiltersAndSearch();
        }

        function updateBadges() {
            const cartCount = cart.reduce((acc, c) => acc + c.cantidad, 0);
            const badgeValues = {
                'cart-badge-count': cartCount,
                'fav-badge-count': favorites.length,
                'mobile-cart-badge-count': cartCount,
                'mobile-fav-badge-count': favorites.length
            };
            Object.entries(badgeValues).forEach(([id, value]) => {
                const badge = document.getElementById(id);
                if (badge) badge.innerText = value;
            });
        }

        function toggleFavorite(prodId, e) {
            if (e) e.stopPropagation();
            const prod = rawProducts.find(p => p.id === prodId);
            if (!prod) return;
            const idx = favorites.findIndex(f => f.id === prodId);
            if (idx >= 0) favorites.splice(idx, 1);
            else favorites.push(prod);
            saveFavorites();
        }

        function toggleFavoriteCurrent() {
            if (selectedProductModal) {
                toggleFavorite(selectedProductModal.id);
                const isFav = favorites.some(f => f.id === selectedProductModal.id);
                document.getElementById('btn-modal-fav').innerHTML = `<i class="${isFav ? 'fa-solid fa-heart text-pink-600' : 'fa-regular fa-heart'} text-xl"></i>`;
            }
        }
