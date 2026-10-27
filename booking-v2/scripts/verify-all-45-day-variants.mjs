// READ-ONLY audit of all 33 hidden Booking 2.0 Quickbutik variant calendars.
// No HTTP PUT/PATCH/POST; no customer, payment, Nuki or legacy writes.
// Catch a partial 45-day calendar before it becomes a customer promise.
import {readFileSync} from "node:fs";
const manifest=JSON.parse(readFileSync(new URL("../data/quickbutik-duration-manifest.json",import.meta.url),"utf8"));
const prices=JSON.parse(readFileSync(new URL("../data/public-prices.json",import.meta.url),"utf8"));
const key=process.env.GK2_QUICKBUTIK_API_KEY||"";
if(!key)throw Error("Missing read-only Quickbutik key");
const osloToday=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Oslo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const advance=(day,n)=>new Date(Date.parse(day+"T12:00:00Z")+n*86400000).toISOString().slice(0,10);
const date0=osloToday(),from=date0<manifest.firstBookable?manifest.firstBookable:date0,through=advance(date0,45);
const dates=[];for(let date=from;date<=through;date=advance(date,1))dates.push(date);
const fmt=n=>String(Math.floor(n/60)).padStart(2,"0")+String(n%60).padStart(2,"0");
const hdr={"Authorization":"Basic "+Buffer.from(key+":"+key).toString("base64"),"Accept":"application/json"};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const audit=[];
for(const p of manifest.products){
 const u="https://api.quickbutik.com/v1/products?product_id="+p.productId+"&include_details=true";
 const r=await fetch(u,{headers:hdr,signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error("Read-only V1 API returned HTTP "+r.status+" for "+p.productId);
 const a=await r.json(),prod=a.product??a;
 if(Number(prod?.id)!==p.productId||!String(prod?.title||"").startsWith("Booking 2.0")||
    !Array.isArray(prod?.variants)||[true,1,"1"].includes(prod?.visible))
   throw Error("Untrusted parent/variant response for "+p.productId);
 const variants=prod.variants;const map=new Map();
 const policy=prices.find(x=>x.productId===p.productId&&x.resource===p.resource&&x.minutes===p.minutes);
 if(!policy)throw Error('Missing public price policy for '+p.productId);
 let priceErrors=Number(Number(prod.price)!==policy.price);
 let unsafe=0,duplicates=0;
 for(const v of variants){
  if(map.has(v.sku))duplicates++;
  map.set(String(v.sku),v);
  if(![true,1,"1"].includes(v.hidden)||Number(v.qty??v.stock)!==0)unsafe++;
  if(Number(v.price)!==policy.price)priceErrors++;
 }
 let expected=0,found=0,missing=0,firstMissing="";
 for(const day of dates){
  for(let start=600;start+p.minutes<=1320;start+=30){
   const sku=day+"-"+fmt(start)+"-"+fmt(start+p.minutes);
   expected++;
   if(map.has(sku))found++;
   else{missing++;if(!firstMissing)firstMissing=sku}
  }
 }
 const item={id:p.productId,resource:p.resource,minutes:p.minutes,
  variants:variants.length,expected,found,missing,duplicates,unsafe,priceErrors,expectedPrice:policy.price,firstMissing};
 audit.push(item);
 console.log("AUDIT "+JSON.stringify(item));
 await sleep(180);
}
const total=audit.reduce((acc,x)=>{
 for(const k of ["expected","found","missing","unsafe","duplicates","priceErrors"])acc[k]+=x[k];
 return acc;
},{expected:0,found:0,missing:0,unsafe:0,duplicates:0,priceErrors:0});
const full=audit.filter(x=>x.missing===0).length;
console.log("BOOKING2 READ-ONLY COVERAGE "+JSON.stringify({from,through,days:dates.length,products:audit.length,
 fullProducts:full,coveragePct:Math.round(10000*total.found/total.expected)/100,...total}));
if(total.unsafe||total.duplicates||total.priceErrors)throw Error("Unsafe/duplicate inventory or incorrect public price detected; never publish");
if(total.missing)process.exitCode=2; // Diagnostic fails visibly, NO writes.
