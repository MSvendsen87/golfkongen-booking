// GolfKongen Booking 2.0: automatic rolling Quickbutik slot VARIANT PREWARM.
// Dedicated hidden Booking2 products only; no legacy product writes, no checkout activation.
// Env (GitHub Actions secret): GK2_QUICKBUTIK_API_KEY. In addition set repository variable
// GK2_VARIANT_SYNC_WRITE=true after an explicit small test. Default DRY RUN.
// Each run re-reads existing SKU catalog and appends only missing SKUs.
// All NEW variants are qty 0 and parent visible 0. It never marks a product sale-ready.
import {readFileSync} from "node:fs";

const manifest=JSON.parse(readFileSync(new URL("../data/quickbutik-duration-manifest.json",import.meta.url),"utf8"));
const key=process.env.GK2_QUICKBUTIK_API_KEY||"";
const writeRequested=process.env.GK2_VARIANT_SYNC_WRITE==="true";
// Old live booking uses V1 variants.add for date/time SKUs.
// Verified 26 Oct on Booking2 product 1474: variants.add creates SKU/qty0;
// a second V1 PUT with variant_id+visible:0 hides that exact variant.
// Every staged variant must pass readback BEFORE the job continues.
// Parents stay hidden and all writes are opt-in; default is DRY_RUN.
const write=writeRequested;
const maxNew=Number(process.env.GK2_MAX_VARIANTS_PER_RUN||2000);
if(!Number.isSafeInteger(maxNew)||maxNew<1||maxNew>12000)throw Error("Unsafe maxNew budget; expected integer 1..12000");
const chunkSize=Number(process.env.GK2_BATCH_SIZE||25);
if(!Number.isSafeInteger(chunkSize)||chunkSize<1||chunkSize>50)throw Error("Unsafe batch size 1..50");
const api="https://api.quickbutik.com/v1/products";
const resourceNames=new Set(["hyzr","dart_a","dart_b","venue"]);
const osloDay=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Oslo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const advance=(iso,days)=>new Date(Date.parse(iso+"T12:00:00Z")+days*86400000).toISOString().slice(0,10);
const hhmm=m=>String(Math.floor(m/60)).padStart(2,"0")+String(m%60).padStart(2,"0");
const fmt=m=>hhmm(m).slice(0,2)+":"+hhmm(m).slice(2);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const basic=key?"Basic "+Buffer.from(key+":"+key).toString("base64"):"";
async function shop(method,query,payload){
 const url=api+(query?"?"+new URLSearchParams(query):"");
 const r=await fetch(url,{method,headers:{"Authorization":basic,"Accept":"application/json",
  ...(payload?{"Content-Type":"application/json"}:{})},body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error("Quickbutik "+method+" returned HTTP "+r.status+" (no credentials exposed)");
 const text=await r.text();return text.trim()?JSON.parse(text):{};
}
function hiddenVariant(v){return [true,1,"1"].includes(v?.hidden);}
function zeroVariant(v){return Number(v?.qty??v?.stock)===0;}
function goodStaged(v,expectedSku,expectedPrice){
 return v&&String(v.sku)===expectedSku&&hiddenVariant(v)&&zeroVariant(v)
  &&Number(v.price)===Number(expectedPrice)&&Number.isSafeInteger(Number(v.id))&&Number(v.id)>0;
}
async function rereadProduct(productId){
 let product=null;
 for(let attempt=0;attempt<3;attempt++){
  if(attempt)await sleep(700*attempt);
  const payload=await shop("GET",{product_id:String(productId),include_details:"true"});
  const candidate=payload?.product??payload;
  if(candidate&&Number(candidate.id)===productId&&Array.isArray(candidate.variants)){
   product=candidate;break;
  }
 }
 if(!product||!String(product.title||"").startsWith("Booking 2.0"))
  throw Error("STOP: exact product readback failed for "+productId);
 // Quickbutik V1 sometimes reports visible:null for a hidden parent.
 if([1,"1",true].includes(product.visible))
  throw Error("STOP: Booking2 parent became visible: "+productId);
 return product;
}
async function hideStagedVariants(productId,expectedVariants){
 if(!expectedVariants.length)return;
 // Batch PUT is the same /v1/products endpoint already used by the old booking.
 const updates=expectedVariants.map(v=>{
  if(!Number.isSafeInteger(Number(v.id))||Number(v.id)<1)
   throw Error("STOP: missing exact variant ID");
  return {product_id:productId,variant_id:Number(v.id),visible:0,stock:0,disable_minusqty:"1"};
 });
 const result=await shop("PUT",null,updates);
 if(result?.success===0||result?.error)throw Error("STOP: V1 hide rejected");
 const fresh=await rereadProduct(productId);
 for(const wanted of expectedVariants){
  const same=fresh.variants.filter(v=>String(v.sku)===String(wanted.sku));
  if(same.length!==1||!goodStaged(same[0],wanted.sku,wanted.price))
   throw Error("STOP: hide/readback verification failed for "+productId+"/"+wanted.sku+
     " – no further writes; parent must remain hidden");
 }
 return fresh;
}
function validatePlan(p){
 if(!resourceNames.has(p.resource)||!Number.isSafeInteger(p.productId)||p.productId<1400||p.productId>999999
  ||!Number.isInteger(p.minutes)
  ||(p.resource==="venue"?(p.minutes<240||p.minutes>720||p.minutes%60):(p.minutes<30||p.minutes>240||p.minutes%30)))throw Error("Invalid mapped Booking2 product");
}
function planVariants(product,dates,duration,limit){
 const known=new Set(Array.isArray(product.variants)?product.variants.map(v=>v.sku):[]);
 const missing=[];
 for(const day of dates){
  for(let start=600;start+duration<=1320;start+=30){
   const end=start+duration,sku=day+"-"+hhmm(start)+"-"+hhmm(end);
   if(known.has(sku))continue;
   missing.push({
     variant_option1_name:"Velg dag",variant_option1_value:day,
     variant_option2_name:"Velg tidspunkt",variant_option2_value:fmt(start)+"-"+fmt(end),
     sku,price:Number(product.price),qty:0,preorder:0
   });
   known.add(sku);
   if(missing.length>=limit)return missing;
  }
 }
 return missing;
}
async function main(){
 if(manifest.products.length!==33||!Number.isInteger(manifest.minDaysAhead)||manifest.minDaysAhead<45)
  throw Error("Unexpected manifest; must cover all 33 products and >=45 days");
 const seen=new Set();
 for(const p of manifest.products){validatePlan(p);if(seen.has(p.productId)||seen.has(p.resource+"|"+p.minutes))throw Error("Duplicate product manifest");seen.add(p.productId);seen.add(p.resource+"|"+p.minutes);}
 if(!key){console.log("SKIPPED: GK2_QUICKBUTIK_API_KEY is missing in GitHub Secrets. No Quickbutik writes.");return;}
 const today=osloDay(),earliest=today<manifest.firstBookable?manifest.firstBookable:today,latest=advance(today,manifest.minDaysAhead);
 // Prioritize the newest date on every run, so midnight always gets a new day first.
 // Spread the API-write quota across ALL 33 resources/durations, not first few products.
 const dates=[];for(let day=earliest;day<=latest;day=advance(day,1))dates.push(day);
 dates.reverse();
 const perPlanBudget=Math.max(1,Math.floor(maxNew/manifest.products.length));
 let created=0,missingTotal=0,products=0;
 console.log("Booking2 variants: "+earliest+" through "+latest+" | mode="+(write?"HIDDEN_STOCK_ZERO_WRITE":"DRY_RUN")+" | budget="+maxNew);
 for(const p of manifest.products){
  if(created>=maxNew)break;
  let payload,product;
  // Quickbutik can intermittently return a successful HTTP response without a
  // single-product payload. Retry READs conservatively, NEVER retry unknown writes.
  for(let attempt=1;attempt<=3;attempt++){
    if(attempt>1)await sleep(1200*attempt);
    payload=await shop("GET",{product_id:String(p.productId),include_details:"true"});
    // Quickbutik API has two successful single-product shapes: {product:{...}} or a bare {...}.
    product=payload?.product??payload;
    if(product&&!Array.isArray(product)&&Number(product.id)===p.productId)break;
    const shape=Array.isArray(payload)?"array":typeof payload;
    const keys=payload&&typeof payload==="object"?Object.keys(payload).slice(0,8).join(","):"none";
    console.log("Product read "+p.productId+" retry "+attempt+"/3: expected product object; responseShape="+shape+"; keys="+keys);
    product=null;
  }
  if(!product)throw Error("Product read could not verify exact identity "+p.productId+" after 3 attempts: no writes");
  await sleep(800);
  if(!(product.visible===false||product.visible===0||product.visible==="0")){
   // Quickbutik V1 sometimes reports visible:null even for an actually hidden
   // product. In DRY RUN we can report missing variants safely, but only a
   // separately verified hidden parent may ever be modified.
   if(write&&[1,true,"1"].includes(product.visible))
    throw Error("STOP: Product "+p.productId+" is visible; do not write");
   // V1 visible:null was independently verified on hidden staging parents.
   // The V1 PUT always keeps visible=0 and the post-write SKU is hidden.
   console.warn("READ-ONLY WARNING: Product "+p.productId+
     " V1 visibility is "+String(product.visible)+"; this does NOT authorize any write");
  }
  if(!String(product.title||"").startsWith("Booking 2.0"))throw Error("Not a Booking2 product: "+p.productId);
  if(!Number.isFinite(Number(product.price))||Number(product.price)<=0)
   throw Error("Invalid product regular price "+p.productId);
  if(!Array.isArray(product.variants)){
    // No-variant products may omit the variants array entirely in Quickbutik v1.
    // Only allow empty list for an explicitly non-variant product.
    const flag=String(product.hasVariants??"").toLowerCase();
    if(["0","false"].includes(flag))product.variants=[];
    else throw Error("Variants missing for product with variants "+p.productId);
  }
  // maxNew applies across the whole run. Reread before next run for idempotency.
  const missing=planVariants(product,dates,p.minutes,Math.min(perPlanBudget,maxNew-created));
  missingTotal+=missing.length;products++;
  console.log("Product "+p.productId+" ("+p.resource+" "+p.minutes+" min) missing="+missing.length);
  if(!write)continue;
  // Repair any zero-stock variants created by an interrupted prior run.
  // Never modify variants with stock > 0 (could be real customer slots).
  const repair=product.variants.filter(v=>v.sku&&
   /^20\\d{2}-\\d{2}-\\d{2}-\\d{4}-\\d{4}$/.test(String(v.sku))&&
   dates.some(d=>String(v.sku).startsWith(d+"-"))&&
   !hiddenVariant(v)&&zeroVariant(v));
  if(repair.length>0){
   console.log("Repairing "+repair.length+" unhidden zero-stock staged variants for "+p.productId);
   for(let i=0;i<repair.length;i+=chunkSize)
    await hideStagedVariants(p.productId,repair.slice(i,i+chunkSize));
  }
  for(let i=0;i<missing.length;i+=chunkSize){
   const variants=missing.slice(i,i+chunkSize);
   // Legacy variants.add generates the date and time option values.
   const result=await shop("PUT",null,[{
     product_id:p.productId,visible:0,disable_minusqty:"1",
     variants:{add:variants}
   }]);
   if(result?.success===0||result?.error)throw Error("STOP: V1 variant add rejected");
   // CRITICAL: never retry an uncertain write; first read back to resolve IDs.
   const now=await rereadProduct(p.productId);
   const added=variants.map(v=>{
    const matches=now.variants.filter(x=>x.sku===v.sku);
    if(matches.length!==1||Number(matches[0].price)!==Number(v.price)||
       !zeroVariant(matches[0]))
     throw Error("STOP: V1 add could not verify exact SKU/zero stock "+v.sku);
    return matches[0];
   });
   await hideStagedVariants(p.productId,added);
   created+=variants.length;
   console.log("CREATED_HIDDEN_VERIFIED product="+p.productId+" count="+variants.length);
   await sleep(650);
  }
 }
 console.log(JSON.stringify({date:today,firstBookable:earliest,lastBookable:latest,scanned:products,
   newlyCreatedHiddenStockZero:created,missingInProcessedProducts:missingTotal,mode:write?"staging-write":"dry-run"}));
}
main().catch(e=>{console.error("SYNC HALTED SAFELY:",e?.message||String(e));process.exitCode=1;});
