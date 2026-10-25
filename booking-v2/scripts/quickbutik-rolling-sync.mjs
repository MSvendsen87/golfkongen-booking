// GolfKongen Booking 2.0: automatic rolling Quickbutik slot VARIANT PREWARM.
// Dedicated hidden Booking2 products only; no legacy product writes, no checkout activation.
// Env (GitHub Actions secret): GK2_QUICKBUTIK_API_KEY. In addition set repository variable
// GK2_VARIANT_SYNC_WRITE=true after an explicit small test. Default DRY RUN.
// Each run re-reads existing SKU catalog and appends only missing SKUs.
// All NEW variants are qty 0 and parent visible 0. It never marks a product sale-ready.
import {readFileSync} from "node:fs";

const manifest=JSON.parse(readFileSync(new URL("../data/quickbutik-duration-manifest.json",import.meta.url),"utf8"));
const key=process.env.GK2_QUICKBUTIK_API_KEY||"";
const write=process.env.GK2_VARIANT_SYNC_WRITE==="true";
const maxNew=Math.min(12000,Math.max(1,Number(process.env.GK2_MAX_VARIANTS_PER_RUN||2000)));
const chunkSize=Math.min(50,Math.max(1,Number(process.env.GK2_BATCH_SIZE||25)));
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
 return r.json();
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
 const dates=[];for(let day=earliest;day<=latest;day=advance(day,1))dates.push(day);
 let created=0,missingTotal=0,products=0;
 console.log("Booking2 variants: "+earliest+" through "+latest+" | mode="+(write?"HIDDEN_STOCK_ZERO_WRITE":"DRY_RUN")+" | budget="+maxNew);
 for(const p of manifest.products){
  if(created>=maxNew)break;
  const payload=await shop("GET",{product_id:String(p.productId)});
  const product=payload?.product;
  if(!product||Array.isArray(product)||Number(product.id)!==p.productId)throw Error("Product identity mismatch "+p.productId);
  if(!(product.visible===false||product.visible===0||product.visible==="0"))
   throw Error("STOP: Product "+p.productId+" is visible; do not touch");
  if(!String(product.title||"").startsWith("Booking 2.0"))throw Error("Not a Booking2 product: "+p.productId);
  if(!Number.isFinite(Number(product.price))||Number(product.price)<=0)
   throw Error("Invalid product regular price "+p.productId);
  if(!Array.isArray(product.variants))throw Error("Variants missing for "+p.productId);
  // maxNew applies across the whole run. Reread before next run for idempotency.
  const missing=planVariants(product,dates,p.minutes,Math.min(maxNew-created,5000));
  missingTotal+=missing.length;products++;
  console.log("Product "+p.productId+" ("+p.resource+" "+p.minutes+" min) missing="+missing.length);
  if(!write)continue;
  for(let i=0;i<missing.length;i+=chunkSize){
   const variants=missing.slice(i,i+chunkSize);
   await shop("PUT",null,[{
     product_id:p.productId,visible:0,disable_minusqty:"1",
     variants:{add:variants}
   }]);
   created+=variants.length;
   // Conservative request pacing; stop after an error instead of retrying unknown writes.
   await sleep(850);
  }
 }
 console.log(JSON.stringify({date:today,firstBookable:earliest,lastBookable:latest,scanned:products,
   newlyCreatedHiddenStockZero:created,missingInProcessedProducts:missingTotal,mode:write?"staging-write":"dry-run"}));
}
main().catch(e=>{console.error("SYNC HALTED SAFELY:",e?.message||String(e));process.exitCode=1;});
