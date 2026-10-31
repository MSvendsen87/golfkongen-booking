// Signed, time-limited internal cleanup request. Reuses the preconfigured
// Quickbutik integration secret for HMAC key derivation; never transmits the key.
const textEncoder=new TextEncoder();
const DOMAIN="gk2-booking-confirmed-notifications-key-v1";
const endpoint="POST:/internal/dispatch:";
const toHex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,"0")).join("");
const fromHex=hex=>new Uint8Array(hex.match(/.{2}/g).map(x=>parseInt(x,16)));
async function keyForCleanup(apiKey){
 const root=await crypto.subtle.importKey("raw",textEncoder.encode(apiKey),
  {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const derived=await crypto.subtle.sign("HMAC",root,textEncoder.encode(DOMAIN));
 return await crypto.subtle.importKey("raw",derived,
  {name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
}
export async function signDispatchRequest(apiKey,timestamp){
 if(typeof apiKey!=="string"||apiKey.length<20||
 typeof timestamp!=="string"||!/^[0-9]{10}$/.test(timestamp))
  throw Error("invalid_cleanup_signing_input");
 const key=await keyForCleanup(apiKey);
 return toHex(await crypto.subtle.sign("HMAC",key,textEncoder.encode(endpoint+timestamp)));
}
export async function verifyDispatchRequest({
 apiKey,timestamp,signature,nowMs=Date.now()
}={}){
 if(typeof apiKey!=="string"||apiKey.length<20||
 typeof timestamp!=="string"||!/^[0-9]{10}$/.test(timestamp)||
 typeof signature!=="string"||!/^[0-9a-f]{64}$/.test(signature)||
 !Number.isFinite(nowMs)||Math.abs(nowMs-Number(timestamp)*1000)>120000)
  return false;
 try{
  const key=await keyForCleanup(apiKey);
  return await crypto.subtle.verify("HMAC",key,fromHex(signature),
   textEncoder.encode(endpoint+timestamp));
 }catch{return false}
}
