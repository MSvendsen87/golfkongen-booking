/**
 * Private HYZR companion device-status contract.
 * No secrets or personal data in this response. Not a booking mutation API.
 * The caller must complete token authentication before this is invoked.
 */
const allowed = new Set(["active","warning","grace","staff"]);
const safeTs = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
export function normalizeServerStatus(record, checkedAt) {
  const locked = reason => ({ok:true,status:"locked",reason,checked_at:checkedAt});
  if(!safeTs(checkedAt))return {ok:false,status:"locked",reason:"invalid_server_time"};
  if(!record||record.ok!==true)return locked("invalid_reservation_state");
  if(record.state==="locked")return locked("no_current_verified_reservation");
  if(!allowed.has(record.state))return locked("unexpected_reservation_state");
  if(typeof record.bookingId!=="string"||!record.bookingId||
     !["hyzr","venue"].includes(record.resource)||
     !safeTs(record.startsAt)||!safeTs(record.endsAt)||!safeTs(record.lockAt)) {
    return locked("invalid_reservation_state");
  }
  const now=Date.parse(checkedAt), start=Date.parse(record.startsAt),
    end=Date.parse(record.endsAt), lock=Date.parse(record.lockAt);
  if(start>=end||end>now+24*60*60*1000||lock<=now||lock>now+24*60*60*1000) {
    return locked("invalid_reservation_deadline");
  }
  if(record.state==="grace"&&now<end) return locked("invalid_grace_phase");
  if(record.state==="warning"&&(now>=end||now<end-4*60*1000))return locked("invalid_warning_phase");
  if(record.state==="active"&&(now>=end||now<start))return locked("invalid_active_phase");
  if(record.state==="staff"&&now<start)return locked("invalid_staff_phase");
  return {
    ok:true,status:"active",payment_confirmed:true,
    reservation_id:record.bookingId,resource:record.resource,
    start_at:record.startsAt,end_at:record.endsAt,lock_at:record.lockAt,
    checked_at:checkedAt,screen_phase:record.state,
    staff_mode:record.state==="staff",
    extension:{available:false,payment_url:""}
  };
}
export function verifyHashFormat(value){
  return typeof value==="string" && /^[a-f0-9]{64}$/.test(value);
}
export function validDeviceTokenFormat(token){
  return typeof token==="string" && /^[A-Za-z0-9_-]{43,120}$/.test(token);
}
export function compareHexConstantTime(a,b){
  if(!verifyHashFormat(a)||!verifyHashFormat(b))return false;
  let mismatch=0;
  for(let i=0;i<64;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);
  return mismatch===0;
}
