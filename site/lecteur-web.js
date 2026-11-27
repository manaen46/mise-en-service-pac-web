"use strict";
/* =====================================================================
   Lecteur de texte de la version web (iPhone, navigateur) : il remplace
   le lecteur du téléphone Android, que seule l'appli installée (APK) a.
   La photo est préparée ici, lue par Tesseract (dossier ocr/, chargé à
   la première lecture, hors réseau ensuite), et rendue sous la même
   forme que le lecteur Android : des lignes de texte avec leur position.
   L'appli Android n'utilise pas ce fichier.
   ===================================================================== */
(function(root){
const DOSSIER="ocr/";
const url=f=>new URL(DOSSIER+f,root.location.href).href;

/* ---------- Préparation de la photo ---------- */
function charger(src){return new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>rej(new Error("image"));im.src=src})}
/* Photo en gris, à une taille que le lecteur lit bien (les petites photos sont agrandies). Renvoie le dessin et l'échelle appliquée. */
function gris(im,max){const W0=im.naturalWidth||im.width,H0=im.naturalHeight||im.height,g=Math.max(W0,H0),k=g>max?max/g:g<1100?Math.min(2,1100/g):1,
    w=Math.max(1,Math.round(W0*k)),h=Math.max(1,Math.round(H0*k)),c=document.createElement("canvas");c.width=w;c.height=h;
  const x=c.getContext("2d",{willReadFrequently:true});x.fillStyle="#fff";x.fillRect(0,0,w,h);x.drawImage(im,0,0,w,h);
  const d=x.getImageData(0,0,w,h),p=d.data,lum=new Float32Array(w*h);for(let i=0,j=0;i<lum.length;i++,j+=4)lum[i]=.299*p[j]+.587*p[j+1]+.114*p[j+2];
  return{c,x,d,lum,w,h,k}}
function ecrire(G,f){const p=G.d.data;for(let i=0,j=0;i<G.lum.length;i++,j+=4){const v=f(i);p[j]=p[j+1]=p[j+2]=v;p[j+3]=255}G.x.putImageData(G.d,0,0);return G.c}
/* Clarté adoucie (moyenne dans un carré de côté 2r+1) : efface la trame fine des écrans photographiés et le grain. */
function adoucir(lum,w,h,r){const S=new Float64Array((w+1)*(h+1)),out=new Float32Array(w*h);
  for(let y=0;y<h;y++){let l=0;for(let x=0;x<w;x++){l+=lum[y*w+x];S[(y+1)*(w+1)+x+1]=S[y*(w+1)+x+1]+l}}
  for(let y=0;y<h;y++){const y0=Math.max(0,y-r),y1=Math.min(h,y+r+1);for(let x=0;x<w;x++){const x0=Math.max(0,x-r),x1=Math.min(w,x+r+1);
    out[y*w+x]=(S[y1*(w+1)+x1]-S[y0*(w+1)+x1]-S[y1*(w+1)+x0]+S[y0*(w+1)+x0])/((x1-x0)*(y1-y0))}}return out}
/* Plus petite (ou plus grande) clarté autour de chaque point, dans un carré de côté 2r+1 : une passe par ligne, une par colonne. */
function extreme(src,w,h,r,grand){const s=grand?-1:1,tmp=new Float32Array(w*h),out=new Float32Array(w*h),q=new Int32Array(Math.max(w,h));
  const passe=(a,b,n,pas,base)=>{let t=0,f=0;
    for(let i=0;i<n+r;i++){if(i<n){const v=a[base+i*pas]*s;while(f>t&&a[base+q[f-1]*pas]*s>=v)f--;q[f++]=i}
      const o=i-r;if(o<0)continue;while(q[t]<o-r)t++;b[base+o*pas]=a[base+q[t]*pas]}};
  for(let y=0;y<h;y++)passe(src,tmp,w,1,y*w);for(let x=0;x<w;x++)passe(tmp,out,h,w,x);return out}
/* Le fond sans les traits fins : ce qui reste quand on efface tout ce qui est plus étroit que 2r (lettres, filets). */
function fond(lum,w,h,r,clair){return extreme(extreme(lum,w,h,r,!clair),w,h,r,clair)}
/* Retire d'un dessin en noir et blanc ce qui ne peut pas être du texte : les longs traits (bords d'écran, cadres), effacés
   trait par trait pour ne pas emporter la première lettre d'une ligne qui les touche, puis les grandes formes, les poussières
   et les formes pâles (fort : les points qui tranchent franchement ; une lettre en a toujours, la trame d'un écran non). */
