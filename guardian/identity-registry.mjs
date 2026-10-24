export class IdentityRegistryError extends Error {
 constructor(reason){super("IDENTITY_REGISTRY_UNRESOLVED: "+reason);this.name="IdentityRegistryError";this.reason=reason;}
}
export class GuardianIdentityRegistry {
 constructor(entries=[]){
  this.entries=new Map();
  for(const e of entries) this.register(e);
 }
 register(e){
  for(const k of ["agentId","provider","conversationId","canonicalUrl","bodyId"])
   if(!e?.[k]) throw new IdentityRegistryError("IDENTITY_FACT_MISSING:"+k);
  this.entries.set(e.agentId,Object.freeze({...e}));
 }
 resolve(work, coordinates){
  const identity=this.entries.get(work?.agent_id);
  if(!identity) throw new IdentityRegistryError("BODY_IDENTITY_NOT_REGISTERED");
  for(const k of ["ownerId","workId","expectedUserTurnId"])
   if(!coordinates?.[k]) throw new IdentityRegistryError("WORK_COORDINATE_MISSING:"+k);
  if(coordinates.agentId!==work.agent_id) throw new IdentityRegistryError("AGENT_ID_MISMATCH");
  if(coordinates.patrolRunId!==work.id) throw new IdentityRegistryError("PATROL_RUN_MISMATCH");
  return Object.freeze({
   identity,
   expected:Object.freeze({bodyId:identity.bodyId,ownerId:coordinates.ownerId,workId:coordinates.workId,expectedUserTurnId:coordinates.expectedUserTurnId}),
   work:Object.freeze({bodyId:identity.bodyId,ownerId:coordinates.ownerId,workId:coordinates.workId,expectedUserTurnId:coordinates.expectedUserTurnId}),
  });
 }
}
