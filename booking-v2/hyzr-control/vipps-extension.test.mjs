import test from "node:test";
import assert from "node:assert/strict";
import {buildVippsBookingPayment as request} from "./vipps-extension.mjs";
const base={reference:"GK2-EXT-00001",amountOre:5000,extraMinutes:30};
test("builds one-time Vipps QR request for extra time",()=>{
 const body=request(base);
 assert.equal(body.amount.value,5000);
 assert.equal(body.paymentMethod.type,"WALLET");
 assert.equal(body.userFlow,"QR");
 assert.equal(body.qrFormat.format,"IMAGE/SVG+XML");
 assert.equal(body.customerInteraction,"CUSTOMER_PRESENT");
 assert.match(body.paymentDescription,/forlengelse 30 min/);
 assert.equal("returnUrl" in body,false);
});
test("supports mobile redirect for direct Vipps booking",()=>{
 const b=request({...base,kind:"booking",channel:"WEB_REDIRECT",
 returnUrl:"https://golfkongen.no/sider/booking-betaling"});
 assert.equal(b.userFlow,"WEB_REDIRECT");
 assert.equal("qrFormat" in b,false);
});
test("rejects less than Vipps NOK 1 minimum",()=>assert.throws(()=>request({...base,amountOre:99}),/amount_not_supported/));
test("rejects free punchcard",()=>assert.throws(()=>request({...base,amountOre:0}),/amount_not_supported/));
test("rejects invalid amount",()=>assert.throws(()=>request({...base,amountOre:2.5}),/amount_not_supported/));
test("rejects broken references",()=>assert.throws(()=>request({...base,reference:"bad"}),/invalid_reference/));
test("rejects unsafe return URL",()=>assert.throws(()=>request({...base,channel:"WEB_REDIRECT",returnUrl:"https://example.org"}),/invalid_return_url/));
test("requires redirect return URL",()=>assert.throws(()=>request({...base,channel:"WEB_REDIRECT"}),/return_url_required/));
test("rejects unsupported duration",()=>assert.throws(()=>request({...base,extraMinutes:45}),/invalid_booking_duration/));
test("never includes API credentials in request body",()=>{
 const b=request(base);
 assert.equal(JSON.stringify(b).includes("subscriptionKey"),false);
 assert.equal(JSON.stringify(b).includes("accessToken"),false);
});
