/**
 * The food a person cannot eat, as codes rather than as words.
 *
 * WHY CODES. `README.md` records the simplification this replaces: allergy
 * matching was **exact-string**, so a French player writing *céleri* and an
 * English one writing *celery* were two different allergens, and a dish
 * declared safe for one was never checked against the other. A picture grid
 * only fixes that if the tile stores `CELERY` and shows the translation — store
 * the visible word and it is the same bug in two languages, with nicer art.
 *
 * The codes are therefore permanent. A tile can be renamed, redrawn or
 * translated freely; its code is what is written into `dietary_entries.label`
 * and compared against a brief's `contains_tags`, and changing one orphans
 * every row that already holds it.
 *
 * WHAT IS NOT HERE. Anything a person types into the "other" tile. That is a
 * free-text label, exactly as this column has always held, and it cannot be
 * matched against a coded tag — so it is shown to the cook in words and never
 * silently checked. `isFoodCode` is how the interface tells the two apart.
 */

export interface FoodTag {
  code: string
  /** File under public/allergy or public/diet, without extension. */
  file: string
}

/** The fourteen the EU requires, plus the escape hatch. */
export const ALLERGENS: FoodTag[] = [
  { code: 'GLUTEN', file: 'gluten-free' },
  { code: 'CRUSTACEANS', file: 'no-shrimp' },
  { code: 'EGG', file: 'no-egg' },
  { code: 'FISH', file: 'no-fish' },
  { code: 'PEANUTS', file: 'no-peanuts' },
  { code: 'SOY', file: 'no-soy' },
  { code: 'MILK', file: 'no-milk' },
  { code: 'NUTS', file: 'no-nuts' },
  { code: 'CELERY', file: 'no-celery' },
  { code: 'MUSTARD', file: 'no-mustard' },
  { code: 'SESAME', file: 'no-sesame' },
  { code: 'SULPHITES', file: 'no-sulphites' },
  { code: 'LUPIN', file: 'no-lupins' },
  { code: 'MOLLUSCS', file: 'no-shellfish' },
  { code: 'OTHER', file: 'other' },
]

/** Diets: rules a cook has to design around, not tastes. */
export const DIETS: FoodTag[] = [
  { code: 'VEGETARIAN', file: 'vegetarian' },
  { code: 'VEGAN', file: 'vegan' },
  { code: 'PESCATARIAN', file: 'pescatarian' },
  { code: 'NO_MEAT', file: 'no-meat' },
  { code: 'NO_BEEF', file: 'no-cow-meat' },
  { code: 'NO_DAIRY', file: 'no-dairy' },
  { code: 'HALAL', file: 'halal' },
  { code: 'KOSHER', file: 'kosher' },
  { code: 'NO_ALCOHOL', file: 'no-alcohol' },
  { code: 'NO_SMOKING', file: 'no-smoking' },
]

/** The code the "other" tile carries until somebody types a real one. */
export const OTHER_CODE = 'OTHER'

const BY_CODE = new Map<string, { tag: FoodTag; dir: 'allergy' | 'diet' }>()
for (const tag of ALLERGENS) BY_CODE.set(tag.code, { tag, dir: 'allergy' })
for (const tag of DIETS) BY_CODE.set(tag.code, { tag, dir: 'diet' })

/** True for a stored label that is one of ours, false for anything typed. */
export function isFoodCode(label: string): boolean {
  return BY_CODE.has(label)
}

export function foodIconSrc(code: string): string | null {
  const found = BY_CODE.get(code)
  return found ? `/${found.dir}/${found.tag.file}.webp` : null
}
