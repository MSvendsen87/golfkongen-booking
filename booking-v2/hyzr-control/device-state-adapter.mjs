/**
 * Future HYZR device read model. Only a trusted, device-authenticated backend
 * may call this adapter; neither public browser data nor Admin Preview are
 * authentication for the physical PC.
 *
 * Supabase preview uses camelCase, while UI policies use snake_case.
 */
export function adaptVerifiedDeviceResponse(reply,authenticated=false){
  const fail=reason=>({status:"locked",payment_confirmed:false,reason,extension:{available:false,payment_url:""}});
  if(authenticated!==true)return fail("device_not_authenticated");
  if(!reply||reply.ok!==true)return fail("invalid_backend_reply");
  if(reply.state==="locked")return fail(reply.reason||"no_paid_booking");
  if(!["active","warning","grace","staff"].includes(reply.state))return fail("unsupported_backend_state");
  if(typeof reply.bookingId!=="string"||!reply.bookingId||
    typeof reply.endsAt!=="string"||typeof reply.lockAt!=="string"||
    typeof reply.startsAt!=="string"||typeof reply.checkedAt!=="string"||
    !["hyzr","venue"].includes(reply.resource)||
    !Number.isFinite(Date.parse(reply.endsAt))||!Number.isFinite(Date.parse(reply.lockAt))||
    !Number.isFinite(Date.parse(reply.startsAt))||!Number.isFinite(Date.parse(reply.checkedAt)))
    return fail("invalid_booking_state");
  // Do not accept arbitrary QR URLs in backend status. A separate signed
  // extension checkout offer must be issued and checked by the server.
  return {
    status:"active",
    payment_confirmed:true,
    reservation_id:reply.bookingId,
    resource:reply.resource,
    start_at:reply.startsAt,
    end_at:reply.endsAt,
    lock_at:reply.lockAt,
    checked_at:reply.checkedAt,
    screen_phase:reply.state,
    staff_mode:reply.state==="staff",
    extension:{available:false,payment_url:""}
  };
}
