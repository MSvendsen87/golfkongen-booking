import {
  createKeypadCode,validKeypadCode,extractBookingLines,safeEmail,
  confirmedPaid,makeNukiAuthorization
} from "./booking-access.mjs";

const QB_API = "https://api.quickbutik.com/v1/orders";
const NUKI_API = "https://api.nuki.io";
const json = (body,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{"content-type":"application/json","cache-control":"no-store"}
});
function must(env,key){if(!env[key])throw new Error("Missing "+key);return env[key];}
async function quickbutikOrder(env,id){
  const url=new URL(QB_API);
  url.searchParams.set("order_id",String(id).replace(/^ord_/,""));
  url.searchParams.set("include_details","true");
  const auth=btoa(must(env,"QUICKBUTIK_API_KEY")+":"+env.QUICKBUTIK_API_KEY);
  const response=await fetch(url,{headers:{"Authorization":"Basic "+auth}});
  if(!response.ok)throw new Error("Quickbutik order fetch HTTP "+response.status);
  const data=await response.json();
  const list=Array.isArray(data)?data:Array.isArray(data.orders)?data.orders: [data];
  const order=list.find(o=>String(o.order_id??o.orderNumber??o.id??"").replace(/^ord_/,"")===String(id).replace(/^ord_/,""));
  if(!order)throw new Error("Order not found in verified Quickbutik API response");
  return order;
}
async function quickbutikRecent(env){
  const url=new URL(QB_API);
  url.searchParams.set("include_details","true");
  url.searchParams.set("from_date_paid",String(Math.floor(Date.now()/1000)-36*3600));
  url.searchParams.set("limit","100");
  const k=must(env,"QUICKBUTIK_API_KEY");
  const response=await fetch(url,{headers:{"Authorization":"Basic "+btoa(k+":"+k)}});
  if(!response.ok)throw new Error("Quickbutik reconciliation HTTP "+response.status);
  const data=await response.json();
  return Array.isArray(data)?data:Array.isArray(data.orders)?data.orders:[];
}
async function nuki(env,method,path,body){
  const response=await fetch(NUKI_API+path,{
    method,headers:{"Authorization":"Bearer "+must(env,"NUKI_API_TOKEN"),
      "Content-Type":"application/json","Accept":"application/json"},
    body:body===undefined?undefined:JSON.stringify(body)
  });
  if(!response.ok)throw new Error("Nuki "+method+" HTTP "+response.status);
  if(response.status===204)return null;
  const raw=await response.text();
  return raw?JSON.parse(raw):null;
}
async function authorizations(env){
  const data=await nuki(env,"GET","/smartlock/"+encodeURIComponent(must(env,"NUKI_LOCK_ID"))+"/auth");
  if(Array.isArray(data))return data;
  if(Array.isArray(data?.data))return data.data;
  throw new Error("Unexpected Nuki authorizations response");
}
function findAuth(list,row,code){
  return list.find(a=>a.type==13 && String(a.name)===row.auth_name &&
    String(a.code)===String(code));
}
function authIdentifier(auth){return auth?.id ?? auth?.authId;}
async function encryptCode(env,code){
  const raw=Uint8Array.from(atob(must(env,"CODE_KEY_BASE64")),c=>c.charCodeAt(0));
  if(raw.length!==32)throw new Error("Encryption key must be 32 bytes");
  const key=await crypto.subtle.importKey("raw",raw,"AES-GCM",false,["encrypt"]);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(code));
  return btoa(String.fromCharCode(...iv,...new Uint8Array(encrypted)));
}
async function decryptCode(env,ciphertext){
  const raw=Uint8Array.from(atob(must(env,"CODE_KEY_BASE64")),c=>c.charCodeAt(0));
  const key=await crypto.subtle.importKey("raw",raw,"AES-GCM",false,["decrypt"]);
  const encoded=Uint8Array.from(atob(ciphertext),c=>c.charCodeAt(0));
  const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:encoded.slice(0,12)},
    key,encoded.slice(12));
  const code=new TextDecoder().decode(plain);
  if(!validKeypadCode(code))throw new Error("Stored code invalid");
  return code;
}
async function queuePaidOrder(env,order,verifiedPaidWebhook=false){
  if(!confirmedPaid(order,verifiedPaidWebhook))return {queued:0,reason:"not verified paid"};
  const email=safeEmail(order);
  const lines=extractBookingLines(order);
  let queued=0;
  for(const line of lines){
    if(Date.parse(line.endUtc)<=Date.now())continue; // Never grant past bookings.
    if(Date.parse(line.startUtc)>Date.now()+45*86400000)continue;
    const code=createKeypadCode();
    const encrypted=await encryptCode(env,code);
    const authName=makeNukiAuthorization(line,code).name;
    const result=await env.DB.prepare(
      "INSERT OR IGNORE INTO booking_access (booking_key,order_id,line_id,product_id,booking_type,booking_date,booking_from,booking_to,start_utc,end_utc,customer_email,code_ciphertext,auth_name,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'queued')"
    ).bind(line.bookingKey,line.orderId,line.lineId,line.productId,line.type,line.date,
      line.from,line.to,line.startUtc,line.endUtc,email,encrypted,authName).run();
    queued+=result.meta.changes||0;
  }
  return {queued};
}
async function sendCode(env,row,code){
  const date=new Intl.DateTimeFormat("nb-NO",{dateStyle:"full",timeZone:"Europe/Oslo"})
    .format(new Date(row.start_utc));
  const message=[
    "Hei! Her er adgangskoden til bookingen på GolfKongen.",
    "",row.booking_type+" – "+date,
    "Tid: "+row.booking_from+"–"+row.booking_to,
    "Dørkode: "+code,
    "", "Tast inn alle seks sifrene på Nuki-tastaturet ved inngangsdøren.",
    "Koden fungerer fra 5 minutter før start, til bookingens slutt.",
    "Du trenger ikke Nuki-appen.",
    "", "Ordre: "+row.order_id,
    "Hilsen GolfKongen"
  ].join("\n");
  const response=await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{
      "Authorization":"Bearer "+must(env,"RESEND_API_KEY"),
      "Content-Type":"application/json",
      "Idempotency-Key":"gk-nuki-"+row.booking_key
    },
    body:JSON.stringify({
      from:must(env,"MAIL_FROM"),to:[row.customer_email],
      subject:"Adgangskode til GolfKongen – "+date,
      text:message
    })
  });
  if(!response.ok)throw new Error("Resend mail HTTP "+response.status);
  return response.json();
}
async function ensureCreated(env,row,list){
  const code=await decryptCode(env,row.code_ciphertext);
  const existing=findAuth(list,row,code);
  if(existing){
    await env.DB.prepare("UPDATE booking_access SET status='verifying',nuki_auth_id=?,updated_at=CURRENT_TIMESTAMP WHERE booking_key=?")
      .bind(String(authIdentifier(existing)??""),row.booking_key).run();
    return;
  }
  if(row.status==="creating" &&
     Date.now()-Date.parse(row.updated_at+"Z")<10*60*1000)return;
  if(row.status==="queued"){
    const claimed=await env.DB.prepare("UPDATE booking_access SET status='creating',updated_at=CURRENT_TIMESTAMP WHERE booking_key=? AND status='queued'")
      .bind(row.booking_key).run();
    if(!claimed.meta.changes)return;
  }
  if(row.status==="creating" && Date.now()-Date.parse(row.updated_at+"Z")<10*60*1000)return;
  const booking={
    bookingKey:row.booking_key,startUtc:row.start_utc,endUtc:row.end_utc
  };
  const payload=makeNukiAuthorization(booking,code);
  await nuki(env,"PUT","/smartlock/"+encodeURIComponent(must(env,"NUKI_LOCK_ID"))+"/auth",payload);
  await env.DB.prepare("UPDATE booking_access SET status='verifying',updated_at=CURRENT_TIMESTAMP WHERE booking_key=?")
    .bind(row.booking_key).run();
}
async function revoke(env,row,list){
  const code=await decryptCode(env,row.code_ciphertext);
  const auth=findAuth(list,row,code);
  if(auth){
    const id=authIdentifier(auth);
    if(id===undefined)throw new Error("Nuki auth ID unavailable for revocation");
    await nuki(env,"DELETE","/smartlock/"+encodeURIComponent(must(env,"NUKI_LOCK_ID"))+
      "/auth/"+encodeURIComponent(id));
    await env.DB.prepare("UPDATE booking_access SET status='revoking',updated_at=CURRENT_TIMESTAMP WHERE booking_key=?")
      .bind(row.booking_key).run();
  }else{
    await env.DB.prepare("UPDATE booking_access SET status='revoked',code_ciphertext='',updated_at=CURRENT_TIMESTAMP WHERE booking_key=?")
      .bind(row.booking_key).run();
  }
}
async function reconcile(env){
  const rows=await env.DB.prepare(
    "SELECT * FROM booking_access WHERE status IN ('queued','creating','verifying','sent','revoking','cancel_requested') ORDER BY created_at LIMIT 150"
  ).all();
  if(!rows.results.length)return;
  const list=await authorizations(env);
  for(const row of rows.results){
    try {
      if(row.status==="cancel_requested" || row.status==="revoking" ||
         Date.parse(row.end_utc)<Date.now()){
        await revoke(env,row,list);
        continue;
      }
      const code=await decryptCode(env,row.code_ciphertext);
      const existing=findAuth(list,row,code);
      if(row.status==="queued" || row.status==="creating"){
        await ensureCreated(env,row,list);
        continue;
      }
      if(!existing){
        // Asynchronous API accepted creation != confirmation on the physical lock.
        // Never e-mail a code without proof of a matching authorization.
        if(row.status==="verifying" &&
           Date.now()-Date.parse(row.updated_at+"Z")>30*60*1000)
          throw new Error("Code not confirmed after 30 minutes; manual review required");
        continue;
      }
      if(row.status==="verifying"){
        if(String(existing.allowedFromDate).slice(0,16)!==
             new Date(Date.parse(row.start_utc)-300000).toISOString().slice(0,16) ||
           String(existing.allowedUntilDate).slice(0,16)!==row.end_utc.slice(0,16)){
          throw new Error("Nuki time window mismatch; access email blocked");
        }
        await sendCode(env,row,code);
        await env.DB.prepare("UPDATE booking_access SET status='sent',sent_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,nuki_auth_id=? WHERE booking_key=? AND status='verifying'")
          .bind(String(authIdentifier(existing)??""),row.booking_key).run();
      }
    }catch(e){
      console.error("Booking access reconcile failed",row.booking_key,String(e.message||e));
      await env.DB.prepare("UPDATE booking_access SET last_error=?,updated_at=CURRENT_TIMESTAMP WHERE booking_key=?")
        .bind(String(e.message||e).slice(0,300),row.booking_key).run();
    }
  }
}
async function cancelOrder(env,orderId){
  const order=await quickbutikOrder(env,orderId);
  const status=String(order.status??order.fulfillmentStatus??"").toLowerCase();
  if(!["cancelled","canceled","-1","voided"].includes(status))
    throw new Error("Cancellation cannot be independently confirmed");
  await env.DB.prepare(
    "UPDATE booking_access SET status='cancel_requested',updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND status NOT IN ('revoked','cancel_requested')"
  ).bind(String(orderId).replace(/^ord_/,"")).run();
  await reconcile(env);
}
async function processWebhook(env,event,id){
  const orderId=String(id||"");
  if(!/^\d{1,12}$/.test(orderId))throw new Error("Invalid order ID");
  if(event==="order.new"){
    const order=await quickbutikOrder(env,orderId);
    await queuePaidOrder(env,order,true);
    await reconcile(env);
    // Nuki authorization registration is asynchronous. Recheck without sending before verification.
    await new Promise(resolve=>setTimeout(resolve,2500));
    await reconcile(env);
  }else if(event==="order.cancelled")await cancelOrder(env,orderId);
}
async function runCron(env){
  if(env.ACTIVE!=="true")return;
  const recent=await quickbutikRecent(env);
  for(const order of recent.slice(0,100)){
    try{await queuePaidOrder(env,order,false);}
    catch(e){console.error("Booking ingest error",String(e.message||e));}
  }
  // Correct independently-confirmed cancelled/refunded orders, even if a webhook was missed.
  const upcoming=await env.DB.prepare(
    "SELECT DISTINCT order_id FROM booking_access WHERE end_utc > ? AND status='sent' LIMIT 30"
  ).bind(new Date().toISOString()).all();
  for(const r of upcoming.results){
    try{
      const o=await quickbutikOrder(env,r.order_id);
      const status=String(o.status??o.fulfillmentStatus??"").toLowerCase();
      if(["cancelled","canceled","-1","voided","refunded"].includes(status))
        await env.DB.prepare("UPDATE booking_access SET status='cancel_requested' WHERE order_id=? AND status='sent'")
          .bind(r.order_id).run();
    }catch(e){console.error("Booking audit failed",r.order_id,String(e.message||e));}
  }
  await reconcile(env);
}
export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==="/health")return json({service:"GolfKongen Nuki booking",active:env.ACTIVE==="true"});
    if(env.ACTIVE!=="true")return json({error:"Not activated"},503);
    const secret=must(env,"QUICKBUTIK_HOOK_SECRET");
    // Quickbutik sends GET webhook events. No native HMAC is documented.
    // Restrict with a high entropy secret embedded in the webhook URL path.
    if(request.method!=="GET" ||
       url.pathname!=="/hooks/quickbutik/"+secret)return json({error:"Not found"},404);
    const event=url.searchParams.get("event_type");
    const orderId=url.searchParams.get("order_id");
    if(!["order.new","order.cancelled"].includes(event) ||
       !/^\d{1,12}$/.test(orderId||""))return json({error:"Bad event"},400);
    ctx.waitUntil(processWebhook(env,event,orderId).catch(e=>
      console.error("Nuki webhook processing failed",orderId,String(e.message||e))));
    return json({accepted:true},202);
  },
  async scheduled(_event,env,ctx){
    ctx.waitUntil(runCron(env).catch(e=>console.error("Nuki reconcile failed",String(e.message||e))));
  }
};
