"use strict";
/* =====================================================================
   Lecture d'un afficheur à segments (chiffres « à bâtonnets » des
   thermomètres infrarouges ou de contact), que le lecteur de texte du
   téléphone ne sait pas lire.
   Entrée : les points de la photo (rouge, vert, bleu, alpha), réduite à
   900 points de côté environ. Sortie : le nombre affiché en plus gros.
   Aucun accès à la page : testé seul (tests/afficheur-test.mjs).
   ===================================================================== */
(function(root){
/* segments allumés → chiffre. Ordre des bits : a (haut), b (haut droite), c (bas droite), d (bas), e (bas gauche), f (haut gauche), g (milieu) */
const CHIFFRES={"1111110":"0","0110000":"1","1101101":"2","1111001":"3","0110011":"4","1011011":"5","1011111":"6","0011111":"6","1110000":"7","1110010":"7","1111111":"8","1111011":"9","1110011":"9"};

function clarte(img){const N=img.width*img.height,d=img.data,lum=new Float32Array(N);
  for(let i=0,j=0;i<N;i++,j+=4)lum[i]=.299*d[j]+.587*d[j+1]+.114*d[j+2];return lum}
/* photo tournée de « angle » degrés autour de son centre (thermomètre tenu de travers) */
function tourner(lum,W,H,angle){if(!angle)return lum;const o=new Float32Array(W*H),a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),cx=(W-1)/2,cy=(H-1)/2;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const dx=x-cx,dy=y-cy,sx=Math.min(W-1,Math.max(0,Math.round(cx+dx*c-dy*s))),sy=Math.min(H-1,Math.max(0,Math.round(cy+dx*s+dy*c)));o[y*W+x]=lum[sy*W+sx]}
  return o}
function sombres(lum,W,H){const N=W*H;
  /* comparaison de chaque point à la moyenne de son voisinage : les segments sont nettement plus sombres que le fond de l'afficheur */
  const S=somme(lum,W,H),r=Math.max(8,Math.round(Math.max(W,H)/14)),m=new Uint8Array(N);
  for(let y=0;y<H;y++){const y0=Math.max(0,y-r),y1=Math.min(H,y+r+1);
    for(let x=0;x<W;x++){const x0=Math.max(0,x-r),x1=Math.min(W,x+r+1),moy=(S[y1*(W+1)+x1]-S[y0*(W+1)+x1]-S[y1*(W+1)+x0]+S[y0*(W+1)+x0])/((x1-x0)*(y1-y0)),v=lum[y*W+x];
      if(v<moy*.72&&moy-v>28)m[y*W+x]=1}}
  return m}
function somme(a,W,H){const S=new Float64Array((W+1)*(H+1));
  for(let y=0;y<H;y++){let l=0;for(let x=0;x<W;x++){l+=a[y*W+x];S[(y+1)*(W+1)+x+1]=S[y*(W+1)+x+1]+l}}return S}
/* épaissit les points sombres de r points : les segments d'un même chiffre se rejoignent */
function epaissir(m,W,H,r){if(!r)return m;const S=somme(m,W,H),o=new Uint8Array(W*H);
  for(let y=0;y<H;y++){const y0=Math.max(0,y-r),y1=Math.min(H,y+r+1);
    for(let x=0;x<W;x++){const x0=Math.max(0,x-r),x1=Math.min(W,x+r+1);if(S[y1*(W+1)+x1]-S[y0*(W+1)+x1]-S[y1*(W+1)+x0]+S[y0*(W+1)+x0]>0)o[y*W+x]=1}}
  return o}
/* taches : rectangle englobant et nombre de points */
function taches(m,W,H){const vu=new Uint8Array(W*H),T=[],pile=new Int32Array(W*H);
  for(let i0=0;i0<W*H;i0++){if(!m[i0]||vu[i0])continue;let n=0,p=0,x0=W,x1=0,y0=H,y1=0;pile[p++]=i0;vu[i0]=1;
    while(p){const i=pile[--p],x=i%W,y=(i-x)/W;n++;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
      if(x>0&&m[i-1]&&!vu[i-1]){vu[i-1]=1;pile[p++]=i-1}if(x<W-1&&m[i+1]&&!vu[i+1]){vu[i+1]=1;pile[p++]=i+1}
      if(y>0&&m[i-W]&&!vu[i-W]){vu[i-W]=1;pile[p++]=i-W}if(y<H-1&&m[i+W]&&!vu[i+W]){vu[i+W]=1;pile[p++]=i+W}}
    T.push({x0,y0,x1,y1,w:x1-x0+1,h:y1-y0+1,n})}
  return T}

