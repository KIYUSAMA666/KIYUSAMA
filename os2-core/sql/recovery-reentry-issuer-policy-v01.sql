create table if not exists os2_reentry_v01.issuer_policy (
  policy_id text primary key,
  repository text not null,
  actor text not null,
  event_name text not null,
  ref text not null,
  workflow_path text not null,
  expected_sha text,
  updated_at timestamptz not null default now()
);

revoke all on table os2_reentry_v01.issuer_policy from public, anon, authenticated;
grant select on table os2_reentry_v01.issuer_policy to service_role;

insert into os2_reentry_v01.issuer_policy (
  policy_id, repository, actor, event_name, ref, workflow_path, expected_sha
) values (
  'OS2-RRG-V01',
  'KIYUSAMA666/KIYUSAMA',
  'KIYUSAMA666',
  'pull_request',
  'refs/pull/85/merge',
  '.github/workflows/os2-recovery-reentry-attestation-v01.yml',
  null
)
on conflict (policy_id) do update set
  repository = excluded.repository,
  actor = excluded.actor,
  event_name = excluded.event_name,
  ref = excluded.ref,
  workflow_path = excluded.workflow_path,
  expected_sha = null,
  updated_at = now();

create or replace function public.os2_reentry_read_issuer_policy(p_policy_id text)
returns jsonb
language sql
security invoker
set search_path = public, os2_reentry_v01
as $$
  select case
    when p.policy_id is null then null
    else jsonb_build_object(
      'policyId', p.policy_id,
      'repository', p.repository,
      'actor', p.actor,
      'eventName', p.event_name,
      'ref', p.ref,
      'workflowPath', p.workflow_path,
      'expectedSha', p.expected_sha
    )
  end
  from (select p_policy_id as id) i
  left join os2_reentry_v01.issuer_policy p on p.policy_id = i.id;
$$;

revoke all on function public.os2_reentry_read_issuer_policy(text) from public, anon, authenticated;
grant execute on function public.os2_reentry_read_issuer_policy(text) to service_role;
