"use strict";
/* =====================================================================
   Version web : fait marcher l'appli sans réseau (chantier, cave, sous-sol).
   - Les fichiers de l'appli sont gardés dans la mémoire du site à
     l'installation ; ils sont servis depuis cette mémoire et remis à jour
     en arrière-plan quand le réseau est là.
   - Les fichiers du lecteur de texte (dossier ocr/, plusieurs Mo) sont
     gardés à leur premier chargement et resservis ensuite tels quels.
   VERSION est remplacée à chaque mise en ligne : l'ancienne mémoire est
   alors effacée et l'appli à jour est rechargée.
   ===================================================================== */
const VERSION="239f3a9bb7";
const APPLI="mespac-appli-"+VERSION,LECTEUR="mespac-lecteur-7.0.0-7.0.0";
const COEUR=["./","index.html","app.js","plaque.js","ecran.js","afficheur.js","lecteur-web.js","jspdf.umd.min.js","manifest.webmanifest",
  "icons/icone-180.png","icons/icone-192.png","icons/icone-512.png"];

self.addEventListener("install",e=>{e.waitUntil(caches.open(APPLI).then(c=>c.addAll(COEUR.map(u=>new Request(u,{cache:"reload"})))).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith("mespac-")&&k!==APPLI&&k!==LECTEUR).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});

/* depuis la mémoire, puis remise à jour en arrière-plan */
async function memoireDabord(e,cle){const c=await caches.open(APPLI),m=await c.match(cle,{ignoreSearch:true});
  const frais=fetch(e.request).then(r=>{if(r&&r.ok&&r.type==="basic")c.put(cle,r.clone());return r}).catch(()=>null);
  if(m){e.waitUntil(frais);return m}const r=await frais;return r||new Response("Hors réseau",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}})}
/* fichiers du lecteur : gardés tels quels une fois chargés */
async function lecteur(req){const c=await caches.open(LECTEUR),m=await c.match(req,{ignoreSearch:true});if(m)return m;
  const r=await fetch(req);if(r&&r.ok)c.put(req,r.clone());return r}
/* liste du lecteur : le réseau d'abord (savoir s'il est livré), la mémoire sinon */
async function reseauDabord(req){const c=await caches.open(LECTEUR);
  try{const r=await fetch(req);if(r&&r.ok)c.put(req,r.clone());return r}catch(err){const m=await c.match(req,{ignoreSearch:true});if(m)return m;throw err}}

self.addEventListener("fetch",e=>{const req=e.request;if(req.method!=="GET")return;const u=new URL(req.url);if(u.origin!==location.origin)return;
  const ici=new URL("./",self.registration.scope).pathname,chemin=u.pathname.startsWith(ici)?u.pathname.slice(ici.length):u.pathname;
  if(chemin==="ocr/fichiers.json"||chemin==="codes.json"){e.respondWith(reseauDabord(req));return} /* codes : une personne retirée doit l'être vite */
  if(chemin.startsWith("ocr/")){e.respondWith(lecteur(req));return}
  if(req.mode==="navigate"){e.respondWith(memoireDabord(e,"index.html"));return}
  e.respondWith(memoireDabord(e,req))});
