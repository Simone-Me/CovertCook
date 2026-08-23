# Buste sulla Tavola — direzione di design

> Trascrizione dell'artefatto `b490a0ce-82e2-40e5-88fc-2a00821ba32e` ("Buste
> sulla Tavola", CovertCook · direzione scelta). Questo file è la fonte
> autorevole per le decisioni visive dell'app: va **letto prima** di toccare
> l'interfaccia e **aggiornato** quando una decisione cambia (vedi
> "Registro delle modifiche" in fondo).

La tovaglia prende tutto lo schermo, i cassetti diventano buste appoggiate
sopra, e prendere una busta apre un documento che occupa la tavola.

---

## 1 · La tavola

Non una pagina con uno sfondo: **una tavola vista dall'alto**. Le buste sono
appoggiate, leggermente storte come le appoggerebbe una mano, e ognuna proietta
la sua ombra sul tessuto.

### Palette

| Nome | Hex | Uso |
|---|---|---|
| Rosso nappe | `#C6202C` | quadretto della tovaglia, accenti, azioni primarie |
| Lino | `#FFFCF6` | fondo della tovaglia, superfici chiare |
| Busta | `#F6EEDD` | carta delle buste |
| Ceralacca | `#8E2B25` | sigillo, testo su carta |
| Piega | `#DCC9A6` | bordi e pieghe della carta |
| Pennarello | `#17120E` | barratura (`.redact`) |

Token della pagina guida (light / dark):

```
--ground        #FBF8F3 / #17130F
--surface       #FFFFFF / #201A15
--surface-sunk  #F3EEE5 / #191410
--ink           #2A2320 / #EFE7DD
--ink-muted     #7A6E66 / #A2948A
--rule          #E5DCD1 / #322A23
--mark          #B4462F / #E07A55
```

Tipografia: `Cormorant Garamond` (titoli guida), `Fraunces` (titoli in-app),
`Karla` (testo), `Courier Prime` (etichette monospazio, campi).

### Le tre regole che la reggono

1. **Niente di leggibile tocca il quadretto.** Ogni testo sta su una superficie
   chiara e opaca appoggiata sopra, con la sua ombra. La tovaglia si vede nei
   margini, negli spazi e attorno agli oggetti: è la stanza, non lo sfondo del
   testo.
2. **Una sola luce, sempre dalla stessa parte.** Qui viene da in alto a
   sinistra, quindi ogni ombra cade in basso a destra — buste, piatti,
   bicchieri. Basta un oggetto illuminato al contrario per far crollare
   l'illusione della tavola.
3. **Una sola macchina da presa, per tutti gli oggetti.** Non serve che sia
   perfettamente perpendicolare — la foto di riferimento è ripresa dall'alto ma
   un po' inclinata, e infatti dei bicchieri si intravede lo stelo. Funziona lo
   stesso perché *tutti* gli oggetti hanno la stessa inclinazione. Quello che
   rompe la tavola non è la prospettiva: è mescolarne due.

### Anatomia della schermata

Tovaglia a tutto schermo → intestazione su carta (`.paper`: titolo della cena +
sottotitolo) → barra di avanzamento su carta (Iscrizione · Ricetta · Voto) →
pila di buste (`.env`, inclinazioni `.tilt-1..4` fra −0.9° e +1.1°).

Ogni busta: icona, nome, meta, eventuale pastiglia numerica (`.env__pip`).
Le buste non ancora disponibili sono `.env--off` (opacità .52, sigillo spento).

---

## 2 · Prendere una busta

L'idea del gioco di ruolo: non un pannello che si espande in una lista, ma **un
oggetto che raccogli e che ti riempie le mani**. La busta si stacca dalla
tavola, si apre, e il foglio prende lo schermo — con la tovaglia ancora visibile
ai bordi, così sai di essere sempre a tavola.

I tre tempi:

1. **Sulla tavola** — buste appoggiate, ognuna con la sua ombra e la sua
   inclinazione. Si leggono come oggetti, non come righe di un menu.
