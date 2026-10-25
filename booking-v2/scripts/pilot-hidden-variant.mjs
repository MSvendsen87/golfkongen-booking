// ONE-TIME CONTROLLED PILOT. Exact hidden Dart A 30-minute product/slot.
// Never makes a product/variant sellable. No automatic retries of PUT.
const KEY=process.env.GK2_QUICKBUTIK_API_KEY;
const TARGET_PRODUCT=1475;
const TARGET_SKU="2026-11-01-1100-1130";
if(!KEY)throw Error("Missing GK2_QUICKBUTIK_API_KEY");
const api="https://api.quickbutik.com/v1/products";
const headers={Authorization:"Basic "+Buffer.from(KEY+":"+KEY).toString("base64"),Accept:"application/json"};
async function request(method,body){
 const r=await fetch(api+(method==="GET"?"?product_id="+TARGET_PRODUCT+"&include_details=true":""),{
  method,headers:{...headers,...(body?{"Content-Type":"application/json"}:{})},
  body:body?JSON.stringify(body):undefined,
  signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error("Quickbutik "+method+" HTTP "+r.status);
 const txt=await r.text();
 return txt?JSON.parse(txt):{};
}
const get=async()=>{
 const response=await request("GET");
 const p=response?.product??response;
 const validIdentity=!!p&&Number(p.id)===TARGET_PRODUCT;
 const validTitle=String(p?.title||"").startsWith("Booking 2.0");
 const validVisibility=["0","false"].includes(String(p?.visible).toLowerCase());
 const validPrice=Number(p?.price)===80;
 if(!validIdentity||!validTitle||!validVisibility||!validPrice){
  console.log("Read-only pilot diagnostics: productId="+String(p?.id||"absent").slice(0,16)+
   " titlePrefix="+String(p?.title||"absent").slice(0,30)+
   " visible="+String(p?.visible)+" price="+String(p?.price)+
   " checks="+[validIdentity,validTitle,validVisibility,validPrice].join(","));
  throw Error("Pilot product identity, visibility, or price safety check failed");
 }
 return p;
};
function check(p){
 const variants=Array.isArray(p.variants)?p.variants:[];
 const found=variants.filter(v=>v.sku===TARGET_SKU);
 if(found.length>1)throw Error("Duplicate pilot SKU encountered");
 if(found.length===1){
  const v=found[0];
  const stock=Number(v.qty??v.stock);
  if(stock!==0||Number(v.price)!==80)throw Error("Pilot SKU not zero stock / regular price 80");
  console.log("PASS: hidden product 1475 holds exactly one matching pilot variant with stock=0");
  return true;
 }
 return false;
}
const product=await get();
if(check(product))process.exit(0);
if(process.env.GK2_PILOT_WRITE!=="true")throw Error("Pilot is read-only; set GK2_PILOT_WRITE=true only in one-time workflow");
// EXACTLY ONE VARIANT ADD to EXPLICIT product; no other product writes, no stock or visibility changes.
const payload=[{product_id:TARGET_PRODUCT,visible:0,disable_minusqty:"1",variants:{
 add:[{variant_option1_name:"Velg dag",variant_option1_value:"2026-11-01",
       variant_option2_name:"Velg tidspunkt",variant_option2_value:"11:00-11:30",
       sku:TARGET_SKU,price:80,qty:0,preorder:0}]
}}];
const result=await request("PUT",payload);
if(result.success===0||result.error||Array.isArray(result.errors)&&result.errors.length)
 throw Error("Quickbutik returned a rejected pilot write");
const after=await get();
if(!check(after))throw Error("Pilot variant not yet verifiable after write; manually inspect without retrying PUT");
console.log("SUCCESS: exactly one hidden/zero-stock variant added and re-verified; booking remains disabled");
