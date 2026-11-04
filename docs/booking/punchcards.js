(async function () {
 'use strict';
 const page=location.pathname.replace(/\/$/,'');
 if(!['/customer/index','/aktiviteter'].includes(page))return;
 const API='https://eadgdcimcmfyuicizboo.supabase.co/functions/v1/gk-punchcards';
 const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.58.0');
 const auth=createClient('https://eadgdcimcmfyuicizboo.supabase.co','sb_publishable_XkYEuhPUH1lLmu8EVJM5Nw_ptPirbYq',{auth:{persistSession:true,autoRefreshToken:true}});
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const time=minutes=>String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
 let balance=null,loginEmail='',busy=false;
 let usePreference=new URLSearchParams(location.search).get('klippekort')==='1';
 async function api(path,body){
  const {data}=await auth.auth.getSession();
  const response=await fetch(API+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(data.session?{authorization:'Bearer '+data.session.access_token}:{})},body:body?JSON.stringify(body):undefined});
  const result=await response.json();
  if(!response.ok||!result.ok)throw Error(result.code||'request_failed');
  return result;
 }
 const root=document.createElement('details');root.id='gk-punchcards';
 root.innerHTML='<summary>Mitt klippekort <span id="gk-punch-balance"></span></summary><div class="gk-punch-inner"><p>Forhåndsbetalte HYZR-timer. Gyldig i 12 måneder fra kjøp. Bekreft e-postadressen fra kjøpet for å se og bruke timene dine.</p><form id="gk-punch-login"><label>E-postadresse<input type="email" autocomplete="email" required></label><button>Send engangskode</button></form><form id="gk-punch-verify" hidden><label>Engangskode<input autocomplete="one-time-code" inputmode="numeric" required></label><button>Bekreft</button></form><div id="gk-punch-account" hidden></div><p id="gk-punch-status" role="status" aria-live="polite"></p></div>';
 const style=document.createElement('style');style.textContent='#gk-punchcards{color:#f4f6f2;background:#15251c;border:1px solid #456047;border-radius:10px;margin:8px 0;padding:10px 12px;font-size:14px}#gk-punchcards summary{cursor:pointer;font-weight:700}#gk-punchcards input:not([type=checkbox]){display:block;width:100%;max-width:360px;background:white;color:#111;padding:9px;border-radius:6px;margin:5px 0}#gk-punchcards button,#gk-punchcards a{display:inline-flex;align-items:center;min-height:44px;padding:6px 12px;color:#fff;background:#285c3d;border:1px solid #6d8d72;border-radius:7px;margin:4px 4px 4px 0;text-decoration:none}#gk-punchcards button:disabled{opacity:.5}#gk-punchcards [hidden]{display:none!important}#gk-punchcards .gk-punch-booking{padding:8px 0;border-top:1px solid #456047}#gk-punchcards .gk-punch-inner{padding-top:8px}';document.head.appendChild(style);
 const choice=document.createElement('label');
 choice.id='gk-punch-payment-choice';choice.hidden=true;
 choice.style.cssText='display:flex;align-items:center;gap:10px;padding:12px;margin:10px 0;border:1px solid #b39e59;border-radius:10px;background:#25371d;color:#fff;min-height:48px';
 choice.innerHTML='<input id="gk-punch-use" type="checkbox" style="width:22px;height:22px;flex:none"><span>Bruk klippekort <small id="gk-punch-choice-balance" style="display:block"></small></span>';
 const useCheckbox=choice.querySelector('input');
 function syncPaymentChoice(){
  if(page!=='/aktiviteter')return;
  const resource=document.getElementById('gk-v2-resource');
  const available=balance&&balance.minutes>0&&resource?.value==='hyzr';
  choice.hidden=!available;
  choice.style.display=available?'flex':'none';
  useCheckbox.checked=!!available&&usePreference;
  if(balance)choice.querySelector('small').textContent=(balance.minutes/60).toLocaleString('nb-NO')+' timer igjen · Trekkes fra saldoen';
  const email=document.getElementById('gk-v2-email');
  if(useCheckbox.checked&&email)email.value=balance.email;
  document.getElementById('gk-v2-sets-qty')?.dispatchEvent(new Event('change'));
 }
 useCheckbox.onchange=()=>{usePreference=useCheckbox.checked;syncPaymentChoice()};
 function mount(){
  if(page==='/aktiviteter'){
   const form=document.getElementById('gk-v2-form');if(!form)return false;
   const continueButton=document.getElementById('gk-v2-continue');if(!continueButton)return false;
   (document.getElementById('gk-v2-offer-account')||form).before(root);continueButton.parentElement.before(choice);
   document.getElementById('gk-v2-resource').addEventListener('change',syncPaymentChoice);
   syncPaymentChoice();return true;
  }
  const heading=Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).find(h=>/siste bestillinger/i.test(h.textContent));
  if(!heading)return false;
  let card=heading.closest('.card')||heading.parentElement;
  card.before(root);root.open=true;return true;
 }
 if(!mount()){
  const observer=new MutationObserver(()=>{if(mount())observer.disconnect()});observer.observe(document.body,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),20000);
 }
 const find=selector=>root.querySelector(selector);
 function status(text){find('#gk-punch-status').textContent=text}
 const errors={login_required:'Bekreft e-postadressen din først.',insufficient_minutes:'Du har ikke nok tid igjen på klippekortet.',cancellation_deadline:'Avbestillingsfristen på 30 minutter er passert.',login_rate_limited:'For mange forsøk. Prøv igjen senere.',out_of_window:'Tidspunktet kan ikke bookes nå.',key_reuse:'Bestillingen er allerede behandlet. Oppdater oversikten.'};
 function showError(error){status(errors[error.message]||'Handlingen kunne ikke fullføres. Oppdater og prøv igjen.')}
 async function refresh(){
  try{balance=await api('/account')}catch(_){balance=null}
  find('#gk-punch-login').hidden=!!balance;
  find('#gk-punch-account').hidden=!balance;
  find('#gk-punch-balance').textContent=balance?'· '+(balance.minutes/60).toLocaleString('nb-NO')+' timer igjen':'';
  syncPaymentChoice();
  if(!balance)return;
  find('#gk-punch-verify').hidden=true;
  const bookingRows=balance.bookings.map(b=>'<div class="gk-punch-booking">'+escape(b.date)+' · '+time(b.startMin)+'–'+time(b.endMin)+' · '+(b.status==='confirmed'?'Bekreftet':'Avbestilt')+(b.status==='confirmed'&&b.date>=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Oslo'})?'<br><button type="button" data-cancel="'+escape(b.id)+'">Avbestill</button>':'')+'</div>').join('');
  find('#gk-punch-account').innerHTML='<p><strong>'+escape(balance.email)+'</strong></p><p>Saldo '+(balance.minutes/60).toLocaleString('nb-NO')+' timer. Gyldighet vises per kjøp nedenfor.</p>'+balance.cards.map(c=>'<p>'+c.remaining/60+' timer · Utløper '+escape(new Date(c.expiresAt).toLocaleDateString('nb-NO'))+'</p>').join('')+(page==='/aktiviteter'?'<p>Velg «Bruk klippekort» ved bookingknappen nedenfor.</p>':'<a href="/aktiviteter?klippekort=1">Book HYZR med klippekort</a>')+'<p>Avbestill senest 30 minutter før start for å få tiden tilbake. Utløpte timer får ikke ny gyldighet.</p>'+bookingRows+'<button type="button" id="gk-punch-refresh">Oppdater saldo</button><button type="button" id="gk-punch-logout">Bytt konto</button>';
  find('#gk-punch-refresh').onclick=refresh;
  find('#gk-punch-logout').onclick=async()=>{await auth.auth.signOut();await refresh()};
  root.querySelectorAll('[data-cancel]').forEach(button=>button.onclick=async()=>{
   if(busy||!confirm('Avbestille bookingen og føre tiden tilbake på klippekortet?'))return;
   busy=true;button.disabled=true;
   try{await api('/cancel',{id:button.dataset.cancel});status('Avbestilt. Tiden er tilbakeført. Døradgangen tilbakekalles før tidspunktet åpnes igjen.');await refresh()}catch(error){showError(error)}finally{busy=false;button.disabled=false}
  });
 }
 find('#gk-punch-login').onsubmit=async event=>{
  event.preventDefault();if(busy)return;busy=true;
  const button=event.target.querySelector('button');button.disabled=true;
  loginEmail=event.target.querySelector('input').value.trim().toLowerCase();
  try{const result=await api('/login',{email:loginEmail});status(result.message);find('#gk-punch-verify').hidden=false}catch(error){showError(error)}finally{busy=false;button.disabled=false}
 };
 find('#gk-punch-verify').onsubmit=async event=>{
  event.preventDefault();if(busy)return;busy=true;
  try{
   const {error}=await auth.auth.verifyOtp({email:loginEmail,token:event.target.querySelector('input').value.trim(),type:'email'});
   if(error)throw error;
   await refresh();status(balance?'Klippekortet er klart til bruk.':'Bekreftelsen kunne ikke fullføres.');
  }catch(_){status('Koden er feil eller utløpt. Be om en ny kode.')}finally{busy=false}
 };
 window.gkPunchcardBooking=async function(input){
  if(!useCheckbox.checked)return null;
  if(input.resource!=='hyzr')throw Error('Klippekortet gjelder bare HYZR.');
  if(!balance||balance.minutes<input.duration)throw Error('Du har ikke nok tid på klippekortet.');
  const identity=JSON.stringify([balance.email,input.date,input.startMin,input.duration]);
  const cache='gk-punch-intent';let saved;try{saved=JSON.parse(sessionStorage.getItem(cache)||'null')}catch(_){}
  if(!saved||saved.identity!==identity||saved.expires<Date.now())saved={identity,key:crypto.randomUUID(),expires:Date.now()+600000};
  sessionStorage.setItem(cache,JSON.stringify(saved));
  let result;
  try{result=await api('/book',{...input,key:saved.key})}catch(error){root.open=true;showError(error);throw error}
  if(result.status!=='confirmed')throw Error('Bestillingen er allerede avbestilt. Oppdater siden.');
  status('HYZR er booket '+input.date+' kl. '+time(input.startMin)+'–'+time(input.startMin+input.duration)+'. Bekreftelse og dørkode sendes til '+balance.email+'.');
  root.open=true;await refresh();return result;
 };
 await refresh();
})();
