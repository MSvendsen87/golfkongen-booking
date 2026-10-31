// Only adds this named, path-scoped loader. Never edits existing shop scripts.
const key=process.env.GK2_QUICKBUTIK_API_KEY;
if(!key)throw Error('Missing Quickbutik key');
const name='GolfKongen Booking 2.0 – aktivitetskalender';
const content=`(function(){if(location.pathname.replace(/\\/$/,"")!=="/aktiviteter")return;function mount(){if(document.querySelector("script[data-gk2-native-loader]"))return;var s=document.createElement("script");s.src="https://msvendsen87.github.io/golfkongen-booking/booking/embed.js?v=20261027-2";s.dataset.gk2NativeLoader="1";s.defer=true;document.body.appendChild(s);}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount,{once:true});else mount();})();`;
async function call(method,payload){
 const r=await fetch('https://api.quickbutik.com/v1/scripts',{
  method,headers:{Authorization:'Basic '+Buffer.from(key+':'+key).toString('base64'),Accept:'application/json',...(payload?{'Content-Type':'application/json'}:{})},
  ...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(30000)
 });
 if(!r.ok)throw Error('Script API HTTP '+r.status);
 return r.json();
}
const list=await call('GET');
if(!Array.isArray(list))throw Error('Unexpected script list; no write');
const existing=list.filter(s=>s.name===name);
if(existing.length>1)throw Error('Duplicate loader names; no write');
if(!existing.length)await call('POST',{name,content,placement:'body_end',is_active:1});
const after=await call('GET');
const found=Array.isArray(after)?after.filter(s=>s.name===name):[];
if(found.length!==1||found[0].value!==content||Number(found[0].is_active)!==1||found[0].placement!=='body_end')
 throw Error('Loader readback mismatch; do not claim installed');
console.log(JSON.stringify({installed:true,id:found[0].id,scope:'/aktiviteter',checkoutActivated:false}));
