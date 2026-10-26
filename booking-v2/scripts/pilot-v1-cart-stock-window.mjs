// Controlled V1 bookable-window pilot. Product 1474 remains hidden the
// ENTIRE test. Never let the test finish with sellable inventory.
const api="https://api.quickbutik.com/v1/products";
const key=process.env.GK2_QUICKBUTIK_API_KEY||"";
if(!key)throw Error("missing_api_key");
const pid=1474,id=282560,sku="2026-11-04-1000-1030",price=90;
const auth="Basic "+Buffer.from(key+":"+key).toString("base64");
async function call(method,data){
 const r=await fetch(api+(method==="GET"?"?product_id="+pid+"&include_details=true":""),{
  method,
  headers:{"Authorization":auth,"Accept":"application/json",
    ...(data?{"Content-Type":"application/json"}:{})},
  body:data?JSON.stringify(data):undefined,
  signal:AbortSignal.timeout(30000)
 });
 if(!r.ok)throw Error("qb_http_"+r.status);
 return await r.json();
}
async function read(expectedVisible,expectedStock){
 const raw=await call("GET");
 const p=raw?.product??raw;
 if(Number(p?.id)!==pid||!String(p?.title||"").startsWith("Booking 2.0")||
 Number(p?.price)!==price||[1,"1",true].includes(p?.visible))throw Error("unsafe_parent");
 const v=(p.variants||[]).filter(x=>x.id==id&&x.sku===sku);
 console.log("READBACK target="+sku+" expectedVisible="+expectedVisible+" expectedStock="+expectedStock+
   " matching="+v.length+" observedHidden="+String(v[0]?.hidden)+
   " observedQty="+String(v[0]?.qty??v[0]?.stock)+
   " observedPrice="+String(v[0]?.price));
 const visibilityMatches=v.length===1&&(expectedVisible?
   [null,undefined,false,0,"0"].includes(v[0].hidden):
   [true,1,"1"].includes(v[0].hidden));
 if(v.length!==1||Number(v[0].qty??v[0].stock)!==expectedStock
 ||Number(v[0].price)!==price||!visibilityMatches)
  throw Error("variant_readback_failed");
 return v[0];
}
const write=async(visible,stock)=>{
 const result=await call("PUT",[{product_id:pid,variant_id:id,visible,stock,disable_minusqty:"1"}]);
 if(result?.success===0||result?.error)throw Error("quickbutik_mutation_rejected");
};
await read(false,0);
if(process.env.GK2_TEST_OPEN_AND_RELOCK!=="true")throw Error("pilot_write_disabled");
let attemptedOpen=false;
try{
 attemptedOpen=true;
 await write(1,1);
 await read(true,1);
 console.log("PILOT: held slot can be made visible with exactly 1 stock on hidden parent");
}finally{
 if(attemptedOpen){
  // Even if the test fails, recover the only mutated hidden-parent variant.
  await write(0,0);
  await read(false,0);
  console.log("PILOT: slot relocked hidden with zero stock");
 }
}
