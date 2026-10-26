// Booking 2.0 Pushover adapter (STAGING ONLY). No credentials or outbound requests.
// Official Quickbutik order.new webhook = new PAID order.
// Keep legacy worker handling of product IDs 1316/1317/1320/1322/1349 unchanged until cutover.
export const bookingV2Products = new Map([[1474,["hyzr",30]],[1475,["dart_a",30]],[1476,["dart_b",30]],[1477,["hyzr",60]],[1478,["hyzr",90]],[1479,["hyzr",120]],[1480,["hyzr",150]],[1481,["hyzr",180]],[1482,["hyzr",210]],[1483,["hyzr",240]],[1484,["dart_a",90]],[1485,["dart_a",120]],[1486,["dart_a",60]],[1487,["dart_a",150]],[1488,["dart_a",210]],[1489,["dart_a",180]],[1490,["dart_b",60]],[1491,["dart_a",240]],[1492,["dart_b",90]],[1493,["dart_b",120]],[1494,["dart_b",150]],[1495,["dart_b",180]],[1496,["dart_b",210]],[1497,["dart_b",240]],[1498,["venue",240]],[1499,["venue",300]],[1500,["venue",360]],[1501,["venue",420]],[1502,["venue",480]],[1503,["venue",540]],[1504,["venue",600]],[1505,["venue",660]],[1506,["venue",720]]]);
// Notification formatter may ONLY be invoked from the server's durable,
 // idempotently claimed booking_confirmed outbox event. A raw order.new event
 // (including an actual paid test product) is NOT a confirmed reservation.
const titles={hyzr:"🥏 HYZR SIMULATOR",dart_a:"🎯 DART – BANE A",dart_b:"🎯 DART – BANE B",venue:"🎉 HELE LOKALET"};
function minutes(hhmm){
 const m=/^(\\d{2})(\\d{2})$/.exec(String(hhmm));
 if(!m)return null;
 const n=Number(m[1])*60+Number(m[2]);
 return Number(m[1])<24&&Number(m[2])<60?n:null;
}
function validSlot(sku,duration){
 const match=/^(20\\d{2}-\\d{2}-\\d{2})-(\\d{4})-(\\d{4})$/.exec(String(sku||""));
 if(!match)return false;
 const day=new Date(match[1]+"T12:00:00Z");
 if(Number.isNaN(day.valueOf())||day.toISOString().slice(0,10)!==match[1])return false;
 const from=minutes(match[2]),to=minutes(match[3]);
 return from!==null&&to!==null&&to-from===duration&&from%30===0&&to%30===0;
}
export function bookingV2Notice({
 productId,sku,customer,orderId,quantity=1,bookingId,
 outboxKind,bookingStatus,verifiedPaid=false,rentalSets=0,
}={}){
 const found=bookingV2Products.get(Number(productId));
 if(!found)return null;
 // The original HYZR 60min product 1477 was used for a real paid checkout
 // pilot without a reservation. Never send a fake booking notification.
 if(String(sku||"").startsWith("GK2-TEST-ONLY-"))return null;
 if(outboxKind!=="booking_confirmed"||bookingStatus!=="confirmed"||
    verifiedPaid!==true||typeof bookingId!=="string"||bookingId.length<8||
    !/^[A-Za-z0-9_-]{2,90}$/.test(String(orderId||"")))return null;
 const [resource,duration]=found;
 if(quantity!==1||!validSlot(sku,duration)||
    !Number.isSafeInteger(rentalSets)||rentalSets<0||rentalSets>6)
 return {type:"manual_review",bookingId,resource,duration,
   reason:"confirmed_booking_payload_inconsistent"};
 const rentalLine=rentalSets?"\\nPilsett: "+rentalSets+" stk.":"";
 return {type:"booking",title:titles[resource],
  message:"Bekreftet betalt booking\\n\\n"+sku+"\\nVarighet: "+duration+
  " minutter"+rentalLine+"\\nBooket av: "+String(customer||"Ukjent").slice(0,160)+
  "\\nOrdre: "+orderId,
  bookingId,orderId,resource,duration,
  eventKey:bookingId+":booking_confirmed:v1"};
}
