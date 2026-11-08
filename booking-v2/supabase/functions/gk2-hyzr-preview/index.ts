import { createClient } from "npm:@supabase/supabase-js@2.95.0";
const allowedOrigins=new Set([
  "https://golfkongen.no",
  "https://www.golfkongen.no",
  "https://msvendsen87.github.io"
]);
const dbUrl=Deno.env.get("SUPABASE_URL")||"";
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const client=dbUrl&&serviceKey?createClient(dbUrl,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}}):null;
const send=(data:unknown,status=200,origin="")=>new Response(JSON.stringify(data),{
  status,
  headers:{
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"private, no-store, max-age=0",
    "Vary":"Origin",
    ...(allowedOrigins.has(origin)?{"Access-Control-Allow-Origin":origin}:{}),
  },
});
Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("Origin")||"";
  if(origin&&!allowedOrigins.has(origin))return send({ok:false,error:"origin_not_allowed"},403);
  if(req.method==="OPTIONS"){
    return new Response(null,{status:204,headers:{
      ...(allowedOrigins.has(origin)?{"Access-Control-Allow-Origin":origin}:{}),
      "Access-Control-Allow-Methods":"GET,OPTIONS",
      "Access-Control-Allow-Headers":"authorization,apikey,content-type",
      "Access-Control-Max-Age":"600"
    }});
  }
  if(req.method!=="GET")return send({ok:false,error:"method_not_allowed"},405,origin);
  if(!client)return send({ok:false,error:"not_configured"},503,origin);
  const tokenHeader=req.headers.get("Authorization")||"";
  if(!tokenHeader.startsWith("Bearer ")||tokenHeader.length>7000)
    return send({ok:false,error:"authentication_required"},401,origin);
  const token=tokenHeader.slice(7);
  if(!token||token.split(".").length!==3)return send({ok:false,error:"invalid_session"},401,origin);
  const {data:userData,error:authError}=await client.auth.getUser(token);
  const user=userData?.user;
  if(authError||!user?.email||!user.email_confirmed_at)
    return send({ok:false,error:"invalid_session"},401,origin);
  const email=user.email.toLowerCase().trim();
  const {data:isAdmin,error:checkError}=await client.rpc("gk2_is_admin",{p_email:email});
  if(checkError||isAdmin!==true)
    return send({ok:false,error:"admin_only"},403,origin);
  const statsUrl=new URL(req.url);
  if(statsUrl.pathname.endsWith("/stats")){
    const from=statsUrl.searchParams.get("from")||"";
    const to=statsUrl.searchParams.get("to")||"";
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))
      return send({ok:false,error:"valid_from_and_to_required"},400,origin);
    const {data:usage,error:usageError}=await client.rpc("gk2_admin_booking_usage",{
      p_actor:email,p_from:from,p_to:to
    });
    if(usageError)return send({ok:false,error:"usage_unavailable"},503,origin);
    return send({ok:true,mode:"ADMIN_READONLY_STATS",data:usage},200,origin);
  }
  const requestUrl=new URL(req.url);
  const at=requestUrl.searchParams.get("at");
  if(at!==null&&(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(at)||!Number.isFinite(Date.parse(at))))
    return send({ok:false,error:"invalid_timestamp"},400,origin);
  const {data,error}=await client.rpc("gk2_hyzr_preview_state",{p_at:at||new Date().toISOString()});
  if(error)return send({ok:false,error:"state_unavailable"},503,origin);
  return send({ok:true,mode:"ADMIN_PREVIEW_ONLY",deviceControlEnabled:false,qrPaymentEnabled:false,state:data},200,origin);
});
