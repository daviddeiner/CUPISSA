/**
 * CUPISSA | Catálogo / carga, normalización y datos SEO
 * Código extraído de la versión original sin cambiar la lógica.
 */

function shuffleArray(array) {
            for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
            }
            return array;
        }

        async function fetchCatalogProducts() {
            let allFetched = [];

            try {
                const { data, error } = await supabaseClient
                    .from('productos')
                    .select('id,nombre,mundo,mundos,categoria,categorias,subcategoria,subcategorias,temporada,temporadas,precio_detal,precio_mayorista,cant_min_mayorista,porcentaje_anticipo,dias_preparacion,personalizable,al_por_mayor,venta,alquiler,credito,precio_alquiler,valor_deposito,tallas,colores,fotos,created_at,descripcion,accesorios,oculto')
                    .eq('oculto', false);
                if (error) throw error;
                allFetched = Array.isArray(data) ? data : [];
            } catch (err) {
                console.error("Excepción en consulta de productos visibles de Supabase:", err);
            }

            rawProducts = allFetched.map(normalizeProduct);
            rawProducts = shuffleArray(rawProducts);
            await loadConfiguredFeaturedSeason();
            updateFeaturedSeasonProducts(true);

            renderFilters();
            applyFiltersAndSearch();
            updateSEOStructuredData();
        }

        async function loadConfiguredFeaturedSeason() {
            hasFeaturedSeasonConfiguration = false;
            configuredFeaturedSeason = '';
            try {
                const { data, error } = await supabaseClient
                    .from('configuracion_destacados_web')
                    .select('temporada_destacada')
                    .eq('id', 1)
                    .maybeSingle();
                if (error) throw error;
                hasFeaturedSeasonConfiguration = true;
                configuredFeaturedSeason = String(data?.temporada_destacada || '')
                    .trim().toUpperCase();
            } catch (error) {
                console.warn('No fue posible leer la temporada elegida por CUPISSA ADMIN:', error);
                // Si la tabla aún no se ha creado, mantiene el comportamiento anterior del catálogo.
                hasFeaturedSeasonConfiguration = false;
                configuredFeaturedSeason = '';
            }
        }

        function parseProductArray(value) {
            if (Array.isArray(value)) return [...value];
            if (typeof value !== 'string' || !value.trim()) return [];
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : [];
            } catch (_) {
                return [];
            }
        }

        function normalizeProductFilterValues(arrayValue, legacyValue = '') {
            let values = [];
            if (Array.isArray(arrayValue)) {
                values = arrayValue;
            } else if (typeof arrayValue === 'string' && arrayValue.trim()) {
                try {
                    const parsed = JSON.parse(arrayValue);
                    values = Array.isArray(parsed) ? parsed : [arrayValue];
                } catch (_) {
                    values = [arrayValue];
                }
            }
            if (!values.length && legacyValue != null && String(legacyValue).trim()) {
                values = [legacyValue];
            }
            const unique = [];
            values.forEach(value => {
                const clean = String(value ?? '').trim().toUpperCase();
                if (clean && !unique.includes(clean)) unique.push(clean);
            });
            return unique;
        }

        function normalizeProduct(p) {
            let fotosParsed = [];
            if (p.fotos) {
                if (Array.isArray(p.fotos)) fotosParsed = [...p.fotos];
                else if (typeof p.fotos === 'string') {
                    try {
                        const parsed = JSON.parse(p.fotos);
                        fotosParsed = Array.isArray(parsed) ? parsed : [p.fotos];
                    } catch(e) { fotosParsed = [p.fotos]; }
                }
            }

            let coloresParsed = [];
            if (Array.isArray(p.colores)) coloresParsed = [...p.colores];
            else if (typeof p.colores === 'string' && p.colores.trim()) {
                try {
                    const parsed = JSON.parse(p.colores);
                    coloresParsed = Array.isArray(parsed) ? parsed : [];
                } catch (_) { coloresParsed = []; }
            }
            coloresParsed = coloresParsed.map(color =>
                typeof color === 'string'
                    ? { nombre: color, incremento: 0, foto: '' }
                    : {
                        nombre: String(color.nombre || color.color || '').trim(),
                        incremento: Number(color.incremento || 0),
                        foto: String(color.foto || color.imagen || color.imagen_url || '').trim()
                    }
            );

            // Productos antiguos: si cada color tiene una foto correspondiente por orden,
            // vincularla automáticamente para que la selección sea bidireccional.
            if (coloresParsed.length > 0 && fotosParsed.length === coloresParsed.length) {
                coloresParsed = coloresParsed.map((color, index) => ({
                    ...color,
                    foto: color.foto || String(fotosParsed[index] || '')
                }));
            }

            // Cada foto asignada a un color también forma parte de la galería principal.
            coloresParsed.forEach(color => {
                const photo = String(color.foto || color.imagen || color.imagen_url || '').trim();
                if (photo && !fotosParsed.includes(photo)) fotosParsed.push(photo);
            });

            if (fotosParsed.length === 0) {
                fotosParsed = ['https://via.placeholder.com/400x400?text=Cupissa'];
            }

            let fotosOriginalesParsed = [];
            if (Array.isArray(p.fotos_originales)) fotosOriginalesParsed = [...p.fotos_originales];
            else if (typeof p.fotos_originales === 'string' && p.fotos_originales.trim()) {
                try {
                    const parsed = JSON.parse(p.fotos_originales);
                    fotosOriginalesParsed = Array.isArray(parsed) ? parsed : [p.fotos_originales];
                } catch (_) { fotosOriginalesParsed = [p.fotos_originales]; }
            }
            // Las fotos originales se conservan en la base para administración, nunca se exponen al cliente.
            fotosOriginalesParsed = [];

            const mundos = normalizeProductFilterValues(p.mundos, p.mundo || 'GENERAL');
            const categorias = normalizeProductFilterValues(p.categorias, p.categoria || 'GENERAL');
            const subcategorias = normalizeProductFilterValues(p.subcategorias, p.subcategoria || '');
            const temporadas = normalizeProductFilterValues(p.temporadas, p.temporada || '');

            return {
                id: p.id || 'p_' + Math.random().toString(36).substr(2, 9),
                fechaRegistro: p.created_at || p.fecha_creacion || '',
                nombre: (p.nombre || p.title || 'Producto Sin Nombre').toString(),
                descripcion: (p.descripcion || p.description || '').toString(),
                mundos,
                categorias,
                subcategorias,
                temporadas,
                // Campos singulares conservados para compatibilidad con el resto del catálogo.
                mundo: mundos[0] || 'GENERAL',
                categoria: categorias[0] || 'GENERAL',
                subcategoria: subcategorias[0] || '',
                temporada: temporadas[0] || '', 
                precio_detal: parseFloat(p.precio_detal || p.precio || p.price || 0),
                precio_mayorista: parseFloat(p.precio_mayorista || 0),
                precio_alquiler: parseFloat(p.precio_alquiler || 0),
                valor_deposito: parseFloat(p.valor_deposito || 0),
                cant_min_mayorista: parseInt(p.cant_min_mayorista || 6),
                porcentaje_anticipo: parseFloat(p.porcentaje_anticipo || 20),
                dias_preparacion: parseInt(p.dias_preparacion || 0),
                personalizable: !!p.personalizable,
                alquiler: (p.alquiler === true || p.alquiler === 1 || p.alquiler === '1' || String(p.alquiler).toLowerCase() === 'true') && parseFloat(p.precio_alquiler || 0) > 0,
                venta: true,
                fotos: fotosParsed,
                fotos_originales: [],
                tallas: parseProductArray(p.tallas),
                colores: coloresParsed,
                accesorios: parseProductArray(p.accesorios)
            };
        }

        function updateSEOStructuredData() {
            if (!rawProducts || rawProducts.length === 0) return;
            
            const schemaData = rawProducts.slice(0, 30).map(p => ({
                "@context": "https://schema.org/",
                "@type": "Product",
                "name": p.nombre,
                "image": p.fotos,
                "description": p.descripcion || `${p.nombre} - Producto CUPISSA Colombia`,
                "brand": {
                    "@type": "Brand",
                    "name": "CUPISSA"
                },
                "offers": {
                    "@type": "Offer",
                    "priceCurrency": "COP",
                    "price": p.precio_detal,
                    "availability": "https://schema.org/InStock"
                }
            }));

            const scriptElem = document.getElementById('seo-schema-script');
            if (scriptElem) {
                scriptElem.textContent = JSON.stringify(schemaData);
            }
        }


