# Mini-Foglio di Calcolo (PWA)

> 🔗 **Sito pubblicato:** `https://TUO-USERNAME.github.io/mini-sheet-pwa/`  ← *sostituisci con il tuo URL (GitHub Pages o Vercel)*

Foglio di calcolo semplificato 100 × 100 (A1:CV100) con motore di formule scritto da zero, installabile come PWA e funzionante offline. HTML + CSS + JavaScript vanilla (moduli ES), Bootstrap 5 (solo CSS, incluso in `css/`) per il layout responsive. Nessun dato viene inviato a server esterni.

## Avvio in locale

Il service worker richiede `http://localhost` (non `file://`):

```bash
cd mini-sheet-pwa
python -m http.server 8000      # oppure: Live Server di VS Code
# apri http://localhost:8000
```

Test automatici del motore (Node 18+): `npm test`

## Deploy

**GitHub Pages**
1. `git init && git add . && git commit -m "Prima versione" && git branch -M main`
2. `git remote add origin https://github.com/TUO-USERNAME/mini-sheet-pwa.git && git push -u origin main`
3. Repository → *Settings → Pages → Deploy from a branch* → branch `main`, cartella `/ (root)` → *Save*.
4. Dopo 1–2 minuti: `https://TUO-USERNAME.github.io/mini-sheet-pwa/`.

Tutti i percorsi sono relativi (`./js/app.js`, `./sw.js`, `start_url: "./"`, `scope: "./"`): con percorsi assoluti la PWA si rompe nel sottopercorso del repository.

**Vercel** (alternativa): *Add New → Project* → importa il repository → Framework Preset **Other**, Build Command vuoto, Output Directory vuota → *Deploy*.

## Come si usa

