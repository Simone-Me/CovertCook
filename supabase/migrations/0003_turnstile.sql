-- Turnstile verification must happen server-side against Cloudflare's
-- siteverify API, which means it happens in the verify-turnstile Edge
-- Function (Postgres has no built-in outbound HTTP). The edge function
-- verifies the raw widget token and, on success, stamps a one-time ticket
-- here; the RPC gating a sensitive action (join_round, complete_signup)
-- consumes the ticket atomically. That keeps "this action was actually
-- turnstile-checked" a fact the database can enforce, not a client claim.

create table turnstile_tickets (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('JOIN_ROUND', 'SIGN_UP', 'SIGN_IN', 'RESET_PASSWORD')),
  subject text, -- e.g. the round join_code or email this ticket is scoped to
  verified_at timestamptz not null default now(),
  consumed_at timestamptz,
  expires_at timestamptz not null default now() + interval '10 minutes'
);

alter table turnstile_tickets enable row level security;
-- No policies: only the edge function (service_role, bypasses RLS) inserts;
-- only SECURITY DEFINER functions (also bypass RLS) consume.
revoke all on turnstile_tickets from anon, authenticated;

create or replace function consume_turnstile_ticket(p_ticket_id uuid, p_purpose text, p_subject text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_found boolean;
begin
  update turnstile_tickets
  set consumed_at = now()
  where id = p_ticket_id
    and purpose = p_purpose
    and subject is not distinct from p_subject
    and consumed_at is null
    and expires_at > now()
  returning true into v_found;

  return coalesce(v_found, false);
end;
$$;