function updateFeaturedSeasonProducts(forceShuffle = false) {
    const seasonal = rawProducts.filter(product => (product.temporadas || [product.temporada]).some(value => String(value || '').trim()));
    if (!seasonal.length) {
        featuredSeasonProducts = [];
        featuredSeasonName = '';
        return;
    }

    const seasonGroups = new Map();
    seasonal.forEach(product => {
        const productSeasons = product.temporadas?.length ? product.temporadas : [product.temporada];
        productSeasons.forEach(season => {
            const name = String(season || '').trim().toUpperCase();
            if (!name) return;
            if (!seasonGroups.has(name)) seasonGroups.set(name, []);
            if (!seasonGroups.get(name).some(item => String(item.id) === String(product.id))) {
                seasonGroups.get(name).push(product);
            }
        });
    });

    let chosenName = '';

    // Si ADMIN ya guardó una selección, esa temporada tiene prioridad absoluta.
    // Un valor NULL guardado significa que no se mostrarán destacados.
    if (hasFeaturedSeasonConfiguration) {
        chosenName = configuredFeaturedSeason && seasonGroups.has(configuredFeaturedSeason)
            ? configuredFeaturedSeason
            : '';
    } else {
        // Compatibilidad temporal con el catálogo anterior si la tabla aún no existe.
        const month = new Date().getMonth() + 1;
        const seasonalMonthRules = [
            { months:[11,12], words:['NAVIDAD','DICIEMBRE','CHRISTMAS'] },
            { months:[9,10], words:['HALLOWEEN','DISFRACES'] },
            { months:[4,5], words:['MADRES','DIA DE LA MADRE'] },
            { months:[5,6], words:['PADRES','DIA DEL PADRE'] },
            { months:[1,2], words:['CARNAVAL','SAN VALENTIN','AMOR'] },
            { months:[8,9], words:['AMOR Y AMISTAD','AMISTAD'] },
            { months:[1,7], words:['REGRESO A CLASES','ESCOLAR'] }
        ];
        const preferred = seasonalMonthRules.find(rule => rule.months.includes(month));
        if (preferred) {
            chosenName = [...seasonGroups.keys()].find(name => preferred.words.some(word => name.includes(word))) || '';
        }
        if (!chosenName) {
            chosenName = [...seasonGroups.entries()]
                .sort((a,b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'es'))[0][0];
        }
    }

    if (!chosenName) {
        featuredSeasonProducts = [];
        featuredSeasonName = '';
        return;
    }

    const group = seasonGroups.get(chosenName) || [];
    if (forceShuffle || chosenName !== featuredSeasonName || !featuredSeasonProducts.length) {
        featuredSeasonName = chosenName;
        featuredSeasonProducts = shuffleArray([...group]).slice(0,5);
    }
}
