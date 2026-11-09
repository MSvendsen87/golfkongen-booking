import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {createHash,createHmac} from 'node:crypto';
function setup(){
 const data=[['Navn','Email','Gruppe','Aktiv','Behold'],['Test Kunde','test@example.com','ansatte,dartklubb','ja','ekstra'],['Inaktiv','inactive@example.com','dartklubb','nei','urørt']];
 const props={GK2_MEMBER_SHEET_SECRET:'test-key-only-abcdefghijklmnopqrstuvwxyz0123456789'};
 const sheet={getDataRange:()=>({getValues:()=>structuredClone(data)}),getLastRow:()=>data.length,getRange:(r,c)=>({setValue:v=>{data[r-1]??=Array(5).fill('');data[r-1][c-1]=v.startsWith("'")?v.slice(1):v;}})};
 const output=()=>({setMimeType(){return this},text:''});
 const signedBytes=b=>Array.from(b,x=>x>127?x-256:x);
 const ctx={Utilities:{DigestAlgorithm:{SHA_256:0},Charset:{UTF_8:0},computeDigest:(_,s)=>signedBytes(createHash('sha256').update(s).digest()),computeHmacSha256Signature:(s,k)=>signedBytes(createHmac('sha256',k).update(s).digest()),getUuid:()=> 'new-uuid'},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v})},SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet}),flush(){}},ContentService:{MimeType:{JSON:0,JAVASCRIPT:1},createTextOutput:text=>({...output(),text})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},Date};
 vm.createContext(ctx);vm.runInContext(readFileSync(new URL('../scripts/member-sheet-admin.gs',import.meta.url),'utf8'),ctx);
 function post(payload,secret=props.GK2_MEMBER_SHEET_SECRET,time=String(Math.floor(Date.now()/1000))){
 const raw=JSON.stringify(payload),signature=createHmac('sha256',secret).update(time+'.'+raw).digest('hex');
 return JSON.parse(ctx.doPost({postData:{contents:JSON.stringify({payload:raw,timestamp:time,signature})}}).text);}
 return {ctx,data,post};
}
test('legacy GET returns only active users, private list includes inactive',()=>{
 const x=setup();const data=JSON.parse(x.ctx.doGet({}).text);assert.equal(data.length,1);assert.deepEqual(Object.keys(data[0]),['name','email','groups','active']);
 assert.equal(x.post({action:'list'}).members.length,2);
});
test('bad and expired signatures cannot read or write',()=>{
 const x=setup();assert.equal(x.post({action:'list'},'bad').code,'forbidden');assert.equal(x.post({action:'list'},undefined,'1000000000').code,'forbidden');
});
test('save readback, stale version rejection, unrelated column preserved and inactive hidden',()=>{
 const x=setup(),old=x.post({action:'list'}).members[0];
 const change={action:'save',...old,name:'Oppdatert',groups:['dartklubb'],active:false};
 assert.equal(x.post(change).ok,true);assert.equal(x.data[1][4],'ekstra');
 assert.equal(x.post(change).code,'source_changed');assert.equal(JSON.parse(x.ctx.doGet({}).text).length,0);
});
test('new member, validation, and formula-like name remains literal',()=>{
 const x=setup();assert.equal(x.post({action:'save',email:'new@example.com',name:'=1+1',groups:['dartklubb'],active:true,version:''}).ok,true);
 assert.equal(x.post({action:'save',email:'new2@example.com',name:'Test',groups:['unknown'],active:true,version:''}).code,'invalid_member');
 assert.equal(x.data.length,4);
});
