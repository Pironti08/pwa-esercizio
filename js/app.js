// app.js — interfaccia: griglia virtualizzata, selezione, modifica, tastiera, salvataggio, PWA.
//
// VIRTUALIZZAZIONE: il foglio ha 100×100 = 10.000 celle ma nel DOM esistono solo quelle visibili
// (circa 30 righe × 15 colonne) più un piccolo margine. Un contenitore a scorrimento (#viewport)
// contiene un "spacer" grande quanto l'intera griglia, così le barre di scorrimento sono quelle
// vere; a ogni scroll si calcola quali righe/colonne sono visibili, si eliminano le celle uscite
// dall'area e si creano quelle entrate. Le celle sono posizionate in modo assoluto (left/top).

import { ROWS, COLS, colToLetters, cellId, rowOf, colOf, toA1, parseA1, isInGrid } from './coordinates.js';
import { Sheet, XlError, formatValue } from './engine.js';

const STORAGE_KEY = 'mini-foglio.v1';
const OVERSCAN = 3; // righe/colonne extra disegnate fuori dall'area visibile
const $ = (id) => document.getElementById(id);
const viewport = $('viewport'), spacer = $('spacer'), cellsLayer = $('cells'), editor = $('editor');
const colInner = $('colhdr-inner'), rowInner = $('rowhdr-inner');
const fx = $('fx'), namebox = $('namebox'), statusEl = $('status'), perfEl = $('perf');

const sheet = new Sheet();
let CW = 0, CH = 0;                 // dimensioni cella in px (lette dalle variabili CSS, cambiano su mobile)
let selRow = 0, selCol = 0;
let editing = null;                 // null oppure { typing: bool }  (typing = iniziata digitando)
const rendered = new Map();         // id cella -> elemento DOM attualmente nel DOM
let colHdrs = [], rowHdrs = [];

/* ------------------------------------------------------------- layout */

function readMetrics() {
  const s = getComputedStyle(document.documentElement);
  const w = parseFloat(s.getPropertyValue('--cell-w')), h = parseFloat(s.getPropertyValue('--cell-h'));
  if (w === CW && h === CH) return false;
  CW = w; CH = h;
  return true;
}

function layout() { // ricostruisce intestazioni e spacer (all'avvio e se cambiano le dimensioni cella)
  spacer.style.width = COLS * CW + 'px';
  spacer.style.height = ROWS * CH + 'px';
  colInner.style.width = COLS * CW + 'px';
  rowInner.style.height = ROWS * CH + 'px';
  colInner.textContent = ''; rowInner.textContent = '';
  colHdrs = []; rowHdrs = [];
  for (let c = 0; c < COLS; c++) {
    const el = document.createElement('div');
    el.className = 'ch'; el.style.left = c * CW + 'px'; el.textContent = colToLetters(c); el.dataset.i = c;
    colInner.appendChild(el); colHdrs.push(el);
  }
  for (let r = 0; r < ROWS; r++) {
    const el = document.createElement('div');
    el.className = 'rh'; el.style.top = r * CH + 'px'; el.textContent = r + 1; el.dataset.i = r;
    rowInner.appendChild(el); rowHdrs.push(el);
  }
  colHdrs[selCol].classList.add('active'); rowHdrs[selRow].classList.add('active');
  rendered.clear(); cellsLayer.textContent = '';
  syncHeaders(); renderVisible();
}

function syncHeaders() {
  colInner.style.transform = `translateX(${-viewport.scrollLeft}px)`;
  rowInner.style.transform = `translateY(${-viewport.scrollTop}px)`;
}

/* -------------------------------------------------------- virtualizzazione */

function renderVisible() {
  const top = viewport.scrollTop, left = viewport.scrollLeft;
  const r0 = Math.max(0, Math.floor(top / CH) - OVERSCAN);
  const r1 = Math.min(ROWS - 1, Math.ceil((top + viewport.clientHeight) / CH) + OVERSCAN);
  const c0 = Math.max(0, Math.floor(left / CW) - OVERSCAN);
  const c1 = Math.min(COLS - 1, Math.ceil((left + viewport.clientWidth) / CW) + OVERSCAN);

  for (const [id, el] of rendered) { // 1) togli le celle uscite dall'area visibile
    const r = rowOf(id), c = colOf(id);
    if (r < r0 || r > r1 || c < c0 || c > c1) { el.remove(); rendered.delete(id); }
  }
  const frag = document.createDocumentFragment();
  for (let r = r0; r <= r1; r++) { // 2) crea quelle che mancano
    for (let c = c0; c <= c1; c++) {
      const id = cellId(r, c);
      if (rendered.has(id)) continue;
      const el = document.createElement('div');
      el.className = 'cell';
      el.style.left = c * CW + 'px'; el.style.top = r * CH + 'px';
      el.dataset.r = r; el.dataset.c = c;
      el.setAttribute('role', 'gridcell'); el.setAttribute('aria-rowindex', r + 1); el.setAttribute('aria-colindex', c + 1);
      paintCell(el, id);
      markSelection(el, r, c);
      rendered.set(id, el); frag.appendChild(el);
    }
  }
  cellsLayer.appendChild(frag);
}

