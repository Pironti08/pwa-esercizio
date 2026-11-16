// engine.js — parser delle formule + motore di calcolo + gestione delle dipendenze.
//
// Valori possibili di una cella: number | string | boolean | null (vuota) | XlError.
// Pipeline di una formula:  testo -> tokenize() -> parseFormula() -> AST -> evalNode()
// Le dipendenze (chi usa chi) servono a ricalcolare SOLO le celle toccate da una modifica.

import { ROWS, COLS, cellId, rowOf, colOf, parseA1, isInGrid } from './coordinates.js';

/* ------------------------------------------------------------------ errori */

const ERR_MSG = {
  '#DIV/0!': 'Divisione per zero',
  '#VALORE!': 'Valore non valido per questa operazione (es. testo in un calcolo)',
  '#RIF!': `Riferimento a una cella fuori dalla griglia (A1:CV${ROWS})`,
  '#NOME?': 'Funzione o nome sconosciuto',
  '#CIRC!': 'Riferimento circolare: la cella dipende da se stessa',
  '#NUM!': 'Risultato numerico non valido o troppo grande',
};

export class XlError {
  constructor(code, message) {
    this.code = code;
    this.message = message || ERR_MSG[code] || code;
  }
  toString() { return this.code; }
}
const err = (code, msg) => new XlError(code, msg);
class SyntaxErr extends Error {}

/* ---------------------------------------------------------- conversioni */

/** Numero scritto con punto o virgola decimale ("3.14", "3,14"); null se non è un numero. */
export function parseNumber(s) {
  const t = String(s).trim();
  if (!/^[+-]?(\d+([.,]\d+)?|[.,]\d+)(e[+-]?\d+)?$/i.test(t)) return null;
  return Number(t.replace(',', '.'));
}

export function formatNumber(n) {
  return String(Number(n.toPrecision(12))).replace('.', ','); // toPrecision elimina 0.1+0.2 = 0.30000000000000004
}

export function formatValue(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof XlError) return v.code;
  if (typeof v === 'number') return formatNumber(v);
  if (typeof v === 'boolean') return v ? 'VERO' : 'FALSO';
  return String(v);
}

function toNum(v) {
  if (v === null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = parseNumber(v);
  if (n === null) throw err('#VALORE!', `Il testo "${v}" non è un numero`);
  return n;
}
const toText = (v) => (v === null ? '' : typeof v === 'number' ? formatNumber(v) : typeof v === 'boolean' ? (v ? 'VERO' : 'FALSO') : String(v));

/* ---------------------------------------------------------------- lexer */

// Un solo regex "sticky": numero | stringa "..." | identificatore | operatore
const TOKEN = /\s*(?:(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\.\d+)|"((?:[^"]|"")*)"|([A-Za-z_$][A-Za-z0-9_.$]*)|(<=|>=|<>|[-+*/^&()=<>;,:]))/y;

function tokenize(src) {
  const out = [];
  let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(src);
    if (!m) throw new SyntaxErr(`Carattere non valido in posizione ${pos + 1}`);
    if (m[1] !== undefined) out.push({ k: 'num', v: Number(m[1]) });
    else if (m[2] !== undefined) out.push({ k: 'str', v: m[2].replace(/""/g, '"') });
    else if (m[3] !== undefined) out.push({ k: 'id', v: m[3] });
    else out.push({ k: 'op', v: m[4] });
    pos = TOKEN.lastIndex;
  }
  return out;
}

/* --------------------------------------------------------------- parser */
// Discesa ricorsiva. Precedenza (dalla più bassa): confronti < & < + - < * / < ^ < meno unario.
//   cmp := concat (("="|"<>"|"<"|">"|"<="|">=") concat)*
//   concat := add ("&" add)* ;  add := mul (("+"|"-") mul)* ;  mul := pow (("*"|"/") pow)*
//   pow := unary ("^" unary)* ;  unary := ("-"|"+") unary | primary
// Nodi AST: num, str, ref, range, name, err, neg, bin, call.

