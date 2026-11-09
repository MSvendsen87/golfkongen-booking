/**
 * HYZR Booking 2.0 extension ePayment API – STAGED DISABLED BY DEFAULT.
 *
 * Activation requires BOTH:
 *  - GK2_HYZR_DEVICE_TOKEN_SHA256 matching physical PC's secure local token;
 *  - GK2_HYZR_EXTENSION_WRITE_ENABLED === "true" (never default).
 *
 * Payment processor uses production Vipps MSN 859181, original paid rate and
 * existing Booking 2.0 physical claims; no arbitrary amount/bookings accepted.
 * Do not turn on before PC enrollment and customer-to-customer reset approval.
 */
import {createClient} from "npm:@supabase/supabase-js@2.95.0";
import {
 makeExtensionQrPayment,validExtensionReference,safePaymentQrUrl,inspectVippsPayment
} from "./extension-payment-core.mjs";
const VIPPS="https://api.vipps.no";
const MSN="859181";
const system={
 "Vipps-System-Name":"golfkongen","Vipps-System-Version":"0.1.0",
 "Vipps-System-Plugin-Name":"hyzr-booking2","Vipps-System-Plugin-Version":"0.1.0"
};
const respond=(value:unknown,status=200)=>new Response(JSON.stringify(value),{
 status,headers:{
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store, no-cache, max-age=0","Pragma":"no-cache",
  "Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"
 }
});
const encode=new TextEncoder();
const referenceReg=/^GK2EXT-[a-f0-9-]{36}$/;
const uuidReg=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function envConfig(){
 const cfg={
  msn:Deno.env.get("GK2_VIPPS_LIVE_MSN")||"",
  clientId:Deno.env.get("GK2_VIPPS_LIVE_CLIENT_ID")||"",
  clientSecret:Deno.env.get("GK2_VIPPS_LIVE_CLIENT_SECRET")||"",
  subscriptionKey:Deno.env.get("GK2_VIPPS_LIVE_SUBSCRIPTION_KEY")||""
 };
 if(cfg.msn!==MSN||!/^[a-fA-F0-9-]{36}$/.test(cfg.clientId)||
   cfg.clientSecret.length<20||!/^[a-fA-F0-9]{32}$/.test(cfg.subscriptionKey))
  return null;
 return cfg;
}
async function sha256Hex(s:string){
 const buf=await crypto.subtle.digest("SHA-256",encode.encode(s));
 return [...new Uint8Array(buf)].map(n=>n.toString(16).padStart(2,"0")).join("");
}
async function verifyDevice(req:Request){
 const hash=(Deno.env.get("GK2_HYZR_DEVICE_TOKEN_SHA256")||"").trim().toLowerCase();
 if(!/^[a-f0-9]{64}$/.test(hash))return false;
 const token=req.headers.get("X-GK2-HYZR-Device-Token")||"";
 if(!/^[A-Za-z0-9_-]{43,120}$/.test(token))return false;
 const found=await sha256Hex(token);
 let mismatch=0;
 for(let i=0;i<64;i++)mismatch|=hash.charCodeAt(i)^found.charCodeAt(i);
 return mismatch===0;
}
async function getVippsToken(c:{msn:string,clientId:string,clientSecret:string,subscriptionKey:string}){
 const r=await fetch(VIPPS+"/accesstoken/get",{
  method:"POST",headers:{
   "client_id":c.clientId,"client_secret":c.clientSecret,
   "Ocp-Apim-Subscription-Key":c.subscriptionKey,
   "Merchant-Serial-Number":MSN,"Content-Type":"application/json",...system
  },body:"",signal:AbortSignal.timeout(10000)
 });
 if(!r.ok)return null;
 const j=await r.json();
 return typeof j?.access_token==="string"&&j.access_token.length>80?j.access_token:null;
}
function apiHeaders(c:{subscriptionKey:string},jwt:string){
 return {
  "Authorization":"Bearer "+jwt,
  "Ocp-Apim-Subscription-Key":c.subscriptionKey,
  "Merchant-Serial-Number":MSN,...system
 };
}
async function vippsGet(reference:string,headers:Record<string,string>){
 const r=await fetch(VIPPS+"/epayment/v1/payments/"+encodeURIComponent(reference),{
   method:"GET",headers,signal:AbortSignal.timeout(11000)
 });
 return r.ok?await r.json():null;
}
async function safeBody(req:Request){
 if((req.headers.get("content-type")||"").split(";")[0].trim()!=="application/json")
  return null;
 const raw=await req.text();
 if(raw.length>1100)return null;
 try{return JSON.parse(raw);}catch{return null;}
}