2. **La raccogli** — si raddrizza, si alza dal tessuto, l'ombra si allunga
   (`.env--focus`). Le altre restano dove sono e sbiadiscono (`.env--dim`) —
   non spariscono, sono ancora sulla tavola.
3. **Il documento** — il foglio (`.letter`) occupa la tavola. Non è più una
   busta: è quello che c'era dentro, con la piega ancora visibile. Il bordo di
   tovaglia dice dove sei.

### Una nota su quanto spingere

Le buste sono impilate in colonna e appena storte. La versione *sparse sulla
tavola, raccolte una alla volta* è più bella e va tenuta come traguardo, ma
cambia natura al problema: buste davvero sparse vanno posizionate a mano per
ogni formato di schermo, smettono di funzionare con la tastiera e diventano
difficili da raggiungere per chi ha un telefono piccolo.

La colonna storta prende quasi tutta la sensazione a un decimo del prezzo — e
resta il fondamento su cui, se vorrai, si può aprire il gioco vero: **prima la
tavola ordinata, poi il disordine**.

### Sul computer, la stessa cosa migliora da sola

Sul telefono il foglio prende tutto lo schermo, ed è giusto così: serve lo
spazio. Su uno schermo largo **non** va allargato — una ricetta stesa su 1400
pixel è illeggibile, le righe diventano troppo lunghe per l'occhio.

Il foglio resta della sua larghezza — quella di un foglio, appunto — e si
centra. Il risultato è che sul computer *si vede più tavola*: il quadretto e gli
oggetti attorno hanno finalmente spazio, e la scena che sul telefono è solo
intuita si vede tutta. La stessa regola risolve due problemi opposti senza un
secondo impianto.

---

## 3 · La tavola si consuma

Gli oggetti non restano fermi: si spostano e si sporcano man mano che la serata
avanza. Il risultato è che **si capisce a che punto si è senza leggere niente** —
la barra di avanzamento diventa una conferma, non l'unica fonte.

| Stato | Fase | Cosa si vede |
|---|---|---|
| **Apparecchiata** | Iscrizione | Tutto al suo posto, allineato, il bicchiere pieno. La tovaglia è pulita. Nessuno si è ancora seduto. |
| **In corso** | Ricetta · cena | Il piatto è storto e mezzo vuoto, il bicchiere si è spostato e ha lasciato il suo cerchio, il pane ha perso briciole sulla tovaglia. |
| **Dopo** | Voto · fine | I piatti sono impilati, le posate posate sopra, più cerchi di vino e macchie sul tessuto. |

Le macchie stanno **sotto** gli oggetti e **sopra** il quadretto, in
`mix-blend-mode: multiply` — sono assorbite dal tessuto, non appoggiate.

### Gli oggetti si spostano, non cambiano solo aspetto

La regola vera di questa sezione: **ogni oggetto ha una posizione diversa nei
tre stati**. Un piatto che resta dov'era, solo un po' più sporco, non racconta
una serata; un piatto spinto di lato e girato di sette gradi sì.

| Oggetto | Apparecchiata | In corso | Dopo |
|---|---|---|---|
| Piatto | in alto a destra, allineato | spinto al centro, ruotato −7°, resti dentro | impilato, ruotato +3°, solo una macchia |
| Bicchiere | in alto a destra, pieno | sceso a metà schermo, mezzo bevuto | in basso, quasi vuoto |
| Scodella | a sinistra, piena | spostata, ruotata +9°, avanzi | spostata, ruotata −5°, vuota |
| Tovagliolo | piegato in quadrato | sgualcito, ruotato −13° | buttato altrove, ruotato +21° |
| Forchetta | parallela al coltello | staccata, ruotata −38° | posata sulla pila, +64° |
| Coltello | parallelo alla forchetta | dall'altra parte, +24° | posato sulla pila, +48° |
| Tagliere | assente | compare col pane | compare col pane finito |
| Macchie | nessuna | anelli, schizzi, unto, briciole | tutto quanto sopra, più il resto |

