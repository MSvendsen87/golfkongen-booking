import test from "node:test";
import assert from "node:assert/strict";
import {classifyPushoverValidation,pushoverKeyFormat} from "./pushover-diagnostic.mjs";
test("Pushover validation handles documented valid response",()=>{
 const v=classifyPushoverValidation({httpStatus:200,body:{status:1,devices:["iphone"]}});
 assert.deepEqual(v,{ok:true,reason:"ok"});
});
test("Pushover errors are classified, never copied to owner UI",()=>{
 const cases=[
  ["user identifier is invalid","invalid_user_key"],
  ["application token is invalid","invalid_app_token"],
  ["user has no active devices","no_active_device"],
  ["Rate limited - too many requests","rate_limited"]
 ];
 for(const [message,reason] of cases){
  const v=classifyPushoverValidation({httpStatus:400,body:{status:0,errors:[message]}});
  assert.deepEqual(v,{ok:false,reason});
  assert.equal(JSON.stringify(v).includes(message),false);
 }
});
test("user and application keys must be 30 alphanumeric chars",()=>{
 assert.equal(pushoverKeyFormat("a".repeat(30),"B".repeat(30)),true);
 assert.equal(pushoverKeyFormat("a".repeat(29),"B".repeat(30)),false);
 assert.equal(pushoverKeyFormat("a".repeat(30),"B".repeat(30)+"\n"),false);
});
test("network and unrecognized failures do not suggest that a message was sent",()=>{
 for(const input of [
  {failedFetch:true},{httpStatus:503},{httpStatus:429},
  {httpStatus:401},{httpStatus:200,body:{status:0}}
 ]){
  const x=classifyPushoverValidation(input);
  assert.equal(x.ok,false);
  assert.equal(typeof x.reason,"string");
 }
});
