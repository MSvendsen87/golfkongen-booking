import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../docs/booking/clubgate-v2.js',import.meta.url),'utf8');
const start=source.indexOf(' $("gk-club-verify").onsubmit='),end=source.indexOf(' $("gk-club-logout")',start);
assert(start>=0&&end>start);
async function verify(fails=false){
 const form={},states=[];const context={form,states,fails};vm.createContext(context);
 vm.runInContext(`let busy=false,who=null;const verifiedEmail='test@example.invalid';
 const $=id=>id==='gk-club-verify'?form:{value:'123456'};
 const auth={auth:{verifyOtp:async()=>({error:fails?Error('invalid'):null})}};
 const render=()=>states.push({disabled:!who||busy});
 const check=async()=>{who={email:verifiedEmail};render()};
 const refresh=async()=>render();const message=()=>{};
 `+source.slice(start,end)+`globalThis.run=()=>form.onsubmit({preventDefault(){}});globalThis.state=()=>({busy,who});`,context);
 await context.run();return {states,state:context.state()};
}
test('successful OTP verification redraws signup buttons after clearing busy state',async()=>{
 const result=await verify();assert.equal(result.state.busy,false);assert.equal(result.states.at(-1).disabled,false);
});
test('failed verification keeps signup disabled',async()=>{
 const result=await verify(true);assert.equal(result.state.busy,false);assert.equal(result.states.at(-1).disabled,true);
});
