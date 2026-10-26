// Safe, pure prewarm planning for GolfKongen Booking 2.0.
// No Quickbutik credentials, I/O, network requests or write side effects.
const isDate = s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)
 && !Number.isNaN(Date.parse(s+"T12:00:00Z"))
 && new Date(s+"T12:00:00Z").toISOString().slice(0,10)===s;
export function shiftDay(day,delta){
 if(!isDate(day)||!Number.isInteger(delta)||Math.abs(delta)>365)
  throw Error("invalid_calendar_day");
 return new Date(Date.parse(day+"T12:00:00Z")+delta*86400000).toISOString().slice(0,10);
}
export function safeBookingWindow(today,firstBookable="2026-11-01",daysAhead=45){
 if(!isDate(today)||!isDate(firstBookable)||!Number.isInteger(daysAhead)
    ||daysAhead<45||daysAhead>90)throw Error("invalid_booking_window");
 const start=today<firstBookable?firstBookable:today;
 const end=shiftDay(today,daysAhead);
 const dates=[];
 for(let d=start;d<=end;d=shiftDay(d,1))dates.push(d);
 return Object.freeze({start,end,dates});
}
const hhmm = v=>String(Math.floor(v/60)).padStart(2,"0")+String(v%60).padStart(2,"0");
const time = v=>hhmm(v).slice(0,2)+":"+hhmm(v).slice(2);
export function expectedSku(day,start,minutes){
 if(!isDate(day)||!Number.isInteger(start)||start%30!==0||start<0
    ||!Number.isInteger(minutes)||minutes%30!==0||minutes<=0
    ||start+minutes>1440)throw Error("invalid_variant_slot");
 return day+"-"+hhmm(start)+"-"+hhmm(start+minutes);
}
export function safeVariantPlan({
 product,resource,minutes,dates,limit=2000,
 from=600,to=1320,step=30
}={}){
 if(!product||typeof product!=="object"||Array.isArray(product)
  ||!String(product.title||"").startsWith("Booking 2.0")
  ||!["hyzr","dart_a","dart_b","venue"].includes(resource)
  ||!Number.isInteger(minutes)||minutes%30!==0||minutes<30||minutes>720
  ||(resource==="venue"&&(minutes<240||minutes%60!==0))
  ||(resource!=="venue"&&minutes>240)
  ||!Array.isArray(dates)||!dates.every(isDate)
  ||new Set(dates).size!==dates.length
  ||!Number.isSafeInteger(limit)||limit<0||limit>100000
  ||!Number.isInteger(from)||!Number.isInteger(to)||!Number.isInteger(step)
  ||step!==30||from<0||to>1440||from>=to
 )throw Error("invalid_variant_plan");
 if(!(product.visible===false||product.visible===0||product.visible==="0"))
  throw Error("staging_product_visibility_not_verified");
 const price=Number(product.price);
 if(!Number.isFinite(price)||price<=0||price>100000)throw Error("invalid_staging_price");
 const variants=Array.isArray(product.variants)?product.variants:[];
 const known=new Set(variants.map(v=>String(v.sku||"")).filter(Boolean));
 const newVariants=[];
 const orderedDays=dates.toSorted((a,b)=>b.localeCompare(a));
 for(const day of orderedDays){
  for(let start=from;start+minutes<=to;start+=step){
   const sku=expectedSku(day,start,minutes);
   if(known.has(sku))continue;
   newVariants.push({
    variant_option1_name:"Velg dag",variant_option1_value:day,
    variant_option2_name:"Velg tidspunkt",
    variant_option2_value:time(start)+"-"+time(start+minutes),
    sku,price,qty:0,preorder:0
   });
   known.add(sku);
   if(newVariants.length===limit)return newVariants;
  }
 }
 return newVariants;
}
export function validateStagingVariant({
 parent,variant,sku,price,requireHidden=true
}={}){
 const errors=[];
 if(!parent||parent.visible!==false&&!([0,"0"].includes(parent.visible)))
  errors.push("parent_visibility_not_verified");
 if(!parent||!String(parent.title||"").startsWith("Booking 2.0"))
  errors.push("not_booking_product");
 if(!variant||String(variant.sku||"")!==sku)errors.push("sku_mismatch");
 if(!variant||Number(variant.stock??variant.qty)!==0)errors.push("stock_not_zero");
 if(!variant||variant.preorder===true||variant.preorder===1)errors.push("preorder_enabled");
 if(!variant||variant.allowMinusQty===true||variant.allowMinusQty===1)
  errors.push("negative_stock_enabled");
 if(!variant||Number(variant.price)!==price)errors.push("price_mismatch");
 if(requireHidden&&(!variant||variant.hidden!==true))errors.push("variant_not_hidden");
 return Object.freeze({safe:errors.length===0,errors});
}
