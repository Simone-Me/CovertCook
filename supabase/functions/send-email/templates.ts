// Transactional email bodies for the mail this app sends through Resend —
// written here rather than pasted into a dashboard box so they are reviewable,
// translatable and diffable like the rest of the product.
//
// THIS NOW INCLUDES THE AUTH MAIL. Sign-up confirmation and password reset used
// to belong to Supabase Auth, rendered from Authentication → Email Templates,
// and this file could not reach them. With the **Send Email Hook** enabled
// (see `index.ts`), Auth stops sending and hands every one of those mails to
// our function instead, which renders it from here. One consequence worth
// knowing: once the hook is on, an action with no template here gets NO mail
// at all — which is why `authEmail` covers every action type Auth can emit
// rather than only the two that matter today.
//
// The link is built by `index.ts` from the token hash Auth supplies; it points
// at the project's /auth/v1/verify endpoint, which validates the token and then
// redirects to `redirect_to` — the value the client passes as emailRedirectTo,
// still validated against the dashboard's redirect allow-list. If that list
// does not contain the origin, Auth falls back to Site URL, which is how those
// links once ended up pointing at localhost.
//
// Email is not the web and the rules are older and stricter:
//
//   * Layout is <table>, not flex or grid. Outlook renders through Word.
//   * Every style is inline. <style> blocks are stripped by Gmail's clipper
//     and ignored outright by several clients.
//   * No web fonts. Georgia and Helvetica are on effectively every machine;
//     CovertCook's Fraunces and Karla are not, and a font that fails silently
//     is worse than one never asked for.
//   * No background images. Some clients drop them and leave text on nothing.
//   * A plain-text part is not optional. Sending HTML alone is one of the
//     strongest spam signals there is — which matters here more than usual,
//     because a new sending domain has no reputation to spend.
//   * The link is a full visible URL as well as a button, because a button is
//     the first thing a suspicious reader distrusts and the first thing a
//     text-only client loses.

// Every action type Supabase Auth can hand to the hook. `email_change` is
// emitted twice when double confirmation is on — once to each address — and
// both get the same body, because both are asking the same question.
export type AuthEmailAction =
  | 'signup'
  | 'recovery'
  | 'invite'
  | 'magiclink'
  | 'email_change'
  | 'email_change_current'
  | 'email_change_new'

export type EmailLocale = 'en' | 'fr'

export interface AuthEmailInput {
  url: string
  locale?: EmailLocale
}

// Shared furniture: the same in every mail, so it is written once.
const CHROME = {
  en: {
    fallback: 'If the button does nothing, paste this into your browser:',
    ignore:
      'If this was not you, ignore it. Nothing was created that this link does not create, and it expires on its own.',
    spam:
      'Filed as spam? Marking it "not spam" once means the rest of your dinner\u2019s mail lands where you can find it.',
    signoff: 'See you at the pass.',
  },
  fr: {
    fallback: 'Si le bouton ne fait rien, collez ceci dans votre navigateur :',
    ignore:
      'Si ce n\u2019\u00e9tait pas vous, ignorez ce message. Rien n\u2019a \u00e9t\u00e9 cr\u00e9\u00e9 que ce lien ne cr\u00e9e, et il expire tout seul.',
    spam:
      'Class\u00e9 en ind\u00e9sirable ? Le marquer \u00ab non ind\u00e9sirable \u00bb une fois suffit pour que le reste du courrier de votre d\u00eener arrive l\u00e0 o\u00f9 vous le trouverez.',
    signoff: '\u00c0 tout \u00e0 l\u2019heure au passe.',
  },
} as const

interface ActionCopy {
  subject: string
  preheader: string
  heading: string
  lead: string
  button: string
}