Le briciole sono di **due toni** — mollica e crosta non hanno lo stesso colore,
e un tono solo legge come rumore. Gli anelli di vino sono più scuri dove il
fondo del bicchiere è rimasto più a lungo, quindi il tratto è irregolare e mai
un cerchio pulito. E stanno dove il bicchiere **è stato**, non dove sta adesso:
l'anello in alto è quello che ha lasciato prima di spostarsi.

---

## 3b · Il Frigo

La bacheca — l'unico posto dove tutta la tavola parla insieme — è disegnata come
**l'interno di un frigo aperto**, con l'illustrazione vera
(`public/inside_fridge.webp`) al posto dei ripiani disegnati a mano.

**Il frigo non cresce.** L'immagine è dipinta sul contenitore, che ha
un'altezza fissa (420 px), e la conversazione scorre *dentro* quella finestra.
Ingrandire il frigo per farci stare i messaggi trasformerebbe una stanza in uno
sfondo.

Sopra l'immagine c'è un velo bianco al 34%: abbastanza leggero da lasciar
leggere il disegno, abbastanza da non far combattere una bolla opaca con un
frigo pieno di spesa.

Le bolle sono **ridotte al testo e basta**: niente bordo, `4px 8px` di
imbottitura, e la data è una nota a piè di bolla da 9 px — non una seconda riga
di contenuto.

I messaggi seguono la disposizione classica della chat: i miei a destra, gli
altri a sinistra. Ogni bolla porta un'icona di cibo, sul lato esterno.

**L'icona è per messaggio, mai per persona.** È ricavata dall'id del messaggio,
che è casuale riga per riga: la stessa persona ne prende una diversa ogni volta
che parla. Un'icona che restasse attaccata a qualcuno sarebbe uno pseudonimo da
seguire per tutta la serata, cioè esattamente quello che la bacheca ha sempre
rifiutato di dare (`0031`, `0033`).

### Il mattarello e l'uovo

Le frasi stanno su un **mattarello**, ed è orizzontale perché un mattarello lo
è — ed è **soprattutto impugnature**. È quello che lo rende riconoscibile:
senza i due manici torniti alle estremità non si legge come un oggetto, si
legge come una lista tagliata. Il primo tentativo era verticale, senza manici e
con una frase sola in vista, e infatti non si capiva cosa fosse.

Quindi: il corpo sta di traverso, i due manici escono ai lati con le loro
scanalature, e le frasi corrono lungo il corpo con **quella prima e quella dopo
che si affacciano ai bordi** (ogni frase occupa il 66% del corpo, quindi se ne
vedono tre). Vedere che ce n'è dell'altra di qua e di là è tutta la ragione per
cui si legge come una cosa che gira.

Sotto è un normale contenitore che scorre in orizzontale con scroll-snap,
quindi rotella, dito, Tab e frecce funzionano tutti — il corpo è
ombreggiatura (una banda chiara al centro, ombra sopra e sotto), non un widget
che finge di essere 3D. Il contorno scuro (`--pin-line: #252850`) è l'unica
cosa che fa leggere il legno piatto come un oggetto disegnato invece che come
un rettangolo beige.

Accanto c'è l'**uovo**: un dado a forma di uovo che pesca una frase a caso e la
manda. Lancia e invia in un gesto solo — lo stesso impegno che si prende
toccando una frase — e fa girare il rullo fino alla frase scelta, così vedi cosa
hai detto. La forma è un raggio di bordo, non un'immagine: più largo in basso
che in alto.

---

## 4 · Gli oggetti

I disegni SVG attuali sono **provvisori**, fatti per stabilire posizione, scala
e prospettiva. I render definitivi devono rispettare tre vincoli, altrimenti la
tavola smette di essere una tavola — e vanno consegnati nelle varianti che i tre
stati richiedono.

### I vincoli

1. **Un angolo solo, qualunque sia.** Dall'alto e leggermente inclinata va
   benissimo — è l'inquadratura della foto di riferimento, ed è più naturale
   dello zenitale puro. Ma va scelta una volta e tenuta: un piatto perfettamente
   dall'alto accanto a un bicchiere di tre quarti è la cosa che accartoccia la
   tavola.
