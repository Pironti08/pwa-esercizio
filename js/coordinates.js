// coordinates.js — conversione tra notazione A1 (es. "CV100") e indici numerici.
// Gli indici sono a base 0: A1 -> riga 0, colonna 0. Una cella ha anche un id numerico
// (riga * COLS + colonna) usato come chiave nelle Map del motore di calcolo.

export const ROWS = 100;
export const COLS = 100; // colonne A..CV

/** 0 -> "A", 25 -> "Z", 26 -> "AA", 99 -> "CV" */
export function colToLetters(c) {
  let s = '';
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  }
  return s;
}

/** "A" -> 0, "AA" -> 26, "CV" -> 99 */
export function lettersToCol(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export const cellId = (row, col) => row * COLS + col;
export const rowOf = (id) => Math.floor(id / COLS);
export const colOf = (id) => id % COLS;
export const toA1 = (row, col) => colToLetters(col) + (row + 1);
export const isInGrid = (row, col) => row >= 0 && row < ROWS && col >= 0 && col < COLS;

const A1_RE = /^\$?([A-Za-z]{1,3})\$?(\d+)$/; // accetta anche i riferimenti assoluti $A$1

/** "B7" -> {row: 6, col: 1}. Restituisce null se non ha la forma di un riferimento.
 *  Il risultato può essere fuori griglia: il chiamante controlla con isInGrid(). */
export function parseA1(text) {
  const m = A1_RE.exec(text);
  if (!m) return null;
  return { row: parseInt(m[2], 10) - 1, col: lettersToCol(m[1]) };
}