/* Chiffre dessiné dans le rectangle b ; null si ce n'est pas un chiffre à segments.
   m : points sombres, sans les points décimaux. k : pente des chiffres (souvent penchés d'une dizaine de degrés) ; on lit le chiffre « redressé ». */
function chiffre(m,W,b,k){const h=b.h;let u0=1e9,u1=-1e9;
  /* largeur du chiffre redressé ; le bas à droite est ignoré : le point décimal y est parfois collé au chiffre */
  for(let y=b.y0;y<=b.y1;y++){const d=k*(b.y1-y);let xa=-1,xb=-1;for(let x=b.x0;x<=b.x1;x++)if(m[y*W+x]){if(xa<0)xa=x;xb=x}
    if(xa>=0){if(xa-d<u0)u0=xa-d;if(xb-d>u1&&y<=b.y0+h*.85)u1=xb-d}}
  if(u1<u0)return null;const w=u1-u0+1;
  /* point (u, v) du chiffre redressé : sombre ou non */
  const pt=(u,v)=>{const y=b.y0+v,x=Math.round(u0+u+k*(b.y1-y));return x>=0&&x<W&&m[y*W+x]===1};
  const U=f=>Math.min(w-1,Math.max(0,Math.round(f*(w-1)))),V=f=>Math.min(h-1,Math.max(0,Math.round(f*(h-1))));
  const lig=(va,vb,ua,ub)=>{let n=0,t=0;for(let v=V(va);v<=V(vb);v++){t++;for(let u=U(ua);u<=U(ub);u++)if(pt(u,v)){n++;break}}return n/t};      /* part des lignes touchées */
  const col=(ua,ub,va,vb)=>{let n=0,t=0;for(let u=U(ua);u<=U(ub);u++){t++;for(let v=V(va);v<=V(vb);v++)if(pt(u,v)){n++;break}}return n/t};      /* part des colonnes touchées */
  const pos={ux0:u0,ux1:u1};
  if(w/h<.38){if(!(lig(.06,.44,0,1)>.8&&lig(.56,.94,0,1)>.8))return null;
    /* un vrai « 1 » n'a rien à sa gauche dans sa case : sinon c'est un 3, un 7 ou un 9 dont les barres horizontales se sont détachées */
    let n=0,t=0;for(let u=-Math.round(h*.36);u<=-Math.round(h*.07);u++){t++;for(let v=0;v<h;v++)if(pt(u,v)){n++;break}}
    return t&&n/t>.3?null:{c:"1",s:1,...pos}}
  if(w/h>.9)return null;
  const v=[col(.36,.64,0,.17),lig(.2,.4,.64,1),lig(.6,.8,.64,1),col(.36,.64,.83,1),lig(.6,.8,0,.36),lig(.2,.4,0,.36),col(.36,.64,.41,.59)];
  /* chaque segment doit être franchement allumé ou franchement éteint */
  let cle="",net=1;for(const f of v){cle+=f>=.5?"1":"0";net=Math.min(net,Math.abs(f-.5)*2)}
  const c=CHIFFRES[cle];if(!c||net<.45)return null;
  /* le centre des deux « fenêtres » d'un chiffre à segments est vide */
  if(col(.42,.58,.24,.36)>.5&&col(.42,.58,.64,.76)>.5)return null;
  return{c,s:net,...pos}}

/* Les nombres à segments de la photo, du plus gros au plus petit : [{txt : chiffres lus, v : valeur, h : hauteur, s : netteté des segments}].
   angle : photo tournée de tant de degrés avant lecture ; inverse : afficheur « négatif ». */
