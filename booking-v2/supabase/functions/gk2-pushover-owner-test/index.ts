// One-time owner-only Pushover test. Not linked to Booking2 release gates.
// Protected by a signed GitHub/Supabase request, provider membership readback,
// and a permanent, DB-backed at-most-once send claim.
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
const TEST_ID="owner-only-2026-10-27",LOCKED_GROUP="golfkongen";
const env=k=>Deno.env.get(k)||"";
const txt=new TextEncoder();
function json(data,status=200){return new Response(JSON.stringify(data),{
 status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}})}
const db=createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{
 auth:{persistSession:false,autoRefreshToken:false}});
const validKey=s=>/^[A-Za-z0-9]{30}$/.test(s);
async function request(path,opts={}){
 const r=await fetch("https://api.pushover.net/1/"+path,{
  ...opts,signal:AbortSignal.timeout(14000)});
 let data=null;try{data=await r.json()}catch(_){}
 return {ok:r.ok,status:r.status,body:data};
}
async function signed(req){
 const t=req.headers.get("x-gk2-owner-test-time")||"";
 const sig=req.headers.get("x-gk2-owner-test-signature")||"";
 const root=env("GK2_QUICKBUTIK_API_KEY");
 if(root.length<20||!/^\d{10}$/.test(t)||!/^[a-f0-9]{64}$/.test(sig)
    ||Math.abs(Date.now()-Number(t)*1000)>120000)return false;
 const key=await crypto.subtle.importKey("raw",txt.encode(root),
  {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const derived=await crypto.subtle.sign("HMAC",key,
  txt.encode("gk2-pushover-owner-one-time-test-v1"));
 const sub=await crypto.subtle.importKey("raw",derived,
  {name:"HMAC",hash:"SHA-256"},false,["verify"]);
 const bytes=new Uint8Array(sig.match(/.{2}/g).map(x=>parseInt(x,16)));
 return await crypto.subtle.verify("HMAC",sub,bytes,
  txt.encode("POST:/run:"+t));
}
async function rpc(name,args){
 const {data,error}=await db.rpc(name,args);
 if(error)throw Error("database_"+name+"_"+(error.code||"unknown"));
 return data;
}
async function preflight(){
 const token=env("GK2_PUSHOVER_APP_TOKEN").trim();
 if(!validKey(token))return {ok:false,reason:"invalid_app_token_format"};
 const list=await request("groups.json?token="+encodeURIComponent(token),{
  method:"GET",headers:{"Accept":"application/json"}});
 if(!list.ok||list.body?.status!==1||!Array.isArray(list.body.groups))
  return {ok:false,reason:"groups_list_failed"};
 const groups=list.body.groups.filter(x=>
   String(x.name||"").trim().toLowerCase()===LOCKED_GROUP&&validKey(x.group));
 if(groups.length!==1)return {ok:false,reason:"group_missing_or_ambiguous"};
 const groupKey=groups[0].group;
 const detail=await request("groups/"+encodeURIComponent(groupKey)+".json?token="+encodeURIComponent(token),{
  method:"GET",headers:{"Accept":"application/json"}});
 if(!detail.ok||detail.body?.status!==1||
 !Array.isArray(detail.body.users)||
 String(detail.body.name||"").trim().toLowerCase()!==LOCKED_GROUP)
  return {ok:false,reason:"group_members_unavailable"};
 const users=detail.body.users;
 const active=users.filter(x=>x.disabled===false||x.disabled===0);
 // The owner explicitly saved 5 disabled and 1 active in a six-user group.
 // DO NOT send if another member can receive.
 const ownerOnly=users.length===6&&active.length===1&&
 String(active[0].memo||"").trim().toLowerCase()==="kristoffer"&&
 users.filter(x=>x!==active[0]).every(x=>x.disabled===true||x.disabled===1);
 if(!ownerOnly)return {ok:false,reason:"owner_not_only_active_member",
  totalMembers:users.length,activeMembers:active.length};
 const check=await request("users/validate.json",{
  method:"POST",
  headers:{"Content-Type":"application/x-www-form-urlencoded"},
  body:new URLSearchParams({token,user:groupKey})
 });
 if(!check.ok||check.body?.status!==1)
  return {ok:false,reason:"group_delivery_validation_failed"};
 return {ok:true,token,groupKey,totalMembers:users.length,activeMembers:active.length};
}
Deno.serve(async req=>{
 const path=new URL(req.url).pathname;
 if(req.method==="GET"&&path.endsWith("/health"))
  return json({ok:true,service:"owner-only-pushover-test",bookingEnabled:false});
 if(req.method!=="POST"||!path.endsWith("/run"))return json({ok:false},404);
 if(!await signed(req))return json({ok:false,reason:"unauthorized"},403);
 let info;
 try{info=await preflight()}catch(_e){return json({ok:false,reason:"provider_preflight_unavailable"},503)}
 if(!info.ok)return json({ok:false,reason:info.reason,
  totalMembers:info.totalMembers??null,activeMembers:info.activeMembers??null},412);
 let claimed=false;
 try{claimed=await rpc("gk2_claim_owner_pushover_test",{p_id:TEST_ID})}
 catch(_e){return json({ok:false,reason:"cannot_claim_test"},503)}
 if(claimed!==true)return json({ok:false,reason:"test_already_attempted"},409);
 let state="unknown",receipt=null,err=null;
 try{
  const result=await request("messages.json",{
   method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
   body:new URLSearchParams({
    token:info.token,user:info.groupKey,
    title:"GolfKongen Booking 2.0 – TEST (kun Kristoffer)",
    message:"Dette er ett testvarsel for GolfKongen Booking 2.0. Kun Kristoffer skal motta det. Ingen booking eller dørkode er opprettet.",
    priority:"0"
   })
  });
  if(result.ok&&result.body?.status===1&&
    typeof result.body.request==="string"){
   state="accepted";receipt=result.body.request;
  }else{
   state="rejected";err="provider_http_"+result.status;
  }
 }catch(_e){err="provider_result_ambiguous"}
 try{await rpc("gk2_finish_owner_pushover_test",{
  p_id:TEST_ID,p_state:state,p_receipt:receipt,p_error:err
 })}catch(_e){return json({ok:false,reason:"receipt_storage_failed",sendState:state},503)}
 return json({ok:state==="accepted",providerAccepted:state==="accepted",
  deliveredToOwnerOnlyGroup:true,totalMembers:info.totalMembers,
  enabledMembers:info.activeMembers,sendState:state,
  providerReceiptRecorded:!!receipt},state==="accepted"?200:502);
});