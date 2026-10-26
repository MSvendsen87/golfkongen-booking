// Pure helpers for GolfKongen booking -> Nuki Keypad access.
// No credentials, browser state or privileged calls belong in this module.
export const BOOKING_TYPES = Object.freeze({
  1316: "Dart – bane A",
  1317: "Dart – bane B",
  1320: "Hyzer-simulator",
  1349: "Hele lokalet"
});

export function validKeypadCode(code) {
  return /^[1-9]{6}$/.test(String(code)) && !String(code).startsWith("12");
}
export function createKeypadCode(random = (n) => crypto.getRandomValues(new Uint32Array(n))) {
  for (let tries = 0; tries < 100; tries++) {
    const nums = random(6);
    if (!nums || nums.length !== 6) throw new Error("Random generator failed");
    // Rejection sampling eliminates modulo bias in 1-9.
    const code = Array.from(nums, v => String((v % 9) + 1)).join("");
    if (validKeypadCode(code)) return code;
  }
  throw new Error("Could not generate keypad code");
}
function sameOsloParts(utc, year, month, day, hour, minute) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone:"Europe/Oslo", year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", hourCycle:"h23"
  }).formatToParts(new Date(utc));
  const p = Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return Number(p.year)===year && Number(p.month)===month &&
    Number(p.day)===day && Number(p.hour)===hour && Number(p.minute)===minute;
}
export function osloDateTimeToUtc(date, hhmm) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(hhmm))
    throw new Error("Invalid date or time");
  const [year,month,day] = date.split("-").map(Number);
  const [hour,minute] = hhmm.split(":").map(Number);
  if (year<2026 || year>2100 || hour>23 || minute>59 ||
      new Date(Date.UTC(year,month-1,day)).toISOString().slice(0,10)!==date)
    throw new Error("Out-of-range booking time");
  const localAsUtc = Date.UTC(year,month-1,day,hour,minute);
  const choices = [localAsUtc-7200000,localAsUtc-3600000]
    .filter(t=>sameOsloParts(t,year,month,day,hour,minute));
  if (choices.length!==1) throw new Error("Ambiguous or nonexistent Oslo time");
  return new Date(choices[0]).toISOString();
}
export function parseBookingSku(sku) {
  const m = String(sku||"").match(/^(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})-(\d{2})(\d{2})$/);
  if (!m) throw new Error("Booking SKU must contain date and from/to time");
  const from = m[2]+":"+m[3], to=m[4]+":"+m[5], date=m[1];
  const startUtc = osloDateTimeToUtc(date,from);
  const endUtc = osloDateTimeToUtc(date,to);
  if (Date.parse(endUtc)<=Date.parse(startUtc)) throw new Error("Invalid booking interval");
  return {date,from,to,startUtc,endUtc};
}
export function extractBookingLines(order) {
  const products = order.products || order.lineItems || [];
  const orderId = String(order.order_id || order.orderNumber || order.id || "");
  if (!/^\d+$/.test(orderId.replace(/^ord_/,""))) throw new Error("Missing order number");
  return products.flatMap((p,index)=>{
    const productId=Number(String(p.product_id ?? p.productId ?? "").replace(/^prod_/,""));
    if (!Object.hasOwn(BOOKING_TYPES,productId)) return [];
    const qty=Number(p.qty ?? p.quantity ?? 1);
    if (!Number.isInteger(qty)||qty!==1) throw new Error("Unexpected booking quantity");
    const slot=parseBookingSku(p.sku);
    const lineId=String(p.id ?? p.variant_id ?? p.variantId ?? index);
    return [{
      bookingKey:orderId+":"+lineId,orderId,lineId,productId,
      type:BOOKING_TYPES[productId],...slot
    }];
  });
}
export function bookingWindow(booking,minutesBefore=5){
  if(!Number.isInteger(minutesBefore)||minutesBefore<0||minutesBefore>15)
    throw new Error("Invalid lead time");
  return {
    allowedFromDate:new Date(Date.parse(booking.startUtc)-minutesBefore*60000).toISOString(),
    allowedUntilDate:booking.endUtc
  };
}
export function makeNukiAuthorization(booking,code){
  if (!validKeypadCode(code)) throw new Error("Invalid Nuki Keypad code");
  const window=bookingWindow(booking);
  return {
    name:("GK "+booking.bookingKey).slice(0,32),
    type:13,code:Number(code),
    remoteAllowed:false,smartActionsEnabled:false,
    allowedFromDate:window.allowedFromDate,
    allowedUntilDate:window.allowedUntilDate
  };
}
export function safeEmail(order){
  const candidates=[
    order.customer?.email, order.customer?.email_address,
    order.customer_email,order.email,order.billing?.email,
    order.billingAddress?.email
  ];
  const email=candidates.find(x=>typeof x==="string"&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
  if(!email)throw new Error("Order has no valid customer email");
  return email;
}
export function confirmedPaid(order,verifiedPaidWebhook=false){
  const status=String(order.status ?? order.paymentStatus ?? "").toLowerCase();
  if (["cancelled","canceled","refunded","voided","unpaid","pending","0"].includes(status))
    return false;
  const payment=String(order.payment?.status ?? "").toLowerCase();
  if(["cancelled","refunded","voided","pending","unpaid"].includes(payment))return false;
  if(order.paidAt || order.paid_at || order.date_paid ||
     order.paymentStatus==="paid" || payment==="paid") return true;
  // Quickbutik documents order.new specifically as a PAID event.
  // Only trust it after authenticating our secret webhook URL and
  // independently refetching the same order from Quickbutik API.
  return verifiedPaidWebhook && ["1","new","done","completed"].includes(status);
}
