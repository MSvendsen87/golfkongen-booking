/**
 * TEST REPLAY ONLY – physical HYZR monitor verification against REAL confirmed
 * Booking 2.0 reservation on 11 November. This cannot mutate bookings,
 * retrieve personal details, enable QR, authorize payments, or grant live PC
 * access. Requires the same enrolled Windows device token as live read-only
 * monitor. Never embed this endpoint in normal HYZR device control.
 */
import {createClient} from "npm:@supabase/supabase-js@2.95.0";
import {
 validDeviceTokenFormat,verifyHashFormat,compareHexConstantTime
} from "./device-status-core.mjs";
const checked={
 welcome:{at:"2026-11-11T13:30:15.000Z",expected:"active"},
 warning:{at:"2026-11-11T15:26:30.000Z",expected:"warning"},
 expired:{at:"2026-11-11T15:31:00.000Z",expected:"grace"},
 locked:{at:"2026-11-11T15:40:00.000Z",expected:"locked"}
};
const fixedBookingId="873b85c0-1b06-4f51-a32f-1cecded84fbf";
const send=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
 status,headers:{"content-type":"application/json; charset=utf-8",
  "cache-control":"no-store, no-cache, max-age=0","pragma":"no-cache",
  "referrer-policy":"no-referrer","x-content-type-options":"nosniff"}
});
const encode=new TextEncoder();
async function hash(value:string):Promise<string>{
 const digest=await crypto.subtle.digest("SHA-256",encode.encode(value));
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
}
Deno.serve(async(req:Request)=>{
 if(req.method!=="GET")return send({ok:false,code:"method_not_allowed"},405);
 const url=new URL(req.url);
 if(url.pathname!=="/gk2-hyzr-test-replay")
  return send({ok:false,code:"not_found"},404);
 const step=url.searchParams.get("step")||"";
 if(!Object.hasOwn(checked,step))
  return send({ok:false,code:"invalid_replay_step"},400);
 const dbUrl=Deno.env.get("SUPABASE_URL")||"";
 const svc=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const secret=(Deno.env.get("GK2_HYZR_DEVICE_TOKEN_SHA256")||"").trim().toLowerCase();
 if(!dbUrl||!svc||!verifyHashFormat(secret))
  return send({ok:false,code:"not_configured"},503);
 const token=req.headers.get("X-GK2-HYZR-Device-Token")||"";
 if(!validDeviceTokenFormat(token)||!compareHexConstantTime(await hash(token),secret))
  return send({ok:false,code:"device_auth_required"},401);
 const scenario=checked[step as keyof typeof checked];
 try{
  const db=createClient(dbUrl,svc,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await db.rpc("gk2_hyzr_preview_state",{p_at:scenario.at});
  if(error||!data?.ok)return send({ok:false,code:"preview_unavailable"},503);
  if(data.state!==scenario.expected||
    (scenario.expected!=="locked" &&
      (data.bookingId!==fixedBookingId||data.resource!=="hyzr")))
    return send({ok:false,code:"scenario_changed"},409);
  // Lock step must be locked, while earlier stages must be the *same*
  // real paid reservation. No customer info, no mutable admin controls.
  return send({
    ok:true,
    mode:"READONLY_SERVER_REPLAY",
    displayOnly:true,
    verifiedFrom:"gk2_hyzr_preview_state",
    scenario:step,
    snapshotAt:scenario.at,
    screenPhase:data.state,
    reservationMatches:scenario.expected==="locked"?null:true,
    endAt:scenario.expected==="locked"?null:data.endsAt,
    lockAt:scenario.expected==="locked"?null:data.lockAt,
    extensionPossible:scenario.expected==="locked"?false:data.extensionPossible===true,
    qrPaymentEnabled:false,
    paymentReady:false,
    deviceControlEnabled:false,
    hyzrResetEnabled:false
  });
 }catch{return send({ok:false,code:"preview_unavailable"},503);}
});
