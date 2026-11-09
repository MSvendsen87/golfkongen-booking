/**
 * Public, credential-free UI served from the SAME Supabase origin as Auth.
 * Authentication never happens server-side here and credentials are never
 * logged or stored; browser sends them directly to Supabase Auth.
 * Checking Vipps remains a separate JWT-protected Edge Function.
 */
const body = String.raw`<!doctype html>
<html lang="nb"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>GolfKongen – Vipps-test i Supabase</title>
<style>
:root{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#182b20;background:#eff4f0;color-scheme:light}
*{box-sizing:border-box}body{margin:0;padding:32px 14px}.wrap{max-width:550px;margin:auto}
header{background:#102c21;border-radius:15px 15px 0 0;color:white;padding:21px 27px;font-weight:850;letter-spacing:.045em}
header span{color:#e3c578}
main{background:white;padding:26px 27px 32px;border:1px solid #dce6de;border-top:0;border-radius:0 0 15px 15px}
h1{font-size:23px;margin:0 0 12px}p{color:#526558;line-height:1.55;font-size:14px}
label{display:block;font-size:14px;font-weight:750;margin:16px 0 6px}
input{width:100%;font:inherit;padding:12px;border:1px solid #bccdc1;border-radius:8px;min-height:46px}
button{width:100%;border:0;border-radius:9px;background:#20563b;color:white;font:inherit;font-weight:800;padding:13px;margin-top:22px;min-height:48px;cursor:pointer}
button:disabled{opacity:.6;cursor:wait}.notice{font-size:13px;background:#f0f5f0;padding:12px 14px;border-radius:9px;margin-top:18px;color:#44564a}
.result{display:none;padding:15px;border-radius:9px;margin-top:19px;white-space:pre-line;overflow-wrap:break-word}
.result.good{display:block;color:#19532c;background:#e9f4eb}
.result.bad{display:block;color:#912c2b;background:#fff0ed}
.status{font-size:12px;color:#67786d;margin-top:13px}
</style></head>
<body><div class="wrap"><header>GOLFKONGEN <span>/ VIPPS TEST</span></header>
<main><h1>Kontroller Vipps-tilkoblingen</h1>
<p>Dette er GolfKongens sikre testside på Supabase. Den verifiserer test-salgssted <strong>321607</strong>. Den oppretter <strong>ingen betaling</strong>.</p>
<form id="f" autocomplete="off">
<label for="e">E-post for Booking 2.0 Admin</label><input id="e" type="email" autocomplete="username" spellcheck="false" required>
<label for="p">Passord for Booking 2.0 Admin</label><input id="p" type="password" autocomplete="off" required>
<button type="submit" id="b">Kontroller tilkobling</button>
</form>
<div id="r" class="result" role="status" aria-live="polite"></div>
<div class="notice">Skriv bare inn administratorinnloggingen. Ikke legg inn Vipps-nøkler, API-nøkler eller service-role-nøkkel. Passordet går direkte til Supabase Auth og lagres ikke i denne siden.</div>
<div class="status">Ingen QR, betaling eller endringer i bookingsystemet foretas.</div>
</main></div>
<script nonce="--NONCE--">
"use strict";
const pub="sb_publishable_XkYEuhPUH1lLmu8EVJM5Nw_ptPirbYq";
const form=document.getElementById("f"), password=document.getElementById("p"),
      result=document.getElementById("r"),button=document.getElementById("b");
const descriptions={
 authentication_required:"Admin-påloggingen kunne ikke verifiseres.",
 admin_only:"Denne kontoen har ikke administratorrettigheter i Booking 2.0.",
 test_credentials_not_configured:"En eller flere Vipps-testnøkler mangler eller har feil format i Supabase Testing.",
 vipps_auth_failed:"Vipps avviste testnøklene eller salgsstedet. Kontrollér MSN 321607 og at testnøkler er brukt.",
 vipps_token_invalid:"Vipps svarte, men uten gyldig tilgangstoken.",
 vipps_unavailable:"Vipps-testserveren kunne ikke nås.",
 server_not_configured:"Supabase-funksjonen mangler serverkonfigurasjon.",
 origin_not_allowed:"Testserveren avviste sidens opprinnelse."
};
function show(ok,message,details){
 result.className="result "+(ok?"good":"bad");
 result.textContent=message+(details?"\n"+details:"");
}
async function readJson(resp){
 try{return await resp.json();}catch{return {error:"invalid_json_response"};}
}
form.addEventListener("submit",async ev=>{
 ev.preventDefault();
 button.disabled=true;button.textContent="Kontrollerer …";result.className="result";
 const email=document.getElementById("e").value.trim();
 const pw=password.value;password.value="";
 try{
  const response=await fetch("/auth/v1/token?grant_type=password",{
   method:"POST",headers:{"Content-Type":"application/json","apikey":pub},
   body:JSON.stringify({email,password:pw}),cache:"no-store",credentials:"omit"
  });
  const login=await readJson(response);
  if(!response.ok||typeof login.access_token!=="string"){
   const code=String(login.error_code||login.code||"authentication_failed");
   show(false,"Innlogging feilet ("+response.status+")",
       "Supabase: "+code+". Kontroller at du bruker en bekreftet Booking 2.0-adminbruker.");
   return;
  }
  const check=await fetch("/functions/v1/gk2-vipps-test-connection",{
   method:"GET",headers:{"Authorization":"Bearer "+login.access_token,"apikey":pub},
   cache:"no-store",credentials:"omit"
  });
  const data=await readJson(check);
  if(check.ok&&data.ok===true&&data.connected===true&&
     data.environment==="test"&&data.msn==="321607"&&
     data.paymentCreationEnabled===false&&data.bookingMutationEnabled===false){
    show(true,"Vipps TEST: TILKOBLET","Testmiljø 321607 godkjente tilgangsnøklene. Ingen betaling opprettet.");
  }else{
    const code=String(data.error||"HTTP_"+check.status);
    show(false,"Tilkoblingen ble ikke godkjent: "+code,descriptions[code]||("HTTP "+check.status+". Send kun denne feilkoden."));
  }
 }catch(error){
  show(false,"Nettleseren fikk ikke kontakt","Mulig nettverksfeil. Ingen betaling forsøkt. Feil: "+String(error?.name||"ukjent"));
 }finally{button.disabled=false;button.textContent="Kontroller tilkobling";}
});
</script></body></html>`;
Deno.serve((req:Request)=>{
 if(req.method!=="GET")return new Response("Method Not Allowed",{status:405,headers:{"allow":"GET"}});
 if(new URL(req.url).pathname!=="/gk2-vipps-test-ui")
   return new Response("Not Found",{status:404});
 const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
 const nonce=[...bytes].map(x=>x.toString(16).padStart(2,"0")).join("");
 const csp="default-src 'none'; base-uri 'none'; form-action 'none'; "+
           "script-src 'nonce-"+nonce+"'; style-src 'unsafe-inline'; "+
           "connect-src 'self'; frame-ancestors 'none'; upgrade-insecure-requests";
 return new Response(body.replace("--NONCE--",nonce),{status:200,headers:{
  "content-type":"text/html; charset=utf-8","cache-control":"no-store, max-age=0",
  "content-security-policy":csp,"referrer-policy":"no-referrer",
  "x-content-type-options":"nosniff","x-frame-options":"DENY"
 }});
});
