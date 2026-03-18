import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// We only initialize if the keys are present to avoid crashing in environments without env vars (e.g. Vitest CI)
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : ({
        auth: {
          getSession: async () => ({ data: { session: null }, error: null }),
          getUser: async () => ({ data: { user: null }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
          signInWithPassword: async () => ({
            data: { user: null, session: null },
            error: new Error('Supabase credentials missing'),
          }),
          signOut: async () => ({ error: null }),
        },
        storage: {
          from: () => ({
            upload: async () => ({ data: null, error: new Error('Supabase credentials missing') }),
            download: async () => ({
              data: null,
              error: new Error('Supabase credentials missing'),
            }),
            remove: async () => ({ error: new Error('Supabase credentials missing') }),
            getPublicUrl: () => ({ data: { publicUrl: '' } }),
            createSignedUrl: async () => ({
              data: null,
              error: new Error('Supabase credentials missing'),
            }),
            list: async () => ({ data: null, error: new Error('Supabase credentials missing') }),
          }),
        },
      } as unknown as ReturnType<typeof createClient>);
