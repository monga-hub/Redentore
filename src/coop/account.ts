import { createClient } from '@supabase/supabase-js';
// Same public project/storage key as Mongames. Access remains scoped by Auth/RLS.
export const account = createClient('https://dlvwczxlnqswfehfpzuy.supabase.co', 'sb_publishable_NESdfC9tzQfEhMF1vtaxdQ_vGYmm0bU', {auth:{flowType:'implicit'}});