function parseFormula(src) {
  const toks = tokenize(src);
  let i = 0;
  const refs = new Set();    // id delle celle singole usate (dipendenze)
  const ranges = [];         // intervalli usati (dipendenze)
  const isOp = (v) => i < toks.length && toks[i].k === 'op' && toks[i].v === v;
  const expect = (v) => { if (!isOp(v)) throw new SyntaxErr(`Atteso "${v}"`); i++; };

  function binary(sub, ops) {
    let left = sub();
    while (i < toks.length && toks[i].k === 'op' && ops.includes(toks[i].v)) {
      const op = toks[i++].v;
      left = { t: 'bin', op, l: left, r: sub() };
    }
    return left;
  }
  const parseCmp = () => binary(parseConcat, ['=', '<>', '<=', '>=', '<', '>']);
  const parseConcat = () => binary(parseAdd, ['&']);
  const parseAdd = () => binary(parseMul, ['+', '-']);
  const parseMul = () => binary(parsePow, ['*', '/']);
  const parsePow = () => binary(parseUnary, ['^']);
  function parseUnary() {
    if (isOp('-')) { i++; return { t: 'neg', e: parseUnary() }; }
    if (isOp('+')) { i++; return parseUnary(); }
    return parsePrimary();
  }

  function parsePrimary() {
    const t = toks[i++];
    if (!t) throw new SyntaxErr('Formula incompleta');
    if (t.k === 'num') return { t: 'num', v: t.v };
    if (t.k === 'str') return { t: 'str', v: t.v };
    if (t.k === 'op' && t.v === '(') { const e = parseCmp(); expect(')'); return e; }
    if (t.k !== 'id') throw new SyntaxErr(`Simbolo inatteso "${t.v}"`);

    if (isOp('(')) { // chiamata di funzione: NOME(arg; arg; ...)
      i++;
      const args = [];
      if (!isOp(')')) {
        for (;;) {
          args.push(parseCmp());
          if (isOp(';') || isOp(',')) i++; else break;
        }
      }
      expect(')');
      return { t: 'call', name: t.v.toUpperCase(), args };
    }
    const a = parseA1(t.v);
    if (!a) return { t: 'name', v: t.v };               // né funzione né cella -> #NOME?
    if (isOp(':')) {                                     // intervallo A1:B5
      i++;
      const t2 = toks[i++];
      const b = t2 && t2.k === 'id' ? parseA1(t2.v) : null;
      if (!b) throw new SyntaxErr('Intervallo non valido');
      if (!isInGrid(a.row, a.col) || !isInGrid(b.row, b.col)) return { t: 'err', code: '#RIF!' };
      const box = { r1: Math.min(a.row, b.row), c1: Math.min(a.col, b.col), r2: Math.max(a.row, b.row), c2: Math.max(a.col, b.col) };
      ranges.push(box);
      return { t: 'range', ...box };
    }
    if (!isInGrid(a.row, a.col)) return { t: 'err', code: '#RIF!' };
    const id = cellId(a.row, a.col);
    refs.add(id);
    return { t: 'ref', id, row: a.row, col: a.col };
  }

  const ast = parseCmp();
  if (i < toks.length) throw new SyntaxErr(`Simbolo inatteso "${toks[i].v}"`);
  return { ast, refs, ranges };
}

/* ----------------------------------------------------------- valutazione */

function compare(a, b) {
  if (a === null && b === null) return 0;
  if (a === null) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
  if (b === null) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
  const rank = (v) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (typeof a === 'string') { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }
  return Number(a) - Number(b);
}

// ctx = { sheet, self }: self è l'id della cella che contiene la formula.
function evalNode(n, ctx) {
  switch (n.t) {
    case 'num': case 'str': return n.v;
    case 'err': throw err(n.code);
    case 'name': throw err('#NOME?', `Nome sconosciuto: ${n.v}`);
    case 'range': throw err('#VALORE!', 'Un intervallo si può usare solo dentro una funzione (es. SOMMA(A1:A5))');
    case 'ref': {
      const v = ctx.sheet.getValue(n.id); // se n.id è la cella stessa -> lancia #CIRC!
      if (v instanceof XlError) throw v;  // gli errori si propagano alle celle che li usano
      return v;
    }
    case 'neg': return -toNum(evalNode(n.e, ctx));
    case 'bin': {
      const a = evalNode(n.l, ctx), b = evalNode(n.r, ctx);
      switch (n.op) {
        case '+': return toNum(a) + toNum(b);
        case '-': return toNum(a) - toNum(b);
        case '*': return toNum(a) * toNum(b);
        case '/': { const x = toNum(a), d = toNum(b); if (d === 0) throw err('#DIV/0!'); return x / d; }
        case '^': return Math.pow(toNum(a), toNum(b));
        case '&': return toText(a) + toText(b);
        case '=': return compare(a, b) === 0;
        case '<>': return compare(a, b) !== 0;
        case '<': return compare(a, b) < 0;
        case '>': return compare(a, b) > 0;
        case '<=': return compare(a, b) <= 0;
        default: return compare(a, b) >= 0; // '>='
      }
    }
    case 'call': {
      if (!Object.hasOwn(FUNCS, n.name)) throw err('#NOME?', `Funzione sconosciuta: ${n.name}`);
      return FUNCS[n.name](n.args, ctx);
    }
  }
  throw err('#VALORE!');
}

