// GolfKongen Booking2: ONLY consumes events emitted by the atomic
// confirmed-paid reservation transaction. No Quickbutik order ingestion.
// No independent Nuki webhooks, no browser access to reservation details.
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
import {verifyDispatchRequest} from "./dispatch-auth.mjs";
import {verifyDiagnosticRequest} from "./diagnostic-auth.mjs";
import {classifyPushoverValidation,pushoverKeyFormat} from "./pushover-diagnostic.mjs";
import {resolveGolfkongenDeliveryGroup,GROUP_NAME} from "./pushover-group.mjs";
import {checkedBooking,nukiPayload,matchingNukiAuth,bookedNotice,accessMail,
 encryptAccessCode,decryptAccessCode,createKeypadCode,LOCK_ID} from "./notify-core.mjs";
const env=(k)=>Deno.env.get(k)||"";
const db=env("SUPABASE_URL")&&env("SUPABASE_SERVICE_ROLE_KEY")
 ?createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{
  auth:{autoRefreshToken:false,persistSession:false}}):null;
function json(v,status=200){return new Response(JSON.stringify(v),{status,headers:{
 "Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}})}
async function rpc(name,args={}){
 if(!db)throw Error("backend_not_configured");
 const {data,error}=await db.rpc(name,args);
 if(error)throw Error("db_rpc_"+name+"_"+error.code);
 return data;
}
async function nuki(method,path,payload){
 const r=await fetch("https://api.nuki.io"+path,{
  method,headers:{"Authorization":"Bearer "+env("NUKI_API_TOKEN"),
   "Content-Type":"application/json","Accept":"application/json"},
  body:payload===undefined?undefined:JSON.stringify(payload),
  signal:AbortSignal.timeout(15000)
 });
 if(!r.ok)throw Error("nuki_http_"+r.status);
 if(r.status===204)return null;
 const text=await r.text();return text?JSON.parse(text):null;
}
function getNukiAuths(input){
 if(Array.isArray(input))return input;
 if(Array.isArray(input?.data))return input.data;
 throw Error("nuki_authorization_list_invalid");
}
async function safeDeviceAndAuthList(){
 const [device,result]=await Promise.all([
  nuki("GET","/smartlock/"+LOCK_ID),
  nuki("GET","/smartlock/auth?types=13")
 ]);
 if(String(device?.smartlockId??device?.id)!==String(LOCK_ID))
  throw Error("nuki_lock_mismatch");
 if(device?.config?.keypadPaired!==true&&device?.config?.keypad2Paired!==true)
  throw Error("nuki_keypad_not_confirmed");
 if(device?.serverState===4)throw Error("nuki_lock_offline");
 return getNukiAuths(result);
}
const shortError=e=>String(e?.message||e||"unknown").slice(0,200);
async function complete(event,state,external=null,detail=null){
 return rpc("gk2_complete_confirmed_notification",{
  p_event:event.eventId,p_state:state,p_external_id:external,p_error:detail});
}
async function pushover(booking,{cancelled=false}={}){
 const msg=cancelled?{
  title:"GolfKongen – booking avbestilt",
  message:[booking.title,booking.day,booking.from+"–"+booking.to,
   "Ordre: "+booking.orderId,"Referanse: "+booking.bookingId.slice(0,8)].join("\\n")
 }:bookedNotice(booking);
 // The existing legacy GolfKongen notification app delivers to the
 // "Golfkongen" group. Resolve/validate the same group for Booking 2.0.
 // Do not fall back to the owner account, which has no registered devices.
 const token=env("GK2_PUSHOVER_APP_TOKEN").trim();
 const target=await resolveGolfkongenDeliveryGroup(token);
 if(!target.ok)throw Error("pushover_delivery_group_"+target.reason);
 const params=new URLSearchParams({
  token,user:target.key,
  title:msg.title,message:msg.message,priority:"0"
 });
 const r=await fetch("https://api.pushover.net/1/messages.json",{
  method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},
  body:params,signal:AbortSignal.timeout(15000)
 });
 if(r.status===429)throw Error("pushover_rate_limited");
 if(!r.ok)throw Error("pushover_http_"+r.status);
 const data=await r.json();
 if(data?.status!==1||!data.request)throw Error("pushover_invalid_receipt");
 return String(data.request);
}
async function resendCode(booking,code){
 const payload={from:"GolfKongen <booking@golfkongen.no>",
  ...accessMail(booking,code)};
 const r=await fetch("https://api.resend.com/emails",{
  method:"POST",headers:{"authorization":"Bearer "+env("RESEND_API_KEY"),
   "content-type":"application/json",
   "Idempotency-Key":"gk2-nuki-"+booking.bookingId},
  body:JSON.stringify(payload),signal:AbortSignal.timeout(18000)
 });
 if(!r.ok)throw Error("resend_http_"+r.status);
 const data=await r.json();
 if(typeof data?.id!=="string")throw Error("resend_missing_receipt");
 return data.id;
}
async function setAccess(booking,status,authId=null,emailId=null,error=null){
 return rpc("gk2_set_nuki_access_status",{
  p_reservation:booking.bookingId,p_status:status,
  p_auth_id:authId,p_email_id:emailId,p_error:error
 });
}
async function nukiBooking(event,booking){
 if(Date.parse(booking.endUtc)<=Date.now())
  throw Error("booking_end_in_past_manual_review");
 if(env("NUKI_LOCK_ID")&&env("NUKI_LOCK_ID")!==String(LOCK_ID))
  throw Error("configured_nuki_lock_mismatch");
 const auths=await safeDeviceAndAuthList();
 let code=createKeypadCode();
 // Avoid generating a code already present on the same lock.
 for(let tries=0;tries<30&&auths.some(x=>Number(x.type)===13&&
     String(x.smartlockId)===String(LOCK_ID)&&String(x.code)===code);tries++)
  code=createKeypadCode();
 const encrypted=await encryptAccessCode(code,env("GK2_CODE_KEY_BASE64"));
 const access=await rpc("gk2_get_or_create_nuki_access",{
  p_reservation:booking.bookingId,p_ciphertext:encrypted,p_name:booking.name
 });
 code=await decryptAccessCode(access.ciphertext,env("GK2_CODE_KEY_BASE64"));
 const existing=matchingNukiAuth(auths,booking,code);
 if(access.status==="emailed")return {complete:true,receipt:access.emailId};
 if(access.status==="revoked"||access.status==="cancel_requested"||
    access.status==="revoking"||access.status==="manual_review")
  throw Error("nuki_access_requires_manual_review");
 if(!existing){
  if(access.status==="queued"){
   // Save "unknown" BEFORE PUT. If Nuki times out, re-read Nuki rather than
   // blindly issuing a second keypad-code creation.
   await setAccess(booking,"creating_unknown");
   await nuki("PUT","/smartlock/auth",nukiPayload(booking,code));
   await setAccess(booking,"verifying");
   return {complete:false,phase:"awaiting_nuki_sync"};
  }
  const elapsed=Date.now()-Date.parse(access.updatedAt||new Date().toISOString());
  if(elapsed>20*60*1000) {
   await setAccess(booking,"manual_review",null,null,"nuki_not_confirmed_after_20m");
   throw Error("nuki_not_confirmed_manual_review");
  }
  return {complete:false,phase:"awaiting_nuki_sync"};
 }
 if(access.status!=="email_unknown"){
  await setAccess(booking,"verifying",String(existing.id||""));
 }
 // Code and time window have now been independently read from Nuki.
 // Resend idempotency key keeps retries for ambiguous HTTP results stable.
 try{
  const emailId=await resendCode(booking,code);
  await setAccess(booking,"emailed",String(existing.id||""),emailId);
  return {complete:true,receipt:emailId};
 }catch(e){
  await setAccess(booking,"email_unknown",String(existing.id||""),null,shortError(e));
  throw e;
 }
}
async function revokeCancelledBooking(booking){
 const row=await rpc("gk2_get_existing_nuki_access",{p_reservation:booking.bookingId});
 if(!row){
  await rpc("gk2_finish_revoked_booking",{p_reservation:booking.bookingId});
  return {revoked:true};
 }
 if(row.status==="revoked"){
  await rpc("gk2_finish_revoked_booking",{p_reservation:booking.bookingId});
  return {revoked:true};
 }
 const auths=await safeDeviceAndAuthList();
 let code="";
 try{code=await decryptAccessCode(row.ciphertext,env("GK2_CODE_KEY_BASE64"))}
 catch(_e){throw Error("cannot_decrypt_nuki_code_for_revocation_manual_review")}
 const found=auths.find(x=>Number(x.type)===13&&
   String(x.smartlockId)===String(LOCK_ID)&&x.name===row.name&&
   (String(x.id)===String(row.authId)||String(x.code)===String(Number(code))));
 if(found){
  if(row.status!=="revoking"){
   // Nuki DELETE is asynchronous; do not claim access was revoked until
   // a subsequent GET proves the authorization has disappeared.
   await setAccess(booking,"revoking",String(found.id));
   await nuki("DELETE","/smartlock/auth",[String(found.id)]);
  }
  return {revoked:false,phase:"waiting_for_nuki_revoke"};
 }
 // If a creation is still pending, absence from the cloud list might be
 // temporary. Never free a booked slot based on that uncertain absence.
 if(row.status==="creating_unknown"||row.status==="verifying"){
  throw Error("nuki_creation_unresolved_manual_review");
 }
 await setAccess(booking,"revoked");
 const released=await rpc("gk2_finish_revoked_booking",{
  p_reservation:booking.bookingId
 });
 if(released!==true)throw Error("slot_claim_release_requires_review");
 return {revoked:true};
}
async function dispatchOne(){
 const event=await rpc("gk2_claim_confirmed_notification");
 if(!event)return {done:true};
 let booking;
 try{
  booking=checkedBooking(event);
  if(event.kind==="booking_confirmed"){
   if(!env("GK2_PUSHOVER_APP_TOKEN")||!env("GK2_PUSHOVER_USER_KEY"))
    throw Error("pushover_credentials_missing");
   const requestId=await pushover(booking);
   await complete(event,"sent",requestId);
   return {done:false,sent:"pushover"};
  }
  if(event.kind==="booking_cancelled"){
   if(!env("NUKI_API_TOKEN")||!env("GK2_CODE_KEY_BASE64"))
    throw Error("revocation_credentials_missing");
   const state=await revokeCancelledBooking(booking);
   if(!state.revoked){
    await complete(event,"pending",null,state.phase);
    return {done:false,sent:"revocation_pending"};
   }
   // Pushover cancellation notice is an independent outbox event. A Nuki
   // failure cannot cause a duplicate booking-confirmed Pushover message.
   if(!env("GK2_PUSHOVER_APP_TOKEN")||!env("GK2_PUSHOVER_USER_KEY"))
    throw Error("pushover_credentials_missing");
   const receipt=await pushover(booking,{cancelled:true});
   await complete(event,"sent",receipt);
   return {done:false,sent:"revoked_and_notified"};
  }
  if(event.kind==="nuki_access_requested"){
   const required=["NUKI_API_TOKEN","RESEND_API_KEY","GK2_CODE_KEY_BASE64"];
   if(required.some(k=>!env(k)))throw Error("nuki_email_credentials_missing");
   const r=await nukiBooking(event,booking);
   await complete(event,r.complete?"sent":"pending",r.receipt||null,
      r.complete?null:r.phase);
   return {done:false,sent:r.complete?"nuki_email":"nuki_pending"};
  }
  await complete(event,"failed",null,"unsupported_notification_type");
  return {done:false,error:"unknown_event"};
 }catch(e){
  const reason=shortError(e);
  // Pushover has no provider idempotency key. Unknown HTTP outcomes cannot
  // be automatically retried, or a customer booking can trigger duplicate
  // push notifications. Nuki/Resend state is durable and uses stable keys.
  const state=event.kind==="booking_confirmed"?"unknown":
   reason.includes("credentials_missing")?"failed":
   reason.includes("manual_review")?"failed":"pending";
  try{await complete(event,state,null,reason)}catch(err){
   console.error("outbox completion failed",shortError(err));
  }
  return {done:false,error:reason};
 }
}
Deno.serve(async req=>{
 const pathname=new URL(req.url).pathname;
 const origin=req.headers.get("origin")||"";
 const ownerOrigin=origin==="https://msvendsen87.github.io";
 const cors=ownerOrigin?{
  "Access-Control-Allow-Origin":origin,
  "Access-Control-Allow-Headers":"authorization,content-type",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Vary":"Origin"}:{};
 if(req.method==="OPTIONS"&&pathname.endsWith("/internal/diagnose")){
  return new Response(null,{status:ownerOrigin?204:403,headers:cors});
 }
 const configured=["NUKI_API_TOKEN","RESEND_API_KEY","GK2_CODE_KEY_BASE64",
   "GK2_PUSHOVER_APP_TOKEN","GK2_PUSHOVER_USER_KEY",
   "GK2_QUICKBUTIK_API_KEY"].every(k=>env(k).length>0)
   &&env("NUKI_LOCK_ID")===String(LOCK_ID);
 const enabled=env("GK2_NOTIFIER_ENABLED")==="true";
 if(req.method==="GET"&&pathname.endsWith("/health"))
  return json({ok:true,service:"GolfKongen Booking2 notifier",
   enabled,configured});
 if(req.method==="POST"&&pathname.endsWith("/internal/diagnose")){
  // Safe diagnostics can run before launch. HMAC is separate from dispatch.
  let allowed=await verifyDiagnosticRequest({
   apiKey:env("GK2_QUICKBUTIK_API_KEY"),
   timestamp:req.headers.get("x-gk2-diagnostic-timestamp")||"",
   signature:req.headers.get("x-gk2-diagnostic-signature")||""
  });
  if(!allowed&&ownerOrigin&&db){
   const bearer=req.headers.get("authorization")||"";
   if(bearer.startsWith("Bearer ")&&bearer.length<7000){
    const {data,error}=await db.auth.getUser(bearer.slice(7));
    const user=data?.user;
    allowed=!error&&!!user?.email_confirmed_at&&
      user?.email?.toLowerCase()==="kristoffer.mrk@gmail.com";
   }
  }
  if(!allowed)return new Response(JSON.stringify({ok:false,code:"forbidden"}),{
   status:403,headers:{"content-type":"application/json",...cors}});
  if(!configured)return json({ok:false,code:"credentials_incomplete"},503);
  let nukiDevice=false,nukiAuths=false,pushoverUser=false;
  try{
   const device=await nuki("GET","/smartlock/"+LOCK_ID);
   nukiDevice=String(device?.smartlockId??device?.id)===String(LOCK_ID)&&
    (device?.config?.keypadPaired===true||device?.config?.keypad2Paired===true);
  }catch(_e){/* bool only; no tokens or device details */ }
  try{
   const result=await nuki("GET","/smartlock/auth?types=13");
   nukiAuths=Array.isArray(result)||Array.isArray(result?.data);
  }catch(_e){/* bool only */ }
  const appToken=env("GK2_PUSHOVER_APP_TOKEN").trim();
  const target=await resolveGolfkongenDeliveryGroup(appToken);
  const pushoverUser=target.ok===true;
  const push=pushoverUser?{reason:"ok"}:{reason:target.reason};
  // Resend sending-only keys cannot perform read API checks.
  // Real mail delivery requires an explicitly authorized test email.
  const report={ok:nukiDevice&&nukiAuths&&pushoverUser,
   nukiDevice,nukiAuthorizations:nukiAuths,pushoverRecipient:pushoverUser,
   pushoverReason:push.reason,pushoverTarget:GROUP_NAME,
   resendKeyConfigured:env("RESEND_API_KEY").length>0,
   emailDeliveryTested:false,notifierEnabled:enabled};
  return new Response(JSON.stringify(report),{
   status:report.ok?200:503,headers:{"content-type":"application/json",
    "cache-control":"no-store",...cors}
  });
 }
 if(req.method!=="POST"||!pathname.endsWith("/internal/dispatch"))
  return json({ok:false,code:"not_found"},404);
 if(!enabled)return json({ok:false,code:"notifier_disabled"},503);
 if(!configured)return json({ok:false,code:"notifier_credentials_incomplete"},503);
 const valid=await verifyDispatchRequest({
  apiKey:env("GK2_QUICKBUTIK_API_KEY"),
  timestamp:req.headers.get("x-gk2-dispatch-timestamp")||"",
  signature:req.headers.get("x-gk2-dispatch-signature")||""
 });
 if(!valid)return json({ok:false,code:"forbidden"},403);
 if(!db)return json({ok:false,code:"db_not_configured"},503);
 const results=[];
 for(let i=0;i<5;i++){
  const r=await dispatchOne();
  if(r.done)break;
  results.push(r);
 }
 return json({ok:results.every(r=>!r.error),processed:results.length,
  results:results.map(r=>({status:r.sent||r.error}))},results.some(r=>r.error)?207:200);
});
