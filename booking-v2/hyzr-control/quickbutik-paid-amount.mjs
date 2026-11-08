/**
 * Verify the net amount of a paid HYZR booking using Quickbutik V2.
 * This only produces a proof candidate. No DB update is made by this module.
 * Never use a product catalog price or the gross order value as net paid.
 */
const validOre = x => Number.isSafeInteger(x) && x>=0 && x<=100000000;
const normEmail = s => typeof s==="string"?s.trim().toLowerCase():"";
export function verifiedQuickbutikAmount(order,booking) {
 const reject=reason=>({verified:false,reason});
 if(!order||!booking||typeof order!=="object"||typeof booking!=="object")
    return reject("missing_data");
 const id=String(booking.quickbutik_order_id||"");
 if(!/^[1-9][0-9]{0,8}$/.test(id) ||
    order.id!=="ord_"+id || String(order.orderNumber)!==id)
    return reject("order_mismatch");
 if(order.paymentStatus!=="paid"||order.currency!=="NOK")
    return reject("not_paid_in_nok");
 const customerEmail=normEmail(order.customer?.email);
 const bookedEmail=normEmail(booking.customer_email);
 if(!customerEmail||!bookedEmail||customerEmail!==bookedEmail)
    return reject("customer_mismatch");
 if(booking.resource!=="hyzr" || booking.status!=="confirmed" ||
    booking.verified_paid_at==null)
    return reject("unverified_booking");
 if(!Array.isArray(order.refunds)||order.refunds.length!==0)
    return reject("refund_or_unknown_refunds");
 const money=order.amounts;
 if(!money||!validOre(money.paid)||!validOre(money.total)||
    !validOre(money.subtotal)||!validOre(money.discount)||!validOre(money.shipping)||
    money.paid!==money.total || money.shipping!==0 ||
    money.subtotal + money.shipping - money.discount !== money.total)
    return reject("inconsistent_net_paid");
 const expectedSku=[booking.slot_date,
    String(Math.floor(booking.start_min/60)).padStart(2,"0")+
    String(booking.start_min%60).padStart(2,"0"),
    String(Math.floor(booking.end_min/60)).padStart(2,"0")+
    String(booking.end_min%60).padStart(2,"0")].join("-");
 if(!Array.isArray(order.lineItems)||order.lineItems.length!==1 ||
    order.lineItems[0].sku!==expectedSku ||
    order.lineItems[0].quantity!==1 ||
    !/^prod_1(?:47[4-9]|4[89][0-9]|50[0-6])$/.test(String(order.lineItems[0].productId||"")))
    return reject("wrong_booking_product");
 if(booking.paid_ore!==null&&booking.paid_ore!==undefined&&booking.paid_ore!==money.paid)
    return reject("already_recorded_amount_differs");
 return {verified:true,amountOre:money.paid,orderId:id,resource:"hyzr"};
}
