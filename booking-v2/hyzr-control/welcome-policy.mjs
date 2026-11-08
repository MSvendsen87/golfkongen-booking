/**
 * Booking-triggered welcome policy (no Windows/HTTP side effects).
 * Only accept a server-verified active booking, not merely Windows startup.
 * The PC client must remember shown reservation IDs for this process/session.
 */
export function deriveWelcome(state, shownBookingIds=[]) {
  const id=state?.reservation_id;
  const trusted=state?.status==="active" && state?.payment_confirmed===true;
  if(!trusted||typeof id!=="string"||!id||shownBookingIds.includes(id))
    return {show:false};
  // A late boot/reconnect must not create a welcome during a warning/grace period.
  if(!["active","staff"].includes(state.screen_phase))
    return {show:false};
  return {
    show:true,
    reservation_id:id,
    autoCloseMs:8000,
    hasPaymentQr:false,
    heading:"Velkommen til GolfKongen!",
    note:"HYZR er klar. Bruk kun rene disker som ikke har vært brukt ute. Egne disker må ha refleks."
  };
}
export function noteWelcomeShown(shownBookingIds=[],reservationId) {
  if(typeof reservationId!=="string"||!reservationId)return [...shownBookingIds];
  return [...new Set([...shownBookingIds,reservationId])];
}
