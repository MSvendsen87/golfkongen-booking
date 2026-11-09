import test from "node:test";
import assert from "node:assert/strict";
import {TEST_MSN,validateTestVippsCredentials as v,isValidVippsTokenResponse as token} from "../supabase/functions/gk2-vipps-test-connection/vipps-test-core.mjs";
const valid={msn:TEST_MSN,clientId:"f5f63d1b-47d9-49b6-9c56-0ee4d6e1facb",clientSecret:"b".repeat(44),subscriptionKey:"a".repeat(32)};
test("only selected TEST sales unit is accepted",()=>{
 assert.equal(v(valid).ok,true);
 assert.equal(v({...valid,msn:"321608"}).ok,false);
 assert.equal(v({...valid,msn:"859181"}).ok,false);
});
test("missing test secrets cannot authorize",()=>{
 assert.equal(v({...valid,clientId:""}).ok,false);
 assert.equal(v({...valid,clientSecret:""}).ok,false);
 assert.equal(v({...valid,subscriptionKey:""}).ok,false);
});
test("invalid subscription key cannot authorize",()=>assert.equal(v({...valid,subscriptionKey:"!bad"}).ok,false));
test("an empty or error token is not considered connected",()=>{
 assert.equal(Boolean(token(null)),false);
 assert.equal(Boolean(token({error:"Unauthorized"})),false);
 assert.equal(Boolean(token({access_token:"short",token_type:"Bearer"})),false);
});
test("only plausible Vipps Bearer token passes",()=>assert.equal(Boolean(token({access_token:"a".repeat(150),token_type:"Bearer"})),true));
