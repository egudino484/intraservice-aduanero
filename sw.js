// Service worker mínimo: solo existe para que el sistema se pueda instalar como
// app en el teléfono. No guarda nada en caché: todo va siempre a la red, así
// nunca se ve una versión vieja ni datos desactualizados.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