function nettoyer(m,w,h,M,fort){const hMax=Math.round(M*.05),wMax=Math.round(w*.22);
  for(let x=0;x<w;x++){let d=-1;for(let y=0;y<=h;y++){const on=y<h&&m[y*w+x];if(on&&d<0)d=y;else if(!on&&d>=0){if(y-d>hMax)for(let k=d;k<y;k++)m[k*w+x]=0;d=-1}}}
  for(let y=0;y<h;y++){let d=-1;for(let x=0;x<=w;x++){const on=x<w&&m[y*w+x];if(on&&d<0)d=x;else if(!on&&d>=0){if(x-d>wMax)for(let k=d;k<x;k++)m[y*w+k]=0;d=-1}}}
  const vu=new Uint8Array(w*h),pile=new Int32Array(w*h);
  for(let i0=0;i0<w*h;i0++){if(!m[i0]||vu[i0])continue;let p=0,x0=w,x1=0,y0=h,y1=0,nf=0;pile[p++]=i0;vu[i0]=1;const pts=[];
    while(p){const i=pile[--p],x=i%w,y=(i-x)/w;pts.push(i);if(fort[i])nf++;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
      if(x>0&&m[i-1]&&!vu[i-1]){vu[i-1]=1;pile[p++]=i-1}if(x<w-1&&m[i+1]&&!vu[i+1]){vu[i+1]=1;pile[p++]=i+1}
      if(y>0&&m[i-w]&&!vu[i-w]){vu[i-w]=1;pile[p++]=i-w}if(y<h-1&&m[i+w]&&!vu[i+w]){vu[i+w]=1;pile[p++]=i+w}}
    const bw=x1-x0+1,bh=y1-y0+1; /* un filet penché : large, et presque vide ou très plat */
    if(bh>hMax*1.5||pts.length<Math.max(8,M*M/200000)||nf<4||(bw>wMax*.4&&(pts.length<bw*bh*.15||bw>25*bh)))for(const i of pts)m[i]=0}}
/* Deux préparations, toutes deux rendues en noir sur blanc (ce que le lecteur lit le mieux) :
   « sombre » : texte foncé sur fond clair (plaques, étiquettes) ;
   « clair »  : texte clair sur fond plus sombre (écrans rétroéclairés).
   Dans les deux cas on ne garde que les traits fins qui tranchent sur leur fond immédiat : l'éclairage inégal, les reflets,
   le tour de l'écran et les aplats disparaissent d'eux-mêmes. */
function preparer(im,genre){const G=gris(im,2000),{w,h}=G,M=Math.max(w,h),clair=genre==="clair",lum=adoucir(G.lum,w,h,clair?Math.max(1,Math.round(M/900)):1),
    f=fond(lum,w,h,Math.max(6,Math.round(M/170)),clair),m=new Uint8Array(w*h);
  const fort=new Uint8Array(w*h),ecart=new Float32Array(w*h);
  for(let i=0;i<m.length;i++){const d=clair?lum[i]-f[i]:f[i]-lum[i],b=clair?f[i]:lum[i];if(d>16&&d>b*.12){m[i]=1;if(d>30&&d>b*.25)fort[i]=1}ecart[i]=d>0?d:0}
  nettoyer(m,w,h,M,fort);for(let i=0;i<m.length;i++)if(!m[i])ecart[i]=0;
  /* rendu en gris, chaque lettre ramenée au plein contraste de son voisinage : les lignes pâles se lisent comme les autres */
  const haut=extreme(ecart,w,h,Math.max(8,Math.round(M/60)),true);
  return{c:ecrire(G,i=>m[i]?255-Math.min(255,ecart[i]*290/Math.max(haut[i],30)):255),k:G.k}}

/* ---------- Résultat du lecteur (tableau TSV de Tesseract) → lignes {t, x, y, w, h} dans les mesures de la photo ----------
   Une photo prise un peu de travers donne des lignes penchées : la pente est mesurée sur les lignes longues, puis chaque ligne est
   remise à sa hauteur « à plat », pour que libellé et valeur d'une même rangée se retrouvent bien face à face. */
