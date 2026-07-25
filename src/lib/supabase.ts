import { createClient } from '@supabase/supabase-js'

// Only the anon key ever reaches this file — every request it makes is
// RLS-enforced. The service_role key must never appear in frontend code;
// it lives only in Edge Function env and CI secrets (see supabase/functions
// and .github/workflows).
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
