-- Italian and Spanish for the phrases that live in Postgres (0064: the nth
-- phrase of each locale is the same sentence, tied by template_key).
--
-- Each row is the English one with its body replaced, so category, slot type,
-- day-of flag, host-only flag and board role cannot drift from the original.
-- English and French stay the reference: if a key has no translation here the
-- reader simply gets the English, which is what get_message_templates already
-- does for a locale with no rows.

with t(template_key, it, es) as (values
  ('BOARD_AIMED_01', '{chef}, da qui la tua cucina ha un profumo meraviglioso.', '{chef}, desde aquí tu cocina huele de maravilla.'),
  ('BOARD_AIMED_02', '{chef}, dimmi la verità: l''hai già assaggiato?', '{chef}, dime la verdad: ¿ya lo has probado?'),
  ('BOARD_AIMED_03', '{chef}, ancora quanto?', '{chef}, ¿cuánto falta?'),
  ('BOARD_AIMED_04', 'Ho visto cosa ha comprato {chef}. Nessun commento.', 'He visto lo que ha comprado {chef}. Sin comentarios.'),
  ('BOARD_AIMED_05', 'Scommetto che è stato {chef} a scrivere la mia ricetta.', 'Apuesto a que fue {chef} quien escribió mi receta.'),
  ('BOARD_NONE_01', 'Che bella giornata!', '¡Qué día tan bonito!'),
  ('BOARD_NONE_02', 'Attenzione a non scottarti un dito ai fornelli!', '¡Cuidado con quemarte un dedo en los fogones!'),
  ('BOARD_NONE_03', 'Ricordati di salare. Assaggia di nuovo. Sala ancora.', 'Acuérdate de salar. Prueba otra vez. Sala otra vez.'),
  ('BOARD_NONE_04', 'Ti è caduto? Regola dei cinque secondi. Nessuno ha visto niente.', '¿Se te ha caído? Regla de los cinco segundos. Nadie ha visto nada.'),
  ('BOARD_NONE_05', 'Il fumo che esce dal forno fa parte della ricetta.', 'El humo que sale del horno forma parte de la receta.'),
  ('BOARD_NONE_06', 'Assaggia prima di servire. Per favore.', 'Prueba antes de servir. Por favor.'),
  ('BOARD_NONE_07', 'Se non capisci cosa manca, è il burro.', 'Si no sabes qué falta, es la mantequilla.'),
  ('BOARD_NONE_08', 'Mi piacciono le persone che dicono buongiorno.', 'Me gustan las personas que dan los buenos días.'),
  ('BOARD_NONE_09', 'Bel vestito, davvero.', 'Qué buen conjunto, de verdad.'),
  ('BOARD_NONE_10', 'Per me è tutto pronto. In bocca al lupo!', 'Por mi parte, todo listo. ¡Mucha suerte!'),
  ('BOARD_NONE_DAYOF_01', 'Ho circa 30 minuti di ritardo — iniziate senza di me!', 'Llego unos 30 minutos tarde — ¡empezad sin mí!'),
  ('BOARD_NONE_DAYOF_02', 'Sto arrivando.', 'Voy de camino.'),
  ('BOARD_NONE_DAYOF_03', 'Non è tutto pronto — passo al negozio lungo la strada.', 'No está todo listo — paro en la tienda de camino.'),
  ('BOARD_NONE_DAYOF_04', 'Mi è venuto meglio del previsto. Nessun''altra domanda.', 'Me ha salido mejor de lo esperado. Sin más preguntas.'),
  ('BOARD_NONE_DAYOF_05', 'Il mio NON è venuto come previsto. Nessun''altra domanda.', 'El mío NO ha salido como esperaba. Sin más preguntas.'),
  ('BOARD_NONE_DAYOF_06', 'Qualcuno ha un cavatappi?', '¿Alguien tiene un sacacorchos?'),
  ('BOARD_NONE_DAYOF_07', 'Appena arrivo mi serve un forno per dieci minuti.', 'Cuando llegue necesitaré un horno diez minutos.'),
  ('BOARD_NONE_DAYOF_08', 'È tutto pronto. A tra poco!', 'Todo está listo. ¡Hasta ahora!'),
  ('BOARD_OPEN_11', 'Qualcosa sta bruciando e non è mio.', 'Algo se está quemando y no es mío.'),
  ('BOARD_OPEN_12', 'Ho letto la mia ricetta quattro volte. Ho ancora dei dubbi.', 'He leído mi receta cuatro veces. Sigo teniendo dudas.'),
  ('BOARD_OPEN_13', 'Chiunque abbia scritto la mia: ho visto cosa hai fatto.', 'Quien haya escrito la mía: he visto lo que has hecho.'),
  ('BOARD_REPLY_01', 'Assolutamente no.', 'Ni hablar.'),
  ('BOARD_REPLY_02', 'Puoi contarci.', 'Puedes contar con ello.'),
  ('BOARD_REPLY_03', 'Non chiedere.', 'No preguntes.'),
  ('BOARD_REPLY_04', 'Li ho visti assaggiare.', 'Les he visto probarlo.'),
  ('BOARD_REPLY_05', 'Teoria interessante.', 'Teoría interesante.'),
  ('BOARD_REPLY_06', 'Non dico altro.', 'No diré más.'),
  ('BOARD_REPLY_07', 'Anche per me.', 'Lo mismo digo.'),
  ('BOARD_REPLY_08', 'Era voluto.', 'Fue a propósito.'),
  ('CANNOT_COOK_NONE_01', 'Ho un problema con questa ricetta — puoi aiutarmi?', 'Tengo un problema con esta receta — ¿puedes ayudarme?'),
  ('CLARIFICATION_INGREDIENT_01', 'Puoi chiarire la quantità di: {ingredient}?', '¿Puedes aclarar la cantidad de: {ingredient}?'),
  ('CLARIFICATION_INGREDIENT_02', 'Questo ingrediente è essenziale: {ingredient}?', '¿Es imprescindible este ingrediente: {ingredient}?'),
  ('HOST_ALLERGEN_CARE', 'L''Executive Chef: a questa tavola c''è un''allergia. Qualunque cosa stiate cucinando, dite chiaramente cosa contiene — ogni ingrediente, e tutto ciò con cui ha condiviso un tagliere o una padella. Nessuno deve cambiare il proprio piatto. Tutti devono poter sapere cosa stanno mangiando.', 'El Executive Chef: en esta mesa hay una alergia. Cocinéis lo que cocinéis, decid claramente qué lleva — cada ingrediente, y todo con lo que compartió tabla o sartén. Nadie tiene que cambiar su plato. Todos tienen que poder saber qué están comiendo.'),
  ('HOST_RECIPE_REVIEW', 'L''Executive Chef: qualcuno a questa tavola non riesce a cucinare ciò che ha ricevuto. Guardatelo prima insieme — un ingrediente sostituito, un passaggio omesso, una versione trovata online. Ogni ricetta qui è pensata per essere fattibile, e adattarla fa parte del gioco. Se davvero niente funziona, ditelo tra voi nella vostra conversazione privata.', 'El Executive Chef: alguien en esta mesa no puede cocinar lo que le han enviado. Mirad primero juntos — un ingrediente sustituido, un paso omitido, una versión encontrada en internet. Todas las recetas de aquí están pensadas para ser posibles, y adaptarlas forma parte del juego. Si de verdad nada funciona, decídselo en vuestro hilo privado.'),
  ('NO_BRIEF_NONE_01', 'Non ho ancora ricevuto una ricetta da cucinare.', 'Todavía no he recibido ninguna receta para cocinar.'),
  ('NUDGE_NONE_01', 'Promemoria gentile: la ricetta non è ancora finita.', 'Recordatorio amistoso: la receta aún no está terminada.'),
  ('REPLY_NONE_01', 'Sì, va bene.', 'Sí, vale.'),
  ('REPLY_NONE_02', 'No, per favore attieniti alla ricetta così com''è scritta.', 'No, por favor ciñete a la receta tal como está escrita.'),
  ('REPLY_NONE_03', 'Bella domanda, controllo.', 'Buena pregunta, lo compruebo.'),
  ('SUBSTITUTION_INGREDIENT_01', 'Posso sostituire {ingredient} con qualcos''altro?', '¿Puedo sustituir {ingredient} por otra cosa?'),
  ('THANKS_NONE_01', 'Grazie per questa ricetta, era ottima!', 'Gracias por esta receta, ¡estaba genial!')
)
insert into message_templates
  (category, locale, body, slot_type, active, day_of, template_key, host_only, board_role, slot_source)
select m.category, l.locale,
       case l.locale when 'it' then t.it else t.es end,
       m.slot_type, m.active, m.day_of, m.template_key, m.host_only, m.board_role, m.slot_source
from message_templates m
join t on t.template_key = m.template_key
cross join (values ('it'), ('es')) as l(locale)
where m.locale = 'en'
  and not exists (
    select 1 from message_templates x where x.template_key = m.template_key and x.locale = l.locale
  );

do $$
declare n int;
begin
  select count(*) into n from message_templates where locale = 'en' and active
    and template_key not in (select template_key from message_templates where locale = 'it');
  if n > 0 then
    raise exception 'message_templates: % English phrase(s) have no Italian counterpart', n;
  end if;
end $$;
