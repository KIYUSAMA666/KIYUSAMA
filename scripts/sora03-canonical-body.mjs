import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ACTOR = 'SORA_03';
export const URL = 'https://chatgpt.com/c/6abcca6d-9c2c-83ee-8c8a-d39b13be9134';
export const BRIDGE_SHA = '5EE2FAB7504782D47B476EB7F9F5C654ACBDBC1F11080027A375CDE813818168';
export const GATEWAY_URL = 'https://zdypjilutgxjsneultqj.supabase.co/functions/v1/open-room-github-oidc-probe-v1';
const reject = code => { throw new Error(code); };
export function validateWork(w) {
  if (w?.agent_id !== ACTOR) reject('ACTOR_MISMATCH');
  if (!Number.isSafeInteger(w.patrol_run_id) || w.patrol_run_id <= 0 || !Number.isSafeInteger(w.latest_entry_id) || w.latest_entry_id <= 0) reject('INVALID_COORDINATE');
  if (w.processed !== false || !(w.unread_count > 0)) reject('NO_ELIGIBLE_WORK');
  if (w.formal?.decision !== 'PASS' || w.formal?.reason !== 'CANONICAL_ACTIVE' || w.formal?.conflict !== false || w.formal?.entry_id !== w.latest_entry_id) reject('CURRENT_MISMATCH');
  if (w.eligibility?.real_work !== true || w.eligibility?.completion_only !== false || !w.ownership?.lease_id) reject('NO_WORK_OWNERSHIP');
  return w;
}
export function selectTab(payload) {
  const tabs = Array.isArray(payload) ? payload : payload?.tabs;
  if (!Array.isArray(tabs)) reject('UNKNOWN_TAB_PROTOCOL');
  const matches = tabs.filter(t => t.url === URL && Number.isSafeInteger(t.id));
  if (!matches.length) reject('CANONICAL_NOT_FOUND');
  if (matches.some(t => t.title !== matches[0].title) || !matches[0].title?.includes('3号究極ソラ部屋')) reject('TAB_IDENTITY_CONFLICT');
  return matches.sort((a,b) => a.id-b.id)[0];
}
export function extractResult(messages, w) {
  if (!Array.isArray(messages)) reject('ROLE_ISOLATION_UNAVAILABLE');
  const marker = `SORA03_RESULT_${w.patrol_run_id}_${w.latest_entry_id}`;
  const found = messages.filter(m => m.role === 'assistant' && m.complete === true && m.marker === marker && m.conversation_url === URL && m.patrol_run_id === w.patrol_run_id && m.latest_entry_id === w.latest_entry_id);
  if (found.length !== 1 || typeof found[0].body !== 'string' || !found[0].body.trim()) reject('RESULT_NOT_UNIQUE_OR_COMPLETE');
  // The deployed Edge Function uses JavaScript slice(0,3000), so count
  // UTF-16 units rather than Unicode code points to prevent silent truncation.
  if (found[0].body.length > 3000) reject('RESULT_EXCEEDS_EXISTING_COMMIT_LIMIT');
  return found[0];
}
export function requestFor(w) {
  return `OPEN_ROOM_WORK patrol_run_id=${w.patrol_run_id} latest_entry_id=${w.latest_entry_id}. Self-read formal CURRENT and unread entries through existing CENTRAL NERVE; preserve provenance and existing Bridge CLOSED. Execute eligible WORK only. Return completed assistant RESULT with marker SORA03_RESULT_${w.patrol_run_id}_${w.latest_entry_id}, both coordinates, Evidence, exclusions and NEXT. Do not SEND, commit or ACK from BODY.`;
}
export async function journalIntent(directory, w, record) {
  await mkdir(directory, {recursive:true});
  const path = join(directory, `${w.patrol_run_id}-${w.latest_entry_id}.json`);
  const f = await open(path, 'wx');
  try { await f.writeFile(JSON.stringify(record)); await f.sync(); } finally { await f.close(); }
  return path;
}
export async function bridgeCall(exe, tool, args, timeoutMs = 20000) {
  const bytes = await readFile(exe);
  if (createHash('sha256').update(bytes).digest('hex').toUpperCase() !== BRIDGE_SHA) reject('BRIDGE_HASH_MISMATCH');
  return new Promise((resolve,rejectPromise) => {
    const p = spawn(exe, ['call', tool, JSON.stringify(args)], {shell:false, windowsHide:true});
    let out = '', timedOut = false, overflow = false;
    const timer = setTimeout(() => { timedOut = true; rejectPromise(new Error('BRIDGE_TIMEOUT_UNCERTAIN')); }, timeoutMs);
    p.stdout.on('data', d => { if(out.length + d.length > 4_000_000) { overflow = true; rejectPromise(new Error('BRIDGE_OUTPUT_LIMIT_UNCERTAIN')); } else if(!overflow) out += d; });
    p.stderr.on('data', () => {});
    p.on('error', e => { clearTimeout(timer); rejectPromise(e); });
    p.on('close', code => {
      clearTimeout(timer);
      if(timedOut || overflow || code !== 0) return rejectPromise(new Error(timedOut ? 'BRIDGE_TIMEOUT_UNCERTAIN' : overflow ? 'BRIDGE_OUTPUT_LIMIT_UNCERTAIN' : `BRIDGE_EXIT_${code}`));
      try { resolve(JSON.parse(out)); } catch { rejectPromise(new Error('UNKNOWN_BRIDGE_PROTOCOL')); }
    });
  });
}
export function oidcGateway(base, token, fetchImpl = fetch) {
  const u = new globalThis.URL(base);
  if(u.href !== GATEWAY_URL) reject('INVALID_GATEWAY');
  if(!token) reject('OIDC_REQUIRED');
  const call = async (method, route, body) => {
    const r = await fetchImpl(u, {method, redirect:'error', headers:{authorization:`Bearer ${token}`,'content-type':'application/json'}, ...(body ? {body:JSON.stringify(body)} : {}), signal:AbortSignal.timeout(20000)});
    if(!r.ok) reject(`GATEWAY_${r.status}`);
    return r.json();
  };
  return {work:()=>call('GET',''), commit:body=>call('POST','',body)};
}
// FUTURE CONTRACT / MOCK ONLY: the capability, lease and structured message
// reader below are NOT provided by today's Bridge or production work_v1.
// CLI --live never enables this function. A mock capability string is not proof.
// Journal is only an immutable local SEND-intent audit. It never becomes ACK,
// CURRENT or authority. Uncertain delivery is recovered by READ, never resent.
export async function runCycle({gateway, bridge, messageReader, directory, verifyCommit}) {
  const w = validateWork(await gateway.work());
  const tab = selectTab(await bridge('tab_list',{}));
  const snap = await bridge('page_snapshot',{tabId:tab.id});
  if(snap.url !== URL || !snap.title?.includes('3号究極ソラ部屋')) reject('BODY_IDENTITY_MISMATCH');
  // Existing page_snapshot only contains interactive nodes. page_text does not
  // isolate message roles. A separately proven reader is mandatory BEFORE SEND.
  if(messageReader?.capability !== 'PROVEN_ROLE_AND_COMPLETION_V1') reject('ROLE_ISOLATION_UNAVAILABLE');
  const messages = await messageReader.read(tab.id);
  const existing = messages.filter(m => m.patrol_run_id === w.patrol_run_id && m.latest_entry_id === w.latest_entry_id);
  let result;
  if(existing.length) result = extractResult(messages,w);
  else {
    const nodes = snap.nodes;
    if(!Array.isArray(nodes)) reject('UNKNOWN_SNAPSHOT_PROTOCOL');
    const composers = nodes.filter(n => n.role === 'textbox' && n.selector?.includes('prompt-textarea'));
    const sends = nodes.filter(n => n.role === 'button' && ['Send prompt','メッセージを送信する','送信'].includes(n.name));
    if(composers.length !== 1 || sends.length !== 1) reject('COMPOSER_NOT_UNIQUE');
    if(typeof verifyCommit !== 'function') reject('AUTHORITATIVE_READBACK_REQUIRED');
    await journalIntent(directory,w,{actor:ACTOR,url:URL,tab_id:tab.id,coordinate:[w.patrol_run_id,w.latest_entry_id],lease_id:w.ownership.lease_id,send_intent:true});
    await bridge('page_fill',{tabId:tab.id,ref:composers[0].ref,value:requestFor(w)});
    const preSend = await bridge('page_snapshot',{tabId:tab.id});
    if(preSend.url !== URL) reject('PRE_SEND_IDENTITY_MISMATCH');
    const freshSend = preSend.nodes?.filter(n => n.role === 'button' && ['Send prompt','メッセージを送信する','送信'].includes(n.name));
    if(freshSend?.length !== 1) reject('SEND_NOT_UNIQUE');
    await bridge('page_click',{tabId:tab.id,ref:freshSend[0].ref});
    result = extractResult(await messageReader.read(tab.id),w);
  }
  if(typeof verifyCommit !== 'function') reject('AUTHORITATIVE_READBACK_REQUIRED');
  const committed = await gateway.commit({actor_id:ACTOR,patrol_run_id:w.patrol_run_id,latest_entry_id:w.latest_entry_id,lease_id:w.ownership.lease_id,body:result.body});
  if(committed.ok !== true || committed.acked_entry_id !== w.latest_entry_id) reject('COMMIT_ACK_MISMATCH');
  await verifyCommit(committed,result,w);
  return {state:'CYCLE_VERIFIED',coordinate:[w.patrol_run_id,w.latest_entry_id]};
}

