import {auditDayCatalog,PRODUCT_IDS} from "./checkout-preflight.mjs";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
const url=Deno.env.get("SUPABASE_URL")||"";
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const origins=new Set(["https://golfkongen.no","https://www.golfkongen.no","https://app.golfkongen.no","https://eadgdcimcmfyuicizboo.supabase.co","https://msvendsen87.github.io"]);
const allowedEmails=new Set(["post@golfkongen.no","kristoffer.mrk@gmail.com"]);
const db=url&&serviceKey?createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}}):null;
const getCors=(origin:string)=>origin&&origins.has(origin)?{"Access-Control-Allow-Origin":origin,"Vary":"Origin"}:{};
function reply(data:unknown,status=200,origin=""){
 return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff",...getCors(origin)}});
}
function err(code:string,status=400,origin=""){return reply({ok:false,code},status,origin)}
function validDate(s:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const t=new Date(s+"T12:00:00Z");return !Number.isNaN(t.valueOf())&&t.toISOString().slice(0,10)===s}
async function body(req:Request){const raw=await req.text();if(raw.length>12000)throw new Error("payload_too_large");return JSON.parse(raw)}
async function admin(req:Request){
 if(!db)return null;
 const header=req.headers.get("authorization")||"";
 if(!header.startsWith("Bearer ")||header.length>7000)return null;
 const {data,error}=await db.auth.getUser(header.slice(7));
 const user=data?.user,email=user?.email?.toLowerCase().trim();
 if(error||!user||!email||!user.email_confirmed_at||!allowedEmails.has(email))return null;
 const {data:valid,error:checkError}=await db.rpc("gk2_is_admin",{p_email:email});
 if(checkError||valid!==true)return null;
 return {email,id:user.id};
}
async function rpc(method:string,args:Record<string,unknown>){
 if(!db)throw new Error("server_not_configured");
 const {data,error}=await db.rpc(method,args);
 if(error)throw new Error("rpc_failed:"+method+":"+error.code);
 return data;
}
Deno.serve(async (req:Request)=>{
 const origin=req.headers.get("origin")||"";
 if(origin&&!origins.has(origin))return err("forbidden_origin",403,origin);
 const allow={"Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Max-Age":"600"};
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{...getCors(origin),...allow}});
 if(!db)return err("backend_not_ready",503,origin);
 const requestPath=new URL(req.url).pathname;
 const slug="/gk-booking-v2";
 const pos=requestPath.indexOf(slug);
 const p0=pos>=0?requestPath.slice(pos+slug.length):requestPath;
 const path=p0.endsWith("/")&&p0.length>1?p0.slice(0,-1):p0||"/";
 const u=new URL(req.url);
 try{
  if(req.method==="GET"&&path==="/admin")return new Response(null,{status:302,headers:{"Location":"https://msvendsen87.github.io/golfkongen-booking/","Cache-Control":"no-store"}});
  if(req.method==="GET"&&path==="/health")return reply({ok:true,environment:"staging",bookingEnabled:false,checkout:false},200,origin);
  if(req.method==="GET"&&path==="/availability"){
   const day=u.searchParams.get("date")||"";
   if(!validDate(day))return err("invalid_date",400,origin);
   const result=await rpc("gk2_day_availability",{p_day:day});
   const safeBlocks=Array.isArray(result.blocks)?result.blocks.map((x:Record<string,unknown>)=>({target:x.target,start_min:x.start_min,end_min:x.end_min})):[];
   return reply({ok:true,day:result.day,claims:result.claims||[],blocks:safeBlocks,openingHoursByResource:result.openingHoursByResource||{},bookingEnabled:result.bookingEnabled===true},200,origin);
  }
  if(path==="/hold"||path==="/checkout"||path.startsWith("/webhook/")){
   // A working checkout must be verified against Quickbutik with protected server-side price
   // calculation, existing 7 customer groups and authoritative paid order retrieval.
   return err("not_enabled_until_payment_and_safety_tests",503,origin);
  }
  if(!path.startsWith("/admin/"))return err("not_found",404,origin);
  const user=await admin(req);if(!user)return err("admin_forbidden",403,origin);
  if(req.method==="GET"&&path==="/admin/health")return reply({ok:true,email:user.email,status:"isolated_staging"},200,origin);
  if(req.method==="GET"&&path==="/admin/snapshot"){
    const day=u.searchParams.get("date")||"";if(!validDate(day))return err("invalid_date",400,origin);
    return reply({ok:true,...await rpc("gk2_admin_snapshot",{p_actor:user.email,p_day:day})},200,origin);
  }
  if(req.method==="GET"&&path==="/admin/checkout-preflight"){
    const day=u.searchParams.get("date")||"";
    if(!validDate(day))return err("invalid_date",400,origin);
    const catalogs=await Promise.all(Object.entries(PRODUCT_IDS).map(async ([resource,pid])=>{
      const response=await fetch("https://cold-shadow-36dc.post-cd6.workers.dev/products/"+pid,{
        headers:{"Accept":"application/json"},signal:AbortSignal.timeout(12000)
      });
      if(!response.ok)throw Error("catalog_unavailable:"+resource);
      const body=await response.json();
      if(!body?.product||!Array.isArray(body.product.variants))throw Error("invalid_catalog:"+resource);
      return [resource,body.product];
    }));
    return reply({ok:true,...auditDayCatalog({date:day,products:Object.fromEntries(catalogs)})},200,origin);
  }
  if(req.method!=="POST")return err("method_not_allowed",405,origin);
  const b=await body(req);
  const a=user.email;
  if(path==="/admin/hours"){
   if(!["hyzr","dart_a","dart_b","venue"].includes(b.resource)||![1,2,3,4,5,6,7].includes(Number(b.weekday))||!Number.isInteger(b.opens)||!Number.isInteger(b.closes)||typeof b.active!=="boolean")return err("invalid_hours",400,origin);
   return reply({ok:true,changed:await rpc("gk2_admin_set_hours",{p_actor:a,p_resource:b.resource,p_weekday:b.weekday,p_opens:b.opens,p_closes:b.closes,p_active:b.active})},200,origin);
  }
  if(path==="/admin/block"){
   if(!validDate(String(b.dateFrom||""))||!validDate(String(b.dateTo||""))||!Number.isInteger(b.start)||!Number.isInteger(b.end))return err("invalid_block",400,origin);
   return reply({ok:true,id:await rpc("gk2_admin_block",{p_actor:a,p_target:b.target,p_from:b.dateFrom,p_to:b.dateTo,p_start:b.start,p_end:b.end,p_label:b.label,p_weekdays:Array.isArray(b.weekdays)?b.weekdays:null})},200,origin);
  }
  if(path==="/admin/unblock")return reply({ok:true,changed:await rpc("gk2_admin_unblock",{p_actor:a,p_id:b.id})},200,origin);
  if(path==="/admin/price-draft"){
   if(!Number.isInteger(b.minutes)||!Number.isInteger(b.ore))return err("invalid_price",400,origin);
   return reply({ok:true,id:await rpc("gk2_admin_price_draft",{p_actor:a,p_resource:b.resource,p_group:b.group,p_minutes:b.minutes,p_ore:b.ore,p_note:b.note||""}),status:"draft_not_applied_in_quickbutik"},202,origin);
  }
  if(path==="/admin/member-request"){
   return reply({ok:true,id:await rpc("gk2_admin_request_membership",{p_actor:a,p_email:b.email,p_group:b.group,p_action:b.action}),status:"pending_external_sync"},202,origin);
  }
  if(path==="/admin/tournament-draft"){
   if(!validDate(String(b.from||""))||!validDate(String(b.to||"")))return err("invalid_tournament",400,origin);
   return reply({ok:true,id:await rpc("gk2_admin_tournament_draft",{p_actor:a,p_name:b.name,p_from:b.from,p_to:b.to,p_format:b.format,p_course:b.course||""}),status:"draft"},202,origin);
  }
  return err("not_implemented",404,origin);
 }catch(e){
  const msg=e instanceof Error?e.message:"unknown";
  console.error("gk2-staging-error",msg.replace(/([a-z0-9._%+-]+)@([a-z0-9.-]+)/ig,"[redacted-email]"));
  return err("request_rejected_or_service_unavailable",400,origin);
 }
});
