// Booking 2.0 Pushover adapter (STAGING ONLY). No credentials or outbound requests.
// Official Quickbutik order.new webhook = new PAID order.
// Keep legacy worker handling of product IDs 1316/1317/1320/1322/1349 unchanged until cutover.
export const bookingV2Products = new Map([[1474,["hyzr",30]],[1475,["dart_a",30]],[1476,["dart_b",30]],[1477,["hyzr",60]],[1478,["hyzr",90]],[1479,["hyzr",120]],[1480,["hyzr",150]],[1481,["hyzr",180]],[1482,["hyzr",210]],[1483,["hyzr",240]],[1484,["dart_a",90]],[1485,["dart_a",120]],[1486,["dart_a",60]],[1487,["dart_a",150]],[1488,["dart_a",210]],[1489,["dart_a",180]],[1490,["dart_b",60]],[1491,["dart_a",240]],[1492,["dart_b",90]],[1493,["dart_b",120]],[1494,["dart_b",150]],[1495,["dart_b",180]],[1496,["dart_b",210]],[1497,["dart_b",240]],[1498,["venue",240]],[1499,["venue",300]],[1500,["venue",360]],[1501,["venue",420]],[1502,["venue",480]],[1503,["venue",540]],[1504,["venue",600]],[1505,["venue",660]],[1506,["venue",720]]]);
const titles={hyzr:"🥏 HYZR SIMULATOR",dart_a:"🎯 DART – BANE A",dart_b:"🎯 DART – BANE B",venue:"🎉 HELE LOKALET"};
export function bookingV2Notice({productId,sku,customer,orderId,quantity=1}){
 const found=bookingV2Products.get(Number(productId));
 if(!found)return null;
 const [resource,duration]=found;
 if(!/^\d{4}-\d{2}-\d{2}-\d{4}-\d{4}$/.test(String(sku||"")) || quantity!==1)
 return {type:"manual_review",title:"Booking 2.0: må kontrolleres",message:"Ordre "+orderId+" har uventet tidslinje eller antall. Verifiser manuelt.",resource,duration};
 return {type:"booking",title:titles[resource],
  message:"Ny betalt booking\n\n"+sku+"\nVarighet: "+duration+" minutter\nBooket av: "+(String(customer||"Ukjent").slice(0,160))+"\nOrdre: "+orderId,
  resource,duration};
}
