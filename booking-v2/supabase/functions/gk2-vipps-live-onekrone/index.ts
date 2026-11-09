/**
 * STRICT PRODUCTION PAYMENTS BOUNDARY.
 * This endpoint may ONLY process 100 øre on MSN 859181, admin initiated.
 * No customer orders, reservations, schedule changes, Nuki/HYZR commands,
 * refunds, variable amounts or subscriptions.
 * Credentials not set => 503 (disabled).
 */
import {createClient} from "npm:@supabase/supabase-js@2.95.0";
import {
 LIVE_MSN,LIVE_ORE,validateLiveConfig,validLiveReference,validVippsQrAddress,
 liveOneKroneQr,summarizeLiveOneKrone,captureAllowed
} from "./vipps-live-core.mjs";

const VIPPS="https://api.vipps.no";
const ORIGIN="https://msvendsen87.github.io";
const sys={
 "Vipps-System-Name":"golfkongen","Vipps-System-Version":"0.1.0",
 "Vipps-System-Plugin-Name":"gk2-hyzr","Vipps-System-Plugin-Version":"0.1.0"
};
function json(value:unknown,status=200,origin=""){
 return new Response(JSON.stringify(value),{
  status,headers:{"Content-Type":"application/json; charset=utf-8",
   "Cache-Control":"no-store, no-cache, max-age=0",
   "Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff",
   ...(origin===ORIGIN?{"Access-Control-Allow-Origin":ORIGIN,"Vary":"Origin"}:{})}
 });
}
const config=()=>{
 const c={
  msn:Deno.env.get("GK2_VIPPS_LIVE_MSN")||"",
  clientId:Deno.env.get("GK2_VIPPS_LIVE_CLIENT_ID")||"",
  clientSecret:Deno.env.get("GK2_VIPPS_LIVE_CLIENT_SECRET")||"",
  subscriptionKey:Deno.env.get("GK2_VIPPS_LIVE_SUBSCRIPTION_KEY")||""
 };
 return validateLiveConfig(c).ok?c:null;
};
async function getToken(c:{msn:string,clientId:string,clientSecret:string,subscriptionKey:string}){
 const r=await fetch(VIPPS+"/accesstoken/get",{
  method:"POST",
  headers:{"client_id":c.clientId,"client_secret":c.clientSecret,
   "Ocp-Apim-Subscription-Key":c.subscriptionKey,
   "Merchant-Serial-Number":LIVE_MSN,"Content-Type":"application/json",...sys},
  body:"",signal:AbortSignal.timeout(12000)
 });
 if(!r.ok)return null;
 const b=await r.json();
 return typeof b?.access_token==="string"&&b.access_token.length>80?b.access_token:null;
}
async function getPayment(reference:string,headers:Record<string,string>){
 const r=await fetch(VIPPS+"/epayment/v1/payments/"+encodeURIComponent(reference),{
  method:"GET",headers,signal:AbortSignal.timeout(12000)
 });
 if(!r.ok)return {ok:false,code:"vipps_live_status_unavailable",status:r.status};
 const p=await r.json();
 const proof=summarizeLiveOneKrone(reference,p);
 return proof.ok?{ok:true,proof}:{ok:false,code:proof.code};
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("Origin")||"";
 if(origin&&origin!==ORIGIN)return json({ok:false,code:"origin_not_allowed"},403);
 if(req.method==="OPTIONS"){
  return new Response(null,{status:204,headers:{
   "Access-Control-Allow-Origin":ORIGIN,
   "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
   "Access-Control-Allow-Headers":"authorization,apikey,content-type",
   "Access-Control-Max-Age":"600","Vary":"Origin"
  }});
 }
 const url=new URL(req.url);
 const basePath="/gk2-vipps-live-onekrone";
 const op=url.pathname===basePath+"/connection"?"connection":
          url.pathname===basePath+"/create"?"create":
          url.pathname===basePath+"/status"?"status":
          url.pathname===basePath+"/capture"?"capture":null;
 if(!op)return json({ok:false,code:"not_found"},404,origin);
 if((["connection","status"].includes(op)&&req.method!=="GET")||
    (["create","capture"].includes(op)&&req.method!=="POST"))
  return json({ok:false,code:"method_not_allowed"},405,origin);

 const urlDb=Deno.env.get("SUPABASE_URL")||"";
 const svc=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const bearer=req.headers.get("Authorization")||"";
 if(!urlDb||!svc)return json({ok:false,code:"server_unconfigured"},503,origin);
 if(!bearer.startsWith("Bearer ")||bearer.length>7000)
  return json({ok:false,code:"authentication_required"},401,origin);

 const db=createClient(urlDb,svc,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const {data:ud,error:ue}=await db.auth.getUser(bearer.slice(7));
  if(ue||!ud?.user?.email||!ud.user.email_confirmed_at)
   return json({ok:false,code:"authentication_required"},401,origin);
  const email=ud.user.email.trim().toLowerCase();
  const {data:admin,error:ae}=await db.rpc("gk2_is_admin",{p_email:email});
  if(ae||admin!==true)return json({ok:false,code:"admin_only"},403,origin);

  const c=config();
  if(!c)return json({
   ok:false,code:"live_credentials_not_configured",
   environment:"production",msn:LIVE_MSN,realMoney:true
  },503,origin);
  const token=await getToken(c);
  if(!token)return json({ok:false,code:"vipps_live_auth_failed"},502,origin);
  const headers:Record<string,string>={
   "Authorization":"Bearer "+token,
   "Ocp-Apim-Subscription-Key":c.subscriptionKey,
   "Merchant-Serial-Number":LIVE_MSN,...sys
  };
  if(op==="connection")return json({
   ok:true,environment:"production",msn:LIVE_MSN,connected:true,
   amountOre:LIVE_ORE,bookingMutationEnabled:false,
   realMoney:true,hasCreatedPayment:false
  },200,origin);

  let reference="";
  if(op==="create"){
   // Only the server can set merchant, price, flow, reference and returnUrl.
   reference="GK2LQR-"+crypto.randomUUID();
   const {data:allow,error:re}=await db.rpc("gk2_vipps_live_reserve",{
    p_email:email,p_reference:reference
   });
   if(re)return json({ok:false,code:"live_rate_limit_error"},503,origin);
   if(allow?.ok!==true)return json({ok:false,code:allow?.code||"live_limit_reached"},429,origin);
   const payment=liveOneKroneQr(reference);
   const created=await fetch(VIPPS+"/epayment/v1/payments",{
    method:"POST",headers:{...headers,"Content-Type":"application/json",
     "Idempotency-Key":reference},
    body:JSON.stringify(payment),signal:AbortSignal.timeout(15000)
   });
   if(created.status!==201)return json({
     ok:false,code:"vipps_live_create_failed",vippsStatus:created.status
   },502,origin);
   const val=await created.json();
   const qrUrl=validVippsQrAddress(val?.redirectUrl);
   if(!qrUrl||val?.reference!==reference)return json({
    ok:false,code:"vipps_live_create_invalid_response"
   },502,origin);
   return json({ok:true,environment:"production",msn:LIVE_MSN,
    reference,amountOre:LIVE_ORE,qrUrl,realMoney:true,captured:false,
    bookingMutationEnabled:false},201,origin);
  }

  reference=url.searchParams.get("reference")||"";
  if(!validLiveReference(reference))
   return json({ok:false,code:"invalid_reference"},400,origin);
  const {data:owned,error:ownerError}=await db.rpc("gk2_vipps_live_owned",{
   p_email:email,p_reference:reference
  });
  if(ownerError||owned?.ok!==true)
   return json({ok:false,code:"reference_not_owned"},403,origin);
  const remote=await getPayment(reference,headers);
  if(!remote.ok)return json({ok:false,code:remote.code,
   ...(remote.status?{vippsStatus:remote.status}:{})},502,origin);

  if(op==="status")return json({...remote.proof,environment:"production",
    msn:LIVE_MSN,realMoney:true,captureStarted:owned.captureStarted},200,origin);

  // Explicit manual button on the test page must trigger capture.
  // Never capture a pre-existing partially captured/refunded payment.
  if(remote.proof.captured===true){
   if(owned.captureStarted){
    const {error:me}=await db.rpc("gk2_vipps_live_mark_captured",{
     p_email:email,p_reference:reference
    });
    if(me)return json({ok:false,code:"record_payment_needs_review"},503,origin);
   }
   return json({...remote.proof,environment:"production",realMoney:true},200,origin);
  }
  if(!captureAllowed(remote.proof,owned.captureStarted))
   return json({ok:false,code:owned.captureStarted?
    "capture_already_started_check_status":"payment_not_authorized"},409,origin);

  const {data:claimed,error:ce}=await db.rpc("gk2_vipps_live_claim_capture",{
   p_email:email,p_reference:reference
  });
  if(ce||claimed?.ok!==true)return json({
   ok:false,code:"capture_already_started_check_status"
  },409,origin);

  const captured=await fetch(VIPPS+"/epayment/v1/payments/"+
    encodeURIComponent(reference)+"/capture",{
    method:"POST",headers:{...headers,"Idempotency-Key":reference,
     "Content-Type":"application/json"},
    body:JSON.stringify({modificationAmount:{currency:"NOK",value:LIVE_ORE}}),
    signal:AbortSignal.timeout(15000)
  });
  if(!captured.ok)return json({
    ok:false,code:"capture_started_check_status",
    vippsStatus:captured.status
  },502,origin);
  const checked=await getPayment(reference,headers);
  if(!checked.ok||checked.proof.captured!==true)return json({
   ok:false,code:"capture_pending_check_status"
  },202,origin);

  const {error:me}=await db.rpc("gk2_vipps_live_mark_captured",{
    p_email:email,p_reference:reference
  });
  if(me)return json({ok:false,code:"payment_captured_record_error"},503,origin);
  return json({...checked.proof,environment:"production",realMoney:true},200,origin);
 }catch{
  return json({ok:false,code:"vipps_live_unavailable_or_pending"},503,origin);
 }
});