2. **Una luce sola, condivisa.** Nella foto la luce scende dai lampadari sopra
   il tavolo, e ogni ombra cade dalla stessa parte. Tutti gli oggetti vanno
   fotografati o resi nella stessa sessione, alla stessa altezza. Presi da fonti
   diverse non si accordano mai, per quanto belli siano singolarmente.
3. **Ombra inclusa, sfondo assente.** PNG o WebP con trasparenza, con l'ombra
   portata già nel file. Un'ombra aggiunta dopo via CSS non segue la forma
   dell'oggetto e si vede subito.

### Render, se posso consigliare

Più prevedibili delle foto: luce, angolo e scala si decidono una volta e ogni
oggetto nuovo si allinea da solo. Con le foto serve rifare uno scatto coerente
ogni volta che si aggiunge un oggetto.

### Attenzione al peso

È una PWA che deve aprirsi offline: quattro foto ad alta risoluzione superano da
sole tutto il resto dell'app. WebP, misura massima quella reale sullo schermo, e
caricamento differito per quelli sotto la piega.

---

## 5 · La lista dei chef

Il foglio "Chefs" è un `.letter`: righe separate da un tratteggio, nome a
sinistra, ruolo o stato a destra in grigio.

**Chi non è ancora rivelato appare barrato** (`.redact`: rettangolo color
pennarello, testo trasparente, leggera rotazione alternata) con la meta
"In attesa". In fondo, una busta spenta: *"Chi manca — Si scopre quando la cena
parte"*.

La barratura non è decorazione: è la regola di riservatezza resa visibile.
Vedi "Quando si scoprono i chef" qui sotto.

---

## Quando si scoprono i chef

**Regola.** Finché le iscrizioni sono aperte (`DRAFT`, `OPEN`) nessun
partecipante vede i nomi segreti degli altri: la lista mostra i posti occupati,
tutti barrati. Dal momento in cui le iscrizioni si chiudono (`LOCKED` in poi) la
lista si scopre per tutti insieme.

**Perché.** Se i nomi comparissero via via che la gente entra, l'ordine di
arrivo diventa un indizio: chi entra subito dopo che hai passato il codice a
Marco *è* Marco. La riservatezza dell'app si romperebbe non per un bug ma per il
tempo. Scoprendo tutti nello stesso istante, l'ordine non dice più niente.

**Eccezioni, e solo queste due:**

- **Te stesso** — ti vedi sempre, marcato `.chef-you`. Senza quel segno non
  sapresti quale sconosciuto sei.
- **L'oste alla porta** — chi ospita vede il *nome vero* di chi è in attesa di
  approvazione, perché approvare uno pseudonimo è approvare nessuno (0015). È
  una decisione già presa, non una svista.

---

## 6 · La carta del menu

Due schermate diverse usano la stessa carta, per la stessa ragione: **un pasto
si legge meglio come menu che come campo di stato**.

- **Impostazioni → Status.** Le fasi della cena sono le portate. Quelle servite
  sono **barrate** e sbiadite al 50%, quella in corso è in grassetto rosso, le
  altre restano presenti ma al 72% di opacità. Dove sei diventa una cosa che
  *vedi*, non una che leggi.
- **Voto.** I piatti della serata, sopra la scheda di voto. Prima l'unico modo
  di vedere *cos'era* il pasto era leggere il controllo con cui lo si giudica.

### La freccia che torna indietro

Sta accanto all'**ultima portata servita** — è quella che un passo indietro
dis-serve, quindi è quella da indicare. Ruota all'hover e si gira di 150° da
aperta.

**La freccia non agisce: offre.** Il bottone che compare sotto è quello che
agisce. Riportare indietro una cena può vanificare lavoro già fatto da altri, e
non deve mai stare a un tocco sbagliato di distanza.

---

## 7 · L'anello della catena

