/* Staging-only read-only Quickbutik V1 order audit, never confirms bookings. */
const ORDER_ID_RE=/^(?:ord_)?([1-9][0-9]{0,8})$/;
function extractRows(body){
 if(Array.isArray(body))return body;
 if(body && Array.isArray(body.orders))return body.orders;
 if(body && Array.isArray(body.data))return body.data;
 if(body && typeof body==='object' && body.order_id!==undefined)return [body];
 return [];
}
export function summarizeV1Order(payload, id){
 const m=ORDER_ID_RE.exec(String(id||''));
 if(!m)throw new Error('invalid_order_number');
 const rows=extractRows(payload).filter(r=>r && String(r.order_id)===m[1]);
 if(rows.length!==1)throw new Error(rows.length?'ambiguous_order':'order_not_found');
 const order=rows[0], items=Array.isArray(order.products)?order.products:[];
 const state=Object.freeze({'-1':'cancelled','0':'unpaid','1':'paid','2':'fulfilled'});
 const orderState=state[String(order.status)]||'unknown';
 return Object.freeze({
  orderNumber:m[1],
  // V1 numeric state uses the documented map, but state alone NEVER authorizes a booking.
  legacyStatus:String(order.status??'unknown'),
  orderState,
  paidVerified:false,
  paymentStatusFromV1Only:orderState==='paid'||orderState==='fulfilled',
  totalAmount:typeof order.total_amount==='string' ? order.total_amount : null,
  containsBooking2Product:items.some(x=>Number(x?.product_id)>=1474&&Number(x?.product_id)<=1506),
  products:items.slice(0,12).map(x=>({productId:Number(x?.product_id)||null,sku:String(x?.sku||'').slice(0,90),quantity:Number(x?.qty)||0})),
  notice:'Read-only audit. Raw V1 status is NOT booking authorization. Never use this result to confirm a reservation.'
 });
}
export async function loadV1OrderRecord(orderNumber,{apiKey,fetchImpl=fetch}={}){
 const m=ORDER_ID_RE.exec(String(orderNumber||''));
 if(!m)throw new Error('invalid_order_number');
 if(typeof apiKey!=='string'||apiKey.length<10)throw new Error('quickbutik_key_not_configured');
 const key=apiKey.trim();
 const url='https://api.quickbutik.com/v1/orders?order_id='+encodeURIComponent(m[1])+'&include_details=true&limit=2';
 const response=await fetchImpl(url,{method:'GET',headers:{
  'Authorization':'Basic '+btoa(key+':'+key),
  'Accept':'application/json'
 },redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new Error('quickbutik_order_api_unavailable');
 const body=await response.json();
 const rows=extractRows(body).filter(r=>r&&String(r.order_id)===m[1]);
 if(rows.length!==1)throw new Error(rows.length?'ambiguous_order':'order_not_found');
 return rows[0]; // SERVER ONLY: contains customer identity, never expose to client.
}
export async function auditQuickbutikOrder(orderNumber,options={}){
 const record=await loadV1OrderRecord(orderNumber,options);
 return summarizeV1Order(record,orderNumber);
}
