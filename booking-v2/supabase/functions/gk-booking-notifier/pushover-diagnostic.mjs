// Pushover validation results are classified without returning provider data,
// application tokens, user keys, device names, or raw error strings to the UI.
const recognized=(message)=>{
 const s=String(message||"").toLowerCase();
 if(/(?:token|application|app(?:lication)? key)/.test(s) && /(?:invalid|unknown|incorrect|not found|missing|not valid)/.test(s))return "invalid_app_token";
 if(/(?:user|recipient|group|identifier)/.test(s) && /(?:invalid|unknown|incorrect|not found|missing|not valid)/.test(s))return "invalid_user_key";
 if(/(?:no|without|zero).*(?:active|registered).*(?:devices?)|no devices?|device.*(?:not registered|not active)/.test(s))return "no_active_device";
 if(/rate.limit|too many|quota|requests.*limit/.test(s))return "rate_limited";
 return null;
};
export function classifyPushoverValidation({httpStatus,body,failedFetch=false,keyFormatValid=true}={}){
 if(!keyFormatValid)return {ok:false,reason:"key_format_invalid"};
 if(failedFetch)return {ok:false,reason:"network_error"};
 if(httpStatus===429)return {ok:false,reason:"rate_limited"};
 if(httpStatus>=500)return {ok:false,reason:"provider_unavailable"};
 if(httpStatus===200&&body?.status===1)return {ok:true,reason:"ok"};
 const errors=Array.isArray(body?.errors)?body.errors:
  typeof body?.errors==="string"?[body.errors]:[];
 for(const message of errors){
  const why=recognized(message);
  if(why)return {ok:false,reason:why};
 }
 if(typeof body?.user==="string"&&body.user.toLowerCase()==="invalid")
  return {ok:false,reason:"invalid_user_key"};
 if(typeof body?.token==="string"&&body.token.toLowerCase()==="invalid")
  return {ok:false,reason:"invalid_app_token"};
 if(httpStatus===401||httpStatus===403)return {ok:false,reason:"invalid_app_token"};
 if(httpStatus===200&&body?.status===0)return {ok:false,reason:"invalid_recipient_or_no_device"};
 return {ok:false,reason:"provider_rejected"};
}
export function pushoverKeyFormat(appToken,userKey){
 // Pushover's documented keys are normally 30 alphanumeric characters.
 return /^[a-zA-Z0-9]{30}$/.test(appToken)&&/^[a-zA-Z0-9]{30}$/.test(userKey);
}
