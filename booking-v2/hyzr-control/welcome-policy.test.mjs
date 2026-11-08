import test from "node:test";
import assert from "node:assert/strict";
import {deriveWelcome, noteWelcomeShown} from "./welcome-policy.mjs";
const state=(id="b1",status="active",phase="active",paid=true)=>({
 reservation_id:id,status,screen_phase:phase,payment_confirmed:paid
});
test("welcome first time a paid session starts",()=>{
 const w=deriveWelcome(state());
 assert.equal(w.show,true);assert.equal(w.autoCloseMs,8000);
});
test("no welcome when no paid booking",()=>assert.equal(deriveWelcome(state("b1","active","active",false)).show,false));
test("no welcome for a locked machine",()=>assert.equal(deriveWelcome(state("b1","locked")).show,false));
test("no welcome in the four-minute warning",()=>assert.equal(deriveWelcome(state("b1","active","warning")).show,false));
test("no welcome during grace period",()=>assert.equal(deriveWelcome(state("b1","active","grace")).show,false));
test("welcome once per booking ID",()=>{
 let shown=noteWelcomeShown([],deriveWelcome(state()).reservation_id);
 assert.equal(deriveWelcome(state(),shown).show,false);
 assert.equal(deriveWelcome(state("b2"),shown).show,true);
});
test("staff with paid booking receives welcome only once",()=>{
 assert.equal(deriveWelcome(state("staff1","active","staff")).show,true);
 assert.equal(deriveWelcome(state("staff1","active","staff"),["staff1"]).show,false);
});
test("welcome has no QR and no customer personal data",()=>{
 const w=deriveWelcome(state());
 assert.equal(w.hasPaymentQr,false);
 assert.equal("email" in w,false);
 assert.equal("customerName" in w,false);
});
test("seen booking set stays deduplicated",()=>{
 assert.deepEqual(noteWelcomeShown(["a"],"a"),["a"]);
});
