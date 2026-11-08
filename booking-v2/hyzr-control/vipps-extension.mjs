/**
 * Construct Vipps ePayment request data only. No network, secrets, captures,
 * QR generation or booking mutations. Server must first lock a real timeslot.
 * Docs: https://developer.vippsmobilepay.com/docs/APIs/epayment-api/api-guide/operations/create/
 */
export function buildVippsBookingPayment({
  reference,amountOre,extraMinutes,kind="extension",channel="QR",returnUrl
}={}){
  if(typeof reference!=="string"||!/^[A-Za-z0-9-]{8,64}$/.test(reference))
    throw Error("invalid_reference");
  if(!Number.isSafeInteger(amountOre)||amountOre<100||amountOre>100000000)
    throw Error("amount_not_supported_by_vipps");
  if(!["extension","booking"].includes(kind))throw Error("invalid_booking_kind");
  if(!["QR","WEB_REDIRECT"].includes(channel))throw Error("invalid_channel");
  if(!Number.isInteger(extraMinutes)||extraMinutes<30||extraMinutes>240||extraMinutes%30!==0)
    throw Error("invalid_booking_duration");
  if(channel==="WEB_REDIRECT"&&!returnUrl)throw Error("return_url_required");
  if(returnUrl!==undefined){
    if(typeof returnUrl!=="string"||returnUrl.length>1500)throw Error("invalid_return_url");
    const u=new URL(returnUrl);
    if(u.protocol!=="https:"||!["golfkongen.no","www.golfkongen.no"].includes(u.hostname)||
       u.username||u.password)throw Error("invalid_return_url");
  }
  const request={
    userFlow:channel,
    amount:{currency:"NOK",value:amountOre},
    paymentMethod:{type:"WALLET"},
    reference,
    paymentDescription:kind==="extension"?
      "GolfKongen HYZR – forlengelse "+extraMinutes+" min":
      "GolfKongen HYZR – booking "+extraMinutes+" min",
    customerInteraction:channel==="QR"?"CUSTOMER_PRESENT":undefined,
    qrFormat:channel==="QR"?{format:"IMAGE/SVG+XML"}:undefined,
    returnUrl
  };
  return JSON.parse(JSON.stringify(request));
}
