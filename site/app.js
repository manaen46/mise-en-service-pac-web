"use strict";
/* =====================================================================
   Mise en Service PAC — saisie des mises en service de pompes à chaleur
   (Atlantic, Daikin, Mitsubishi Electric et autres marques), PV de mise
   en service et fiche d'intervention Cerfa 15497*04 en PDF.
   Tout est stocké sur le téléphone, rien ne part sur un serveur.

   Plan du fichier :
     Référentiel (types, fluides, points de contrôle, gammes)
     Stockage, modèle de données, remise en état d'un chantier
     Écrans : accueil, réglages, chantier, PAC (5 onglets), panneaux
     Photos et lectures de photos (plaques, écran de la PAC, thermomètre)
     Visionneuse, saisie, boutons
     Fichiers (mail, enregistrement, partage) et PDF (PV, Cerfa)
   Les lectures de photos elles-mêmes sont dans plaque.js, ecran.js et afficheur.js.
   ===================================================================== */
const $=id=>document.getElementById(id);
const NATIVE=window.MesNative||null;
const uid=()=>Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function today(){const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
const fmtDate=d=>d?d.split("-").reverse().join("/"):"";
const num=v=>{const n=parseFloat(String(v??"").replace(",",".").replace(/\s/g,""));return isFinite(n)?n:0};
/* texte sans accents (noms de fichiers, comparaison de marques) */
const sansAccent=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const fr=(n,d)=>(Math.round(n*Math.pow(10,d))/Math.pow(10,d)).toLocaleString("fr-FR",{minimumFractionDigits:0,maximumFractionDigits:d});
const BACK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';

/* ---------------- Référentiel ---------------- */
const TYPES={aes:"Air/eau split",aem:"Air/eau monobloc",aam:"Air/air mono-split",aax:"Air/air multi-split"};
const isFrigo=t=>t!=="aem";            // liaisons frigorifiques faites sur place
const isEau=t=>t==="aes"||t==="aem";
const isAir=t=>t==="aam"||t==="aax";
/* PRG (pouvoir de réchauffement global) utilisés pour la tonne équivalent CO2 ; modifiables dans l'appli */
const FLUIDES={
  R32:{prg:675,fam:"HFC",adr:"UN 3252, DIFLUOROMETHANE (GAZ REFRIGERANT R 32), 2.1"},
  R410A:{prg:2088,fam:"HFC",adr:"UN 3163, GAZ LIQUEFIE, N.S.A. (R 410A), 2.2"},
  R134a:{prg:1430,fam:"HFC",adr:"UN 3159, 1,1,1,2-TETRAFLUOROETHANE (GAZ REFRIGERANT R 134a), 2.2"},
  R407C:{prg:1774,fam:"HFC",adr:"UN 3340, GAZ REFRIGERANT R 407C, 2.2"},
  R454B:{prg:466,fam:"HFC",adr:""},R452B:{prg:698,fam:"HFC",adr:""},R513A:{prg:631,fam:"HFC",adr:""},
  R1234yf:{prg:4,fam:"HFO",adr:""},R1234ze:{prg:7,fam:"HFO",adr:""},
  R290:{prg:3,fam:"HC",adr:"UN 1978, PROPANE, 2.1"},R744:{prg:1,fam:"CO2",adr:"UN 1013, DIOXYDE DE CARBONE, 2.2"},
  Autre:{prg:0,fam:"HFC",adr:""}};
const NATURES=[["assemblage","Assemblage de l'équipement"],["mes","Mise en service"],["modif","Modification"],["maint","Maintenance"],["ctrlp","Contrôle d'étanchéité périodique"],["ctrlnp","Contrôle d'étanchéité non périodique"],["demant","Démantèlement"],["autre","Autre"]];

/* Points de mise en service, par section. only : types de PAC concernés (absent = tous).
   Nature d'un point : k = OK / NC / sans objet, n = nombre (u : unité), x = texte libre, s = choix dans une liste. */
const SECTIONS=[
 {id:"inst",t:"Installation et électricité",items:[
  {f:"uePose",k:1,l:"Unité extérieure : support, dégagements, évacuation des condensats"},
  {f:"uiPose",k:1,l:"Unité(s) intérieure(s) / module hydraulique : fixation, niveau, accessibilité"},
  {f:"tension",n:1,l:"Unité extérieure : tension d'alimentation",u:"V"},
  {f:"tensionNT",n:1,l:"Unité extérieure : tension neutre / terre",u:"V"},
  {f:"disj",x:1,l:"Unité extérieure : disjoncteur (calibre / courbe)",ph:"Ex. : 32 A courbe C"},
  {f:"section",x:1,l:"Unité extérieure : section du câble",ph:"Ex. : 3G6 mm²"},
  {f:"tensionUI",n:1,l:"Unité intérieure / module : tension d'alimentation",u:"V"},
  {f:"disjUI",x:1,l:"Unité intérieure / module : disjoncteur (calibre / courbe)",ph:"Ex. : 2 A courbe C, ou alimentée par l'UE"},
  {f:"sectionUI",x:1,l:"Unité intérieure / module : section du câble",ph:"Ex. : 3G1,5 mm²"},
  {f:"appPuis",n:1,l:"Appoint électrique : puissance",u:"kW",only:isEau},
  {f:"appTension",x:1,l:"Appoint électrique : alimentation (mono / tri)",ph:"Ex. : 230 V mono ou 400 V tri",only:isEau},
  {f:"appTensionNT",n:1,l:"Appoint électrique : tension neutre / terre",u:"V",only:isEau},
  {f:"appDisj",x:1,l:"Appoint électrique : disjoncteur (calibre / courbe)",ph:"Ex. : 32 A courbe C",only:isEau},
  {f:"appSection",x:1,l:"Appoint électrique : section du câble",ph:"Ex. : 3G6 mm²",only:isEau},
  {f:"terre",k:1,l:"Mise à la terre et serrage des bornes"},
  {f:"bus",k:1,l:"Liaison de communication UE / UI"}]},
 {id:"frigo",t:"Circuit frigorifique",only:isFrigo,items:[
  {f:"long",n:1,l:"Longueur des liaisons",u:"m"},
  {f:"diam",x:1,l:"Diamètres liquide / gaz",ph:"Ex. : 1/4\" - 5/8\""},
  {f:"raccords",k:1,l:"Raccords / dudgeons serrés au couple"},
  {f:"azote",n:1,l:"Pression de l'épreuve à l'azote",u:"bar"},
  {f:"azoteH",n:1,l:"Durée de la mise sous pression (azote)",u:"h"},
  {f:"vide",n:1,l:"Vide atteint",u:"mbar"},
  {f:"videH",n:1,l:"Durée du tirage au vide",u:"h"},
  {f:"videTenue",k:1,l:"Tenue du vide (pas de remontée)"},
  {f:"vannes",k:1,l:"Ouverture des vannes de l'unité extérieure"},
  {f:"etanch",k:1,l:"Contrôle d'étanchéité des raccords au détecteur"}]},
 {id:"mono",t:"Monobloc",only:t=>t==="aem",items:[
  {f:"scelle",k:1,l:"Circuit frigorifique scellé d'usine, sans intervention"},
  {f:"horsGel",k:1,l:"Protection antigel (glycol ou vannes antigel)"}]},
 {id:"hydro",t:"Circuit hydraulique",only:isEau,items:[
  {f:"rincage",k:1,l:"Rinçage / désembouage du réseau"},
  {f:"filtre",k:1,l:"Filtre / pot à boues (magnétique)"},
  {f:"traitEau",k:1,l:"Traitement de l'eau du circuit (inhibiteur)"},
  {f:"traitProd",x:1,bloc:1,l:"Traitement de l'eau : nom du produit",ph:"Ex. : inhibiteur, désembouant, antigel…"},
  {f:"pression",n:1,l:"Pression du circuit à froid",u:"bar"},
  {f:"purge",k:1,l:"Purge d'air du circuit"},
  {f:"vase",n:1,l:"Pré-gonflage du vase d'expansion",u:"bar"},
  {f:"glycol",n:1,l:"Taux de glycol",u:"%"},
  {f:"soupape",k:1,l:"Soupape de sécurité / disconnecteur"},
  {f:"ecs",k:1,l:"Ballon ECS raccordé et rempli"},
  {f:"appoint",k:1,l:"Appoint électrique / relève chaudière testé"}]},
 {id:"rel",t:"Relevés en fonctionnement",rel:1,items:[
  {f:"mode",s:["Chaud","Froid","ECS"],l:"Mode de fonctionnement"},
  {f:"text",n:1,l:"Température extérieure",u:"°C"},
  {f:"hp",n:1,l:"Haute pression (HP)",u:"bar",only:isFrigo},
  {f:"bp",n:1,l:"Basse pression (BP)",u:"bar",only:isFrigo},
  {f:"tref",n:1,l:"Température de refoulement",u:"°C"},
  {f:"sc",n:1,l:"Surchauffe",u:"K",only:isFrigo},
  {f:"sr",n:1,l:"Sous-refroidissement",u:"K",only:isFrigo},
  {f:"consDep",n:1,l:"Consigne départ eau",u:"°C",only:isEau},
  {f:"tdep",n:1,l:"Température départ eau",u:"°C",only:isEau},
  {f:"tret",n:1,l:"Température retour eau",u:"°C",only:isEau},
  {f:"debit",n:1,l:"Débit d'eau",u:"l/min",only:isEau},
  {f:"pressEau",n:1,l:"Pression hydraulique en fonctionnement",u:"bar",only:isEau},
  {f:"tsouf",n:1,l:"Température air soufflé",u:"°C",only:isAir},
  {f:"trep",n:1,l:"Température air repris",u:"°C",only:isAir},
  {f:"intens",n:1,l:"Intensité absorbée groupe",u:"A"},
  {f:"intensApp",n:1,l:"Intensité absorbée appoint élec.",u:"A",only:isEau}]},
 {id:"regul",t:"Régulation et réglages",items:[
  {f:"loi",x:1,l:"Loi d'eau (pente / décalage)",ph:"Ex. : pente 0,6 / décalage 0",only:isEau},
  {f:"tdepMax",n:1,l:"Température départ maximale",u:"°C",only:isEau},
  {f:"consigne",n:1,l:"Consigne de confort",u:"°C"},
  {f:"consEcs",n:1,l:"Consigne ECS",u:"°C",only:isEau},
  {f:"sonde",k:1,l:"Sonde extérieure / sonde d'ambiance en place"},
  {f:"connect",k:1,l:"Pilotage connecté configuré (Cozytouch, appli…)"},
  {f:"telecom",k:1,l:"Télécommandes / thermostats paramétrés",only:isAir},
  {f:"antileg",k:1,l:"Cycle anti-légionelle programmé",only:isEau}]},
 {id:"client",t:"Remise au client",items:[
  {f:"expli",k:1,l:"Explication du fonctionnement et de l'entretien"},
  {f:"notice",k:1,l:"Notices remises au client"},
  {f:"garantie",k:1,l:"Garantie / enregistrement constructeur"},
  {f:"entretien",k:1,l:"Rappel de l'entretien obligatoire (tous les 2 ans)"}]}];
const REL_KEYS=new Set(SECTIONS.find(s=>s.id==="rel").items.map(i=>i.f));
const secItems=(s,t)=>(!s.only||s.only(t))?s.items.filter(i=>!i.only||i.only(t)):[];
const VAL={ok:"OK",nc:"Non conforme",so:"Sans objet"};

/* ---------------- Stockage (IndexedDB) ---------------- */
function idb(){return new Promise((res,rej)=>{try{const r=indexedDB.open("mes-pac",1);r.onupgradeneeded=()=>r.result.createObjectStore("kv");r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}catch(e){rej(e)}})}
async function kvGet(k){try{const d=await idb();return await new Promise(res=>{const t=d.transaction("kv").objectStore("kv").get(k);t.onsuccess=()=>res(t.result??null);t.onerror=()=>res(null)})}catch(e){return null}}
async function kvPut(k,v){try{const d=await idb();await new Promise(res=>{const tx=d.transaction("kv","readwrite");tx.objectStore("kv").put(v,k);tx.oncomplete=res;tx.onerror=res})}catch(e){}}
async function kvDel(k){try{const d=await idb();await new Promise(res=>{const tx=d.transaction("kv","readwrite");tx.objectStore("kv").delete(k);tx.oncomplete=res;tx.onerror=res})}catch(e){}}

function blankCfg(){return{id:"cfg",ent:{id:"ent",nom:"",adresse:"",siret:"",attCap:"",tel:"",mail:"",logo:null},techs:[],dets:[],sigTech:null,defTech:"",defDet:""}}
let CFG=blankCfg(),INDEX=[],C=null,saveT=null,cfgT=null;
function summary(c){return{id:c.id,nom:c.nom,client:c.clientNom,adresse:c.siteAdr||c.clientAdr,nb:c.pacs.length,ok:c.pacs.filter(p=>status(p,c).ok).length,exemple:!!c.exemple,maj:Date.now()}}
function save(){if(!C)return;const c=C;clearTimeout(saveT);saveT=setTimeout(()=>{saveT=null;persist(c)},300)}
async function persist(c){await kvPut("c:"+c.id,c);const s=summary(c);const i=INDEX.findIndex(x=>x.id===c.id);if(i<0)INDEX.unshift(s);else INDEX[i]=s;await kvPut("index",INDEX)}
function saveCfg(){clearTimeout(cfgT);cfgT=setTimeout(()=>{cfgT=null;kvPut("cfg",CFG)},300)}
async function flush(){if(saveT&&C){clearTimeout(saveT);saveT=null;await persist(C)}if(cfgT){clearTimeout(cfgT);cfgT=null;await kvPut("cfg",CFG)}}

/* ---------------- Modèle ---------------- */
function blankChantier(){return{id:uid(),nom:"",clientNom:"",clientAdr:"",clientTel:"",clientMail:"",clientSiret:"",siteAdr:"",notes:"",logoClient:null,pacs:[]}}
function blankPac(){return{id:uid(),repere:"",type:"aes",marque:"Atlantic",gamme:"",modUE:"",serUE:"",modUI:"",serUI:"",nbUI:"",puis:"",fluide:"R32",prg:675,chargeUsine:"",chargeComp:"",scelle:false,
  locUE:"",locUI:"",date:today(),tech:CFG.defTech||"",det:CFG.defDet||"",
  mes:{id:uid(),obs:"",debitU:"lmin"},photos:{id:uid(),plaqUE:[],instUE:[],plaqUI:[],instUI:[]},sig:{id:uid(),tech:null,client:null,clientNom:"",clientQual:"Détenteur"},
  cerfaOn:true,cerfa:{id:uid(),num:"",nature:"mes",natAutre:"",detAuto:"non",fuite:"non",fuiteLoc:"",fuiteRep:"realisee",A:"",B:"",C:"",D:"",E:"",contenant:"",adr:"",dechet:"",destNom:"",destSiret:"",destAdr:"",bsff:"",obs:""}}}
function* all(){yield CFG;yield CFG.ent;yield* CFG.techs;yield* CFG.dets;if(SH&&SH.vals)yield SH.vals;if(!C)return;yield C;for(const p of C.pacs){yield p;yield p.mes;yield* (p.mes.rads||[]);yield* (p.uis||[]);yield p.cerfa;yield p.sig;yield p.photos}}
function byId(id){for(const o of all())if(o.id===id)return o;return null}
const pacOf=o=>C&&C.pacs.find(p=>p===o||p.mes===o||p.cerfa===o||p.sig===o||p.photos===o||(p.mes.rads||[]).includes(o)||(p.uis||[]).includes(o));
const tech=id=>CFG.techs.find(t=>t.id===id);
const det=id=>CFG.dets.find(d=>d.id===id);
const pacName=(p,i)=>p.repere||`PAC ${i!=null?i+1:C.pacs.indexOf(p)+1}`;
/* Gammes proposées selon la marque et le type de PAC. Liste indicative (sites des fabricants, novembre 2026) : la case reste libre. */
const GAMMES={
 "Atlantic":{eau:["Alféa Excellia","Alféa Excellia Duo","Alféa Extensa","Alféa Extensa Duo","Alféa Hybrid Duo","Loria Duo"],air:["Takao","Zenkeo"]},
 "Daikin":{eau:["Altherma 4 H F","Altherma 4 H W","Altherma 3 H HT F","Altherma 3 H HT W","Altherma 3 H MT F","Altherma 3 H MT W","Altherma 3 R F","Altherma 3 R W","Altherma 3 R MT F","Altherma 3 R MT W","Altherma 3 M (monobloc)"],
   air:["Emura","Stylish","Perfera","Perfera console","Comfora","Sensira","Ururu Sarara","Multi Split","Gainable"]},
 "Mitsubishi Electric":{eau:["Ecodan Eco Inverter","Ecodan Eco Inverter+","Ecodan Power Inverter","Ecodan Power Inverter Silence","Ecodan Zubadan","Ecodan Duo Eco Inverter","Ecodan Duo Eco Inverter+","Ecodan Duo Power Inverter Silence","Ecodan Duo Power Inverter Silence HT R290 Hydrosplit","Ecodan Duo Zubadan Silence"],
   air:["Mural Essentiel MSZ-HR","Mural Compact MSZ-AY","Mural Compact Grandes pièces MSZ-AP","Mural Design MSZ-EF","Mural Design Premium MSZ-LN","Mural Compact + MSZ-FT (Hyper Heating)","Mural Design Premium + MSZ-LN (Hyper Heating)","Mural Ultimate + MSZ-RW (Hyper Heating)",
    "Console Design MFZ-KT","Console Design + MFZ-KW (Hyper Heating)","Gainable Compact SEZ-M","Cassette 1 voie MLZ-KP","Cassette 4 voies 600x600 SLZ-M","Multisplit MXZ-F","Multisplit MXZ-H","Multisplit MXZ-F Hyper Heating","Multisplit avec ECS PXZ-F"]}};
/* gammes de la marque saisie, celles du type de PAC en premier ; marque inconnue ou vide : rien n'est imposé */
function gammesDe(marque,type){const m=sansAccent(marque).toLowerCase().trim();if(!m)return[];
  const k=Object.keys(GAMMES).find(k=>{const a=k.toLowerCase().split(" ")[0];return m.includes(a)||(m.length>=3&&a.startsWith(m))});if(!k)return[];
  const g=GAMMES[k];return isEau(type)?[...g.eau,...g.air]:[...g.air,...g.eau]}
function majGammes(P){const d=$("dlGammes");if(!d||!P)return;const L=gammesDe(P.marque,P.type);d.innerHTML=L.map(g=>`<option>${esc(g)}</option>`).join("");
  const i=document.querySelector(`#app input[data-id="${P.id}"][data-f="gamme"]`);if(i)i.placeholder=L.length?"Ex. : "+L[0]:"Gamme"}
/* ---------- Unités intérieures d'un multi-split : une fiche par unité (référence, n° de série, emplacement) ---------- */
function syncUI(P){if(!P)return;
  if(P.type==="aax"){if(!Array.isArray(P.uis)||!P.uis.length){const n=Math.min(9,Math.max(1,Math.round(num(P.nbUI))||1));
      P.uis=Array.from({length:n},(_,j)=>({id:uid(),mod:String(P.modUI||""),ser:j?"":String(P.serUI||""),loc:j?"":String(P.locUI||"")}))}
    P.nbUI=String(P.uis.length)}
  /* retour à un mono-split : la première unité redevient l'unité intérieure */
  else if(Array.isArray(P.uis)&&P.uis.length&&!isEau(P.type)){const u=P.uis[0];if(!P.modUI)P.modUI=u.mod||"";if(!P.serUI)P.serUI=u.ser||"";if(!P.locUI)P.locUI=u.loc||""}}
const uiVide=u=>!String(u.mod||"").trim()&&!String(u.ser||"").trim()&&!String(u.loc||"").trim();
const pacModel=p=>[p.marque,p.gamme].filter(Boolean).join(" ")||"Modèle à préciser";
function charge(p){return num(p.chargeUsine)+num(p.chargeComp)}
function teq(p){return charge(p)*num(p.prg)/1000}
const famOf=p=>(FLUIDES[p.fluide]||FLUIDES.Autre).fam;
/* Tranche du Cerfa (cadre 7) : 0 = sous le seuil, null = fluide non concerné */
function tranche(p){const f=famOf(p);
  if(f==="HFC"){const t=teq(p),s=p.scelle?10:5;if(t<s)return 0;return t<50?1:t<500?2:3}
  if(f==="HFO"){const q=charge(p);if(q<1)return 0;return q<10?1:q<100?2:3}
  return null}
const FREQ=[null,[12,24],[6,12],[3,6]];
function freqTxt(p){const t=tranche(p);if(t===null)return"Fluide non concerné par le contrôle périodique";if(t===0)return"Sous le seuil : pas de contrôle d'étanchéité périodique";const d=p.cerfa.detAuto==="oui";return`Contrôle d'étanchéité tous les ${FREQ[t][d?1:0]} mois`}
function chargedAuto(p){/* quantité chargée par défaut = charge complémentaire, en fluide vierge */return p.cerfa.A!==""?p.cerfa.A:(num(p.chargeComp)?String(p.chargeComp):"")}
function status(p,c){c=c||C;
  const miss=[];
  if(!p.serUE)miss.push("n° de série UE");
  let todo=0,done=0;for(const s of SECTIONS)for(const i of secItems(s,p.type)){if(!i.k)continue;todo++;if(p.mes[i.f])done++}
  if(done<todo)miss.push(`${todo-done} contrôle${todo-done>1?"s":""}`);
  if(p.cerfaOn&&isCerfaIncomplete(p,c))miss.push("Cerfa");
  if(!p.sig.tech)miss.push("signature technicien");
  if(!p.sig.client)miss.push("signature client");
  return{ok:!miss.length,miss,todo,done}}
function isCerfaIncomplete(p,c){c=c||C;return!CFG.ent.attCap||!CFG.ent.nom||!p.det||!c.clientNom||!p.fluide||!charge(p)}

/* Logos : {img, w, h} ou null. Celui de l'entreprise est choisi dans Réglages, celui du client sur la page de son chantier. */
const logoOk=l=>l&&typeof l==="object"&&imgOk(l.img)&&l.w>0&&l.h>0?l:null;
const logo=()=>logoOk(CFG.ent.logo);
const logoClient=()=>logoOk(C&&C.logoClient);
function logoBox(l,alt,act){return`${l?`<div class="logobox"><img src="${l.img}" alt="${esc(alt)}"></div>`:""}
   <div class="actions"><button class="btn sm ${l?"":"primary"}" type="button" data-act="logoPick" data-k="${act}">${l?"Changer le logo":"Choisir le logo"}</button>${l?`<button class="btn sm danger" type="button" data-act="logoDel" data-k="${act}">Retirer le logo</button>`:""}</div>`}

/* ---------------- Navigation ---------------- */
let V={v:"home"},PT="equip",SH=null,confirmDel=null,busy=false;
function toast(msg,duree){const t=$("toast");t.textContent=msg;t.hidden=false;clearTimeout(t._t);t._t=setTimeout(()=>t.hidden=true,duree||2800)}
function go(v){if(v.v!=="chantier")ouvertClient=false;V=v;SH=null;confirmDel=null;$("sheet").hidden=true;document.body.style.overflow="";render();window.scrollTo(0,0)}
window.__onBack=()=>{
  if(!$("viewer").hidden){if(VW&&VW.del){VW.del=false;renderViewer()}else closeViewer();return true}
  if(SH){closeSheet();return true}
  if(V.v==="pac"){go({v:"chantier"});return true}
  if(V.v==="chantier"){showHome();return true}
  if(V.v==="cfg"){V.from?go({v:V.from,id:V.fromId}):showHome();return true}
  return false};
function render(){
  if(V.v==="home")return renderHome();
  if(V.v==="cfg")return renderCfg();
  if(!C)return showHome();
  if(V.v==="chantier")renderChantier();else if(V.v==="pac")renderPac();
  if(SH)renderSheet()}
/* redessine la page sans perdre la position de lecture */
function redessiner(){const y=window.scrollY;render();window.scrollTo(0,y)}
function setTop(back,title,sub,extra){$("top").innerHTML=(back?`<button class="back" type="button" data-act="back" aria-label="Retour">${BACK}</button>`:"")+`<div class="ttl"><b>${esc(title)}</b>${sub?`<small>${esc(sub)}</small>`:""}</div>${extra||""}`}

/* ---------------- Champs ---------------- */
function fld(o,f,label,type,extra){extra=extra||{};const v=o[f]??"";const cls=extra.full?"f full":"f";
  if(type==="textarea")return`<label class="${cls}"><span class="label">${label}</span><textarea data-id="${o.id}" data-f="${f}" ${extra.ph?`placeholder="${esc(extra.ph)}"`:""}>${esc(v)}</textarea></label>`;
  const t=type==="num"?'type="text" inputmode="decimal"':`type="${type||"text"}"`;
  const inp=`<input ${t} data-id="${o.id}" data-f="${f}" value="${esc(v)}" ${extra.ph?`placeholder="${esc(extra.ph)}"`:""} ${extra.list?`list="${extra.list}"`:""} ${type==="email"?'autocapitalize="off"':""} ${extra.upper?'autocapitalize="characters"':""}>`;
  return`<label class="${cls}"><span class="label">${label}</span>${extra.u?`<span class="unit">${inp}<i>${esc(extra.u)}</i></span>`:inp}</label>`}
function selF(o,f,label,opts,extra){extra=extra||{};return`<label class="f ${extra.full?"full":""}"><span class="label">${label}</span><select data-id="${o.id}" data-f="${f}">${opts.map(([v,l])=>`<option value="${esc(v)}" ${String(o[f])===String(v)?"selected":""}>${esc(l)}</option>`).join("")}</select></label>`}
function radios(o,f,opts){return`<div class="radios">${opts.map(([v,l])=>`<button type="button" class="${o[f]===v?"on":""}" data-act="radio" data-id="${o.id}" data-f="${f}" data-v="${esc(v)}">${esc(l)}</button>`).join("")}</div>`}
function photoRow(o,f){const ph=o[f]||[];return`<div class="photos">${ph.map(p=>`<div class="th"><img src="${p.img}" alt="" data-act="view" data-id="${o.id}" data-f="${f}" data-p="${p.id}"><button class="x" type="button" aria-label="Supprimer la photo" data-act="askDelPh" data-id="${o.id}" data-f="${f}" data-p="${p.id}">×</button></div>`).join("")}
  <button class="addph" type="button" data-act="cam" data-id="${o.id}" data-f="${f}"><b>+</b>Photo</button><button class="addph" type="button" data-act="gal" data-id="${o.id}" data-f="${f}"><b>▤</b>Galerie</button></div>`}

/* ---------------- Accueil ---------------- */
function renderHome(){
  $("top").innerHTML=`<div class="brand">Mise en service <span>PAC</span></div><span style="flex:1"></span><button class="btn sm" type="button" data-act="cfg">Réglages</button>`;
  const cards=INDEX.map(s=>`<button class="card" type="button" data-act="openChantier" data-id="${s.id}">
    <div class="m"><b>${esc(s.nom||s.client||"Chantier sans nom")}${s.exemple?" (exemple)":""}</b><span>${esc([s.nom&&s.client?s.client:"",s.adresse].filter(Boolean).join(" · ")||"Client et adresse à renseigner")}</span>
    <div class="chips" style="margin-top:6px"><span class="chip">${s.nb} PAC</span>${s.nb?`<span class="chip ${s.ok===s.nb?"ok":"warn"}">${s.ok}/${s.nb} terminée${s.ok>1?"s":""}</span>`:""}</div></div></button>`).join("");
  const warn=!CFG.ent.nom||!CFG.ent.attCap?`<div class="note warn"><b>À faire une fois :</b> renseigne ton entreprise (n° d'attestation de capacité), tes techniciens et ton détecteur de fuites dans <button class="btn sm" type="button" data-act="cfg" style="margin-left:4px">Réglages</button>. Ils seront repris sur tous les Cerfa.</div>`:"";
  const L=logo(),tete=L?`<div class="logohome"><img src="${L.img}" alt="Logo ${esc(CFG.ent.nom||"de l'entreprise")}"></div>`:"";
  $("app").innerHTML=tete+installBox()+warn+`<div class="actions"><button class="btn primary wide" type="button" data-act="newChantier">+ Nouveau chantier</button></div>`
   +(INDEX.length?`<h2 class="sec">Mes chantiers <span class="n">${INDEX.length}</span></h2><div class="list">${cards}</div>`
    :`<div class="empty"><b>Aucun chantier</b><span class="hint">Un chantier = un client ou un site. Tu y ajoutes une ou plusieurs PAC, puis pour chacune : équipement, contrôles, Cerfa et signatures.</span></div>`)
   +`<div class="actions"><button class="btn wide" type="button" data-act="importJson">Importer une sauvegarde</button><button class="btn wide" type="button" data-act="sample">Voir un chantier exemple</button></div>
   <p class="hint">Tout est enregistré sur ton téléphone, même sans réseau. Fais une sauvegarde d'un chantier (en bas de sa page) avant de changer de téléphone.</p>`}
/* Version web : invitation à mettre l'appli sur l'écran d'accueil (elle s'ouvre alors comme une appli, sans réseau, et garde ses chantiers) */
function installBox(){if(NATIVE||INSTALLEE||location.protocol!=="https:"||reglage("mes-install")==="non")return"";
  if(IOS)return`<div class="note"><b>Installer l'appli sur l'iPhone :</b> dans Safari, touche le bouton Partager <span aria-hidden="true">(le carré avec une flèche)</span>, puis « Sur l'écran d'accueil ». Elle s'ouvre ensuite comme une appli, même sans réseau, et tes chantiers y sont gardés.
    <div class="actions" style="margin-top:8px"><button class="btn sm" type="button" data-act="installNon">J'ai compris</button></div></div>`;
  return invite?`<div class="note"><b>Installer l'appli :</b> elle s'ouvre ensuite depuis l'écran d'accueil, même sans réseau.
    <div class="actions" style="margin-top:8px"><button class="btn sm primary" type="button" data-act="installer">Installer</button><button class="btn sm" type="button" data-act="installNon">Plus tard</button></div></div>`:""}
async function showHome(){await flush();C=null;ouvertClient=false;V={v:"home"};SH=null;$("sheet").hidden=true;document.body.style.overflow="";INDEX=(await kvGet("index"))||[];render();window.scrollTo(0,0)}
/* Remise en état d'un chantier à l'ouverture et à l'import d'une sauvegarde. Renvoie le nombre de corrections faites.
   - toutes les fiches attendues existent (ancien chantier, sauvegarde incomplète) ;
   - deux fiches ne portent jamais le même identifiant (sinon une saisie ou une photo irait dans la mauvaise PAC) ;
   - identifiants et images sont sûrs à afficher (une sauvegarde importée vient de l'extérieur) ;
   - anciennes saisies converties : unité intérieure unique → fiches du multi-split, débit en l/h → l/min. */
const ID_OK=/^[A-Za-z0-9_-]{1,40}$/;
const imgOk=v=>typeof v==="string"&&v.startsWith("data:image/")&&!/["'<>\s]/.test(v);
function reparer(c){let n=0;const vus=new Set();
  const un=o=>{if(typeof o.id!=="string"||!ID_OK.test(o.id)||vus.has(o.id)){o.id=uid();n++}vus.add(o.id)};
  const fiche=(v,defaut)=>Object.assign(defaut,v&&typeof v==="object"&&!Array.isArray(v)?v:{});
  /* listes de photos d'une fiche : on ne garde que de vraies images */
  const photos=o=>{for(const k of Object.keys(o)){if(!Array.isArray(o[k])||k==="rads")continue;
    const ok=o[k].filter(ph=>ph&&typeof ph==="object"&&imgOk(ph.img)&&ph.w>0&&ph.h>0);n+=o[k].length-ok.length;o[k]=ok;ok.forEach(un)}};
  const B=blankChantier();for(const k of Object.keys(B))if(k!=="id"&&k!=="pacs"&&k!=="logoClient"&&typeof c[k]!=="string")c[k]=B[k];
  if(c.logoClient&&!logoOk(c.logoClient)){c.logoClient=null;n++}
  c.pacs=(Array.isArray(c.pacs)?c.pacs:[]).filter(p=>p&&typeof p==="object");
  for(const p of c.pacs){const b=blankPac(),enLH=!!(p.mes&&typeof p.mes==="object"&&p.mes.debitU!=="lmin");
    for(const k of Object.keys(b))if(p[k]===undefined||p[k]===null)p[k]=b[k];
    if(!TYPES[p.type])p.type="aes";
    for(const k of ["mes","photos","sig","cerfa"])p[k]=fiche(p[k],b[k]);
    un(p);un(p.mes);un(p.cerfa);un(p.sig);un(p.photos);
    p.mes.rads=(Array.isArray(p.mes.rads)?p.mes.rads:[]).filter(r=>r&&typeof r==="object");
    for(const r of p.mes.rads){un(r);photos(r)}
    photos(p.photos);
    for(const k of ["tech","client"])if(p.sig[k]&&!imgOk(p.sig[k])){p.sig[k]=null;n++}
    if(p.uis!==undefined)p.uis=(Array.isArray(p.uis)?p.uis:[]).filter(u=>u&&typeof u==="object");
    syncUI(p);(p.uis||[]).forEach(un);
    /* le débit d'eau était saisi en l/h : converti une seule fois en l/min */
    if(enLH){const d=String(p.mes.debit??"").trim();if(d&&num(d)>0)p.mes.debit=String(Math.round(num(d)/60*10)/10).replace(".",",");p.mes.debitU="lmin";n++}}
  return n}
async function openChantier(id){const c=await kvGet("c:"+id);if(!c){toast("Chantier introuvable.");return}if(reparer(c))await kvPut("c:"+c.id,c);C=c;go({v:"chantier"})}

/* ---------------- Dossier du chantier : quelles PAC, en un seul PDF ou un PDF par PAC ---------------- */
let DOS=null;
function dos(){if(!DOS||DOS.c!==C.id)DOS={c:C.id,off:new Set(),sep:false};for(const id of [...DOS.off])if(!C.pacs.some(p=>p.id===id))DOS.off.delete(id);return DOS}
const dosSel=()=>{const d=dos();return C.pacs.filter(p=>!d.off.has(p.id))};
function dosBox(){const d=dos(),n=C.pacs.length,k=dosSel().length,sep=d.sep&&k>1;
  const resume=!k?"Coche au moins une PAC.":`${k===n?(n>1?`Les ${n} PAC`:"La PAC"):`${k} PAC sur ${n}`} · ${sep?`${k} PDF séparés (un par PAC)`:"un seul PDF"}`;
  return`<div class="export" id="dosBox"><span class="label">Dossier du chantier</span><span class="hint">PV de mise en service et Cerfa${n>1?" des PAC cochées":""}.</span>
   ${n>1?`<div class="dospacs">${C.pacs.map((p,i)=>`<label class="check" style="font-weight:500"><input type="checkbox" data-act="dosPac" data-id="${p.id}" ${d.off.has(p.id)?"":"checked"} style="accent-color:var(--accent)"> <span>${i+1}. ${esc(pacName(p,i))} <small style="color:var(--muted);font-weight:400">· ${esc(pacModel(p))}</small></span></label>`).join("")}</div>
    <div class="actions"><button class="btn sm" type="button" data-act="dosTous">${k===n?"Tout décocher":"Tout cocher"}</button></div>
    <div class="radios"><button type="button" class="${d.sep?"":"on"}" data-act="dosSep" data-v="">Un seul PDF</button><button type="button" class="${d.sep?"on":""}" data-act="dosSep" data-v="1">Un PDF par PAC</button></div>`:""}
   <span class="hint"><b>${esc(resume)}</b>${sep?` Par mail, ils sont tous joints au même message. « Enregistrer » te demande un dossier et les y range d'un coup.`:""}</span>
   <div class="actions"><button class="btn primary wide" type="button" data-act="exp" data-k="dossier" data-m="mail" ${k?"":"disabled"}>Envoyer par mail</button><button class="btn wide" type="button" data-act="exp" data-k="dossier" data-m="save" ${k?"":"disabled"}>Enregistrer ${sep?"les PDF":"le PDF"}</button><button class="btn wide" type="button" data-act="exp" data-k="dossier" data-m="share" ${k?"":"disabled"}>Partager…</button></div></div>`}
function dosMaj(){const b=$("dosBox");if(!b)return;const w=document.createElement("div");w.innerHTML=dosBox();b.replaceWith(w.firstElementChild)}

/* ---------------- Réglages ---------------- */
function renderCfg(){
  setTop(true,"Réglages","Entreprise, techniciens, détecteurs");
  const E=CFG.ent;
  $("app").innerHTML=`
  <h2 class="sec">Mon entreprise (opérateur)</h2>
  <div class="box"><div class="grid2">${fld(E,"nom","Raison sociale","text",{full:1})}${fld(E,"adresse","Adresse","text",{full:1})}${fld(E,"siret","SIRET","text")}${fld(E,"attCap","N° d'attestation de capacité","text",{upper:1})}${fld(E,"tel","Téléphone","tel")}${fld(E,"mail","Mail","email")}</div>
   <span class="hint">Repris dans le cadre 1 du Cerfa et en tête des PV.</span>
   <span class="label">Logo de l'entreprise</span>
   ${logoBox(logo(),"Logo de l'entreprise","ent")}
   <span class="hint">Une image de ta galerie (PNG ou JPEG). Il s'affiche sur l'accueil et en tête des PV et des fiches d'intervention. Tu peux le changer ou le retirer à tout moment.</span></div>
  <h2 class="sec">Techniciens <span class="n">${CFG.techs.length}</span></h2>
  <div class="list">${CFG.techs.map(t=>`<button class="card" type="button" data-act="openTech" data-id="${t.id}"><div class="m"><b>${esc(t.nom||"Sans nom")}${CFG.defTech===t.id?" · par défaut":""}</b><span>${esc(t.attApt?"Attestation d'aptitude : "+t.attApt:"Attestation d'aptitude à renseigner")}</span></div></button>`).join("")||`<span class="hint">Ajoute-toi : ton nom apparaîtra sur les PV et dans la case signature du Cerfa.</span>`}</div>
  <button class="btn" type="button" data-act="newTech">+ Technicien</button>
  <h2 class="sec">Détecteurs de fuites <span class="n">${CFG.dets.length}</span></h2>
  <div class="list">${CFG.dets.map(d=>{const late=d.ctrl&&d.ctrl<addYears(today(),-1);return`<button class="card" type="button" data-act="openDet" data-id="${d.id}"><div class="m"><b>${esc([d.marque,d.modele].filter(Boolean).join(" ")||"Détecteur")}${CFG.defDet===d.id?" · par défaut":""}</b><span>${esc(d.serie?"N° "+d.serie:"N° de série à renseigner")}</span>
   <div class="chips" style="margin-top:6px">${d.ctrl?`<span class="chip ${late?"bad":"ok"}">Contrôlé le ${fmtDate(d.ctrl)}${late?" — plus d'un an":""}</span>`:`<span class="chip warn">Date de contrôle à renseigner</span>`}</div></div></button>`}).join("")||`<span class="hint">Repris dans le cadre 5 du Cerfa (identification et date du dernier contrôle).</span>`}</div>
  <button class="btn" type="button" data-act="newDet">+ Détecteur</button>
  <h2 class="sec">Ma signature</h2>
  <div class="box sigbox"><div class="sigimg" data-act="padTechCfg">${CFG.sigTech?`<img src="${CFG.sigTech}" alt="Signature">`:"Touche pour signer"}</div>
   <span class="hint">Proposée sur chaque PAC pour éviter de re-signer à chaque fois.</span>${CFG.sigTech?`<button class="btn sm danger" type="button" data-act="delSigCfg">Effacer ma signature</button>`:""}</div>
  ${codesBox()}`}
function addYears(d,n){const x=new Date(d+"T12:00:00");x.setFullYear(x.getFullYear()+n);return x.toISOString().slice(0,10)}

/* ---------------- Chantier ---------------- */
let ouvertClient=false;      // le cadre « Client » reste ouvert quand on vient d'y changer le logo
function renderChantier(){
  setTop(true,C.nom||C.clientNom||"Chantier sans nom",C.siteAdr||C.clientAdr||"");
  const nOk=C.pacs.filter(p=>status(p).ok).length;
  $("app").innerHTML=`
  <details class="box" id="boxClient" ${!C.clientNom||ouvertClient?"open":""}><summary class="label" style="cursor:pointer">Client / détenteur${C.clientNom?" — "+esc(C.clientNom):""}</summary>
   <div class="grid2" style="margin-top:10px">${fld(C,"nom","Nom du chantier (facultatif)","text",{full:1,ph:"Ex. : Lotissement Les Prés, lot 4"})}
    ${fld(C,"clientNom","Client / détenteur","text",{full:1,ph:"Nom et prénom ou société"})}${fld(C,"clientAdr","Adresse du client","text",{full:1})}
    ${fld(C,"siteAdr","Adresse d'installation (si différente)","text",{full:1})}${fld(C,"clientTel","Téléphone","tel")}${fld(C,"clientMail","Mail","email")}
    ${fld(C,"clientSiret","SIRET (si société)","text")}</div>
   <span class="label" style="margin-top:10px">Logo du client</span>
   ${logoBox(logoClient(),"Logo du client","client")}
   <span class="hint">Facultatif. Il s'affiche en tête des PV de ce chantier, à côté du logo de ton entreprise, et dans le cadre « Détenteur » du Cerfa.</span></details>
  <h2 class="sec">Pompes à chaleur <span class="n">${C.pacs.length?`${nOk}/${C.pacs.length} terminée${nOk>1?"s":""}`:""}</span></h2>
  <div class="list">${C.pacs.map((p,i)=>{const s=status(p);return`<button class="card" type="button" data-act="openPac" data-id="${p.id}">
    <div class="num" style="${s.ok?"background:var(--ok);color:#fff":""}">${i+1}</div>
    <div class="m"><b><mark class="repere">${esc(pacName(p,i))}</mark></b><span>${esc(pacModel(p))} · ${esc(TYPES[p.type])}${p.serUE?" · N° "+esc(p.serUE):""}</span>
     <div class="chips" style="margin-top:6px">${s.ok?`<span class="chip ok">Terminée</span>`:s.miss.slice(0,3).map(m=>`<span class="chip warn">${esc(m)}</span>`).join("")}</div></div></button>`}).join("")||`<div class="empty"><b>Aucune PAC</b><span class="hint">Ajoute la première pompe à chaleur de ce chantier.</span></div>`}</div>
  <div class="actions"><button class="btn primary wide" type="button" data-act="newPac">+ Ajouter une PAC</button>${C.pacs.length?`<button class="btn wide" type="button" data-act="dupPac" data-id="${C.pacs[C.pacs.length-1].id}">+ PAC identique à la dernière</button>`:""}</div>
  ${C.pacs.length?dosBox():""}
  <div class="box">${fld(C,"notes","Notes du chantier","textarea",{ph:"Accès, codes, contacts sur place…"})}</div>
  <div class="box"><span class="label">Sauvegarde</span><span class="hint">Un fichier avec tout le chantier (photos et signatures comprises), à garder sur ton drive ou à réimporter.</span>
   <div class="actions"><button class="btn wide" type="button" data-act="backup">Enregistrer une sauvegarde</button><button class="btn wide" type="button" data-act="backupShare">Envoyer la sauvegarde</button></div></div>
  ${confirmDel==="chantier"?`<div class="confirm"><span>Supprimer définitivement ce chantier et ses ${C.pacs.length} PAC ?</span><button class="btn danger sm" type="button" data-act="delChantierYes">Supprimer</button><button class="btn sm" type="button" data-act="cancelDel">Annuler</button></div>`
   :`<button class="btn danger" type="button" data-act="delChantier">Supprimer ce chantier</button>`}`}

/* ---------------- PAC ---------------- */
const curPac=()=>V.v==="pac"?C.pacs.find(p=>p.id===V.id):null;
function renderPac(){
  const P=curPac();if(!P)return go({v:"chantier"});
  const i=C.pacs.indexOf(P),s=status(P);
  setTop(true,pacName(P,i),`${pacModel(P)} · ${C.clientNom||C.nom||"Chantier"}`);
  const sigOk=P.sig.tech&&P.sig.client;
  const tabs=[["equip","Équipement",!!P.serUE],["mes","Contrôles",s.done===s.todo],["cerfa","Cerfa",!P.cerfaOn||!isCerfaIncomplete(P)],["sign","Photos & signatures",!!sigOk],["docs","Documents",null]];
  const body={equip:tabEquip,mes:tabMes,cerfa:tabCerfa,sign:tabSign,docs:tabDocs}[PT](P);
  $("app").innerHTML=`<div class="ptab"><div class="tabs">${tabs.map(([k,l,ok])=>`<button type="button" class="${PT===k?"on":""}" data-act="ptab" data-k="${k}">${ok===null?"":`<span class="dot ${ok?"ok":""}"></span>`}${l}</button>`).join("")}</div></div>${body}`;
  const t=document.querySelector(".ptab .tabs button.on");if(t)t.scrollIntoView({inline:"center",block:"nearest"})}
function calcHtml(P){const t=tranche(P);return`<div class="calc" id="calc"><div><b>${fr(charge(P),3)} kg</b><span>Charge totale</span></div><div><b>${fr(teq(P),2)}</b><span>t éq. CO₂</span></div><div><b>${t===null?"—":t===0?"< seuil":"Tranche "+t}</b><span>Cerfa cadre 7</span></div></div><span class="hint" id="calcFreq">${esc(freqTxt(P))}</span>`}
function uisBox(P){const U=P.uis||[];
  return U.map((u,j)=>`<div class="box"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><span class="label" style="margin:0">Unité intérieure ${j+1}</span>${U.length>1?`<button class="rdel" type="button" aria-label="Supprimer cette unité intérieure" data-act="delUi" data-id="${u.id}">×</button>`:""}</div>
    ${confirmDel===u.id?`<div class="confirm"><span>Supprimer l'unité intérieure ${j+1} et ce qui a été saisi ?</span><button class="btn danger sm" type="button" data-act="delUi" data-id="${u.id}">Supprimer</button><button class="btn sm" type="button" data-act="cancelDel">Annuler</button></div>`:""}
    ${scanBar(P,"UI",u.id)}<div class="grid2">${fld(u,"mod","Référence","text",{upper:1})}${fld(u,"ser","N° de série","text",{upper:1})}${fld(u,"loc","Emplacement","text",{full:1,ph:"Ex. : séjour, chambre 1"})}</div></div>`).join("")
   +`<div class="actions"><button class="btn primary wide" type="button" data-act="addUi">+ Ajouter une unité intérieure</button>${U.length&&String(U[U.length-1].mod||"").trim()?`<button class="btn wide" type="button" data-act="addUi" data-same="1">+ Identique à la dernière</button>`:""}</div>`}
function tabEquip(P){syncUI(P);setTimeout(()=>majGammes(P),0);
  const techOpts=[["","— Choisir —"],...CFG.techs.map(t=>[t.id,t.nom||"Sans nom"])];
  return`<div class="box"><div class="grid2">
   ${fld(P,"repere","Repère","text",{full:1,ph:"Ex. : PAC salon, Maison Dupont, Lot 4"})}
   <div class="f full"><span class="label">Type de PAC</span>${radios(P,"type",Object.entries(TYPES))}</div>
   ${fld(P,"marque","Marque","text",{list:"dlMarques"})}${fld(P,"gamme","Gamme","text",{list:"dlGammes",ph:"Ex. : "+(gammesDe(P.marque,P.type)[0]||"Alféa Extensa Duo")})}
   ${fld(P,"puis","Puissance nominale","num",{u:"kW"})}${fld(P,"date","Date de mise en service","date")}</div></div>
  <h2 class="sec">Unité extérieure</h2>
  <div class="box">${scanBar(P,"UE")}<div class="grid2">${fld(P,"modUE","Référence","text",{upper:1})}${fld(P,"serUE","N° de série","text",{upper:1})}${fld(P,"locUE","Emplacement","text",{full:1,ph:"Ex. : façade nord, sur supports muraux"})}</div></div>
  ${P.type==="aax"?`<h2 class="sec">Unités intérieures <span class="n">${P.uis.length}</span></h2>${uisBox(P)}`
   :`<h2 class="sec">${isEau(P.type)?"Module hydraulique":"Unité intérieure"}</h2>
  <div class="box">${scanBar(P,"UI")}<div class="grid2">${fld(P,"modUI","Référence","text",{upper:1})}${fld(P,"serUI","N° de série","text",{upper:1})}${fld(P,"locUI","Emplacement","text",{full:1,ph:isEau(P.type)?"Ex. : garage, cellier":"Ex. : séjour"})}</div></div>`}
  <h2 class="sec">Fluide frigorigène</h2>
  <div class="box"><div class="grid2">${selF(P,"fluide","Fluide",Object.keys(FLUIDES).map(k=>[k,k]))}${fld(P,"prg","PRG retenu","num")}
   ${fld(P,"chargeUsine","Charge d'usine (plaque)","num",{u:"kg"})}${isFrigo(P.type)?fld(P,"chargeComp","Charge complémentaire","num",{u:"kg"}):""}</div>
   <label class="check" style="font-weight:500"><input type="checkbox" data-act="chk" data-id="${P.id}" data-f="scelle" ${P.scelle?"checked":""} style="accent-color:var(--accent)"> Équipement hermétiquement scellé (seuil 10 t éq. CO₂)</label>
   ${calcHtml(P)}</div>
  <h2 class="sec">Intervenant</h2>
  <div class="box"><div class="grid2">${selF(P,"tech","Technicien",techOpts)}${selF(P,"det","Détecteur de fuites",[["","— Choisir —"],...CFG.dets.map(d=>[d.id,[d.marque,d.modele,d.serie?"n° "+d.serie:""].filter(Boolean).join(" ")||"Détecteur"])])}</div>
   ${!CFG.techs.length||!CFG.dets.length?`<span class="hint">Ajoute tes techniciens et détecteurs dans <button class="btn sm" type="button" data-act="cfg">Réglages</button></span>`:""}</div>
  <div class="actions"><button class="btn wide" type="button" data-act="dupPac" data-id="${P.id}">Dupliquer cette PAC</button></div>
  ${confirmDel===P.id?`<div class="confirm"><span>Supprimer ${esc(pacName(P))} et tout ce qui a été saisi ?</span><button class="btn danger sm" type="button" data-act="delPacYes">Supprimer</button><button class="btn sm" type="button" data-act="cancelDel">Annuler</button></div>`
   :`<button class="btn danger" type="button" data-act="delPac">Supprimer cette PAC</button>`}`}
function ckRow(M,i){const v=M[i.f]||"";return`<div class="ck"><div class="m">${esc(i.l)}</div><div class="seg">${[["ok","OK"],["nc","NC"],["so","—"]].map(([k,l])=>`<button type="button" class="${v===k?"on":""}" data-v="${k}" data-act="ck" data-id="${M.id}" data-f="${i.f}" aria-label="${VAL[k]}">${l}</button>`).join("")}</div></div>`}
function tabMes(P){const M=P.mes;
  const secs=SECTIONS.map(s=>{const its=secItems(s,P.type);if(!its.length)return"";
    const k=its.filter(i=>i.k),d=k.filter(i=>M[i.f]).length;
    const cks=k.map(i=>ckRow(M,i)).join("");
    const nums=its.filter(i=>!i.k&&!i.bloc).map(i=>i.s?`<div class="f full"><span class="label">${esc(i.l)}</span>${radios(M,i.f,i.s.map(x=>[x,x]))}</div>`:fld(M,i.f,esc(i.l),i.n?"num":"text",{u:i.u,ph:i.ph})).join("");
    return`<details class="sec" open><summary>${esc(s.t)}<span class="n">${k.length?`${d}/${k.length}`:""}</span></summary>
     <div class="box">${s.rel?ecranBar(P):""}${cks?`<div>${cks}</div>`:""}${nums?`<div class="nrow">${nums}</div>`:""}
     ${s.id==="hydro"?`<div class="nrow">${fld(M,"traitProd","Traitement de l'eau : nom du produit","text",{full:1,ph:"Ex. : inhibiteur, désembouant, antigel…"})}</div>
      <div><span class="label">Photos du traitement de l'eau</span>${photoRow(P.photos,"traitEau")}<span class="hint">Bidon, étiquette du produit, étiquette posée sur le réseau.</span></div>`:""}
     ${k.length&&d<k.length?`<button class="btn sm" type="button" data-act="allOk" data-s="${s.id}">Tout le reste OK</button>`:""}</div></details>${s.rel&&isEau(P.type)?radBox(P):""}`}).join("");
  const nc=SECTIONS.flatMap(s=>secItems(s,P.type)).filter(i=>i.k&&M[i.f]==="nc");
  return`${nc.length?`<div class="note bad"><b>${nc.length} point${nc.length>1?"s":""} non conforme${nc.length>1?"s":""}</b> : ${esc(nc.map(i=>i.l).join(" ; "))}. Précise-les dans les observations.</div>`:""}
   ${secs}<div class="box">${fld(M,"obs","Observations / réserves","textarea",{ph:"Points non conformes, travaux à prévoir, remarques…"})}</div>`}
function radBox(P){const R=P.mes.rads||[];
  return`<details class="sec" open><summary>Températures des radiateurs<span class="n">${R.length||""}</span></summary><div class="box">
   ${R.map(r=>`<div class="rad"><div class="radrow">${fld(r,"lieu","Emplacement","text",{ph:"Ex. : séjour, chambre 1…"})}${fld(r,"t","Température","num",{u:"°C"})}<button class="rdel" type="button" aria-label="Supprimer ce radiateur" data-act="delRad" data-id="${r.id}">×</button></div>
    ${confirmDel===r.id?`<div class="confirm"><span>Supprimer ce radiateur et sa photo ?</span><button class="btn danger sm" type="button" data-act="delRad" data-id="${r.id}">Supprimer</button><button class="btn sm" type="button" data-act="cancelDel">Annuler</button></div>`:""}
    ${radLu&&radLu.id===r.id?`<div class="confirm"><span>Photo : <b>${esc(radLu.v)} °C</b>. Dans la case : ${esc(String(r.t).trim())} °C.</span><button class="btn primary sm" type="button" data-act="radLuOui">Mettre ${esc(radLu.v)} °C</button><button class="btn sm" type="button" data-act="radLuNon">Garder ${esc(String(r.t).trim())} °C</button></div>`:""}
    <span class="label">Photo de la température</span>${photoRow(r,"ph")}</div>`).join("")}
   ${RAD_LU?`<span class="hint">La température est lue sur la photo du thermomètre et mise dans la case (sans réseau). Cadre l'afficheur de près, bien en face. Vérifie la valeur d'un coup d'œil.</span>`:""}
   <button class="btn sm" type="button" data-act="addRad">+ Ajouter un radiateur</button></div></details>`}
function tabCerfa(P){const K=P.cerfa,E=CFG.ent,D=det(P.det),t=tranche(P);
  if(!P.cerfaOn)return`<div class="note">Pas de fiche d'intervention pour cette PAC${P.type==="aem"?" (monobloc scellée d'usine, aucune manipulation de fluide)":""}.</div><button class="btn primary" type="button" data-act="cerfaOn">Établir une fiche d'intervention</button>`;
  const miss=[];if(!E.nom)miss.push("raison sociale de l'entreprise");if(!E.attCap)miss.push("n° d'attestation de capacité");if(!D)miss.push("détecteur de fuites");if(!C.clientNom)miss.push("nom du détenteur (client)");if(!charge(P))miss.push("charge de fluide");
  const q=(f,l)=>fld(K,f,l,"num",{u:"kg",ph:f==="A"?chargedAuto(P)||"":""});
  return`${miss.length?`<div class="note warn"><b>À compléter :</b> ${esc(miss.join(", "))}.</div>`:""}
  <div class="box"><span class="label">1. Opérateur · 2. Détenteur · 3. Équipement</span>
   <span>${esc(E.nom||"Entreprise ?")}${E.attCap?` · Att. capacité ${esc(E.attCap)}`:""}</span>
   <span>${esc(C.clientNom||"Détenteur ?")}${C.clientAdr?` · ${esc(C.clientAdr)}`:""}</span>
   <span>${esc(pacModel(P))} ${esc(P.modUE)} · N° ${esc(P.serUE||"?")} · ${esc(P.fluide)} · ${fr(charge(P),3)} kg · ${fr(teq(P),2)} t éq. CO₂</span>
   <span class="hint">Repris automatiquement depuis Réglages, le chantier et l'onglet Équipement.</span>
   ${fld(K,"num","N° de fiche","text",{ph:autoNum(P)})}</div>
  <h2 class="sec">4. Nature de l'intervention</h2>
  <div class="box">${radios(K,"nature",NATURES)}${K.nature==="autre"?fld(K,"natAutre","Préciser","text"):""}</div>
  <h2 class="sec">5–9. Détection et fréquence</h2>
  <div class="box"><span>Détecteur manuel : <b>${esc(D?[D.marque,D.modele,D.serie?"n° "+D.serie:""].filter(Boolean).join(" "):"à choisir dans Équipement")}</b>${D&&D.ctrl?` — contrôlé le ${fmtDate(D.ctrl)}`:""}</span>
   <div class="f"><span class="label">6. Système de détection permanente des fuites</span>${radios(K,"detAuto",[["non","Non"],["oui","Oui"]])}</div>
   <span class="note">${t===null?"":t===0?"":`<b>Tranche ${t}</b> — `}${esc(freqTxt(P))}</span></div>
  <h2 class="sec">10. Fuites constatées</h2>
  <div class="box">${radios(K,"fuite",[["non","Non"],["oui","Oui"]])}${K.fuite==="oui"?`${fld(K,"fuiteLoc","Localisation de la fuite","text")}<div class="f"><span class="label">Réparation</span>${radios(K,"fuiteRep",[["realisee","Réalisée"],["afaire","À faire"]])}</div>`:""}</div>
  <h2 class="sec">11. Manipulation du fluide</h2>
  <div class="box"><span class="label">Quantité chargée</span><div class="grid3">${q("A","A · Vierge")}${q("B","B · Recyclé")}${q("C","C · Régénéré")}</div>
   <span class="label">Quantité récupérée</span><div class="grid2">${q("D","D · Destinée au traitement")}${q("E","E · Conservée pour réutilisation")}</div>
   ${fld(K,"contenant","Identification du ou des contenants","text",{ph:"N° de bouteille"})}
   <span class="hint">Si A est vide, la charge complémentaire (${fr(num(P.chargeComp),3)} kg) est reprise en fluide vierge.</span></div>
  ${num(K.D)||num(K.E)?`<h2 class="sec">12–13. Déchet et destination</h2>
  <div class="box"><div class="grid2">${fld(K,"adr","Dénomination ADR/RID","text",{full:1,ph:(FLUIDES[P.fluide]||{}).adr})}${fld(K,"dechet","Code déchet","text",{ph:"14 06 01*"})}${fld(K,"bsff","N° de BSFF","text")}
   ${fld(K,"destNom","Installation prévue : nom","text",{full:1})}${fld(K,"destSiret","SIRET","text")}${fld(K,"destAdr","Adresse","text")}</div></div>`:""}
  <h2 class="sec">14. Observations</h2>
  <div class="box">${fld(K,"obs","Observations","textarea")}</div>
  <button class="btn" type="button" data-act="cerfaOff">Pas de fiche d'intervention pour cette PAC</button>`}
const uiLbl=P=>isEau(P.type)?"Module hydraulique":P.type==="aax"?"Unités intérieures":"Unité intérieure";
function photoGroups(P){return[["Unité extérieure",[["plaqUE","Plaque signalétique"],["instUE","Installation"]]],[uiLbl(P),[["plaqUI","Plaque signalétique"],["instUI","Installation"]]],["Écran de la PAC",[["ecran","Relevés affichés (régulation)"]]],
  ...(isEau(P.type)||(P.photos.traitEau||[]).length?[["Circuit hydraulique",[["traitEau","Traitement de l'eau"]]]]:[]),
  ...((P.photos.radiat||[]).length?[["Radiateurs (photos non classées)",[["radiat","Températures des radiateurs"]]]]:[]),["Autres photos",[["plaques","Plaques"],["instal","Installation"]]]]}
function autoNum(P){return(P.date||today()).replace(/-/g,"")+"-"+String(C.pacs.indexOf(P)+1).padStart(2,"0")}
function tabSign(P){const S=P.sig,T=tech(P.tech);
  return`${photoGroups(P).map(([t,fs])=>{const shown=t!=="Autres photos"?fs:fs.filter(([f])=>(P.photos[f]||[]).length);if(!shown.length)return"";
   return`<h2 class="sec">${esc(t)}</h2><div class="box">${shown.map(([f,l])=>`<span class="label">${esc(l)}</span>${photoRow(P.photos,f)}`).join("")}</div>`}).join("")}
  ${isEau(P.type)&&(P.mes.rads||[]).length?`<h2 class="sec">Radiateurs</h2><div class="box">${P.mes.rads.map((r,j)=>`<span class="label">${esc(radName(r,j))}</span>${photoRow(r,"ph")}`).join("")}</div>`:""}
  <h2 class="sec">Signatures</h2>
  <div class="box sigbox"><span class="label">Technicien${T?" — "+esc(T.nom):""}</span>
   <div class="sigimg" data-act="pad" data-k="tech">${S.tech?`<img src="${S.tech}" alt="Signature du technicien">`:"Touche pour signer"}</div>
   <div class="actions">${CFG.sigTech?`<button class="btn sm" type="button" data-act="useMySig">Utiliser ma signature enregistrée</button>`:""}${S.tech?`<button class="btn sm danger" type="button" data-act="clearSig" data-k="tech">Effacer</button>`:""}</div></div>
  <div class="box sigbox"><span class="label">Client / détenteur</span>
   <div class="grid2">${fld(S,"clientNom","Nom du signataire","text",{ph:C.clientNom})}${fld(S,"clientQual","Qualité","text")}</div>
   <div class="sigimg" data-act="pad" data-k="client">${S.client?`<img src="${S.client}" alt="Signature du client">`:"Touche pour faire signer le client"}</div>
   ${S.client?`<div class="actions"><button class="btn sm danger" type="button" data-act="clearSig" data-k="client">Effacer</button></div>`:""}</div>`}
function tabDocs(P){const s=status(P);
  const box=(k,t,d)=>`<div class="export"><span class="label">${t}</span><span class="hint">${d}</span><div class="actions"><button class="btn primary wide" type="button" data-act="exp" data-k="${k}" data-m="mail">Envoyer par mail</button><button class="btn wide" type="button" data-act="exp" data-k="${k}" data-m="save">Enregistrer</button><button class="btn wide" type="button" data-act="exp" data-k="${k}" data-m="share">Partager…</button></div></div>`;
  return`${s.ok?`<div class="note"><b>Mise en service complète.</b></div>`:`<div class="note warn"><b>Encore à faire :</b> ${esc(s.miss.join(", "))}. Tu peux quand même sortir les documents.</div>`}
  ${box("pv","PV de mise en service","Contrôles, relevés, réglages, photos des unités et signatures.")}
  ${P.cerfaOn?box("cerfa","Fiche d'intervention Cerfa 15497*04","Cadres 1 à 14 et signatures opérateur / détenteur."):""}
  ${P.cerfaOn?box("both","PV + Cerfa en un seul PDF","Les deux documents à la suite."):""}
  <span class="hint">${C.clientMail?`Le mail est pré-adressé à ${esc(C.clientMail)}.`:"Ajoute le mail du client sur la page du chantier pour qu'il soit pré-rempli."}</span>`}

/* ---------------- Panneaux (technicien, détecteur, signature) ---------------- */
function openSheet(kind,id,extra){SH={kind,id,...extra};confirmDel=null;$("sheet").hidden=false;renderSheet();$("sheet").scrollTop=0;document.body.style.overflow="hidden"}
function closeSheet(){SH=null;confirmDel=null;$("sheet").hidden=true;document.body.style.overflow="";render()}
function renderSheet(){
  let title="",body="",ok=true;
  if(SH.kind==="tech"){const o=tech(SH.id);if(!o)return closeSheet();title=o.nom||"Nouveau technicien";
    body=`<div class="box"><div class="grid2">${fld(o,"nom","Nom et prénom","text",{full:1})}${fld(o,"qual","Qualité","text",{ph:"Ex. : Technicien frigoriste"})}${fld(o,"attApt","N° attestation d'aptitude (catégorie)","text",{ph:"Ex. : cat. I"})}</div>
     <label class="check" style="font-weight:500"><input type="checkbox" data-act="defTech" ${CFG.defTech===o.id?"checked":""} style="accent-color:var(--accent)"> Technicien par défaut sur les nouvelles PAC</label></div>`
     +(confirmDel===o.id?`<div class="confirm"><span>Supprimer ce technicien ?</span><button class="btn danger sm" type="button" data-act="delTechYes">Supprimer</button><button class="btn sm" type="button" data-act="cancelDel">Annuler</button></div>`:`<button class="btn danger" type="button" data-act="delTech">Supprimer</button>`)}
  if(SH.kind==="det"){const o=det(SH.id);if(!o)return closeSheet();title=[o.marque,o.modele].filter(Boolean).join(" ")||"Nouveau détecteur";
    body=`<div class="box"><div class="grid2">${fld(o,"marque","Marque","text")}${fld(o,"modele","Modèle","text")}${fld(o,"serie","N° de série","text",{upper:1})}${fld(o,"ctrl","Dernier contrôle (étalonnage)","date")}</div>
     <label class="check" style="font-weight:500"><input type="checkbox" data-act="defDet" ${CFG.defDet===o.id?"checked":""} style="accent-color:var(--accent)"> Détecteur par défaut sur les nouvelles PAC</label>
     <span class="hint">Le détecteur doit être contrôlé au moins une fois par an.</span></div>`
     +(confirmDel===o.id?`<div class="confirm"><span>Supprimer ce détecteur ?</span><button class="btn danger sm" type="button" data-act="delDetYes">Supprimer</button><button class="btn sm" type="button" data-act="cancelDel">Annuler</button></div>`:`<button class="btn danger" type="button" data-act="delDet">Supprimer</button>`)}
  if(SH.kind==="pad"){ok=false;title=SH.k==="client"?"Signature du client":SH.k==="cfg"?"Ma signature":"Signature du technicien";
    body=`<canvas class="pad" id="pad"></canvas><span class="hint">Signe avec le doigt dans le cadre blanc.</span>
     ${SH.k==="tech"?`<label class="check" style="font-weight:500"><input type="checkbox" id="padKeep" ${CFG.sigTech?"":"checked"} style="accent-color:var(--accent)"> Enregistrer aussi comme ma signature</label>`:""}
     <div class="actions"><button class="btn wide" type="button" data-act="padClear">Effacer</button><button class="btn primary wide" type="button" data-act="padOk">Valider la signature</button></div>`}
  if(SH.kind==="plaque"){const P=C&&C.pacs.find(p=>p.id===SH.id);if(!P)return closeSheet();ok=false;const o=SH.vals;
    const T=plCible(P,SH.side,SH.ui);
    title=SH.side==="UE"?"Plaque de l'unité extérieure":T.n?"Plaque : unité intérieure "+T.n:"Plaque : "+uiLbl(P).toLowerCase();
    const ph=(P.photos["plaq"+SH.side]||[]).find(p=>p.id===SH.ph);
    const cur=pf=>{const v=String(T.o[T.f(pf)]??"").trim();return v?`<span class="hint">Dans la case actuellement : ${esc(v)}</span>`:""};
    const rows=PL_FIELDS[SH.side].map(([k,pf,l])=>k==="fluide"?`<div>${selF(o,k,l,[["","— Non lu —"],...Object.keys(FLUIDES).filter(f=>f!=="Autre").map(f=>[f,f])])}${o[k]&&o[k]!==P.fluide?cur(pf):""}</div>`
      :`<div>${fld(o,k,l,k==="charge"?"num":"text",{upper:k==="ref"||k==="serie",u:k==="charge"?"kg":"",ph:"Non lu"})}${String(T.o[T.f(pf)]??"").trim()!==String(o[k]??"").trim()?cur(pf):""}</div>`).join("");
    const lus=[...SH.codes.map(c=>[c,1]),...SH.texte.map(t=>[t,0])];
    body=`${ph?`<img class="plph" src="${ph.img}" alt="Photo de la plaque" data-act="view" data-id="${P.photos.id}" data-f="plaq${SH.side}" data-p="${ph.id}">`:""}
     <div class="note">${SH.n?`<b>${SH.n} case${SH.n>1?"s":""} trouvée${SH.n>1?"s":""}.</b> Vérifie avec la plaque, corrige si besoin, puis valide.`:`<b>Rien de reconnu automatiquement.</b> Touche une case puis le bon texte lu plus bas pour le copier dedans.`}</div>
     <div class="box plf">${rows}</div>
     <div class="actions"><button class="btn wide" type="button" data-act="closeSheet">Annuler</button><button class="btn primary wide" type="button" data-act="plApply">Remplir les cases</button></div>
     ${lus.length?`<h2 class="sec">Texte lu sur la photo</h2><span class="hint">Pour corriger une case : touche-la, puis touche le bon texte ci-dessous.</span>
      <div class="pick">${lus.map(([t,c],i)=>`<button class="pk" type="button" data-act="plPick" data-i="${i}">${c?`<i>Code-barres</i>`:""}${esc(t)}</button>`).join("")}</div>`:""}`}
  if(SH.kind==="ecran"){const P=C&&C.pacs.find(p=>p.id===SH.id);if(!P)return closeSheet();ok=false;const o=SH.vals,M=P.mes;title="Écran de la PAC";
    const ph=(P.photos.ecran||[]).find(p=>p.id===SH.ph),F=ecFields(P),vus=F.filter(i=>SH.more||SH.trouve.includes(i.f)||String(o[i.f]??"").trim()),n=SH.trouve.length;
    const rows=vus.map(i=>{const act=String(M[i.f]??"").trim(),v=String(o[i.f]??"").trim();
      return`<div>${i.s?selF(o,i.f,esc(i.l),[["","— Non lu —"],...i.s.map(x=>[x,x])]):fld(o,i.f,esc(i.l),"num",{u:i.u,ph:"Non lu"})}
       ${SH.lu[i.f]?`<span class="hint">Lu sur l'écran : ${esc(SH.lu[i.f])}</span>`:""}${act&&v&&ecDiff(M,i,v)?`<span class="hint">Dans la case actuellement : ${esc(act)}${i.u?" "+esc(i.u):""}</span>`:""}</div>`}).join("");
    body=`${ph?`<img class="plph" src="${ph.img}" alt="Photo de l'écran" data-act="view" data-id="${P.photos.id}" data-f="ecran" data-p="${ph.id}">`:""}
     <div class="note">${n?`<b>${n} relevé${n>1?"s":""} trouvé${n>1?"s":""}.</b> Vérifie avec l'écran, corrige si besoin, puis valide.`:`<b>Rien de reconnu automatiquement.</b> Touche une case puis le bon texte lu plus bas pour le copier dedans.`}</div>
     ${rows?`<div class="box plf">${rows}</div>`:""}
     ${vus.length<F.length?`<button class="btn sm" type="button" data-act="ecMore">Afficher les autres cases de relevés</button>`:""}
     <div class="actions"><button class="btn wide" type="button" data-act="closeSheet">Annuler</button><button class="btn primary wide" type="button" data-act="ecApply">Remplir les cases</button></div>
     ${SH.texte.length?`<h2 class="sec">Texte lu sur la photo</h2><span class="hint">Pour corriger une case : touche-la, puis touche le bon texte ci-dessous.</span>
      <div class="pick">${SH.texte.map((t,i)=>`<button class="pk" type="button" data-act="ecPick" data-i="${i}">${esc(t)}</button>`).join("")}</div>`:""}`}
  $("sheet").innerHTML=`<div class="in"><div class="bar"><button class="back" type="button" data-act="closeSheet" aria-label="Fermer">${BACK}</button><h2>${esc(title)}</h2>${ok?`<button class="btn sm primary" type="button" data-act="closeSheet">OK</button>`:""}</div>${body}</div>`;
  if(SH.kind==="pad")initPad();if(SH.kind==="plaque"||SH.kind==="ecran")plMark()}
let padDirty=false;
function initPad(){const c=$("pad");const r=c.getBoundingClientRect();const k=window.devicePixelRatio||1;c.width=r.width*k;c.height=r.height*k;
  const x=c.getContext("2d");x.scale(k,k);x.lineWidth=2.4;x.lineCap="round";x.lineJoin="round";x.strokeStyle="#0b2340";padDirty=false;let last=null;
  const pt=e=>{const b=c.getBoundingClientRect();return[e.clientX-b.left,e.clientY-b.top]};
  c.onpointerdown=e=>{c.setPointerCapture(e.pointerId);last=pt(e);x.beginPath();x.arc(last[0],last[1],1.2,0,7);x.fillStyle="#0b2340";x.fill();padDirty=true};
  c.onpointermove=e=>{if(!last)return;const p=pt(e);x.beginPath();x.moveTo(last[0],last[1]);x.lineTo(p[0],p[1]);x.stroke();last=p};
  c.onpointerup=c.onpointercancel=()=>{last=null}}
/* signature recadrée sur le tracé, fond transparent */
function padImage(){const c=$("pad"),x=c.getContext("2d"),d=x.getImageData(0,0,c.width,c.height).data;let x0=c.width,y0=c.height,x1=0,y1=0;
  for(let y=0;y<c.height;y+=2)for(let i=0;i<c.width;i+=2){if(d[(y*c.width+i)*4+3]>0){if(i<x0)x0=i;if(i>x1)x1=i;if(y<y0)y0=y;if(y>y1)y1=y}}
  if(x1<=x0)return null;const m=12;x0=Math.max(0,x0-m);y0=Math.max(0,y0-m);x1=Math.min(c.width,x1+m);y1=Math.min(c.height,y1+m);
  const k=Math.min(1,700/(x1-x0));const o=document.createElement("canvas");o.width=Math.round((x1-x0)*k);o.height=Math.round((y1-y0)*k);
  o.getContext("2d").drawImage(c,x0,y0,x1-x0,y1-y0,0,0,o.width,o.height);return o.toDataURL("image/png")}

/* ---------------- Photos ---------------- */
let phTarget=null;
function loadImg(file){return new Promise((res,rej)=>{const url=URL.createObjectURL(file);const im=new Image();im.onload=()=>{URL.revokeObjectURL(url);res(im)};im.onerror=()=>{URL.revokeObjectURL(url);rej(new Error("image"))};im.src=url})}
function shrink(im,max,q){let w=im.naturalWidth,h=im.naturalHeight;const k=Math.min(1,max/Math.max(w,h));w=Math.round(w*k);h=Math.round(h*k);const c=document.createElement("canvas");c.width=w;c.height=h;const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,w,h);x.drawImage(im,0,0,w,h);return{img:c.toDataURL("image/jpeg",q||.8),w,h}}
async function onPhotos(inp){const files=[...inp.files];inp.value="";const tg=phTarget;phTarget=null;if(!tg||!files.length)return;const o=byId(tg.id);if(!o)return;
  const P=pacOf(o),side=OCR&&P&&o===P.photos?PLAQ[tg.f]:null,ecr=OCR_E&&P&&o===P.photos&&tg.f==="ecran",rad=RAD_LU&&P&&tg.f==="ph"&&(P.mes.rads||[]).includes(o),hi=[],radSrc=[];let last=null;
  toast(files.length>1?`Ajout de ${files.length} photos…`:"Ajout de la photo…");
  for(const f of files){try{const im=await loadImg(f);const ph={id:uid(),...shrink(im,1600)};(o[tg.f]=o[tg.f]||[]).push(ph);last=ph.id;
    /* plaque : lue en plus grand que la photo gardée, pour les petits caractères */
    if((side&&hi.length<3)||(ecr&&hi.length<4))hi.push(shrink(im,2600,.92).img);
    if(rad&&radSrc.length<2)radSrc.push({img:OCR_E?shrink(im,2600,.92).img:"",el:im})}catch(e){toast("Impossible de lire une des images.")}}
  save();const y=window.scrollY;render();if(ecr||rad)window.scrollTo(0,y);
  if(rad&&radSrc.length)lireRad(P,o,radSrc,true);
  if(side&&hi.length)lirePlaque(P,side,hi,last,!!tg.scan,tg.ui);
  if(ecr&&hi.length)lireEcran(P,hi,last,!!tg.scan)}
$("inCam").onchange=()=>onPhotos($("inCam"));$("inGal").onchange=()=>onPhotos($("inGal"));

/* ---------------- Plaques signalétiques : la photo est lue sur le téléphone et remplit les cases ---------------- */
/* Lecteur de texte : celui du téléphone dans l'appli Android ; dans la version web (iPhone, navigateur), celui de la page
   (lecteur-web.js), mis en service au démarrage si ses fichiers sont là. */
let OCR=!!(NATIVE&&NATIVE.ocr&&window.Plaque),LECT_WEB=false,lectPret=false;
const PLAQ={plaqUE:"UE",plaqUI:"UI"};
/* [valeur lue, case de la PAC, libellé] */
const PL_FIELDS={UE:[["marque","marque","Marque"],["gamme","gamme","Gamme"],["ref","modUE","Référence"],["serie","serUE","N° de série"],["fluide","fluide","Fluide"],["charge","chargeUsine","Charge d'usine"]],
  UI:[["ref","modUI","Référence"],["serie","serUI","N° de série"]]};
const ocrWait={};let reading=false;
window.__onOcr=(id,res)=>{const f=ocrWait[id];if(f){delete ocrWait[id];f(res)}};
/* note(résultat) : nombre de cases que le texte lu permet de remplir ; clair : texte clair sur fond sombre (écran). Ne servent qu'au lecteur web. */
async function ocrWeb(img,note,clair){if(!lectPret)toast("Préparation du lecteur de texte (plus long la première fois)…",20000);
  try{const r=await Promise.race([LecteurWeb.lire(img,note,clair),new Promise(res=>setTimeout(()=>res(null),120000))]);if(r)lectPret=true;return r}catch(e){return null}}
const notePlaque=r=>{const x=Plaque.lire(r);return["marque","ref","serie","fluide","charge"].filter(k=>x[k]).length};
const noteEcran=r=>Object.keys(Ecran.lire(r).vals).length;
function ocrRead(img,note,clair){if(LECT_WEB)return ocrWeb(img,note,clair);return new Promise(res=>{const id=uid();const t=setTimeout(()=>{delete ocrWait[id];res(null)},30000);ocrWait[id]=r=>{clearTimeout(t);res(r)};
  try{NATIVE.ocr(id,String(img).split(",")[1])}catch(e){clearTimeout(t);delete ocrWait[id];res(null)}})}
/* Cases visées par la lecture d'une plaque : la PAC, ou une unité intérieure d'un multi-split (celle demandée, sinon la première sans n° de série) */
const UI_MAP={modUI:"mod",serUI:"ser"};
function plCible(P,side,uiId){if(side==="UI"&&P.type==="aax"){syncUI(P);const U=P.uis,u=U.find(u=>u.id===uiId)||U.find(u=>!String(u.ser||"").trim())||U[0];return{o:u,f:pf=>UI_MAP[pf]||pf,ui:u.id,n:U.indexOf(u)+1}}return{o:P,f:pf=>pf,ui:"",n:0}}
function scanBar(P,side,ui){if(!OCR)return"";const f="plaq"+side,n=(P.photos[f]||[]).length;
  if(ui)return`<div class="scan"><div class="actions"><button class="btn sm primary" type="button" data-act="cam" data-scan="1" data-ui="${ui}" data-id="${P.photos.id}" data-f="${f}">Photographier la plaque</button><button class="btn sm" type="button" data-act="gal" data-scan="1" data-ui="${ui}" data-id="${P.photos.id}" data-f="${f}">Galerie</button></div></div>`;
  return`<div class="scan"><span class="label">Remplir depuis la plaque signalétique</span>
   <div class="actions"><button class="btn sm primary" type="button" data-act="cam" data-scan="1" data-id="${P.photos.id}" data-f="${f}">Photographier la plaque</button><button class="btn sm" type="button" data-act="gal" data-scan="1" data-id="${P.photos.id}" data-f="${f}">Galerie</button>${n?`<button class="btn sm" type="button" data-act="reread" data-side="${side}">Relire la photo</button>`:""}</div>
   <span class="hint">${side==="UE"?"Référence, n° de série, fluide et charge":"Référence et n° de série"} sont lus sur la photo (sans réseau). Elle est rangée avec les photos de la PAC.</span></div>`}
/* imgs : une à trois photos de la même plaque ; demande = lecture voulue (on prévient même si rien n'est lu) */
async function lirePlaque(P,side,imgs,phId,demande,uiId){if(!OCR)return;if(reading){if(demande)toast("Lecture en cours…");return}reading=true;toast("Lecture de la plaque…");
  try{const rs=[];let rep=0;for(const im of imgs){const r=await ocrRead(im,notePlaque,false);if(r){rep++;rs.push(Plaque.lire(r))}}
    if(!C||!C.pacs.includes(P)||V.v!=="pac"||V.id!==P.id||SH)return;
    const R=Plaque.fusion(rs),F=PL_FIELDS[side],n=F.filter(([k])=>R[k]).length;
    if(!rep){if(demande)toast("La lecture n'a pas fonctionné sur ce téléphone. Remplis les cases à la main.");return}
    if(!R.texte.length&&!R.codes.length){toast("Rien de lisible sur la photo : reprends-la de plus près, bien en face, sans reflet.");return}
    /* photo ajoutée depuis l'onglet Photos : on n'ouvre la vérification que s'il y a du nouveau à mettre dans les cases */
    const T=plCible(P,side,uiId);
    if(!demande&&!F.some(([k,pf])=>R[k]&&String(T.o[T.f(pf)]??"").trim().toUpperCase()!==String(R[k]).toUpperCase()))return;
    const vals={id:uid()};for(const [k] of F)vals[k]=R[k]||"";
    openSheet("plaque",P.id,{side,ui:T.ui,ph:phId,vals,texte:R.texte,codes:R.codes,n,focus:""})}
  finally{reading=false}}
function plMark(){const S=$("sheet");S.querySelectorAll(".f.sel").forEach(e=>e.classList.remove("sel"));if(!SH||!SH.focus)return;const i=S.querySelector(`[data-f="${SH.focus}"]`);if(i&&i.closest(".f"))i.closest(".f").classList.add("sel")}
document.addEventListener("focusin",e=>{const t=e.target;if(!SH||(SH.kind!=="plaque"&&SH.kind!=="ecran")||!t.dataset||!t.dataset.f||!$("sheet").contains(t))return;SH.focus=t.dataset.f;plMark()});
/* Texte touché → case choisie (sinon la première case encore vide) */
function plPick(text){const o=SH.vals,F=PL_FIELDS[SH.side];const k=SH.focus||(F.find(([k])=>!o[k])||F[0])[0];const l=(F.find(f=>f[0]===k)||[])[2]||"";let v=String(text||"").trim();
  if(k==="fluide"){v=Plaque.lire({lines:[v]}).fluide;if(!v){toast("Pas de fluide reconnu dans ce texte.");return}}
  else if(k==="charge"){const m=/(\d+(?:[.,]\d+)?)\s?(kg|g)?\b/i.exec(v);if(!m){toast("Pas de nombre dans ce texte.");return}let q=parseFloat(m[1].replace(",","."));if((m[2]||"").toLowerCase()==="g")q/=1000;v=String(Math.round(q*1000)/1000).replace(".",",")}
  else{v=Plaque.sansLibelle(v)||v;if(k==="ref"||k==="serie")v=v.toUpperCase()}
  o[k]=v;SH.focus=k;const y=$("sheet").scrollTop;renderSheet();$("sheet").scrollTop=y;toast(`Copié dans « ${l} ».`)}
function plApply(){const P=C&&C.pacs.find(p=>p.id===SH.id);if(!P)return closeSheet();const o=SH.vals,done=[],T=plCible(P,SH.side,SH.ui);
  for(const [k,pf,l] of PL_FIELDS[SH.side]){let v=String(o[k]??"").trim();if(!v)continue;if(k==="ref"||k==="serie")v=v.toUpperCase();
    if(k==="fluide"){if(!FLUIDES[v])continue;if(P.fluide!==v){P.fluide=v;P.prg=FLUIDES[v].prg;done.push(l)}continue}
    if(String(T.o[T.f(pf)]??"")!==v){T.o[T.f(pf)]=v;done.push(l)}}
  save();closeSheet();toast(done.length?`Cases remplies${T.n?` (unité intérieure ${T.n})`:""} : `+done.join(", ").toLowerCase()+".":"Les cases étaient déjà à jour.")}

/* ---------------- Écran de la PAC : la photo de l'écran est lue sur le téléphone et remplit les relevés ---------------- */
let OCR_E=!!(NATIVE&&NATIVE.ocr&&window.Ecran);
const EC_KEYS=new Set(window.Ecran?Ecran.CASES.map(c=>c.k):[]);
/* cases de l'onglet Contrôles qu'un écran peut donner, pour ce type de PAC */
const ecFields=P=>SECTIONS.flatMap(s=>secItems(s,P.type)).filter(i=>EC_KEYS.has(i.f));
const ecDiff=(M,i,v)=>{const a=String(M[i.f]??"").trim();return i.s?a!==v:(a===""||num(a)!==num(v))};
function ecranBar(P){if(!OCR_E||!ecFields(P).length)return"";const n=(P.photos.ecran||[]).length;
  return`<div class="scan"><span class="label">Remplir depuis l'écran de la PAC</span>
   <div class="actions"><button class="btn sm primary" type="button" data-act="cam" data-scan="1" data-id="${P.photos.id}" data-f="ecran">Photographier l'écran</button><button class="btn sm" type="button" data-act="gal" data-scan="1" data-id="${P.photos.id}" data-f="ecran">Galerie</button>${n?`<button class="btn sm" type="button" data-act="rereadEcr">Relire ${n>1?"les photos":"la photo"}</button>`:""}</div>
   <span class="hint">Températures, pression, débit et mode sont lus sur la photo (sans réseau). Si l'écran défile, prends une photo par page. Les photos sont rangées avec celles de la PAC.</span></div>`}
/* imgs : une à quatre photos de l'écran ; demande = lecture voulue (on prévient même si rien n'est lu) */
async function lireEcran(P,imgs,phId,demande){if(!OCR_E)return;if(reading){if(demande)toast("Lecture en cours…");return}reading=true;toast("Lecture de l'écran…");
  try{const rs=[];let rep=0;for(const im of imgs){const r=await ocrRead(im,noteEcran,true);if(r){rep++;rs.push(Ecran.lire(r))}}
    if(!C||!C.pacs.includes(P)||V.v!=="pac"||V.id!==P.id||SH)return;
    if(!rep){if(demande)toast("La lecture n'a pas fonctionné sur ce téléphone. Remplis les cases à la main.");return}
    const R=Ecran.fusion(rs),F=ecFields(P),trouve=F.filter(i=>R.vals[i.f]!==undefined).map(i=>i.f);
    if(!R.texte.length){toast("Rien de lisible sur la photo : reprends-la bien en face, sans reflet sur l'écran.");return}
    /* photo ajoutée depuis l'onglet Photos : on n'ouvre la vérification que s'il y a du nouveau à mettre dans les cases */
    if(!demande&&!F.some(i=>trouve.includes(i.f)&&ecDiff(P.mes,i,R.vals[i.f])))return;
    const vals={id:uid()};for(const i of F)vals[i.f]=trouve.includes(i.f)?R.vals[i.f]:"";
    openSheet("ecran",P.id,{ph:phId,vals,lu:R.lu,texte:R.texte,trouve,more:!trouve.length,focus:""})}
  finally{reading=false}}
/* Texte touché → case choisie (sinon la première case affichée encore vide) */
function ecPick(text){const P=C&&C.pacs.find(p=>p.id===SH.id);if(!P)return closeSheet();const o=SH.vals,F=ecFields(P);
  const i=F.find(i=>i.f===SH.focus)||F.find(i=>(SH.more||SH.trouve.includes(i.f))&&!String(o[i.f]??"").trim());
  if(!i){toast("Touche d'abord la case à remplir.");return}
  const v=Ecran.choisir(i.f,text);if(v===null){toast(`Pas de valeur utilisable dans ce texte pour « ${i.l} ».`);return}
  o[i.f]=v;SH.focus=i.f;const y=$("sheet").scrollTop;renderSheet();$("sheet").scrollTop=y;toast(`Copié dans « ${i.l} ».`)}
function ecApply(){const P=C&&C.pacs.find(p=>p.id===SH.id);if(!P)return closeSheet();const o=SH.vals,M=P.mes,done=[];
  for(const i of ecFields(P)){const v=String(o[i.f]??"").trim();if(!v||(i.s&&!i.s.includes(v)))continue;
    if(String(M[i.f]??"").trim()!==v){M[i.f]=v;done.push(i.l)}}
  save();const y=window.scrollY;closeSheet();window.scrollTo(0,y);toast(done.length?`${done.length} case${done.length>1?"s":""} remplie${done.length>1?"s":""} : ${done.join(", ").toLowerCase()}.`:"Les cases étaient déjà à jour.")}

/* ---------------- Radiateurs : la température est lue sur la photo du thermomètre ----------------
   Chiffres « à bâtonnets » (afficheur à segments) : lus par l'appli elle-même (afficheur.js).
   Chiffres ordinaires (caméra thermique, écran) : lus par le lecteur de texte du téléphone. */
const RAD_LU=!!window.Afficheur;
let radLu=null;
const pause=()=>new Promise(r=>setTimeout(r,0));
const imgDe=src=>new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>rej(new Error("image"));im.src=src});
function pixels(im,max){const k=Math.min(1,max/Math.max(im.naturalWidth,im.naturalHeight)),w=Math.max(1,Math.round(im.naturalWidth*k)),h=Math.max(1,Math.round(im.naturalHeight*k)),c=document.createElement("canvas");c.width=w;c.height=h;
  const x=c.getContext("2d",{willReadFrequently:true});x.fillStyle="#fff";x.fillRect(0,0,w,h);x.drawImage(im,0,0,w,h);return x.getImageData(0,0,w,h)}
/* photo réduite d'abord (rapide), puis plus grande si le thermomètre est loin ; on s'arrête dès qu'une lecture est franche */
async function segments(im,court){const t0=Date.now();let best=null;
  /* court : le téléphone a déjà lu un nombre, on vérifie seulement s'il y a un afficheur à segments bien visible */
  for(const [max,essais] of court?[[900,[[0],[7],[-7]]]]:[[900,Afficheur.ESSAIS],[1500,[[0],[7],[-7]]]]){if(max>900&&Math.max(im.naturalWidth,im.naturalHeight)<1150)break;const px=pixels(im,max);
    for(const e of essais){if(e[1]&&best)break;await pause();const r=Afficheur.temperature(px,null,[e]);if(r.v!==null&&(!best||r.note>best.note))best=r;if((best&&best.note>=3.7)||Date.now()-t0>10000)return best}
    if(best)break}
  return best}
/* t : lecture du texte par le téléphone, g : lecture des segments par l'appli */
function radChoix(t,g){const a=t&&t.v!==null?t:null,b=g&&g.v!==null?g:null;if(!a||!b)return a?a.v:b?b.v:null;
  if(a.unite||num(a.v)===num(b.v))return a.v;const na=a.v.replace(/\D/g,"").length,nb=b.lu.replace(/\D/g,"").length;return na>nb?a.v:b.v}
/* srcs : [{img : photo pour le lecteur de texte, el : image déjà chargée}] */
async function lireRad(P,r,srcs,demande){if(!RAD_LU)return;if(reading){if(demande)toast("Lecture en cours…");return}reading=true;toast("Lecture de la température…");
  try{let v=null;
    for(const s of srcs){let t=null,g=null;
      if(OCR_E&&s.img&&!LECT_WEB){const o=await ocrRead(s.img);if(o)t=Ecran.temperature(o)}
      if(!(t&&t.v!==null&&t.unite)){try{g=await segments(s.el||await imgDe(s.img),!!(t&&t.v!==null))}catch(e){g=null}}
      /* version web : le lecteur de texte est lent, il ne sert que si les segments n'ont rien donné */
      if(LECT_WEB&&OCR_E&&s.img&&!(g&&g.v!==null)){const o=await ocrRead(s.img,r=>{const x=Ecran.temperature(r);return x&&x.v!==null?3:0},false);if(o)t=Ecran.temperature(o)}
      v=radChoix(t,g);if(v!==null)break}
    if(!C||!C.pacs.includes(P)||!(P.mes.rads||[]).includes(r))return;const n0=radName({lieu:r.lieu},P.mes.rads.indexOf(r)),nom=n0.charAt(0).toUpperCase()+n0.slice(1);
    if(v===null){toast("Température non lue sur la photo : saisis-la à la main, ou reprends la photo de près, bien en face, sans reflet.");return}
    const act=String(r.t??"").trim();
    if(act&&num(act)===num(v)){if(demande)toast(`${nom} : ${v} °C, la case est déjà juste.`);return}
    if(act){radLu={id:r.id,v};toast(`${nom} : ${v} °C lu sur la photo, ${act} °C dans la case.`);if(V.v==="pac"&&V.id===P.id&&PT==="mes"&&!SH){redessiner()}return}
    r.t=v;save();
    /* on écrit dans la case sans tout redessiner : la saisie en cours (emplacement) n'est pas interrompue */
    const i=document.querySelector(`#app input[data-id="${r.id}"][data-f="t"]`);if(i)i.value=v;else if(V.v==="pac"&&V.id===P.id&&!SH){redessiner()}
    toast(`${nom} : ${v} °C lu sur la photo. Vérifie.`)}
  finally{reading=false}}

/* ---------------- Visionneuse photo : supprimer avec confirmation, déplacer ou copier ailleurs ---------------- */
let VW=null;
/* Tous les emplacements photo du chantier. ici : la PAC de la photo affichée. Ses emplacements viennent en premier ; ceux des autres PAC sont rangés après, chacun marqué du nom de sa PAC. */
function photoDests(ici){const D=[],ordre=C.pacs.map((P,i)=>i).sort((a,b)=>(C.pacs[b]===ici)-(C.pacs[a]===ici)||a-b);
  for(const i of ordre){const P=C.pacs[i],moi=P===ici,nom=`PAC ${i+1}${P.repere?` - ${P.repere}`:""}`,g=moi?`Cette PAC (${nom})`:`Autre PAC : ${nom}`,pre=moi||!ici?"":`PAC ${i+1} › `;
    photoGroups(P).forEach(([t,fs])=>fs.forEach(([f,l])=>D.push({pi:i,g,nom,moi,key:P.photos.id+"|"+f,l:`${pre}${t} - ${l}`})));
    if(isEau(P.type))(P.mes.rads||[]).forEach((r,j)=>D.push({pi:i,g,nom,moi,key:r.id+"|ph",l:`${pre}Radiateur - ${radName(r,j)}`}))}
  return D}
const vPac=()=>{const o=VW&&byId(VW.id);return o?pacOf(o):null};
const radName=(r,j)=>(String(r.lieu||"").trim()||`radiateur ${j+1}`)+(String(r.t||"").trim()?` (${String(r.t).trim()} °C)`:"");
function closeViewer(){VW=null;$("viewer").hidden=true}
/* photo affichée (avec sa fiche et la PAC ouverte), pour la relire ; ferme la visionneuse */
function vPrendre(){const P=curPac(),o=VW&&byId(VW.id),p=o&&(o[VW.f]||[]).find(p=>p.id===VW.p);if(!P||!p)return null;closeViewer();return{P,o,p}}
function openViewer(id,f,pid,del){const o=byId(id);const p=o&&(o[f]||[]).find(p=>p.id===pid);if(!p)return;VW={id,f,p:pid,del:!!del};$("viewerImg").src=p.img;renderViewer();$("viewer").hidden=false}
function renderViewer(){if(!VW)return;const here=VW.id+"|"+VW.f;
  if(VW.del){$("viewerPanel").innerHTML=`<div class="vdel"><b>Supprimer définitivement cette photo ?</b><span class="hint">Elle ne pourra pas être récupérée.</span>
    <div class="actions"><button class="btn danger wide" type="button" data-act="vDel">Oui, supprimer</button><button class="btn primary wide" type="button" data-act="vCancelDel">Non, garder</button></div></div>`;return}
  const D=C?photoDests(vPac()).filter(d=>d.key!==here):[];const groups=[...new Set(D.map(d=>d.pi))];
  $("viewerPanel").innerHTML=`${D.length?`<label class="f"><span class="label">Déplacer ou copier cette photo vers</span><select id="vDest"><option value="">— Choisir l'endroit —</option>${groups.map(pi=>{const L=D.filter(d=>d.pi===pi);return`<optgroup label="${esc(L[0].g)}">${L.map(d=>`<option value="${d.key}">${esc(d.l)}</option>`).join("")}</optgroup>`}).join("")}</select></label>`:""}
   ${vReadBtns()}<div class="actions">${D.length?`<button class="btn primary wide" type="button" data-act="vMove">Déplacer</button><button class="btn wide" type="button" data-act="vCopy">Copier</button>`:""}<button class="btn danger" type="button" data-act="vAskDel">Supprimer</button></div>`}
function vReadBtns(){if(!C||!VW)return"";const o=byId(VW.id),P=o&&pacOf(o);if(!P||P!==curPac())return"";
  if(RAD_LU&&VW.f==="ph"&&(P.mes.rads||[]).includes(o))return`<div class="actions"><button class="btn wide" type="button" data-act="vReadRad">Lire la température sur cette photo</button></div>`;
  if(!OCR||o!==P.photos)return"";const side=PLAQ[VW.f];
  if(side)return`<div class="actions"><button class="btn wide" type="button" data-act="vRead" data-side="${side}">Lire cette plaque et remplir les cases</button></div>`;
  if(VW.f==="ecran"&&OCR_E&&ecFields(P).length)return`<div class="actions"><button class="btn wide" type="button" data-act="vReadEcr">Lire cet écran et remplir les relevés</button></div>`;
  if(VW.f!=="plaques")return"";
  return`<div class="actions"><button class="btn wide" type="button" data-act="vRead" data-side="UE">Lire : plaque unité extérieure</button><button class="btn wide" type="button" data-act="vRead" data-side="UI">Lire : plaque ${esc(uiLbl(P).toLowerCase())}</button></div>`}
function phTransfer(move){const v=($("vDest")||{}).value;if(!v){toast("Choisis d'abord l'endroit dans la liste.");return}
  const [tid,tf]=v.split("|");const src=byId(VW.id),dst=byId(tid);if(!src||!dst)return;const p=(src[VW.f]||[]).find(p=>p.id===VW.p);if(!p)return;
  const d=photoDests(vPac()).find(d=>d.key===v)||{};
  (dst[tf]=dst[tf]||[]).push({...p,id:uid()});if(move)src[VW.f]=src[VW.f].filter(x=>x.id!==VW.p);
  closeViewer();save();render();if(SH)renderSheet();
  toast(`Photo ${move?"déplacée":"copiée"} ${d.moi?"dans cette PAC":"vers "+(d.nom||"une autre PAC")} : ${String(d.l||"").replace(/^PAC \d+ › /,"")}`)}

/* ---------------- Saisie ---------------- */
function touched(o){if(o===CFG||o===CFG.ent||CFG.techs.includes(o)||CFG.dets.includes(o))saveCfg();else save()}
const CALC_F=new Set(["chargeUsine","chargeComp","prg"]);
document.addEventListener("input",e=>{const t=e.target;if(!t.dataset||!t.dataset.id||!t.dataset.f)return;if(t.tagName==="SELECT"||t.type==="checkbox")return;
  const o=byId(t.dataset.id);if(!o)return;o[t.dataset.f]=t.value;touched(o);
  if(radLu&&radLu.id===o.id&&t.dataset.f==="t")radLu=null;
  if(t.dataset.f==="marque"&&C&&C.pacs.includes(o))majGammes(o);
  if(CALC_F.has(t.dataset.f)&&$("calc")){const P=curPac();const w=document.createElement("div");w.innerHTML=calcHtml(P);$("calc").replaceWith(w.children[0]);$("calcFreq").replaceWith(w.children[0])}
  if(t.dataset.f==="repere"||t.dataset.f==="marque"||t.dataset.f==="gamme"){const P=curPac();if(P){const tt=$("top").querySelector(".ttl");if(tt){tt.querySelector("b").textContent=pacName(P);tt.querySelector("small").textContent=`${pacModel(P)} · ${C.clientNom||C.nom||"Chantier"}`}}}});
document.addEventListener("change",e=>{const t=e.target;if(t.tagName!=="SELECT"||!t.dataset.id||!t.dataset.f)return;const o=byId(t.dataset.id);if(!o)return;
  o[t.dataset.f]=t.value;if(t.dataset.f==="fluide")o.prg=(FLUIDES[t.value]||FLUIDES.Autre).prg;touched(o);render()});

/* ---------------- Boutons ---------------- */
const ACT={
  /* codes d'accès de la version en ligne (Réglages de Manaen) */
  codeCreer(){codeCreer()},
  codeRetirer(t){confirmDel=t.dataset.id;redessiner()},
  codeRetire(t){const c=(CFG.codes||[]).find(c=>c.id===t.dataset.id);if(!c)return;const u=t.getAttribute("href");
    if(NATIVE)location.href=u;else window.open(u,"_blank","noopener");c.retire=today();confirmDel=null;saveCfg();setTimeout(redessiner,300)},
  codeOubli(t){CFG.codes=(CFG.codes||[]).filter(c=>c.id!==t.dataset.id);saveCfg();redessiner()},
  /* version web : installation sur l'écran d'accueil */
  installer(){if(invite){invite.prompt();invite=null;render()}},
  installNon(){regler("mes-install","non");render()},
  /* navigation */
  back(){window.__onBack()},
  closeSheet(){closeSheet()},
  cancelDel(){confirmDel=null;SH?renderSheet():render()},
  cfg(){go({v:"cfg",from:V.v==="home"?null:V.v,fromId:V.id})},
  /* accueil et chantier */
  async newChantier(){await flush();C=blankChantier();await persist(C);go({v:"chantier"})},
  openChantier(t){openChantier(t.dataset.id)},
  async sample(){await flush();const c=sample();await persist(c);openChantier(c.id)},
  importJson(){$("inJson").click()},
  delChantier(){confirmDel="chantier";render()},
  async delChantierYes(){const id=C.id;clearTimeout(saveT);saveT=null;await kvDel("c:"+id);INDEX=INDEX.filter(x=>x.id!==id);await kvPut("index",INDEX);C=null;showHome();toast("Chantier supprimé.")},
  async backup(){await flush();offrir([{name:fname("sauvegarde-mes","json"),blob:new Blob([JSON.stringify(C)],{type:"application/json"})}],"save")},
  async backupShare(){await flush();offrir([{name:fname("sauvegarde-mes","json"),blob:new Blob([JSON.stringify(C)],{type:"application/json"})}],"share")},
  /* dossier du chantier et documents d'une PAC */
  dosPac(t){const d=dos();if(t.checked)d.off.delete(t.dataset.id);else d.off.add(t.dataset.id);dosMaj()},
  dosTous(){const d=dos();if(dosSel().length===C.pacs.length)C.pacs.forEach(p=>d.off.add(p.id));else d.off.clear();dosMaj()},
  dosSep(t){dos().sep=!!t.dataset.v;dosMaj()},
  exp(t){exportDoc(t.dataset.k,t.dataset.m)},
  /* PAC */
  newPac(){const P=blankPac();C.pacs.push(P);save();PT="equip";go({v:"pac",id:P.id})},
  dupPac(t){const src=C.pacs.find(p=>p.id===t.dataset.id);if(!src)return;const P=blankPac();
    for(const k of["type","marque","gamme","modUE","modUI","nbUI","puis","fluide","prg","chargeUsine","scelle","tech","det","cerfaOn"])P[k]=src[k];
    /* les contrôles et réglages sont repris, pas les relevés ni les observations */
    for(const [k,v] of Object.entries(src.mes))if(k!=="id"&&k!=="obs"&&k!=="rads"&&!REL_KEYS.has(k))P.mes[k]=v;
    if(src.type==="aax"){syncUI(src);P.uis=src.uis.map(u=>({id:uid(),mod:u.mod||"",ser:"",loc:""}));P.nbUI=String(P.uis.length)}
    P.cerfa.nature=src.cerfa.nature;P.cerfa.detAuto=src.cerfa.detAuto;P.date=src.date||today();
    C.pacs.push(P);save();PT="equip";go({v:"pac",id:P.id});toast("PAC dupliquée : renseigne le repère et les n° de série.")},
  openPac(t){PT="equip";go({v:"pac",id:t.dataset.id})},
  ptab(t){PT=t.dataset.k;confirmDel=null;render();window.scrollTo(0,0)},
  delPac(){confirmDel=V.id;render()},
  delPacYes(){C.pacs=C.pacs.filter(p=>p.id!==V.id);save();go({v:"chantier"})},
  /* saisie : choix, cases à cocher, points de contrôle */
  radio(t){const o=byId(t.dataset.id);if(!o)return;o[t.dataset.f]=t.dataset.v;if(t.dataset.f==="type"&&C.pacs.includes(o)){o.cerfaOn=t.dataset.v!=="aem";syncUI(o)}touched(o);redessiner()},
  chk(t){const o=byId(t.dataset.id);if(!o)return;o[t.dataset.f]=t.checked;touched(o);redessiner()},
  ck(t){const o=byId(t.dataset.id);if(!o)return;o[t.dataset.f]=o[t.dataset.f]===t.dataset.v?"":t.dataset.v;save();
    /* mise à jour sur place (boutons et compteur de la section), sans redessiner la page */
    t.parentNode.querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.v===o[t.dataset.f]));
    const sec=t.closest("details");const n=sec&&sec.querySelector("summary .n");if(n){const all=sec.querySelectorAll(".ck .seg");n.textContent=`${[...all].filter(g=>g.querySelector(".on")).length}/${all.length}`}},
  allOk(t){const P=curPac();const s=SECTIONS.find(x=>x.id===t.dataset.s);for(const i of secItems(s,P.type))if(i.k&&!P.mes[i.f])P.mes[i.f]="ok";save();redessiner()},
  /* unités intérieures d'un multi-split */
  addUi(t){const P=curPac();if(!P)return;syncUI(P);const d=P.uis[P.uis.length-1];P.uis.push({id:uid(),mod:t.dataset.same&&d?d.mod:"",ser:"",loc:""});P.nbUI=String(P.uis.length);save();redessiner()},
  delUi(t){const P=curPac();if(!P||!P.uis||P.uis.length<2)return;const u=P.uis.find(u=>u.id===t.dataset.id);if(!u)return;if(!uiVide(u)&&confirmDel!==u.id){confirmDel=u.id;redessiner();return}
    confirmDel=null;P.uis=P.uis.filter(x=>x!==u);P.nbUI=String(P.uis.length);save();redessiner()},
  /* radiateurs */
  addRad(){const P=curPac();if(!P)return;(P.mes.rads=P.mes.rads||[]).push({id:uid(),lieu:"",t:""});save();redessiner();
    const ins=document.querySelectorAll('.radrow input[data-f="lieu"]');if(ins.length)ins[ins.length-1].focus()},
  delRad(t){const P=curPac();if(!P||!P.mes.rads)return;const r=P.mes.rads.find(r=>r.id===t.dataset.id);if(r&&(r.ph||[]).length&&confirmDel!==r.id){confirmDel=r.id;redessiner();return}
    confirmDel=null;if(radLu&&radLu.id===t.dataset.id)radLu=null;P.mes.rads=P.mes.rads.filter(r=>r.id!==t.dataset.id);save();redessiner()},
  radLuOui(){const P=curPac(),r=P&&radLu&&(P.mes.rads||[]).find(r=>r.id===radLu.id);if(r){r.t=radLu.v;save()}radLu=null;redessiner()},
  radLuNon(){radLu=null;redessiner()},
  /* Cerfa */
  cerfaOn(){curPac().cerfaOn=true;save();render()},
  cerfaOff(){curPac().cerfaOn=false;save();render();window.scrollTo(0,0)},
  /* signatures */
  pad(t){openSheet("pad",curPac().id,{k:t.dataset.k})},
  padClear(){initPad()},
  padOk(){const img=padDirty?padImage():null;if(!img){toast("Signe dans le cadre blanc.");return}
    if(SH.k==="cfg"){CFG.sigTech=img;saveCfg()}
    else{const P=curPac();P.sig[SH.k]=img;if(SH.k==="tech"&&$("padKeep")&&$("padKeep").checked){CFG.sigTech=img;saveCfg()}save()}
    closeSheet();toast("Signature enregistrée.")},
  useMySig(){const P=curPac();P.sig.tech=CFG.sigTech;save();render()},
  clearSig(t){const P=curPac();P.sig[t.dataset.k]=null;save();render()},
  /* photos et visionneuse */
  cam(t){phTarget={id:t.dataset.id,f:t.dataset.f,scan:!!t.dataset.scan,ui:t.dataset.ui||""};$("inCam").click()},
  gal(t){phTarget={id:t.dataset.id,f:t.dataset.f,scan:!!t.dataset.scan,ui:t.dataset.ui||""};$("inGal").click()},
  view(t){openViewer(t.dataset.id,t.dataset.f,t.dataset.p,false)},
  askDelPh(t){openViewer(t.dataset.id,t.dataset.f,t.dataset.p,true)},
  closeViewer(){closeViewer()},
  vAskDel(){VW.del=true;renderViewer()},
  vCancelDel(){VW.del=false;renderViewer()},
  vDel(){const o=byId(VW.id);if(o)o[VW.f]=(o[VW.f]||[]).filter(p=>p.id!==VW.p);closeViewer();save();render();if(SH)renderSheet();toast("Photo supprimée.")},
  vMove(){phTransfer(true)},
  vCopy(){phTransfer(false)},
  /* lectures de photos : plaque signalétique, écran de la PAC, thermomètre d'un radiateur */
  reread(t){const P=curPac();if(!P)return;const L=(P.photos["plaq"+t.dataset.side]||[]).slice(-3);if(!L.length)return;lirePlaque(P,t.dataset.side,L.map(p=>p.img),L[L.length-1].id,true)},
  vRead(t){const x=vPrendre();if(x)lirePlaque(x.P,t.dataset.side,[x.p.img],x.p.id,true)},
  plPick(t){const lus=[...SH.codes,...SH.texte];plPick(lus[+t.dataset.i])},
  plApply(){plApply()},
  rereadEcr(){const P=curPac();if(!P)return;const L=(P.photos.ecran||[]).slice(-4);if(!L.length)return;lireEcran(P,L.map(p=>p.img),L[L.length-1].id,true)},
  vReadEcr(){const x=vPrendre();if(x)lireEcran(x.P,[x.p.img],x.p.id,true)},
  ecPick(t){ecPick(SH.texte[+t.dataset.i])},
  ecApply(){ecApply()},
  ecMore(){SH.more=true;const y=$("sheet").scrollTop;renderSheet();$("sheet").scrollTop=y},
  vReadRad(){const x=vPrendre();if(x)lireRad(x.P,x.o,[{img:x.p.img}],true)},
  /* réglages : techniciens, détecteurs, signature enregistrée */
  newTech(){const o={id:uid(),nom:"",qual:"Technicien",attApt:""};CFG.techs.push(o);if(!CFG.defTech)CFG.defTech=o.id;saveCfg();openSheet("tech",o.id)},
  openTech(t){openSheet("tech",t.dataset.id)},
  defTech(t){CFG.defTech=t.checked?SH.id:"";saveCfg()},
  delTech(){confirmDel=SH.id;renderSheet()},
  delTechYes(){CFG.techs=CFG.techs.filter(x=>x.id!==SH.id);if(CFG.defTech===SH.id)CFG.defTech="";saveCfg();closeSheet()},
  newDet(){const o={id:uid(),marque:"",modele:"",serie:"",ctrl:""};CFG.dets.push(o);if(!CFG.defDet)CFG.defDet=o.id;saveCfg();openSheet("det",o.id)},
  openDet(t){openSheet("det",t.dataset.id)},
  defDet(t){CFG.defDet=t.checked?SH.id:"";saveCfg()},
  delDet(){confirmDel=SH.id;renderSheet()},
  delDetYes(){CFG.dets=CFG.dets.filter(x=>x.id!==SH.id);if(CFG.defDet===SH.id)CFG.defDet="";saveCfg();closeSheet()},
  logoPick(t){logoCible=t.dataset.k==="client"?"client":"ent";$("inLogo").click()},
  logoDel(t){if(t.dataset.k==="client"){C.logoClient=null;save();ouvertClient=true}else{CFG.ent.logo=null;saveCfg()}redessiner();toast("Logo retiré.")},
  padTechCfg(){openSheet("pad",null,{k:"cfg"})},
  delSigCfg(){CFG.sigTech=null;saveCfg();render()},
};
document.addEventListener("click",e=>{const t=e.target.closest("[data-act]");if(!t||t.tagName==="INPUT"&&t.type!=="checkbox")return;const f=ACT[t.dataset.act];if(!f)return;
  if(t.type!=="checkbox")e.preventDefault();f(t,e)});
/* Logo (entreprise ou client) : l'image choisie est réduite et gardée ; la transparence d'un PNG est conservée */
let logoCible="ent";
$("inLogo").onchange=async()=>{const f=$("inLogo").files[0];$("inLogo").value="";if(!f)return;
  try{const im=await loadImg(f),k=Math.min(1,700/Math.max(im.naturalWidth,im.naturalHeight)),w=Math.max(1,Math.round(im.naturalWidth*k)),h=Math.max(1,Math.round(im.naturalHeight*k));
    const c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(im,0,0,w,h);const l={img:c.toDataURL("image/png"),w,h};
    if(logoCible==="client"){if(!C)return;C.logoClient=l;save();ouvertClient=true;redessiner();toast("Logo du client enregistré.")}
    else{CFG.ent.logo=l;saveCfg();redessiner();toast("Logo enregistré.")}}
  catch(e){toast("Cette image ne peut pas servir de logo. Choisis un fichier PNG ou JPEG.")}};
$("inJson").onchange=async()=>{const f=$("inJson").files[0];$("inJson").value="";if(!f)return;
  try{const d=JSON.parse(await f.text());if(!d||!Array.isArray(d.pacs))throw 0;
    d.exemple=false;if(typeof d.id!=="string"||!ID_OK.test(d.id)||INDEX.some(x=>x.id===d.id))d.id=uid();
    reparer(d);await persist(d);openChantier(d.id);toast("Sauvegarde importée.")}
  catch(e){toast("Ce fichier n'est pas une sauvegarde de Mise en Service PAC.")}};

/* ---------------- Fichiers (enregistrer / partager / mail) ---------------- */
function slug(s){return sansAccent(s).replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-|-$/g,"").toLowerCase()}
function fname(kind,ext,extra){return[kind,slug(C.nom||C.clientNom||"chantier"),extra].filter(Boolean).join("-")+"."+ext}
function b64(blob){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(",")[1]);r.onerror=rej;r.readAsDataURL(blob)})}
window.__onSaved=ok=>{if(ok===null)return;toast(ok?"Fichier enregistré.":"L'enregistrement a échoué. Choisis un autre dossier.")};
window.__onShareFailed=()=>toast("Impossible d'ouvrir le partage. Utilise « Enregistrer ».");
window.__onSavedMulti=(n,total)=>{if(n===null)return;toast(n===total?`${n} fichiers enregistrés dans le dossier choisi.`:n?`${n} fichiers enregistrés sur ${total} : recommence dans un autre dossier.`:"L'enregistrement a échoué. Choisis un autre dossier (pas la racine de Téléchargements : un sous-dossier).")};
const mimeDe=nom=>nom.endsWith(".pdf")?"application/pdf":"application/json";
/* Version PC (navigateur) : partage du système s'il existe. Renvoie true si c'est fait, ou annulé par l'utilisateur. */
async function partageWeb(files,titre,texte){if(!navigator.canShare)return false;let d=null;
  try{const fs=files.map(f=>new File([f.blob],f.name,{type:mimeDe(f.name)}));if(!navigator.canShare({files:fs}))return false;d={files:fs,title:titre,text:texte};await navigator.share(d);return true}
  catch(e){if(e&&e.name==="AbortError")return true;
    /* le téléphone refuse un partage qui ne suit pas immédiatement un appui (le PDF a mis du temps à se faire) : on redemande un appui */
    if(d&&e&&e.name==="NotAllowedError"){relancer(d,files.length);return true}return false}}
function relancer(d,n){const t=$("toast");clearTimeout(t._t);t.textContent="";const b=document.createElement("button");b.type="button";b.className="btn primary";
  b.textContent=n>1?`Les ${n} PDF sont prêts : touche ici pour les envoyer`:"Le PDF est prêt : touche ici pour l'envoyer";
  b.onclick=()=>{t.hidden=true;t.textContent="";navigator.share(d).catch(()=>{})};t.appendChild(b);t.hidden=false;t._t=setTimeout(()=>{t.hidden=true;t.textContent=""},60000)}
function telecharger(f){const a=document.createElement("a");a.href=URL.createObjectURL(f.blob);a.download=f.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),8000)}
/* Remet un ou plusieurs fichiers à l'utilisateur. mode : "mail" (destinataire, objet et texte pré-remplis), "save" ou "share".
   Plusieurs fichiers : tous joints au même mail, partagés ensemble, ou rangés d'un coup dans un dossier choisi. */
async function offrir(files,mode,mail){const n=files.length,envoi=mode==="mail"&&mail;
  if(!NATIVE){
    /* iPhone : « Enregistrer » passe aussi par le partage, qui propose « Enregistrer dans Fichiers » (un téléchargement s'y ouvre mal dans une appli installée) */
    if((mode!=="save"||IOS)&&await partageWeb(files,mail?mail.subject:files[0].name,mail?mail.body:""))return;
    for(const f of files){telecharger(f);if(n>1)await new Promise(r=>setTimeout(r,350))}
    if(envoi){toast(n>1?`${n} PDF téléchargés : joins-les au mail qui s'ouvre.`:"PDF téléchargé : joins-le au mail qui s'ouvre.");
      setTimeout(()=>{location.href="mailto:"+encodeURIComponent(mail.to.join(","))+"?subject="+encodeURIComponent(mail.subject)+"&body="+encodeURIComponent(mail.body)},1200)}
    else if(n>1)toast(`${n} PDF téléchargés.`);
    return}
  if(n>1){NATIVE.multiStart();for(const f of files)NATIVE.multiAdd(f.name,mimeDe(f.name),await b64(f.blob));
    if(mode==="save")NATIVE.multiSave();else NATIVE.multiMail(envoi?mail.to.join(","):"",mail?mail.subject:"",envoi?mail.body:"");return}
  const f=files[0],mime=mimeDe(f.name),data=await b64(f.blob);
  if(envoi)NATIVE.mail(f.name,mime,data,mail.to.join(","),mail.subject,mail.body);
  else if(mode==="save")NATIVE.save(f.name,mime,data);else NATIVE.share(f.name,mime,data)}
async function exportDoc(kind,mode){if(busy)return;if(!window.jspdf){toast("Le module PDF n'a pas pu se charger.");return}busy=true;toast("Création du PDF…");
  try{await flush();const P=curPac();let blob,name,subject,what,files=null;
    const S=kind==="dossier"?dosSel():[];if(kind==="dossier"&&!S.length){toast("Coche au moins une PAC.");return}
    const sig=[tech((P||S[0]||C.pacs[0]||{}).tech)?.nom,CFG.ent.nom,CFG.ent.tel].filter(Boolean).join("\n");
    if(kind==="dossier"){const n=S.length,tout=n===C.pacs.length,un=n===1?S[0]:null,docs=S.some(p=>p.cerfaOn)?"procès-verbaux et fiches d'intervention":"procès-verbaux";
      subject=un?`Mise en service — ${pacModel(un)}${un.repere?" ("+un.repere+")":""}${C.nom?" — "+C.nom:""}`:`Mise en service de vos pompes à chaleur${C.nom?" — "+C.nom:""}`;
      if(dos().sep&&n>1){
        /* un PDF par PAC : le numéro de la PAC dans le nom évite deux fichiers du même nom */
        files=S.map(p=>{const D=newDoc();drawPV(D,p);if(p.cerfaOn)drawCerfa(D,p);return{name:fname("mise-en-service","pdf","pac"+String(C.pacs.indexOf(p)+1).padStart(2,"0")+"-"+slug(pacName(p))+"-"+(p.date||today())),blob:D.finish()}});
        what=`les dossiers de mise en service de vos ${n} pompes à chaleur (${docs}, un PDF par pompe à chaleur)`}
      else{blob=buildDossier(S);name=fname("dossier-mise-en-service","pdf",tout?"":un?"pac"+String(C.pacs.indexOf(un)+1).padStart(2,"0")+"-"+slug(pacName(un)):n+"-pac");
        what=un?`le dossier de mise en service de votre pompe à chaleur ${pacModel(un)} (${un.cerfaOn?"procès-verbal et fiche d'intervention":"procès-verbal"})`:`le dossier de mise en service de vos ${n} pompes à chaleur (${docs})`}}
    else{const D=newDoc();if(kind!=="cerfa")drawPV(D,P);if(kind!=="pv")drawCerfa(D,P);blob=D.finish();
      const base={pv:"pv-mise-en-service",cerfa:"cerfa-15497",both:"mise-en-service"}[kind];name=fname(base,"pdf",slug(pacName(P))+"-"+(P.date||today()));
      subject=`${{pv:"PV de mise en service",cerfa:"Fiche d'intervention fluides frigorigènes",both:"Mise en service"}[kind]} — ${pacModel(P)}${P.repere?" ("+P.repere+")":""}`;
      what={pv:"le procès-verbal de mise en service",cerfa:"la fiche d'intervention (Cerfa 15497*04)",both:"le procès-verbal de mise en service et la fiche d'intervention (Cerfa 15497*04)"}[kind]+` de votre pompe à chaleur ${pacModel(P)}`}
    const body=`Bonjour,\n\nVeuillez trouver ci-joint ${what}.\n\nNous vous rappelons que l'entretien de votre pompe à chaleur est obligatoire tous les deux ans. Conservez ces documents : ils vous seront demandés en cas de garantie.\n\nCordialement,${sig?"\n"+sig:""}`;
    const mail={to:C.clientMail?[C.clientMail.trim()]:[],subject,body};
    await offrir(files||[{name,blob}],mode,mail)}
  catch(e){console.error(e);toast("La création du PDF a échoué.")}finally{busy=false}}

/* ---------------- PDF ---------------- */
/* jsPDF (police Helvetica) ne connaît pas tous les caractères : on les remplace par leur équivalent simple */
function txt(s){return String(s??"").replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d\u00ab\u00bb]/g,'"').replace(/[\u2013\u2014]/g,"-").replace(/\u2026/g,"...").replace(/[\u00a0\u202f]/g," ").replace(/\u0153/g,"oe").replace(/\u0152/g,"OE").replace(/\u2082/g,"2").replace(/\u2264/g,"<=").replace(/\u2265/g,">=")}
const DK=[28,33,38],ACC=[29,111,165],GR=[105,111,117],LN=[200,204,208],OKC=[47,138,76],BADC=[194,58,43],SOFT=[234,242,249],FLASH=[255,221,0];
function newDoc(){
  const {jsPDF}=window.jspdf;const doc=new jsPDF({unit:"mm",format:"a4",orientation:"p"});
  const D={doc,M:14,W:210,H:297,y:0,started:false,title:"",subtitle:"",right:""};
  D.head=()=>{doc.setFillColor(...DK);doc.rect(0,0,210,16,"F");doc.setFillColor(...ACC);doc.rect(0,16,210,1.2,"F");
    doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.setFontSize(11);doc.text(txt(D.title),D.M,7);
    doc.setFont("helvetica","normal");doc.setFontSize(8.5);doc.text(txt(D.subtitle),D.M,12.2);
    /* logos à droite, chacun sur un fond blanc (lisible quel que soit le logo) : celui de l'entreprise au bord, celui du client
       à sa gauche sur les PV. Leur largeur est limitée à la place laissée par les textes ; sans place, ils ne sont pas mis. */
    let xr=210-D.M;const LG=[logo(),D.logoClient].filter(Boolean);
    if(LG.length){const larg=(t,gras,fs)=>{doc.setFont("helvetica",gras?"bold":"normal");doc.setFontSize(fs);return t?doc.getTextWidth(txt(t)):0};
      const libre=Math.min(210-2*D.M-larg(D.title,1,11)-larg(D.right,1,9),210-2*D.M-larg(D.subtitle,0,8.5)-larg(D.right2,0,8.5))-12;
      const h=11,ecart=4.5;let ws=LG.map(l=>Math.min(42,h*l.w/l.h));
      /* pas assez de place pour les deux : on les réduit ensemble, et s'ils deviennent trop petits on ne garde que celui de l'entreprise */
      const tient=()=>ws.reduce((a,b)=>a+b,0)+ecart*(ws.length-1)<=libre;
      if(!tient()){const k=(libre-ecart*(ws.length-1))/ws.reduce((a,b)=>a+b,0);if(k>0&&ws.every(w=>w*k>=9))ws=ws.map(w=>w*k);else{LG.length=1;ws=[Math.min(ws[0],libre)]}}
      if(ws[0]>=9){LG.forEach((l,i)=>{const w=ws[i],hh=w*l.h/l.w,x=xr-w,y=2.5+(h-hh)/2;doc.setFillColor(255,255,255);doc.roundedRect(x-1.5,1.4,w+3,h+2.2,1.2,1.2,"F");
          try{doc.addImage(l.img,"PNG",x,y,w,hh,i?"logoClient":"logo","FAST")}catch(e){}xr=x-ecart-1.5});xr-=.5;doc.setTextColor(255,255,255)}}
    if(D.right){doc.setFont("helvetica","bold");doc.setFontSize(9);doc.text(txt(D.right),xr,7,{align:"right"})}
    if(D.right2){doc.setFont("helvetica","normal");doc.setFontSize(8.5);doc.text(txt(D.right2),xr,12.2,{align:"right"})}
    doc.setTextColor(...DK);D.y=23};
  /* logoClient : logo du client à mettre dans l'en-tête de la partie en cours (les PV) */
  D.logoClient=null;
  D.section=(title,subtitle,right,right2,foot)=>{D.title=title;D.subtitle=subtitle;D.right=right||"";D.right2=right2||"";if(D.started){doc.addPage()}D.started=true;D.pageFoot[doc.getNumberOfPages()]=foot||"";D.head()};
  D.pageFoot={};
  D.page=()=>{doc.addPage();D.pageFoot[doc.getNumberOfPages()]=D.pageFoot[doc.getNumberOfPages()-1]||"";D.head()};
  D.need=h=>{if(D.y+h>D.H-15){D.page();return true}return false};
  D.h2=t=>{D.need(14);D.y+=2;doc.setFont("helvetica","bold");doc.setFontSize(10.5);doc.setTextColor(...ACC);doc.text(txt(t).toUpperCase(),D.M,D.y+4);doc.setDrawColor(...ACC);doc.setLineWidth(.4);doc.line(D.M,D.y+6,D.W-D.M,D.y+6);doc.setTextColor(...DK);D.y+=9};
  D.para=(t,size,style,color)=>{doc.setFont("helvetica",style||"normal");doc.setFontSize(size||9.3);doc.setTextColor(...(color||DK));const L=doc.splitTextToSize(txt(t),D.W-2*D.M);const lh=(size||9.3)*.42;
    for(const l of L){D.need(lh+1);doc.text(l,D.M,D.y+lh);D.y+=lh}D.y+=1.5;doc.setTextColor(...DK)};
  /* tableau : cols=[{t,w,al}], rows=[[cell,…] | {cells,fill,colors,bold}] */
  D.table=(cols,rows,opt)=>{opt=opt||{};const fs=opt.fs||8.6,lh=fs*.41,pad=1.7;const tw=cols.reduce((s,c)=>s+c.w,0);
    const head=()=>{if(opt.noHead)return;doc.setFillColor(...DK);let x=D.M;const h=lh+2*pad;doc.rect(D.M,D.y,tw,h,"F");doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.setFontSize(fs);
      cols.forEach(c=>{doc.text(txt(c.t),c.al==="c"?x+c.w/2:c.al==="r"?x+c.w-pad:x+pad,D.y+pad+lh-.4,{align:c.al==="c"?"center":c.al==="r"?"right":"left"});x+=c.w});D.y+=h;doc.setTextColor(...DK)};
    D.need(lh*3+8);head();
    rows.forEach((row,ri)=>{const isArr=Array.isArray(row),cells=isArr?row:row.cells;doc.setFont("helvetica","normal");doc.setFontSize(fs);
      const L=cells.map((c,i)=>doc.splitTextToSize(txt(c),cols[i].w-2*pad));const h=Math.max(...L.map(l=>l.length))*lh+2*pad;
      if(D.need(h))head();
      let x=D.M;
      if(!isArr&&row.fill){doc.setFillColor(...row.fill);doc.rect(D.M,D.y,tw,h,"F")}else if(ri%2){doc.setFillColor(246,247,248);doc.rect(D.M,D.y,tw,h,"F")}
      cols.forEach((c,i)=>{const col=!isArr&&row.colors&&row.colors[i];if(col){doc.setTextColor(...col);doc.setFont("helvetica","bold")}else{doc.setTextColor(...DK);doc.setFont("helvetica",!isArr&&row.bold&&row.bold[i]?"bold":"normal")}
        L[i].forEach((l,k)=>doc.text(l,c.al==="c"?x+c.w/2:c.al==="r"?x+c.w-pad:x+pad,D.y+pad+lh*(k+1)-.4,{align:c.al==="c"?"center":c.al==="r"?"right":"left"}));x+=c.w});
      doc.setDrawColor(...LN);doc.setLineWidth(.2);doc.line(D.M,D.y+h,D.M+tw,D.y+h);D.y+=h});
    doc.setTextColor(...DK);D.y+=3};
  D.kv=(pairs,lw)=>{lw=lw||30;doc.setFontSize(9);const colW=(D.W-2*D.M)/2;const rowsN=Math.ceil(pairs.length/2);D.need(rowsN*5.3+2);
    pairs.forEach(([k,v],i)=>{const x=D.M+(i%2)*colW,yy=D.y+Math.floor(i/2)*5.3;doc.setFont("helvetica","bold");doc.setTextColor(...GR);doc.text(txt(k),x,yy+4);doc.setFont("helvetica","normal");doc.setTextColor(...DK);
      doc.text(doc.splitTextToSize(txt(v||"-"),colW-lw-2)[0]||"",x+lw,yy+4)});
    D.y+=rowsN*5.3+3};
  /* bandeau du repère de la PAC, en gros sous l'en-tête, sur fond jaune vif : on voit tout de suite de quelle PAC parle le document
     (texte foncé sur jaune : reste lisible une fois imprimé en noir et blanc) */
  D.repere=P=>{const h=13,w=D.W-2*D.M,i=C.pacs.indexOf(P),n=C.pacs.length,droite=[n>1&&i>=0?`PAC ${i+1} sur ${n}`:"",pacModel(P)].filter(Boolean);
    doc.setFillColor(...FLASH);doc.rect(D.M,D.y,w,h,"F");doc.setFillColor(...DK);doc.rect(D.M,D.y,1.8,h,"F");
    doc.setFont("helvetica","bold");doc.setFontSize(7.4);doc.setTextColor(...DK);doc.text(P.repere?"REPÈRE":"PAC SANS REPÈRE",D.M+5,D.y+4.3);
    doc.setFont("helvetica","normal");doc.setFontSize(8.2);doc.setTextColor(...DK);const wd=Math.max(0,...droite.map(t=>doc.getTextWidth(txt(t))));
    droite.forEach((t,k)=>doc.text(txt(t),D.M+w-3,D.y+(droite.length>1?5+k*4.6:7.6),{align:"right"}));
    /* le repère tient sur une ligne : la taille diminue s'il est long */
    const t=txt(P.repere||pacName(P));let fs=17;doc.setFont("helvetica","bold");doc.setFontSize(fs);while(fs>9&&doc.getTextWidth(t)>w-wd-14){fs-=.5;doc.setFontSize(fs)}
    doc.setTextColor(...DK);doc.text(doc.splitTextToSize(t,w-wd-14)[0]||"",D.M+5,D.y+10.6);D.y+=h+3};
  D.photos=(list,maxW,maxH)=>{if(!list||!list.length)return;const gap=3;let x=D.M,rowH=0;
    for(const p of list){const k=Math.min(maxW/p.w,maxH/p.h),w=p.w*k,h=p.h*k;
      if(x+w>D.W-D.M+.1){x=D.M;D.y+=rowH+gap;rowH=0}
      if(D.y+h>D.H-15){D.page();x=D.M;rowH=0}
      try{doc.addImage(p.img,"JPEG",x,D.y,w,h,undefined,"FAST")}catch(e){}
      doc.setDrawColor(...LN);doc.rect(x,D.y,w,h);x+=w+gap;rowH=Math.max(rowH,h)}
    D.y+=rowH+gap};
  D.sigImg=(img,x,y,w,h)=>{if(!img)return;try{const p=doc.getImageProperties(img);const k=Math.min(w/p.width,h/p.height);doc.addImage(img,"PNG",x+(w-p.width*k)/2,y+(h-p.height*k)/2,p.width*k,p.height*k)}catch(e){}};
  D.finish=()=>{const n=doc.getNumberOfPages();for(let i=1;i<=n;i++){doc.setPage(i);doc.setFont("helvetica","normal");doc.setFontSize(7.3);doc.setTextColor(...GR);
      doc.setDrawColor(...LN);doc.setLineWidth(.2);doc.line(D.M,D.H-10,D.W-D.M,D.H-10);
      doc.text(txt(D.pageFoot[i]||""),D.M,D.H-6.5);doc.text(`Page ${i} / ${n}`,D.W-D.M,D.H-6.5,{align:"right"})}
    return doc.output("blob")};
  return D}