La catena è disegnata come **l'anello che è**. Una lista di righe "A → B" può
solo *affermare* che la catena si chiude: l'Executive Chef doveva leggere fino
in fondo e fidarsi di "torna a A". Un cerchio lo **mostra**.

Gli chef sono disposti in **ordine di ciclo**, quindi ogni freccia è fra vicini
e il flusso si legge lungo l'anello invece di attraversarlo. È quello che una
griglia a due colonne (A-B-F-C-E-D) cercava di approssimare: andando
direttamente al cerchio, l'approssimazione sparisce.

Due cose che prima andavano dedotte e ora si vedono:

- uno chef caduto fuori dalla catena **non è sull'anello**;
- una catena che uno scambio manuale ha spezzato in due è **due anelli**.

Le coppie scritte restano sotto: un nome si copia meglio da una riga che da un
disegno, e uno screen reader riceve una lista invece di un'immagine.

---

## 8 · Il mattarello gira nel verso giusto

Le frasi scorrono **dall'alto in basso**, non di lato. Di lato era il mattarello
che *scivola* sul piano; dall'alto in basso è il mattarello che **rotola**: una
frase sale nella banda chiara al centro e se ne va sotto di essa.

I manici sono **64×28**, il corpo è alto **58 px**. Entrambi i manici stanno su
un livello di impilamento sotto il corpo: prima erano infilati sotto con lo
stesso margine negativo, ma l'ordine di disegno segue il DOM, quindi quello di
sinistra finiva *sotto* il corpo e quello di destra *sopra* — stesso markup,
risultato opposto. Era quello l'errore sul lato destro.

Un **chevron** all'estremità destra del corpo oscilla finché il mattarello non
viene girato la prima volta: un cilindro disegnato piatto non dà nessun indizio
che ci sia altro sopra e sotto la frase in luce. Poi si ritira — ha insegnato il
gesto, non deve decorare il controllo per sempre.

---

## 9 · Il segno sulla busta dei messaggi

Una busta, un segno solo — quindi deve **scegliere**.

| Cosa c'è di nuovo | Cosa appare |
|---|---|
| Uno chef ti ha scritto | 🧑‍🍳 |
| Solo il frigo ha righe nuove | 🧊 |
| Uno chef **e** il frigo | 🧑‍🍳 — lo chef non viene mai coperto |
| Niente | nessun segno |

**Lo chef vince sempre.** Qualcuno che parla a te personalmente conta più della
tavola che è allegra, e il segno dello chef resta anche se arrivano frasi nuove
nel frigo sopra di esso.

Il numero è sparito: non era la parte utile.

### Il frigo dimentica dopo un giorno

Le frasi del frigo valgono una serata e niente dopo. `get_board` non serve
niente di più vecchio di 24 ore, e `post_to_board` fa pulizia nella cena in cui
sta scrivendo — pubblicare è l'unico momento in cui la bacheca viene scritta,
quindi è il posto più economico dove spazzare e non serve nessuno scheduler.

Con la data sparisce anche la data dalla bolla: a un giorno di ritenzione
diceva sempre "oggi", cioè era una riga di testo che non variava mai.

---

## 10 · Le conferme stanno nella pagina

**Nessun pop-up del browser.** Un `window.confirm` strappa chi legge fuori da
quello che stava guardando, toglie ogni formattazione al messaggio, non può dire
cosa succederà in più di una frase piatta, e dà all'opzione distruttiva un
bottone identico per peso a quella sicura.

Ogni conferma è un `InlineConfirm`: compare **dove è stata presa la decisione**,
con un bordo rosso a sinistra che la fa leggere come inciso al controllo che
l'ha sollevata, non come altro contenuto.

**I bottoni sono piccoli** (76 px, non a tutta larghezza). Il peso di una
decisione sta nelle parole, non nella dimensione del bersaglio.

Nella carta del menu l'avviso si apre **nel varco che descrive**: sotto la
portata a cui torneresti, sopra quella che lasceresti. È l'unico posto in cui si
legge senza spiegazioni.

### Cosa dicono davvero gli avvisi del passo indietro

