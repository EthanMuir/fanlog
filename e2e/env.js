export const APP_PORT = 4300;
export const APP_URL = `http://localhost:${APP_PORT}`;

// The build points at a Supabase project that doesn't exist; every request
// to it is answered by the fake in fixtures.js. It has to look like a real
// project URL, because the analytics SDK ignores anything else.
export const SUPABASE_URL = 'https://e2etest.supabase.co';
export const ANON_KEY = 'e2e-anon-key';

export const BUILD_ENV = {
  VITE_SUPABASE_URL: SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: ANON_KEY,
};
