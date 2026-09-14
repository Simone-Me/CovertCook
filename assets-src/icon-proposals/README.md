# Proposte per l'icona dell'app

**Queste sono originali.** Non derivano da Flaticon, e questa è l'unica ragione
per cui esistono: l'icona attuale è un'icona Flaticon ricolorata, la licenza
free chiede credito visibile e non ammette l'uso del contenuto come marchio —
e un'icona sul Play Store è esattamente il marchio dell'app. Il credito nel
footer copre le tile dentro l'app, dove l'uso è quello previsto; non viaggia
fino alla scheda dello store, dove non esiste un footer.

Il ricolore non cambia niente di tutto questo: è una modifica, la licenza le
ammette, ma l'opera resta derivata. Solo un disegno fatto da zero esce dalla
questione.

Palette identica a quella attuale: glifo `#FFFCF6` su fondo `#C6202C`
(`--accent` in `tokens.css`, lo stesso `theme_color` del manifest).

| File | Concetto |
|---|---|
| `1-cloche-keyhole.svg` | Coperchio con il buco della serratura — il piatto è chiuso a chiave |
| `2-cloche-question.svg` | Coperchio con il vapore a punto interrogativo |
| `3-toque-mask.svg` | Cappello da chef con la mascherina — *covert cook*, letterale |
| `4-envelope-fork.svg` | Busta chiusa da un sigillo con le posate — il brief che arriva |
| `5-pot-lid-ajar.svg` | Pentola col coperchio scostato — qualcosa sotto che non si vede |
| `toque/` | Sei varianti del terzo concetto |

`PROPOSTE.png` e `toque/VARIANTI.png` sono i provini: ogni proposta a 196 px
con la maschera arrotondata, e sotto a 48 e 72 px. **La riga piccola è la prova
vera** — a 48 px un dettaglio interno sparisce, ed è lì che si scarta.

## Rigenerare i PNG

`render.mjs` disegna ogni `.svg` della cartella in un PNG 512×512;
`sheet.mjs` compone il provino. Servono Chromium (già nell'immagine, in
`/opt/pw-browsers/`) e un pacchetto che non sta nelle dipendenze del progetto,
perché serve solo qui:

```
npm i -D playwright-core
node assets-src/icon-proposals/render.mjs
npm uninstall playwright-core
```

L'SVG viene inserito nella pagina come markup, non come `<img src="file://…">`:
una pagina creata con `setContent` ha un'origine opaca e Chromium le nega ogni
file locale.

## Quando una è scelta

Serve in tre forme, e sono diverse fra loro:

- **Play Store, 512×512 PNG.** Quadrato pieno, **senza angoli arrotondati**:
  la maschera la applica Play. Gli angoli disegnati dentro l'immagine si vedono
  come un doppio bordo.
- **`public/pwa-512x512.png` maskable.** Quadrato pieno anche questo, col
  disegno dentro il cerchio centrale di sicurezza (l'80% della tela). Il file
  attuale ha gli angoli arrotondati e trasparenti, che per un'icona `maskable`
  è sbagliato: Android la maschera una seconda volta e agli angoli resta il suo
  fondo di default.
- **`favicon-32.png` / `apple-touch-icon.png`.** Qui gli angoli arrotondati
  vanno bene, perché nessuno li applica per te.
