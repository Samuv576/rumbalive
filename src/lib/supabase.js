import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// null mientras no exista el proyecto Supabase: la app arranca igual (modo calibración).
export const supabase = url && key ? createClient(url, key) : null
