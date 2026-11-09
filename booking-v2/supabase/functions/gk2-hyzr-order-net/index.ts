/**
 * Safe one-booking amount reconcile for physical HYZR controller.
 * No public browser access, no caller-supplied order/customer/price.
 * Verifies exact Quickbutik V1 paid net fields before updating Booking 2.0.
 * If paid NET is not explicit/verifiable it DOES NOT guess from gross.
 */
import {createClient} from "npm:@supabase/supabase-js@2.95.0";
import {verifyV1Net} from "./v1-net-core.mjs";
const send=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
 status,headers:{"content-type":"application/json; charset=utf-8",
  "cache-control":"no-store","referrer-policy":"no-referrer",
  "x-content-type-options":"nosniff"}
});
const encode=new TextEncoder();
async function hash(s:string){
 const b=await crypto.subtle.digest("SHA-256",encode.encode(s));
 return [...new Uint8Array(b)].map(n=>n.toString(16).padStart(2,"0")).join("");
}
async function auth(req:Request){
 const expected=(Deno.env.get("GK2_HYZR_DEVICE_TOKEN_SHA256")||"").toLowerCase().trim();
 const token=req.headers.get("X-GK2-HYZR-Device-Token")||"";
 if(!/^[a-f0-9]{64}$/.test(expected)||!/^[A-Za-z0-9_-]{43,120}$/.test(token))return false;
 const digest=await hash(token);let diff=0;
 for(let i=0;i<64;i++)diff |= expected.charCodeAt(i)^digest.charCodeAt(i);
 return diff===0;
}
function onlyOneOrder(raw:any,orderNum:string){
 const rows=Array.isArray(raw)?raw:
    Array.isArray(raw?.orders)?raw.orders:
    Array.isArray(raw?.data)?raw.data:
    raw&&raw.order_id!==undefined?[raw]:[];
 const hits=rows.filter((x:any)=>x&&String(x.order_id)===orderNum);
 return hits.length===1?hits[0]:null;
}
const msCache=new Map<string,number>();
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST"||new URL(req.url).pathname!=="/gk2-hyzr-order-net/reconcile")
   return send({ok:false,code:"not_found_or_method"},404);
 if(req.headers.has("Origin"))return send({ok:false,code:"browser_not_supported"},403);
 if(!await auth(req))return send({ok:false,code:"device_auth_required"},401);
 const project=Deno.env.get("SUPABASE_URL")||"";
 const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const key=Deno.env.get("GK2_QUICKBUTIK_API_KEY")||"";
 if(!project||!service||key.length<20)return send({ok:false,code:"quickbutik_reconciliation_not_configured"},503);
 const db=createClient(project,service,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const {data:c,error:e}=await db.rpc("gk2_hyzr_current_unpriced_order",{p_at:new Date().toISOString()});
  if(e||!c?.ok)return send({ok:false,code:"booking_state_unavailable"},503);
  if(c.unpriced!==true)return send({ok:true,mode:"not_needed",updated:false});
  const orderNum=String(c.orderNumber||"");
  if(!/^[1-9][0-9]{0,8}$/.test(orderNum))return send({ok:false,code:"order_id_invalid"},400);
  const now=Date.now();
  if(msCache.get(orderNum)&&now-(msCache.get(orderNum)||0)<50000)
    return send({ok:true,mode:"already_checked_recently",updated:false});
  msCache.set(orderNum,now);
  const response=await fetch("https://api.quickbutik.com/v1/orders?order_id="+
   encodeURIComponent(orderNum)+"&include_details=true&limit=2",{
    method:"GET",headers:{
     "Authorization":"Basic "+btoa(key.trim()+":"+key.trim()),
     "Accept":"application/json"
    },redirect:"error",signal:AbortSignal.timeout(11500)
  });
  if(!response.ok)return send({ok:false,code:"quickbutik_unavailable"},503);
  const item=onlyOneOrder(await response.json(),orderNum);
  if(!item)return send({ok:false,code:"order_not_unique"},409);
  const proof=verifyV1Net(item,c);
  if(proof.ok!==true)return send({
    ok:true,mode:"manual_verification_required",
    reason:proof.code,updated:false
  });
  const {data:recorded,error:re}=await db.rpc("gk2_hyzr_record_verified_net_amount",{
    p_reservation:c.reservationId,p_order:orderNum,p_paid_ore:proof.amountOre
  });
  if(re||recorded?.ok!==true)return send({
    ok:false,code:recorded?.code||"amount_commit_unavailable"
  },503);
  return send({ok:true,mode:"verified_and_recorded",updated:recorded.duplicate!==true,
    amountVerified:true});
 }catch{return send({ok:false,code:"quickbutik_reconcile_unavailable"},503);}
});