| Azione | Tasto |
|---|---|
| Muoversi | frecce, `Tab` / `Maiusc+Tab`, `Page Up` / `Page Down`, `Home`, `Ctrl+Home`, `Ctrl+Fine`, `Ctrl+freccia` |
| Scrivere | digita sopra la cella (sostituisce) · `Invio` o `F2` o doppio clic (modifica l'esistente) |
| Confermare | `Invio` (vai sotto), `Tab` (vai a destra), `Esc` annulla |
| Cancellare | `Canc` |

Su touch: tocca una cella per selezionarla, tocca di nuovo per modificarla (o usa la barra della formula). Separatore degli argomenti: `;`. Decimali: sia `3.14` sia `3,14`.

## Funzioni implementate

`SOMMA` `MEDIA` `CONTA` `CONTA.VALORI` `SOMMA.SE` `CONTA.SE` `MEDIA.SE` `MAX` `MIN` · operatori `+ - * / ^ &` e confronti `= <> < > <= >=` · parentesi · riferimenti `A1`, `$A$1`, intervalli `A1:B5` · criteri `">5"`, `"<=3"`, `"<>x"`, `"testo"`, jolly `*` e `?` · errori `#DIV/0!` `#VALORE!` `#RIF!` `#NOME?` `#CIRC!` `#NUM!` (il passaggio del mouse sulla cella o la barra di stato spiegano l'errore).

**Extra:** `SE`, `CONCAT`, `ARROTONDA`, salvataggio automatico in `localStorage`, esportazione CSV, pulsanti *Esempi* e *Demo prestazioni*, indicatore online/offline.
Non implementati: inserimento/eliminazione di righe e colonne, copia/incolla.

## Strategia di virtualizzazione

Nel DOM esistono solo le celle visibili (circa 30 × 15) più 3 righe/colonne di margine: ~300 elementi invece di 10.000. Un contenitore `#viewport` con `overflow: auto` contiene uno *spacer* grande quanto tutta la griglia (così le barre di scorrimento sono quelle vere); a ogni `scroll`, dentro `requestAnimationFrame`, si calcolano le righe/colonne visibili da `scrollTop/scrollLeft`, si rimuovono le celle uscite e si creano quelle entrate (posizione assoluta `left/top`). Le intestazioni A…CV e 1…100 sono fuori dallo scroll e sincronizzate con un `transform`. Alternative valutate: `content-visibility: auto` (lascia comunque 10.000 nodi nel DOM) e una pool di elementi riciclati (più veloce ma più complessa: non serve a questa scala).

## Motore di calcolo e dipendenze

`js/engine.js`: *lexer* (un regex) → parser a discesa ricorsiva → AST → valutazione. Ogni formula registra da chi dipende: un indice inverso `cella → formule` per i riferimenti singoli e, per gli intervalli, una lista di rettangoli controllata per contenimento (evita di registrare 10.000 archi per `A1:CV100`). Quando una cella cambia si visitano (DFS iterativa) solo i suoi dipendenti diretti e indiretti, si ordinano in modo topologico e si ricalcolano una volta sola; il resto resta in cache. I cicli vengono rilevati con l'insieme delle formule «in calcolo»: tornare su una di esse produce `#CIRC!`.

**Scelta documentata (caso di test 5):** una formula scritta *dentro* il proprio intervallo (`E1 = SOMMA(A1:CV100)`) ignora se stessa e dà 0, come richiesto dalla prova; Excel in questo caso segnalerebbe un riferimento circolare. `C1 = C1` e i cicli a catena restano `#CIRC!`.

## Casi di test

Il pulsante **Esempi** carica i casi 1–4. Esito dei controlli automatici (`npm test`, 14 test) e di quelli da fare nel browser:

| # | Caso | Esito |
|---|---|---|
| 1 | `A3 = SOMMA(A1:A2)` con 5 e 10 → 15 | ✅ automatico |
| 2 | `B2 = A1/B1` con `B1 = 0` → `#DIV/0!` | ✅ automatico |
| 3 | `C1 = C1` → `#CIRC!` (anche A1↔B1) | ✅ automatico |
| 4 | `CONTA.SE(A1:A10;">5")` con valori misti | ✅ automatico |
| 5 | `E1 = SOMMA(A1:CV100)` su griglia vuota → 0 | ✅ automatico |
| 6 | Scorrimento riga 1→100 e ritorno senza lag | ☐ da verificare nel browser |
| 7 | Cella con 100 dipendenze aggiornata < 300 ms | ✅ automatico (pochi ms); *Demo prestazioni* mostra i ms a schermo |
| 8 | Rete disattivata → ricarica e funziona offline | ☐ da verificare |
| 9 | URL pubblico in incognito: app, installazione, offline | ☐ da verificare dopo il deploy |
| 10 | Nessun 404 in console sull'URL pubblico | ☐ da verificare dopo il deploy |

## Difficoltà incontrate e come risolte

- **Intervallo che contiene la propria formula** (caso 5): trattata la cella stessa come vuota durante la lettura dell'intervallo.
- **Catene lunghe di dipendenze**: la ricorsione semplice può superare lo stack; il ricalcolo in ordine topologico la mantiene poco profonda (testato con 10.000 celle in catena).
- **404 in console**: il CSS di Bootstrap fa riferimento a una *source map* inesistente; la riga è stata rimossa e Bootstrap è incluso in locale (offline e nessuna richiesta esterna).
- ✏️ *Aggiungi qui le difficoltà che incontri tu nel deploy (percorsi, scope, cache).*

## Domande di riflessione

Rispondi con le tue parole dopo aver provato, letto e modificato il codice.

1. **Cosa hai scritto tu e cosa l'AI? Come hai verificato?** ✏️ …(il codice di partenza è stato generato dall'AI: spiega cosa hai letto, cambiato e provato; i test in `tests/` sono un punto di partenza per la verifica)
2. **Quali prompt sono stati più efficaci?** ✏️ …
3. **Cosa hai dovuto correggere dell'AI e perché?** ✏️ …
4. **Strategia di virtualizzazione e alternative:** vedi sezione dedicata.
5. **Dipendenze tra celle:** vedi sezione «Motore di calcolo e dipendenze».
6. **Piattaforma scelta e problemi incontrati:** ✏️ …
7. **Come hai verificato la PWA dall'URL pubblico?** ✏️ … (incognito, DevTools → Application, Network → Offline, Lighthouse)
8. **Cosa cambieresti?** ✏️ …
