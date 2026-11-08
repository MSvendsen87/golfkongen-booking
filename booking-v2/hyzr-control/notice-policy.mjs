/** Display-only policy. Booking timers and locks are server controlled. */
export function deriveHyzrScreen(bookingState, dismissed = {}) {
  if (!bookingState || bookingState.status !== "active") {
    return {access:"locked",notice:null,dismissible:false,showGraceCountdown:false};
  }
  const id=bookingState.reservation_id;
  if (typeof id!=="string" || !id) {
    return {access:"locked",notice:null,dismissible:false,showGraceCountdown:false};
  }
  if (bookingState.screen_phase==="staff") {
    return {access:"staff",notice:null,dismissible:false,showGraceCountdown:false};
  }
  if (bookingState.screen_phase==="warning") {
    return {access:"active",notice:dismissed.warning===id?null:"four_minute_warning",dismissible:true,showGraceCountdown:false};
  }
  if (bookingState.screen_phase==="grace") {
    return {access:"active",notice:dismissed.expired===id?null:"booking_expired",dismissible:true,showGraceCountdown:false};
  }
  return {access:"active",notice:null,dismissible:false,showGraceCountdown:false};
}
export function acknowledgeHyzrNotice(bookingState,dismissed={}) {
  const id=bookingState?.reservation_id;
  if (typeof id!=="string" || !id || bookingState?.status!=="active") return dismissed;
  if (bookingState.screen_phase==="warning") return {...dismissed,warning:id};
  if (bookingState.screen_phase==="grace") return {...dismissed,expired:id};
  return dismissed;
}
