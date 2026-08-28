/**
 * Times, and the one thing everybody gets wrong about them.
 *
 * WHAT THE DATABASE STORES. Every `_at` column in this schema is `timestamptz`,
 * and a `timestamptz` does not store a time zone. It stores an instant —
 * microseconds since an epoch — and nothing else. The `+00` you see beside it
 * in the Supabase table editor is not part of the value: it is that session
 * rendering the instant, and Postgres sessions default to UTC there. Somebody
 * signing up in Paris at 17:11 in summer is stored as the instant that Paris
 * calls 17:11 and London calls 16:11 and UTC calls 15:11, and reading it back
 * as `15:11+00` is the same instant, spelled differently. Nothing was lost and
 * nothing needs converting back.
 *
 * WHY IT IS NOT SET TO PARIS. It could be — `alter database … set timezone`
 * changes what new sessions render — and it would still not be a fix, because
 * there is no such thing as "the" time zone for a value read by an app whose
 * users are not all in one place. Worse, it would move things that are not
 * about display at all: `current_date` and `::date` in the migrations decide
 * which day a fridge note belongs to, and pinning the server to Paris quietly
 * redraws that boundary at 22:00 or 23:00 UTC depending on the season. UTC on
 * the server is not a default nobody got round to changing. It is the one
 * choice that has no opinion about where anybody is.
 *
 * WHERE THE CONVERSION HAPPENS. Here, in the browser, which is the only place
 * that actually knows the answer: the phone knows its own zone and knows about
 * summer time. `new Date(iso)` parses the instant and every `toLocale*` call
 * renders it wherever the reader happens to be — 17:11 in Paris, 11:11 in New
 * York, from the same stored row, with no zone stored anywhere and nothing to
 * migrate when somebody travels.
 *
 * So the rule for this codebase is: store the instant, render it late, and
 * never write a time into the database that came out of a string. The one
 * place that goes the other way is the dinner's date and time, typed into a
 * `datetime-local` input: that value IS in the typist's own zone, and
 * `new Date(value).toISOString()` is what turns it back into an instant.
 */

/**
 * A moment, in the reader's own zone and language.
 *
 * The locale is passed rather than left to the browser on purpose: somebody
 * running the app in French on an English phone chose French, and half the
 * screen agreeing with that choice while the timestamps quietly do not is the
 * kind of small wrongness that reads as a bug in the app.
 *
 * The zone is deliberately NOT passed. It comes from the device, which is the
 * only participant in this that knows where the reader is standing.
 */
export function formatMoment(iso: string, locale = 'en'): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  return at.toLocaleString(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * The same instant, as a machine-readable attribute for `<time dateTime>`.
 *
 * Worth carrying alongside the rendered text: the rendering has dropped the
 * year, the seconds and the zone, and a screen reader or a copy-paste into a
 * bug report should still be able to recover the instant exactly.
 */
export function machineMoment(iso: string): string {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? '' : at.toISOString()
}
