/**
 * Read-only, sanitized extension options for a verified HYZR session.
 * Pricing is a quote only. Never convert these directly into a payment or
 * extension: an atomic capacity hold and server-verified capture are required.
 */
export function collectExtensionOptions(state,quotes=[]){
  if(!state||state.status!=="active"||state.payment_confirmed!==true||
     state.resource!=="hyzr"||state.staff_mode===true||
     typeof state.reservation_id!=="string"||!state.reservation_id ||
     !["active","warning","grace"].includes(state.screen_phase))
    return [];
  if(!Array.isArray(quotes))return [];
  const durations=[30,60,90,120,150,180,210,240];
  const options=[];
  for(const q of quotes){
    if(!q||q.ok!==true||q.available!==true||q.held!==false||
       q.paymentReady!==false||q.type!=="paid"||
       q.pricingRule!=="original_actual_paid_per_minute"||
       q.bookingId!==state.reservation_id||
       !durations.includes(q.minutes)||
       !Number.isSafeInteger(q.extensionPriceOre)||q.extensionPriceOre<100 ||
       !Number.isSafeInteger(q.originalPaidOre)||q.originalPaidOre<0 ||
       !Number.isSafeInteger(q.originalMinutes)||q.originalMinutes<30 ||
       !Number.isFinite(Date.parse(q.from))||!Number.isFinite(Date.parse(q.until)) ||
       Date.parse(q.from)>=Date.parse(q.until)||
       q.punchcardMinutesToDebit!==0)continue;
    if(options.some(x=>x.minutes===q.minutes))continue;
    options.push({minutes:q.minutes,priceOre:q.extensionPriceOre,
      label:q.minutes+" min – "+(q.extensionPriceOre/100).toFixed(2).replace(".",",")+" kr",
      paymentReady:false});
  }
  return options.sort((a,b)=>a.minutes-b.minutes);
}
