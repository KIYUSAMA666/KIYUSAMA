alter table common_memory.agent_messages
  add column if not exists claimed_execution_id text;

alter table common_memory.agent_messages
  drop constraint if exists agent_messages_claimed_execution_id_shape_v01;
alter table common_memory.agent_messages
  add constraint agent_messages_claimed_execution_id_shape_v01
  check (claimed_execution_id is null or (length(btrim(claimed_execution_id)) >= 8 and length(claimed_execution_id) <= 200));

create or replace function common_memory.kira_executor_claim_v1(p_message_id uuid, p_execution_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'common_memory','pg_catalog'
as $function$
declare
  v_row common_memory.agent_messages%rowtype;
  v_action uuid := gen_random_uuid();
begin
  if p_message_id is null or p_execution_id is null or length(btrim(p_execution_id)) < 8 or length(p_execution_id) > 200 then
    return jsonb_build_object('ok',false,'error','INVALID_EXECUTOR_REQUEST');
  end if;

  update common_memory.agent_messages
     set status='PROCESSING', claimed_by='KIRA', claimed_at=clock_timestamp(), claimed_execution_id=p_execution_id, updated_at=clock_timestamp()
   where id=p_message_id and to_agent='KIRA' and status='SIGNAL_RECEIVED' and claimed_by is null and claimed_execution_id is null
  returning * into v_row;

  if not found then
    if exists(select 1 from common_memory.agent_messages where id=p_message_id and claimed_by='KIRA') then
      return jsonb_build_object('ok',false,'error','ALREADY_CLAIMED');
    end if;
    return jsonb_build_object('ok',false,'error','NOT_CLAIMABLE');
  end if;

  insert into common_memory.audit_log(action_id,event_type,actor_id,target_type,target_id,result,evidence)
  values(v_action,'AI_EXECUTOR_WAKE_STARTED','KIRA_EXECUTOR_V1','agent_message',v_row.id::text,'SUCCESS',
    jsonb_build_object('execution_id',p_execution_id,'thread_id',v_row.thread_id,'from_agent',v_row.from_agent,'to_agent',v_row.to_agent,'hop_count',v_row.hop_count,'max_hops',v_row.max_hops,'trust_class',v_row.trust_class,'instruction_scope',v_row.instruction_scope,'requires_human_approval',v_row.requires_human_approval,'content_logged',false));

  return jsonb_build_object('ok',true,'message_id',v_row.id,'thread_id',v_row.thread_id,'parent_message_id',v_row.parent_message_id,'from_agent',v_row.from_agent,'to_agent',v_row.to_agent,'body',v_row.body,'body_hash',v_row.body_hash,'hop_count',v_row.hop_count,'max_hops',v_row.max_hops,'requires_human_approval',v_row.requires_human_approval,'trust_class',v_row.trust_class,'instruction_scope',v_row.instruction_scope,'status','PROCESSING','execution_id',p_execution_id);
end;
$function$;

create or replace function common_memory.kira_executor_reply_v1(p_message_id uuid, p_reply text, p_execution_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'common_memory','extensions','pg_catalog'
as $function$
declare
  v_src common_memory.agent_messages%rowtype;
  v_reply_id uuid; v_reply_hash text; v_sensitive text; v_action_id uuid := gen_random_uuid(); v_reply_status text;
begin
  if p_reply is null or btrim(p_reply)='' or length(p_reply)>50000 then return jsonb_build_object('ok',false,'error','INVALID_REPLY_BODY'); end if;
  if p_execution_id is null or length(btrim(p_execution_id)) < 8 or length(p_execution_id) > 200 then return jsonb_build_object('ok',false,'error','INVALID_EXECUTOR_REQUEST'); end if;

  v_sensitive := common_memory.detect_sensitive_payload(p_reply);
  if v_sensitive is not null then
    insert into common_memory.audit_log(action_id,event_type,actor_id,target_type,target_id,result,evidence)
    values(v_action_id,'AI_EXECUTOR_REPLY_BLOCKED','KIRA_EXECUTOR_V1','agent_message',p_message_id::text,'BLOCKED',jsonb_build_object('reason',v_sensitive,'content_logged',false,'execution_id',p_execution_id));
    return jsonb_build_object('ok',false,'error','SENSITIVE_CONTENT_BLOCKED','category',v_sensitive);
  end if;

  select * into v_src from common_memory.agent_messages where id=p_message_id for update;
  if not found then return jsonb_build_object('ok',false,'error','MESSAGE_NOT_FOUND'); end if;
  if v_src.to_agent <> 'KIRA' or v_src.from_agent <> 'SORA' then return jsonb_build_object('ok',false,'error','INVALID_ROUTE'); end if;
  if v_src.status <> 'PROCESSING' or v_src.claimed_by <> 'KIRA' then return jsonb_build_object('ok',false,'error','MESSAGE_NOT_CLAIMED_BY_KIRA'); end if;
  if v_src.claimed_execution_id is null or v_src.claimed_execution_id <> p_execution_id then return jsonb_build_object('ok',false,'error','EXECUTION_ID_MISMATCH'); end if;

  v_reply_hash := encode(digest(convert_to(p_reply,'UTF8'),'sha256'),'hex');
  v_reply_status := case when (v_src.hop_count + 1) < v_src.max_hops then 'NEW' else 'REPLIED' end;

  insert into common_memory.agent_messages(thread_id,parent_message_id,from_agent,to_agent,body,body_hash,status,hop_count,max_hops,requires_human_approval,claimed_by,trust_class,instruction_scope)
  values(v_src.thread_id,v_src.id,'KIRA','SORA',p_reply,v_reply_hash,v_reply_status,least(v_src.hop_count+1,8),v_src.max_hops,false,case when v_reply_status='REPLIED' then 'KIRA' else null end,'AUTHENTICATED_INTERNAL','REVIEW_ONLY')
  returning id into v_reply_id;

  update common_memory.agent_messages set status='REPLIED', replied_at=clock_timestamp() where id=v_src.id and claimed_execution_id=p_execution_id;

  insert into common_memory.audit_log(action_id,event_type,actor_id,target_type,target_id,result,evidence)
  values(v_action_id,'AI_EXECUTOR_REPLY_STORED','KIRA_EXECUTOR_V2C','agent_message',v_reply_id::text,'SUCCESS',jsonb_build_object('parent_message_id',v_src.id,'thread_id',v_src.thread_id,'reply_hash',v_reply_hash,'execution_id',p_execution_id,'content_logged',false,'reverse_signal_emitted',(v_reply_status='NEW'),'trust_class','AUTHENTICATED_INTERNAL','instruction_scope','REVIEW_ONLY'));

  return jsonb_build_object('ok',true,'status','REPLY_STORED','reply_message_id',v_reply_id,'thread_id',v_src.thread_id,'reply_hash',v_reply_hash,'execution_id',p_execution_id,'reverse_signal_emitted',(v_reply_status='NEW'));
end;
$function$;

create or replace function common_memory.kira_executor_release_v1(p_message_id uuid, p_execution_id text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'common_memory','pg_catalog'
as $function$
declare
  v_action_id uuid := gen_random_uuid();
  v_updated int;
begin
  if p_reason not in ('PROVIDER_NOT_CONFIGURED','PROVIDER_REQUEST_FAILED','PROVIDER_INVALID_RESPONSE','MANAGED_SESSION_BUSY','MANAGED_AGENT_NO_FRESH_REPLY') then
    return jsonb_build_object('ok',false,'error','INVALID_RELEASE_REASON');
  end if;
  if p_execution_id is null or length(btrim(p_execution_id)) < 8 or length(p_execution_id) > 200 then
    return jsonb_build_object('ok',false,'error','INVALID_EXECUTOR_REQUEST');
  end if;

  update common_memory.agent_messages
  set status='SIGNAL_RECEIVED', claimed_by=null, claimed_at=null, claimed_execution_id=null
  where id=p_message_id and status='PROCESSING' and claimed_by='KIRA' and claimed_execution_id=p_execution_id;
  get diagnostics v_updated = row_count;

  if v_updated <> 1 then
    if exists(select 1 from common_memory.agent_messages where id=p_message_id and status='PROCESSING' and claimed_by='KIRA') then
      return jsonb_build_object('ok',false,'error','EXECUTION_ID_MISMATCH');
    end if;
    return jsonb_build_object('ok',false,'error','MESSAGE_NOT_RELEASABLE');
  end if;

  insert into common_memory.audit_log(action_id,event_type,actor_id,target_type,target_id,result,evidence)
  values(v_action_id,'AI_EXECUTOR_RELEASED','KIRA_EXECUTOR_V2','agent_message',p_message_id::text,'STOPPED',jsonb_build_object('reason',p_reason,'execution_id',p_execution_id,'content_logged',false));

  return jsonb_build_object('ok',true,'status','SIGNAL_RECEIVED','reason',p_reason,'execution_id',p_execution_id);
end;
$function$;
