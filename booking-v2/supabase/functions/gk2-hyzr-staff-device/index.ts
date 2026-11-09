/**
 * Device-only personal employee PIN. Booking and employee email are selected
 * by server; the PC can send only an 8-digit code, never a booking ID.
 * Database function binds code to exact paid booking's customer_email and
 * enforces 5 wrong attempts => 15 minute lockout.
 */
import {createClient} from "npm:@supabase/supabase-js@2.95.0";
import {validStaffAttempt,validCurrentStaffBooking} from "./staff-guard.mjs";
const send=(value:unknown,status=200)=>new Response(JSON.stringify(value),{
 status,headers:{"content-type":"application/json; charset=utf-8",
 "cache-control":"no-store","x-content-type-options":"nosniff",
 "referrer-policy":"no-referrer"}
});
const enc=new TextEncoder();
async function validDevice(req:Request){
 const hash=(Deno.env.get("GK2_HYZR_DEVICE_TOKEN_SHA256")||"").toLowerCase().trim();
 const token=req.headers.get("X-GK2-HYZR-Device-Token")||"";
 if(!/^[a-f0-9]{64}$/.test(hash)||!/^[A-Za-z0-9_-]{43,120}$/.test(token))return false;
 const b=await crypto.subtle.digest("SHA-256",enc.encode(token));
 const actual=[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
 let diff=0;for(let i=0;i<64;i++)diff|=hash.charCodeAt(i)^actual.charCodeAt(i);
 return diff===0;
}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST"||new URL(req.url).pathname!=="/gk2-hyzr-staff-device/enable")
  return send({ok:false,code:"not_found_or_method"},404);
 if(req.headers.has("Origin"))return send({ok:false,code:"browser_not_supported"},403);
 if(!await validDevice(req))return send({ok:false,code:"device_auth_required"},401);
 const url=Deno.env.get("SUPABASE_URL")||"";
 const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!key)return send({ok:false,code:"server_not_configured"},503);
 const raw=await req.text();
 if(raw.length>120)return send({ok:false,code:"invalid_request"},400);
 let input:any;try{input=JSON.parse(raw)}catch{return send({ok:false,code:"invalid_json"},400)}
 if(!validStaffAttempt(input))return send({ok:false,code:"invalid_staff_code"},400);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const {data:state,error:se}=await db.rpc("gk2_hyzr_preview_state",{p_at:new Date().toISOString()});
  if(se||!validCurrentStaffBooking(state))
   return send({ok:false,code:"no_current_employee_booking"},409);
  const {data:verified,error:ve}=await db.rpc("gk2_hyzr_staff_enable",{
   p_reservation:state.bookingId,p_code:input.code
  });
  if(ve)return send({ok:false,code:"employee_mode_unavailable"},503);
  if(verified?.ok!==true)return send({ok:false,code:verified?.code||"employee_code_rejected"},403);
  return send({ok:true,mode:"staff",staffEnabled:true,until:verified.validUntil,
    extensionPaymentEnabled:false});
 }catch{return send({ok:false,code:"employee_mode_unavailable"},503);}
});