let raf = 0;
viewport.addEventListener('scroll', () => {
  syncHeaders();                                   // intestazioni subito, senza ritardo
  if (!raf) raf = requestAnimationFrame(() => { raf = 0; renderVisible(); });
}, { passive: true });
new ResizeObserver(() => { if (readMetrics()) layout(); else renderVisible(); }).observe(viewport);

/* --------------------------------------------------------------- disegno */

function paintCell(el, id) {
  const v = sheet.getValue(id);
  el.textContent = formatValue(v);
  el.dataset.t = v instanceof XlError ? 'e' : typeof v === 'number' ? 'n' : typeof v === 'boolean' ? 'b' : 't';
  if (v instanceof XlError) el.title = `${v.code} — ${v.message}`; else el.removeAttribute('title');
}

function markSelection(el, r, c) {
  const sel = r === selRow && c === selCol;
  el.classList.toggle('sel', sel);
  el.classList.toggle('line', !sel && (r === selRow || c === selCol)); // evidenzia riga e colonna correnti
}

function updateInfo() {
  const id = cellId(selRow, selCol), raw = sheet.getRaw(id), v = sheet.getValue(id);
  namebox.value = toA1(selRow, selCol);
  if (document.activeElement !== fx) fx.value = raw;
  const isErr = v instanceof XlError;
  statusEl.classList.toggle('err', isErr);
  statusEl.textContent = isErr ? `${v.code} — ${v.message}` : !raw ? 'Cella vuota' : raw[0] === '=' ? 'Formula' : typeof v === 'number' ? 'Numero' : 'Testo';
}

/* ------------------------------------------------------------- selezione */

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function ensureVisible(r, c) {
  const x = c * CW, y = r * CH, vw = viewport.clientWidth, vh = viewport.clientHeight;
  if (x < viewport.scrollLeft) viewport.scrollLeft = x;
  else if (x + CW > viewport.scrollLeft + vw) viewport.scrollLeft = x + CW - vw;
  if (y < viewport.scrollTop) viewport.scrollTop = y;
  else if (y + CH > viewport.scrollTop + vh) viewport.scrollTop = y + CH - vh;
}

function select(r, c) {
  colHdrs[selCol]?.classList.remove('active'); rowHdrs[selRow]?.classList.remove('active');
  selRow = clamp(r, 0, ROWS - 1); selCol = clamp(c, 0, COLS - 1);
  colHdrs[selCol].classList.add('active'); rowHdrs[selRow].classList.add('active');
  ensureVisible(selRow, selCol);
  syncHeaders(); renderVisible();
  for (const [id, el] of rendered) markSelection(el, rowOf(id), colOf(id));
  updateInfo();
}
const move = (dr, dc) => select(selRow + dr, selCol + dc);

/* -------------------------------------------------------------- modifica */

function applyCell(r, c, raw) {
  const id = cellId(r, c);
  if (raw === sheet.getRaw(id)) return;
  const t0 = performance.now();
  const affected = sheet.setCell(id, raw);                 // ricalcolo incrementale
  for (const a of affected) { const el = rendered.get(a); if (el) paintCell(el, a); }
  const ms = performance.now() - t0;
  perfEl.textContent = `Ricalcolo: ${affected.size} ${affected.size === 1 ? 'cella' : 'celle'} in ${ms.toFixed(1)} ms`;
  scheduleSave();
}

function startEdit(initial) { // initial === undefined -> modifica il contenuto esistente
  ensureVisible(selRow, selCol); renderVisible();
  editor.style.left = selCol * CW + 'px'; editor.style.top = selRow * CH + 'px';
  editor.style.width = Math.max(CW, 180) + 'px'; editor.style.height = CH + 'px';
  editor.value = initial ?? sheet.getRaw(cellId(selRow, selCol));
  editing = { typing: initial !== undefined };
  editor.hidden = false; editor.focus();
  editor.setSelectionRange(editor.value.length, editor.value.length);
  fx.value = editor.value;
}