Un passo indietro **non cancella niente**. `advance_phase` (`0006`), all'indietro,
esegue una sola istruzione: `update rounds set status`. Attribuzioni, ricette e
voti restano tutti. A cambiare è solo *cosa è permesso fare adesso*, perché ogni
RPC controlla la fase:

| Torni a | Cosa cambia davvero |
|---|---|
| Bozza | Il codice smette di funzionare (`join_round` vuole `OPEN`). Chi è già a tavola resta |
| Iscrizione | La porta si riapre |
| Bloccato | Le attribuzioni **restano**. I chef non possono più scrivere la ricetta (`save_brief_draft` vuole `ASSIGNED`) |
| Attribuito | Le ricette tornano modificabili; i cuochi non vedono più quella ricevuta (serve `BRIEFS_CLOSED`) |
| Ricette chiuse | La cena non è più in corso |
| Giorno della cena | Il voto si richiude; i voti già espressi restano |
| Voto | I risultati tornano provvisori e si ricalcolano avanzando |

Rifare le attribuzioni **è** distruttivo — ma quello è `generate_assignment`, un
bottone a parte con la sua domanda.

---

## 11 · Le due conversazioni sono due casse

*Ma recette* e *Recette reçue* si somigliano e non sono la stessa cosa: una è
con lo chef per cui **scrivi**, l'altra con lo chef che scrive **per te**. Sotto
due titoletti si confondevano, quindi ognuna ha la sua cassa con il nome sul
coperchio.

- **Ma recette** porta lo pseudonimo del tuo cuoco, in chiaro: lo conosci, ed è
  come ti rivolgi a lui.
- **Recette reçue** porta una **barratura vera**. `get_my_brief` non manda mai
  chi ha scritto per te, quindi la barra copre un segnaposto — l'unico uso che
  `.redact` ammette.

Le date sono `mm-dd`, piccole, sotto il testo. Una cena si organizza nell'arco
di giorni, non di anni, e l'anno era la cosa più larga della riga ed è l'unica
che non serviva a nessuno.

---

## 12 · Pro, detto onestamente

Il blocco Pro appare **solo accanto a controlli spenti** — cioè esattamente dove
qualcuno comincia a chiedersi se la versione gratuita sia una demo. Quindi la
prima cosa che dice è che non lo è.

1. **Tutta l'app resta gratuita.** Ogni cena, qualsiasi numero di invitati, ogni
   funzione che cambia *come si gioca*. Lo scopo è che tutti possano fare tutto.
