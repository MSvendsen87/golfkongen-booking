// Pure server device staff PIN guard. No browser input or booking ID accepted.
export function validStaffAttempt(input){
 return input&&typeof input==="object"&&
   typeof input.code==="string"&&/^[0-9]{8}$/.test(input.code);
}
export function validCurrentStaffBooking(state){
 return state?.ok===true&&["active","warning","grace"].includes(state.state)&&
   state.resource==="hyzr"&&
   typeof state.bookingId==="string"&&
   /^[a-f0-9-]{36}$/i.test(state.bookingId);
}