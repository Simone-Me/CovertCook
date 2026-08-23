-- "I have a problem" is a question, not a resignation.
--
-- The button a cook presses when a recipe is beyond them sent "I won't be able
-- to cook this dish after all" — which ends the conversation at the exact
-- moment it should start one. Most of the time the cook cannot find an
-- ingredient, or has never made the thing, and the person who wrote it can
-- solve that in one reply.
--
-- The category stays CANNOT_COOK, because what it *does* is still right: it
-- raises a host alert (0008), so the Executive Chef knows a dish is at risk
-- while there is still time to do something about it. Only the wording moves.

update message_templates
set body = 'I have a problem with this recipe — can you help me?'
where category = 'CANNOT_COOK' and locale = 'en';

update message_templates
set body = 'J''ai un problème avec cette recette — pouvez-vous m''aider ?'
where category = 'CANNOT_COOK' and locale = 'fr';
