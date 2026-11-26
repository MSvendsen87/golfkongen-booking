// GolfKongen Booking 2.0 minute-level notifier dispatcher.
// Signed by Supabase Vault via pg_cron; never accepts browser/client credentials.
// Calls the EXISTING idempotent verified-paid notifier without exposing secrets.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const encoder = new TextEncoder();
function reply(data: Record<string,unknown>,status=200){
 return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
}
async function mac(key: Uint8Array,data: string):Promise<Uint8Array>{
 const imported=await crypto.subtle.importKey("raw",key,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 return new Uint8Array(await crypto.subtle.sign("HMAC",imported,encoder.encode(data)));
}
function hex(b:Uint8Array):string{return Array.from(b,x=>x.toString(16).padStart(2,"0")).join("");}
Deno.serve(async (req: Request)=>{
 if(req.method!=="POST")return reply({ok:false,code:"method_not_allowed"},405);
 const ts=req.headers.get("x-gk2-cron-timestamp")||"";
 const signature=req.headers.get("x-gk2-cron-signature")||"";
 if(!/^[0-9]{10}$/.test(ts)||!/^[0-9a-f]{64}$/.test(signature))
  return reply({ok:false,code:"unauthorized"},403);
 const url=Deno.env.get("SUPABASE_URL")||"";
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!serviceKey)return reply({ok:false,code:"backend_not_configured"},503);
 try{
  // Verify a time-limited HMAC against Vault via service-role-only RPC.
  const verification=await fetch(url+"/rest/v1/rpc/gk2_verify_cron_dispatch_signature",{
   method:"POST",headers:{"apikey":serviceKey,"authorization":"Bearer "+serviceKey,
   "content-type":"application/json"},
   body:JSON.stringify({p_timestamp:ts,p_signature:signature}),
   signal:AbortSignal.timeout(10000)});
  if(!verification.ok)return reply({ok:false,code:"scheduler_verification_unavailable"},503);
  if(await verification.json()!==true)return reply({ok:false,code:"unauthorized"},403);
  // The Quickbutik API key is used strictly as the signing root for the existing protected dispatcher.
  // It is never sent as an HTTP header or returned to the caller.
  const apiKey=Deno.env.get("GK2_QUICKBUTIK_API_KEY")||"";
  if(apiKey.length<20)return reply({ok:false,code:"dispatcher_key_missing"},503);
  // Run independently of notification success, using the existing protected
  // relock endpoint. It verifies Quickbutik stock/visibility before DB release.
  const cleanupTs=String(Math.floor(Date.now()/1000));
  const cleanupKey=await mac(encoder.encode(apiKey),"gk2-booking-cart-cleanup-key-v1");
  const cleanupSignature=hex(await mac(cleanupKey,"POST:/internal/relock-expired:"+cleanupTs));
  const cleanupPromise=fetch(url+"/functions/v1/gk-booking-v2/internal/relock-expired",{
   method:"POST",headers:{"content-type":"application/json",
    "x-gk2-cleanup-timestamp":cleanupTs,"x-gk2-cleanup-signature":cleanupSignature},
   body:"{}",signal:AbortSignal.timeout(45000)
  }).then(async response=>({status:response.status,result:await response.json()}))
    .catch(()=>({status:503,result:{ok:false}}));
  const derived=await mac(encoder.encode(apiKey),"gk2-booking-confirmed-notifications-key-v1");
  const dispatchTs=String(Math.floor(Date.now()/1000));
  const dispatchSignature=hex(await mac(derived,"POST:/internal/dispatch:"+dispatchTs));
  const target=url+"/functions/v1/gk-booking-notifier/internal/dispatch";
  const res=await fetch(target,{method:"POST",headers:{
   "x-gk2-dispatch-timestamp":dispatchTs,
   "x-gk2-dispatch-signature":dispatchSignature,
   "content-type":"application/json"},
   body:"{}",signal:AbortSignal.timeout(45000)});
  const result=await res.json().catch(()=>null);
  const cleanup=await cleanupPromise;
  if(cleanup.status!==200||cleanup.result?.ok!==true||cleanup.result?.failed>0)
   return reply({ok:false,code:"cart_cleanup_incomplete",cleanup:cleanup.result},502);
  if(!res.ok||result?.ok!==true)
   return reply({ok:false,code:"notification_dispatch_incomplete",processed:result?.processed??null},502);
  return reply({ok:true,processed:result.processed||0,cleanup:cleanup.result});
 }catch(_error){
  return reply({ok:false,code:"notification_dispatch_unavailable"},503);
 }
});