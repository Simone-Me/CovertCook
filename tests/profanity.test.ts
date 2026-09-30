import { describe, expect, it } from 'vitest'
import { findProfanity } from '../src/lib/profanity'

describe('profanity, by language', () => {
  const rude: Record<string, string[]> = {
    en: ['you are a fucking idiot', 'what a sh1t dish', 'fuuuck this', 'nazi chef'],
    fr: ['putain de recette', 'quel connard', 'ce plat est de la merde', 'salope'],
    it: ['che cazzo di ricetta', 'vaffanculo', 'sei uno stronzo', 'questa è una merda'],
    es: ['que mierda de plato', 'hijo de puta', 'gilipollas'],
    de: ['so eine scheiße', 'du arschloch'],
    pt: ['que merda', 'caralho'],
    ru: ['блять', 'сука'],
  }
  for (const [lang, phrases] of Object.entries(rude)) {
    it(`flags ${lang}`, () => {
      for (const p of phrases) expect(findProfanity(p), `${lang}: ${p}`).not.toBeNull()
    })
  }

  it('leaves real kitchen language alone', () => {
    for (const p of [
      'Spaghetti alla puttanesca', 'Chili con carne', 'Cul de poule en inox', 'Pork butt roast',
      'Bloody Mary and a cocktail', 'Coq au vin', 'Grape and draper', 'Pasta al pomodoro',
      'Poulet rôti, sauce au vin blanc', 'Tarte tatin', 'Ragù alla bolognese', 'Boudin noir',
      'Hot dog', 'Scunthorpe sausage', 'Pizza margherita per sei persone', 'Кофе с молоком',
    ]) {
      expect(findProfanity(p), p).toBeNull()
    }
  })
})
