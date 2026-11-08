/** 
 * Display-only policy. Booking timers, lock events and payments are server controlled.
 * Dismissal belongs to one specific reservation AND its paid end time.
 * A later paid extension to the same reservation must show a fresh warning.
 */
function noticeKey(state){
  if (typeof state?.reservation_id!=="string" || !state.reservation_id ||
      typeof state?.end_at!=="string" || !state.end_at)return null;
  return JSON.stringify([state.reservation_id,state.end_at]);
}
export function deriveHyzrScreen(bookingState, dismissed = {}) {
  if (!bookingState || bookingState.status !== "active") {
    return {access:"locked",notice:null,dismissible:false,showGraceCountdown:false};
  }
  const key=noticeKey(bookingState);
  if (!key) {
    return {access:"locked",notice:null,dismissible:false,showGraceCountdown:false};
  }
  if (bookingState.screen_phase==="staff") {
    return {access:"staff",notice:null,dismissible:false,showGraceCountdown:false};
  }
  if (bookingState.screen_phase==="warning") {
    return {access:"active",notice:dismissed.warning===key?null:"four_minute_warning",dismissible:true,showGraceCountdown:false};
  }
  if (bookingState.screen_phase==="grace") {
    return {access:"active",notice:dismissed.expired===key?null:"booking_expired",dismissible:true,showGraceCountdown:false};
  }
  return {access:"active",notice:null,dismissible:false,showGraceCountdown:false};
}
export function acknowledgeHyzrNotice(bookingState,dismissed={}) {
  const key=noticeKey(bookingState);
  if (!key || bookingState?.status!=="active") return dismissed;
  if (bookingState.screen_phase==="warning") return {...dismissed,warning:key};
  if (bookingState.screen_phase==="grace") return {...dismissed,expired:key};
  return dismissed;
}
