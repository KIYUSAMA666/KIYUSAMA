-- KIYUSAMA OS 2.0
-- RE-ENTRY DURABLE COMMIT RECEIPT v0.1 - explicit unprivileged deny policy
--
-- The table is in a private schema and table privileges are already revoked from
-- anon/authenticated. This explicit restrictive policy keeps RLS defense-in-depth
-- visible to database advisors as well: unprivileged roles receive no rows and
-- may write no rows even if a future grant is accidentally introduced.

create policy os2_reentry_atomic_commit_receipts_deny_unprivileged
on os2_reentry_v01.atomic_commit_receipts
as restrictive
for all
to anon, authenticated
using (false)
with check (false);
