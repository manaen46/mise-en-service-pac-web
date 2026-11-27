"use strict";
/* =====================================================================
   Lecture de l'écran de la PAC (régulation, module hydraulique, télécommande).
   Entrée : les lignes de texte reconnues sur la photo (avec leur position).
   Sortie : les relevés trouvés (températures, pression, débit, mode…),
   prêts à mettre dans les cases de l'onglet Contrôles.
   Aucun accès à la page : testé seul (tests/ecran-test.mjs).
   ===================================================================== */
(function(root){
const propre=s=>String(s==null?"":s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[‘’`´]/g,"'").replace(/[−–—]/g,"-").replace(/\s+/g," ").trim();
const T="(?:temperature|temp\\b\\.?|t\\b\\.?|t°)";

/* Cases lisibles sur un écran. k : case de l'onglet Contrôles ; g : nature de la valeur ; rx : libellé (texte sans accents, en minuscules).
   L'ordre compte : le premier libellé reconnu sur une ligne gagne (« Consigne départ » avant « Température départ »). */
const CASES=[
  {k:"mode",g:"mode",l:"Mode de fonctionnement",rx:/^(?:etat|mode)(?: (?:de )?(?:fonctionnement|pac|systeme|generateur|actuel|en cours))?(?= |$)|^fonctionnement(?= |$)/},
  {k:"consEcs",g:"temp",l:"Consigne ECS",rx:/\bconsigne\b.*\b(?:ecs|sanitaire|eau chaude|ballon)\b|\b(?:ecs|sanitaire)\b.*\bconsigne\b/},
  {k:"consigne",g:"temp",l:"Consigne de confort",rx:/\bconsigne\b.*\b(?:ambian\w*|confort|piece|interieure?)\b/},
  {k:"consDep",g:"temp",l:"Consigne départ eau",rx:/\bconsigne\b.*\b(?:depart|eau|pac|chauffage|primaire)\b|\bdepart\b.*\bconsigne\b/},
  {k:"tdep",g:"temp",l:"Température départ eau",rx:new RegExp("\\b"+T+" ?(?:de |d')?(?:depart|sortie)\\b|^depart(?: (?:eau|pac|chauffage|primaire))?$|\\bdepart (?:eau|pac)\\b|\\bsortie (?:eau|condenseur)\\b")},
  {k:"tret",g:"temp",l:"Température retour eau",rx:new RegExp("\\b"+T+" ?(?:de |d')?(?:retour|entree)\\b|^retour(?: (?:eau|pac|chauffage|primaire))?$|\\bretour (?:eau|pac)\\b|\\bentree (?:eau|condenseur)\\b")},
  {k:"text",g:"temp",l:"Température extérieure",rx:new RegExp("\\b"+T+" ?ext(?:erieure?|\\b\\.?)|^(?:sonde )?exterieure?$|\\bair exterieur\\b")},
  {k:"tref",g:"temp",l:"Température de refoulement",rx:new RegExp("\\b"+T+" ?(?:de )?refoulement\\b|^refoulement(?: compresseur)?$|\\b"+T+" ?(?:de )?decharge\\b")},
  {k:"sc",g:"ecart",l:"Surchauffe",rx:/\bsurchauffe\b/},
  {k:"sr",g:"ecart",l:"Sous-refroidissement",rx:/\bsous[ -]?refroidissement\b/},
  {k:"hp",g:"bar",l:"Haute pression (HP)",rx:/\bhaute pression\b|\bpression (?:hp|haute|de condensation|condensation|de refoulement|refoulement)\b|^hp$/},
  {k:"bp",g:"bar",l:"Basse pression (BP)",rx:/\bbasse pression\b|\bpression (?:bp|basse|d'evaporation|evaporation|d'aspiration|aspiration)\b|^bp$/},
  {k:"pressEau",g:"bar",l:"Pression hydraulique en fonctionnement",rx:/\bpression (?:hydraulique|d'eau|eau|du circuit|circuit|installation|de l'installation|chauffage|primaire)\b|^pression$/},
  {k:"debit",g:"debit",l:"Débit d'eau",rx:/\bdebit\b|\bcirculateur\b/},
  {k:"intensApp",g:"amp",l:"Intensité absorbée appoint élec.",rx:/\b(?:intensite|courant)\b.*\bappoint\b/},
  {k:"intens",g:"amp",l:"Intensité absorbée groupe",rx:/\bintensite\b|\bcourant (?:compresseur|absorbe|pac|unite exterieure|ue|groupe)\b/}];
const PAR_K=Object.fromEntries(CASES.map(c=>[c.k,c]));
const CLES=CASES.map(c=>c.k);

/* Lignes à ne pas prendre pour un libellé de relevé (max, min, hystérésis, puissance…) */
const RX_EXCLU=/\b(?:max\w*|min\b|mini\w*|limite|hysteresis|offset|decalage|pente|puissance|energie|consommation|frequence|vitesse|moyenne|attenuee|melangee|composee|zone ?[2-9]|circuit ?[2-9])\b/;

const NB="(-? ?\\d+(?:[.,]\\d+)?)";
const fmt=(v,d)=>{const p=Math.pow(10,d);return String(Math.round(v*p)/p).replace(".",",")};
const nb=s=>parseFloat(String(s).replace(/\s/g,"").replace(",","."));
/* « l °C » ou « I °C » lu à la place de « 1 °C » */
const unSeul=t=>t.replace(/^(-? ?)[il|](?= ?[°º*'"o]? ?c$)/i,"$11");

/* Valeur d'une nature donnée dans un texte. seule : le texte ne contient que la valeur (ligne sous le libellé), un nombre sans unité est alors accepté. */
function valeur(g,texte,seule){let t=propre(texte).toLowerCase();if(!t)return null;let m;
  if(g==="mode"){
    /* le mot du mode doit ouvrir le texte : « Appoint chauffage : arrêt » n'est pas un mode */
    t=t.replace(/^(?:mode|production|en) (?:d')?/,"");
    if(/^(?:ecs|sanitaire|eau chaude)\b/.test(t))return{v:"ECS",lu:texte};
    if(/^(?:rafraich\w*|refroid\w*|froid|clim\w*)\b/.test(t))return{v:"Froid",lu:texte};
    if(/^(?:chauffage|chauffe|chaud)\b/.test(t))return{v:"Chaud",lu:texte};
    return null}
  if(g==="temp"||g==="ecart"){t=unSeul(t);
    m=new RegExp(NB+" ?(?:[°º*'\"o] ?c|c)(?![a-z0-9])").exec(t)||(g==="ecart"&&new RegExp(NB+" ?k(?![a-z0-9])").exec(t))||(seule&&new RegExp("^"+NB+" ?[°º*'\"]?$").exec(t));
    if(!m)return null;const v=nb(m[1]);if(!isFinite(v)||v<(g==="ecart"?-5:-45)||v>(g==="ecart"?60:130))return null;return{v:fmt(v,1),lu:m[0]}}
  if(g==="bar"){m=new RegExp(NB+" ?b[aeo]rs?(?![a-z0-9])").exec(t)||(seule&&new RegExp("^"+NB+"$").exec(t));
    if(!m)return null;const v=nb(m[1]);if(!isFinite(v)||v<0||v>60)return null;return{v:fmt(v,2),lu:m[0]}}
  if(g==="amp"){m=new RegExp(NB+" ?a(?:mp\\w*)?(?![a-z0-9])").exec(t)||(seule&&new RegExp("^"+NB+"$").exec(t));
    if(!m)return null;const v=nb(m[1]);if(!isFinite(v)||v<0||v>200)return null;return{v:fmt(v,1),lu:m[0]}}
  if(g==="debit"){
    /* case en l/min ; l'unité est obligatoire sur l'écran : un circulateur affiche aussi des % ou « Marche » */
    if((m=new RegExp(NB+" ?m ?[3³] ?\\/ ?h").exec(t))){const v=nb(m[1]);return v>0&&v<=30?{v:fmt(v*1000/60,1),lu:m[0]}:null}
    if((m=new RegExp(NB+" ?l ?\\/ ?h(?![a-z])").exec(t))){const v=nb(m[1]);return v>0&&v<=30000?{v:fmt(v/60,1),lu:m[0]}:null}
    /* « L/min » est souvent lu « U/min », « LU/min », « 1/min » */
    if((m=new RegExp(NB+" ?[a-z1|]{0,2} ?\\/ ?m(?:in|n)(?![a-z])").exec(t))){const v=nb(m[1]);return v>0&&v<=500?{v:fmt(v,1),lu:m[0]}:null}
    return null}
  return null}

function versLignes(lines){return(lines||[]).map((l,i)=>typeof l==="string"?{t:l,x:0,y:i*10,w:100,h:8}:l)
  .map((l,i)=>({o:String(l.t==null?"":l.t).replace(/\s+/g," ").trim(),t:propre(l.t).toLowerCase(),x:+l.x||0,y:isFinite(+l.y)?+l.y:i*10,w:+l.w||1,h:+l.h||8})).filter(l=>l.t)}
/* Regroupe les lignes qui sont à la même hauteur */
function rangees(L){const S=[...L].sort((a,b)=>(a.y+a.h/2)-(b.y+b.h/2)),R=[];
  for(const l of S){const c=l.y+l.h/2,r=R[R.length-1];
    if(r&&Math.abs(c-r.c)<Math.min(l.h,r.h)*.6){r.l.push(l);r.c=(r.c*(r.l.length-1)+c)/r.l.length;r.h=Math.max(r.h,l.h)}else R.push({c,h:l.h,l:[l]})}
  R.forEach(r=>r.l.sort((a,b)=>a.x-b.x));return R}

/* Libellé reconnu sur une ligne : {c: case, fin: position de la fin du libellé} */
function libelle(t){const sans=t.replace(/[:=]/g," ").replace(/\s+/g," ").trim();
  for(const c of CASES){const m=c.rx.exec(sans);if(!m)continue;
    /* un mot d'exclusion dans le libellé lui-même : ce n'est pas le relevé cherché */
    const avant=sans.replace(/-? ?\d.*$/,"");if(RX_EXCLU.test(avant))return null;
    return{c,fin:m.index+m[0].length,sans}}
  return null}
/* Une ligne de texte sans chiffre ressemble à un autre libellé : la valeur cherchée n'est pas plus loin */
const autreLibelle=t=>!/\d/.test(t)&&/[a-z]{3}/.test(t);

function lire(res){res=res||{};const L=versLignes(res.lines),R=rangees(L),vals={},lu={};
  const lab=new Map();for(const l of L){const b=libelle(l.t);if(b)lab.set(l,b)}
  for(let ri=0;ri<R.length;ri++)for(let li=0;li<R[ri].l.length;li++){const l=R[ri].l[li],b=lab.get(l);if(!b||vals[b.c.k])continue;const g=b.c.g;let v=null,src=l;
    /* 1. sur la même ligne, après le libellé */
    const reste=b.sans.slice(b.fin).replace(/^[\s.\-]+(?=\s)/,"").trim();if(reste)v=valeur(g,reste,true)||valeur(g,reste,false);
    /* 2. à droite, à la même hauteur */
    for(let k=li+1;!v&&k<R[ri].l.length;k++){const o=R[ri].l[k];if(lab.has(o))break;v=valeur(g,o.t,true);if(v)src=o;else if(g!=="mode"&&autreLibelle(o.t))break}
    /* 3. juste en dessous (valeur alignée à droite sous le libellé), sans dépasser le libellé suivant */
    for(let rj=ri+1,stop=false;!v&&!stop&&rj<=ri+2&&rj<R.length;rj++){if(R[rj].c-R[ri].c>Math.max(l.h,R[rj].h)*2.8)break;
      for(const o of R[rj].l){if(lab.has(o)){stop=true;break}v=valeur(g,o.t,true);if(v){src=o;break}if(g==="mode"||autreLibelle(o.t)){stop=true;break}}}
    if(v){vals[b.c.k]=v.v;lu[b.c.k]=src.o}}
  return{vals,lu,texte:[...new Set(L.map(l=>l.o))]}}

/* Fusionne les lectures de plusieurs photos (l'écran défile) : la première valeur trouvée est gardée */
function fusion(list){const o={vals:{},lu:{},texte:[]};
  for(const r of list){if(!r)continue;for(const k of CLES)if(o.vals[k]===undefined&&r.vals[k]!==undefined){o.vals[k]=r.vals[k];o.lu[k]=r.lu[k]}
    for(const t of r.texte||[])if(!o.texte.includes(t))o.texte.push(t)}
  return o}

/* Valeur à mettre dans une case à partir d'un texte touché par l'utilisateur */
function choisir(k,texte){const c=PAR_K[k];if(!c)return null;
  let v=valeur(c.g,texte,false);
  if(!v){const b=libelle(propre(texte).toLowerCase());const t=b?b.sans.slice(b.fin):propre(texte);const m=new RegExp(NB).exec(t);if(m&&c.g!=="mode"&&c.g!=="debit")v=valeur(c.g,m[1],true)}
  return v?v.v:null}

/* Photo d'un thermomètre (radiateur) : la température affichée. Le nombre suivi de « °C » ou, à défaut, le plus gros nombre de la photo ;
   jamais une heure, une date, un pourcentage, des °F ni l'émissivité. plage : [mini, maxi] acceptés. */
function temperature(res,plage){const L=versLignes((res||{}).lines),[mini,maxi]=plage||[5,99],C=[];const hMax=Math.max(1,...L.map(l=>l.h));
  for(const l of L){const t=unSeul(l.t),rx=/(-? ?\d+(?:[.,]\d+)?)( ?(?:[°º*'"o] ?c|c)(?![a-z0-9]))?/g;let m;
    if(/\d ?[:h] ?\d\d|\d[\/.]\d\d?[\/.]\d\d/.test(t))continue;          /* heure ou date */
    while((m=rx.exec(t))){const v=nb(m[1]),unite=!!m[2],av=t.slice(0,m.index),ap=t.slice(m.index+m[0].length);
      if(!isFinite(v)||v<mini||v>maxi)continue;
      if(!unite&&/^ ?(?:%|[°º*'"o] ?f|f\b|[a-z])/.test(ap))continue;                 /* autre unité (%, °F, V, mm…) */
      if(/(?:[eε] ?[=:]?|emis\w*|\bmax\w*|\bmin\w*|\bhi\b|\blo\b|\bbat\w*) ?$/.test(av))continue;   /* émissivité, mini/maxi mémorisés */
      if(!unite&&/[a-z0-9]$/.test(av))continue;                                    /* morceau d'une référence (« TG165 ») */
      const seul=!av.trim()&&!ap.trim();if(!unite&&!seul)continue;
      C.push({v:fmt(v,1),lu:l.o,unite,sc:(l.h/hMax)*2+(unite?1:0)+(/[.,]\d/.test(m[1])?.3:0)})}}
  C.sort((a,b)=>b.sc-a.sc);const vus=[...new Set(C.map(c=>c.v))];
  return{v:C.length?C[0].v:null,lu:C.length?C[0].lu:"",unite:!!(C.length&&C[0].unite),autres:vus.slice(1),texte:[...new Set(L.map(l=>l.o))]}}

const api={lire,fusion,choisir,temperature,CASES:CASES.map(c=>({k:c.k,g:c.g,l:c.l}))};
if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.Ecran=api;
})(typeof window!=="undefined"?window:globalThis);