const mediane=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[s.length>>1]:0};
function lignesTsv(tsv,k){const L=new Map();k=k||1;
  for(const row of String(tsv||"").split("\n")){const c=row.split("\t");if(c.length<12||c[0]!=="5")continue;
    const t=c.slice(11).join("\t").trim(),conf=parseFloat(c[10]);if(!t||!(conf>=35)||!/[0-9A-Za-zÀ-ÿ]/.test(t))continue; /* un mot sans lettre ni chiffre : un reste de cadre */
    const cle=c[1]+"-"+c[2]+"-"+c[3]+"-"+c[4],x=+c[6],y=+c[7],w=+c[8],h=+c[9];let l=L.get(cle);if(!l)L.set(cle,l={m:[]});l.m.push({t,x,y,w,h})}
  const V=[...L.values()],pentes=[];
  for(const l of V){l.m.sort((a,b)=>a.x-b.x);const a=l.m[0],b=l.m[l.m.length-1];l.h=mediane(l.m.map(m=>m.h));
    l.x0=a.x;l.x1=Math.max(...l.m.map(m=>m.x+m.w));l.yc=mediane(l.m.map(m=>m.y+m.h/2));l.xc=(l.x0+l.x1)/2;
    if(l.m.length>1&&b.x-a.x>l.h*5)pentes.push((b.y+b.h/2-a.y-a.h/2)/(b.x+b.w/2-a.x-a.w/2))}
  const p=pentes.length>=2?mediane(pentes):0,pente=Math.abs(p)>.008&&Math.abs(p)<.3?p:0;
  return V.map(l=>({t:l.m.map(m=>m.t).join(" "),x:Math.round(l.x0/k),y:Math.round((l.yc-pente*l.xc-l.h/2)/k),w:Math.round((l.x1-l.x0)/k),h:Math.round(l.h/k)})).sort((a,b)=>a.y-b.y||a.x-b.x)}

/* ---------- Le lecteur (Tesseract), chargé à la première lecture ---------- */
let pret=null,ouvrier=null;
function script(src){return new Promise((res,rej)=>{const s=document.createElement("script");s.src=src;s.onload=res;s.onerror=()=>rej(new Error("script"));document.head.appendChild(s)})}
async function ouvrir(){if(!root.Tesseract)await script(url("tesseract.min.js"));
  const w=await root.Tesseract.createWorker("fra",1,{workerPath:url("worker.min.js"),corePath:url(""),langPath:url("").replace(/\/$/,""),workerBlobURL:false,cacheMethod:"none",gzip:true});
  /* mise en page « texte épars » : des mots et des nombres à des endroits quelconques, pas des paragraphes */
  await w.setParameters({tessedit_pageseg_mode:"11"});return w}
const api={
  /* Lit un dessin (canvas) et renvoie le tableau TSV. Remplaçable pour les essais. */
  moteur:async c=>{if(!pret)pret=ouvrir().then(w=>ouvrier=w).catch(e=>{pret=null;throw e});await pret;
    const r=await ouvrier.recognize(c,{},{text:false,tsv:true});return r&&r.data?r.data.tsv:""},
  /* Les fichiers du lecteur sont-ils là ? (ils ne sont livrés qu'avec la version web) */
  async verifier(){if(typeof Worker==="undefined"||typeof WebAssembly==="undefined")return false;
    try{const r=await fetch(url("fichiers.json"),{cache:"no-cache"});return r.ok}catch(e){return false}},
  /* Charge le lecteur une première fois, à un moment calme, pour que la première vraie lecture soit rapide et marche ensuite sans réseau
     (les fichiers restent dans la mémoire du site). Le lecteur est refermé aussitôt pour ne pas garder la mémoire occupée. */
  async prechauffer(){if(ouvrier||pret)return;try{const w=await ouvrir();await w.terminate()}catch(e){}},
  /* Codes-barres, là où le navigateur sait les lire */
  async codes(im){if(!("BarcodeDetector" in root))return[];try{const d=new root.BarcodeDetector();return[...new Set((await d.detect(im)).map(b=>String(b.rawValue||"").trim()).filter(Boolean))]}catch(e){return[]}},
  /* Lit une photo (data URL). note(résultat) dit combien de cases le texte lu permet de remplir : la photo est lue en texte foncé,
     puis en texte clair si le premier essai ne donne pas grand-chose, et le meilleur essai est gardé. clair : commencer par le texte clair. */
  async lire(src,note,clair){const im=await charger(src);let best=null;
    for(const genre of clair?["clair","sombre"]:["sombre","clair"]){const P=preparer(im,genre),lines=lignesTsv(await api.moteur(P.c),P.k),r={lines,codes:[]},n=note?note(r):lines.length;
      if(!best||n>best.n)best={r,n};if(n>=3)break}
    best.r.codes=await api.codes(im);return best.r},
  preparer,lignesTsv};
root.LecteurWeb=api;
})(typeof window!=="undefined"?window:globalThis);
