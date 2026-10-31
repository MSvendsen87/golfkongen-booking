import test from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {signDiagnosticRequest,verifyDiagnosticRequest} from "./diagnostic-auth.mjs";

const secret="not-a-real-booking-key-12345678909876543210";
const timestamp="1793095200",nowMs=Number(timestamp)*1000;
test("diagnostic HMAC matches Node crypto, has a separate scope from dispatch",async()=>{
 const expectedKey=createHmac("sha256",secret)
  .update("gk2-booking-provider-diagnostics-key-v1").digest();
 const expected=createHmac("sha256",expectedKey)
  .update("POST:/internal/diagnose:"+timestamp).digest("hex");
 const actual=await signDiagnosticRequest(secret,timestamp);
 assert.equal(actual,expected);
 assert.equal(await verifyDiagnosticRequest({
  apiKey:secret,timestamp,signature:actual,nowMs}),true);
 const dispatchKey=createHmac("sha256",secret)
  .update("gk2-booking-confirmed-notifications-key-v1").digest();
 const dispatchSig=createHmac("sha256",dispatchKey)
  .update("POST:/internal/dispatch:"+timestamp).digest("hex");
 assert.notEqual(dispatchSig,actual);
 assert.equal(await verifyDiagnosticRequest({
  apiKey:secret,timestamp,signature:dispatchSig,nowMs}),false);
});
test("diagnostic refuses expired, malformed and wrong-secret signatures",async()=>{
 const signature=await signDiagnosticRequest(secret,timestamp);
 for(const bad of [
  {apiKey:secret,timestamp,signature,nowMs:nowMs+120001},
  {apiKey:secret,timestamp,signature,nowMs:nowMs-120001},
  {apiKey:secret+"x",timestamp,signature,nowMs},
  {apiKey:secret,timestamp,signature:signature.slice(0,63),nowMs},
  {apiKey:secret,timestamp:"not-a-timestamp",signature,nowMs}
 ]){
  assert.equal(await verifyDiagnosticRequest(bad),false);
 }
});
