import {createKeypadCode,validKeypadCode,makeNukiAuthorization,osloDateTimeToUtc} from "./booking-access.mjs";
export const LOCK_ID=22722489119;
export function timeHHMM(mins){
 if(!Number.isInteger(mins)||mins<0||mins>1439)throw Error("bad_minutes");
 return String(Math.floor(mins/60)).padStart(2,"0")+":"+String(mins%60).padStart(2,"0");
}
const titles={hyzr:"HYZR simulator",dart_a:"Dart bane A",dart_b:"Dart bane B",venue:"Hele lokalet"};
export function checkedBooking(data){
 if(!data||typeof data!=="object"||!Object.hasOwn(titles,data.resource)||
 !/^\d{4}-\d{2}-\d{2}$/.test(data.day||"")||
 !/^[a-f0-9-]{36}$/i.test(data.bookingId||"")||
 !/^[1-9][0-9]{0,8}$/.test(data.orderId||"")||
 !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email||"")||
 !Number.isInteger(data.startMin)||!Number.isInteger(data.endMin)||
 data.endMin<=data.startMin||data.endMin>1439||
 data.startMin%30!==0||data.endMin%30!==0||
 !Number.isInteger(data.rentalSets)||data.rentalSets<0||data.rentalSets>6)
 throw Error("invalid_verified_booking_outbox");
 const from=timeHHMM(data.startMin),to=timeHHMM(data.endMin);
 const startUtc=osloDateTimeToUtc(data.day,from);
 const endUtc=osloDateTimeToUtc(data.day,to);
 if(Date.parse(endUtc)<=Date.parse(startUtc))throw Error("invalid_oslo_booking_time");
 const name="GK2-"+data.bookingId.replace(/-/g,"").slice(0,16);
 return {...data,from,to,startUtc,endUtc,name,title:titles[data.resource]};
}
export function nukiPayload(booking,code){
 if(!validKeypadCode(code))throw Error("invalid_code");
 return {...makeNukiAuthorization({bookingKey:booking.bookingId,startUtc:booking.startUtc,endUtc:booking.endUtc},code),
 name:booking.name,smartlockIds:[LOCK_ID]};
}
export function matchingNukiAuth(auths,booking,code){
 if(!Array.isArray(auths))throw Error("nuki_authorizations_unavailable");
 return auths.find(x=>Number(x.type)===13&&
 String(x.smartlockId)===String(LOCK_ID)&&
 (x.name===booking.name||x.name===booking.name.slice(0,20))&&String(x.code)===String(Number(code))&&
 x.allowedFromDate&&x.allowedUntilDate&&
 [600000,900000].some(leadMs=>
 Math.abs(Date.parse(x.allowedFromDate)-(Date.parse(booking.startUtc)-leadMs))<60000)&&
 Math.abs(Date.parse(x.allowedUntilDate)-Date.parse(booking.endUtc))<60000);
}
export function bookedNotice(b){
 return {title:"GolfKongen – ny bekreftet booking",
 message:[b.title,b.day,b.from+"–"+b.to,
 "Kunde: "+(b.customerName||b.email),
 "Ordre: "+b.orderId,
 "Pilsett: "+b.rentalSets,
 "Referanse: "+b.bookingId.slice(0,8)].join("\n")};
}
export function accessMail(b,code){
 if(!validKeypadCode(code))throw Error("invalid_code");
 const clean=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
  .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
 const rows=[["Aktivitet",b.title],["Dato",b.day],
  ["Tid",b.from+"–"+b.to],["Ordre",b.orderId]];
 const html="<div style='margin:0;padding:30px 14px;background:#f3f5f0;font-family:Arial,sans-serif;color:#16221a'>"+
  "<div style='max-width:570px;margin:auto;background:white;border-radius:18px;overflow:hidden'>"+
  "<div style='padding:26px 30px;background:#1e3b29;color:#fff'>"+
  "<div style='font-weight:bold;font-size:15px;letter-spacing:2px'>GOLFKONGEN</div>"+
  "<h1 style='font-size:28px;line-height:1.3;margin:16px 0 0;color:#fff'>Booking bekreftet!</h1></div>"+
  "<div style='padding:28px 30px'>"+
  "<p>Vi gleder oss til å ønske deg velkommen. Her finner du informasjonen om bookingen din.</p>"+
  "<table style='width:100%;border-collapse:collapse'>"+
  rows.map(([name,value])=>"<tr><td style='padding:9px 0;border-bottom:1px solid #e4e9e2;color:#526256'>"+clean(name)+
  "</td><td style='padding:9px 0;text-align:right;border-bottom:1px solid #e4e9e2;font-weight:600'>"+clean(value)+"</td></tr>").join("")+
  "</table><div style='background:#eff5eb;border:1px solid #cddbc8;border-radius:12px;text-align:center;margin:25px 0;padding:20px'>"+
  "<div style='font-size:13px;color:#516a54'>DIN PERSONLIGE DØRKODE</div>"+
  "<div style='font-size:37px;letter-spacing:8px;font-weight:800;color:#1e3b29;margin:9px 0'>"+clean(code)+"</div>"+
  "<div style='font-size:13px'>Kan brukes fra <b>10 minutter før</b> bookingstart til bookingslutt.</div>"+
  "</div><p>Tast alle seks sifrene på Nuki Keypad ved inngangsdøren. Du trenger ikke Nuki-appen.</p>"+
  "<p>Bruk kun innesko eller sokker ved dart og simulator. Den som booker er ansvarlig for sine gjester.</p>"+
  "<p style='color:#516a54;font-size:13px'>Spørsmål? Svar på e-posten eller skriv til post@golfkongen.no.</p>"+
  "</div></div></div>";
 return {to:[b.email],subject:"Booking bekreftet – GolfKongen – "+b.day,
 text:["Hei!","",
 "Bookingen hos GolfKongen er bekreftet.",
 b.title+" – "+b.day+" kl. "+b.from+"–"+b.to,
 "Dørkode: "+code,"",
 "Koden kan brukes fra 10 minutter før bookingstart og til bookingslutt.",
 "Tast alle seks sifrene på Nuki Keypad ved inngangsdøren.",
 "Du trenger ikke Nuki-appen.",
 "Bruk innesko eller sokker ved dart og simulator.","",
 "Ordre: "+b.orderId,"Hilsen GolfKongen"].join("\n"),
 html};
}
export async function encryptAccessCode(code,keyBase64){
 if(!validKeypadCode(code))throw Error("invalid_code");
 const raw=Uint8Array.from(atob(keyBase64||""),x=>x.charCodeAt(0));
 if(raw.length!==32)throw Error("missing_code_encryption_key");
 const key=await crypto.subtle.importKey("raw",raw,{name:"AES-GCM"},false,["encrypt"]);
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const result=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(code)));
 return btoa(String.fromCharCode(...iv,...result));
}
export async function decryptAccessCode(encoded,keyBase64){
 const raw=Uint8Array.from(atob(keyBase64||""),x=>x.charCodeAt(0));
 if(raw.length!==32)throw Error("missing_code_encryption_key");
 const data=Uint8Array.from(atob(encoded),x=>x.charCodeAt(0));
 const key=await crypto.subtle.importKey("raw",raw,{name:"AES-GCM"},false,["decrypt"]);
 const bytes=await crypto.subtle.decrypt({name:"AES-GCM",iv:data.slice(0,12)},key,data.slice(12));
 const code=new TextDecoder().decode(bytes);
 if(!validKeypadCode(code))throw Error("decrypted_code_invalid");
 return code;
}
export {createKeypadCode};
