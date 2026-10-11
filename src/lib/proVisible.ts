// Whether Crème (PRO) shows anywhere in the app.
//
// Off while nothing is sold: every account is Crème on the server
// (app_settings.everyone_pro, migration 0104), so a badge, a "free until"
// date or a page about what it opens would describe a difference that does
// not exist. Nothing is deleted — the PRO page, the chips and the notices are
// all still here behind this flag, and turning a paid tier back on is this
// line plus `update app_settings set everyone_pro = false`.
export const PRO_VISIBLE = false
