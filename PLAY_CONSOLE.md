# Google Play Console — what to fill in, and with what

Answers prepared from what the app actually does (`/legal/privacy`, `/legal/terms`,
`/legal/moderation` and the code). **They are declarations in the developer's
name, so they are filled in by the account holder** — this file only says what
is true. Where a choice is open it says so.

Public addresses used below (Netlify, until a domain exists):

| What | URL |
|---|---|
| Privacy policy | `https://covertcook.netlify.app/legal/privacy` |
| Terms | `https://covertcook.netlify.app/legal/terms` |
| Moderation policy | `https://covertcook.netlify.app/legal/moderation` |
| Help, including how to delete an account | `https://covertcook.netlify.app/help` |
| Contact | `contact@opus35.fr` |

---

## Which test track

* **Internal testing** — up to 100 people, available within minutes, no review.
  Use it **first**, to see the real install from Play (and that the address bar
  is gone, which proves `assetlinks.json` is right). It **does not count** towards
  the production requirement.
* **Closed testing** — this is the one that counts: **at least 12 testers,
  opted in for 14 continuous days**, then apply for production access. Testers
  are added by e-mail address or a Google Group. Build it only once internal
  testing is clean, because the 14 days restart if the group drops below 12.

---

## 1. Store listing

* **App name:** CovertCook
* **Category:** Food & Drink  (alternative: Lifestyle)
* **Contact e-mail:** contact@opus35.fr
* **Graphics needed:** icon 512×512 PNG · feature graphic 1024×500 · 2–8 phone
  screenshots (the manifest already ships some in `public/screenshots/`; Play
  wants real phone captures, 16:9 or 9:16, longest side ≤ 3840 px).

### Short description (max 80 characters)

| | |
|---|---|
| en | A dinner among friends where nobody cooks their own recipe. |
| fr | Un dîner entre amis où personne ne cuisine sa propre recette. |
| it | Una cena tra amici in cui nessuno cucina la propria ricetta. |
| es | Una cena entre amigos en la que nadie cocina su propia receta. |

### Full description

**en**
CovertCook turns a dinner among friends into a game. Each guest is secretly
given another guest and writes them a recipe. Everyone cooks the one they
received and brings it to the table. Nobody knows who wrote theirs until the
end — then you eat together, rank the dishes, and the chain is revealed.

• Create a dinner in a minute and invite your friends by code or by name.
• Code names for everybody: the secret holds until the reveal.
• Allergies and diets are shared with the table, so nobody cooks what a guest cannot eat.
• Private messages and a shared fridge board, in code, while the dishes are made.
• A secret vote — or a show of hands — and a menu you can keep: save the recipes worth cooking again.
• One photograph per evening in the album.
• Come as a guest if you prefer to cook your own dish.
• Free to play. Available in English, French, Italian and Spanish.

**fr**
CovertCook transforme un dîner entre amis en jeu. Chaque convive reçoit en
secret un autre convive et lui écrit une recette. Chacun cuisine celle qu’il a
reçue et l’apporte à table. Personne ne sait qui a écrit la sienne avant la fin
— puis on mange ensemble, on classe les plats, et la chaîne est révélée.

• Créez un dîner en une minute et invitez vos amis par code ou par pseudo.
• Des noms de code pour tous : le secret tient jusqu’à la révélation.
• Allergies et régimes sont partagés avec la table : personne ne cuisine ce qu’un convive ne peut pas manger.
• Messages privés et frigo partagé, en code, pendant la préparation.
• Un vote secret — ou à main levée — et un menu à garder : conservez les recettes à refaire.
• Une photo par soirée dans l’album.
• Venez en invité si vous préférez cuisiner votre propre plat.
• Gratuit. Disponible en anglais, français, italien et espagnol.

**it**
CovertCook trasforma una cena tra amici in un gioco. A ogni ospite viene
assegnato in segreto un altro ospite, per cui scrive una ricetta. Ognuno cucina
quella che ha ricevuto e la porta a tavola. Nessuno sa chi ha scritto la sua
fino alla fine — poi si mangia insieme, si classificano i piatti e la catena
viene rivelata.

• Crea una cena in un minuto e invita gli amici con un codice o per nome.
• Nomi in codice per tutti: il segreto regge fino alla rivelazione.
• Allergie e diete sono condivise con la tavola, così nessuno cucina ciò che un ospite non può mangiare.
• Messaggi privati e un frigo condiviso, in codice, mentre si cucina.
• Un voto segreto — o per alzata di mano — e un menu da conservare: salva le ricette che vale la pena rifare.
• Una fotografia per serata nell’album.
• Vieni come ospite se preferisci cucinare il tuo piatto.
• Gratis. Disponibile in inglese, francese, italiano e spagnolo.

