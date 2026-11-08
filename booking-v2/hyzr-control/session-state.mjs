/**
 * Side-effect-free GolfKongen Booking 2.0 HYZR device state calculator.
 * Not a payment processor, PC lock, Nuki controller or browser API.
 * Caller MUST authenticate device and provide server-verified reservations.
 */
const RESOURCES = new Set(["hyzr", "venue"]);
const BLOCKS = new Set(["confirmed", "held", "payment_pending"]);
const MINUTE = 60000;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)$/;
export function instant(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string" || !ISO.test(v)) return NaN;
  const x=Date.parse(v); return Number.isFinite(x) ? x : NaN;
}
export function safeCheckoutUrl(v) {
  if (typeof v!=="string" || v.length>1800) return false;
  try {
    const x=new URL(v);
    return x.protocol==="https:" && ["golfkongen.no","www.golfkongen.no"].includes(x.hostname.toLowerCase()) && !x.username && !x.password;
  } catch {return false}
}
function rowWithTimes(r) {
  if(!r || !RESOURCES.has(r.resource)) return null;
  const start=instant(r.start_at),end=instant(r.end_at);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>12*60*MINUTE)return null;
  return {...r,start,end};
}
function locked(reason) {
  return {version:1,status:"locked",payment_confirmed:false,reason,extension:{available:false,payment_url:""}};
}
export function computeHyzrDeviceStatus({now,reservations=[],extensionOffer=null,maintenance=false,graceMinutes=10}={}) {
  const t=instant(now);
  if(!Number.isFinite(t))return locked("invalid_clock");
  if(maintenance)return {...locked("maintenance"),status:"maintenance"};
  if(!Array.isArray(reservations)||!Number.isInteger(graceMinutes)||graceMinutes<0||graceMinutes>10)return locked("invalid_input");
  const rows=reservations.filter(v=>RESOURCES.has(v?.resource)).map(rowWithTimes);
  if(rows.some(r=>r===null))return locked("invalid_booking_data");
  const blocks=rows.filter(r=>BLOCKS.has(r.status));
  const confirmed=blocks.filter(r=>r.status==="confirmed"&&r.payment_confirmed===true);
  const live=confirmed.filter(r=>r.start<=t&&t<r.end);
  if(live.length>1)return locked("conflicting_paid_bookings");
  let session=live[0]??null;
  if(!session)session=confirmed.filter(r=>r.end<=t&&t<r.end+graceMinutes*MINUTE).sort((a,b)=>b.end-a.end)[0]??null;
  if(!session)return locked("no_confirmed_paid_booking");
  if(blocks.some(r=>r.id!==session.id&&r.start<session.end&&r.end>session.start))return locked("overlapping_reservations");
  const upcoming=blocks.filter(r=>r.id!==session.id&&r.start>=session.end).sort((a,b)=>a.start-b.start)[0]??null;
  const lockAt=Math.min(session.end+graceMinutes*MINUTE,upcoming?.start??Infinity);
  if(t>=lockAt)return locked("booking_finished");
  const e=extensionOffer??{},expires=instant(e.expires_at),mins=Number(e.minutes);
  const canExtend=t<lockAt&&e.available===true&&e.reservation_id===session.id&&Number.isFinite(expires)&&expires>t&&
    Number.isInteger(mins)&&mins>=30&&mins<=240&&mins%30===0&&safeCheckoutUrl(e.payment_url)&&
    (!upcoming||session.end+mins*MINUTE<=upcoming.start);
  return {version:1,status:"active",payment_confirmed:true,reservation_id:session.id,
    resource:session.resource,start_at:new Date(session.start).toISOString(),end_at:new Date(session.end).toISOString(),
    lock_at:new Date(lockAt).toISOString(),remaining_seconds:Math.max(0,Math.ceil((session.end-t)/1000)),
    screen_phase:t>=session.end?"grace":session.end-t<=4*MINUTE?"warning":"active",
    extension:{available:canExtend,payment_url:canExtend?e.payment_url:""}};
}
