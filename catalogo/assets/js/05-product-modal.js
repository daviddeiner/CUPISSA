/**
 * CUPISSA | Catálogo / ficha, opciones y precios de producto
 * Código extraído de la versión original sin cambiar la lógica.
 */

function cupissaNormalizePhotoUrl(value) {
    try {
        const url = new URL(String(value || ''), window.location.origin);
        return decodeURIComponent(url.pathname).replace(/\/+/g, '/').toLowerCase();
    } catch (_) { return String(value || '').trim().toLowerCase(); }
}

function cupissaFindColorForPhoto(product, photo) {
    const key = cupissaNormalizePhotoUrl(photo);
    return (product?.colores || []).find(color => {
        const linked = String(color?.foto || color?.imagen || color?.imagen_url || '').trim();
        return linked && cupissaNormalizePhotoUrl(linked) === key;
    }) || null;
}

function cupissaSelectColorForPhoto(product, photo) {
    const color = cupissaFindColorForPhoto(product, photo);
    const select = document.getElementById('opt-select-color');
    if (!color || !select) return;
    const option = Array.from(select.options).find(item =>
        String(item.value).trim().toUpperCase() === String(color.nombre || '').trim().toUpperCase()
    );
    if (option) {
        select.value = option.value;
        recalculateProductPrice();
    }
}

