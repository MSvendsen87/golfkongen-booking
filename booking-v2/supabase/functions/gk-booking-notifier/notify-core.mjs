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
 Math.abs(Date.parse(x.allowedFromDate)-(Date.parse(booking.startUtc)-900000))<60000&&
 Math.abs(Date.parse(x.allowedUntilDate)-Date.parse(booking.endUtc))<60000);
}
export function bookedNotice(b){
 return {title:"GolfKongen – ny bekreftet booking",
 message:[b.title,b.day,b.from+"–"+b.to,
 "Ordre: "+b.orderId,
 "Pilsett: "+b.rentalSets,
 "Referanse: "+b.bookingId.slice(0,8)].join("\n")};
}
export function accessMail(b,code){
 if(!validKeypadCode(code))throw Error("invalid_code");
 return {to:[b.email],subject:"Adgangskode til GolfKongen – "+b.day,
 text:["Hei!","",
 "Her er adgangskoden til din bekreftede booking:",
 b.title+" – "+b.day+" kl. "+b.from+"–"+b.to,
 "Dørkode: "+code,"",
 "Koden kan brukes fra 10 minutter før bookingstart og til bookingslutt.",
 "Tast alle seks sifrene på Nuki Keypad ved inngangsdøren.",
 "Du trenger ikke Nuki-appen.","",
 "Ordre: "+b.orderId,"Hilsen GolfKongen"].join("\n")};
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
