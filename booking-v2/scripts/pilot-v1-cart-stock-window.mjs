// Controlled V1 bookable-window pilot. Product 1474 remains hidden the
// ENTIRE test. Never let the test finish with sellable inventory.
const api="https://api.quickbutik.com/v1/products";
const key=process.env.GK2_QUICKBUTIK_API_KEY||"";
if(!key)throw Error("missing_api_key");
const pid=1474,id=282560,sku="2026-11-04-1000-1030",price=90;
const auth="Basic "+Buffer.from(key+":"+key).toString("base64");
async function verifyAnonymousStorefrontCart(){
 // Dedicated disposable session: never reuse the owner's or a customer's cart.
 const cookies=new Map();
 const request=async(path,options={})=>{
  const r=await fetch('https://golfkongen.no'+path,{
   ...options,redirect:'error',signal:AbortSignal.timeout(30000),
   headers:{...options.headers,...(cookies.size?{Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; ')}:{})}
  });
  for(const value of r.headers.getSetCookie()){
   const pair=value.split(';')[0],split=pair.indexOf('=');
   if(split>0)cookies.set(pair.slice(0,split),pair.slice(split+1));
  }
  if(!r.ok)throw Error('storefront_http_'+r.status);
  return r;
 };
 await (await request('/cart/index')).text();
 const response=await request('/cart/add',{method:'POST',headers:{
  'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8',
  'X-Requested-With':'XMLHttpRequest'
 },body:new URLSearchParams({product_id:String(pid),variant:String(id),qty:'1',quantity:'1',page:'product'})});
 const cart=await response.json();
 const lines=Array.isArray(cart.items)?cart.items:[];
 const matching=lines.filter(x=>String(x?.item?.sku||'')===sku);
 const line=matching[0];
 console.log('CART_EVIDENCE '+JSON.stringify({success:cart.success,matching:matching.length,
  sku:line?.item?.sku,rawId:line?.item?.raw_id,qty:line?.qty,isVariant:line?.is_variant,
  unitPrice:line?.item?.price_raw,totalQty:cart.total_qty}));
 if(cart.success!==1||matching.length!==1||Number(line.qty)!==1||
  Number(line.is_variant)!==1||![pid,id].includes(Number(line.item.raw_id))||
  Number(line.item.price_raw)!==price||Number(cart.total_qty)!==1)
  throw Error('storefront_cart_did_not_confirm_exact_variant');
 console.log('PILOT: exact hidden-parent booking SKU verified in isolated anonymous storefront cart; NO checkout or payment');
}
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
 await verifyAnonymousStorefrontCart();
}finally{
 if(attemptedOpen){
  // Even if the test fails, recover the only mutated hidden-parent variant.
  await write(0,0);
  await read(false,0);
  console.log("PILOT: slot relocked hidden with zero stock");
 }
}
