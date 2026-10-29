import test from 'node:test';import assert from 'node:assert/strict';import {eligibleMember,clubOrderLines,clubVariant} from '../supabase/functions/gk-booking-v2/club-engine.mjs';
const sku='GK2-CLUB-2026-11-05-0123456789abcdef0123456789abcdef';
test('membership requires exact unique active email and dartklubb; employee alone has no access',()=>{
 assert(eligibleMember([{email:'member@example.com',active:true,groups:['dartklubb']}],'member@example.com'));
 for(const m of [[{email:'member@example.com',active:true,groups:['ansatte']}],[{email:'member@example.com',active:false,groups:['dartklubb']}],[{name:'Member',email:'other@example.com',active:true,groups:['dartklubb']}]])assert(!eligibleMember(m,'member@example.com'));
 assert(!eligibleMember([{email:'member@example.com',active:true,groups:['dartklubb']},{email:'member@example.com',active:true,groups:['dartklubb']}],'member@example.com'));
});
test('club checkout accepts one seat and optional one rental, rejects mixed goods',()=>{
 const club={product_id:'1507',sku,qty:'1'},set={product_id:'1318',qty:'1'};
 assert.equal(clubOrderLines({products:[club]}).expectedOre,5000);
 assert.equal(clubOrderLines({products:[club,set]}).expectedOre,7500);
 for(const products of [[{...club,qty:2}],[club,{...set,qty:2}],[club,{product_id:42,qty:1}],[{...club,sku:'GK2-CLUB-2026-11-05'}]])assert.throws(()=>clubOrderLines({products}));
});
function fake(){
 let v=null;const writes=[];
 const fetchImpl=async(url,options)=>{
  if(options.method==='GET')return {ok:true,json:async()=>({id:1507,sku:'GK2-CLUB-2026',variants:v?[{...v}]:[]})};
  const payload=JSON.parse(options.body);writes.push(payload);
  if(payload[0].variants){const a=payload[0].variants.add[0];v={id:1234,sku:a.sku,price:a.price,qty:a.qty,hidden:false};}
  else{const a=payload[0];v.qty=a.stock;v.hidden=a.visible===0;}
  return {ok:true,json:async()=>({success:1})};
 };
 return {fetchImpl,writes,variant:()=>v};
}
test('unique cart variant created at zero, opened at one, then relocked without changing price',async()=>{
 const x=fake();const opened=await clubVariant(sku,{apiKey:'test',fetchImpl:x.fetchImpl});assert.equal(opened.id,1234);assert.equal(x.variant().qty,1);
 const writeCount=x.writes.length;await clubVariant(sku,{apiKey:'test',fetchImpl:x.fetchImpl});assert.equal(x.writes.length,writeCount);
 await clubVariant(sku,{action:'close',apiKey:'test',fetchImpl:x.fetchImpl});assert.equal(x.variant().qty,0);assert.equal(x.variant().hidden,true);assert.equal(x.variant().price,50);
});
test('missing unopened variant can be closed without creating anything',async()=>{
 const x=fake();const r=await clubVariant(sku,{action:'close',apiKey:'test',fetchImpl:x.fetchImpl});assert.equal(r.absent,true);assert.equal(x.writes.length,0);
});
test('ambiguous product or wrong price fails closed',async()=>{
 await assert.rejects(()=>clubVariant(sku,{apiKey:'test',fetchImpl:async()=>({ok:true,json:async()=>({id:1507,sku:'GK2-CLUB',variants:[{id:1,sku,price:49,qty:0,hidden:true}]})})}));
});

test('one Nuki code is shared, read back before email, and retained until last cancellation',async()=>{
 const {setupClubEngine}=await import('../supabase/functions/gk-booking-v2/club-engine.mjs');
 const originalFetch=globalThis.fetch,originalDeno=globalThis.Deno;
 globalThis.Deno={env:{get:k=>k==='GK2_CODE_KEY_BASE64'?Buffer.alloc(32,7).toString('base64'):'test-only'}};
 let access=null,active=2,auths=[],creates=0,deletes=0;const mails=[],sent=new Set(),day='2026-11-05';
 const rpc=async(name,p={})=>{
  if(name==='gk2_club_worker')return true;
  if(name==='gk2_club_maintenance')return {leases:[],dates:[day]};
  if(name==='gk2_club_access_get'){
   if(!access)access={ciphertext:p.p_ciphertext,name:'GK2C-20261105-1',generation:1,status:'prepared'};
   return {access:{...access},active,recipients:['one','two'].filter(id=>!sent.has(id)).map(id=>({id,email:id+'@example.invalid',orderId:'1234'}))};
  }
  if(name==='gk2_club_access_update'){access.status=p.p_status;return true;}
  if(name==='gk2_club_access_emailed'){sent.add(p.p_hold);return true;}
  throw Error(name);
 };
 globalThis.fetch=async(url,options={})=>{
  if(url.includes('api.nuki.io')){
   if(options.method==='GET')return {ok:true,status:200,text:async()=>JSON.stringify(auths)};
   if(options.method==='PUT'){creates++;auths=[{...JSON.parse(options.body),id:'shared1',enabled:true}];return {ok:true,status:204};}
   if(options.method==='DELETE'){deletes++;auths=[];return {ok:true,status:204};}
  }
  if(url==='https://api.resend.com/emails'){mails.push(JSON.parse(options.body));return {ok:true,json:async()=>({id:'mail-'+mails.length})};}
  throw Error('unexpected network');
 };
 try{
  const engine=setupClubEngine({rpc});
  await engine.process();assert.equal(creates,1);assert.equal(mails.length,0);
  await engine.process();assert.equal(mails.length,2);assert.equal(creates,1);
  const codes=mails.map(x=>x.text.match(/denne kvelden: ([1-9]{6})/)[1]);assert.equal(codes[0],codes[1]);
  assert.equal(auths[0].allowedFromDate,'2026-11-05T17:45:00.000Z');assert.equal(auths[0].allowedUntilDate,'2026-11-05T21:15:00.000Z');
  active=1;await engine.process();assert.equal(deletes,0);
  active=0;await engine.process();assert.equal(deletes,1);await engine.process();assert.equal(access.status,'revoked');
 }finally{globalThis.fetch=originalFetch;globalThis.Deno=originalDeno;}
});