/** Valori di un intervallo in ordine per righe. La cella che contiene la formula conta come vuota:
 *  così =SOMMA(A1:CV100) scritta dentro l'intervallo dà 0 invece di un errore (test 5 della prova). */
function rangeValues(ctx, b) {
  const out = [];
  for (let r = b.r1; r <= b.r2; r++) {
    for (let c = b.c1; c <= b.c2; c++) {
      const id = cellId(r, c);
      out.push(id === ctx.self ? null : ctx.sheet.getValue(id));
    }
  }
  return out;
}
const boxOf = (n) => (n.t === 'range' ? n : { r1: n.row, c1: n.col, r2: n.row, c2: n.col });

/** Appiattisce gli argomenti in [{v, direct}]; direct = valore scritto nella formula, non letto da una cella. */
function items(args, ctx) {
  const out = [];
  for (const a of args) {
    if (a.t === 'range') for (const v of rangeValues(ctx, a)) out.push({ v, direct: false });
    else if (a.t === 'ref') out.push({ v: ctx.sheet.getValue(a.id), direct: false });
    else out.push({ v: evalNode(a, ctx), direct: true });
  }
  return out;
}

/** Solo i numeri: nelle celle testo/vuote sono ignorati, un testo scritto direttamente deve essere numerico. */
function nums(args, ctx) {
  const out = [];
  for (const { v, direct } of items(args, ctx)) {
    if (v instanceof XlError) throw v;
    if (typeof v === 'number') out.push(v);
    else if (direct && v !== null) out.push(toNum(v));
  }
  return out;
}

