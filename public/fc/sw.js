/* COSTPRO FC — Service Worker (FASE 24.5) · capa de RECURSOS DE APLICACIÓN, NO de datos.
   COPIA DE INTEGRACIÓN FC-MVP (dominio COSTPRO, path /fc/) — derivada del sw.js canónico
   generado por scripts/build-release.js del repo fichascosto (VERSION 12.10.0).
   Deltas respecto al canónico (documentados, infraestructura de distribución únicamente):
   1. ALLOWLIST + 'index.html' (wrapper de entrada /fc/ — puente de identidad same-origin).
      Sin esto, abrir /fc/ sin conexión no tendría copia cacheada (el canónico no lo conoce).
   2. VERSION = '12.10.0-fc.1' → cache 'costpro-release-12.10.0-fc.1' (bump para que el
      precache con index.html ocurra; el prefijo 'costpro-release-' conserva la limpieza
      de activación intacta).
   TODO lo demás es byte-idéntico al canónico: shell network-first con fallback offline,
   estáticos cache-first, Supabase y todo origen cruzado NUNCA en Cache Storage,
   sin skipWaiting/clients.claim (actualización la gobierna VersionManager de la app). */
'use strict';
var VERSION = "12.10.0-fc.1";
var CACHE = 'costpro-release-' + VERSION;
var SCOPE_PATH = new URL(self.registration.scope).pathname;
var ALLOWLIST = [
  'index.html',
  'FC.release.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png'
];
function allowlisted(url){
  if(url.origin !== self.location.origin) return false;
  if(url.pathname.indexOf(SCOPE_PATH) !== 0) return false;
  return ALLOWLIST.indexOf(url.pathname.slice(SCOPE_PATH.length)) !== -1;
}
function neverCache(url){
  /* passthrough absoluto: Supabase (auth/rest/rpc/telemetría) y TODO origen cruzado */
  return url.origin !== self.location.origin || /(^|\.)supabase\.(co|in|net)$/.test(url.hostname);
}
self.addEventListener("install", function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){
    return Promise.all(ALLOWLIST.map(function(rel){
      return c.add(new Request(SCOPE_PATH + rel, { cache: "reload" }));
    }));
  })); /* sin skipWaiting: el SW nuevo espera a que no queden pestañas viejas */
});
self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){ return k.indexOf("costpro-release-") === 0 && k !== CACHE; })
      .map(function(k){ return caches.delete(k); }));
  })); /* sin clients.claim */
});
self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method !== "GET") return;                 /* passthrough absoluto (§10) */
  var url = new URL(req.url);
  if(neverCache(url)) return;                      /* Supabase + cruzados: sin Cache Storage */
  if(!allowlisted(url)) return;                    /* resto same-origin: passthrough puro */
  if(url.pathname.slice(SCOPE_PATH.length) === "FC.release.html"){
    /* shell network-first: en línea siempre fresco (deploy visible al recargar);
       sin red sirve la copia cacheada (shell offline). Respuesta no-OK o no-basic
       JAMÁS se cachea (§11). */
    e.respondWith(fetch(req).then(function(res){
      if(res && res.ok && res.type === "basic"){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copy); });
      }
      return res;
    }).catch(function(){
      return caches.match(req).then(function(m){ return m || Response.error(); });
    }));
  } else {
    /* estáticos de versión (incl. index.html wrapper): cache-first */
    e.respondWith(caches.match(req).then(function(m){
      if(m) return m;
      return fetch(req).then(function(res){
        if(res && res.ok && res.type === "basic"){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copy); });
        }
        return res;
      });
    }));
  }
});