**es**
CovertCook convierte una cena entre amigos en un juego. A cada invitado se le
asigna en secreto otro invitado y le escribe una receta. Cada uno cocina la que
le ha tocado y la lleva a la mesa. Nadie sabe quién escribió la suya hasta el
final — entonces se come juntos, se clasifican los platos y se revela la cadena.

• Crea una cena en un minuto e invita a tus amigos con un código o por nombre.
• Nombres en clave para todos: el secreto aguanta hasta la revelación.
• Las alergias y dietas se comparten con la mesa, así nadie cocina lo que un invitado no puede comer.
• Mensajes privados y una nevera compartida, en clave, mientras se cocina.
• Una votación secreta — o a mano alzada — y un menú que guardar: conserva las recetas que merece la pena repetir.
• Una fotografía por velada en el álbum.
• Ven como invitado si prefieres cocinar tu propio plato.
• Gratis. Disponible en inglés, francés, italiano y español.

---

## 2. App content (the declarations)

| Form | Answer |
|---|---|
| **Privacy policy** | the URL above |
| **App access** | *All or some functionality is restricted.* The app needs an account. Give the reviewer a ready account (see "Reviewer account" below). |
| **Ads** | **No**, the app contains no ads |
| **Content rating** (IARC questionnaire) | Category *Social / communication or utility*. Violence: none. Sexuality: none. Language: none in the content itself. Controlled substances: none. **Users can interact / share content: yes** (messages, photographs; reportable, blockable, moderated). Shares location: **no**. Digital purchases: **no**. Expect a low rating with the "users interact" notice. |
| **Target audience** | **18 and over** is the simplest and avoids the Families programme. (The terms accept 15–16+, so *16–17 and 18+* is also defensible. Do **not** include under-13s.) |
| **News app** | No |
| **COVID-19 contact tracing / status** | No |
| **Government app** | No |
| **Financial features** | None. No payments, loans or crypto. |
| **Health apps** | The app is **not** a health app (no medical features, no Health Connect). It does hold allergy and diet information, which is declared in Data safety, below. |
| **Advertising ID** | Not used |
| **Account deletion** (required) | In-app path: *Profile → Deleting your account* (thirty-day delay, cancellable). Web URL: the Help page above, which explains it and gives the contact address. |
| **User-generated content** | Yes. Reporting: phrases and photographs can be reported. Blocking: by seat. Policy: `/legal/moderation`. Contact in the footer. |

### Reviewer account

Create one ordinary account for Google's reviewer (a real address you control,
confirmed in advance), open a dinner, and leave it in a state worth looking at.
Write in *App access → instructions*: the e-mail, the password, and one line:
“Sign in, then open the dinner called *…*. All features are free.” Do not give a
personal account.

---

## 3. Data safety

**Does the app collect or share user data?** Yes.
**Is all of it encrypted in transit?** Yes (HTTPS).
**Can users ask for their data to be deleted?** Yes (in-app and via the Help page).
**Independent security review?** No.

Data **shared** with third parties for their own use: **none.** Supabase
(hosting and accounts), Netlify (serving the app) and Resend (e-mail) act as
*service providers* on our instructions, which Play does not count as sharing.
Showing a dish name or a dietary list to the other people at a dinner is the
app working, not sharing with a third party.

| Type (Play's name) | Collected | Optional? | Purpose | Notes |
|---|---|---|---|---|
| **Email address** | Yes | Required | Account management | sign-in and confirmation mail |
| **Name** | Yes | Required | App functionality | the display name; other people at a dinner see only a code name until the reveal |
| **User IDs** | Yes | Required | App functionality, account management | internal account id |
| **Health info** | Yes | Optional (you can declare none) | App functionality | allergies and diets; explicit consent at sign-up; shown to the dinner as a list with no name |
| **Photos** | Yes | Optional | App functionality | one photograph per dinner; location data is removed on the phone before upload; stored closed, shown by links that expire after an hour |
| **Other in-app messages** | Yes | Optional | App functionality | canned phrases and fridge messages; fridge messages are deleted after 24 hours |
| **Other user-generated content** | Yes | Required for playing | App functionality | recipes, dinner names, votes |
| **Device or other IDs** | Yes | Optional | App functionality | the push-notification address, only if notifications are turned on; removed when turned off |

**Not collected:** precise or approximate location, contacts, calendar, financial
information, web browsing, app interactions for analytics, crash logs,
advertising ID, search history, audio, files.

---

## 4. Technical checklist before pressing “send to review”

* `public/.well-known/assetlinks.json` carries the **App signing key** SHA-256 from
  *Play Console → App integrity* (not the upload key), and is deployed.
* `android/twa-manifest.json`: `appVersionCode` higher than the last upload.
* Migrations `0098`–`0103` applied to production **before** the web release, and
  `send-email` / `send-push` deployed after them.
* The Android build is rebuilt only when the shell changes (icons, colours,
  shortcuts, package name); web changes ship by deploying the site.
