// Test automatici del motore di calcolo (non richiedono il browser): npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { Sheet, formatValue } from '../js/engine.js';
import { parseA1, cellId, colToLetters } from '../js/coordinates.js';

const id = (a1) => { const p = parseA1(a1); return cellId(p.row, p.col); };
const make = (obj) => { const s = new Sheet(); for (const [k, v] of Object.entries(obj)) s.setCell(id(k), v); return s; };
const show = (s, a1) => formatValue(s.getValue(id(a1)));

test('coordinate A1 <-> indici', () => {
  assert.equal(colToLetters(0), 'A'); assert.equal(colToLetters(26), 'AA'); assert.equal(colToLetters(99), 'CV');
  assert.deepEqual(parseA1('CV100'), { row: 99, col: 99 });
});

test('caso 1: SOMMA(A1:A2) = 15', () => {
  assert.equal(show(make({ A1: '5', A2: '10', A3: '=SOMMA(A1:A2)' }), 'A3'), '15');
});
test('caso 2: divisione per zero', () => {
  assert.equal(show(make({ B1: '0', A1: '5', B2: '=A1/B1' }), 'B2'), '#DIV/0!');
});
test('caso 3: riferimenti circolari (diretto, a catena, tramite intervallo)', () => {
  const s = make({ C1: '=C1', A1: '=B1', B1: '=A1', D1: '=SOMMA(D2:D3)', D2: '=D1' });
  assert.equal(show(s, 'C1'), '#CIRC!');
  assert.equal(show(s, 'A1'), '#CIRC!'); assert.equal(show(s, 'B1'), '#CIRC!');
  assert.equal(show(s, 'D1'), '#CIRC!'); assert.equal(show(s, 'D2'), '#CIRC!');
  s.setCell(id('B1'), '7'); // spezzo il ciclo: tutto torna a posto
  assert.equal(show(s, 'A1'), '7');
});
test('caso 4: CONTA.SE con valori misti', () => {
  const s = make({ A1: '5', A2: '10', A3: '3', A4: 'testo', A5: '7', A6: '=A2+A5', D1: '=CONTA.SE(A1:A10;">5")' });
  assert.equal(show(s, 'D1'), '3'); // 10, 7, 17
});
test('caso 5: SOMMA(A1:CV100) su griglia vuota = 0, senza crash', () => {
  assert.equal(show(make({ E1: '=SOMMA(A1:CV100)' }), 'E1'), '0');
});

test('operatori, precedenza, parentesi, riferimenti', () => {
  const s = make({ A1: '2', B2: '3', C1: '=A1+B2*2', C2: '=(A1+B2)*2', C3: '=-A1^2', C4: '=10-4-3', C5: '=$A$1*2' });
  assert.deepEqual(['C1', 'C2', 'C3', 'C4', 'C5'].map((k) => show(s, k)), ['8', '10', '4', '3', '4']);
});
test('funzioni base', () => {
  const s = make({ A1: '4', A2: '8', A3: 'x', A4: '', A5: '2', B1: '=MEDIA(A1:A5)', B2: '=CONTA(A1:A5)', B3: '=CONTA.VALORI(A1:A5)', B4: '=MAX(A1:A5)', B5: '=MIN(A1:A5)', B6: '=SOMMA(A1:A2;10;A5)', B7: '=MEDIA(A3:A4)' });
  assert.deepEqual(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'].map((k) => show(s, k)), ['4,66666666667', '3', '4', '8', '2', '24', '#DIV/0!']);
});
test('funzioni condizionali', () => {
  const s = make({ A1: '1', A2: '6', A3: '9', A4: 'mela', A5: 'Pera', B1: '10', B2: '20', B3: '30', B4: '40', B5: '50',
    C1: '=SOMMA.SE(A1:A3;">5")', C2: '=SOMMA.SE(A1:A5;">5";B1:B5)', C3: '=MEDIA.SE(A1:A3;">=6")', C4: '=CONTA.SE(A1:A5;"mela")',
    C5: '=CONTA.SE(A1:A5;"p*")', C6: '=CONTA.SE(A1:A5;"<>mela")', C7: '=MEDIA.SE(A1:A3;">100")', C8: '=CONTA.SE(A1:A3;9)' });
  assert.deepEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8'].map((k) => show(s, k)), ['15', '50', '7,5', '1', '1', '4', '#DIV/0!', '1']);
});
test('errori chiari', () => {
  const s = make({ A1: 'ciao', B1: '=A1+1', B2: '=PIPPO(1)', B3: '=ZZ9', B4: '=A101', B5: '=1+', B6: '=B1+1', B7: '=PIPPO', B8: '=SOMMA(A1:ZZ500)' });
  assert.deepEqual(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8'].map((k) => show(s, k)),
    ['#VALORE!', '#NOME?', '#RIF!', '#RIF!', '#VALORE!', '#VALORE!', '#NOME?', '#RIF!']);
});
test('extra: SE, CONCAT, ARROTONDA, confronti', () => {
  const s = make({ A1: '5', B1: '=SE(A1>3;"alto";"basso")', B2: '=CONCAT("A=";A1;"!")', B3: '=ARROTONDA(2,675;2)'.replace(',', '.'), B4: '="a"&"b"', B5: '=A1<>5' });
  assert.deepEqual(['B1', 'B2', 'B3', 'B4', 'B5'].map((k) => show(s, k)), ['alto', 'A=5!', '2,68', 'ab', 'FALSO']);
});
test('ricalcolo automatico e rimozione dipendenze', () => {
  const s = make({ A1: '1', B1: '=A1*2', C1: '=B1+1' });
  assert.equal(show(s, 'C1'), '3');
  const affected = s.setCell(id('A1'), '10');
  assert.ok(affected.has(id('B1')) && affected.has(id('C1')));
  assert.equal(show(s, 'C1'), '21');
  s.setCell(id('B1'), '5'); // B1 non è più una formula: non deve più dipendere da A1
  assert.ok(!s.setCell(id('A1'), '99').has(id('B1')));
  assert.equal(show(s, 'C1'), '6');
});
test('caso 7: 100 dipendenze aggiornate in meno di 300 ms', () => {
  const s = new Sheet();
  s.setCell(id('A1'), '1');
  for (let r = 1; r <= 100; r++) s.setCell(id(`B${r}`), `=A1+${r}`);
  s.setCell(id('C1'), '=SOMMA(B1:B100)');
  const t0 = performance.now();
  const n = s.setCell(id('A1'), '2').size;
  const ms = performance.now() - t0;
  assert.equal(show(s, 'C1'), String(100 * 2 + 5050));
  assert.equal(n, 102);
  assert.ok(ms < 300, `troppo lento: ${ms} ms`);
});
test('catena di 10.000 celle senza overflow dello stack', () => {
  const s = new Sheet();
  const pairs = [[0, '1']];
  for (let k = 1; k < 10000; k++) pairs.push([k, `=${colToLetters(Math.floor((k - 1) % 100))}${Math.floor((k - 1) / 100) + 1}+1`]);
  s.loadAll(pairs);
  assert.equal(s.getValue(9999), 10000);
  s.setCell(0, '5');
  assert.equal(s.getValue(9999), 10004);
});