/* ----- PV de mise en service ----- */
/* valeur d'un point de contrôle telle qu'elle s'écrit sur le PV (nombres avec la virgule française) */
function valTxt(M,i){let v=M[i.f];if(i.k)return v?VAL[v]:"-";if(v===undefined||v==="")return"-";if(i.n)v=String(v).trim().replace(".",",");return i.u?`${v} ${i.u}`:String(v)}
function drawPV(D,P){const doc=D.doc,E=CFG.ent,T=tech(P.tech),M=P.mes;
  D.logoClient=logoClient();
  D.section("PROCES-VERBAL DE MISE EN SERVICE",`${pacModel(P)} - ${TYPES[P.type]}${P.repere?" - "+P.repere:""}`,E.nom,P.date?"Mise en service du "+fmtDate(P.date):"",
    [E.nom,E.adresse,E.tel,E.siret?"SIRET "+E.siret:""].filter(Boolean).join(" - "));
  D.repere(P);
  D.h2("Client et installation");
  D.kv([["Client",C.clientNom],["Téléphone",C.clientTel],["Adresse",C.clientAdr],["Mail",C.clientMail],["Installation",C.siteAdr||C.clientAdr],["Chantier",C.nom],["Technicien",T?T.nom:""],["Date",fmtDate(P.date)]].filter(([k,v])=>v));
  D.h2("Équipement");
  if(P.type==="aax")syncUI(P);const UI=P.type==="aax"?P.uis:[];
  const rows=[["Marque / gamme",pacModel(P),"Puissance",P.puis?P.puis+" kW":""],
    ["Unité extérieure",P.modUE||"-","N° de série UE",P.serUE||"-"],
    ...(P.type==="aax"?[["Emplacement UE",P.locUE||"-","Unités intérieures",String(UI.length)]]
     :[[isEau(P.type)?"Module hydraulique":"Unité intérieure",P.modUI||"-","N° de série UI",P.serUI||"-"],["Emplacement UE",P.locUE||"-","Emplacement UI",P.locUI||"-"]]),
    ["Fluide",`${P.fluide} (PRG ${P.prg})`,"Charge totale",`${fr(charge(P),3)} kg (usine ${fr(num(P.chargeUsine),3)} + compl. ${fr(num(P.chargeComp),3)})`],
    ["Tonnage",`${fr(teq(P),2)} t éq. CO2`,"Contrôle d'étanchéité",freqTxt(P).replace("Contrôle d'étanchéité ","")]];
  const cellsEq=rows.flatMap(r=>[[r[0],r[1]],[r[2],r[3]]]).filter(([k,v])=>v&&v!=="-");const rowsEq=[];for(let i=0;i<cellsEq.length;i+=2)rowsEq.push([...cellsEq[i],...(cellsEq[i+1]||["",""])]);
  D.table([{t:"",w:32},{t:"",w:59},{t:"",w:32},{t:"",w:59}],rowsEq.map(r=>({cells:r,bold:[1,0,1,0],colors:[GR,null,GR,null]})),{noHead:1,fs:8.4});
  /* multi-split : une ligne par unité intérieure */
  if(UI.some(u=>!uiVide(u))){D.h2("Unités intérieures");D.table([{t:"N°",w:12},{t:"Référence",w:58},{t:"N° de série",w:56},{t:"Emplacement",w:56}],UI.map((u,j)=>({cells:[String(j+1),u.mod||"-",u.ser||"-",u.loc||"-"]})),{fs:8.4})}
  for(const s of SECTIONS){const its=secItems(s,P.type);if(!its.length)continue;
    const filled=its.filter(i=>M[i.f]!==undefined&&M[i.f]!==null&&String(M[i.f]).trim()!=="");if(!filled.length)continue;
    D.h2(s.t);
    const rs=filled.map(i=>{const v=M[i.f];return{cells:[i.l,valTxt(M,i)],colors:[null,v==="ok"?OKC:v==="nc"?BADC:null]}});
    if(s.rel&&isEau(P.type)&&num(M.tdep)&&num(M.tret))rs.push({cells:["Écart départ / retour",fr(num(M.tdep)-num(M.tret),1)+" K"],bold:[0,1]});
    if(s.rel&&isAir(P.type)&&num(M.tsouf)&&num(M.trep))rs.push({cells:["Écart soufflage / reprise",fr(Math.abs(num(M.tsouf)-num(M.trep)),1)+" K"],bold:[0,1]});
    D.table([{t:"Point de contrôle",w:128},{t:"Résultat",w:54}],rs,{fs:8.4})}
  const rads=(M.rads||[]).filter(r=>String(r.lieu||"").trim()||String(r.t||"").trim());
  if(isEau(P.type)&&rads.length){D.h2("Températures des radiateurs");
    D.table([{t:"Emplacement",w:128},{t:"Température",w:54}],rads.map(r=>({cells:[r.lieu||"-",String(r.t||"").trim()?String(r.t).trim()+" °C":"-"]})),{fs:8.4});
    const rph=(M.rads||[]).filter(r=>(r.ph||[]).length);
    if(rph.length){D.h2("Photos des radiateurs");M.rads.forEach((r,j)=>{if(!(r.ph||[]).length)return;D.need(52);D.para(radName(r,j),8.6,"bold",GR);D.photos(r.ph,57,45)})}}
  if(String(M.obs||"").trim()){D.h2("Observations / réserves");D.para(M.obs)}
  for(const [t,fs] of photoGroups(P)){const used=fs.filter(([f])=>(P.photos[f]||[]).length);if(!used.length)continue;
    D.h2("Photos - "+t);for(const [f,l] of used){if(used.length>1||fs.length>1){D.need(52);D.para(l,8.6,"bold",GR)}D.photos(P.photos[f],57,45)}}
  sigBlock(D,[["Le technicien",T?T.nom:"",T?T.qual:"",P.sig.tech],["Le client",P.sig.clientNom||C.clientNom,"Bon pour réception de la mise en service",P.sig.client]],P.date)}