export async function cli(argv = process.argv.slice(2), env = process.env) {
  if(argv.length !== 1 || !['--plan','--live'].includes(argv[0])) reject('USE_PLAN_OR_LIVE');
  const gateway = oidcGateway(env.SORA03_GATEWAY_URL ?? GATEWAY_URL,env.SORA03_OIDC_TOKEN);
  const payload = await gateway.work();
  const rows = Array.isArray(payload.work) ? payload.work : Array.isArray(payload) ? payload : [payload.work ?? payload];
  const own = rows.filter(w => w?.agent_id === ACTOR);
  if(own.length !== 1) reject('WORK_ACTOR_NOT_UNIQUE');
  const w = {...own[0],patrol_run_id:own[0].patrol_run_id ?? own[0].id};
  if(!Number.isSafeInteger(w.patrol_run_id) || !Number.isSafeInteger(w.latest_entry_id)) reject('INVALID_COORDINATE');
  const missing = ['proven_role_completion_reader'];
  if(!w.formal) missing.push('formal_current');
  if(!w.eligibility) missing.push('real_work_eligibility');
  if(!w.ownership) missing.push('single_owner_lease');
  if(argv[0] === '--live') reject('LIVE_CAPABILITIES_UNPROVEN_NO_SEND');
  return {status:'PLAN_ONLY_UNPROVEN_NO_SEND',actor:ACTOR,patrol_run_id:w.patrol_run_id,latest_entry_id:w.latest_entry_id,processed:w.processed,unread_count:w.unread_count,missing,send:0};
}
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli().then(r => console.log(JSON.stringify(r))).catch(e => {
    // Never print request headers, token, response bodies or environment values.
    const allowed = /^[A-Z][A-Z0-9_]+$/.test(e.message) ? e.message : 'ADAPTER_CONFIGURATION_OR_TRANSPORT_ERROR';
    console.log(JSON.stringify({status:'FAIL_CLOSED',reason:allowed,send:0}));
    process.exitCode = 1;
  });
}