function endEdit(commit, dr = 0, dc = 0) {
  if (!editing) return;
  const raw = editor.value;
  editing = null; editor.hidden = true;
  if (commit) applyCell(selRow, selCol, raw);
  viewport.focus({ preventScroll: true });
  select(selRow + dr, selCol + dc);
}

editor.addEventListener('input', () => { fx.value = editor.value; });
editor.addEventListener('blur', () => { if (editing) endEdit(true); });
editor.addEventListener('keydown', (e) => {
  const k = e.key;
  if (k === 'Enter') { e.preventDefault(); endEdit(true, e.shiftKey ? -1 : 1, 0); }       // conferma e vai alla cella sotto
  else if (k === 'Tab') { e.preventDefault(); endEdit(true, 0, e.shiftKey ? -1 : 1); }     // conferma e vai a destra
  else if (k === 'Escape') { e.preventDefault(); endEdit(false); }
  else if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); endEdit(true, k === 'ArrowUp' ? -1 : 1, 0); }
  else if ((k === 'ArrowLeft' || k === 'ArrowRight') && editing.typing) { e.preventDefault(); endEdit(true, 0, k === 'ArrowLeft' ? -1 : 1); }
});

// Barra della formula: Invio conferma, Esc annulla, uscire dal campo conferma.
let fxCancel = false;
fx.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); viewport.focus(); }
  else if (e.key === 'Escape') { fxCancel = true; fx.value = sheet.getRaw(cellId(selRow, selCol)); viewport.focus(); }
});
fx.addEventListener('blur', () => {
  if (!fxCancel) applyCell(selRow, selCol, fx.value);
  fxCancel = false; updateInfo();
});

/* --------------------------------------------------- tastiera e puntatore */

viewport.addEventListener('keydown', (e) => {
  if (e.target !== viewport) return;
  const mod = e.ctrlKey || e.metaKey, k = e.key;
  const page = Math.max(1, Math.floor(viewport.clientHeight / CH) - 1);
  const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  if (arrows[k]) {
    e.preventDefault();
    const [dr, dc] = arrows[k];
    if (mod) select(dr < 0 ? 0 : dr > 0 ? ROWS - 1 : selRow, dc < 0 ? 0 : dc > 0 ? COLS - 1 : selCol); // Ctrl+freccia: al bordo
    else move(dr, dc);
  }
  else if (k === 'Tab') { e.preventDefault(); move(0, e.shiftKey ? -1 : 1); }
  else if (k === 'PageDown') { e.preventDefault(); move(page, 0); }
  else if (k === 'PageUp') { e.preventDefault(); move(-page, 0); }
  else if (k === 'Home') { e.preventDefault(); select(mod ? 0 : selRow, 0); }
  else if (k === 'End' && mod) { e.preventDefault(); select(ROWS - 1, COLS - 1); }
  else if (k === 'Enter' || k === 'F2') { e.preventDefault(); startEdit(); }
  else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); applyCell(selRow, selCol, ''); updateInfo(); }
  else if (k.length === 1 && !mod && !e.altKey) { e.preventDefault(); startEdit(k); }     // digitare sostituisce il contenuto
});

const fromEvent = (e) => e.target.closest('.cell');
cellsLayer.addEventListener('click', (e) => {
  const el = fromEvent(e); if (!el) return;
  const r = +el.dataset.r, c = +el.dataset.c;
  const again = r === selRow && c === selCol;
  viewport.focus({ preventScroll: true });
  select(r, c);
  if (again && window.matchMedia('(pointer: coarse)').matches) startEdit(); // su touch: secondo tocco = modifica
});
cellsLayer.addEventListener('dblclick', (e) => { if (fromEvent(e)) startEdit(); });
colInner.addEventListener('click', (e) => { const el = e.target.closest('.ch'); if (el) select(selRow, +el.dataset.i); viewport.focus({ preventScroll: true }); });
rowInner.addEventListener('click', (e) => { const el = e.target.closest('.rh'); if (el) select(+el.dataset.i, selCol); viewport.focus({ preventScroll: true }); });

/* ---------------------------------------------- salvataggio, esempi, CSV */

let saveTimer = 0;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const data = {};
      for (const [id, raw] of sheet.entries()) data[toA1(rowOf(id), colOf(id))] = raw;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch { /* storage pieno o non disponibile: il foglio funziona comunque */ }
  }, 400);
}

