/**
 * HYZR device read-only status endpoint – Testing only.
 * No customer changes, no payment capture, no PC installation.
 *
 * Security model:
 *   - Only a companion holding a random 256-bit device token is allowed.
 *   - Secret hash resides in a Supabase Edge Function env secret, never code.
 *   - verify_jwt=false because physical companion uses its own secret header.
 *   - If unconfigured, this endpoint is DISABLED (503).
 *   - No CORS headers, no personal data, no write operations.
 *   - QR/payment always disabled until a separate signed payment API exists.
 */
import {createClient} from "npm:@supabase/supabase-js@2.95.0";
import {normalizeServerStatus,verifyHashFormat,
        validDeviceTokenFormat,compareHexConstantTime} from "./device-status-core.mjs";
import {collectExtensionOptions} from "./extension-options.mjs";

const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
 status,
 headers:{"Content-Type":"application/json; charset=utf-8",
   "Cache-Control":"no-store, no-cache, max-age=0, must-revalidate",
   "Pragma":"no-cache",
   "Referrer-Policy":"no-referrer",
   "X-Content-Type-Options":"nosniff"}
});
const encode=new TextEncoder();
async function sha256Hex(s:string):Promise<string>{
 const digest=await crypto.subtle.digest("SHA-256",encode.encode(s));
 return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,"0")).join("");
}
Deno.serve(async(req:Request)=>{
 // No browser embedding, fake CORS preflights or unintended methods.
 if(req.method!=="GET")return respond({ok:false,error:"method_not_allowed"},405);
 const url=new URL(req.url);
 const previewOptions=url.pathname.endsWith("/gk2-hyzr-device-status/options");
 if(!previewOptions && !url.pathname.endsWith("/gk2-hyzr-device-status"))
   return respond({ok:false,error:"not_found"},404);
 const dbUrl=Deno.env.get("SUPABASE_URL")||"";
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const expected=(Deno.env.get("GK2_HYZR_DEVICE_TOKEN_SHA256")||"").trim().toLowerCase();
 if(!dbUrl||!serviceKey||!verifyHashFormat(expected))
   return respond({ok:false,error:"device_status_not_configured"},503);
 const deviceToken=req.headers.get("X-GK2-HYZR-Device-Token")||"";
 if(!validDeviceTokenFormat(deviceToken))
   return respond({ok:false,error:"device_auth_required"},401);
 const digest=await sha256Hex(deviceToken);
 if(!compareHexConstantTime(digest,expected))
   return respond({ok:false,error:"device_auth_required"},401);
 const checkedAt=new Date().toISOString();
 try {
   const db=createClient(dbUrl,serviceKey,
      {auth:{autoRefreshToken:false,persistSession:false}});
   const {data,error}=await db.rpc("gk2_hyzr_preview_state",{p_at:checkedAt});
   if(error)return respond({ok:false,error:"server_state_unavailable"},503);
   const state=normalizeServerStatus(data,checkedAt);
   if(state.ok===false)return respond({ok:false,error:"invalid_server_status"},503);
   // The downstream device cannot control real sessions until enrollment,
   // local PC validation and payment/hand-over checks are completed.
   if(previewOptions){
     // Read-only. Do not create a payment, reserve a slot or accept a browser QR.
     if(state.status!=="active"||state.resource!=="hyzr"||state.staff_mode===true)
       return respond({ok:true,mode:"pricing_preview_only",options:[],paymentReady:false,deviceControlEnabled:false});
     const durations=[30,60,90,120];
     const quotes=await Promise.all(durations.map(minutes=>db.rpc("gk2_hyzr_extension_quote",{
       p_reservation:state.reservation_id,p_extra_minutes:minutes,p_at:checkedAt
     })));
     if(quotes.some(q=>q.error))return respond({ok:false,error:"extension_quotes_unavailable"},503);
     const options=collectExtensionOptions(state,quotes.map(q=>q.data));
     return respond({ok:true,mode:"pricing_preview_only",options,
       paymentReady:false,deviceControlEnabled:false,qrPaymentEnabled:false});
   }
   return respond({...state,deviceControlEnabled:false,qrPaymentEnabled:false});
 }catch {
   return respond({ok:false,error:"server_state_unavailable"},503);
 }
});
