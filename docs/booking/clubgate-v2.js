(async function(){
 "use strict";
 const path=String(location.pathname||"").replace(/\/$/,"");
 if(path!=="/sider/klubbkveld-lyngdal-dart")return;
 const root=document.getElementById("gk-clubgate");if(!root)return;
  (function cssOnce() {
    if (document.getElementById("gk-clubgate-css-v12")) return;

    var css =
      ":root{" +
      "--gk-bg:#0d0d0d;" +
      "--gk-card:#171717;" +
      "--gk-card2:#101010;" +
      "--gk-soft:#1f1f1f;" +
      "--gk-line:rgba(255,255,255,.10);" +
      "--gk-text:rgba(255,255,255,.94);" +
      "--gk-muted:rgba(255,255,255,.72);" +
      "--gk-ac:#2bd18b;" +
      "--gk-ac2:#7dffb8;" +
      "--gk-gold:#f0c14b;" +
      "}" +

      "#gk-clubgate{" +
      "max-width:980px;" +
      "margin:0 auto;" +
      "padding:12px;" +
      "color:var(--gk-text);" +
      "}" +

      ".gk-box{" +
      "border:1px solid var(--gk-line);" +
      "background:linear-gradient(180deg,var(--gk-card),var(--gk-card2));" +
      "border-radius:22px;" +
      "padding:14px;" +
      "box-shadow:0 18px 50px rgba(0,0,0,.35);" +
      "}" +

      ".gk-topcard{" +
      "position:relative;" +
      "overflow:hidden;" +
      "padding:16px;" +
      "border:1px solid rgba(255,255,255,.10);" +
      "border-radius:20px;" +
      "background:radial-gradient(circle at top right, rgba(43,209,139,.12), transparent 42%), linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02));" +
      "}" +

      ".gk-topgrid{" +
      "display:grid;" +
      "grid-template-columns:1fr;" +
      "gap:14px;" +
      "align-items:center;" +
      "}" +

      ".gk-logo-wrap{" +
      "display:flex;" +
      "justify-content:center;" +
      "}" +

      ".gk-logo{" +
      "width:112px;" +
      "height:112px;" +
      "object-fit:contain;" +
      "border-radius:18px;" +
      "background:#fff;" +
      "padding:8px;" +
      "box-shadow:0 10px 24px rgba(0,0,0,.28);" +
      "}" +

      ".gk-toptext{" +
      "display:flex;" +
      "flex-direction:column;" +
      "gap:10px;" +
      "min-width:0;" +
      "}" +

      ".gk-h{" +
      "font-weight:900;" +
      "font-size:24px;" +
      "line-height:1.1;" +
      "margin:0;" +
      "}" +

      ".gk-p{" +
      "margin:0;" +
      "color:var(--gk-muted);" +
      "line-height:1.45;" +
      "font-size:14px;" +
      "}" +

      ".gk-meta{" +
      "display:flex;" +
      "flex-wrap:wrap;" +
      "gap:8px;" +
      "}" +

      ".gk-chip{" +
      "display:inline-flex;" +
      "align-items:center;" +
      "justify-content:center;" +
      "min-height:36px;" +
      "padding:8px 12px;" +
      "border-radius:999px;" +
      "border:1px solid rgba(255,255,255,.10);" +
      "background:rgba(255,255,255,.05);" +
      "font-size:13px;" +
      "font-weight:800;" +
      "color:var(--gk-text);" +
      "}" +

      ".gk-chip.price{" +
      "border-color:rgba(240,193,75,.35);" +
      "background:linear-gradient(135deg, rgba(240,193,75,.18), rgba(240,193,75,.06));" +
      "color:#ffe29b;" +
      "}" +

      ".gk-top-actions{" +
      "display:flex;" +
      "flex-wrap:wrap;" +
      "gap:10px;" +
      "margin-top:2px;" +
      "}" +

      ".gk-btn{" +
      "display:inline-flex;" +
      "align-items:center;" +
      "justify-content:center;" +
      "gap:8px;" +
      "min-height:46px;" +
      "padding:12px 16px;" +
      "border-radius:14px;" +
      "border:1px solid rgba(255,255,255,.16);" +
      "background:rgba(255,255,255,.06);" +
      "color:var(--gk-text);" +
      "text-decoration:none;" +
      "font-weight:900;" +
      "cursor:pointer;" +
      "transition:transform .08s ease, opacity .15s ease;" +
      "}" +

      ".gk-btn.ok{" +
      "border-color:rgba(43,209,139,.55);" +
      "background:linear-gradient(135deg, rgba(43,209,139,.18), rgba(125,255,184,.08));" +
      "}" +

      ".gk-btn.block{" +
      "width:100%;" +
      "}" +

      ".gk-btn:active{transform:scale(.99)}" +
      ".gk-btn[disabled]{opacity:.72;cursor:default}" +

      ".gk-note{" +
      "margin-top:10px;" +
      "font-size:12px;" +
      "color:var(--gk-muted);" +
      "line-height:1.4;" +
      "}" +

      ".gk-row{" +
      "margin-top:14px;" +
      "}" +

      ".gk-section-head{" +
      "display:flex;" +
      "flex-direction:column;" +
      "gap:6px;" +
      "margin-bottom:10px;" +
      "}" +

      ".gk-section-title{" +
      "font-size:16px;" +
      "font-weight:900;" +
      "margin:0;" +
      "}" +

      ".gk-sets{" +
      "display:flex;" +
      "align-items:center;" +
      "justify-content:space-between;" +
      "gap:12px;" +
      "flex-wrap:wrap;" +
      "padding:12px;" +
      "border:1px solid var(--gk-line);" +
      "border-radius:16px;" +
      "background:rgba(255,255,255,.04);" +
      "}" +

      ".gk-sets-text{" +
      "flex:1 1 180px;" +
      "min-width:0;" +
      "}" +

      ".gk-sets-title{" +
      "font-weight:900;" +
      "font-size:15px;" +
      "margin:0 0 4px 0;" +
      "}" +

      ".gk-sets-sub{" +
      "font-size:12px;" +
      "color:var(--gk-muted);" +
      "line-height:1.35;" +
      "margin:0;" +
      "}" +

      ".gk-sets-ctrl{" +
      "display:flex;" +
      "align-items:center;" +
      "gap:10px;" +
      "margin-left:auto;" +
      "}" +

      ".gk-sets-btn{" +
      "width:42px;" +
      "height:42px;" +
      "border-radius:13px;" +
      "border:1px solid rgba(255,255,255,.18);" +
      "background:rgba(255,255,255,.06);" +
      "color:var(--gk-text);" +
      "font-weight:900;" +
      "font-size:18px;" +
      "cursor:pointer;" +
      "}" +

      ".gk-sets-val{" +
      "min-width:26px;" +
      "text-align:center;" +
      "font-weight:900;" +
      "font-size:18px;" +
      "}" +

      ".gk-sets-add{" +
      "flex:1 1 100%;" +
      "margin-top:2px;" +
      "}" +

      ".gk-list{" +
      "display:flex;" +
      "flex-direction:column;" +
      "gap:12px;" +
      "margin-top:12px;" +
      "}" +

      ".gk-card{" +
      "border:1px solid var(--gk-line);" +
      "border-radius:18px;" +
      "padding:14px;" +
      "background:linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02));" +
      "display:flex;" +
      "flex-direction:column;" +
      "gap:12px;" +
      "}" +

      ".gk-card-head{" +
      "display:flex;" +
      "flex-direction:column;" +
      "gap:8px;" +
      "}" +

      ".gk-card-title{" +
      "font-weight:900;" +
      "font-size:18px;" +
      "line-height:1.15;" +
      "}" +

      ".gk-card-meta{" +
      "display:flex;" +
      "flex-wrap:wrap;" +
      "gap:8px;" +
      "}" +

      ".gk-mini{" +
      "display:inline-flex;" +
      "align-items:center;" +
      "justify-content:center;" +
      "padding:8px 10px;" +
      "border-radius:12px;" +
      "background:rgba(255,255,255,.05);" +
      "border:1px solid rgba(255,255,255,.08);" +
      "font-size:12px;" +
      "font-weight:800;" +
      "color:var(--gk-text);" +
      "}" +

      ".gk-mini.price{" +
      "border-color:rgba(240,193,75,.30);" +
      "background:linear-gradient(135deg, rgba(240,193,75,.16), rgba(240,193,75,.06));" +
      "color:#ffe29b;" +
      "}" +

      ".gk-empty{" +
      "padding:14px;" +
      "border:1px solid var(--gk-line);" +
      "border-radius:16px;" +
      "background:rgba(255,255,255,.03);" +
      "color:var(--gk-muted);" +
      "}" +

      "@media (min-width: 760px){" +
      "#gk-clubgate{padding:16px}" +
      ".gk-box{padding:18px}" +
      ".gk-topcard{padding:20px}" +
      ".gk-topgrid{grid-template-columns:124px 1fr}" +
      ".gk-logo-wrap{justify-content:flex-start}" +
      ".gk-logo{width:124px;height:124px}" +
      ".gk-h{font-size:28px}" +
      ".gk-card{" +
      "flex-direction:row;" +
      "align-items:center;" +
      "justify-content:space-between;" +
      "}" +
      ".gk-card-head{" +
      "flex:1 1 auto;" +
      "min-width:0;" +
      "}" +
      ".gk-card-cta{" +
      "flex:0 0 190px;" +
      "display:flex;" +
      "justify-content:flex-end;" +
      "}" +
      ".gk-btn.block{" +
      "width:auto;" +
      "min-width:170px;" +
      "}" +
      "}";

    var st = document.createElement("style");
    st.id = "gk-clubgate-css-v12";
    st.appendChild(document.createTextNode(css));
    document.head.appendChild(st);
  })();


 const style=document.createElement("style");style.textContent="#gk-clubgate,#gk-clubgate *{box-sizing:border-box}#gk-clubgate{width:100%}#gk-clubgate button:disabled{opacity:.55;cursor:default}";document.head.appendChild(style);
 const API="https://eadgdcimcmfyuicizboo.supabase.co/functions/v1/gk-booking-v2";
 const KEY="sb_publishable_XkYEuhPUH1lLmu8EVJM5Nw_ptPirbYq";
 const escape=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 root.innerHTML='<div class="gk-box"><div class="gk-topcard"><h1 class="gk-h">Klubbkveld – Lyngdal Dartklubb</h1><p class="gk-p">Torsdager kl. 19:00–22:00. For aktive medlemmer av Dartklubb.</p><div class="gk-meta"><span class="gk-chip price">50 kr per person</span><span class="gk-chip">10 plasser</span><span class="gk-chip">Pilsett: +25 kr</span></div><p class="gk-note">Påmelding stenger kl. 18:30. En bekreftet påmelding sperrer lokalet for andre aktiviteter kl. 19–22. Adgangskoden gjelder kl. 18:45–22:15.</p></div><div class="gk-row" id="gk-club-identity"><form id="gk-club-login"><h2 class="gk-section-title">Bekreft medlemskapet ditt</h2><p class="gk-p">Bruk e-postadressen du er registrert med i dartklubben. Vi sender deg en engangskode.</p><label>E-post<input id="gk-club-email" type="email" autocomplete="email" required style="display:block;width:100%;padding:12px;margin:10px 0;color:#111;background:white;border-radius:8px"></label><button class="gk-btn ok" type="submit">Send engangskode</button></form><form id="gk-club-verify" hidden><label>Engangskode fra e-post<input id="gk-club-code" autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]{6,10}" required style="display:block;width:100%;padding:12px;margin:10px 0;color:#111;background:white;border-radius:8px"></label><button class="gk-btn ok" type="submit">Bekreft</button></form></div><p id="gk-club-message" class="gk-note" role="status" aria-live="polite"></p><div class="gk-row" id="gk-club-options" hidden><label><input id="gk-club-rental" type="checkbox"> Leie ett pilsett (+25 kr)</label><p><label><input id="gk-club-terms" type="checkbox"> Jeg godtar <a href="/sider/terms-and-conditions" target="_blank" rel="noopener">bookingvilkårene</a>.</label></p><p class="gk-note">Én plass per medlem. Har du allerede andre varer i handlekurven, fullfør eller tøm den først. Bruk samme e-postadresse i kassen.</p><button id="gk-club-logout" class="gk-btn" type="button">Bytt medlem / logg ut</button></div><div id="gk-club-days" class="gk-list"></div></div>';
 const $=id=>document.getElementById(id),message=t=>$("gk-club-message").textContent=t;
 let auth,who=null,busy=false,calendar=[],verifiedEmail="";
 async function api(path,body){
  const session=auth?(await auth.auth.getSession()).data.session:null;
  const res=await fetch(API+path,{method:body?"POST":"GET",headers:{"Content-Type":"application/json",apikey:KEY,...(session?{Authorization:"Bearer "+session.access_token}:{})},body:body?JSON.stringify(body):undefined,cache:"no-store"});
  const json=await res.json();if(!res.ok||!json.ok)throw Error(json.code||"request_failed");return json;
 }
 function render(){
  $("gk-club-days").innerHTML=calendar.map(day=>'<div class="gk-card"><div class="gk-card-title">'+escape(new Intl.DateTimeFormat("nb-NO",{weekday:"long",day:"numeric",month:"long"}).format(new Date(day.date+"T12:00:00Z")))+'</div><div class="gk-card-meta"><span class="gk-mini">19:00–22:00</span><span class="gk-mini price">50 kr</span><span class="gk-mini">'+escape(day.remaining)+' ledige av 10</span></div><p class="gk-p">'+escape(day.canBook?"Ledig for klubbpåmelding":day.reason==="signup_closed"?"Påmeldingen er stengt":day.reason==="club_full"?"Fullbooket":"Tidspunktet er opptatt eller stengt")+'</p><button class="gk-btn ok" data-book="'+escape(day.date)+'" '+(!who||!day.canBook||busy?'disabled':'')+'>Meld meg på</button></div>').join("");
  for(const button of root.querySelectorAll("[data-book]"))button.onclick=()=>book(button.dataset.book);
 }
 async function refresh(){const data=await api("/club/calendar");calendar=data.days;render();}
 async function check(){
  try{who=await api("/club/me");$("gk-club-identity").hidden=true;$("gk-club-options").hidden=false;message("Medlemskap bekreftet: "+who.email);}
  catch(_){who=null;$("gk-club-identity").hidden=false;$("gk-club-options").hidden=true;}
  render();
 }
 $("gk-club-login").onsubmit=async event=>{
  event.preventDefault();if(busy)return;busy=true;
  const button=event.currentTarget.querySelector("button");button.disabled=true;
  try{verifiedEmail=$("gk-club-email").value.trim().toLowerCase();const result=await api("/club/login",{email:verifiedEmail});message(result.message);$("gk-club-verify").hidden=false;$("gk-club-code").focus();}
  catch(_){message("Kunne ikke sende innloggingskode. Vent litt før du prøver igjen. Kontakt GolfKongen hvis medlemsadressen mangler.");}
  finally{busy=false;setTimeout(()=>button.disabled=false,60000);}
 };
 $("gk-club-verify").onsubmit=async event=>{
  event.preventDefault();if(busy||!auth)return;busy=true;
  try{const {error}=await auth.auth.verifyOtp({email:verifiedEmail,token:$("gk-club-code").value.trim(),type:"email"});if(error)throw error;await check();if(!who)throw Error("not_member");await refresh();}
  catch(_){message("Koden kunne ikke bekreftes, eller medlemskapet er ikke aktivt. Kontroller e-post og kode.");}
  finally{busy=false;}
 };
 $("gk-club-logout").onclick=async()=>{if(auth)await auth.auth.signOut();who=null;$("gk-club-verify").hidden=true;await check();};
 async function add(product,variant,sku){
  const data=new URLSearchParams({product_id:String(product),qty:"1",quantity:"1",eventId:"9847005",page:"product"});if(variant)data.set("variant",String(variant));
  const result=await fetch("/cart/add",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8","X-Requested-With":"XMLHttpRequest"},body:data,credentials:"same-origin"});
  if(!result.ok)throw Error("cart_failed");
  const cart=await result.json();
  const matches=cart?.items?.filter(line=>String(line?.item?.sku||"")===sku)||[];
  if(cart.success!==1||matches.length!==1||Number(matches[0].qty)!==1||![Number(product),Number(variant||product)].includes(Number(matches[0].item?.raw_id))||Boolean(Number(matches[0].is_variant))!==Boolean(variant))throw Error("cart_unverified");
  return cart;
 }
 async function book(day){
  if(busy||!who)return;if(!$("gk-club-terms").checked){message("Godta bookingvilkårene før påmelding.");return;}
  busy=true;render();
  const rental=$("gk-club-rental").checked?1:0,cache="gk2-club-hold-"+day+"-"+who.email;
  try{
   // Keep this checkout isolated: webhook only accepts club seat plus optional pilsett.
   const cart=await fetch("/cart/index",{credentials:"same-origin",cache:"no-store"}).then(r=>r.text());
   if(/name=["'](?:quantity|qty)\[|name=["']quantity["']|class=["'][^"']*cart-item/i.test(cart))throw Error("cart_not_empty");
   let saved=null;try{saved=JSON.parse(sessionStorage.getItem(cache)||"null")}catch(_){}
   let key=saved&&Date.parse(saved.expires)>Date.now()?saved.key:crypto.randomUUID();
   sessionStorage.setItem(cache,JSON.stringify({key,expires:new Date(Date.now()+10*60000).toISOString()}));
   message("Reserverer plassen din …");
   const hold=await api("/club/hold",{date:day,idempotencyKey:key,rentalSets:rental,acceptedTerms:true});
   sessionStorage.setItem(cache,JSON.stringify({key,expires:hold.expires}));
   let verifiedCart=await add(hold.productId,hold.variantId,hold.sku);
   if(rental)verifiedCart=await add(1318,null,"1318");
   if(verifiedCart.items.length!==1+rental)throw Error("mixed_cart");
   sessionStorage.setItem("gk_last_booking_payload_v1",JSON.stringify({type:"klubb",label:"Klubbkveld – Lyngdal Dartklubb",date:day,time:"19:00–22:00",price:50+rental*25,sets:rental}));
   sessionStorage.setItem("gk_success_target","booking");
   message("Plassen er reservert. Åpner handlekurven …");location.assign("/cart/index");
  }catch(error){
   message(error.message==="cart_not_empty"?"Handlekurven inneholder andre varer. Fullfør eller tøm den før klubbpåmelding.":"Påmeldingen kunne ikke fullføres. Kontroller handlekurven før du prøver igjen. En ubetalt reservasjon frigjøres automatisk.");
  }finally{busy=false;await refresh().catch(()=>{});}
 }
 try{
  const {createClient}=await import("https://esm.sh/@supabase/supabase-js@2.58.0");
  auth=createClient("https://eadgdcimcmfyuicizboo.supabase.co",KEY,{auth:{persistSession:true,autoRefreshToken:true}});
  await check();await refresh();
 }catch(_){message("Klubbbookingen kunne ikke lastes. Prøv å oppdatere siden, eller kontakt GolfKongen.");}
})();