function nombres(img,angle,inverse){const W=img.width,H=img.height,M=Math.max(W,H),vus=new Map();
  let lum=tourner(img.lum||(img.lum=clarte(img)),W,H,angle||0);
  /* afficheur « négatif » : chiffres clairs sur fond sombre */
  if(inverse){const o=new Float32Array(W*H);for(let i=0;i<o.length;i++)o[i]=255-lum[i];lum=o}
  const base=sombres(lum,W,H),tous=[];
  /* points décimaux possibles : petites taches à peu près carrées et pleines */
  const petits=taches(base,W,H).filter(t=>t.w>=2&&t.h>=2&&t.w<=M*.05&&t.h<=M*.05&&t.w/t.h>.6&&t.w/t.h<1.67&&t.n/(t.w*t.h)>.6);
  const sansPts=base.slice();for(const t of petits)for(let y=t.y0;y<=t.y1;y++)for(let x=t.x0;x<=t.x1;x++)sansPts[y*W+x]=0;
  /* les segments d'un chiffre sont séparés par de fins espaces : on épaissit les points sombres, de plus en plus, pour les réunir */
  for(const r of [1,2,3,4,6,8]){
    const B=[];
    for(const t of taches(epaissir(sansPts,W,H,r),W,H)){const b={x0:t.x0+r,y0:t.y0+r,x1:t.x1-r,y1:t.y1-r};b.w=b.x1-b.x0+1;b.h=b.y1-b.y0+1;
      if(b.h<Math.max(20,M*.022)||b.h>H*.7||b.w<2||b.w>b.h*1.2||b.x0<1||b.y0<1||b.x1>W-2||b.y1>H-2)continue;B.push(b);tous.push(b)}
    /* chiffres droits, un peu penchés, penchés */
    for(const k of [0,.09,.18]){
      const C=[];for(const b of B){const c=chiffre(sansPts,W,b,k);if(c)C.push({...b,...c})}
      /* chiffres voisins de même taille, alignés et régulièrement espacés : un nombre */
      C.sort((a,b)=>a.ux0-b.ux0);const pris=new Set();
      for(let i=0;i<C.length;i++){if(pris.has(i))continue;const G=[C[i]];pris.add(i);
        for(let j=i+1;j<C.length;j++){if(pris.has(j))continue;const a=G[G.length-1],b=C[j],h=Math.max(a.h,b.h),ecart=b.ux0-a.ux1;
          if(Math.abs(a.h-b.h)<=h*(a.c==="1"||b.c==="1"?.3:.2)&&Math.abs(a.y1-b.y1)<=h*.2&&ecart>=h*.02&&ecart<=h*(b.c==="1"?.9:.42)){G.push(b);pris.add(j)}}
        if(G.length<2||G.length>4||G.every(g=>g.c==="1"))continue;
        /* les chiffres d'un même nombre ont la même largeur (sauf le 1) : sinon deux chiffres collés ont été pris pour un seul */
        const lg=G.filter(g=>g.c!=="1").map(g=>g.ux1-g.ux0+1);if(Math.max(...lg)>Math.min(...lg)*1.45)continue;
        const h=G.reduce((s,g)=>s+g.h,0)/G.length,bas=G.reduce((s,g)=>s+g.y1,0)/G.length;let txt="";
        G.forEach((g,k)=>{txt+=g.c;const n=G[k+1];if(!n||txt.includes("."))return;
          /* point décimal : petite tache posée sur la ligne de base, entre deux chiffres */
          if(petits.some(p=>{const cx=(p.x0+p.x1)/2,cy=(p.y0+p.y1)/2;return p.h<=h*.28&&p.h>=h*.04&&cx>g.ux1-h*.04&&cx<n.ux0+h*.12&&cy>bas-h*.22&&cy<bas+h*.1}))txt+="."});
        /* une tache sombre haute juste à gauche du premier chiffre : un chiffre n'a pas été reconnu, le nombre serait faux */
        const g0=G[0],hm=Math.max(...G.map(g=>g.h)),top=Math.min(...G.map(g=>g.y0)),xa=Math.max(0,Math.round(g0.ux0-hm*(g0.c==="1"?1.05:.7))),xb=Math.round(g0.ux0-hm*.06-k*hm);let plein=0;
        /* une colonne sombre qui dépasse au-dessus ou en dessous des chiffres est le bord de l'afficheur, pas un chiffre */
        const ya=Math.max(0,Math.round(top-hm*.14)),yb=Math.min(H-1,Math.round(bas+hm*.14)),haut=(x,seuil)=>{if(sansPts[ya*W+x]||sansPts[yb*W+x])return false;let n=0;for(let y=top;y<=Math.round(bas);y++)if(sansPts[y*W+x])n++;return n>seuil};
        for(let x=xa;x<=xb;x++)if(haut(x,hm*.3))plein++;
        if(plein>=Math.max(2,hm*.05))continue;
        /* même chose à droite du dernier chiffre (un « °C » plus petit que les chiffres ne compte pas) */
        const gN=G[G.length-1];plein=0;
        for(let x=Math.round(gN.ux1+hm*.08+k*hm);x<=Math.min(W-1,Math.round(gN.ux1+hm*.75));x++)if(haut(x,hm*.38))plein++;
        if(plein>=Math.max(2,hm*.05))continue;
        const cle=G.map(g=>g.x0+","+g.y0).join("|"),s=G.reduce((s,g)=>Math.min(s,g.s),1);
        if(!vus.has(cle)||vus.get(cle).s<s)vus.set(cle,{txt,v:parseFloat(txt),h,s,nb:G.length,x:G[0].x0,y:top,x1:G[G.length-1].x1,y1:bas})}}}
  /* un même nombre trouvé à plusieurs épaisseurs, ou seulement en partie, n'est gardé qu'une fois : la lecture la plus complète gagne */
  const L=[...vus.values()].sort((a,b)=>b.nb-a.nb||b.txt.length-a.txt.length||b.s-a.s),out=[];
  for(const n of L)if(!out.some(o=>n.x>=o.x-o.h*.3&&n.x1<=o.x1+o.h*.3&&Math.abs(o.y1-n.y1)<o.h*.5))out.push(n);
  /* un nombre n'est gardé que s'il n'y a pas, tout près, de formes de chiffres nettement plus grandes et non lues :
     sinon on donnerait la petite ligne « MAX » à la place de la mesure */
  const gardes=[];
  for(const n of out.sort((a,b)=>b.h-a.h)){const cy=(n.y+n.y1)/2;
    const grands=tous.filter(b=>b.h>n.h*1.4&&b.h<n.h*4.5&&b.w>b.h*.12&&b.w<b.h*.85&&Math.abs((b.y0+b.y1)/2-cy)<n.h*4&&b.x1>n.x-n.h*6&&b.x0<n.x1+n.h*6
      /* une grande forme qui recouvre le nombre lui-même n'est que ce nombre collé à la ligne voisine */
      &&(b.x1<n.x||b.x0>n.x1||b.y1<n.y||b.y0>n.y1)
      /* et celles d'un nombre plus grand déjà lu ne comptent pas */
      &&!gardes.some(o=>b.x0<=o.x1&&b.x1>=o.x&&b.y0<=o.y1&&b.y1>=o.y));
    const vus2=[];for(const b of grands)if(!vus2.some(o=>Math.abs(o.x0-b.x0)<b.h*.25&&Math.abs(o.y0-b.y0)<b.h*.25))vus2.push(b);
    if(vus2.length<2)gardes.push(n)}
  return gardes}

