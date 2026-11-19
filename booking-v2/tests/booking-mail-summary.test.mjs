import test from 'node:test';import assert from 'node:assert/strict';
import {accessMail} from '../supabase/functions/gk-booking-v2/notify-core.mjs';
test('club email shows paid price, readable date and shared access window without checkout SKU',()=>{
 const mail=accessMail({email:'test@example.com',title:'Klubbkveld – Lyngdal Dartklubb',day:'2026-11-05',from:'19:00',to:'22:00',orderId:'3736',rentalSets:0,paidOre:5000,sharedCode:true},'582964');
 for(const body of [mail.text,mail.html]){assert.match(body,/5\. november 2026/);assert.match(body,/19:00–22:00/);assert.match(body,/18:45–22:15/);assert.match(body,/50,00/);assert.doesNotMatch(body,/GK2-CLUB|10 minutter/);}
 assert.match(mail.html,/FELLES DØRKODE/);
});
test('ordinary booking retains personal code and shows actual discounted payment',()=>{
 const mail=accessMail({email:'test@example.com',title:'HYZR simulator',day:'2026-11-05',from:'19:00',to:'20:00',orderId:'3736',rentalSets:0,paidOre:300},'582964');
 assert.match(mail.html,/PERSONLIGE DØRKODE/);assert.match(mail.text,/3,00/);assert.match(mail.text,/10 minutter/);
});
