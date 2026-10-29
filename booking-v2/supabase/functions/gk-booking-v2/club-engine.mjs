import {createKeypadCode,encryptAccessCode,decryptAccessCode} from "./notify-core.mjs";
import {osloDateTimeToUtc} from "./booking-access.mjs";
const env=k=>Deno.env.get(k)||"";
const emailOK=s=>typeof s==="string"&&s.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
export function eligibleMember(members,email){
 const found=members.filter(m=>String(m.email||"").trim().toLowerCase()===email);
 return found.length===1&&found[0].active===true&&Array.isArray(found[0].groups)&&found[0].groups.includes("dartklubb");
}
export function clubOrderLines(order){
 const lines=Array.isArray(order.products)?order.products:[];
 const clubs=lines.filter(x=>Number(x.product_id)===1507),sets=lines.filter(x=>Number(x.product_id)===1318);
 if(clubs.length!==1||sets.length>1||lines.length!==clubs.length+sets.length||Number(clubs[0].qty)!==1||
 !/^GK2-CLUB-20\d\d-\d\d-\d\d-[a-f0-9]{32}$/.test(String(clubs[0].sku||""))||
 (sets.length&&Number(sets[0].qty)!==1))throw Error("invalid_club_order_lines");
 return {sku:String(clubs[0].sku),seats:1,sets:sets.length,expectedOre:5000+sets.length*2500};
}
export async function clubVariant(sku,{apiKey,action="open",fetchImpl=fetch}={}){
 if(!/^GK2-CLUB-20\d\d-\d\d-\d\d-[a-f0-9]{32}$/.test(sku)||!["open","close"].includes(action)||!apiKey)throw Error("bad_club_variant");
 const headers={Authorization:"Basic "+btoa(apiKey+":"+apiKey),Accept:"application/json"};
 async function call(method,payload){
  const res=await fetchImpl("https://api.quickbutik.com/v1/products"+(method==="GET"?"?product_id=1507&include_details=true":""),{
   method,headers:{...headers,"Content-Type":"application/json"},body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(20000)});
  if(!res.ok)throw Error("club_variant_api_"+res.status);
  const result=await res.json();if(result?.success===0||result?.error)throw Error("club_variant_rejected");return result;
 }
 async function read(){const raw=await call("GET");const p=raw.product||raw;
  if(Number(p.id)!==1507||!Array.isArray(p.variants)||!String(p.sku).startsWith("GK2-CLUB"))throw Error("wrong_club_product");
  const matches=p.variants.filter(v=>v.sku===sku);if(matches.length>1)throw Error("duplicate_club_sku");return matches[0];}
 let v=await read();
 if(action==="close"&&!v)return {absent:true};
 if(!v){await call("PUT",[{product_id:1507,variants:{add:[{sku,price:50,qty:0,preorder:0,
  variant_option1_name:"Klubbkveld",variant_option1_value:sku.slice(9,19)+" 19:00–22:00 · "+sku.slice(-8)}]}}]);v=await read();}
 if(!v||Number(v.price)!==50||!Number.isSafeInteger(Number(v.id)))throw Error("club_variant_price_or_id");
 const id=Number(v.id),qty=Number(v.qty??v.stock),hidden=[true,1,"1"].includes(v.hidden);
 if(action==="open"&&!hidden&&qty===1)return {id,sku};
 if(action==="open"&&qty!==0)throw Error("club_variant_inventory");
 if(action==="close"&&hidden&&qty===0)return {id,sku};
 await call("PUT",[{product_id:1507,variant_id:id,visible:action==="open"?1:0,stock:action==="open"?1:0,disable_minusqty:"1"}]);
 const after=await read();if(!after||Number(after.id)!==id||Number(after.price)!==50||Number(after.qty??after.stock)!==(action==="open"?1:0)||
 [true,1,"1"].includes(after.hidden)!==(action==="close"))throw Error("club_variant_readback");
 return {id,sku};
}
export function setupClubEngine({db,rpc,memberSheet,reply,err,origins}){
 async function member(req){
  const token=req.headers.get("authorization")||"";if(!token.startsWith("Bearer ")||token.length>7000)return null;
  const {data,error}=await db.auth.getUser(token.slice(7));const u=data?.user;
  if(error||!u?.email_confirmed_at||!emailOK(u.email))return null;
  const list=await memberSheet("list");if(!list.ok||!Array.isArray(list.members))throw Error("member_source_unavailable");
  if(!eligibleMember(list.members,u.email.toLowerCase()))return null;return u;
 }
 async function hash(value){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env("GK2_MEMBER_SHEET_SECRET")),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,"0")).join("");
 }
 async function send(to,subject,text,id){
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+env("RESEND_API_KEY"),"Content-Type":"application/json","Idempotency-Key":id},body:JSON.stringify({from:"GolfKongen <booking@golfkongen.no>",reply_to:"post@golfkongen.no",to:[to],subject,text}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error("club_email_"+response.status);
  const result=await response.json();if(!result.id)throw Error("club_email_no_receipt");return result.id;
 }
 async function inputBody(req){
  if(Number(req.headers.get("content-length")||0)>10000)throw Error("body_too_large");
  const text=await req.text();if(text.length>10000)throw Error("body_too_large");return JSON.parse(text);
 }
 async function handle(req,path,u,origin){
  if(!path.startsWith("/club/"))return null;
  if(!origin||!origins.has(origin))return err("forbidden_checkout_origin",403,origin);
  if(req.method==="POST"&&path==="/club/login"){
   const input=await inputBody(req),email=String(input.email||"").trim().toLowerCase();if(!emailOK(email))return err("invalid_email",400,origin);
   const allowed=await rpc("gk2_club_login_attempt",{p_email_hash:await hash("email:"+email),p_ip_hash:await hash("ip:"+(req.headers.get("cf-connecting-ip")||req.headers.get("x-forwarded-for")?.split(",")[0]||"unknown"))});
   if(!allowed)return err("login_rate_limited",429,origin);
   const list=await memberSheet("list");if(!list.ok)throw Error("member_source_unavailable");
   if(eligibleMember(list.members,email)){
    const {data,error}=await db.auth.admin.generateLink({type:"magiclink",email});
    if(error||!data?.properties?.email_otp)throw Error("club_login_unavailable");
    await send(email,"Din innloggingskode til GolfKongen klubbkveld","Bekreft medlemsadressen din med denne engangskoden:\n\n"+data.properties.email_otp+"\n\nSkriv koden på klubbkveldsiden. Ikke del den med andre. Hvis du ikke ba om koden, kan du se bort fra denne e-posten.","gk2-club-login-"+crypto.randomUUID());
   }
   return reply({ok:true,message:"Hvis adressen er registrert som aktivt Dartklubb-medlem, får du en engangskode på e-post."},200,origin);
  }
  if(req.method==="GET"&&path==="/club/calendar"){
   // Server calendar dates use Europe/Oslo, independent of browser/device clock.
   const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Oslo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
   const days=[];
   for(let i=0;i<=45;i++){const d=new Date(Date.parse(today+"T12:00:00Z")+i*86400000);if(d.getUTCDay()===4){const date=d.toISOString().slice(0,10);days.push(await rpc("gk2_club_day_status",{p_day:date}));}}
   return reply({ok:true,days,priceOre:5000,rentalOre:2500,capacity:10},200,origin);
  }
  const who=await member(req);if(!who)return err("active_dart_membership_required",403,origin);
  if(req.method==="GET"&&path==="/club/me")return reply({ok:true,email:who.email},200,origin);
  if(req.method==="POST"&&path==="/club/hold"){
   const input=await inputBody(req),key=String(input.idempotencyKey||""),day=String(input.date||""),sets=Number(input.rentalSets||0);
   if(!/^[a-f0-9-]{36}$/i.test(key)||!/^20\d\d-\d\d-\d\d$/.test(day)||![0,1].includes(sets)||input.acceptedTerms!==true)return err("invalid_club_request",400,origin);
   const hold=await rpc("gk2_club_prepare_member",{p_key:key,p_day:day,p_customer:who.id,p_email:who.email,p_sets:sets});
   const opened=hold.variantId?{id:hold.variantId}:await clubVariant(hold.sku,{apiKey:env("GK2_QUICKBUTIK_API_KEY")});
   await rpc("gk2_club_opened",{p_hold:hold.id,p_variant:opened.id});
   const ready=await rpc("gk2_club_prepare_member",{p_key:key,p_day:day,p_customer:who.id,p_email:who.email,p_sets:sets});
   return reply({ok:true,holdId:hold.id,productId:1507,variantId:opened.id,sku:hold.sku,rentalSets:sets,expires:ready.expires},200,origin);
  }
  return err("not_found",404,origin);
 }
 async function nuki(method,path,data){
  const response=await fetch("https://api.nuki.io"+path,{method,headers:{Authorization:"Bearer "+env("NUKI_API_TOKEN"),"Content-Type":"application/json"},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error("club_nuki_"+response.status);if(response.status===204)return null;
  const text=await response.text();return text?JSON.parse(text):null;
 }
 async function alertAccess(day,a){
  if(a.alert_email_id)return;
  const receipt=await send("post@golfkongen.no","Klubbkveld "+day+" – adgang må kontrolleres",
   "Automatisk adgang for klubbkvelden "+day+" trenger kontroll i Nuki. Kontroller status før deltakerne kommer. Ikke opprett en ny kode før eksisterende autorisasjon er kontrollert.",
   "gk2-club-access-alert-"+day+"-"+a.generation);
  await rpc("gk2_club_access_alerted",{p_day:day,p_generation:a.generation,p_receipt:receipt});
 }
 async function process(){
  const worker=crypto.randomUUID();if(!await rpc("gk2_club_worker",{p_key:worker}))return {busy:true};
  try {
  const work=await rpc("gk2_club_maintenance",{});let closed=0,mailed=0;
  for(const item of work.leases.slice(0,10)){
   await clubVariant(item.sku,{apiKey:env("GK2_QUICKBUTIK_API_KEY"),action:"close"});
   await rpc("gk2_club_closed",{p_hold:item.holdId});closed++;
  }
  for(const day of work.dates.slice(0,3)){
   let state=await rpc("gk2_club_access_get",{p_day:day,p_ciphertext:await encryptAccessCode(createKeypadCode(),env("GK2_CODE_KEY_BASE64"))});
   const a=state.access;if(!a)continue;
   const start=osloDateTimeToUtc(day,"18:45"),end=osloDateTimeToUtc(day,"22:15");
   let raw;
   try{raw=await nuki("GET","/smartlock/22722489119/auth")}catch(error){
    if(Date.now()-Date.parse(a.updated_at)>300000)await alertAccess(day,a);
    throw error;
   }
   const auths=Array.isArray(raw)?raw:raw?.data;
   if(!Array.isArray(auths))throw Error("club_nuki_list_invalid");
   const code=await decryptAccessCode(a.ciphertext,env("GK2_CODE_KEY_BASE64"));
   const candidates=auths.filter(x=>Number(x.type)===13&&x.name===a.name);
   const found=candidates.find(x=>x.enabled!==false&&x.enabled!==0&&String(x.code)===String(Number(code))&&Date.parse(x.allowedFromDate)===Date.parse(start)&&Date.parse(x.allowedUntilDate)===Date.parse(end));
   if(state.active===0||a.status==="revoking"||Date.parse(end)<=Date.now()){
    if(candidates.length){await rpc("gk2_club_access_update",{p_day:day,p_generation:a.generation,p_status:"revoking"});await nuki("DELETE","/smartlock/auth",candidates.map(x=>String(x.id)));}
    else await rpc("gk2_club_access_update",{p_day:day,p_generation:a.generation,p_status:"revoked"});
    continue;
   }
   if(candidates.length&&!found){await rpc("gk2_club_access_update",{p_day:day,p_generation:a.generation,p_status:"manual_review"});await alertAccess(day,a);continue;}
   if(!found){
    if(a.status==="manual_review"||(a.status==="creating"&&Date.now()-Date.parse(a.updated_at)>300000)){
     if(a.status!=="manual_review")await rpc("gk2_club_access_update",{p_day:day,p_generation:a.generation,p_status:"manual_review"});
     await alertAccess(day,a);continue;
    }
    if(a.status==="prepared"){
     if(auths.some(x=>Number(x.type)===13&&String(x.code)===String(Number(code)))){await rpc("gk2_club_access_update",{p_day:day,p_generation:a.generation,p_status:"manual_review"});await alertAccess(day,a);continue;}
     await rpc("gk2_club_access_update",{p_day:day,p_generation:a.generation,p_status:"creating"});
     await nuki("PUT","/smartlock/22722489119/auth",{name:a.name,type:13,code:Number(code),remoteAllowed:false,smartActionsEnabled:false,
      allowedFromDate:start,allowedUntilDate:end,allowedWeekDays:127,allowedFromTime:0,allowedUntilTime:0,smartlockIds:[22722489119]});
    }
    continue;
   }
   await rpc("gk2_club_access_update",{p_day:day,p_generation:a.generation,p_status:"active",p_auth:String(found.id)});
   state=await rpc("gk2_club_access_get",{p_day:day,p_ciphertext:null});
   if(!state.active)continue;
   for(const recipient of state.recipients.slice(0,10)){
    const id=await send(recipient.email,"Klubbkveld "+day+" – bekreftet påmelding og adgangskode",
     "Påmeldingen din til klubbkveld i Lyngdal Dartklubb er bekreftet.\n\nDato: "+day+"\nKlubbkveld: 19:00–22:00\nOrdre: "+recipient.orderId+"\n\nFelles adgangskode denne kvelden: "+code+"\nKoden fungerer 18:45–22:15.\nKoden gjelder bare denne klubbkvelden. Ikke del den med andre.\n\nVelkommen!\nGolfKongen",
     "gk2-club-access-"+recipient.id+"-"+a.generation);
    await rpc("gk2_club_access_emailed",{p_hold:recipient.id,p_receipt:id});mailed++;
   }
  }
  return {closed,mailed};
  } finally {await rpc("gk2_club_worker",{p_key:worker,p_release:true});}
 }
 return {handle,process};
}
