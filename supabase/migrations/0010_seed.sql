-- Reference data: canned chat templates (FR + EN) and secret-name word
-- lists. Both are keyed by locale so adding a question or a new word never
-- needs a redeploy — just an insert.

insert into message_templates (category, locale, body, slot_type) values
  ('CLARIFICATION', 'fr', 'Peux-tu préciser la quantité pour : {ingredient} ?', 'INGREDIENT'),
  ('CLARIFICATION', 'fr', 'Cet ingrédient est-il indispensable : {ingredient} ?', 'INGREDIENT'),
  ('CLARIFICATION', 'en', 'Can you clarify the quantity for: {ingredient}?', 'INGREDIENT'),
  ('CLARIFICATION', 'en', 'Is this ingredient essential: {ingredient}?', 'INGREDIENT'),

  ('SUBSTITUTION', 'fr', 'Puis-je remplacer {ingredient} par autre chose ?', 'INGREDIENT'),
  ('SUBSTITUTION', 'en', 'Can I substitute {ingredient} with something else?', 'INGREDIENT'),

  ('NUDGE', 'fr', 'Petit rappel amical : la recette n''est pas encore prête.', 'NONE'),
  ('NUDGE', 'en', 'Friendly reminder: the brief isn''t finished yet.', 'NONE'),

  ('CANNOT_COOK', 'fr', 'Je ne pourrai finalement pas préparer ce plat.', 'NONE'),
  ('CANNOT_COOK', 'en', 'I won''t be able to cook this dish after all.', 'NONE'),

  ('NO_BRIEF', 'fr', 'Je n''ai pas encore reçu de recette à préparer.', 'NONE'),
  ('NO_BRIEF', 'en', 'I haven''t received a brief to cook yet.', 'NONE'),

  ('THANKS', 'fr', 'Merci pour cette recette, c''était top !', 'NONE'),
  ('THANKS', 'en', 'Thanks for this brief, it was great!', 'NONE'),

  ('REPLY', 'fr', 'Oui, ça marche comme ça.', 'NONE'),
  ('REPLY', 'fr', 'Non, merci de suivre la recette telle quelle.', 'NONE'),
  ('REPLY', 'fr', 'Bonne question, je vais me renseigner.', 'NONE'),
  ('REPLY', 'en', 'Yes, that works.', 'NONE'),
  ('REPLY', 'en', 'No, please stick to the brief as written.', 'NONE'),
  ('REPLY', 'en', 'Good question, let me check.', 'NONE');

insert into secret_name_words (locale, word) values
  ('fr', 'Basilic'), ('fr', 'Truffe'), ('fr', 'Paprika'), ('fr', 'Cannelle'),
  ('fr', 'Safran'), ('fr', 'Cardamome'), ('fr', 'Cumin'), ('fr', 'Muscade'),
  ('fr', 'Anis'), ('fr', 'Gingembre'), ('fr', 'Réglisse'), ('fr', 'Estragon'),
  ('fr', 'Persil'), ('fr', 'Thym'), ('fr', 'Romarin'), ('fr', 'Laurier'),
  ('fr', 'Menthe'), ('fr', 'Coriandre'), ('fr', 'Vanille'), ('fr', 'Poivre'),
  ('fr', 'Fenouil'), ('fr', 'Sauge'), ('fr', 'Origan'), ('fr', 'Clou de Girofle'),

  ('en', 'Basil'), ('en', 'Truffle'), ('en', 'Paprika'), ('en', 'Cinnamon'),
  ('en', 'Saffron'), ('en', 'Cardamom'), ('en', 'Cumin'), ('en', 'Nutmeg'),
  ('en', 'Anise'), ('en', 'Ginger'), ('en', 'Licorice'), ('en', 'Tarragon'),
  ('en', 'Parsley'), ('en', 'Thyme'), ('en', 'Rosemary'), ('en', 'Bay Leaf'),
  ('en', 'Mint'), ('en', 'Coriander'), ('en', 'Vanilla'), ('en', 'Pepper'),
  ('en', 'Fennel'), ('en', 'Sage'), ('en', 'Oregano'), ('en', 'Clove');
