// Booking2 Quickbutik V1 adapter, cloned from the legacy booking pattern.
// Internal server only. Caller MUST have an atomic, active, single-slot DB hold
// and server-mapped product ID BEFORE calling open. All numbers come from DB.
// No browser price / product / variant IDs may be trusted.
const num=v=>Number.isSafeInteger(Number(v))?Number(v):null;
const active=v=>[null,undefined,false,0,"0"].includes(v);
const hidden=v=>[true,1,"1"].includes(v);
export function stateFromV1(raw,sku){
 if(!raw||!Array.isArray(raw.variants)||!/^(20\d{2}-\d{2}-\d{2})-\d{4}-\d{4}$/.test(sku))throw Error("invalid_product_or_sku");
 const found=raw.variants.filter(v=>String(v?.sku||"")===sku);
 if(found.length!==1)throw Error("ambiguous_or_missing_variant");
 const v=found[0];
 if(!num(v.id)||num(v.id)<=0)return {valid:false,reason:"missing_variant_id"};
 const stock=num(v.qty??v.stock);
 return {valid:true,id:num(v.id),sku:String(v.sku),price:Number(v.price),
   stock,visible:active(v.hidden),hidden:hidden(v.hidden)};
}
export async function mutateHeldCartVariant({
 productId,sku,action,apiKey,fetchImpl=fetch
}={}){
 if(!num(productId)||num(productId)<1474||num(productId)>1506
 ||!["open","close"].includes(action)
 ||typeof apiKey!=="string"||apiKey.length<10)
  throw Error("invalid_checkout_variant_request");
 const base="https://api.quickbutik.com/v1/products";
 const headers={"Authorization":"Basic "+btoa(apiKey+":"+apiKey),"Accept":"application/json"};
 const request=async(method,payload)=>{
  const url=base+(method==="GET"?"?product_id="+productId+"&include_details=true":"");
  const response=await fetchImpl(url,{method,headers:{
    ...headers,...(payload?{"Content-Type":"application/json"}:{})
  },body:payload?JSON.stringify(payload):undefined});
  if(!response.ok)throw Error("quickbutik_variant_api_unavailable");
  return await response.json();
 };
 const get=async()=>{
  const raw=await request("GET");
  const p=raw?.product??raw;
  if(!p||num(p.id)!==num(productId)||!String(p.title||"").startsWith("Booking 2.0"))
    throw Error("not_authorized_booking_product");
  const v=stateFromV1(p,sku);
  if(!v.valid||!Number.isFinite(v.price)||v.price<=0||v.stock===null)
    throw Error("invalid_booking_variant");
  return {p,v};
 };
 const before=await get();
 if(action==="open"){
  if(before.v.visible&&before.v.stock===1)return {variantId:before.v.id,sku,alreadyOpen:true};
  if(!before.v.hidden||before.v.stock!==0)throw Error("variant_not_safely_staged");
 }else{
  if(before.v.hidden&&before.v.stock===0)return {variantId:before.v.id,sku,alreadyClosed:true};
 }
 // Exactly one old-style V1 update against a verified SKU/variant ID.
 // A timed out/ambiguous PUT is NEVER blindly retried.
 const opening=action==="open";
 const result=await request("PUT",[{
  product_id:productId,variant_id:before.v.id,
  visible:opening?1:0,stock:opening?1:0,disable_minusqty:"1"
 }]);
 if(result?.success===0||result?.error)throw Error("quickbutik_variant_write_rejected");
 const after=await get();
 if(after.v.id!==before.v.id||after.v.price!==before.v.price||
    after.v.stock!==(opening?1:0)||
    !(opening?after.v.visible:after.v.hidden))
  throw Error("variant_write_readback_mismatch");
 return {variantId:after.v.id,sku,opened:opening,closed:!opening};
}
