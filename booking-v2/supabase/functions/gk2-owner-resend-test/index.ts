// One isolated test email, fixed owner recipient only. Does NOT accept email,
// booking, code, order, or recipient details from a caller.
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
const env=k=>Deno.env.get(k)||"";
const TEST_KEY="booking2-resend-owner-20261027";
const OWNER="kristoffer.mrk@gmail.com";
const textEncoder=new TextEncoder();
const db=createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{
 auth:{persistSession:false,autoRefreshToken:false}
});
function json(o,status=200){return new Response(JSON.stringify(o),{
 status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}})}
async function validSignature(req){
 const timestamp=req.headers.get("x-gk2-owner-mail-time")||"";
 const signature=req.headers.get("x-gk2-owner-mail-signature")||"";
 const root=env("GK2_QUICKBUTIK_API_KEY");
 if(root.length<20||!/^\d{10}$/.test(timestamp)||!/^[0-9a-f]{64}$/.test(signature)||
 Math.abs(Date.now()-Number(timestamp)*1000)>120000)return false;
 const rootKey=await crypto.subtle.importKey("raw",textEncoder.encode(root),
  {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const seed=await crypto.subtle.sign("HMAC",rootKey,
  textEncoder.encode("gk2-owner-resend-test-2026-10-27"));
 const key=await crypto.subtle.importKey("raw",seed,
  {name:"HMAC",hash:"SHA-256"},false,["verify"]);
 const bytes=new Uint8Array(signature.match(/.{2}/g).map(x=>parseInt(x,16)));
 return crypto.subtle.verify("HMAC",key,bytes,
  textEncoder.encode("POST:/send:"+timestamp));
}
async function rpc(name,args){
 const {data,error}=await db.rpc(name,args);
 if(error)throw Error("rpc_"+name+"_"+error.code);
 return data;
}
Deno.serve(async req=>{
 const path=new URL(req.url).pathname;
 if(req.method==="GET"&&path.endsWith("/health"))
  return json({ok:true,service:"booking2-owner-resend-test",bookingsEnabled:false});
 if(req.method!=="POST"||!path.endsWith("/send"))return json({ok:false,reason:"not_found"},404);
 if(!await validSignature(req))return json({ok:false,reason:"unauthorized"},403);
 if(!env("RESEND_API_KEY").startsWith("re_"))
  return json({ok:false,reason:"resend_key_unconfigured"},503);
 let claimed;
 try{claimed=await rpc("gk2_claim_owner_email_test",{p_key:TEST_KEY})}
 catch(_){return json({ok:false,reason:"cannot_claim_test"},503)}
 if(claimed!==true)return json({ok:false,reason:"already_attempted"},409);
 let status="unknown",id=null;
 try{
  const sent=await fetch("https://api.resend.com/emails",{
   method:"POST",headers:{
    "Authorization":"Bearer "+env("RESEND_API_KEY"),
    "Content-Type":"application/json",
    "Idempotency-Key":TEST_KEY
   },
   body:JSON.stringify({
    from:"GolfKongen <booking@golfkongen.no>",
    to:[OWNER],
    subject:"TEST – GolfKongen Booking 2.0 e-post",
    text:"Dette er en kontrollert test av e-post fra GolfKongen Booking 2.0.\n\nDet er ikke opprettet noen booking eller adgangskode.\n\nHvis du mottar e-posten, svarer du Mottatt i ChatGPT."
   }),signal:AbortSignal.timeout(18000)
  });
  const body=await sent.json().catch(()=>null);
  if(sent.ok&&typeof body?.id==="string"){status="sent";id=body.id}
  else status="rejected";
 }catch(_){status="unknown"}
 try{await rpc("gk2_finish_owner_email_test",{
  p_key:TEST_KEY,p_status:status,p_id:id
 })}catch(_){return json({ok:false,reason:"receipt_not_recorded"},503)}
 return json({ok:status==="sent",state:status,receipt:id!==null},status==="sent"?200:502);
});