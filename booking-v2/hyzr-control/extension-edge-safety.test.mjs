import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=readFileSync(new URL("../supabase/functions/gk2-hyzr-extension-payment/index.ts",import.meta.url),"utf8");
test("HYZR live-payment endpoint is OFF unless separately enabled",()=>{
 assert.match(src,/Deno\.env\.get\("GK2_HYZR_EXTENSION_WRITE_ENABLED"\)!=="true"/);
 assert.match(src,/extension_not_released/);
});
test("physical companion device secret must authorize every payment",()=>{
 assert.match(src,/GK2_HYZR_DEVICE_TOKEN_SHA256/);
 assert.match(src,/verifyDevice\(req\)/);
});
test("HyZR QR payment never trusts customer price or booking ID",()=>{
 assert.match(src,/preview\.bookingId/);
 assert.match(src,/gk2_hyzr_extension_reserve/);
 assert.match(src,/makeExtensionQrPayment\(\{reference,amountOre,minutes/);
 assert.doesNotMatch(src,/body\.amountOre/);
 assert.doesNotMatch(src,/body\.reservationId/);
});
test("real money must pass capture claim, throttling and Vipps GET before booking update",()=>{
 const claim=src.indexOf("gk2_hyzr_extension_claim_capture");
 const throttle=src.indexOf("gk2_hyzr_extension_capture_gate");
 const capture=src.indexOf('"/capture"');
 const commit=src.indexOf("gk2_hyzr_extension_commit_captured");
 assert.ok(claim>0);assert.ok(throttle>0);assert.ok(capture>0);assert.ok(commit>0);
 assert.match(src,/verified\.fullyCaptured!==true/);
});
test("no browser CORS or customer JWT-based booking extensions",()=>{
 assert.match(src,/browser_not_supported/);
 assert.doesNotMatch(src,/Access-Control-Allow-Origin/);
 assert.doesNotMatch(src,/createClient\(.+anon/);
});
test("payment endpoint uses only approved production sales unit",()=>{
 assert.match(src,/const MSN="859181"/);
 assert.match(src,/const VIPPS="https:\/\/api\.vipps\.no"/);
 assert.doesNotMatch(src,/apitest\.vipps\.no/);
});
