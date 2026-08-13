# L-STORE FANTA MANAGER

Web app frontend-only per la gestione di leghe e aste di Fantacalcio Serie A.

## Avvio

Aprire `iniziale.html` nel browser. Tutte le pagine sono file HTML reali e i dati vengono salvati localmente in `localStorage`.

Per caricare `data/giocatori.json` tramite `fetch`, è consigliato aprire la cartella con un semplice static file server del browser/tooling locale. Non serve alcun backend applicativo.

## Sincronizzazione

La demo usa `localStorage`, `storage` event e `BroadcastChannel` per aggiornare le schede dello stesso ambiente/browser. La sincronizzazione reale tra dispositivi diversi richiederebbe un servizio condiviso/backend, volutamente assente.

## Demo

Dalla landing page usare `AVVIA DEMO` per generare un account demo, una lega, quattro squadre e un'asta preimpostata.
## GitHub Pages

GitHub Pages richiede un file `index.html` nella radice pubblicata. Il progetto include già `index.html`, che mostra direttamente la landing page.

Per pubblicarlo: estrai tutto il contenuto dello ZIP nella radice del repository (non dentro una sottocartella), poi in **Settings → Pages** seleziona la branch e la cartella `/ (root)`.

Se usi un repository di progetto, l'URL avrà normalmente la forma `https://TUO-UTENTE.github.io/NOME-REPOSITORY/`.
