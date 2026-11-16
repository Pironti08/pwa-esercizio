# Mini-Foglio di Calcolo PWA (Mini-Sheet PWA)

**Sito pubblicato:** https://pironti08.github.io/pwa-esercizio/
**Repository GitHub:** https://github.com/pironti08/pwa-esercizio

---

## Descrizione del progetto

Mini-Sheet PWA è una Progressive Web App che simula un foglio di calcolo semplificato direttamente da browser. L'app è sviluppata in HTML, CSS (Bootstrap) e JavaScript vanilla, senza l'uso di librerie esterne per spreadsheet (come Handsontable o SheetJS). Sia il motore di calcolo delle formule sia il rendering della griglia da 10.000 celle ($100 \times 100$, da `A1` a `CV100`) sono stati implementati manualmente.

---

## Avvio in locale

L'applicazione utilizza un Service Worker per il caching e il funzionamento offline, quindi non va aperta con doppio clic (`file://`), ma tramite un server HTTP locale.

### Con Python
```bash
git clone https://github.com/pironti08/pwa-esercizio.git
cd pwa-esercizio
python3 -m http.server 8000
```
Aprire poi il browser su `http://localhost:8000`.

### Con VS Code (Live Server)
1. Aprire la cartella del progetto in Visual Studio Code.
2. Fare clic destro su `index.html` e scegliere **Open with Live Server**.

---

## Deploy

Per la pubblicazione online è stato scelto **GitHub Pages**, che permette di ospitare il sito statico gratuitamente in HTTPS direttamente dal repository.

### Passaggi eseguiti
1. **Percorsi relativi:** Tutti i riferimenti a script, fogli di stile, manifest e icone sono stati scritti con percorsi relativi (`./css/...`, `./js/...`, `./sw.js`), necessari perché GitHub Pages pubblica il progetto nella sottocartella `/pwa-esercizio/`.
2. **Manifest (`manifest.json`):** Impostati `"start_url": "./"`, `"scope": "./"`, `"display": "standalone"` e le icone `192x192` e `512x512`.
3. **Configurazione su GitHub:** In **Settings -> Pages**, impostato *Source* su **Deploy from a branch**, selezionando il branch `main` e la cartella `/ (root)`.
4. **Controllo finale:** Test dell'URL pubblico in finestra anonima per verificare l'assenza di errori 404, l'attivazione del Service Worker, la possibilità di installare l'app e il funzionamento offline.

---

## Funzioni implementate

Il motore di calcolo gestisce numeri, testo, riferimenti a celle singole (`A1`), intervalli (`A1:B5`), operatori aritmetici (`+`, `-`, `*`, `/`) con precedenza delle parentesi e le seguenti funzioni:

| Funzione | Sintassi | Descrizione |
| :--- | :--- | :--- |
| `SOMMA` | `=SOMMA(A1:A5)` | Somma i valori numerici presenti nell'intervallo. |
| `MEDIA` | `=MEDIA(A1:A5)` | Calcola la media aritmetica dei numeri nell'intervallo. |
| `CONTA` | `=CONTA(A1:A5)` | Conta quante celle nell'intervallo contengono numeri. |
| `CONTA.VALORI` | `=CONTA.VALORI(A1:A5)` | Conta tutte le celle non vuote nell'intervallo. |
| `SOMMA.SE` | `=SOMMA.SE(A1:A10;">5")` | Somma i valori che rispettano il criterio indicato (es. `>5`, `<10`, `=0`, `"testo"`). |
| `CONTA.SE` | `=CONTA.SE(A1:A10;">5")` | Conta le celle che rispettano il criterio indicato. |
| `MEDIA.SE` | `=MEDIA.SE(A1:A10;">5")` | Calcola la media delle celle che rispettano il criterio indicato. |
| `MAX` | `=MAX(A1:A5)` | Restituisce il valore massimo nell'intervallo. |
| `MIN` | `=MIN(A1:A5)` | Restituisce il valore minimo nell'intervallo. |

