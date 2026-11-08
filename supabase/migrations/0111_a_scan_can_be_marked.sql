-- ---------------------------------------------------------------------------
-- A SCAN CAN BE MARKED: what the user corrected after "Analyse your plate".
--
-- /scan recognises ingredients ON THE PHONE (an int8 model run by
-- onnxruntime-web): the photo never leaves it. When the user presses
-- "Evaluate", removes what was wrong and adds what was missing, then sends,
-- this is what arrives — and only this:
--
--   * which model answered (model_version, from its meta.json),
--   * the ingredient ids it proposed, with their probabilities,
--   * the ids the user removed and the ids the user added.
--
-- NO PHOTO, and nothing else about the plate. That keeps the promise the page
-- makes, and it is still enough to measure the model in real use: how often
-- each ingredient is proposed wrongly (removed) or missed (added), and whether
-- that drifts from one model version to the next. It is not training data:
-- training needs the photo, and that would need a consent this table does
-- not ask for.
--
-- THE SCORES ARE COMPUTED HERE, not trusted from the client:
--   correct   = proposed minus removed
--   precision = correct / proposed            (what it said, how much was right)
--   recall    = correct / (correct + added)   (what was there, how much it saw)
--   jaccard   = correct / (proposed + added)  (one number: shown to the user)
--
-- WRITES GO THROUGH submit_scan_feedback() ONLY, like everything else since
-- 0109: the table grants nothing to anon or authenticated. Signed-in users
-- only (the scan itself is public, sending is not), ids must be FoodSeg103
-- ingredient ids (1..103), and 30 marks per hour per person is the ceiling —
-- far above a person checking their own plates, far below a script.
-- Nobody reads the rows from the app; they are read from the dashboard.
-- ---------------------------------------------------------------------------

create table scan_feedback (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  model_version text not null,
  proposed smallint[] not null,
  proposed_probs real[] not null,
  removed smallint[] not null,
  added smallint[] not null,
  precision_score real,
  recall_score real,
  jaccard_score real
);

comment on table scan_feedback is
  'User corrections of an on-device ingredient scan (/scan). No photo: ids only. Written by submit_scan_feedback() (0111).';

create index scan_feedback_profile_recent on scan_feedback (profile_id, created_at desc);

alter table scan_feedback enable row level security;
revoke all on scan_feedback from anon, authenticated;

create or replace function submit_scan_feedback(
  p_model_version text,
  p_proposed smallint[],
  p_proposed_probs real[],
  p_removed smallint[],
  p_added smallint[]
)
returns table (out_precision real, out_recall real, out_jaccard real)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_recent int;
  v_proposed int;
  v_correct int;
  v_added int;
  v_precision real;
  v_recall real;
  v_jaccard real;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN';
  end if;

  if p_model_version is null or length(p_model_version) not between 1 and 64 then
    raise exception 'BAD_MODEL_VERSION';
  end if;

  -- 103 ingredients at most in each list, every id a FoodSeg103 ingredient,
  -- one probability per proposed id, removed taken from proposed, added not in it.
  if coalesce(cardinality(p_proposed), 0) > 103 or coalesce(cardinality(p_added), 0) > 103
     or coalesce(cardinality(p_proposed_probs), 0) <> coalesce(cardinality(p_proposed), 0)
     or exists (select 1 from unnest(coalesce(p_proposed, '{}') || coalesce(p_removed, '{}') || coalesce(p_added, '{}')) as i
                where i not between 1 and 103)
     or exists (select 1 from unnest(coalesce(p_proposed_probs, '{}')) as p where p is null or p < 0 or p > 1)
     or not (coalesce(p_removed, '{}') <@ coalesce(p_proposed, '{}'))
     or coalesce(p_added, '{}') && coalesce(p_proposed, '{}') then
    raise exception 'BAD_SCAN_FEEDBACK';
  end if;

  select count(*) into v_recent from scan_feedback
  where profile_id = v_uid and created_at > now() - interval '1 hour';
  if v_recent >= 30 then
    raise exception 'RATE_LIMIT';
  end if;

  v_proposed := (select count(distinct i) from unnest(coalesce(p_proposed, '{}')) as i);
  v_correct := v_proposed - (select count(distinct i) from unnest(coalesce(p_removed, '{}')) as i);
  v_added := (select count(distinct i) from unnest(coalesce(p_added, '{}')) as i);

  v_precision := case when v_proposed > 0 then v_correct::real / v_proposed end;
  v_recall := case when v_correct + v_added > 0 then v_correct::real / (v_correct + v_added) end;
  v_jaccard := case when v_proposed + v_added > 0 then v_correct::real / (v_proposed + v_added) end;

  insert into scan_feedback (profile_id, model_version, proposed, proposed_probs, removed, added, precision_score, recall_score, jaccard_score)
  values (v_uid, p_model_version, coalesce(p_proposed, '{}'), coalesce(p_proposed_probs, '{}'),
          coalesce(p_removed, '{}'), coalesce(p_added, '{}'), v_precision, v_recall, v_jaccard);

  return query select v_precision, v_recall, v_jaccard;
end;
$$;

comment on function submit_scan_feedback(text, smallint[], real[], smallint[], smallint[]) is
  'Stores the corrections of one scan (ids only, no photo) and returns precision, recall and Jaccard (0111).';

revoke all on function submit_scan_feedback(text, smallint[], real[], smallint[], smallint[]) from public, anon;
grant execute on function submit_scan_feedback(text, smallint[], real[], smallint[], smallint[]) to authenticated;
