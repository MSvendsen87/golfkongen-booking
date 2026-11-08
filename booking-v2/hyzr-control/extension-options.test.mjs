import test from "node:test";
import assert from "node:assert/strict";
import {collectExtensionOptions as opts} from "../supabase/functions/gk2-hyzr-device-status/extension-options.mjs";
const state={status:"active",payment_confirmed:true,resource:"hyzr",
 reservation_id:"r1",screen_phase:"warning",staff_mode:false};
const q={ok:true,available:true,held:false,paymentReady:false,type:"paid",
 pricingRule:"original_actual_paid_per_minute",bookingId:"r1",minutes:30,
 extensionPriceOre:7500,originalPaidOre:30000,originalMinutes:120,punchcardMinutesToDebit:0,
 from:"2026-11-11T15:30:00Z",until:"2026-11-11T16:00:00Z"};
test("show effective rate preserved: 300 NOK per 2h -> 75 NOK for 30min",()=>{
 const x=opts(state,[q]);assert.equal(x.length,1);
 assert.equal(x[0].priceOre,7500);assert.equal(x[0].label,"30 min – 75,00 kr");
 assert.equal(x[0].paymentReady,false);
});
test("no options without a verified paid session",()=>assert.deepEqual(opts({...state,payment_confirmed:false},[q]),[]));
test("no options for venue/ staff",()=>{
 assert.deepEqual(opts({...state,resource:"venue"},[q]),[]);
 assert.deepEqual(opts({...state,staff_mode:true},[q]),[]);
});
test("cannot quote from a different session",()=>assert.deepEqual(opts(state,[{...q,bookingId:"r2"}]),[]));
test("no client payment without hold",()=>assert.deepEqual(opts(state,[{...q,held:true}]),[]));
test("quote flagged as payment-ready is not accepted",()=>assert.deepEqual(opts(state,[{...q,paymentReady:true}]),[]));
test("do not present punchcard quote as free Vipps payment",()=>assert.deepEqual(opts(state,[{...q,extensionPriceOre:0,type:"punchcard",punchcardMinutesToDebit:30}]),[]));
test("price below minimum is not present",()=>assert.deepEqual(opts(state,[{...q,extensionPriceOre:99}]),[]));
test("duplicate quote only once",()=>assert.equal(opts(state,[q,q]).length,1));
test("unavailable quote not shown",()=>assert.deepEqual(opts(state,[{...q,available:false}]),[]));
test("grace phase may still quote if time is available",()=>assert.equal(opts({...state,screen_phase:"grace"},[q]).length,1));
test("locked status cannot quote",()=>assert.deepEqual(opts({...state,status:"locked"},[q]),[]));