function loadObject(obj) { // { "A1": "5", ... } -> foglio
  const pairs = [];
  for (const [a1, raw] of Object.entries(obj)) {
    const p = parseA1(a1);
    if (p && isInGrid(p.row, p.col)) pairs.push([cellId(p.row, p.col), raw]);
  }
  sheet.loadAll(pairs);
  for (const [id, el] of rendered) paintCell(el, id);
}

const EXAMPLE = {
  A1: '5', A2: '10', A3: '=SOMMA(A1:A2)', A4: '3', A5: '7', A6: 'testo',
  B1: '0', B2: '=A1/B1', C1: '=C1', D1: '=CONTA.SE(A1:A10;">5")',
  F1: 'SOMMA', G1: '=SOMMA(A1:A5)', F2: 'MEDIA', G2: '=MEDIA(A1:A5)', F3: 'CONTA', G3: '=CONTA(A1:A6)',
  F4: 'CONTA.VALORI', G4: '=CONTA.VALORI(A1:A6)', F5: 'SOMMA.SE', G5: '=SOMMA.SE(A1:A5;">5")',
  F6: 'MEDIA.SE', G6: '=MEDIA.SE(A1:A5;">5")', F7: 'MAX - MIN', G7: '=MAX(A1:A5)-MIN(A1:A5)',
  F8: 'SE', G8: '=SE(G1>20;"alto";"basso")', F9: 'CONCAT', G9: '=CONCAT("Totale: ";A3)', F10: 'ARROTONDA', G10: '=ARROTONDA(G2/3;2)',
};

function perfDemo() { // Z1 + 100 celle che dipendono da Z1 + una somma: modifica Z1 e guarda i millisecondi
  const o = { Y1: 'Modifica Z1', Z1: '1', Y2: 'Somma AA', Z2: '=SOMMA(AA1:AA100)' };
  for (let r = 1; r <= 100; r++) o['AA' + r] = `=Z1*${r}`;
  return o;
}

function loadDemo(obj, focus) {
  if (sheet.entries().next().done === false && !confirm('Il contenuto attuale del foglio verrà sostituito. Continuare?')) return;
  loadObject(obj); scheduleSave();
  const p = parseA1(focus); select(p.row, p.col);
}
$('btn-example').addEventListener('click', () => loadDemo(EXAMPLE, 'A1'));
$('btn-perf').addEventListener('click', () => loadDemo(perfDemo(), 'Z1'));
$('btn-clear').addEventListener('click', () => {
  if (!confirm('Cancellare tutto il foglio?')) return;
  sheet.clear(); for (const [id, el] of rendered) paintCell(el, id);
  perfEl.textContent = ''; scheduleSave(); updateInfo();
});
$('btn-csv').addEventListener('click', () => { // esporta i valori calcolati (separatore ; e BOM per Excel italiano)
  let maxR = -1, maxC = -1;
  for (const [id] of sheet.entries()) { maxR = Math.max(maxR, rowOf(id)); maxC = Math.max(maxC, colOf(id)); }
  const lines = [];
  for (let r = 0; r <= maxR; r++) {
    const row = [];
    for (let c = 0; c <= maxC; c++) {
      const t = formatValue(sheet.getValue(cellId(r, c)));
      row.push(/[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
    }
    lines.push(row.join(';'));
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = 'foglio.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

/* ------------------------------------------------------------------ PWA */

const net = $('net');
let offlineReady = false;
function showNet() {
  const on = navigator.onLine;
  net.textContent = on ? (offlineReady ? 'Online · pronta offline' : 'Online') : 'Offline';
  net.className = 'badge ' + (on ? (offlineReady ? 'text-bg-success' : 'text-bg-secondary') : 'text-bg-warning');
}
window.addEventListener('online', showNet); window.addEventListener('offline', showNet);

if ('serviceWorker' in navigator) {
  // Percorso RELATIVO ('./sw.js'): con '/sw.js' si romperebbe su GitHub Pages (sottopercorso del repository).
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((e) => console.warn('Service worker non registrato:', e));
    navigator.serviceWorker.ready.then(() => { offlineReady = true; showNet(); });
  });
}

let installEvent = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; $('btn-install').hidden = false; });
$('btn-install').addEventListener('click', async () => {
  if (!installEvent) return;
  installEvent.prompt(); await installEvent.userChoice;
  installEvent = null; $('btn-install').hidden = true;
});
window.addEventListener('appinstalled', () => { $('btn-install').hidden = true; });

/* ---------------------------------------------------------------- avvio */

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (saved) loadObject(saved);
} catch { /* dati salvati illeggibili: si parte da un foglio vuoto */ }
readMetrics(); layout(); select(0, 0); showNet();
viewport.focus({ preventScroll: true });
