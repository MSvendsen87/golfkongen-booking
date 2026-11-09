import test from 'node:test';import assert from 'node:assert/strict';
import {setupClubEngine} from '../supabase/functions/gk-booking-v2/club-engine.mjs';
test('club push is claimed before sending and ambiguous failure is not blindly resent',async()=>{
 const oldFetch=globalThis.fetch,oldDeno=globalThis.Deno;
 globalThis.Deno={env:{get:()=> 'a'.repeat(30)}};
 let state='pending',sends=0;
 const rpc=async(name,p)=>{
  if(name==='gk2_club_worker')return true;
  if(name==='gk2_club_push_claim'){if(state!=='pending')return null;state='sending';return {id:'one',orderId:'1234',date:'2026-11-05',email:'test@example.com',priceOre:5000,rentalSets:0};}
  if(name==='gk2_club_push_finish'){state=p.p_receipt?'sent':'unknown';return;}
  if(name==='gk2_club_maintenance')return {leases:[],dates:[]};
  throw Error(name);
 };
 globalThis.fetch=async(url)=>{
  if(url.includes('/groups.json'))return {ok:true,json:async()=>({status:1,groups:[{name:'Golfkongen',group:'b'.repeat(30)}]})};
  if(url.includes('/users/validate.json'))return {ok:true,json:async()=>({status:1,devices:['phone']})};
  if(url.includes('/messages.json')){assert.equal(state,'sending');sends++;throw Error('connection lost after request');}
  throw Error('unexpected request');
 };
 try{const engine=setupClubEngine({rpc});const first=await engine.process();assert.equal(first.pushes.failed,1);assert.equal(state,'unknown');await engine.process();assert.equal(sends,1);}
 finally{globalThis.fetch=oldFetch;globalThis.Deno=oldDeno;}
});
