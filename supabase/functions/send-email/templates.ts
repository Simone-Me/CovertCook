// Transactional email bodies for the mail THIS APP sends through Resend:
// invitations, "the round moved on", and anything else the send-email function
// grows. Written here rather than pasted into a dashboard box so they are
// reviewable, translatable and diffable like the rest of the product.
//
// WHAT THIS FILE DOES NOT SEND, and it matters: the sign-up confirmation and
// the password reset are sent by **Supabase Auth**, not by us. Auth owns those
// two, renders them from the templates in Authentication → Email Templates,
// and never calls this function. confirmEmail() below is the design to paste
// in there — or to send from here later if those flows are ever moved onto
// Resend — but editing this file alone changes nothing about the mail a new
// account receives today.
//
// The link inside the Auth mail comes from `{{ .ConfirmationURL }}`, which Auth
// builds from emailRedirectTo (now set at the call site) validated against the
// dashboard's redirect allow-list. If the allow-list does not contain the
// origin, Auth silently falls back to Site URL — which is how those links ended
// up pointing at localhost.
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

export interface ConfirmEmailInput {
  confirmUrl: string
  locale?: 'en' | 'fr'
}

const COPY = {
  en: {
    subject: 'Confirm your email — CovertCook',
    preheader: 'One link and your seat at the table is real.',
    heading: 'One link and you are in',
    lead:
      'Somebody — we assume you — is setting up a CovertCook account. Confirm this address and your seat at the table is real.',
    button: 'Confirm my email',
    fallback: 'If the button does nothing, paste this into your browser:',
    ignore:
      'If this was not you, ignore it. Nothing was created that this link does not create, and it expires on its own.',
    spam:
      'Filed as spam? Marking it "not spam" once means the rest of your dinner’s mail lands where you can find it.',
    signoff: 'See you at the pass.',
  },
  fr: {
    subject: 'Confirmez votre e-mail — CovertCook',
    preheader: 'Un lien, et votre place à table devient réelle.',
    heading: 'Un lien et vous entrez',
    lead:
      'Quelqu’un — nous supposons que c’est vous — crée un compte CovertCook. Confirmez cette adresse et votre place à table devient réelle.',
    button: 'Confirmer mon e-mail',
    fallback: 'Si le bouton ne fait rien, collez ceci dans votre navigateur :',
    ignore:
      'Si ce n’était pas vous, ignorez ce message. Rien n’a été créé que ce lien ne crée, et il expire tout seul.',
    spam:
      'Classé en indésirable ? Le marquer « non indésirable » une fois suffit pour que le reste du courrier de votre dîner arrive là où vous le trouverez.',
    signoff: 'À tout à l’heure au passe.',
  },
} as const

// CovertCook's palette (DESIGN.md §1), as literals because email has no
// custom properties.
const LINO = '#FFFCF6'
const BUSTA = '#F6EEDD'
const PIEGA = '#DCC9A6'
const NAPPE = '#C6202C'
const INK = '#2A2320'
const MUTED = '#7A6E66'

export function confirmEmail(input: ConfirmEmailInput) {
  const t = COPY[input.locale ?? 'en']
  const url = input.confirmUrl

  const text = [
    t.heading,
    '',
    t.lead,
    '',
    url,
    '',
    t.ignore,
    '',
    t.spam,
    '',
    t.signoff,
    'CovertCook',
  ].join('\n')

  const html = `<!doctype html>
<html lang="${input.locale ?? 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t.subject}</title>
</head>
<body style="margin:0;padding:0;background:${BUSTA};">
<!-- Preheader: the line the inbox shows next to the subject. Hidden in the
     body itself, or it reads as a duplicated first sentence. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${t.preheader}</div>

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
              ${t.heading}
            </h1>
          </td>
        </tr>

        <tr>
          <td style="padding:12px 28px 0;font:400 15px/1.6 Helvetica,Arial,sans-serif;color:${INK};">
            ${t.lead}
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:24px 28px 0;">
            <!-- Bulletproof-ish button: a padded anchor, not a styled div, so
                 the whole shape is clickable in clients that ignore padding. -->
            <a href="${url}"
               style="display:inline-block;padding:13px 26px;background:${NAPPE};color:${LINO};
                      text-decoration:none;border-radius:999px;
                      font:700 15px Helvetica,Arial,sans-serif;">${t.button}</a>
          </td>
        </tr>

        <tr>
          <td style="padding:22px 28px 0;font:400 13px/1.6 Helvetica,Arial,sans-serif;color:${MUTED};">
            ${t.fallback}<br>
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
            ${t.spam}
          </td>
        </tr>

        <tr>
          <td style="padding:10px 28px 0;font:400 13px/1.6 Helvetica,Arial,sans-serif;color:${MUTED};">
            ${t.ignore}
          </td>
        </tr>

        <tr>
          <td style="padding:20px 28px 28px;font:400 13px/1.6 Helvetica,Arial,sans-serif;color:${MUTED};">
            ${t.signoff}<br>
            <strong style="color:${INK};">CovertCook</strong>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`

  return { subject: t.subject, html, text }
}