function sigBlock(D,cells,date){const doc=D.doc;D.need(42);D.y+=2;const w=(D.W-2*D.M-6)/2;
  cells.forEach(([t,name,qual,img],i)=>{const x=D.M+i*(w+6);doc.setDrawColor(...LN);doc.setLineWidth(.3);doc.rect(x,D.y,w,38);
    doc.setFont("helvetica","bold");doc.setFontSize(9);doc.setTextColor(...ACC);doc.text(txt(t),x+2.5,D.y+5);doc.setTextColor(...DK);
    doc.setFont("helvetica","normal");doc.setFontSize(8.5);doc.text(txt([name,date?"le "+fmtDate(date):""].filter(Boolean).join(" - ")),x+2.5,D.y+9.5);
    if(qual){doc.setTextColor(...GR);doc.setFontSize(7.6);doc.text(txt(qual),x+2.5,D.y+13.2);doc.setTextColor(...DK)}
    D.sigImg(img,x+3,D.y+14.5,w-6,22)});D.y+=41}

/* ----- Fiche d'intervention Cerfa 15497*04 ----- */
/* Cadre 3 du Cerfa : référence de l'unité extérieure, puis de l'unité intérieure ; multi-split : nombre d'unités et leurs références */
function cerfaRef(P){if(P.type!=="aax")return[P.modUE,P.modUI].filter(Boolean).join(" / ");syncUI(P);
  const r=[...new Set(P.uis.map(u=>String(u.mod||"").trim()).filter(Boolean))];return[P.modUE,`${P.uis.length} UI${r.length?" : "+r.slice(0,2).join(", ")+(r.length>2?"…":""):""}`].filter(Boolean).join(" / ")}