2. **Pro vende solo il decoro**: tavole più belle, serate a tema (Natale, un
   solstizio d'estate).
3. **Idea ancora da precisare**: un oste che condivide quello che ha comprato
   con gli invitati del suo tavolo.

---

## 13 · Le informazioni si leggono come un menu

Le due colonne erano sbagliate: l'etichetta più larga decideva la grondaia e
ogni valore veniva schiacciato in quel che restava. Su telefono «Fuso orario»
da solo si mangiava un terzo della riga.

**Etichetta sopra, valore sotto, tutti e due a piena larghezza.** E la riga di
separazione sta *fra* le voci, non dentro: l'etichetta deve leggersi attaccata
alla riga che descrive e staccata da quella sopra.

Vale per le info della cena e per il riepilogo «Questa cena in breve».

---

## 14 · Istruzioni numerate, non un paragrafo

Quando quello che si descrive è una **sequenza di azioni**, lo stesso testo in
un paragrafo denso è illeggibile. Quattro passi numerati, e poi tre note
separate — cosa si conserva (bordo verde), cosa si mette in pausa (grigio),
cosa cambia davvero (rosso) — ognuna marcata a sinistra.

---

## 15 · La freccia che gira è sempre la stessa cosa

`↺` significa **una cosa sola** in tutta l'app: *arma una sostituzione, non la
esegue*. Il controllo che agisce sta sempre sotto.

| Dove | Cosa arma | Cosa agisce |
|---|---|---|
| Impostazioni → Status | il ritorno alla fase precedente | il bottone «Conferma» nell'avviso |
| Menu → portate | la portata da rimpiazzare | il bottone in basso, che da «Aggiungi» diventa «Cambia» |

Cambiare una portata è **una sola istruzione** (`change_course`, `0036`). La
versione cancella-e-riaggiungi lasciava il menu con una portata in meno rispetto
ai chef — cioè esattamente la condizione su cui la roulette si rifiuta di
partire — quindi un oste interrotto a metà si ritrovava con una cena che non
poteva iniziare e nessun indizio del perché.

---

## 16 · Il pass si spiega una volta sola

In **bozza** il pass dice cosa è: il bancone da cui passano tutte le comande,
mostra solo quello che la cena aspetta da te adesso, e un pass vuoto significa
che non c'è niente da fare.

Da lì in poi **non si ripete**. Scrivere «le iscrizioni sono chiuse» a ogni fase
successiva significava dire all'oste una cosa che sapeva, su una porta che aveva
chiuso lui. Quella spiegazione sta nelle impostazioni, dove uno ci va a cercarla.

---

## 17 · Il frigo adesso è firmato

**Una marcia indietro voluta, e va detta.** Le righe del frigo portano ora il
nome segreto di chi le ha scritte, e l'icona-cibo **resta attaccata a quella
persona** per tutta la serata: Chef Persil è sempre la carota.

Prima era l'opposto — icona per messaggio, ricavata dall'id, apposta perché
nessuno fosse seguibile (`0031`, `0033`). Quell'anonimato è stato ceduto in
cambio di una cosa che vale di più su una bacheca: **vedere chi ha detto cosa e
poterci tornare sopra**.

Cosa resta protetto: l'identità vera. Uno pseudonimo è uno pseudonimo, e chi ci
sta dietro è il gioco. E resta tolto l'orologio — nessun timestamp esce dal
server.

### Le frasi del giorno

Dal giorno della cena il mattarello cambia contenuto: «ho 30 minuti di ritardo»,
«passo al supermercato», «qualcuno ha un cavatappi?». Prima del giorno sono
rumore, quel giorno sono l'unica cosa che serve.

---

## 18 · I due insiemi di pseudonimi

| Insieme | Cosa contiene | Prezzo |
|---|---|---|
| **Erbe e spezie** | Chef Basilico, Chef Zafferano… | gratis |
| **Brigata di cucina** | Chef Saucier, Chef Pâtissier, Chef Aboyeur… | **gratis** |

Il secondo è gratis di proposito: una seconda lista di parole **non cambia
niente su come si gioca**. Quello che resta a pagamento è il *decoro* della
serata — le tovaglie, i temi — non le parole dentro.

I 24 nomi sono stati **verificati**, non ricordati. Due scartati: *limonadier*
(è un ruolo del bar, non una postazione di cucina — anche se compare nei mockup
del design) e *chef de garde* (è un turno, non una postazione).

---

## Gli asset veri (e il loro peso)

Le prime immagini vere sono arrivate. La regola del §4 vale da subito: è una PWA
che deve aprirsi offline, e tutto quello che sta in `public/` finisce nel
`dist/` e poi nella precache del service worker.

| Cosa | Master (`assets-src/`, non spedito) | Spedito (`public/`) |
|---|---|---|
| Frigo | `inside_fridge.png` — 1122×1402, 1,2 MB | `inside_fridge.webp` — 820 px, **42 KB** |
| Posate | `cutlery_anim.gif` — 888 KB | `cutlery_anim.mp4` — 165 KB + `cutlery_anim.png` come poster, 13 KB |

I master restano nel repo ma **fuori da `public/`**, altrimenti viaggiano fino
al telefono di chiunque installi l'app senza che nessuno li carichi mai.

Le posate sono un `<video>`, non la GIF: stessa animazione, un quinto del peso,
e — al contrario di una GIF — si può fermare. Con `preload="none"` il file non
viene nemmeno chiesto finché qualcuno non ci passa sopra: il fermo costa 13 KB
e il resto lo paga solo chi lo domanda.

**Ferme di default, in movimento all'hover.** Il movimento *è* l'affordance,
quindi non deve partire da solo: un'intestazione che si anima da sola su ogni
schermata è una distrazione che paga tutta la pagina.

---

## Cosa resta da decidere

La direzione è ferma. Restano tre scelte che cambiano il lavoro, non il mondo.

1. **Quali oggetti servono davvero?** Dalla foto: piatto, bicchiere da vino,
   scodella, teglia da portata, posate su tovagliolo, bottiglia, caraffa.
   Quattro o cinque bastano — più oggetti significa più peso da scaricare, non
   più atmosfera.
2. **Quante varianti per oggetto?** La tavola cambia in tre stati, quindi il
   piatto serve pulito, con i resti e impilato: tre render, non uno. Vale la
   pena decidere subito quali oggetti meritano tre versioni e quali una sola,
   spostata.
3. **Un solo render o una tavola intera?** Oggetti singoli ritagliati danno
   libertà di composizione a ogni schermata. Una tavola già apparecchiata resa
   in un'immagine sola è più bella e più leggera, ma poi è quella e basta.

---

## Registro delle modifiche

| Data | Cosa è cambiato |
|---|---|
| 2026-08-23 | Trascrizione iniziale dall'artefatto. Aggiunte le sezioni "La lista dei chef" e "Quando si scoprono i chef", che fissano la regola della barratura durante le iscrizioni. |
| 2026-08-23 | Aggiunta "Gli oggetti si spostano" (§3) con la tabella delle tre posizioni per oggetto, e "Il Frigo" (§3b) con il rullo e l'uovo. Piatto, bicchiere, scodella, tovagliolo, forchetta, coltello e tagliere adesso cambiano posizione fra le fasi invece di restare fermi. |
| 2026-08-23 | Aggiunte §17 "Il frigo adesso è firmato" (marcia indietro voluta sull'anonimato della bacheca) e §18 "I due insiemi di pseudonimi". La catena si vede dal pass; `Verrouillé`→Attribuzione e `Attribué`→Preparazione. |
| 2026-08-23 | Aggiunte §13 "Le informazioni si leggono come un menu", §14 "Istruzioni numerate", §15 "La freccia che gira è sempre la stessa cosa", §16 "Il pass si spiega una volta sola". Le portate si compongono a `LOCKED` e si cambiano con `change_course` in una sola istruzione. |
| 2026-08-23 | Aggiunte §11 "Le due conversazioni sono due casse" e §12 "Pro, detto onestamente". `BRIEFS_CLOSED` esce dal percorso: la ricetta arriva al cuoco appena inviata. Il codice compare solo con le iscrizioni aperte; le portate si scelgono alla fase 3; barra di avanzamento delle ricette; conto alla rovescia del voto visibile a tutti. |
| 2026-08-23 | Aggiunta §10 "Le conferme stanno nella pagina": eliminati tutti i `window.confirm`. Corretti gli avvisi del passo indietro — non cancella niente, cambia solo cosa è permesso fare. Mattarello: manici 64×28, corpo 58 px, ordine di impilamento corretto, chevron che segnala lo scorrimento. |
| 2026-08-23 | Aggiunte §6 "La carta del menu", §7 "L'anello della catena", §8 "Il mattarello gira nel verso giusto", §9 "Il segno sulla busta dei messaggi". Status e Voto ora usano la stessa carta del menu; la catena è un cerchio; il mattarello scorre dall'alto in basso con manici lunghi; il frigo dimentica dopo 24 ore. |
| 2026-08-23 | Arrivate le prime immagini vere. Il frigo disegnato a mano sostituito dall'illustrazione, a finestra fissa e scorrevole. Il rullo verticale rifatto come mattarello orizzontale con le impugnature e tre frasi in vista — senza manici non si capiva cosa fosse. Le impostazioni sono le posate incrociate al posto della scritta. Aggiunta la sezione "Gli asset veri (e il loro peso)". |
