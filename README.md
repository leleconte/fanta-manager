# L-STORE FANTA MANAGER

Web app frontend-only per la gestione di leghe e aste di Fantacalcio della Serie A.

## Caratteristiche
- pagine HTML separate;
- HTML/CSS/JavaScript senza backend;
- dati persistenti con `localStorage`;
- sincronizzazione tra schede tramite `storage` e `BroadcastChannel` quando disponibili;
- gestione utenti locale;
- creazione e gestione leghe e squadre;
- asta con rilanci, timer, turni, crediti e storico;
- modalità TV;
- responsive design per PC, tablet, smartphone e TV.

## Avvio
Aprire `index.html` oppure `iniziale.html` direttamente nel browser.

## GitHub Pages
Il repository è pronto per GitHub Pages: `index.html` si trova nella root e `.nojekyll` è incluso.

## Nota sicurezza
Il progetto è volutamente frontend-only. Le credenziali vengono trasformate localmente in un hash quando le API Web Crypto sono disponibili, ma non esiste autenticazione server-side.