/** Criterio di SOMMA.SE & co: ">5", "<=3", "<>testo", "mela", 7, con * e ? come jolly nel testo. */
function makeMatcher(crit) {
  if (typeof crit === 'number') return (v) => typeof v === 'number' && v === crit;
  const m = /^(>=|<=|<>|>|<|=)?([\s\S]*)$/.exec(toText(crit));
  const op = m[1] || '=', operand = m[2], num = parseNumber(operand);
  if (num !== null) {
    const cmp = { '=': (x) => x === num, '<>': (x) => x !== num, '>': (x) => x > num, '<': (x) => x < num, '>=': (x) => x >= num, '<=': (x) => x <= num }[op];
    return (v) => {
      const x = typeof v === 'number' ? v : typeof v === 'string' ? parseNumber(v) : null;
      return x === null ? op === '<>' : cmp(x);
    };
  }
  if (op === '=' || op === '<>') {
    const re = new RegExp('^' + operand.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
    const isEmptyCrit = operand === '';
    return (v) => {
      const hit = isEmptyCrit ? v === null : v !== null && !(v instanceof XlError) && re.test(toText(v));
      return op === '=' ? hit : !hit;
    };
  }
  const cmp = { '>': (d) => d > 0, '<': (d) => d < 0, '>=': (d) => d >= 0, '<=': (d) => d <= 0 }[op];
  return (v) => typeof v === 'string' && cmp(compare(v, operand));
}

/** Parte comune di SOMMA.SE / CONTA.SE / MEDIA.SE: restituisce i valori (della colonna somma) che passano il criterio. */
function conditional(name, args, ctx, allowSumRange) {
  if (args.length < 2 || args.length > (allowSumRange ? 3 : 2)) throw err('#VALORE!', `${name}: numero di argomenti non valido`);
  if (args[0].t !== 'range' && args[0].t !== 'ref') throw err('#VALORE!', `${name}: il primo argomento deve essere un intervallo`);
  const box = boxOf(args[0]);
  const test = makeMatcher(evalNode(args[1], ctx));
  const tested = rangeValues(ctx, box);
  let source = tested;
  if (args[2]) {
    if (args[2].t !== 'range' && args[2].t !== 'ref') throw err('#VALORE!', `${name}: il terzo argomento deve essere un intervallo`);
    const s = boxOf(args[2]);
    const r2 = s.r1 + (box.r2 - box.r1), c2 = s.c1 + (box.c2 - box.c1); // stessa forma dell'intervallo testato
    if (!isInGrid(r2, c2)) throw err('#RIF!');
    source = rangeValues(ctx, { r1: s.r1, c1: s.c1, r2, c2 });
  }
  return tested.flatMap((v, k) => (test(v) ? [source[k]] : []));
}
const onlyNumbers = (list) => list.filter((v) => { if (v instanceof XlError) throw v; return typeof v === 'number'; });
const need = (name, args, min, max) => { if (args.length < min || args.length > max) throw err('#VALORE!', `${name}: numero di argomenti non valido`); };

const FUNCS = {
  'SOMMA': (a, c) => nums(a, c).reduce((s, x) => s + x, 0),
  'MEDIA': (a, c) => {
    const n = nums(a, c);
    if (!n.length) throw err('#DIV/0!', 'Nessun valore numerico di cui fare la media');
    return n.reduce((s, x) => s + x, 0) / n.length;
  },
  'CONTA': (a, c) => items(a, c).filter(({ v, direct }) => typeof v === 'number' || (direct && typeof v === 'string' && parseNumber(v) !== null)).length,
  'CONTA.VALORI': (a, c) => items(a, c).filter(({ v }) => v !== null).length,
  'MAX': (a, c) => { const n = nums(a, c); return n.length ? n.reduce((m, x) => (x > m ? x : m), -Infinity) : 0; },
  'MIN': (a, c) => { const n = nums(a, c); return n.length ? n.reduce((m, x) => (x < m ? x : m), Infinity) : 0; },
  'SOMMA.SE': (a, c) => onlyNumbers(conditional('SOMMA.SE', a, c, true)).reduce((s, x) => s + x, 0),
  'CONTA.SE': (a, c) => conditional('CONTA.SE', a, c, false).length,
  'MEDIA.SE': (a, c) => {
    const n = onlyNumbers(conditional('MEDIA.SE', a, c, true));
    if (!n.length) throw err('#DIV/0!', 'Nessuna cella soddisfa il criterio');
    return n.reduce((s, x) => s + x, 0) / n.length;
  },
  // Extra (bonus)
  'SE': (a, c) => {
    need('SE', a, 2, 3);
    const k = evalNode(a[0], c);
    const yes = typeof k === 'boolean' ? k : typeof k === 'number' ? k !== 0 : k === null ? false : null;
    if (yes === null) throw err('#VALORE!', 'La condizione di SE deve essere vero/falso o un numero');
    return yes ? evalNode(a[1], c) : a.length > 2 ? evalNode(a[2], c) : false;
  },
  'CONCAT': (a, c) => items(a, c).map(({ v }) => { if (v instanceof XlError) throw v; return toText(v); }).join(''),
  'ARROTONDA': (a, c) => {
    need('ARROTONDA', a, 1, 2);
    const x = toNum(evalNode(a[0], c)), m = Math.pow(10, a.length > 1 ? Math.trunc(toNum(evalNode(a[1], c))) : 0);
    return (Math.sign(x) * Math.round((Math.abs(x) + Number.EPSILON) * m)) / m;
  },
};

/* ----------------------------------------------------------------- foglio */

export class Sheet {
  constructor() { this.clear(); }

  clear() {
    this.raws = new Map();      // id -> testo digitato dall'utente
    this.consts = new Map();    // id -> numero o testo (celle che non sono formule)
    this.formulas = new Map();  // id -> { ast, refs } oppure { error } se la sintassi è sbagliata
    this.values = new Map();    // id -> risultato in cache delle formule
    this.refDeps = new Map();   // id cella -> Set di formule che la usano come riferimento singolo
    this.rangeDeps = new Map(); // id formula -> intervalli che usa (si controllano per contenimento)
    this.visiting = new Set();  // formule in corso di calcolo: serve a scoprire i cicli
  }

  getRaw(id) { return this.raws.get(id) ?? ''; }
  entries() { return this.raws.entries(); }

  /** Valore calcolato (con cache). */
  getValue(id) {
    if (this.consts.has(id)) return this.consts.get(id);
    const f = this.formulas.get(id);
    if (!f) return null;
    if (this.values.has(id)) return this.values.get(id);
    if (this.visiting.has(id)) throw err('#CIRC!'); // ritorniamo su una cella già in calcolo: ciclo
    this.visiting.add(id);
    let v;
    try {
      if (f.error) v = f.error;
      else {
        v = evalNode(f.ast, { sheet: this, self: id });
        if (v === null) v = 0;
        if (typeof v === 'number' && !Number.isFinite(v)) throw err('#NUM!');
      }
    } catch (e) {
      if (e instanceof XlError) v = e;
      else if (e instanceof RangeError) v = err('#CIRC!', 'Catena di dipendenze troppo profonda');
      else throw e;
    } finally {
      this.visiting.delete(id);
    }
    this.values.set(id, v);
    return v;
  }

  /** Imposta il contenuto di una cella e ricalcola solo ciò che dipende da essa.
   *  Restituisce l'insieme degli id da ridisegnare (la cella + i suoi dipendenti diretti e indiretti). */
  setCell(id, raw) {
    this._remove(id);
    this._install(id, raw);
    return this._recalc([id]);
  }

  /** Carica molte celle in una volta sola (iterabile di [id, testo]) e calcola tutto. */
  loadAll(pairs) {
    this.clear();
    for (const [id, raw] of pairs) this._install(id, raw);
    return this._recalc([...this.formulas.keys()]);
  }

  _remove(id) {
    const f = this.formulas.get(id);
    if (f) {
      for (const r of f.refs) {
        const s = this.refDeps.get(r);
        if (s) { s.delete(id); if (!s.size) this.refDeps.delete(r); }
      }
      this.rangeDeps.delete(id);
    }
    this.raws.delete(id); this.consts.delete(id); this.formulas.delete(id);
  }

  _install(id, raw) {
    raw = String(raw);
    if (raw === '') return;
    this.raws.set(id, raw);
    if (raw.length > 1 && raw[0] === '=') {
      let f;
      try {
        const p = parseFormula(raw.slice(1));
        f = { ast: p.ast, refs: p.refs };
        if (p.ranges.length) this.rangeDeps.set(id, p.ranges);
        for (const r of p.refs) {
          if (!this.refDeps.has(r)) this.refDeps.set(r, new Set());
          this.refDeps.get(r).add(id);
        }
      } catch (e) {
        if (!(e instanceof SyntaxErr)) throw e;
        f = { error: err('#VALORE!', `Sintassi non valida: ${e.message}`), refs: new Set() };
      }
      this.formulas.set(id, f);
    } else {
      const n = parseNumber(raw);
      this.consts.set(id, n === null ? raw : n);
    }
  }

  /** Formule che dipendono direttamente dalla cella id (riferimento singolo o intervallo che la contiene). */
  _dependents(id) {
    const out = new Set(this.refDeps.get(id));
    const r = rowOf(id), c = colOf(id);
    for (const [fid, boxes] of this.rangeDeps) {
      for (const b of boxes) if (r >= b.r1 && r <= b.r2 && c >= b.c1 && c <= b.c2) { out.add(fid); break; }
    }
    return [...out];
  }

  /** Ricalcolo incrementale: visita in profondità (iterativa) i dipendenti, li ordina in modo topologico
   *  (ogni cella dopo quelle da cui dipende), svuota la loro cache e le ricalcola in quell'ordine.
   *  Così ogni valutazione trova già pronti i valori che le servono e la ricorsione resta poco profonda. */
  _recalc(starts) {
    const state = new Map();
    const post = [];
    for (const s of starts) {
      if (state.has(s)) continue;
      state.set(s, 1);
      const stack = [{ id: s, deps: this._dependents(s), i: 0 }];
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.i < top.deps.length) {
          const d = top.deps[top.i++];
          if (!state.has(d)) { state.set(d, 1); stack.push({ id: d, deps: this._dependents(d), i: 0 }); }
        } else {
          post.push(top.id);
          stack.pop();
        }
      }
    }
    const order = post.reverse();
    for (const id of order) this.values.delete(id);
    for (const id of order) if (this.formulas.has(id)) this.getValue(id);
    return new Set(order);
  }
}
