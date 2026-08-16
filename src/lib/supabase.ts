import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ucvutimcfthupaljoxdp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_ZNgikya1HBy67qA7NSdFYA_zLmdc-9N";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