### Gestione degli errori
- `#DIV/0!`: divisione per zero.
- `#VALORE!`: operazione aritmetica su celle contenenti testo non numerico.
- `#RIF!`: riferimento a cella o intervallo non valido o fuori dal range `A1:CV100`.
- `#NOME?`: funzione inesistente o errore di sintassi nella formula.
- **Riferimento circolare:** rilevamento automatico di cicli diretti (`A1 = =A1`) o concatenati (`A1 -> B1 -> A1`) tramite controllo del grafo delle dipendenze.

---

## Strategia di virtualizzazione

Creare 10.000 elementi DOM tutti insieme rallenterebbe troppo il browser sia al caricamento sia durante lo scorrimento. Per evitare questo problema è stata usata una virtualizzazione basata sul viewport (windowing):

- **Dati separati dal DOM:** I valori e le formule di tutte le 10.000 celle sono salvati solo in memoria in una struttura dati JavaScript.
- **Disegno delle sole celle visibili:** Nel DOM vengono create e aggiornate soltanto le righe e le colonne visibili nell'area di scorrimento (con un piccolo margine extra per rendere fluido lo scroll).
- **Contenitore spacer:** Un elemento interno con dimensioni pari all'intera griglia ($100 \times 100$) mantiene le scrollbar alle proporzioni corrette.
- **Aggiornamento allo scroll:** Quando l'utente scorre, vengono ricalcolati gli indici visibili e aggiornate solo le celle a schermo.

---

## Casi di test obbligatori

| N. | Caso di test | Risultato atteso | Esito |
| :--- | :--- | :--- | :--- |
| 1 | `A1=5`, `A2=10`, `A3==SOMMA(A1:A2)` | Mostra `15` in `A3`. | Superato |
| 2 | `B1=0`, `B2==A1/B1` | Mostra `#DIV/0!`. | Superato |
| 3 | `C1==C1` (e catene `C1 -> D1 -> C1`) | Segnala riferimento circolare. | Superato |
| 4 | `D1==CONTA.SE(A1:A10;">5")` con valori misti | Conta solo i numeri maggiori di 5. | Superato |
| 5 | `E1==SOMMA(A1:CV100)` su griglia vuota | Mostra `0` senza blocchi o rallentamenti. | Superato |
| 6 | Scorrimento da riga 1 a 100 e ritorno | Scorrimento fluido, intestazioni allineate. | Superato |
| 7 | Modifica di una cella con 100 formule dipendenti | Ricalcolo completato in meno di $300\text{ ms}$. | Superato |
| 8 | Disattivazione rete (Offline) e ricarica pagina | L'app si ricarica dalla cache e continua a funzionare. | Superato |
| 9 | Apertura URL pubblico in finestra anonima | PWA funzionante, installabile e usabile offline. | Superato |
| 10 | Controllo console DevTools sull'URL pubblico | Nessun errore 404 su JS, CSS, manifest o Service Worker. | Superato |

---

## Funzionalità extra

- **Salvataggio locale (`localStorage`):** I dati inseriti nel foglio restano salvati nel browser anche dopo il ricaricamento della pagina, con possibilità di resettare il foglio.
- **Navigazione da tastiera:** Spostamento tra celle con frecce direzionali, `Tab`, `Invio` (conferma e scende alla riga sotto) e `Page Up / Page Down`.
- **Barra della formula:** Mostra le coordinate della cella attiva e consente di visualizzare o modificare la formula grezza.
- **Layout responsive:** Adattamento su desktop, tablet e smartphone grazie a Bootstrap e allo scroll bidirezionale della griglia.

---

## Difficoltà incontrate e soluzioni

- **Percorsi su GitHub Pages:** Inizialmente alcuni file usavano percorsi assoluti (`/sw.js`, `/js/...`), generando errori 404 perché il progetto su GitHub Pages non si trova nella root del dominio ma in `/pwa-esercizio/`. Il problema è stato risolto convertendo tutti i percorsi in relativi (`./`).
- **Cache del Service Worker:** Durante le modifiche al codice, il browser continuava a caricare la versione vecchia salvata in cache. È stato risolto introducendo un nome versione nella cache del Service Worker (`CACHE_NAME`) ed eliminando le cache precedenti nell'evento `activate`.
- **Allineamento intestazioni:** Durante lo scorrimento della griglia virtualizzata, le intestazioni di riga e colonna tendevano a disallinearsi. Il problema è stato risolto sincronizzando gli offset di scorrimento e usando `position: sticky`.

