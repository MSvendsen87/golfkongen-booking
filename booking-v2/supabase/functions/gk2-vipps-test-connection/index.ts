import {createClient} from "npm:@supabase/supabase-js@2.95.0";
import {validateTestVippsCredentials,isValidVippsTokenResponse} from "./vipps-test-core.mjs";
/** Read-only connection probe: TEST ONLY; no payment, QR, capture, or booking changes. */
const origins=new Set(["https://supabase.com","https://app.supabase.com",
  "https://msvendsen87.github.io","https://golfkongen.no","https://www.golfkongen.no",
  // Local, self-contained admin diagnostic file. Valid signed Supabase admin JWT required.
  "null"]);
const json=(body:unknown,status=200,origin="")=>new Response(JSON.stringify(body),{
 status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",
 "x-content-type-options":"nosniff","referrer-policy":"no-referrer",
 ...(origins.has(origin)?{"access-control-allow-origin":origin,"vary":"Origin"}:{})}
});
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin")||"";
 if(origin&&!origins.has(origin))return json({ok:false,error:"origin_not_allowed"},403);
 if(req.method==="OPTIONS")return new Response(null,{status:204,
  headers:{...(origins.has(origin)?{"access-control-allow-origin":origin}:{}),
  "access-control-allow-methods":"GET,OPTIONS",
  "access-control-allow-headers":"authorization,apikey,content-type",
  "access-control-max-age":"600","vary":"Origin"}});
 const send=(body:unknown,status=200)=>json(body,status,origin);
 if(req.method!=="GET")return send({ok:false,error:"method_not_allowed"},405);
 if(!new URL(req.url).pathname.endsWith("/gk2-vipps-test-connection"))return send({ok:false,error:"not_found"},404);
 const base=Deno.env.get("SUPABASE_URL")||"";
 const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!base||!service)return send({ok:false,error:"server_not_configured"},503);
 const auth=req.headers.get("authorization")||"";
 if(!auth.startsWith("Bearer ")||auth.length>7000)return send({ok:false,error:"authentication_required"},401);
 // Supabase Dashboard's built-in tester can run as the service_role
 // without displaying/copying that private token. This test endpoint is
 // read-only and never creates, captures, or refunds a Vipps payment.
 const token=auth.slice(7);
 const db=createClient(base,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const encode=new TextEncoder();
 async function sha(s:string){
   return new Uint8Array(await crypto.subtle.digest("SHA-256",encode.encode(s)));
 }
 const [provided,expected]=await Promise.all([sha(token),sha(service)]);
 let diff=0;for(let i=0;i<provided.length;i++)diff|=provided[i]^expected[i];
 const dashboardServiceRole=diff===0 && token.length===service.length;
 if(!dashboardServiceRole){
   const {data:userInfo,error:userError}=await db.auth.getUser(token);
   const user=userInfo?.user;
   if(userError||!user?.email||!user.email_confirmed_at)return send({ok:false,error:"authentication_required"},401);
   const {data:isAdmin,error:adminError}=await db.rpc("gk2_is_admin",{p_email:user.email.trim().toLowerCase()});
   if(adminError||isAdmin!==true)return send({ok:false,error:"admin_only"},403);
 }
 const c={
   msn:Deno.env.get("GK2_VIPPS_TEST_MSN")||"",
   clientId:Deno.env.get("GK2_VIPPS_TEST_CLIENT_ID")||"",
   clientSecret:Deno.env.get("GK2_VIPPS_TEST_CLIENT_SECRET")||"",
   subscriptionKey:Deno.env.get("GK2_VIPPS_TEST_SUBSCRIPTION_KEY")||""
 };
 const config=validateTestVippsCredentials(c);
 if(!config.ok)return send({ok:false,environment:"test",msn:"321607",connected:false,error:"test_credentials_not_configured"},503);
 try {
   const response=await fetch("https://apitest.vipps.no/accesstoken/get",{
     method:"POST",headers:{
      "client_id":c.clientId,"client_secret":c.clientSecret,
      "Ocp-Apim-Subscription-Key":c.subscriptionKey,
      "Merchant-Serial-Number":c.msn,"content-type":"application/json"
     },body:"",signal:AbortSignal.timeout(10000)
   });
   if(!response.ok)return send({ok:false,environment:"test",msn:"321607",connected:false,error:"vipps_auth_failed"},502);
   const result=await response.json();
   if(!isValidVippsTokenResponse(result))return send({ok:false,environment:"test",msn:"321607",connected:false,error:"vipps_token_invalid"},502);
   return send({ok:true,environment:"test",msn:"321607",connected:true,paymentCreationEnabled:false,bookingMutationEnabled:false});
 }catch{
   return send({ok:false,environment:"test",msn:"321607",connected:false,error:"vipps_unavailable"},503);
 }
});