const COPY: Record<AuthEmailAction, Record<EmailLocale, ActionCopy>> = {
  signup: {
    en: {
      subject: 'Confirm your email \u2014 CovertCook',
      preheader: 'One link and your seat at the table is real.',
      heading: 'One link and you are in',
      lead:
        'Somebody \u2014 we assume you \u2014 is setting up a CovertCook account. Confirm this address and your seat at the table is real.',
      button: 'Confirm my email',
    },
    fr: {
      subject: 'Confirmez votre e-mail \u2014 CovertCook',
      preheader: 'Un lien, et votre place \u00e0 table devient r\u00e9elle.',
      heading: 'Un lien et vous entrez',
      lead:
        'Quelqu\u2019un \u2014 nous supposons que c\u2019est vous \u2014 cr\u00e9e un compte CovertCook. Confirmez cette adresse et votre place \u00e0 table devient r\u00e9elle.',
      button: 'Confirmer mon e-mail',
    },
  },
  recovery: {
    en: {
      subject: 'Reset your password \u2014 CovertCook',
      preheader: 'A new password, and nothing else changes.',
      heading: 'Choose a new password',
      lead:
        'Somebody asked to reset the password for this address. Follow the link and pick a new one \u2014 your dinners, your briefs and your name are untouched either way.',
      button: 'Set a new password',
    },
    fr: {
      subject: 'R\u00e9initialisez votre mot de passe \u2014 CovertCook',
      preheader: 'Un nouveau mot de passe, et rien d\u2019autre ne change.',
      heading: 'Choisissez un nouveau mot de passe',
      lead:
        'Quelqu\u2019un a demand\u00e9 \u00e0 r\u00e9initialiser le mot de passe de cette adresse. Suivez le lien et choisissez-en un nouveau \u2014 vos d\u00eeners, vos consignes et votre nom restent intacts dans tous les cas.',
      button: 'D\u00e9finir un mot de passe',
    },
  },
  invite: {
    en: {
      subject: 'You are invited \u2014 CovertCook',
      preheader: 'A seat has been kept for you.',
      heading: 'A seat has been kept for you',
      lead:
        'Somebody set up a CovertCook account for this address. Follow the link to claim it and choose your password.',
      button: 'Claim my seat',
    },
    fr: {
      subject: 'Vous \u00eates invit\u00e9 \u2014 CovertCook',
      preheader: 'Une place vous a \u00e9t\u00e9 gard\u00e9e.',
      heading: 'Une place vous a \u00e9t\u00e9 gard\u00e9e',
      lead:
        'Quelqu\u2019un a cr\u00e9\u00e9 un compte CovertCook pour cette adresse. Suivez le lien pour la r\u00e9clamer et choisir votre mot de passe.',
      button: 'R\u00e9clamer ma place',
    },
  },
  magiclink: {
    en: {
      subject: 'Your sign-in link \u2014 CovertCook',
      preheader: 'One link, no password.',
      heading: 'Your way in',
      lead: 'Follow the link to sign in. It works once, and only from this mail.',
      button: 'Sign me in',
    },
    fr: {
      subject: 'Votre lien de connexion \u2014 CovertCook',
      preheader: 'Un lien, sans mot de passe.',
      heading: 'Votre entr\u00e9e',
      lead:
        'Suivez le lien pour vous connecter. Il ne fonctionne qu\u2019une fois, et seulement depuis ce message.',
      button: 'Me connecter',
    },
  },
  email_change: {
    en: {
      subject: 'Confirm your new address \u2014 CovertCook',
      preheader: 'Confirm the change and the new address takes over.',
      heading: 'Confirm the new address',
      lead:
        'A request was made to change the address on this CovertCook account. Confirm it here; until both ends are confirmed, nothing moves.',
      button: 'Confirm the change',
    },
    fr: {
      subject: 'Confirmez votre nouvelle adresse \u2014 CovertCook',
      preheader: 'Confirmez le changement et la nouvelle adresse prend le relais.',
      heading: 'Confirmez la nouvelle adresse',
      lead:
        'Une demande de changement d\u2019adresse a \u00e9t\u00e9 faite sur ce compte CovertCook. Confirmez-la ici ; tant que les deux extr\u00e9mit\u00e9s ne sont pas confirm\u00e9es, rien ne bouge.',
      button: 'Confirmer le changement',
    },
  },
  email_change_current: {
    en: {
      subject: 'Confirm your new address \u2014 CovertCook',
      preheader: 'Confirm the change and the new address takes over.',
      heading: 'Confirm the new address',
      lead:
        'A request was made to change the address on this CovertCook account. Confirm it here; until both ends are confirmed, nothing moves.',
      button: 'Confirm the change',
    },
    fr: {
      subject: 'Confirmez votre nouvelle adresse \u2014 CovertCook',
      preheader: 'Confirmez le changement et la nouvelle adresse prend le relais.',
      heading: 'Confirmez la nouvelle adresse',
      lead:
        'Une demande de changement d\u2019adresse a \u00e9t\u00e9 faite sur ce compte CovertCook. Confirmez-la ici ; tant que les deux extr\u00e9mit\u00e9s ne sont pas confirm\u00e9es, rien ne bouge.',
      button: 'Confirmer le changement',
    },
  },
  email_change_new: {
    en: {
      subject: 'Confirm your new address \u2014 CovertCook',
      preheader: 'Confirm the change and the new address takes over.',
      heading: 'Confirm the new address',
      lead:
        'A request was made to change the address on this CovertCook account. Confirm it here; until both ends are confirmed, nothing moves.',
      button: 'Confirm the change',
    },
    fr: {
      subject: 'Confirmez votre nouvelle adresse \u2014 CovertCook',
      preheader: 'Confirmez le changement et la nouvelle adresse prend le relais.',
      heading: 'Confirmez la nouvelle adresse',
      lead:
        'Une demande de changement d\u2019adresse a \u00e9t\u00e9 faite sur ce compte CovertCook. Confirmez-la ici ; tant que les deux extr\u00e9mit\u00e9s ne sont pas confirm\u00e9es, rien ne bouge.',
      button: 'Confirmer le changement',
    },
  },
}