function drawCerfa(D,P){const doc=D.doc,K=P.cerfa,E=CFG.ent,T=tech(P.tech),Dt=det(P.det),t=tranche(P),fam=famOf(P);
  const numF=K.num||autoNum(P),LC=logoClient();
  D.logoClient=null;      // sur le Cerfa, le logo du client va dans le cadre « Détenteur »
  D.section("FICHE D'INTERVENTION - Cerfa n° 15497*04","Opérations nécessitant une manipulation de fluides frigorigènes effectuées sur un équipement","Fiche n° "+numF,"Date : "+fmtDate(P.date),
    "Établie au format du Cerfa n° 15497*04 - à conserver 5 ans par l'opérateur et par le détenteur");
  D.repere(P);
  const M=D.M,W=D.W-2*D.M;
  const cad=(x,w,n,title,h)=>{doc.setDrawColor(...DK);doc.setLineWidth(.35);doc.rect(x,D.y,w,h);doc.setFillColor(...SOFT);doc.rect(x,D.y,w,5.4,"F");doc.line(x,D.y+5.4,x+w,D.y+5.4);
    doc.setFont("helvetica","bold");doc.setFontSize(7.4);const nw=Math.max(4.2,doc.getTextWidth(String(n))+2.6);
    doc.setFillColor(...ACC);doc.roundedRect(x+1.3,D.y+.6,nw,4.2,2.1,2.1,"F");doc.setTextColor(255,255,255);doc.text(String(n),x+1.3+nw/2,D.y+3.75,{align:"center"});
    doc.setTextColor(...DK);doc.setFontSize(8.2);doc.text(txt(title),x+nw+3.2,D.y+3.9);return D.y+5.4};
  const lab=(x,y,l,v,w)=>{doc.setFont("helvetica","normal");doc.setFontSize(7.4);doc.setTextColor(...GR);doc.text(txt(l),x,y);const lw=doc.getTextWidth(txt(l))+1.5;
    doc.setFont("helvetica","bold");doc.setFontSize(8.4);doc.setTextColor(...DK);const s=doc.splitTextToSize(txt(v||""),Math.max(10,w-lw))[0]||"";doc.text(s,x+lw,y);doc.setDrawColor(...LN);doc.setLineWidth(.15);doc.line(x+lw,y+.9,x+w,y+.9)};
  const box=(x,y,on)=>{doc.setDrawColor(...DK);doc.setLineWidth(.3);doc.rect(x,y-2.7,2.9,2.9);if(on){doc.setLineWidth(.55);doc.line(x+.5,y-2.2,x+2.4,y-.3);doc.line(x+2.4,y-2.2,x+.5,y-.3)}};
  const opt=(x,y,on,l)=>{box(x,y,on);doc.setFont("helvetica",on?"bold":"normal");doc.setFontSize(8.2);doc.setTextColor(...DK);doc.text(txt(l),x+4,y);return x+4+doc.getTextWidth(txt(l))+5};
  const half=(W-4)/2;
  /* 1 et 2 */
  let y0=D.y;cad(M,half,1,"Opérateur",31);cad(M+half+4,half,2,"Détenteur",31);
  /* logo du client : à droite dans le cadre 2, les lignes du cadre sont raccourcies d'autant */
  const wl=LC?half-4-27:half-4;
  if(LC){const k=Math.min(23/LC.w,20/LC.h),w=LC.w*k,h=LC.h*k;try{doc.addImage(LC.img,"PNG",M+half+4+half-2-12.5-w/2,y0+5.4+(25.6-h)/2,w,h,"logoClient","FAST")}catch(e){}}
  let y=y0+10;
  lab(M+2,y,"Nom :",E.nom,half-4);lab(M+half+6,y,"Nom :",C.clientNom,wl);y+=5;
  const a1=doc.splitTextToSize(txt(E.adresse||""),half-20),a2=doc.splitTextToSize(txt(C.siteAdr||C.clientAdr||""),wl-16);
  lab(M+2,y,"Adresse :",a1[0]||"",half-4);lab(M+half+6,y,"Adresse :",a2[0]||"",wl);y+=4.6;
  lab(M+2,y,"",a1.slice(1).join(" "),half-4);lab(M+half+6,y,"",a2.slice(1).join(" "),wl);y+=5;
  lab(M+2,y,"SIRET :",E.siret,half-4);lab(M+half+6,y,"SIRET :",C.clientSiret,wl);y+=5;
  lab(M+2,y,"N° d'attestation de capacité :",E.attCap,half-4);
  D.y=y0+33;
  /* 3 */
  y0=D.y;cad(M,W,3,"Identification de l'équipement",16);y=y0+10;
  lab(M+2,y,"Marque :",pacModel(P),70);lab(M+76,y,"Référence :",cerfaRef(P),W-78);y+=5.2;
  lab(M+2,y,"Identifiant / n° de série :",[P.serUE,P.repere].filter(Boolean).join(" - "),70);lab(M+76,y,"Fluide :",P.fluide,30);lab(M+110,y,"Charge totale :",fr(charge(P),3)+" kg",34);lab(M+146,y,"t éq. CO2 :",fam==="HFC"?fr(teq(P),2):"-",W-148);
  D.y=y0+18;
  /* 4 */
  y0=D.y;cad(M,W,4,"Nature de l'intervention",16.5);y=y0+9.6;let x=M+2;
  NATURES.slice(0,4).forEach(([k,l])=>{x=opt(x,y,K.nature===k,l)});y+=5;x=M+2;
  NATURES.slice(4).forEach(([k,l])=>{x=opt(x,y,K.nature===k,l+(k==="autre"&&K.nature==="autre"&&K.natAutre?" : "+K.natAutre:""))});
  D.y=y0+18.5;
  /* 5 et 6 */
  y0=D.y;cad(M,W*0.62,5,"Détecteur manuel de fuite",11);cad(M+W*0.62+4,W*0.38-4,6,"Système de détection permanente",11);y=y0+9.4;
  lab(M+2,y,"Identification :",Dt?[Dt.marque,Dt.modele,Dt.serie?"n° "+Dt.serie:""].filter(Boolean).join(" "):"",W*0.62-46);lab(M+W*0.62-42,y,"Contrôlé le :",Dt?fmtDate(Dt.ctrl):"",40);
  x=M+W*0.62+8;x=opt(x,y,K.detAuto==="oui","Oui");opt(x,y,K.detAuto!=="oui","Non");
  D.y=y0+13;
  /* 7, 8, 9 */
  y0=D.y;cad(M,W,"7-9","Quantité de fluide et fréquence minimale du contrôle d'étanchéité",42);
  {const dt=K.detAuto==="oui",rh=4.6,cw=[50,(W-54)/3,(W-54)/3,(W-54)/3];let yy=y0+7.2;const xs=[M+2];for(let i=1;i<4;i++)xs[i]=xs[i-1]+cw[i-1];
   doc.setFillColor(...DK);doc.rect(M+2,yy,W-4,rh,"F");doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.setFontSize(7.6);
   ["Tranche 1","Tranche 2","Tranche 3"].forEach((h,i)=>doc.text(h,xs[i+1]+cw[i+1]/2,yy+3.2,{align:"center"}));doc.setTextColor(...DK);yy+=rh;
   const rows=[["7. HCFC (kg)","HCFC",["2 <= Q < 30","30 <= Q < 300","Q >= 300"]],["7. HFC / PFC (t éq. CO2)","HFC",["5 <= t < 50","50 <= t < 500","t >= 500"]],["7. HFO (kg)","HFO",["1 <= Q < 10","10 <= Q < 100","Q >= 100"]],
     ["8. Sans détection permanente","f0",["12 mois","6 mois","3 mois"]],["9. Avec détection permanente","f1",["24 mois","12 mois","6 mois"]]];
   rows.forEach(([l,k,c],ri)=>{if(ri%2){doc.setFillColor(246,247,248);doc.rect(M+2,yy,W-4,rh,"F")}
     doc.setFont("helvetica","normal");doc.setFontSize(7.6);doc.setTextColor(...DK);doc.text(txt(l),xs[0]+1.5,yy+3.3);
     c.forEach((v,i)=>{const on=t!==null&&t===i+1&&(k===fam||(k==="f0"&&!dt)||(k==="f1"&&dt));const tw=doc.getTextWidth(txt(v))+4;const cx=xs[i+1]+(cw[i+1]-tw)/2;
       box(cx,yy+3.5,on);doc.setFont("helvetica",on?"bold":"normal");doc.setFontSize(7.6);doc.setTextColor(...(on?ACC:DK));doc.text(txt(v),cx+4,yy+3.3);doc.setTextColor(...DK)});
     doc.setDrawColor(...LN);doc.setLineWidth(.15);doc.line(M+2,yy+rh,M+W-2,yy+rh);yy+=rh});
   doc.setFont("helvetica","italic");doc.setFontSize(7.4);doc.setTextColor(...GR);doc.text(txt(t===0||t===null?freqTxt(P)+".":`${freqTxt(P)} (${fam}${P.scelle?", équipement hermétiquement scellé":""}).`),M+2,yy+3.9);doc.setTextColor(...DK)}
  D.y=y0+44;
  /* 10 */
  y0=D.y;cad(M,W,10,"Fuites constatées lors du contrôle d'étanchéité",11);y=y0+9.4;x=M+2;
  x=opt(x,y,K.fuite!=="oui","Non");x=opt(x,y,K.fuite==="oui","Oui");
  lab(x,y,"Localisation :",K.fuite==="oui"?K.fuiteLoc:"",62);x+=66;doc.setFont("helvetica","normal");doc.setFontSize(7.4);doc.setTextColor(...GR);doc.text("Réparation :",x,y);x+=16;
  x=opt(x,y,K.fuite==="oui"&&K.fuiteRep==="realisee","Réalisée");opt(x,y,K.fuite==="oui"&&K.fuiteRep==="afaire","À faire");
  D.y=y0+13;
  /* 11 */
  const A=num(chargedAuto(P)),B=num(K.B),Cc=num(K.C),Dd=num(K.D),Ee=num(K.E);const kg=v=>v?fr(v,3)+" kg":"0 kg";
  y0=D.y;cad(M,W,11,"Manipulation du fluide frigorigène",22);y=y0+9.6;
  lab(M+2,y,"Quantité chargée totale (A+B+C) :",kg(A+B+Cc),W/2-4);lab(M+W/2+2,y,"Quantité récupérée totale (D+E) :",kg(Dd+Ee),W/2-4);y+=5;
  lab(M+2,y,"A - vierge :",kg(A),28);lab(M+32,y,"B - recyclé :",kg(B),28);lab(M+62,y,"C - régénéré :",kg(Cc),28);
  lab(M+W/2+2,y,"D - pour traitement :",kg(Dd),43);lab(M+W/2+47,y,"E - réutilisation :",kg(Ee),W/2-49);y+=5;
  lab(M+2,y,"Identification du ou des contenants :",K.contenant,W-4);
  D.y=y0+24;
  /* 12 et 13 */
  const rec=Dd+Ee>0;
  y0=D.y;cad(M,W,"12-13","Déchet de fluide et installation de destination",16);y=y0+9.6;
  lab(M+2,y,"Dénomination ADR/RID :",rec?(K.adr||(FLUIDES[P.fluide]||{}).adr):"",W*0.62);lab(M+W*0.62+4,y,"Code déchet :",rec?(K.dechet||"14 06 01*"):"",W*0.38-6);y+=5;
  lab(M+2,y,"Installation prévue :",rec?[K.destNom,K.destAdr].filter(Boolean).join(", "):"",W*0.5);lab(M+W*0.5+3,y,"SIRET :",rec?K.destSiret:"",W*0.24);lab(M+W*0.76+3,y,"BSFF :",rec?K.bsff:"",W*0.24-5);
  D.y=y0+18;
  /* 14 */
  const obs=doc.splitTextToSize(txt(K.obs||""),W-4).slice(0,3);
  y0=D.y;cad(M,W,14,"Observations",8+Math.max(1,obs.length)*3.8);doc.setFont("helvetica","normal");doc.setFontSize(8.2);obs.forEach((l,i)=>doc.text(l,M+2,y0+9.4+i*3.8));
  D.y=y0+10+Math.max(1,obs.length)*3.8;
  /* signatures */
  D.need(34);const sw=(W-4)/2;
  [["Opérateur",T?T.nom:"",T?T.qual:"",P.sig.tech],["Détenteur",P.sig.clientNom||C.clientNom,P.sig.clientQual||"",P.sig.client]].forEach(([tt,nm,q,img],i)=>{const xx=M+i*(sw+4);
    doc.setDrawColor(...DK);doc.setLineWidth(.35);doc.rect(xx,D.y,sw,31);doc.setFillColor(...SOFT);doc.rect(xx,D.y,sw,5.4,"F");doc.line(xx,D.y+5.4,xx+sw,D.y+5.4);
    doc.setFont("helvetica","bold");doc.setFontSize(8.2);doc.text(txt("Signature de l'"+tt.toLowerCase()),xx+2,D.y+3.9);
    lab(xx+2,D.y+9.6,"Nom :",nm,sw*0.6-3);lab(xx+sw*0.6,D.y+9.6,"Date :",fmtDate(P.date),sw*0.4-2);lab(xx+2,D.y+14.4,"Qualité :",q,sw-4);
    D.sigImg(img,xx+3,D.y+16,sw-6,14)});
  D.y+=33}