/* Température affichée : le plus gros nombre plausible. Sans point décimal lu, « 310 » sur un thermomètre veut dire 31,0.
   essais : [angle, négatif] à tenter ; note : nombre de chiffres lus, puis netteté des segments. */
const ESSAIS=[[0],[7],[-7],[14],[-14],[0,1],[7,1],[-7,1]];
function temperature(img,plage,essais){const [mini,maxi]=plage||[10,99];let best=null;
  /* photo droite d'abord, puis penchée d'un côté et de l'autre, puis afficheur négatif (chiffres clairs sur fond sombre) */
  for(const [a,inv] of essais||ESSAIS){
    if(inv&&best)break;
    for(const n of nombres(img,a,inv)){let v=n.v;if(!n.txt.includes(".")&&n.txt.length>=3&&v>maxi)v=v/10;
      if(!isFinite(v)||v<mini||v>maxi)continue;
      const nb=n.txt.replace(".","").length,note=nb+(n.txt.includes(".")?.5:0)+n.s*.4;
      if(!best||note>best.note)best={v:String(Math.round(v*10)/10).replace(".",","),lu:n.txt,note,angle:a};break}
    /* lecture franche (trois chiffres ou plus avec le point, segments nets) : inutile d'essayer d'autres angles */
    if(best&&best.note>=3.7)break}
  return best||{v:null,lu:"",note:0}}

const api={nombres,temperature,ESSAIS};
if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.Afficheur=api;
})(typeof window!=="undefined"?window:globalThis);