---

## Domande di riflessione

### 1. Quale parte del codice hai scritto tu e quale è stata generata dall'AI? Come hai verificato la correttezza?
Ho scritto personalmente la struttura HTML/Bootstrap, la gestione della navigazione da tastiera, il salvataggio su `localStorage` e la configurazione del manifest e del Service Worker. Ho usato l'AI come supporto per impostare il parser delle formule, la logica di virtualizzazione della griglia e le espressioni regolari per le funzioni condizionali (`SOMMA.SE`, `CONTA.SE`, `MEDIA.SE`). Ho verificato tutto eseguendo manualmente i 10 casi di test richiesti e controllando i valori calcolati tramite i DevTools del browser.

### 2. Quali prompt sono stati più efficaci? Perché?
I prompt più efficaci sono stati quelli mirati a un singolo problema tecnico alla volta, specificando i vincoli del progetto (es. "JavaScript vanilla senza librerie esterne" e "griglia 100x100 da A1 a CV100"). Chiedere spiegazioni su singoli meccanismi, come la gestione del grafo delle dipendenze o il calcolo degli indici visibili allo scroll, ha prodotto codice molto più pulito e facile da integrare rispetto a richieste generiche.

### 3. Cosa ha fatto l'AI che hai dovuto correggere? Perché?
In una prima bozza del valutatore di espressioni, l'AI aveva proposto l'uso di `eval()` dopo aver sostituito i riferimenti alle celle, ma questa soluzione generava errori con le celle vuote (che venivano trattate come `undefined` invece di `0`) e non gestiva bene le stringhe di testo. Ho dovuto riscrivere la valutazione delle espressioni aritmetiche in modo da convertire esplicitamente le celle vuote in `0` e restituire `#VALORE!` quando si tenta un calcolo su testo.

### 4. Quale strategia di virtualizzazione hai scelto e perché? Quali alternative hai valutato?
Ho scelto il rendering dinamico basato sul viewport (windowing), disegnando solo le celle visibili sullo schermo più un piccolo buffer. Ho scartato la creazione di 10.000 nodi nel DOM perché appesantiva troppo la pagina, e ho preferito gestire il windowing via JavaScript piuttosto che affidarmi solo a `content-visibility: auto` in CSS per avere pieno controllo sullo scroll e sulla selezione delle celle da tastiera.

### 5. Come hai gestito le dipendenze tra celle per evitare ricalcoli inutili su 10.000 celle?
Ho usato due strutture dati per tracciare per ogni cella sia le celle da cui dipende sia quelle che dipendono da lei. Quando viene modificato il valore di una cella, il motore ricalcola a cascata soltanto le celle collegate direttamente o indirettamente a quella modificata, evitando di scorrere tutte le 10.000 celle.

### 6. Quale piattaforma hai scelto per il deploy e perché? Quali problemi hai incontrato (percorsi, scope del service worker, cache, HTTPS)?
Ho scelto GitHub Pages perché si integra direttamente con il repository GitHub e fornisce HTTPS in automatico. I problemi principali sono stati i percorsi relativi nel sottopercorso `/pwa-esercizio/`, lo `scope` del Service Worker e l'aggiornamento della cache durante lo sviluppo, risolti usando percorsi `./` e aggiornando la versione della cache nel Service Worker.

### 7. Come hai verificato che la PWA funzioni correttamente dall'URL pubblico e non solo in locale?
Ho aperto `https://pironti08.github.io/pwa-esercizio/` in una finestra in incognito per evitare interferenze con la cache locale. Da DevTools (scheda *Application*) ho controllato che il manifest fosse valido, che le icone venissero caricate senza errori e che il Service Worker fosse attivo. Poi ho installato la PWA sul dispositivo e verificato il ricaricamento attivando la modalità *Offline* nella scheda *Network*.

### 8. Cosa cambieresti se dovessi rifare la prova?
Pubblicherei il progetto su GitHub Pages fin dalle prime fasi di sviluppo invece di aspettare la fine, così da individuare subito eventuali problemi con i percorsi relativi e il Service Worker. Inoltre, preparerei fin dall'inizio uno script di test automatico per verificare tutte le formule a ogni modifica del parser.