function openOptionsModal(prodId) {
            const prod = rawProducts.find(p => String(p.id) === String(prodId));
            if (!prod) return;

            selectedProductModal = prod;
            selectedQtyModal = 1;
            activePhotoIndex = 0;

            const wrapperModalidad = document.getElementById('wrapper-modalidad');
            if (prod.alquiler && prod.precio_alquiler > 0) {
                wrapperModalidad.classList.remove('hidden');
                selectedModalidad = 'venta';
            } else {
                wrapperModalidad.classList.add('hidden');
                selectedModalidad = 'venta';
            }

            updateModalidadUI();

            document.getElementById('opt-modal-title').innerText = prod.nombre;
            document.getElementById('opt-modal-subcat').innerText = (prod.subcategorias?.length ? prod.subcategorias : (prod.categorias?.length ? prod.categorias : [prod.subcategoria || prod.categoria || 'TEXTIL'])).join(' · ');
            document.getElementById('opt-modal-ref').innerText = `Ref: CUP-${prod.id.toString().slice(-4)}`;

            const wrapDesc = document.getElementById('wrapper-descripcion');
            const txtDesc = document.getElementById('opt-modal-desc');
            if (prod.descripcion && prod.descripcion.trim() !== '') {
                txtDesc.innerText = prod.descripcion;
                wrapDesc.classList.remove('hidden');
            } else {
                wrapDesc.classList.add('hidden');
            }

            const badgesContainer = document.getElementById('opt-modal-badges');
            badgesContainer.innerHTML = '';
            const modalFilterBadges = [
                ...(prod.subcategorias || []),
                ...(prod.temporadas || [])
            ];
            modalFilterBadges.forEach(value => {
                const badge = document.createElement('span');
                badge.className = 'bg-pink-600 text-white font-black text-[9px] uppercase px-2.5 py-1 rounded-full';
                badge.textContent = value;
                badgesContainer.appendChild(badge);
            });

            const mainImg = document.getElementById('opt-modal-img');
            const fotos = prod.fotos && prod.fotos.length > 0 ? prod.fotos : ['https://via.placeholder.com/400x400?text=Cupissa'];
            mainImg.onload = () => {
                if (mainImg.naturalWidth && mainImg.naturalHeight) {
                    mainImg.style.aspectRatio = `${mainImg.naturalWidth} / ${mainImg.naturalHeight}`;
                    mainImg.style.objectFit = 'contain';
                }
            };
            mainImg.src = fotos[0];
            mainImg.alt = `${prod.nombre} - CUPISSA`;
            mainImg.title = `${prod.nombre} - CUPISSA`;

            const thumbsContainer = document.getElementById('opt-modal-thumbs');
            thumbsContainer.innerHTML = '';
            if (fotos.length > 1) {
                fotos.forEach((url, idx) => {
                    const thumb = document.createElement('img');
                    thumb.src = url;
                    thumb.alt = `${prod.nombre} vista ${idx+1} - CUPISSA`;
                    thumb.title = `${prod.nombre} vista ${idx+1}`;
                    thumb.className = `w-12 h-12 object-cover rounded-xl border-2 cursor-pointer ${idx === 0 ? 'fuchsia-border' : 'border-transparent'}`;
                    thumb.onclick = () => {
                        activePhotoIndex = idx;
                        mainImg.src = url;
                        document.querySelectorAll('#opt-modal-thumbs img').forEach(t => t.className = 'w-12 h-12 object-cover rounded-xl border-2 border-transparent');
                        thumb.className = 'w-12 h-12 object-cover rounded-xl border-2 fuchsia-border';
                        // Seleccionar una foto también selecciona el color que el administrador vinculó a ella.
                        const matchedColor = cupissaFindColorForPhoto(selectedProductModal, url);
                        if (matchedColor) {
                            cupissaSelectColorForPhoto(selectedProductModal, url);
                        } else {
                            const colors = selectedProductModal.colores || [];
                            if (colors.length === fotos.length && colors[idx]) {
                                const select = document.getElementById('opt-select-color');
                                if (select) { select.value = colors[idx].nombre; recalculateProductPrice(); }
                            }
                        }
                    };
                    thumbsContainer.appendChild(thumb);
                });
            }

            const wrapTallas = document.getElementById('wrapper-tallas');
            const selectTalla = document.getElementById('opt-select-talla');
            selectTalla.innerHTML = '';
            if (prod.tallas && prod.tallas.length > 0) {
                prod.tallas.forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = t.nombre;
                    opt.dataset.inc = t.incremento || 0;
                    opt.innerText = t.incremento > 0 ? `${t.nombre} (+${formatCOP(t.incremento)})` : t.nombre;
                    selectTalla.appendChild(opt);
                });
                wrapTallas.classList.remove('hidden');
                if (typeof enhanceCupissaSelect === 'function') enhanceCupissaSelect(selectTalla, 'Selecciona una talla');
            } else {
                wrapTallas.classList.add('hidden');
            }

            const wrapColores = document.getElementById('wrapper-colores');
            const selectColor = document.getElementById('opt-select-color');
            selectColor.innerHTML = '';
            if (prod.colores && prod.colores.length > 0) {
                prod.colores.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.nombre;
                    opt.dataset.inc = c.incremento || 0;
                    opt.dataset.photo = String(c.foto || c.imagen || c.imagen_url || '').trim();
                    opt.innerText = c.incremento > 0 ? `${c.nombre} (+${formatCOP(c.incremento)})` : c.nombre;
                    selectColor.appendChild(opt);
                });
                wrapColores.classList.remove('hidden');
                if (typeof enhanceCupissaSelect === 'function') enhanceCupissaSelect(selectColor, 'Selecciona un color');
                selectColor.onchange = handleProductColorChange;
                handleProductColorChange();
            } else {
                selectColor.onchange = null;
                wrapColores.classList.add('hidden');
            }

            const wrapAccesorios = document.getElementById('wrapper-accesorios');
            const selectAccesorio = document.getElementById('opt-select-accesorio');
            const accessoryList = document.getElementById('accessory-options-list');
            if (selectAccesorio && accessoryList && wrapAccesorios) {
                selectAccesorio.innerHTML = '';
                accessoryList.innerHTML = '';
                // Sin opción artificial: cero accesorios seleccionados es el estado inicial.
                selectedCupissaAccessories.clear();
                const emptyOpt = document.createElement('option');
                emptyOpt.value = '';
                selectAccesorio.appendChild(emptyOpt);

                const accessories = Array.isArray(prod.accesorios) ? prod.accesorios : [];
                if (accessories.length) {
                    accessories.forEach((accessory, index) => {
                        const name = String(accessory.nombre || accessory.name || '').trim();
                        if (!name) return;
                        const extra = Number(accessory.incremento || accessory.adicional || 0);
                        const photo = String(accessory.foto || accessory.imagen || accessory.imagen_url || '').trim();
                        const opt = document.createElement('option');
                        opt.value = name;
                        opt.dataset.inc = String(extra);
                        opt.dataset.photo = photo;
                        selectAccesorio.appendChild(opt);

                        // La tarjeta exterior es un contenedor seleccionable; el botón interno abre la foto completa.
                        const choice = document.createElement('div');
                        choice.className = 'accessory-choice';
                        choice.dataset.accessoryIndex = String(index);
                        choice.dataset.accessoryValue = name;
                        choice.setAttribute('role', 'button');
                        choice.setAttribute('tabindex', '0');
                        choice.setAttribute('aria-pressed', 'false');

                        const imageWrap = document.createElement('span');
                        imageWrap.className = 'accessory-image-wrap';
                        if (photo) {
                            const image = document.createElement('img');
                            image.src = photo;
                            image.alt = `Accesorio ${name}`;
                            image.loading = 'lazy';
                            image.decoding = 'async';
                            image.className = 'accessory-choice-image';
                            imageWrap.appendChild(image);

                            const viewButton = document.createElement('button');
                            viewButton.type = 'button';
                            viewButton.className = 'accessory-view-trigger';
                            viewButton.setAttribute('aria-label', `Ver imagen completa de ${name}`);
                            viewButton.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i><span class="accessory-view-label">Ver</span>';
                            viewButton.addEventListener('click', (event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                openAccessoryImageModal(photo, name);
                            });
                            imageWrap.appendChild(viewButton);
                        } else {
                            imageWrap.classList.add('accessory-image-empty');
                            imageWrap.innerHTML = '<i class="fa-solid fa-image" aria-hidden="true"></i>';
                        }

                        const details = document.createElement('span');
                        details.className = 'accessory-choice-details';
                        const title = document.createElement('strong');
                        title.className = 'accessory-choice-name';
                        title.textContent = name;
                        const price = document.createElement('small');
                        price.className = 'accessory-choice-price';
                        price.textContent = extra > 0 ? `+${formatCOP(extra)}` : 'Sin incremento';
                        details.append(title, price);
                        choice.append(imageWrap, details);

                        const selectChoice = () => {
                            if (selectedCupissaAccessories.has(name)) selectedCupissaAccessories.delete(name);
                            else selectedCupissaAccessories.add(name);
                            updateAccessoryChoiceState();
                            recalculateProductPrice();
                        };
                        choice.addEventListener('click', selectChoice);
                        choice.addEventListener('keydown', (event) => {
                            if (event.target === choice && (event.key === 'Enter' || event.key === ' ')) {
                                event.preventDefault();
                                selectChoice();
                            }
                        });
                        accessoryList.appendChild(choice);
                    });

                    wrapAccesorios.classList.remove('hidden');
                } else {
                    wrapAccesorios.classList.add('hidden');
                }

                updateAccessoryChoiceState();
            }

            const wrapCustom = document.getElementById('wrapper-custom');
            document.getElementById('opt-input-custom').value = '';
            if (prod.personalizable) wrapCustom.classList.remove('hidden');
            else wrapCustom.classList.add('hidden');

            recalculateProductPrice();
            document.getElementById('modal-product-options').classList.remove('hidden');
        }


