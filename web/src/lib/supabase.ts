import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (typeof window !== 'undefined') {
  console.log("🛠️ Supabase Init Check:", {
    urlPresent: !!supabaseUrl,
    keyPresent: !!supabaseAnonKey,
    urlStart: supabaseUrl ? supabaseUrl.substring(0, 10) + "..." : "MISSING",
    keyType: supabaseAnonKey?.length > 100 ? "SERVICE_ROLE?" : "ANON?"
  });
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Variáveis do Supabase (NEXT_PUBLIC) faltando no ambiente do navegador!');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
