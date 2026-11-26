// GolfKongen Booking 2.0: SAFE VARIANT SYNC PLANNER (no network calls).
// Quickbutik docs: PUT /v1/products with variants.add entries.
// All generated variants have qty=0, and parent products stay visible=0.
// Requires separate, explicitly reviewed production adapter to do any writes.
const resources=new Set(["hyzr","dart_a","dart_b","venue"]);
function hhmm(min){return String(Math.floor(min/60)).padStart(2,"0")+String(min%60).padStart(2,"0")}
function display(min){return hhmm(min).slice(0,2)+":"+hhmm(min).slice(2)}
export function safeDay(day){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error("invalid-day");
 const d=new Date(day+"T12:00:00Z");
 if(Number.isNaN(d.valueOf())||d.toISOString().slice(0,10)!==day)throw Error("invalid-day");
 return day;
}
export function slotSku(day,start,duration){
 safeDay(day);
 if(!Number.isInteger(start)||!Number.isInteger(duration)||start<0||duration<30||start%30||duration%30||start+duration>1440)
  throw Error("invalid-slot");
 return day+"-"+hhmm(start)+"-"+hhmm(start+duration);
}
export function variantsForPlan({plan,days,openingHours={from:600,to:1320},existingSkus=[]}){
 if(!resources.has(plan?.resource)||!Number.isSafeInteger(plan.quickbutik_product_id)||plan.quickbutik_product_id<1)throw Error("invalid-product");
 const minutes=plan.duration_minutes,ore=plan.price_ore;
 if(!Number.isInteger(minutes)||!Number.isInteger(ore)||ore<0||
   (plan.resource==="venue"?(minutes<240||minutes>720||minutes%60!==0):(minutes<30||minutes>240||minutes%30!==0)))
   throw Error("invalid-price-or-duration");
 const {from,to}=openingHours;
 if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to>1440||from>=to||from%30||to%30)throw Error("invalid-hours");
 if(!Array.isArray(days)||days.length<1||days.length>14)throw Error("day-batch-out-of-range");
 const known=new Set(existingSkus),adds=[];
 for(const day of days){
  safeDay(day);
  for(let start=from;start+minutes<=to;start+=30){
   const sku=slotSku(day,start,minutes);if(known.has(sku))continue;
   // Never infer whether the slot may be sold from product stock.
   // gk2_private claims, closures and limits are the checkout source of truth.
   adds.push({variant_option1_name:"Velg dag",variant_option1_value:day,
     variant_option2_name:"Velg tidspunkt",variant_option2_value:display(start)+"-"+display(start+minutes),
     sku,price:ore/100,qty:0,preorder:0});
   known.add(sku);
  }
 }
 return adds;
}
export function batchPayloads({plan,days,openingHours,existingSkus,maxItems=60}){
 if(!Number.isInteger(maxItems)||maxItems<1||maxItems>80)throw Error("invalid-batch-size");
 const adds=variantsForPlan({plan,days,openingHours,existingSkus});
 const result=[];
 for(let i=0;i<adds.length;i+=maxItems){
   result.push([{product_id:plan.quickbutik_product_id,visible:0,disable_minusqty:"1",variants:{add:adds.slice(i,i+maxItems)}}]);
 }
 return {resource:plan.resource,productId:plan.quickbutik_product_id,required:adds.length,
  requests:result,readyForSale:false,safeStaging:true};
}
