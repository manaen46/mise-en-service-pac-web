"use strict";
/* =====================================================================
   Lecture des plaques signalétiques.
   Entrée : les lignes de texte reconnues sur la photo (avec leur position)
   et les codes-barres lus. Sortie : marque, gamme, référence, n° de série,
   fluide et charge d'usine. Aucun accès à la page : testé seul
   (tests/plaque-test.mjs).
   ===================================================================== */
(function(root){
/* Marques cherchées dans le texte (la première trouvée dans cet ordre gagne : une Atlantic fabriquée par Fujitsu reste une Atlantic) */
const MARQUES=[["Atlantic",/\batlantic\b/],["Thermor",/\bthermor\b/],["De Dietrich",/\bde\s?dietrich\b/],["Saunier Duval",/\bsaunier\s?duval\b/],["Chappée",/\bchappee\b/],
  ["Viessmann",/\bviessmann\b/],["Vaillant",/\bvaillant\b/],["Bosch",/\bbosch\b/],["Daikin",/\bdaikin\b/],["Mitsubishi Electric",/\bmitsubishi\b/],["Panasonic",/\bpanasonic\b/],
  ["Hitachi",/\bhitachi\b/],["Toshiba",/\btoshiba\b/],["Samsung",/\bsamsung\b/],["LG",/\blg\s+electronics\b|^lg$/],["Fujitsu",/\bfujitsu\b/],["Airwell",/\bairwell\b/],
  ["Gree",/\bgree\b/],["Midea",/\bmidea\b/],["Haier",/\bhaier\b/],["Carrier",/\bcarrier\b/],["Hisense",/\bhisense\b/],["Aldes",/\baldes\b/],["Stiebel Eltron",/\bstiebel\b/],
  ["Frisquet",/\bfrisquet\b/],["Heiwa",/\bheiwa\b/],["Airton",/\bairton\b/]];
/* Gammes connues, de la plus longue à la plus courte */
const GAMMES=["Alféa Excellia Duo","Alféa Extensa Duo","Alféa Hybrid Duo","Alféa Excellia","Alféa Extensa","Loria Duo","Loria","Takao","Zenkeo","Naéma","Dojo"];
const FLUIDES=["R1234yf","R1234ze","R410A","R407C","R454B","R452B","R513A","R134a","R290","R744","R32"];
const RX_FLUIDE=/\bR\s?-?\s?(1234\s?yf|1234\s?ze|410\s?A|407\s?C|454\s?B|452\s?B|513\s?A|134\s?a|290|744|32)(?![0-9])/i;

/* Libellés (texte sans accents) */
const S_SERIE="(?:\\bserial\\s*(?:number\\b|num\\b\\.?|n(?:[o0r]\\b|[°º])\\.?)?|\\bs\\s?\\/\\s?n\\b|\\bsn\\s*[:.]|\\bn\\s?[°ºo0']?\\.?\\s*(?:de\\s+)?serie\\b|\\bnumero\\s+(?:de\\s+)?serie\\b|\\bserien\\s*-?\\s*(?:nr|nummer)\\b\\.?|\\bmatricola\\b|\\bmfg\\.?\\s*n(?:[o0r]\\b|[°º])\\.?|\\bn\\s?[°ºo]\\.?\\s*(?:de\\s+)?fabrication\\b|\\bfabrication\\s*n(?:[o0r]\\b|[°º])\\.?)";
const S_MODELE="(?:\\bmodel{1,2}[eo]?\\b\\.?(?:\\s*(?:name\\b|number\\b|n(?:[o0r]\\b|[°º])\\.?))?)";
const S_FAIBLES=["\\bdesignation\\b","\\bref(?:erence)?\\b\\.?","\\btype?\\b","\\bcode(?:\\s+(?:article|produit))?\\b","\\barticle\\b"];
const S_TOUS="(?:"+[S_SERIE,S_MODELE,...S_FAIBLES].join("|")+")";
const SEP="[\\s:.\\-=#\\/|]*";
const RX_DEBUT=new RegExp("^"+SEP+S_TOUS+SEP,"i");
const RX_LIBELLE=new RegExp(S_TOUS,"i");
/* Ce qui suit une référence sur la même ligne et n'en fait plus partie */
const RX_STOP=/\s+(?:serial|s\/n|n\s?[°º]|no\.|refrigerant|fluide|frigorig|ipx?\d|made\b|fabrique|assemble|date\b|\d+(?:[.,]\d+)?\s?(?:hz|kw|kg|bar|mpa|volts?|v\s?~)(?![a-z])).*$/i;
const RX_REF_MOT=/\b(?:refrig|frigorig|fluide|charge|kaltemittel|carga|gas\b|gaz\b)/i;
const RX_POIDS=/\b(?:poids|weight|masse|mass\b|net\b|gross|brut|gewicht|peso)/i;

const propre=s=>String(s==null?"":s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[‘’`´]/g,"'").replace(/\s+/g," ").trim();
/* Retire le ou les libellés en tête (« SERIAL No. / N° de série : 1234 » → « 1234 ») */
function sansLibelle(s){let t=propre(s),n=0;for(;n<4;n++){const m=RX_DEBUT.exec(t);if(!m||!m[0])break;t=t.slice(m[0].length)}return t.replace(/^[\s:.\-=#\/|]+/,"").trim()}

function versLignes(lines){return(lines||[]).map((l,i)=>typeof l==="string"?{t:l,x:0,y:i*10,w:100,h:8}:l)
  .map((l,i)=>({t:propre(l.t),x:+l.x||0,y:isFinite(+l.y)?+l.y:i*10,w:+l.w||1,h:+l.h||8})).filter(l=>l.t)}
/* Regroupe les lignes qui sont à la même hauteur : libellé à gauche, valeur à droite */
function rangees(L){const S=[...L].sort((a,b)=>(a.y+a.h/2)-(b.y+b.h/2)),R=[];
  for(const l of S){const c=l.y+l.h/2,r=R[R.length-1];
    if(r&&Math.abs(c-r.c)<Math.min(l.h,r.h)*.6){r.l.push(l);r.c=(r.c*(r.l.length-1)+c)/r.l.length;r.h=Math.max(r.h,l.h)}else R.push({c,h:l.h,l:[l]})}
  R.forEach(r=>r.l.sort((a,b)=>a.x-b.x));return R}

function okSerie(v){v=propre(v).toUpperCase();if(RX_LIBELLE.test(v))return"";
  const m=/^[A-Z0-9][A-Z0-9\-\/.]*(?: [A-Z0-9][A-Z0-9\-\/.]*)?/.exec(v);if(!m)return"";
  let s=m[0];const p=s.split(" ");
  /* deuxième morceau gardé seulement si le premier est trop court pour être un n° de série à lui seul */
  if(p.length>1&&(p[0].length>=6||!/\d/.test(p[1])))s=p[0];
  s=s.replace(/[.\-\/]+$/,"");
  return s.length>=4&&s.length<=26&&(s.match(/\d/g)||[]).length>=3?s:""}
function okRef(v){v=propre(v).toUpperCase().replace(RX_STOP,"").replace(/[\s.:;,\-\/]+$/,"").trim();
  if(v.length<3||v.length>34||!/\d/.test(v)||!/[A-Z0-9]{2}/.test(v))return"";
  if(RX_LIBELLE.test(v)||/^N\s?[°º.]/.test(v))return"";
  if(new RegExp("^"+RX_FLUIDE.source+"$","i").test(v))return"";
  if(/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(v))return"";
  return v}

/* Valeur d'un libellé : sur la même ligne, sinon à droite sur la même rangée, sinon juste en dessous */
function chercher(R,src,ok){const rx=new RegExp(src,"i");
  for(let ri=0;ri<R.length;ri++)for(let li=0;li<R[ri].l.length;li++){const l=R[ri].l[li],m=rx.exec(l.t);if(!m)continue;
    let v=ok(sansLibelle(l.t.slice(m.index)));if(v)return v;
    for(let k=li+1;k<R[ri].l.length;k++){v=ok(sansLibelle(R[ri].l[k].t));if(v)return v;if(RX_LIBELLE.test(R[ri].l[k].t))break}
    for(let rj=ri+1;rj<=ri+2&&rj<R.length;rj++){if(R[rj].c-R[ri].c>Math.max(l.h,R[rj].h)*3.2)break;
      const c=R[rj].l.filter(o=>o.x<l.x+l.w&&o.x+o.w>l.x-l.w*.2).sort((a,b)=>Math.abs(a.x-l.x)-Math.abs(b.x-l.x))[0];
      if(!c)continue;if(RX_LIBELLE.test(c.t)&&!ok(sansLibelle(c.t)))break;v=ok(sansLibelle(c.t));if(v)return v}}
  return""}

function fluide(L){for(const l of L){const m=RX_FLUIDE.exec(l.t);if(m){const k=("R"+m[1]).replace(/\s/g,"").toLowerCase();return FLUIDES.find(f=>f.toLowerCase()===k)||""}}return""}

/* Charge de fluide : un nombre en kg (ou g) à côté du fluide ou du mot « charge / refrigerant », jamais le poids de l'appareil */
function charge(R){let best=null;
  for(const r of R){const ref=r.l.filter(l=>RX_REF_MOT.test(l.t)||RX_FLUIDE.test(l.t)),pds=r.l.filter(l=>RX_POIDS.test(l.t));
    for(const l of r.l){const rx=/(\d+(?:[.,]\d+)?)\s?(kg|g)\b/gi;let m;
      while((m=rx.exec(l.t))){let v=parseFloat(m[1].replace(",","."));if(m[2].toLowerCase()==="g")v/=1000;if(!(v>=.05&&v<=40))continue;
        const moi=ref.includes(l),lourd=pds.includes(l);let sc=0;
        if(moi&&lourd){const av=l.t.slice(0,m.index),iR=Math.max(av.search(RX_REF_MOT),av.search(RX_FLUIDE)),iP=av.search(RX_POIDS);sc=iR>iP?4:0}
        else if(moi)sc=5;else if(lourd)sc=0;
        else if(ref.length){const lab=[...ref,...pds].filter(o=>o.x<=l.x).sort((a,b)=>b.x-a.x)[0]||[...ref,...pds].sort((a,b)=>Math.abs(a.x-l.x)-Math.abs(b.x-l.x))[0];sc=ref.includes(lab)?3:0}
        if(sc>0&&(!best||sc>best.sc))best={sc,v}}}}
  return best?String(Math.round(best.v*1000)/1000).replace(".",","):""}

function marque(L){const T=L.map(l=>l.t.toLowerCase());for(const [n,rx] of MARQUES)if(T.some(t=>rx.test(t)))return n;return""}
function gamme(L){const all=" "+L.map(l=>l.t.toLowerCase()).join(" ")+" ";for(const g of GAMMES){const k=propre(g).toLowerCase().replace(/\s+/g,"\\s*");if(new RegExp("\\b"+k+"\\b").test(all))return g}return""}

const norme=s=>String(s||"").toUpperCase().replace(/[^A-Z0-9]/g,"").replace(/O/g,"0").replace(/[IL]/g,"1").replace(/S/g,"5").replace(/B/g,"8").replace(/Z/g,"2");
const codeUtile=c=>/^[A-Za-z0-9][A-Za-z0-9\-\/. ]{4,29}$/.test(c)&&!/^\d{8}$|^\d{12,14}$/.test(c);

function lire(res){res=res||{};const L=versLignes(res.lines),R=rangees(L);
  const codes=[...new Set((res.codes||[]).map(c=>String(c||"").trim()).filter(Boolean))];
  const out={marque:marque(L),gamme:gamme(L),ref:"",serie:"",fluide:fluide(L),charge:charge(R),
    texte:[...new Set(R.flatMap(r=>r.l.map(l=>l.t)))],codes};
  out.serie=chercher(R,S_SERIE,okSerie);
  out.ref=chercher(R,S_MODELE,okRef);
  for(const s of S_FAIBLES){if(out.ref)break;out.ref=chercher(R,s,okRef)}
  if(out.ref&&out.ref===out.serie)out.ref="";
  /* le code-barres donne le n° de série sans faute de lecture (0/O, 1/I…) */
  const utiles=codes.filter(codeUtile);
  if(out.serie){const k=norme(out.serie),c=utiles.find(c=>norme(c)===k);if(c)out.serie=c.toUpperCase()}
  else if(utiles.length===1&&norme(utiles[0])!==norme(out.ref))out.serie=utiles[0].toUpperCase();
  return out}

/* Fusionne les lectures de plusieurs photos de la même plaque : la première valeur trouvée est gardée */
function fusion(list){const o={marque:"",gamme:"",ref:"",serie:"",fluide:"",charge:"",texte:[],codes:[]};
  for(const r of list){if(!r)continue;for(const k of["marque","gamme","ref","serie","fluide","charge"])if(!o[k]&&r[k])o[k]=r[k];
    for(const t of r.texte||[])if(!o.texte.includes(t))o.texte.push(t);for(const c of r.codes||[])if(!o.codes.includes(c))o.codes.push(c)}
  return o}

const api={lire,fusion,sansLibelle};
if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.Plaque=api;
})(typeof window!=="undefined"?window:globalThis);
