// Read-only Quickbutik slot catalogue audit. NOT a checkout implementation.
export const PRODUCT_IDS = Object.freeze({hyzr:1320,dart_a:1316,dart_b:1317});
export const BASE_HALFHOUR_ORE = Object.freeze({hyzr:7500,dart_a:6000,dart_b:6000});
const time = m => String(Math.floor(m/60)).padStart(2,'0') + String(m%60).padStart(2,'0');
export function halfhourSku(day,m){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isInteger(m)||m<0||m>1410||m%30)throw Error('invalid_halfhour');
 return day+'-'+time(m)+'-'+time(m+30);
}
export function variantForSku(product,sku){
 const hits=(Array.isArray(product?.variants)?product.variants:[]).filter(v=>v?.sku===sku);
 if(hits.length!==1)return {state:hits.length?'duplicate_sku':'missing'};
 const v=hits[0],stock=v.stock??v.qty,qty=Number(stock),price=Number(v.price),id=Number(v.id);
 if(v.hidden===true||v.visible===false)return {state:'hidden'};
 if(stock===null||stock===undefined||!Number.isFinite(qty))return {state:'unknown_stock'};
 if(qty<1)return {state:'out_of_stock'};
 if(!Number.isFinite(price)||price<0)return {state:'unknown_price'};
 if(!Number.isSafeInteger(id)||id<=0)return {state:'invalid_variant_id'};
 return {state:'listed',id,priceOre:Math.round(price*100),stock:qty};
}
export function cartParts({product,date,resource,startMinute,durationMinute}){
 if(!(resource in PRODUCT_IDS))throw Error('unsupported_resource');
 if(!Number.isInteger(durationMinute)||durationMinute<30||durationMinute>240||durationMinute%30)throw Error('bad_duration');
 if(!Number.isInteger(startMinute)||startMinute<600||startMinute+durationMinute>1320||startMinute%30)throw Error('outside_standard_hours');
 const parts=[];
 for(let m=startMinute;m<startMinute+durationMinute;m+=30){
  parts.push({sku:halfhourSku(date,m),productId:PRODUCT_IDS[resource],...variantForSku(product,halfhourSku(date,m))});
 }
 const problems=parts.some(p=>p.state!=='listed');
 const wrong=parts.some(p=>p.state==='listed'&&p.priceOre!==BASE_HALFHOUR_ORE[resource]);
 return {parts,catalogReady:!problems&&!wrong,reason:problems?'missing_or_unavailable_variant':wrong?'base_price_mismatch':'catalog_valid_not_checkout_approved',baseExpectedOre:durationMinute/30*BASE_HALFHOUR_ORE[resource],baseListedOre:parts.every(p=>p.state==='listed')?parts.reduce((a,p)=>a+p.priceOre,0):null,checkoutEnabled:false,customerDiscountVerified:false,paymentVerified:false};
}
export function auditDayCatalog({date,products}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('invalid_day');
 const resources=[];
 for(const resource of Object.keys(PRODUCT_IDS)){
  const product=products[resource];const statuses={listed:0,missing:0,hidden:0,out_of_stock:0,unknown_stock:0,unknown_price:0,invalid_variant_id:0,duplicate_sku:0,price_mismatch:0};
  const samples=[];let legacyHourVariants=0;
  for(let m=600;m<1320;m+=30){
   const sku=halfhourSku(date,m),info=variantForSku(product,sku);
   const s=info.state==='listed'&&info.priceOre!==BASE_HALFHOUR_ORE[resource]?'price_mismatch':info.state;
   statuses[s]++;if(s!=='listed'&&samples.length<5)samples.push({sku,state:s});
  }
  for(let m=600;m<1320;m+=60){
    if((product?.variants||[]).some(v=>v.sku===date+'-'+time(m)+'-'+time(m+60)))legacyHourVariants++;
  }
  resources.push({resource,productId:PRODUCT_IDS[resource],expectedHalfhours:24,readyHalfhours:statuses.listed,legacyHourVariants,catalogReady:statuses.listed===24,statuses,samples});
 }
 return {date,resources,catalogReady:resources.every(r=>r.catalogReady),checkoutEnabled:false,customerGroupPricingVerified:false,paidOrderWebhookVerified:false,warning:'Dette er kun produkt-/variantkontroll. Kundekasserabatter, flerlinjeordre og Pushover er ikke betalingstestet.'};
}
