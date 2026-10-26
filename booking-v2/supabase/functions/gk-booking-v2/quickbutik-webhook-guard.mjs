// Booking 2.0: verifies Quickbutik GET webhook source before fetching an order.
// No money/booking effects. Shared secret belongs only in server environment.
// Quickbutik order.new contains an order_id; the order itself must ALWAYS be
// reread via the server-side Quickbutik API and matched to a prior checkout hold.
const ORDER=/^[1-9][0-9]{0,8}$/;
const EVENTS=new Set(['order.new','order.cancelled']);
export async function verifyQuickbutikWebhook(urlString, secret){
 const deny=(reason)=>({ok:false,reason});
 if(typeof secret!=='string'||secret.length<16)return deny('webhook_secret_not_configured');
 let url;
 try{url=new URL(urlString)}catch{return deny('invalid_url')}
 const params=url.searchParams;
 for(const field of ['event_type','order_id','securityhash']){
  if(params.getAll(field).length!==1)return deny('missing_or_repeated_parameter');
 }
 const eventType=params.get('event_type');
 const orderNumber=params.get('order_id');
 const received=params.get('securityhash');
 if(!EVENTS.has(eventType)||!ORDER.test(orderNumber||''))return deny('invalid_webhook_event');
 if(typeof received!=='string'||received.length>512||received.length===0)return deny('webhook_not_authorized');
 const encoder=new TextEncoder();
 const [a,b]=await Promise.all([
  crypto.subtle.digest('SHA-256',encoder.encode(secret)),
  crypto.subtle.digest('SHA-256',encoder.encode(received))
 ]);
 let difference=0;
 const da=new Uint8Array(a),db=new Uint8Array(b);
 for(let i=0;i<da.length;i++)difference|=da[i]^db[i];
 if(difference!==0)return deny('webhook_not_authorized');
 return {ok:true,eventType,orderNumber};
}
