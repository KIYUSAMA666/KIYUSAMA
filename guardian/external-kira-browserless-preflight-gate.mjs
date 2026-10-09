// Pure classification of a read-only cloud-browser personal chat preflight.
// No secrets, cookies, page content or SEND are processed here.
const eq=(a,b)=>typeof a==="string"&&a.length>0&&a===b;
export function classifyExternalBodyPreflight(expected,observed){
 if(!expected||!observed||!eq(expected.provider,"claude.ai")||!eq(expected.targetUrl,"https://claude.ai/chat/b2ed0bb2-82f9-4d4e-8fe8-5626023086dc"))return {status:"HOLD",reason:"TARGET_NOT_APPROVED"};
 if(!eq(observed.finalUrl,expected.targetUrl))return {status:"HOLD",reason:"EXACT_CHAT_NOT_REACHED"};
 if(observed.loginPromptVisible!==false||observed.passwordInputCount!==0)return {status:"HOLD",reason:"AUTH_UNPROVEN"};
 if(observed.composerCount!==1||observed.composerVisible!==true)return {status:"HOLD",reason:"COMPOSER_UNPROVEN"};
 if(observed.readOnly!==true||observed.sendCount!==0)return {status:"HOLD",reason:"PREFLIGHT_SIDE_EFFECT"};
 if(observed.sessionBoundToExpectedAccount!==true)return {status:"HOLD",reason:"ACCOUNT_BINDING_UNPROVEN"};
 return {status:"PREFLIGHT_ELIGIBLE",targetUrl:expected.targetUrl,sendCount:0};
}
