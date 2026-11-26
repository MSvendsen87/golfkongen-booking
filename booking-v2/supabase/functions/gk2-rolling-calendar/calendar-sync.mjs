// Bounded, idempotent variant prewarming. Existing bookable variants are immutable.
export const advance=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const hhmm=m=>String(Math.floor(m/60)).padStart(2,'0')+String(m%60).padStart(2,'0');
const time=m=>hhmm(m).slice(0,2)+':'+hhmm(m).slice(2);
const qty=v=>Number(v.qty??v.stock);
const hidden=v=>[true,1,'1'].includes(v.hidden);
const standardOpen=8*60,standardClose=23*60;
export function slotsForDay(day,minutes){
 const result=[];
 for(let start=standardOpen;start+minutes<=standardClose;start+=30){
  result.push({sku:day+'-'+hhmm(start)+'-'+hhmm(start+minutes),
   variant_option1_name:'Velg dag',variant_option1_value:day,
   variant_option2_name:'Velg tidspunkt',variant_option2_value:time(start)+'-'+time(start+minutes)});
 }
 return result;
}
export async function syncCalendar(plan,{apiKey,fetchImpl=fetch,maxNew=300}={}){
 if(!Number.isInteger(plan.productId)||plan.productId<1474||plan.productId>1506||
 !['hyzr','dart_a','dart_b','venue'].includes(plan.resource)||
 !Number.isInteger(plan.minutes)||plan.minutes<30||plan.minutes>720||plan.minutes%30||
 !/^20\d\d-\d\d-\d\d$/.test(plan.firstDay)||!/^20\d\d-\d\d-\d\d$/.test(plan.targetDay)||
 plan.firstDay>plan.targetDay||Date.parse(plan.targetDay)-Date.parse(plan.firstDay)>90*86400000||
 typeof apiKey!=='string'||apiKey.length<20)throw Error('invalid_calendar_plan');
 const headers={Authorization:'Basic '+btoa(apiKey+':'+apiKey),Accept:'application/json'};
 async function request(method,payload){
  const url='https://api.quickbutik.com/v1/products'+(method==='GET'?'?product_id='+plan.productId+'&include_details=true':'');
  const res=await fetchImpl(url,{method,headers:{...headers,...(payload?{'Content-Type':'application/json'}:{})},
   body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(20000)});
  if(!res.ok)throw Error('quickbutik_'+method+'_http_'+res.status);
  const result=await res.json();
  if(result?.success===0||result?.error)throw Error('quickbutik_write_rejected');
  return result;
 }
 async function read(){
  const raw=await request('GET');const p=raw?.product??raw;
  if(Number(p?.id)!==plan.productId||!String(p.title||'').startsWith('Booking 2.0')||
  !Array.isArray(p.variants)||!Number.isFinite(Number(p.price))||Number(p.price)<=0)
   throw Error('invalid_product_readback');
  const skus=new Set();
  for(const v of p.variants){if(skus.has(v.sku))throw Error('duplicate_existing_sku');skus.add(v.sku);}
  return p;
 }
 let product=await read();
 const original=product;const changed=new Set();
 const parent={visible:product.visible,price:product.price};
 const expected=[];
 const repairable=new Set();
 for(let day=plan.targetDay;day>=plan.firstDay;day=advance(day,-1)){
  const slots=slotsForDay(day,plan.minutes);
  const weekday=new Date(day+'T12:00:00Z').getUTCDay()||7;
  const hours=plan.openingHoursByWeekday?.[weekday];
  for(const slot of slots){
   const label=slot.variant_option2_value;
   const from=Number(label.slice(0,2))*60+Number(label.slice(3,5));
   const end=from+plan.minutes;
   if(day>plan.bookableThrough||(hours&&(from<hours.from||end>hours.to)))
    repairable.add(slot.sku);
   expected.push(slot);
  }
 }
 let created=0,repaired=0;
 async function close(variants){
  if(!variants.length)return;
  await request('PUT',variants.map(v=>({product_id:plan.productId,variant_id:Number(v.id),visible:0,stock:0,disable_minusqty:'1'})));
  product=await read();
  const bySku=new Map(product.variants.map(v=>[v.sku,v]));
  for(const v of variants){
   const after=bySku.get(v.sku);
   if(!after||Number(after.id)!==Number(v.id)||!hidden(after)||qty(after)!==0||Number(after.price)!==Number(v.price))
    throw Error('hide_readback_mismatch');
   changed.add(v.sku);
  }
 }
 // Recover interrupted adds only for slots customers cannot currently book.
 const repair=product.variants.filter(v=>repairable.has(v.sku)&&!hidden(v)&&qty(v)===0);
 for(let i=0;i<repair.length;i+=25){await close(repair.slice(i,i+25));repaired+=repair.slice(i,i+25).length;}
 const known=new Set(product.variants.map(v=>v.sku));
 const missing=expected.filter(v=>!known.has(v.sku)).slice(0,maxNew);
 for(let i=0;i<missing.length;i+=25){
  const chunk=missing.slice(i,i+25).map(v=>({...v,price:Number(original.price),qty:0,preorder:0}));
  // An uncertain write is never retried; the next run resolves it by SKU readback.
  await request('PUT',[{product_id:plan.productId,variants:{add:chunk}}]);
  product=await read();
  const bySku=new Map(product.variants.map(v=>[v.sku,v]));
  const added=chunk.map(w=>{
   const v=bySku.get(w.sku);
   if(!v||!Number.isSafeInteger(Number(v.id))||Number(v.id)<=0||qty(v)!==0||Number(v.price)!==w.price)
    throw Error('add_readback_mismatch');
   return v;
  });
  await close(added);created+=chunk.length;
 }
 // Preserve all existing variants, including active carts and paid bookings.
 if(product.visible!==parent.visible||Number(product.price)!==Number(parent.price))throw Error('parent_changed');
 const finalBySku=new Map(product.variants.map(v=>[v.sku,v]));
 for(const before of original.variants){
  const after=finalBySku.get(before.sku);
  if(!after||Number(after.id)!==Number(before.id)||Number(after.price)!==Number(before.price)||
  (!changed.has(before.sku)&&(qty(after)!==qty(before)||hidden(after)!==hidden(before))))
   throw Error('existing_variant_changed');
 }
 const remaining=expected.filter(v=>!finalBySku.has(v.sku)).length;
 for(const sku of repairable){
  const v=finalBySku.get(sku);
  if(v&&(!hidden(v)||qty(v)!==0||!Number.isFinite(Number(v.price))||Number(v.price)<=0||
   !Number.isSafeInteger(Number(v.id))||Number(v.id)<=0))throw Error('unbookable_variant_not_safely_staged');
 }
 return {complete:remaining===0,productId:plan.productId,firstDay:plan.firstDay,targetDay:plan.targetDay,
  expected:expected.length,created,repaired,remaining,standardOpen,standardClose};
}
