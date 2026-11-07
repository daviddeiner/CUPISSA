/* CUPISSA | PWA Service Worker. Versionar esta constante cuando se publiquen cambios. */
const CUPISSA_CACHE = 'cupissa-app-shell-v22-rental-auth';
const CUPISSA_CACHE_PREFIX = 'cupissa-app-shell-';
const CUPISSA_ASSETS = [
  'index.html',
  'catalogo/',
  'checkout/',
  'assets/data/domicilios.json',
  'perfil/',
  'portal-pagos/',
  'terminos-y-condiciones/',
  'terminos-credito/',
  'politicas-anticipos/',
  'tratamiento-datos/',
  'politica-de-datos-personales/',
  'politica-de-compras-y-garantias/',
  'credito-cupissa/',
  'politica-y-condiciones-de-alquileres/',
  'catalogo/manifest.webmanifest',
  'catalogo/assets/css/catalogo.css',
  'catalogo/assets/js/00-config-state.js',
  'catalogo/assets/js/01-initialization.js',
  'catalogo/assets/js/01-tailwind-config.js',
  'catalogo/assets/js/02-product-data.js?v=20261107-product-card-2',
  'catalogo/assets/js/03-filters-search.js',
  'catalogo/assets/js/04-product-grid.js?v=20261107-product-card-2',
  'catalogo/assets/js/05-product-modal.js?v=20261107-product-card-2',
  'catalogo/assets/js/06-cart-favorites-state.js',
  'catalogo/assets/js/07-cart.js',
  'catalogo/assets/js/08-checkout.js',
  'catalogo/assets/js/09-favorites.js',
  'catalogo/assets/js/10-formatters.js',
  'catalogo/assets/js/11-responsive-navigation.js',
  'catalogo/assets/js/12-cart-animation.js',
  'catalogo/assets/js/13-brand-ui.js',
  'catalogo/assets/js/14-product-activity.js',
  'catalogo/assets/js/15-pwa-install.js',
  'catalogo/assets/images/logo.png',
  'catalogo/assets/images/favicon.png',
  'catalogo/assets/images/app-icon-192.png',
  'catalogo/assets/images/app-icon-512.png',
  'catalogo/assets/images/app-icon-180.png',
  'assets/css/checkout.css',
  'assets/js/checkout.js?v=20261107-rental-stock-2',
  'assets/css/perfil.css',
  'assets/js/perfil.js?v=20261107-google-direct-2',
  'shared/js/cupissa-auth.js?v=20261107-otp-nopassword-2',
  'shared/js/supabase-config.js',
  'portal-pagos/index.html',
  'portal-pagos/assets/css/portal.css',
  'portal-pagos/assets/js/02-supabase-config-state.js',
  'portal-pagos/assets/js/04-session.js?v=20261107-session',
  'portal-pagos/assets/js/05-authentication.js?v=20261107-otp-google',
  'portal-pagos/assets/js/06-client-dashboard.js?v=20261107-cuotas',
  'portal-pagos/assets/js/07-payment-options.js',
  'portal-pagos/assets/js/08-payment-gateway.js',
  'portal-pagos/assets/js/09-formatters.js',
  'portal-pagos/services/wompi/02-date-and-late-fees.js',
  'portal-pagos/services/wompi/04-checkout.js?v=20261104-swift-endpoint-2',
  'portal-pagos/services/wompi/03-payment-service.js?v=20261107-otp-auth'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CUPISSA_CACHE);
    const cacheKeys = await caches.keys();
    const previousNames = cacheKeys
      .filter(name => name.startsWith(CUPISSA_CACHE_PREFIX) && name !== CUPISSA_CACHE)
      .sort();
    const previousName = previousNames[previousNames.length - 1];

    // Copiar el app shell anterior. Los recursos que no cambien podrán reutilizarse
    // y la revalidación HTTP descargará únicamente los archivos modificados.
    if (previousName) {
      const previous = await caches.open(previousName);
      for (const request of await previous.keys()) {
        if (await cache.match(request)) continue;
        const response = await previous.match(request);
        if (response) await cache.put(request, response);
      }
    }

    await Promise.all(CUPISSA_ASSETS.map(async path => {
      const url = new URL(path, self.registration.scope);
      try {
        const response = await fetch(new Request(url, { cache: 'no-cache' }));
        if (response && response.ok) await cache.put(url, response);
      } catch (_) {
        // Si no hay conexión, se conserva la versión previamente almacenada.
      }
    }));

    // Primera instalación: activar de inmediato. Actualizaciones: esperar al botón del usuario.
    if (!self.registration.active) await self.skipWaiting();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'CUPISSA_SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(key => key.startsWith(CUPISSA_CACHE_PREFIX) && key !== CUPISSA_CACHE)
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/rest/v1/') || url.pathname.includes('/storage/v1/') || url.pathname.includes('/functions/v1/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CUPISSA_CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (_) {
        const cached = await caches.match(request);
        return cached || caches.match(new URL('index.html', self.registration.scope));
      }
    })());
    return;
  }

  // Los scripts y estilos se consultan primero en red. Así, una versión antigua
  // del checkout no puede quedarse activa por una entrada cache-first anterior.
  if (request.destination === 'script' || request.destination === 'style') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CUPISSA_CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (_) {
        return (await caches.match(request)) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    const network = fetch(request).then(response => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CUPISSA_CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(() => cached);
    return cached || network;
  })());
});
