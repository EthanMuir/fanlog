// Stand-in for jsr:@supabase/supabase-js@2 in the edge function's unit tests.
// Tests set `createClient` to a fake through `setCreateClient`.
let impl = () => {
  throw new Error('createClient not stubbed');
};

export function setCreateClient(fn) {
  impl = fn;
}

export function createClient(...args) {
  return impl(...args);
}
