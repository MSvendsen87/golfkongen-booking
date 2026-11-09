/**
 * ADMIN-ONLY Vipps TEST QR sandbox.
 * Isolated from Booking 2.0 and the simulator. Fixed 1.00 NOK in TEST.
 * Never captures, refunds, grants access, or modifies customer bookings.
 */
import {createClient} from "npm:@supabase/supabase-js@2.95.0";
import {
 TEST_MSN,createSandboxQrBody,isTestReference,safeVippsQrUrl,summarizeSandboxPayment
} from "./vipps-qr-core.mjs";

const origins=new Set(["https://msvendsen87.github.io"]);
const response=(data:unknown,status=200,origin="")=>new Response(JSON.stringify(data),{
 status,headers:{"Content-Type":"application/json; charset=utf-8",
 "Cache-Control":"no-store, max-age=0","Pragma":"no-cache",
 "X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",
 ...(origins.has(origin)?{"Access-Control-Allow-Origin":origin,"Vary":"Origin"}:{})}
});
const base="https://apitest.vipps.no";
const systemHeaders={
 "Vipps-System-Name":"golfkongen","Vipps-System-Version":"0.1.0",
 "Vipps-System-Plugin-Name":"gk2-hyzr","Vipps-System-Plugin-Version":"0.1.0"
};

async function accessToken(cfg:{clientId:string,clientSecret:string,subscriptionKey:string}){
 const x=await fetch(base+"/accesstoken/get",{
  method:"POST",headers:{"client_id":cfg.clientId,"client_secret":cfg.clientSecret,
   "Ocp-Apim-Subscription-Key":cfg.subscriptionKey,
   "Merchant-Serial-Number":TEST_MSN,"Content-Type":"application/json"},
  body:"",signal:AbortSignal.timeout(10000)
 });
 if(!x.ok)return null;
 const j=await x.json();
 return typeof j?.access_token==="string"&&j.access_token.length>80?j.access_token:null;
}
function config(){
 const msn=Deno.env.get("GK2_VIPPS_TEST_MSN")||"";
 const clientId=Deno.env.get("GK2_VIPPS_TEST_CLIENT_ID")||"";
 const clientSecret=Deno.env.get("GK2_VIPPS_TEST_CLIENT_SECRET")||"";
 const subscriptionKey=Deno.env.get("GK2_VIPPS_TEST_SUBSCRIPTION_KEY")||"";
 if(msn!==TEST_MSN||!clientId||!clientSecret||!subscriptionKey)return null;
 return {clientId,clientSecret,subscriptionKey};
}

Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("Origin")||"";
 if(origin&&!origins.has(origin))return response({ok:false,code:"origin_not_allowed"},403);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{
  "Access-Control-Allow-Origin":origin,
  "Access-Control-Allow-Methods":"POST,GET,OPTIONS",
  "Access-Control-Allow-Headers":"authorization,apikey,content-type",
  "Access-Control-Max-Age":"600","Vary":"Origin"
 }});
 const url=new URL(req.url);
 const creating=url.pathname.endsWith("/gk2-vipps-qr-sandbox/create");
 const checking=url.pathname.endsWith("/gk2-vipps-qr-sandbox/status");
 if(!creating&&!checking)return response({ok:false,code:"not_found"},404,origin);
 if((creating&&req.method!=="POST")||(checking&&req.method!=="GET"))
  return response({ok:false,code:"method_not_allowed"},405,origin);
 const dbUrl=Deno.env.get("SUPABASE_URL")||"";
 const svc=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const bearer=req.headers.get("Authorization")||"";
 if(!dbUrl||!svc)return response({ok:false,code:"server_not_configured"},503,origin);
 if(!bearer.startsWith("Bearer ")||bearer.length>7500)
  return response({ok:false,code:"authentication_required"},401,origin);
 const db=createClient(dbUrl,svc,{auth:{persistSession:false,autoRefreshToken:false}});
 try {
  const {data:ud,error:ue}=await db.auth.getUser(bearer.slice(7));
  const user=ud?.user;
  if(ue||!user?.email_confirmed_at||!user?.email)
   return response({ok:false,code:"authentication_required"},401,origin);
  const email=user.email.trim().toLowerCase();
  const {data:admin,error:ae}=await db.rpc("gk2_is_admin",{p_email:email});
  if(ae||admin!==true)return response({ok:false,code:"admin_only"},403,origin);
  const cfg=config();
  if(!cfg)return response({ok:false,code:"test_credentials_not_configured"},503,origin);

  let reference="";
  if(creating){
   // The caller may not choose price, reference, customer, merchant or payment flow.
   // A fixed random reference is used for exactly one test QR.
   reference="GK2TQR-"+crypto.randomUUID();
   const {data:allow,error:limitErr}=await db.rpc("gk2_vipps_test_reserve",{
     p_email:email,p_reference:reference
   });
   if(limitErr)return response({ok:false,code:"test_rate_limit_unavailable"},503,origin);
   if(allow?.ok!==true)return response({ok:false,code:allow?.code==="hourly_limit_reached"?
      "hourly_limit_reached":"test_request_denied"},429,origin);
  } else {
   reference=url.searchParams.get("reference")||"";
   if(!isTestReference(reference))
    return response({ok:false,code:"invalid_reference"},400,origin);
   const {data:owned,error:ownerError}=await db.rpc("gk2_vipps_test_owned",{
    p_email:email,p_reference:reference
   });
   if(ownerError||owned!==true)return response({ok:false,code:"test_reference_not_owned"},403,origin);
  }
  const token=await accessToken(cfg);
  if(!token)return response({ok:false,code:"vipps_auth_failed"},502,origin);
  const headers={
    "Authorization":"Bearer "+token,
    "Ocp-Apim-Subscription-Key":cfg.subscriptionKey,
    "Merchant-Serial-Number":TEST_MSN,...systemHeaders
  };
  if(creating){
   const attemptId=crypto.randomUUID();
   const payment=createSandboxQrBody(reference);
   const vipps=await fetch(base+"/epayment/v1/payments",{
    method:"POST",
    headers:{...headers,"Idempotency-Key":attemptId,"Content-Type":"application/json"},
    body:JSON.stringify(payment),
    signal:AbortSignal.timeout(12000)
   });
   if(vipps.status!==201)return response({
    ok:false,code:"vipps_test_qr_create_failed",vippsStatus:vipps.status
   },502,origin);
   const result=await vipps.json();
   const qrUrl=safeVippsQrUrl(result?.redirectUrl);
   if(result?.reference!==reference||!qrUrl)return response({
    ok:false,code:"unexpected_test_qr_response"
   },502,origin);
   return response({ok:true,environment:"test",msn:TEST_MSN,reference,
    amountOre:100,qrUrl,bookingExtended:false,realMoneyCharged:false,
    paymentCaptured:false},201,origin);
  }
  const status=await fetch(base+"/epayment/v1/payments/"+encodeURIComponent(reference),{
   method:"GET",headers,signal:AbortSignal.timeout(10000)
  });
  if(!status.ok)return response({
   ok:false,code:"vipps_test_status_failed",vippsStatus:status.status
  },502,origin);
  const payment=await status.json();
  const summary=summarizeSandboxPayment(reference,payment);
  if(summary.ok!==true)return response({ok:false,code:"unexpected_test_payment"},502,origin);
  return response(summary,200,origin);
 }catch{
  return response({ok:false,code:"vipps_test_unavailable"},503,origin);
 }
});