function buildDossier(pacs){const D=newDoc();for(const P of pacs||C.pacs){drawPV(D,P);if(P.cerfaOn)drawCerfa(D,P)}return D.finish()}

/* ---------------- Exemple ---------------- */
function samplePlate(title,lines){const w=900,h=560,c=document.createElement("canvas");c.width=w;c.height=h;const x=c.getContext("2d");
  x.fillStyle="#8d9399";x.fillRect(0,0,w,h);x.fillStyle="#f2f2ee";x.fillRect(60,50,w-120,h-100);x.fillStyle="#1d6fa5";x.fillRect(60,50,w-120,70);
  x.fillStyle="#fff";x.font="bold 40px sans-serif";x.fillText(title,85,100);x.fillStyle="#222";x.font="28px monospace";lines.forEach((l,i)=>x.fillText(l,85,170+i*44));
  return{id:uid(),img:c.toDataURL("image/jpeg",.8),w,h}}
function sampleSig(seed){const c=document.createElement("canvas");c.width=420;c.height=130;const x=c.getContext("2d");x.strokeStyle="#0b2340";x.lineWidth=3;x.lineCap="round";x.beginPath();
  let px=20,py=80;x.moveTo(px,py);for(let i=0;i<34;i++){px+=11;py=70+Math.sin(i*seed)*30+Math.cos(i*1.7)*12;x.lineTo(px,py)}x.stroke();return c.toDataURL("image/png")}
