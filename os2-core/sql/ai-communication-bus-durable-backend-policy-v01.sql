-- KIYUSAMA OS 2.0
-- AI COMMUNICATION BUS durable backend defense-in-depth RLS policy v0.1

drop policy if exists os2_bus_deny_public_clients_v01 on os2_bus_v01.messages;
create policy os2_bus_deny_public_clients_v01
on os2_bus_v01.messages
as restrictive
for all
to anon, authenticated
using (false)
with check (false);