Deno.serve(async(req:Request)=>{
 // No browser CORS, cookies or end-customer JSON tokens. The companion alone
 // communicates with this endpoint through TLS + hardware-local device key.
 if(req.method==="OPTIONS")return respond({ok:false,code:"browser_not_supported"},405);
 const url=new URL(req.url);
 const route=url.pathname.startsWith("/gk2-hyzr-extension-payment/")?
    url.pathname.slice("/gk2-hyzr-extension-payment/".length):"";
 const validRoute=(route==="create"&&req.method==="POST")||
   (route==="settle"&&req.method==="POST")||
   (route==="status"&&req.method==="GET");
 if(!validRoute)return respond({ok:false,code:"not_found_or_method"},404);

 if(Deno.env.get("GK2_HYZR_EXTENSION_WRITE_ENABLED")!=="true")
  return respond({ok:false,code:"extension_not_released"},503);
 const dbUrl=Deno.env.get("SUPABASE_URL")||"";
 const dbKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const cfg=envConfig();
 if(!dbUrl||!dbKey||!cfg)
  return respond({ok:false,code:"server_not_configured"},503);
 if(!await verifyDevice(req))return respond({ok:false,code:"device_auth_required"},401);
 const db=createClient(dbUrl,dbKey,{auth:{autoRefreshToken:false,persistSession:false}});
 try{
  if(route==="create"){
   const body=await safeBody(req);
   if(!body||![30,60,90,120].includes(body.minutes)||
      typeof body.requestId!=="string"||!uuidReg.test(body.requestId))
     return respond({ok:false,code:"invalid_extension_request"},400);
   const now=new Date().toISOString();
   const {data:preview,error:pe}=await db.rpc("gk2_hyzr_preview_state",{p_at:now});
   if(pe||preview?.ok!==true||!["active","warning","grace"].includes(preview?.state)||
      preview.resource!=="hyzr"||typeof preview.bookingId!=="string")
     return respond({ok:false,code:"no_eligible_current_hyzr_booking"},409);
   const {data:hold,error:he}=await db.rpc("gk2_hyzr_extension_reserve",{
    p_request:body.requestId,p_reservation:preview.bookingId,p_extra_minutes:body.minutes
   });
   if(he)return respond({ok:false,code:"slot_lock_failed"},503);
   if(hold?.ok!==true)return respond({ok:false,code:hold?.code||"extension_unavailable"},409);
   if(hold?.state!=="payment_pending"||Date.parse(hold.expiresAt)<=Date.now())
     return respond({ok:false,code:"extension_hold_expired"},409);
   const reference=hold.reference,amountOre=hold.priceOre;
   const request=makeExtensionQrPayment({reference,amountOre,minutes:body.minutes});
   const jwt=await getVippsToken(cfg);
   if(!jwt)return respond({ok:false,code:"vipps_unavailable"},503);
   const headers=apiHeaders(cfg,jwt);
   const r=await fetch(VIPPS+"/epayment/v1/payments",{
    method:"POST",headers:{...headers,"Content-Type":"application/json",
      "Idempotency-Key":reference},
    body:JSON.stringify(request),signal:AbortSignal.timeout(12000)
   });
   if(r.status!==201)return respond({ok:false,code:"vipps_create_failed",
      vippsStatus:r.status},502);
   const data=await r.json();
   const qrUrl=safePaymentQrUrl(data?.redirectUrl);
   if(data?.reference!==reference||!qrUrl)return respond({ok:false,code:"unexpected_vipps_response"},502);
   return respond({ok:true,reference,qrUrl,
    priceOre:amountOre,minutes:body.minutes,expiresAt:hold.expiresAt,
    paymentConfirmed:false,bookingExtended:false},201);
  }
  const reference=url.searchParams.get("reference")||"";
  if(!validExtensionReference(reference)||!referenceReg.test(reference))
   return respond({ok:false,code:"invalid_reference"},400);
  const {data:hold,error:holdErr}=await db.rpc("gk2_hyzr_extension_get",{
    p_reference:reference
  });
  if(holdErr||hold?.ok!==true)return respond({ok:false,code:"extension_not_found"},404);
  if(hold.state==="committed"){
   return respond({ok:true,reference,bookingExtended:true,state:"committed",
      minutes:hold.minutes,amountOre:hold.amountOre});
  }
  if(!["payment_pending","capture_started"].includes(hold.state))
   return respond({ok:false,code:"extension_not_payable",state:hold.state},409);
  if(hold.state==="payment_pending"&&Date.parse(hold.expiresAt)<=Date.now())
   return respond({ok:false,code:"extension_hold_expired"},410);
  const jwt=await getVippsToken(cfg);
  if(!jwt)return respond({ok:false,code:"vipps_unavailable"},503);
  const headers=apiHeaders(cfg,jwt);
  const payment=await vippsGet(reference,headers);
  const proof=inspectVippsPayment({reference,amountOre:hold.amountOre,payment});
  if(!proof.ok)return respond({ok:false,code:"payment_verification_failed"},503);
  if(route==="status")
   return respond({ok:true,reference,state:proof.state,
     authorized:proof.authorized,fullyCaptured:proof.fullyCaptured,
     bookingExtended:false,minutes:hold.minutes,amountOre:hold.amountOre});

  // In the customer's grace/warning period the PC polls settle.
  // Authorization NEVER extends time until capture has been verified by Vipps GET.
  if(proof.fullyCaptured){
   if(hold.state!=="capture_started")
     return respond({ok:false,code:"capture_state_mismatch_manual_review"},409);
   const {data:applied,error:ae}=await db.rpc("gk2_hyzr_extension_commit_captured",{
      p_reference:reference,p_amount_ore:hold.amountOre
   });
   if(ae||applied?.ok!==true)return respond({ok:false,
      code:applied?.code||"captured_money_requires_manual_review"},503);
   return respond({...applied,bookingExtended:true,reference,state:"committed"});
  }
  if(!proof.canCapture)
   return respond({ok:true,reference,state:proof.state,
       authorized:proof.authorized,bookingExtended:false});
  if(hold.state==="payment_pending"){
   const {data:claim,error:ce}=await db.rpc("gk2_hyzr_extension_claim_capture",{
      p_reference:reference
   });
   if(ce||claim?.claimed!==true)
     return respond({ok:false,code:claim?.code||"capture_preflight_failed"},409);
  }
  // A repeated capture uses the SAME idempotency key; never charge twice.
  // capture_started holds remain occupied until payment is reconciled.
  const captured=await fetch(VIPPS+"/epayment/v1/payments/"+
      encodeURIComponent(reference)+"/capture",{
    method:"POST",headers:{...headers,
      "Idempotency-Key":reference,"Content-Type":"application/json"},
    body:JSON.stringify({modificationAmount:{currency:"NOK",value:hold.amountOre}}),
    signal:AbortSignal.timeout(12000)
  });
  // HTTP success is not proof. Even if capture request times out, check remote state.
  const checked=await vippsGet(reference,headers);
  const verified=inspectVippsPayment({
    reference,amountOre:hold.amountOre,payment:checked
  });
  if(verified.ok!==true||verified.fullyCaptured!==true)
   return respond({ok:false,code:"capture_pending_or_unverified",
     vippsStatus:captured.status,bookingExtended:false},202);
  const {data:applied,error:ae}=await db.rpc("gk2_hyzr_extension_commit_captured",{
     p_reference:reference,p_amount_ore:hold.amountOre
  });
  if(ae||applied?.ok!==true)return respond({ok:false,
     code:applied?.code||"captured_money_requires_manual_review"},503);
  return respond({...applied,bookingExtended:true,reference,state:"committed"});
 }catch{
  return respond({ok:false,code:"extension_backend_unavailable"},503);
 }
});