function sample(){
  const c={...blankChantier(),exemple:true,nom:"Lotissement Les Prés",clientNom:"M. et Mme Martin",clientAdr:"8 rue des Prés, 62450 Bapaume",clientTel:"06 12 34 56 78",clientMail:"martin.exemple@mail.fr",notes:"Exemple : deux PAC mises en service le même jour."};
  const P1=blankPac();Object.assign(P1,{repere:"Maison lot 4",type:"aes",marque:"Atlantic",gamme:"Alféa Extensa Duo",modUE:"AWZ 8 R32",serUE:"2408-55123",modUI:"MOD HYD DUO 8",serUI:"2409-77810",puis:"8",fluide:"R32",prg:675,chargeUsine:"1.4",chargeComp:"0.3",locUE:"Façade nord, sur plots",locUI:"Cellier",date:today()});
  P1.mes.rads=[{id:uid(),lieu:"Séjour",t:"36"},{id:uid(),lieu:"Chambre 1",t:"34"},{id:uid(),lieu:"Salle de bain",t:"37"}];Object.assign(P1.mes,{uePose:"ok",uiPose:"ok",tension:"232",disj:"32 A courbe C",section:"3G6 mm²",tensionUI:"231",disjUI:"2 A courbe C",sectionUI:"3G1,5 mm²",appPuis:"6",appTension:"400 V tri",appDisj:"16 A courbe C",appSection:"5G2,5 mm²",terre:"ok",bus:"ok",long:"12",diam:"1/4\" - 5/8\"",raccords:"ok",azote:"40",azoteH:"24",vide:"1",videH:"2",videTenue:"ok",vannes:"ok",etanch:"ok",
    rincage:"ok",filtre:"ok",traitEau:"ok",traitProd:"Inhibiteur de corrosion 1 L",pression:"1.5",purge:"ok",vase:"1",glycol:"0",soupape:"ok",ecs:"ok",appoint:"ok",mode:"Chaud",text:"7",hp:"26.5",bp:"8.2",tref:"68",sc:"5",sr:"4",tdep:"38",tret:"33",debit:"22,5",intens:"9.4",
    loi:"pente 0,5 / décalage 0",tdepMax:"45",consigne:"20",consEcs:"52",sonde:"ok",connect:"ok",antileg:"ok",expli:"ok",notice:"ok",garantie:"ok",entretien:"ok",obs:"Installation conforme. Client informé du réglage de la loi d'eau."});
  P1.photos.plaqUE=[samplePlate("UNITE EXTERIEURE",["Modele : AWZ 8 R32","N serie : 2408-55123","Fluide : R32  1,40 kg","PS HP 42 bar  BP 23 bar"])];
  P1.photos.plaqUI=[samplePlate("MODULE HYDRAULIQUE",["Modele : MOD HYD DUO 8","N serie : 2409-77810","Appoint : 6 kW 400 V"])];
  P1.sig.tech=sampleSig(.9);P1.sig.client=sampleSig(1.6);P1.sig.clientNom="M. Martin";P1.cerfa.contenant="Bouteille R32 n° 51-88214";
  const P2=blankPac();Object.assign(P2,{repere:"Séjour",type:"aam",marque:"Atlantic",gamme:"Takao",modUE:"AOY 35 R32",serUE:"",modUI:"ASY 35",fluide:"R32",prg:675,chargeUsine:"0.75",chargeComp:"",locUE:"Terrasse",locUI:"Séjour",date:today()});
  Object.assign(P2.mes,{uePose:"ok",uiPose:"ok",terre:"ok",bus:"ok",long:"6",raccords:"ok",vide:"1",videH:"1",videTenue:"ok"});
  c.pacs=[P1,P2];return c}

