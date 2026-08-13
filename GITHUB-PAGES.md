# Pubblicazione corretta su GitHub Pages

Questa cartella è già pronta per GitHub Pages.

## IMPORTANTE

Nella root del repository devono comparire **direttamente** questi elementi:

- `index.html`
- `iniziale.html`
- `login.html`
- `registrazione.html`
- `css/`
- `js/`
- `data/`
- `assets/`

Non rinominare `login.html` in `index.html`.
Non caricare soltanto i file `.html`: devi caricare anche le cartelle `css`, `js`, `data` e `assets` mantenendo la struttura.

## Caso `leleconte.github.io`

Se il repository si chiama esattamente `leleconte.github.io`, l'indirizzo sarà:

`https://leleconte.github.io/`

## Caso repository di progetto

Se il repository si chiama, per esempio, `fanta-manager`, l'indirizzo sarà normalmente:

`https://leleconte.github.io/fanta-manager/`

## Impostazione Pages

In GitHub apri:

`Settings → Pages → Build and deployment → Deploy from a branch`

Seleziona:

- Branch: `main`
- Folder: `/ (root)`

Dopo il deploy, fai un hard refresh del browser per evitare di vedere una versione precedente in cache.
