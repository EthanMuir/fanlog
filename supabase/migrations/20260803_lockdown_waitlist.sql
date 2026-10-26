-- Lock down public.waitlist: remove direct anon INSERT.
--
-- After the captcha-gated `waitlist-signup` edge function is deployed and the
-- client is updated to call it, the anon key must no longer be able to insert
-- rows directly (that was the spam hole). The edge function writes with the
-- service_role key, which bypasses RLS, so it is unaffected.
--
-- Apply this LAST, once the new client build is live — dropping the policy
-- before then would break the existing form.

drop policy if exists "anon can insert waitlist" on public.waitlist;

-- RLS stays enabled with NO anon policy => anon can neither read nor write.
-- (service_role bypasses RLS entirely.)
