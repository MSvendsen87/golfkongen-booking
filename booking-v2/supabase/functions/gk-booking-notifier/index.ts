// GolfKongen Booking2: ONLY consumes events emitted by the atomic
// confirmed-paid reservation transaction. No Quickbutik order ingestion.
// No independent Nuki webhooks, no browser access to reservation details.
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
import {verifyDispatchRequest} from "./dispatch-auth.mjs";
import {verifyDiagnosticRequest} from "./diagnostic-auth.mjs";
import {classifyPushoverValidation,pushoverKeyFormat} from "./pushover-diagnostic.mjs";
import {resolveGolfkongenDeliveryGroup,GROUP_NAME} from "./pushover-group.mjs";
import {checkedBooking,nukiPayload,matchingNukiAuth,bookedNotice,accessMail,
 encryptAccessCode,decryptAccessCode,createKeypadCode,timeHHMM,LOCK_ID} from "./notify-core.mjs";
import {osloDateTimeToUtc} from "./booking-access.mjs";
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
async function ownerDoorTest(req,origin,cors){
 const output=(obj,status=200)=>new Response(JSON.stringify(obj),{status,
  headers:{"Content-Type":"application/json","Cache-Control":"no-store",...cors}});
 try{
  if(!db)return output({ok:false,code:"backend_unavailable"},503);
  const header=req.headers.get("authorization")||"";
  if(!header.startsWith("Bearer ")||header.length>7000)return output({ok:false,code:"login_required"},401);
  const {data,error}=await db.auth.getUser(header.slice(7));
  const actor=data?.user?.email?.toLowerCase().trim()||"";
  if(error||!data?.user?.email_confirmed_at||!["kristoffer.mrk@gmail.com","post@golfkongen.no"].includes(actor))
   return output({ok:false,code:"owner_login_required"},403);
  if(await rpc("gk2_is_admin",{p_email:actor})!==true)
   return output({ok:false,code:"admin_denied"},403);
  if(!env("NUKI_API_TOKEN")||!env("RESEND_API_KEY")||!env("GK2_CODE_KEY_BASE64"))
   return output({ok:false,code:"door_integration_not_configured"},503);
  const raw=await req.text();
  if(raw.length>2000)return output({ok:false,code:"invalid_body"},400);
  const input=JSON.parse(raw);
  const key=String(input?.idempotencyKey||""),start=Number(input?.startMin);
  const resource=String(input?.resource||"dart_a");
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)||
    !Number.isInteger(start)||start%30!==0||!["dart_a","dart_b","hyzr"].includes(resource)||
    input?.confirmOwnerDoorTest!==true)
   return output({ok:false,code:"invalid_owner_test_request"},400);
  const held=await rpc("gk2_owner_test_hold",{p_actor:actor,p_key:key,p_resource:resource,p_start:start});
  if(held?.status!=="held"||!held?.id)return output({ok:false,code:"test_slot_not_held"},409);
  const bookingId=String(held.id),day=String(held.day);
  const from=timeHHMM(Number(held.startMin)),to=timeHHMM(Number(held.endMin));
  const booking={bookingId,day,startMin:Number(held.startMin),endMin:Number(held.endMin),
    startUtc:osloDateTimeToUtc(day,from),endUtc:osloDateTimeToUtc(day,to),
    name:"GK2-TEST-"+bookingId.replace(/-/g,"").slice(0,16)};
  const candidate=createKeypadCode();
  const encrypted=await encryptAccessCode(candidate,env("GK2_CODE_KEY_BASE64"));
  const stored=await rpc("gk2_owner_test_code",{
    p_reservation:bookingId,p_ciphertext:encrypted,p_name:booking.name});
  const code=await decryptAccessCode(String(stored.ciphertext),env("GK2_CODE_KEY_BASE64"));
  const auths=await safeDeviceAndAuthList();
  const existing=matchingNukiAuth(auths,booking,code);
  if(stored.status==="emailed")return output({ok:true,emailSent:true,day,from,to,resource});
  if(stored.status==="manual_review")return output({ok:false,code:"nuki_manual_review"},503);
  if(!existing){
   if(stored.status==="queued"){
    await rpc("gk2_owner_test_code_status",{p_reservation:bookingId,p_status:"creating_unknown"});
    await nuki("PUT","/smartlock/auth",nukiPayload(booking,code));
    return output({ok:true,phase:"nuki_sync_pending",emailSent:false,day,from,to});
   }
   const elapsed=Date.now()-Date.parse(stored.updatedAt||new Date().toISOString());
   if(elapsed>20*60*1000){
    await rpc("gk2_owner_test_code_status",{p_reservation:bookingId,p_status:"manual_review"});
    return output({ok:false,code:"nuki_creation_requires_review"},503);
   }
   return output({ok:true,phase:"nuki_sync_pending",emailSent:false,day,from,to});
  }
  await rpc("gk2_owner_test_code_status",{p_reservation:bookingId,
   p_status:"verifying",p_auth_id:String(existing.id||"")});
  const mailBody=[
   "GolfKongen – eierens testbooking (ingen betaling).","",
   resource.replace("_"," ").toUpperCase()+" "+day+" "+from+"–"+to,
   "Automatisk opprettet Nuki-kode: "+code,
   "Koden gjelder fra fem minutter før teststart og til tests slutt.","",
   "Test dette på dørens Nuki Keypad. Booking 2.0 er fortsatt stengt for kundebetaling."
  ].join("\n");
  const send=await fetch("https://api.resend.com/emails",{
   method:"POST",headers:{"authorization":"Bearer "+env("RESEND_API_KEY"),
    "content-type":"application/json","Idempotency-Key":"gk2-owner-door-"+bookingId},
   body:JSON.stringify({from:"GolfKongen <booking@golfkongen.no>",to:[actor],
    subject:"GolfKongen – testbooking og automatisk Nuki-kode",text:mailBody}),
   signal:AbortSignal.timeout(18000)});
  if(!send.ok){
    await rpc("gk2_owner_test_code_status",{p_reservation:bookingId,p_status:"email_unknown"});
    return output({ok:false,code:"test_email_requires_review"},503);
  }
  const receipt=await send.json();
  if(!receipt?.id)return output({ok:false,code:"test_email_receipt_missing"},503);
  await rpc("gk2_owner_test_code_status",{p_reservation:bookingId,
    p_status:"emailed",p_auth_id:String(existing.id||""),p_email_id:String(receipt.id)});
  return output({ok:true,emailSent:true,day,from,to,resource});
 }catch(e){
  console.error("owner-door-test:",shortError(e).replace(/([a-z0-9._%+-]+)@([a-z0-9.-]+)/ig,"[redacted]"));
  return output({ok:false,code:"owner_test_not_completed",retryAllowed:true},503);
 }
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
const OWNER_DOOR_TEST_PAGE="<!doctype html><html lang=\"nb\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>GolfKongen – testbooking → Nuki</title><style>body{background:#101913;color:#eef8ef;font:16px system-ui,sans-serif;margin:0;padding:18px}.page{max-width:540px;margin:20px auto;padding:22px;border:1px solid #567460;border-radius:16px;background:#1b2a20}h1{font-size:25px}p{line-height:1.55}input,select,button{display:block;width:100%;padding:13px;margin:10px 0;border-radius:9px;font-size:16px;border:1px solid #89a28e;box-sizing:border-box}button{background:#dfbb70;color:#101913;font-weight:800;border:0}button:disabled{opacity:.5}input,select{background:#0e1811;color:white}#result{white-space:pre-wrap;background:#2b3525;padding:14px;border-radius:9px;min-height:30px}small{color:#b4c3b6}a{color:#e8c97f}</style></head><body><main class=\"page\"><h1>GolfKongen – testbooking og Nuki</h1><p>Opprett en virkelig, tidsbestemt <strong>eiertestbooking</strong> for neste halvtime og få en automatisk Nuki-kode på e-post. Kun godkjent GolfKongen-administrator kan bruke denne funksjonen.</p><p><strong>Dette er en test uten betaling.</strong> Det åpner ikke kunde-booking eller Quickbutik-kassen.</p><section id=\"auth\"><input id=\"email\" type=\"email\" autocomplete=\"username\" placeholder=\"Eierens e-post\"><input id=\"password\" type=\"password\" autocomplete=\"current-password\" placeholder=\"Passord til Booking 2.0-admin\"><button id=\"login\">Logg inn</button></section><section id=\"test\" hidden><p id=\"account\"></p><label for=\"resource\">Testaktivitet</label><select id=\"resource\"><option value=\"dart_a\">Dartbane A</option><option value=\"dart_b\">Dartbane B</option><option value=\"hyzr\">HYZR simulator</option></select><button id=\"start\">Reserver og send Nuki-kode</button><small>Koden gjelder fra fem minutter før start. Hvis Nuki bruker tid på synkronisering, kontrollerer siden automatisk status.</small></section><p id=\"result\" role=\"status\">Logg inn for å starte.</p><p><a href=\"https://golfkongen.no/aktiviteter\">GolfKongen aktiviteter</a></p></main><script type=\"module\">\nimport {createClient} from \"https://esm.sh/@supabase/supabase-js@2.58.0\";\nconst client=createClient(\"https://eadgdcimcmfyuicizboo.supabase.co\",\"sb_publishable_XkYEuhPUH1lLmu8EVJM5Nw_ptPirbYq\");\nconst $=id=>document.getElementById(id);\nlet session=null,busy=false;\nconst status=t=>{$(\"result\").textContent=t};\n$(\"login\").onclick=async()=>{status(\"Kontrollerer eierinnlogging …\");try{\n const {data,error}=await client.auth.signInWithPassword({email:$(\"email\").value.trim(),password:$(\"password\").value});\n if(error||!data?.session?.access_token)throw Error(error?.message||\"Kunne ikke logge inn\");\n session=data.session;$(\"auth\").hidden=true;$(\"test\").hidden=false;$(\"account\").textContent=\"Innlogget: \"+data.user.email;\n status(\"Velg aktivitet og opprett en testbooking. Dørkode sendes på e-post.\");\n }catch(e){status(\"Innlogging feilet: \"+e.message);}};\n$(\"start\").onclick=async()=>{\n if(busy||!session?.access_token)return;\n const parts=Object.fromEntries(new Intl.DateTimeFormat(\"en-GB\",{timeZone:\"Europe/Oslo\",hour:\"2-digit\",minute:\"2-digit\",hourCycle:\"h23\"}).formatToParts(new Date()).filter(x=>[\"hour\",\"minute\"].includes(x.type)).map(x=>[x.type,Number(x.value)]));\n const start=Math.ceil((parts.hour*60+parts.minute+15)/30)*30;\n const day=new Intl.DateTimeFormat(\"sv-SE\",{timeZone:\"Europe/Oslo\",year:\"numeric\",month:\"2-digit\",day:\"2-digit\"}).format(new Date());\n if(start>1290){status(\"Det er for sent for en ny testbooking i dag.\");return;}\n const resource=$(\"resource\").value,cache=\"gk2-on-site-\"+day+\"-\"+resource+\"-\"+start;\n let key=sessionStorage.getItem(cache);if(!key){key=crypto.randomUUID();sessionStorage.setItem(cache,key);}\n busy=true;$(\"start\").disabled=true;\n try{\n  for(let i=0;i<12;i++){\n   status(i===0?\"Oppretter reell testreservasjon og Nuki-kode …\":\"Kontrollerer synkronisering mot Nuki (\"+(i+1)+\"/12) …\");\n   const res=await fetch(location.pathname,{method:\"POST\",headers:{\"authorization\":\"Bearer \"+session.access_token,\"content-type\":\"application/json\"},\n    body:JSON.stringify({idempotencyKey:key,resource,startMin:start,confirmOwnerDoorTest:true}),cache:\"no-store\"});\n   const d=await res.json();\n   if(!res.ok||d.ok!==true)throw Error(d.code||\"Tjenesten svarte ikke\");\n   if(d.emailSent){status(\"KLAR: Testbooking \"+d.day+\" kl. \"+d.from+\"–\"+d.to+\". Nuki-koden er sendt til \"+session.user.email+\". Bruk den på Keypad fra fem minutter før start.\");return;}\n   await new Promise(done=>setTimeout(done,4000));\n  }\n  status(\"Reservert, men Nuki har ikke bekreftet koden. Trykk knappen igjen for trygg statuskontroll.\");\n }catch(e){status(\"Ikke fullført: \"+e.message+\". Ingen kode skal brukes før bekreftet e-post.\");}\n finally{busy=false;$(\"start\").disabled=false;}\n};\n</script></body></html>";
Deno.serve(async req=>{
 const pathname=new URL(req.url).pathname;
 const origin=req.headers.get("origin")||"";
 const ownerOrigin=origin==="https://msvendsen87.github.io";
 const testOrigin=ownerOrigin||origin==="https://eadgdcimcmfyuicizboo.supabase.co";
 const cors=ownerOrigin?{
  "Access-Control-Allow-Origin":origin,
  "Access-Control-Allow-Headers":"authorization,content-type",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Vary":"Origin"}:{};
 if(req.method==="GET"&&pathname.endsWith("/owner/door-test"))
  return new Response(null,{status:302,headers:{"Location":"https://msvendsen87.github.io/golfkongen-booking/","Cache-Control":"no-store"}});
 if(req.method==="OPTIONS"&&pathname.endsWith("/owner/door-test")){
  return new Response(null,{status:testOrigin?204:403,headers:cors});
 }
 if(req.method==="POST"&&pathname.endsWith("/owner/door-test")){
  if(!testOrigin)return json({ok:false,code:"forbidden_origin"},403);
  return ownerDoorTest(req,origin,cors);
 }
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
  let nukiDevice=false,nukiAuths=false;
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
