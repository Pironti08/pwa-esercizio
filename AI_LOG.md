# AI_LOG — uso dell'AI nel progetto

Servono almeno 5 prompt, e **almeno uno sul deploy**. Il primo è già compilato; gli altri vanno scritti da voi man mano che usate l'AI (prompt reale → risposta sintetizzata → cosa avete cambiato).

## 1. Generazione dell'impianto del progetto
- **Strumento:** Claude
- **Prompt:** «Realizzare una PWA che simuli un foglio di calcolo (griglia 100×100, formule, installabile e offline, responsive, pubblicabile su GitHub Pages/Vercel) … svolgi l'esercizio basandoti sulla richiesta e soprattutto sul PDF» (allegato il testo della prova).
- **Risposta (sintesi):** struttura del progetto richiesta dal PDF; `coordinates.js` (A1 ↔ indici); `engine.js` (lexer, parser a discesa ricorsiva, funzioni italiane, errori, rilevamento dei cicli, ricalcolo incrementale con ordine topologico); `app.js` (griglia virtualizzata, tastiera, barra formula, salvataggio, installazione PWA); `sw.js` (precache + stale-while-revalidate); manifest, icone, test automatici (`npm test`), README.
- **Cosa va verificato/adattato da voi:** leggere e capire ogni file (la prova chiede di saper spiegare il codice); provare scorrimento, offline e installazione nel browser; scegliere la piattaforma, fare il deploy e compilare i campi ✏️ del README.

## 2. ✏️ Parser / funzioni condizionali
- **Prompt:** *(es. «Spiegami come funziona il parser di formule in engine.js e perché usa la discesa ricorsiva»)*
- **Risposta (sintesi):**
- **Cosa ho modificato/adattato:**

## 3. ✏️ Virtualizzazione e prestazioni
- **Prompt:** *(es. «Come funziona renderVisible()? Cosa succede se tolgo OVERSCAN?»)*
- **Risposta (sintesi):**
- **Cosa ho modificato/adattato:**

## 4. ✏️ Deploy / pubblicazione (obbligatorio)
- **Prompt:** *(es. «Su GitHub Pages l'app non va offline: ecco l'errore della console …»)*
- **Risposta (sintesi):**
- **Cosa ho modificato/adattato:**

## 5. ✏️ Debug o refactoring
- **Prompt:**
- **Risposta (sintesi):**
- **Cosa ho modificato/adattato:**
