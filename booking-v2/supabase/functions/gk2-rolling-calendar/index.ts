import {syncCalendar} from './calendar-sync.mjs';
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return reply({ok:false,code:'method_not_allowed'},405);
 const ts=req.headers.get('x-gk2-cron-timestamp')||'',sig=req.headers.get('x-gk2-cron-signature')||'';
 if(!/^[0-9]{10}$/.test(ts)||!/^[0-9a-f]{64}$/.test(sig))return reply({ok:false,code:'unauthorized'},403);
 const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 async function rpc(name:string,args:unknown){
  const res=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});
  if(!res.ok)throw Error('database_rpc_failed');return await res.json();
 }
 let plan:any=null;
 try{
  if(await rpc('gk2_verify_cron_dispatch_signature',{p_timestamp:ts,p_signature:sig})!==true)return reply({ok:false,code:'unauthorized'},403);
  plan=await rpc('gk2_take_calendar_sync',{});
  if(!plan)return reply({ok:true,skipped:'all_products_leased'});
  const result=await syncCalendar(plan,{apiKey:Deno.env.get('GK2_QUICKBUTIK_API_KEY')||''});
  const recorded=await rpc('gk2_finish_calendar_sync',{p_product:plan.productId,p_token:plan.token,p_result:result});
  if(recorded!==true)throw Error('sync_lease_lost');
  return reply({ok:true,...result});
 }catch(error){
  const code=error instanceof Error?error.message:'calendar_sync_failed';
  if(plan)try{await rpc('gk2_finish_calendar_sync',{p_product:plan.productId,p_token:plan.token,p_result:{complete:false,code}})}catch{}
  return reply({ok:false,code},503);
 }
});
