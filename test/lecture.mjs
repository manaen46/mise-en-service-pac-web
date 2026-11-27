// Essai du lecteur de texte de la page, avec le vrai lecteur (Tesseract) tel qu'il est mis en ligne.
//   node test/lecture.mjs <dossier du site prêt>
// Ouvre le site dans Chrome, lit les photos de test/photos et vérifie quelques cases.
import { chromium } from 'playwright-core';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';

const site = process.argv[2] || '_site';
const types = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.gz': 'application/gzip', '.wasm': 'application/wasm', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = createServer((q, r) => {
  const p = decodeURIComponent(q.url.split('?')[0]); const f = join(site, p === '/' ? 'index.html' : p);
  if (!f.startsWith(site) || !existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream' }); r.end(readFileSync(f));
}).listen(8791);

const chrome = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find(existsSync);
const b = await chromium.launch({ executablePath: chrome });
const p = await b.newPage();
p.on('pageerror', e => console.log('Erreur de la page :', e.message));
await p.goto('http://127.0.0.1:8791/index.html');
await p.waitForFunction(() => window.LecteurWeb && window.Plaque && window.Ecran);
if (!await p.evaluate(() => LecteurWeb.verifier())) { console.log('ÉCHEC : fichiers du lecteur absents'); process.exit(1); }

const essais = [
  ['plaque-atlantic.jpg', 'plaque', { serie: 'E012345', fluide: 'R32', charge: '0,97' }],
  ['plaque-daikin.jpg', 'plaque', { ref: 'RXM35R5V1B', serie: 'J012345', fluide: 'R32' }],
  ['ecran.jpg', 'ecran', { debit: '22', pressEau: '1,4', tdep: '37', tret: '33' }],
];
let ko = 0;
for (const [f, genre, attendu] of essais) {
  const src = 'data:image/jpeg;base64,' + readFileSync(join('test/photos', f)).toString('base64');
  const t0 = Date.now();
  const r = await p.evaluate(async ([src, genre]) => {
    const note = genre === 'ecran' ? r => Object.keys(Ecran.lire(r).vals).length : r => { const x = Plaque.lire(r); return ['ref', 'serie', 'fluide', 'charge', 'marque'].filter(k => x[k]).length };
    const out = await LecteurWeb.lire(src, note, genre === 'ecran');
    return { lignes: out.lines.map(l => l.t), lu: genre === 'ecran' ? Ecran.lire(out).vals : Plaque.lire(out) };
  }, [src, genre]);
  const faux = Object.entries(attendu).filter(([k, v]) => String(r.lu[k] ?? '') !== v);
  console.log(`${faux.length ? 'ÉCHEC' : 'ok'}  ${f}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  console.log('   lu :', JSON.stringify(Object.fromEntries(Object.keys(attendu).map(k => [k, r.lu[k] ?? '']))));
  if (faux.length) { ko++; console.log('   lignes :', JSON.stringify(r.lignes)); }
}
await b.close(); srv.close();
console.log(ko ? `${ko} photo(s) mal lue(s)` : 'tout est bon');
process.exit(ko ? 1 : 0);
