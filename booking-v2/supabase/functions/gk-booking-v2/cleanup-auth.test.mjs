import test from "node:test";
import assert from "node:assert/strict";
import {signCleanupRequest,verifyCleanupRequest} from "./cleanup-auth.mjs";
import {createHmac} from "node:crypto";
const key="testing-only-not-a-real-quickbutik-key-12345";
const ts="1793055600";const ms=Number(ts)*1000;
test("server verifies only correctly derived HMAC",async()=>{
 const signature=await signCleanupRequest(key,ts);
 assert.equal(signature.length,64);
 assert.equal(await verifyCleanupRequest({apiKey:key,timestamp:ts,signature,nowMs:ms}),true);
 assert.equal(await verifyCleanupRequest({apiKey:key+"x",timestamp:ts,signature,nowMs:ms}),false);
});
test("Github Node crypto and Edge WebCrypto signatures are byte-exact",async()=>{
 const derived=createHmac("sha256",key).update("gk2-booking-cart-cleanup-key-v1").digest();
 const actual=createHmac("sha256",derived).update("POST:/internal/relock-expired:"+ts).digest("hex");
 assert.equal(actual,await signCleanupRequest(key,ts));
});
test("expired or future request signatures cannot authorize maintenance",async()=>{
 const signature=await signCleanupRequest(key,ts);
 assert.equal(await verifyCleanupRequest({apiKey:key,timestamp:ts,signature,nowMs:ms+120001}),false);
 assert.equal(await verifyCleanupRequest({apiKey:key,timestamp:ts,signature,nowMs:ms-120001}),false);
 assert.equal(await verifyCleanupRequest({apiKey:key,timestamp:"0",signature,nowMs:ms}),false);
 assert.equal(await verifyCleanupRequest({apiKey:key,timestamp:ts,signature:signature.toUpperCase(),nowMs:ms}),false);
 assert.equal(await verifyCleanupRequest({apiKey:key,timestamp:ts,signature:signature.replace(/.$/,"0"),nowMs:ms}),false);
});