/* ---------------- Version web (iPhone, navigateur) ---------------- */
const IOS=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
const INSTALLEE=!!(navigator.standalone||(window.matchMedia&&matchMedia("(display-mode: standalone)").matches));
let invite=null;
const VERSION_WEB="1"; /* à changer quand les fichiers du lecteur de texte changent : il est alors rechargé une fois à l'avance */
function reglage(k){try{return localStorage.getItem(k)}catch(e){return null}}
function regler(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function webDemarrer(){if(NATIVE)return;
  /* lecteur de texte de la page : mis en service si ses fichiers sont livrés avec le site */
  if(window.LecteurWeb)LecteurWeb.verifier().then(ok=>{if(!ok)return;LECT_WEB=true;
    if(navigator.onLine&&reglage("mes-lecteur")!==VERSION_WEB){const go=()=>LecteurWeb.prechauffer().then(()=>regler("mes-lecteur",VERSION_WEB));
      ("requestIdleCallback" in window)?requestIdleCallback(()=>setTimeout(go,4000)):setTimeout(go,6000)}OCR=!!window.Plaque;OCR_E=!!window.Ecran;if(!SH&&$("viewer").hidden&&!document.activeElement.matches("input,textarea,select"))redessiner()}).catch(()=>{});
  if(location.protocol!=="https:")return; /* version PC, servie en local : rien de plus */
  if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{}); /* fonctionnement sans réseau */
  if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{}); /* demande au téléphone de ne pas effacer les chantiers */
  window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();invite=e;if(V.v==="home")render()})}

