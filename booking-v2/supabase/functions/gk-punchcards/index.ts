import {createClient} from 'npm:@supabase/supabase-js@2.58.0';
import {punchcardOrder} from '../gk-booking-v2/punchcard-order.mjs';
import {loadV1OrderRecord} from '../gk-booking-v2/quickbutik-order-audit.mjs';
import {signDispatchRequest} from '../gk-booking-v2/dispatch-auth.mjs';
const env=(key:string)=>Deno.env.get(key)||'';
const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
const origins=new Set(['https://golfkongen.no','https://www.golfkongen.no','https://msvendsen87.github.io']);
async function rpc(name:string,args:Record<string,unknown>){
 const {data,error}=await db.rpc(name,args);if(error)throw Error(error.message);return data;
}
async function dispatch(){
 const timestamp=String(Math.floor(Date.now()/1000));
 const signature=await signDispatchRequest(env('GK2_QUICKBUTIK_API_KEY'),timestamp);
 await fetch(env('SUPABASE_URL')+'/functions/v1/gk-booking-notifier/internal/dispatch',{
  method:'POST',headers:{'content-type':'application/json','x-gk2-dispatch-timestamp':timestamp,'x-gk2-dispatch-signature':signature},body:'{}',signal:AbortSignal.timeout(50000)});
}
async function digest(value:string){
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
}
Deno.serve(async request=>{
 const origin=request.headers.get('origin')||'';
 const headers={'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':origins.has(origin)?origin:'https://golfkongen.no','vary':'Origin','access-control-allow-headers':'authorization,apikey,content-type','access-control-allow-methods':'GET,POST,OPTIONS'};
 const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(origin&&!origins.has(origin))return reply({ok:false,code:'forbidden_origin'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 const path=new URL(request.url).pathname.split('/gk-punchcards')[1]||'/';
 try{
 const raw=request.method==='POST'?await request.text():'{}';
 if(raw.length>4000)return reply({ok:false,code:'invalid_request'},400);
 const input=JSON.parse(raw);
 if(path==='/login'&&request.method==='POST'){
  const email=String(input.email||'').trim().toLowerCase();
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply({ok:false,code:'invalid_email'},400);
  const ip=request.headers.get('cf-connecting-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown';
  const allowed=await rpc('gk2_club_login_attempt',{p_email_hash:await digest('punch:'+email),p_ip_hash:await digest('punch-ip:'+ip)});
  if(!allowed)return reply({ok:false,code:'login_rate_limited'},429);
  const account=await rpc('gk2_punchcard_account',{p_email:email});
  if(account.cards.length){
   const {data,error}=await db.auth.admin.generateLink({type:'magiclink',email});
   if(error||!data?.properties?.email_otp)throw Error('login_unavailable');
   const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env('RESEND_API_KEY'),'content-type':'application/json','Idempotency-Key':'punch-login-'+crypto.randomUUID()},body:JSON.stringify({from:'GolfKongen <booking@golfkongen.no>',to:[email],subject:'Engangskode til klippekortet ditt',text:'Bekreft e-postadressen din med denne engangskoden:\n\n'+data.properties.email_otp+'\n\nSkriv koden på GolfKongen. Ikke del den med andre.'}),signal:AbortSignal.timeout(15000)});
   if(!sent.ok)throw Error('login_unavailable');
  }
  return reply({ok:true,message:'Har du et aktivt klippekort, får du en engangskode på e-post.'});
 }
 const token=request.headers.get('authorization')||'';
 if(!token.startsWith('Bearer ')||token.length>7000)return reply({ok:false,code:'login_required'},401);
 const {data,error}=await db.auth.getUser(token.slice(7));
 const user=data?.user;
 if(error||!user?.email_confirmed_at||!user.email)return reply({ok:false,code:'login_required'},401);
 const email=user.email.toLowerCase();
 if(path==='/account'&&request.method==='GET')return reply(await rpc('gk2_punchcard_account',{p_email:email}));
 if(path==='/sync'&&request.method==='POST'){
  const orderId=String(input.order||'');if(!/^[1-9][0-9]{0,8}$/.test(orderId))return reply({ok:false,code:'invalid_order'},400);
  const order=await loadV1OrderRecord(orderId,{apiKey:env('GK2_QUICKBUTIK_API_KEY')});
  const card=punchcardOrder(order,orderId);
  if(!card||card.email!==email)return reply({ok:false,code:'order_not_verified'},409);
  await rpc('gk2_punchcard_purchase',{p_order:orderId,p_email:email,p_cancelled:card.cancelled,p_qty:card.quantity});
  return reply(await rpc('gk2_punchcard_account',{p_email:email}));
 }
 if(path==='/book'&&request.method==='POST'){
  if(input.acceptedTerms!==true||!/^20\d\d-\d\d-\d\d$/.test(input.date)||!/^[a-f0-9-]{36}$/i.test(input.key)||!Number.isInteger(input.startMin)||!Number.isInteger(input.duration))return reply({ok:false,code:'invalid_booking'},400);
  const booking=await rpc('gk2_punchcard_book',{p_email:email,p_key:input.key,p_day:input.date,p_start:input.startMin,p_duration:input.duration});
  EdgeRuntime.waitUntil(dispatch().catch(()=>{}));
  return reply(booking);
 }
 if(path==='/cancel'&&request.method==='POST'){
  if(!/^[a-f0-9-]{36}$/i.test(input.id))return reply({ok:false,code:'invalid_booking'},400);
  const cancelled=await rpc('gk2_punchcard_cancel',{p_email:email,p_reservation:input.id});
  EdgeRuntime.waitUntil(dispatch().catch(()=>{}));
  return reply(cancelled);
 }
 return reply({ok:false,code:'not_found'},404);
 }catch(error){
 const message=String(error?.message||'');
 const code=['insufficient_minutes','cancellation_deadline','out_of_window','closed_hours','blocked_time','club_already_reserved','key_reuse'].find(x=>message.includes(x))||'request_failed';
 return reply({ok:false,code},409);
 }
});