const selectedCupissaAccessories = new Set();
function updateAccessoryChoiceState() {
    const select = document.getElementById('opt-select-accesorio');
    const list = document.getElementById('accessory-options-list');
    if (!select || !list) return;
    list.querySelectorAll('.accessory-choice').forEach(card => {
        const active = selectedCupissaAccessories.has(card.dataset.accessoryValue);
        card.classList.toggle('is-selected', active);
        card.setAttribute('aria-pressed', String(active));
    });
    // Conserva compatibilidad con el selector original, usado por otras secciones.
    select.value = selectedCupissaAccessories.size === 1 ? [...selectedCupissaAccessories][0] : '';
}
function cupissaSelectedAccessories() {
    return Array.from(document.querySelectorAll('#opt-select-accesorio option'))
        .filter(option => selectedCupissaAccessories.has(option.value))
        .map(option => ({ nombre: option.value, incremento: Number(option.dataset.inc || 0), foto: option.dataset.photo || '' }));
}

        function handleProductColorChange() {
            const selectColor = document.getElementById('opt-select-color');
            const mainImg = document.getElementById('opt-modal-img');
            if (!selectedProductModal || !selectColor || !mainImg) return;

            let selectedPhoto = String(selectColor.selectedOptions[0]?.dataset.photo || '').trim();
            if (!selectedPhoto) {
                const colors = selectedProductModal.colores || [];
                const selectedIndex = Array.from(selectColor.options).indexOf(selectColor.selectedOptions[0]);
                if (colors.length === (selectedProductModal.fotos || []).length) selectedPhoto = String(selectedProductModal.fotos[selectedIndex] || '').trim();
            }
            if (selectedPhoto) {
                const photos = selectedProductModal.fotos || [];
                const index = photos.findIndex(photo => cupissaNormalizePhotoUrl(photo) === cupissaNormalizePhotoUrl(selectedPhoto));
                activePhotoIndex = index >= 0 ? index : 0;
                mainImg.src = selectedPhoto;
                document.querySelectorAll('#opt-modal-thumbs img').forEach((thumb, thumbIndex) => {
                    const isActive = index >= 0 && thumbIndex === index;
                    thumb.className = `w-12 h-12 object-cover rounded-xl border-2 cursor-pointer ${isActive ? 'fuchsia-border' : 'border-transparent'}`;
                });
            } else {
                activePhotoIndex = 0;
                const firstPhoto = selectedProductModal.fotos?.[0];
                if (firstPhoto) mainImg.src = firstPhoto;
                document.querySelectorAll('#opt-modal-thumbs img').forEach((thumb, thumbIndex) => {
                    thumb.className = `w-12 h-12 object-cover rounded-xl border-2 cursor-pointer ${thumbIndex === 0 ? 'fuchsia-border' : 'border-transparent'}`;
                });
            }
            recalculateProductPrice();
        }

        function openFullImageModal() {
            if (!selectedProductModal) return;
            const croppedPhotos = selectedProductModal.fotos || [];
            const srcOriginal = croppedPhotos[activePhotoIndex] || croppedPhotos[0] || 'https://via.placeholder.com/800x800?text=Cupissa';
            const fullImg = document.getElementById('full-modal-img');
            fullImg.src = srcOriginal;
            fullImg.alt = `${selectedProductModal.nombre} - CUPISSA`;
            document.getElementById('modal-full-image').classList.remove('hidden');
        }

        // Reutiliza la vista ampliada del catálogo para mostrar fotografías de accesorios.
        function openAccessoryImageModal(photo, accessoryName) {
            const fullImg = document.getElementById('full-modal-img');
            const overlay = document.getElementById('modal-full-image');
            if (!photo || !fullImg || !overlay) return;
            fullImg.src = photo;
            fullImg.alt = `${accessoryName || 'Accesorio'} - CUPISSA`;
            overlay.classList.remove('hidden');
        }

        function closeFullImageModal() {
            document.getElementById('modal-full-image').classList.add('hidden');
        }

        function setModalidad(mod) {
            selectedModalidad = mod;
            updateModalidadUI();
            recalculateProductPrice();
        }

        function updateModalidadUI() {
            const lblVenta = document.getElementById('lbl-mod-venta');
            const lblAlquiler = document.getElementById('lbl-mod-alquiler');
            
            if (selectedModalidad === 'venta') {
                lblVenta.className = "flex items-center justify-center space-x-2 p-2.5 rounded-xl border-2 fuchsia-border bg-pink-50/20 cursor-pointer text-xs font-bold fuchsia-text";
                lblAlquiler.className = "flex items-center justify-center space-x-2 p-2.5 rounded-xl border-2 border-slate-200 bg-white cursor-pointer text-xs font-bold text-slate-600";
                document.querySelector('input[name="modalidadProd"][value="venta"]').checked = true;
            } else {
                lblAlquiler.className = "flex items-center justify-center space-x-2 p-2.5 rounded-xl border-2 fuchsia-border bg-pink-50/20 cursor-pointer text-xs font-bold fuchsia-text";
                lblVenta.className = "flex items-center justify-center space-x-2 p-2.5 rounded-xl border-2 border-slate-200 bg-white cursor-pointer text-xs font-bold text-slate-600";
                document.querySelector('input[name="modalidadProd"][value="alquiler"]').checked = true;
            }
        }

        function closeOptionsModal() {
            document.getElementById('modal-product-options').classList.add('hidden');
        }

        function updateModalQty(delta) {
            selectedQtyModal = Math.max(1, selectedQtyModal + delta);
            document.getElementById('opt-modal-qty').innerText = selectedQtyModal;
            recalculateProductPrice();
        }

        function recalculateProductPrice() {
            if (!selectedProductModal) return;
            const p = selectedProductModal;

            let unitPrice = selectedModalidad === 'alquiler' ? (p.precio_alquiler || 0) : p.precio_detal;
            let isMayorista = false;

            if (selectedModalidad === 'venta' && p.cant_min_mayorista && selectedQtyModal >= p.cant_min_mayorista && p.precio_mayorista) {
                unitPrice = p.precio_mayorista;
                isMayorista = true;
            }

            const selectTalla = document.getElementById('opt-select-talla');
            if (selectTalla && selectTalla.selectedOptions[0]) unitPrice += parseFloat(selectTalla.selectedOptions[0].dataset.inc || 0);

            const selectColor = document.getElementById('opt-select-color');
            if (selectColor && selectColor.selectedOptions[0]) unitPrice += parseFloat(selectColor.selectedOptions[0].dataset.inc || 0);

            const selectAccesorio = document.getElementById('opt-select-accesorio');
            unitPrice += cupissaSelectedAccessories().reduce((sum, accessory) => sum + accessory.incremento, 0);

            const totalProduct = unitPrice * selectedQtyModal;
            const pctAnticipo = p.porcentaje_anticipo || 20;
            const valAnticipo = Math.round(totalProduct * (pctAnticipo / 100));

            const depInfo = document.getElementById('wrapper-deposito-info');
            if (selectedModalidad === 'alquiler' && p.valor_deposito > 0) {
                document.getElementById('opt-val-deposito').innerText = formatCOP(p.valor_deposito * selectedQtyModal);
                depInfo.classList.remove('hidden');
            } else {
                depInfo.classList.add('hidden');
            }

            document.getElementById('opt-price-tag').innerText = selectedModalidad === 'alquiler' ? 'Precio Alquiler' : (isMayorista ? 'Precio Mayorista' : 'Precio Detal');
            document.getElementById('opt-modal-total-price').innerText = formatCOP(totalProduct);
            document.getElementById('opt-anticipo-pct').innerText = pctAnticipo;
            document.getElementById('opt-anticipo-val').innerText = formatCOP(valAnticipo);
        }