/* Codes d'accès de la version en ligne : un code par personne, créé par Manaen depuis ses Réglages.
   - CODES_WEB : le code de Manaen, toujours valable ;
   - codes.json : les autres codes, publiés avec le site (fabriqué à la mise en ligne à partir du dossier codes/ du dépôt public).
   Seules les empreintes sont publiées (SHA-256 de « mespac: » suivi du code), jamais les codes ni les noms.
   Demandé une fois par téléphone, puis revérifié à chaque ouverture avec réseau : un code retiré ferme l'appli à cette personne
   (ses chantiers restent sur son téléphone). Ni l'appli Android ni la version PC ne demandent de code. */
const MAIL_CODES="manaenpro@gmail.com"; /* les demandes de code arrivent à cette adresse */
const SITE_WEB="https://manaen46.github.io/mise-en-service-pac-web/",DEPOT_WEB="https://github.com/manaen46/mise-en-service-pac-web";
const CODES_WEB=[
  "d2a0d9eecff8aeacf51d5d800f73a35ebe28ea0779fdb1d880cdda04b2af3732",
];
async function empreinte(t){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode("mespac:"+t));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}
/* liste publiée avec le site ; null si elle n'a pas pu être lue (hors réseau, première ouverture) */
async function codesPublies(){try{const r=await fetch("codes.json",{cache:"no-cache"});if(!r.ok)return null;const j=await r.json();
  return Array.isArray(j)?j.filter(h=>typeof h==="string"&&/^[0-9a-f]{64}$/.test(h)):null}catch(e){return null}}
async function acces(){if(NATIVE||location.protocol!=="https:"||!(window.crypto&&crypto.subtle))return;
  const pub=await codesPublies(),liste=[...CODES_WEB,...(pub||[])],moi=reglage("mes-acces");
  /* déjà entré : valable s'il est toujours dans la liste, ou si la liste n'a pas pu être lue (hors réseau) */
  if(moi&&(liste.includes(moi)||(pub===null&&/^[0-9a-f]{64}$/.test(moi))))return;
  const retire=!!moi;
  return new Promise(ok=>{const d=document.createElement("div");d.className="verrou";
    d.innerHTML=`<form class="box"><div class="brand">Mise en Service <span>PAC</span></div><label class="f"><span class="label">Code d'accès</span>
      <input type="password" inputmode="numeric" autocomplete="current-password" id="codeAcces" required></label><span class="hint" id="codeMsg">${retire?"Ton code n'est plus valable. Demande un nouveau code à Manaen : tes chantiers sont toujours sur ce téléphone.":"Demande ton code à Manaen."}</span>
      <button class="btn primary" type="submit">Ouvrir</button>
      <div class="demande"><span class="label">Pas encore de code ?</span>
      <label class="f"><span class="hint">Ton nom et ton entreprise</span><input type="text" id="codeNom" autocomplete="name" placeholder="Ex. : Jean Dupont, Clim Services"></label>
      <button class="btn" type="button" id="codeDemande">Demander un code par mail</button></div></form>`;
    document.body.appendChild(d);const f=d.querySelector("form"),i=d.querySelector("input"),m=d.querySelector("#codeMsg");setTimeout(()=>i.focus(),50);let essais=0;
    d.querySelector("#codeDemande").onclick=()=>{const n=d.querySelector("#codeNom"),nom=n.value.trim();if(!nom){m.textContent="Écris d'abord ton nom.";m.style.color="var(--bad)";n.focus();return}
      const corps=`Bonjour,\n\nJe suis ${nom}. Je voudrais un code d'accès pour l'appli Mise en Service PAC.\n\nMerci.`;
      location.href="mailto:"+MAIL_CODES+"?subject="+encodeURIComponent("Demande de code - Mise en Service PAC - "+nom)+"&body="+encodeURIComponent(corps);
      m.textContent="Envoie le mail qui s'ouvre. Tu recevras ton code en réponse.";m.style.color=""};
    f.onsubmit=async e=>{e.preventDefault();const h=await empreinte(i.value.trim());let L=liste;
      if(!CODES_WEB.includes(h)&&!(pub||[]).includes(h)){const p2=await codesPublies();if(p2)L=[...CODES_WEB,...p2]; /* code tout juste créé */
        else if(pub===null){m.textContent="Pas de réseau : la première ouverture en demande. Réessaie avec du réseau.";m.style.color="var(--bad)";return}}
      if(L.includes(h)){regler("mes-acces",h);d.remove();ok();return}
      essais++;i.value="";m.textContent="Code incorrect.";m.style.color="var(--bad)";if(essais>=3){f.querySelector("button").disabled=true;setTimeout(()=>f.querySelector("button").disabled=false,essais*3000)}}})}

/* Réglages de Manaen : créer et retirer les codes. Le code et le nom restent sur son téléphone (CFG.codes) ;
   seule l'empreinte est publiée, en ajoutant un fichier codes/xxxxxxxx.txt au dépôt public (GitHub ouvre la page d'ajout déjà remplie). */
const estManaen=()=>!!NATIVE||reglage("mes-acces")===CODES_WEB[0];
const fichierCode=c=>"codes/"+c.h.slice(0,12)+".txt";
const lienAjout=c=>DEPOT_WEB+"/new/main?filename="+encodeURIComponent(fichierCode(c))+"&value="+encodeURIComponent(c.h+"\n");
const lienFichier=c=>DEPOT_WEB+"/blob/main/"+fichierCode(c);
function mailCode(c){const corps=`Bonjour,\n\nVoici ton code d'accès à l'appli Mise en Service PAC : ${c.code}\n\nAdresse de l'appli : ${SITE_WEB}\nSur iPhone : ouvre l'adresse dans Safari, touche Partager puis « Sur l'écran d'accueil ».\nSur Android : ouvre l'adresse dans Chrome, puis menu ⋮ et « Installer l'application ».\n\nLe code est personnel, merci de ne pas le transmettre.`;
  return"mailto:"+(c.mail?encodeURIComponent(c.mail):"")+"?subject="+encodeURIComponent("Ton code - Mise en Service PAC")+"&body="+encodeURIComponent(corps)}
function codesBox(){if(!estManaen())return"";const L=CFG.codes||[],ext=NATIVE?"":` target="_blank" rel="noopener"`;
  return`<h2 class="sec">Codes d'accès (version en ligne) <span class="n">${L.filter(c=>!c.retire).length||""}</span></h2>
  <div class="box"><span class="hint">Pour donner l'appli en ligne à quelqu'un : crée son code, active-le sur GitHub (une page déjà remplie s'ouvre, touche « Commit changes »), puis envoie-le-lui. Il marche 2 minutes après l'activation.</span>
   <div class="grid2">${fld({id:"nc",v:codeNom},"v","Nom de la personne","text",{full:1,ph:"Ex. : Jean Dupont"})}${fld({id:"nm",v:codeMail},"v","Son mail (facultatif)","email",{full:1,ph:"Pour lui envoyer le code"})}</div>
   <button class="btn primary" type="button" data-act="codeCreer">Créer un code</button>
   ${L.map(c=>`<div class="codeli${c.retire?" retire":""}"><div class="m"><b>${esc(c.nom)}</b><span class="code">${c.retire?"retiré":esc(c.code)}</span><span class="hint">Créé le ${fmtDate(c.date)}${c.retire?` · retiré le ${fmtDate(c.retire)}`:""}</span></div>
     ${c.retire?`<div class="actions"><a class="btn sm" href="${lienFichier(c)}"${ext}>Vérifier sur GitHub qu'il est supprimé</a><button class="btn sm" type="button" data-act="codeOubli" data-id="${c.id}">Effacer de la liste</button></div>`
      :`<div class="actions"><a class="btn sm primary" href="${lienAjout(c)}"${ext}>1. Activer sur GitHub</a><a class="btn sm" href="${mailCode(c)}">2. Envoyer par mail</a>
       ${confirmDel===c.id?`<span class="hint">Sur GitHub, supprime le fichier qui s'ouvre (menu ⋯ puis « Delete file », puis « Commit changes »).</span><a class="btn sm danger" href="${lienFichier(c)}"${ext} data-act="codeRetire" data-id="${c.id}">Ouvrir GitHub et retirer</a><button class="btn sm" type="button" data-act="cancelDel">Annuler</button>`
        :`<button class="btn sm danger" type="button" data-act="codeRetirer" data-id="${c.id}">Retirer</button>`}</div>`}</div>`).join("")}
  </div>`}
let codeNom="",codeMail="";
document.addEventListener("input",e=>{const t=e.target;if(!t.dataset)return;if(t.dataset.id==="nc")codeNom=t.value;else if(t.dataset.id==="nm")codeMail=t.value});
async function codeCreer(){const nom=codeNom.trim();if(!nom){toast("Écris d'abord le nom de la personne.");return}
  const L=CFG.codes=CFG.codes||[];let code,h;
  do{const a=new Uint32Array(1);crypto.getRandomValues(a);code=String(100000+a[0]%900000);h=await empreinte(code)}while(CODES_WEB.includes(h)||L.some(c=>c.h===h));
  L.unshift({id:uid(),nom,mail:codeMail.trim(),code,h,date:today(),retire:""});codeNom="";codeMail="";saveCfg();redessiner();toast(`Code de ${nom} : ${code}. Active-le sur GitHub.`,5000)}

/* ---------------- Démarrage ---------------- */
(async()=>{await acces();CFG=Object.assign(blankCfg(),(await kvGet("cfg"))||{});INDEX=(await kvGet("index"))||[];render();webDemarrer()})();
