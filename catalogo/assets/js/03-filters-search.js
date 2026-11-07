/**
 * CUPISSA | Catálogo / filtros y buscador inteligente
 * Código extraído de la versión original sin cambiar la lógica.
 */

function renderFilters() {
            const mundosSet = new Set();
            const temporadasSet = new Set();
            const categoriasSet = new Set();
            const subcategoriasSet = new Set();

            rawProducts.forEach(p => {
                (p.mundos?.length ? p.mundos : [p.mundo]).filter(Boolean).forEach(value => mundosSet.add(value));
                (p.temporadas?.length ? p.temporadas : [p.temporada]).filter(Boolean).forEach(value => temporadasSet.add(value));
                (p.categorias?.length ? p.categorias : [p.categoria]).filter(Boolean).forEach(value => categoriasSet.add(value));
                (p.subcategorias?.length ? p.subcategorias : [p.subcategoria]).filter(Boolean).forEach(value => subcategoriasSet.add(value));
            });

            const mundosContainer = document.getElementById('mundos-container');
            const btnTodos = document.getElementById('btn-mundo-todos');
            mundosContainer.innerHTML = '';
            mundosContainer.appendChild(btnTodos);

            Array.from(mundosSet).sort().forEach(mundo => {
                const btn = document.createElement('button');
                btn.onclick = () => filterByMundo(mundo);
                btn.id = `btn-mundo-${mundo}`;
                btn.className = "px-2.5 py-1 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all shrink-0 flex items-center space-x-1 sm:space-x-1.5";
                btn.innerHTML = `<i class="fa-solid fa-folder text-[9px] sm:text-[10px] text-pink-500"></i><span>Mundo ${mundo}</span>`;
                mundosContainer.appendChild(btn);
            });

            const tempContainer = document.getElementById('temporadas-container');
            const btnTodasTemp = document.getElementById('btn-temp-todas');
            tempContainer.innerHTML = '';
            tempContainer.appendChild(btnTodasTemp);

            Array.from(temporadasSet).sort().forEach(temp => {
                const btn = document.createElement('button');
                btn.onclick = () => filterByTemporada(temp);
                btn.id = `btn-temp-${temp}`;
                btn.className = "px-2 py-1 sm:px-3 sm:py-1.5 rounded-md sm:rounded-lg font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all shrink-0";
                btn.innerText = temp;
                tempContainer.appendChild(btn);
            });

            const catContainer = document.getElementById('categorias-container');
            const btnTodasCat = document.getElementById('btn-cat-todas');
            catContainer.innerHTML = '';
            catContainer.appendChild(btnTodasCat);

            Array.from(categoriasSet).sort().forEach(cat => {
                const btn = document.createElement('button');
                btn.onclick = () => filterByCategoria(cat);
                btn.id = `btn-cat-${cat}`;
                btn.className = "px-2 py-1 sm:px-3 sm:py-1.5 rounded-md sm:rounded-lg font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all shrink-0";
                btn.innerText = cat;
                catContainer.appendChild(btn);
            });

            const subcatContainer = document.getElementById('subcategorias-container');
            const btnTodasSubcat = document.getElementById('btn-subcat-todas');
            subcatContainer.innerHTML = '';
            subcatContainer.appendChild(btnTodasSubcat);

            Array.from(subcategoriasSet).sort().forEach(subcat => {
                const btn = document.createElement('button');
                btn.onclick = () => filterBySubcategoria(subcat);
                btn.id = `btn-subcat-${subcat}`;
                btn.className = "px-2 py-1 sm:px-3 sm:py-1.5 rounded-md sm:rounded-lg font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all shrink-0";
                btn.innerText = subcat;
                subcatContainer.appendChild(btn);
            });
        }

        function filterByMundo(mundo) {
            activeMundo = mundo;
            document.querySelectorAll('[id^="btn-mundo-"]').forEach(btn => {
                btn.className = "px-2.5 py-1 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all shrink-0 flex items-center space-x-1 sm:space-x-1.5";
            });
            const activeBtn = document.getElementById(`btn-mundo-${mundo.toString().toLowerCase() === 'todos' ? 'todos' : mundo}`);
            if (activeBtn) activeBtn.className = "px-2.5 py-1 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all bg-pink-600 text-white flex items-center space-x-1 sm:space-x-2 shrink-0 shadow-sm";
            
            displayLimit = 12;
            applyFiltersAndSearch();
        }

        function filterByTemporada(temp) {
            activeTemporada = temp;
            document.querySelectorAll('[id^="btn-temp-"]').forEach(btn => {
                btn.className = "px-2 py-1 sm:px-3 sm:py-1.5 rounded-md sm:rounded-lg font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all shrink-0";
            });
            const activeBtn = document.getElementById(`btn-temp-${temp.toString().toLowerCase() === 'todas' ? 'todas' : temp}`);
            if (activeBtn) activeBtn.className = "px-2 py-1 sm:px-3 sm:py-1.5 rounded-md sm:rounded-lg font-black text-white bg-pink-600 shadow-sm transition-all shrink-0";
            
            displayLimit = 12;
            applyFiltersAndSearch();
        }

        function filterByCategoria(cat) {
            activeCategoria = cat;
            document.querySelectorAll('[id^="btn-cat-"]').forEach(btn => {
                btn.className = "px-2 py-1 sm:px-3 sm:py-1.5 rounded-md sm:rounded-lg font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all shrink-0";
            });
            const activeBtn = document.getElementById(`btn-cat-${cat.toString().toLowerCase() === 'todas' ? 'todas' : cat}`);
            if (activeBtn) activeBtn.className = "px-2 py-1 sm:px-3 sm:py-1.5 rounded-md sm:rounded-lg font-black text-white bg-pink-600 shadow-sm transition-all shrink-0";
            
            displayLimit = 12;
            applyFiltersAndSearch();
        }

        function filterBySubcategoria(subcat) {
            activeSubcategoria = subcat;
            document.querySelectorAll('[id^="btn-subcat-"]').forEach(btn => {
                btn.className = "px-2 py-1 sm:px-3 sm:py-1.5 rounded-md sm:rounded-lg font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all shrink-0";
            });
            const activeBtn = document.getElementById(`btn-subcat-${subcat.toString().toLowerCase() === 'todas' ? 'todas' : subcat}`);
            if (activeBtn) activeBtn.className = "px-2 py-1 sm:px-3 sm:py-1.5 rounded-md sm:rounded-lg font-black text-white bg-pink-600 shadow-sm transition-all shrink-0";
            
            displayLimit = 12;
            applyFiltersAndSearch();
        }

        function handleSmartSearch() {
            displayLimit = 12;
            if (window.cupissaSearchTimer) window.clearTimeout(window.cupissaSearchTimer);
            window.cupissaSearchTimer = window.setTimeout(() => {
                applyFiltersAndSearch();
            }, 90);
        }

        // BUSCADOR INTELIGENTE: tolera tildes, plurales, errores de escritura
        // y ordena todos los productos desde el más parecido hasta el menos parecido.
        function normalizeSearchText(value) {
            return String(value || '')
                .toLocaleLowerCase('es-CO')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/ñ/g, 'n')
                .replace(/[^a-z0-9]+/g, ' ')
                .trim();
        }

        function searchTokens(value) {
            const stopWords = new Set(['de','del','la','las','el','los','un','una','para','por','con','y','en','a','al']);
            return normalizeSearchText(value).split(/\s+/).filter(word => word.length > 1 && !stopWords.has(word));
        }

        function boundedEditDistance(a, b, maxDistance) {
            if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;
            if (a === b) return 0;
            let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
            for (let i = 1; i <= a.length; i++) {
                const current = [i];
                let rowMinimum = i;
                for (let j = 1; j <= b.length; j++) {
                    const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                    current[j] = Math.min(
                        current[j - 1] + 1,
                        previous[j] + 1,
                        previous[j - 1] + cost
                    );
                    rowMinimum = Math.min(rowMinimum, current[j]);
                }
                if (rowMinimum > maxDistance) return maxDistance + 1;
                previous = current;
            }
            return previous[b.length];
        }

        function tokenSimilarity(queryToken, candidateToken) {
            if (!queryToken || !candidateToken) return 0;
            if (queryToken === candidateToken) return 100;
            if (candidateToken.startsWith(queryToken) || queryToken.startsWith(candidateToken)) return 82;
            if (candidateToken.includes(queryToken) || queryToken.includes(candidateToken)) return 68;

            const longest = Math.max(queryToken.length, candidateToken.length);
            const tolerance = longest >= 8 ? 2 : (longest >= 4 ? 1 : 0);
            if (tolerance) {
                const distance = boundedEditDistance(queryToken, candidateToken, tolerance);
                if (distance <= tolerance) return distance === 1 ? 58 : 42;
            }

            // Coincidencia suave por grupos de letras: permite ordenar sugerencias
            // incluso cuando el cliente escribió un nombre bastante distinto.
            const grams = value => {
                const padded = ` ${value} `;
                const set = new Set();
                for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3));
                return set;
            };
            const a = grams(queryToken);
            const b = grams(candidateToken);
            let common = 0;
            a.forEach(gram => { if (b.has(gram)) common++; });
            const dice = (2 * common) / Math.max(1, a.size + b.size);
            return dice >= 0.18 ? Math.round(dice * 34) : 0;
        }

        const productSearchIndex = new WeakMap();

        function getIndexedProductFields(product) {
            if (productSearchIndex.has(product)) return productSearchIndex.get(product);
            const fields = [
                { value: product.nombre, weight: 1.00 },
                { value: (product.subcategorias || [product.subcategoria]).join(' '), weight: 0.82 },
                { value: (product.categorias || [product.categoria]).join(' '), weight: 0.70 },
                { value: (product.mundos || [product.mundo]).join(' '), weight: 0.55 },
                { value: (product.temporadas || [product.temporada]).join(' '), weight: 0.45 },
                { value: product.descripcion, weight: 0.28 }
            ].map(field => ({
                text: normalizeSearchText(field.value),
                words: searchTokens(field.value),
                weight: field.weight
            }));
            productSearchIndex.set(product, fields);
            return fields;
        }

        function calculateProductRelevance(product, query) {
            const phrase = normalizeSearchText(query);
            const queryWords = searchTokens(query);
            if (!phrase || !queryWords.length) return 0;
            const fields = getIndexedProductFields(product);

            let score = 0;
            const nameText = fields[0].text;
            if (nameText === phrase) score += 1000;
            else if (nameText.startsWith(phrase)) score += 760;
            else if (nameText.includes(phrase)) score += 620;

            for (const queryWord of queryWords) {
                let bestForWord = 0;
                fields.forEach((field, fieldIndex) => {
                    const fieldFactor = field.weight;
                    let fieldBest = 0;
                    field.words.forEach(candidate => {
                        fieldBest = Math.max(fieldBest, tokenSimilarity(queryWord, candidate));
                    });
                    if (field.text.includes(queryWord)) fieldBest = Math.max(fieldBest, fieldIndex === 0 ? 90 : 62);
                    bestForWord = Math.max(bestForWord, fieldBest * fieldFactor);
                });
                score += bestForWord;
            }

            // Bonificación moderada para nombres que cubren todos los términos.
            if (queryWords.length > 1) {
                const matchedNameWords = queryWords.filter(word =>
                    fields[0].words.some(candidate => tokenSimilarity(word, candidate) >= 42)
                ).length;
                score += (matchedNameWords / queryWords.length) * 55;
            }
            return Math.round(score);
        }

        function applyFiltersAndSearch() {
            const searchElement = document.getElementById('smart-search-input');
            const query = (searchElement?.value || '').trim();

            const results = rawProducts.filter(p => {
                const valuesFor = (plural, singular) => (Array.isArray(p[plural]) && p[plural].length ? p[plural] : [p[singular]])
                    .map(value => String(value || '').toUpperCase().trim()).filter(Boolean);
                const targetMundo = activeMundo.toString().toUpperCase().trim();
                const targetTemp = activeTemporada.toString().toUpperCase().trim();
                const targetCat = activeCategoria.toString().toUpperCase().trim();
                const targetSubcat = activeSubcategoria.toString().toUpperCase().trim();
                const matchMundo = activeMundo === 'TODOS' || valuesFor('mundos', 'mundo').includes(targetMundo);
                const matchTemp = activeTemporada === 'TODAS' || valuesFor('temporadas', 'temporada').includes(targetTemp);
                const matchCat = activeCategoria === 'TODAS' || valuesFor('categorias', 'categoria').includes(targetCat);
                const matchSubcat = activeSubcategoria === 'TODAS' || valuesFor('subcategorias', 'subcategoria').includes(targetSubcat);
                return matchMundo && matchTemp && matchCat && matchSubcat;
            });

            if (query) {
                const scored = results.map((product, index) => ({
                    product,
                    score: calculateProductRelevance(product, query),
                    originalIndex: index
                }));
                scored.sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex);

                // Las coincidencias claras quedan primero; el resto también se ordena
                // por cercanía para que nunca se pierdan productos por un error de escritura.
                currentMatches = scored.filter(item => item.score >= 38).map(item => item.product);
                currentNonMatches = scored.filter(item => item.score < 38).map(item => item.product);
                filteredProducts = [...currentMatches, ...currentNonMatches];
            } else {
                currentMatches = results;
                currentNonMatches = [];
                filteredProducts = results;
            }

            renderProductsGrid();
        }