// CovertCook's palette (DESIGN.md §1), as literals because email has no
// custom properties.
const LINO = '#FFFCF6'
const BUSTA = '#F6EEDD'
const PIEGA = '#DCC9A6'
const NAPPE = '#C6202C'
const INK = '#2A2320'
const MUTED = '#7A6E66'

// Renders one auth mail. The shell is identical for every action — the seal,
// the button, the visible URL, the spam line — and only the five strings at
// the top of the card change, which is what keeps a new action type a copy
// edit rather than a second template to keep in sync.
export function authEmail(action: AuthEmailAction, input: AuthEmailInput) {
  const locale: EmailLocale = input.locale ?? 'en'
  const c = COPY[action][locale]
  const x = CHROME[locale]
  const url = input.url

  const text = [c.heading, '', c.lead, '', url, '', x.ignore, '', x.spam, '', x.signoff, 'CovertCook'].join(
    '\n',
  )

  const html = `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${c.subject}</title>
</head>
<body style="margin:0;padding:0;background:${BUSTA};">
<!-- Preheader: the line the inbox shows next to the subject. Hidden in the
     body itself, or it reads as a duplicated first sentence. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${c.preheader}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BUSTA};">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="max-width:520px;background:${LINO};border:1px solid ${PIEGA};border-radius:4px;">

        <!-- The wax seal, as a character rather than an image: images are
             blocked by default in most clients, and a red disc that never
             loads is a broken-looking hole at the top of the mail. -->
        <tr>
          <td align="center" style="padding:28px 28px 0;">
            <div style="width:34px;height:34px;line-height:34px;border-radius:50%;background:${NAPPE};
                        color:${LINO};font:700 15px Georgia,serif;">CC</div>
          </td>
        </tr>

        <tr>
          <td style="padding:18px 28px 0;">
            <h1 style="margin:0;font:600 26px/1.2 Georgia,'Times New Roman',serif;color:${INK};">
              ${c.heading}
            </h1>
          </td>
        </tr>

        <tr>
          <td style="padding:12px 28px 0;font:400 15px/1.6 Helvetica,Arial,sans-serif;color:${INK};">
            ${c.lead}
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:24px 28px 0;">
            <!-- Bulletproof-ish button: a padded anchor, not a styled div, so
                 the whole shape is clickable in clients that ignore padding. -->
            <a href="${url}"
               style="display:inline-block;padding:13px 26px;background:${NAPPE};color:${LINO};
                      text-decoration:none;border-radius:999px;
                      font:700 15px Helvetica,Arial,sans-serif;">${c.button}</a>
          </td>
        </tr>

        <tr>
          <td style="padding:22px 28px 0;font:400 13px/1.6 Helvetica,Arial,sans-serif;color:${MUTED};">
            ${x.fallback}<br>
            <a href="${url}" style="color:${NAPPE};word-break:break-all;">${url}</a>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 28px 0;">
            <div style="border-top:1px dashed ${PIEGA};"></div>
          </td>
        </tr>

        <tr>
          <td style="padding:16px 28px 0;font:400 13px/1.6 Helvetica,Arial,sans-serif;color:${MUTED};">
            ${x.spam}
          </td>
        </tr>

        <tr>
          <td style="padding:10px 28px 0;font:400 13px/1.6 Helvetica,Arial,sans-serif;color:${MUTED};">
            ${x.ignore}
          </td>
        </tr>

        <tr>
          <td style="padding:20px 28px 28px;font:400 13px/1.6 Helvetica,Arial,sans-serif;color:${MUTED};">
            ${x.signoff}<br>
            <strong style="color:${INK};">CovertCook</strong>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`

  return { subject: c.subject, html, text }
}

// Kept because it reads better at the call site and because it was the name
// this file shipped with.
export function confirmEmail(input: { confirmUrl: string; locale?: EmailLocale }) {
  return authEmail('signup', { url: input.confirmUrl, locale: input.locale })
}
