import test from "node:test";
import assert from "node:assert/strict";
import {resolveGolfkongenDeliveryGroup,GROUP_NAME} from "./pushover-group.mjs";
const token="A".repeat(30),group="G".repeat(30);
const fetchMock=({groups=[{name:"Golfkongen",group}],validate=true}={})=>{
 const calls=[];
 const fn=async(url,req)=>{
  calls.push({url,method:req.method,body:req.body?.toString()});
  if(url.includes("/groups.json"))return {ok:true,status:200,json:async()=>({status:1,groups})};
  if(url.includes("/users/validate.json"))return {ok:validate,status:validate?200:400,json:async()=>({status:validate?1:0})};
  throw Error("Unexpected endpoint");
 };
 return {fn,calls};
};
test("find existing named delivery group and validate without sending messages",async()=>{
 const a=fetchMock();const v=await resolveGolfkongenDeliveryGroup(token,{fetchImpl:a.fn});
 assert.deepEqual(v,{ok:true,reason:"group_valid",key:group});
 assert.equal(GROUP_NAME,"Golfkongen");
 assert.equal(a.calls.length,2);
 assert.equal(a.calls[0].method,"GET");
 assert.equal(a.calls[1].method,"POST");
 assert.match(a.calls[1].body,/user=G{30}/);
 assert.ok(a.calls.every(c=>!c.url.includes("/messages")));
});
test("reject missing and ambiguous group; never fall back to owner User Key",async()=>{
 for(const groups of [[],[{name:"Other",group}], [{name:"Golfkongen",group},{name:"golfkongen",group:"B".repeat(30)}]]){
  const a=fetchMock({groups});const v=await resolveGolfkongenDeliveryGroup(token,{fetchImpl:a.fn});
  assert.equal(v.ok,false);assert.equal(a.calls.length,1);
 }
});
test("reject group with no active user devices",async()=>{
 const a=fetchMock({validate:false});const v=await resolveGolfkongenDeliveryGroup(token,{fetchImpl:a.fn});
 assert.equal(v.ok,false);assert.equal(v.reason,"group_no_active_members");
});
test("invalid token cannot invoke API",async()=>{
 const a=fetchMock();
 const v=await resolveGolfkongenDeliveryGroup("not-a-token",{fetchImpl:a.fn});
 assert.equal(v.ok,false);assert.equal(a.calls.length,0);
});
