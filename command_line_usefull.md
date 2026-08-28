npx supabase start          # Docker Desktop acceso
npx supabase db reset       # riapplica tutte le migrazioni
npx supabase migration list --linked   # locale e deployato, affiancati

Per il deploy supabase: 
npx supabase migration up       #(0057→0060)
npx supabase functions deploy send-push

git pull
npx supabase db reset     # per prendere la 0063
# ferma e rilancia npm run dev  — Vite legge .env.local solo all'avvio