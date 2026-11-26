// Editable customer-facing benefit descriptions. Actual discounts stay in Quickbutik.
const previewCss="\n#gk-member-popup-overlay{\n  position:fixed;\n  inset:0;\n  z-index:999999;\n  display:flex;\n  align-items:center;\n  justify-content:center;\n  background:rgba(4,9,16,.62);\n  backdrop-filter:blur(5px);\n  -webkit-backdrop-filter:blur(5px);\n  padding:18px;\n  animation:gkmpFadeIn .18s ease-out both;\n}\n#gk-member-popup{\n  width:min(92vw,600px);\n  background:\n    radial-gradient(circle at top right, rgba(159,214,111,.12), transparent 28%),\n    linear-gradient(180deg,#111a28 0%,#0c121d 100%);\n  color:#eef4fb;\n  border:1px solid rgba(255,255,255,.09);\n  border-radius:24px;\n  box-shadow:0 24px 80px rgba(0,0,0,.50);\n  overflow:hidden;\n  font-family:inherit;\n  transform:translateY(16px) scale(.985);\n  opacity:0;\n  animation:gkmpPopupIn .24s cubic-bezier(.2,.8,.2,1) .03s forwards;\n}\n@keyframes gkmpFadeIn{\n  from{opacity:0;}\n  to{opacity:1;}\n}\n@keyframes gkmpPopupIn{\n  from{\n    opacity:0;\n    transform:translateY(16px) scale(.985);\n  }\n  to{\n    opacity:1;\n    transform:translateY(0) scale(1);\n  }\n}\n.gkmp-top{\n  padding:22px 22px 12px 22px;\n  border-bottom:1px solid rgba(255,255,255,.06);\n}\n.gkmp-kicker{\n  display:inline-block;\n  font-size:12px;\n  font-weight:800;\n  letter-spacing:.06em;\n  text-transform:uppercase;\n  color:#9fd66f;\n  margin-bottom:8px;\n}\n.gkmp-title{\n  margin:0;\n  font-size:clamp(24px,3vw,34px);\n  line-height:1.12;\n  color:#fff;\n}\n.gkmp-body{\n  padding:16px 22px 22px 22px;\n}\n.gkmp-alert{\n  background:linear-gradient(180deg, rgba(255,179,71,.22) 0%, rgba(255,179,71,.12) 100%);\n  border:1px solid rgba(255,190,60,.38);\n  box-shadow:inset 0 0 0 1px rgba(255,255,255,.03);\n  color:#fff8e7;\n  border-radius:16px;\n  padding:14px 15px;\n  font-size:14px;\n  line-height:1.5;\n  margin-bottom:14px;\n  font-weight:800;\n}\n.gkmp-card{\n  background:rgba(255,255,255,.04);\n  border:1px solid rgba(255,255,255,.06);\n  border-radius:18px;\n  padding:15px;\n  margin-bottom:12px;\n}\n.gkmp-card-discount{\n  background:linear-gradient(180deg, rgba(159,214,111,.14) 0%, rgba(159,214,111,.07) 100%);\n  border:1px solid rgba(159,214,111,.24);\n  box-shadow:0 8px 24px rgba(0,0,0,.12);\n}\n.gkmp-label{\n  font-size:13px;\n  font-weight:800;\n  color:#9fd66f;\n  margin:0 0 6px 0;\n  text-transform:uppercase;\n  letter-spacing:.05em;\n}\n.gkmp-group{\n  font-size:19px;\n  font-weight:900;\n  margin:0;\n  color:#fff;\n}\n.gkmp-list{\n  margin:0;\n  padding-left:18px;\n}\n.gkmp-list li{\n  margin:0 0 8px 0;\n  line-height:1.45;\n}\n.gkmp-list li:last-child{\n  margin-bottom:0;\n}\n.gkmp-list-strong li{\n  font-weight:700;\n  color:#f8fff0;\n}\n.gkmp-p{\n  margin:0 0 10px 0;\n  line-height:1.55;\n  color:#e6edf7;\n}\n.gkmp-gift{\n  margin-top:10px;\n  background:linear-gradient(180deg, rgba(159,214,111,.18) 0%, rgba(159,214,111,.09) 100%);\n  border:1px solid rgba(159,214,111,.28);\n  color:#f5ffe9;\n  border-radius:16px;\n  padding:14px;\n  line-height:1.45;\n  box-shadow:0 10px 26px rgba(0,0,0,.14);\n}\n.gkmp-gift-amount{\n  display:inline-block;\n  font-weight:900;\n  font-size:22px;\n  color:#9fd66f;\n  text-shadow:0 0 18px rgba(159,214,111,.16);\n  padding:0 4px;\n}\n.gkmp-actions{\n  display:flex;\n  gap:10px;\n  flex-wrap:wrap;\n  margin-top:16px;\n}\n.gkmp-btn{\n  appearance:none;\n  border:none;\n  text-decoration:none;\n  cursor:pointer;\n  border-radius:14px;\n  padding:12px 16px;\n  font-weight:800;\n  font-size:15px;\n  transition:transform .12s ease, opacity .12s ease, box-shadow .12s ease;\n}\n.gkmp-btn:hover{\n  transform:translateY(-1px);\n}\n.gkmp-btn-primary{\n  background:#9fd66f;\n  color:#0e151f;\n  box-shadow:0 10px 24px rgba(159,214,111,.18);\n}\n.gkmp-btn-secondary{\n  background:rgba(255,255,255,.08);\n  color:#eef4fb;\n}\n.gkmp-close-x{\n  position:absolute;\n  right:14px;\n  top:12px;\n  border:none;\n  background:transparent;\n  color:#cdd8e7;\n  font-size:28px;\n  line-height:1;\n  cursor:pointer;\n}\n.gkmp-wrap{\n  position:relative;\n}\n@media (max-width:640px){\n  #gk-member-popup-overlay{\n    padding:12px;\n    align-items:flex-end;\n  }\n  #gk-member-popup{\n    width:100%;\n    border-radius:20px 20px 0 0;\n  }\n  .gkmp-actions{\n    flex-direction:column;\n  }\n  .gkmp-btn{\n    width:100%;\n    text-align:center;\n  }\n}\n    ";
export function benefitPreview(config,escape){
 const lines=[config.retailText,config.discBookingText,config.dartBookingText,config.clubNightText].filter(Boolean);
 return '<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:12px;font-family:Arial,sans-serif;background:#f4f7f3}'+previewCss+
 '#gk-member-popup{width:100%;box-sizing:border-box;opacity:1;transform:none;animation:none}</style>'+
 '<div id="gk-member-popup" class="gkmp-wrap"><div class="gkmp-top"><div class="gkmp-kicker">GolfKongen</div><h2 class="gkmp-title">Velkommen kunde 👋</h2></div>'+
 '<div class="gkmp-body"><div class="gkmp-alert">Du kan ha egne priser og fordeler gjennom kundegruppen din. Kontroller at riktig kundegruppepris vises i kassen før du betaler.</div>'+
 '<div class="gkmp-card"><div class="gkmp-label">Din gruppe</div><p class="gkmp-group">'+escape(config.label)+'</p></div>'+
 (lines.length?'<div class="gkmp-card gkmp-card-discount"><div class="gkmp-label">Dine fordeler</div><ul class="gkmp-list gkmp-list-strong">'+lines.map(x=>'<li>'+escape(x)+'</li>').join('')+'</ul></div>':'')+
 '<div class="gkmp-actions"><button class="gkmp-btn gkmp-btn-secondary" type="button">Lukk</button></div></div></div>';
}
export function setupBenefitEditor({api,approved,esc}){
 const panel=document.querySelector('[data-panel="grupper"]');
 panel.insertAdjacentHTML("beforeend",'<div class="card" style="margin-top:18px"><h2>Velkomstboksen – rabatter og fordeler</h2>'+
 '<p class="small">Her redigerer du teksten kunden ser etter innlogging. Dette endrer ikke rabatter, priser eller gruppemedlemskap i nettbutikken. Et tomt felt skjuler den fordelen.</p>'+
 '<div class="grid"><form id="benefitForm"><div class="field"><label for="benefitGroup">Kundegruppe</label><select id="benefitGroup"></select></div>'+
 '<div class="field"><label for="benefitLabel">Gruppenavn i boksen</label><input id="benefitLabel" maxlength="80" required></div>'+
 ['retailText','discBookingText','dartBookingText','clubNightText'].map((key,i)=>'<div class="field"><label for="benefit_'+key+'">'+['Rabatt i butikken','Booking av simulator','Booking av dart','Klubbkvelder / annen fordel'][i]+'</label><textarea id="benefit_'+key+'" rows="2" maxlength="400"></textarea></div>').join('')+
 '<details><summary>Prioritet når kunden har flere grupper</summary><p class="small">Høyeste tall vinner for butikk, simulator og dart hver for seg. Ansatte har 100. Fordelene legges ikke sammen.</p>'+
 ['retailPriority','discBookingPriority','dartBookingPriority'].map((key,i)=>'<div class="field"><label for="benefit_'+key+'">'+['Butikk','Simulator','Dart'][i]+'</label><input type="number" min="0" max="100" step="1" id="benefit_'+key+'" required></div>').join('')+'</details>'+
 '<button class="btn" id="benefitSave" type="submit" disabled>Lagre tekst i velkomstboksen</button><p id="benefitStatus" role="status" class="status"></p></form>'+
 '<div><h3>Forhåndsvisning av valgt gruppe</h3><iframe id="benefitPreview" sandbox="" title="Forhåndsvisning av velkomstboksen" style="width:100%;height:620px;border:0"></iframe></div></div></div>');
 const el=id=>panel.querySelector('#'+id);
 let rows=[],current=null;
 const fields=['retailText','discBookingText','dartBookingText','clubNightText','retailPriority','discBookingPriority','dartBookingPriority'];
 function read(){return {label:el('benefitLabel').value,...Object.fromEntries(fields.map(k=>[k,k.endsWith('Priority')?Number(el('benefit_'+k).value):el('benefit_'+k).value]))};}
 function preview(){el('benefitPreview').srcdoc=benefitPreview(read(),esc);}
 function select(){
  current=rows.find(x=>x.key===el('benefitGroup').value)||null;
  el('benefitSave').disabled=!current;
  if(!current)return;
  el('benefitLabel').value=current.label;
  for(const key of fields)el('benefit_'+key).value=current[key]??'';
  el('benefitStatus').textContent='';preview();
 }
 async function load(){
  if(!approved())return;
  el('benefitSave').disabled=true;
  try{
   const data=await api('/admin/benefits');rows=Array.isArray(data.benefits)?data.benefits:[];
   const selected=el('benefitGroup').value;
   const names={medlemmer:'Medlem – discgolf',betalt_medlem:'Betalt medlem + dartklubb',frisbee_dart:'Frisbee og dart'};
   el('benefitGroup').innerHTML=rows.map(x=>'<option value="'+esc(x.key)+'">'+esc(names[x.key]||x.label)+'</option>').join('');
   if(rows.some(x=>x.key===selected))el('benefitGroup').value=selected;
   select();
  }catch(e){el('benefitStatus').textContent='Kunne ikke hente tekstene: '+e.message;}
 }
 el('benefitGroup').onchange=select;
 el('benefitLabel').oninput=preview;
 for(const key of fields)el('benefit_'+key).oninput=preview;
 el('benefitForm').onsubmit=async event=>{
  event.preventDefault();if(!current)return;
  const config=read(),target=current;el('benefitSave').disabled=true;el('benefitStatus').textContent='Lagrer …';
  try{
   const data=await api('/admin/benefit-save','POST',{key:target.key,updated:target.updated,config});
   const i=rows.findIndex(x=>x.key===target.key);rows[i]=data.benefit;
   if(el('benefitGroup').value===target.key){current=data.benefit;el('benefitStatus').textContent='Lagret. Teksten brukes neste gang kunden åpner velkomstboksen.';}
  }catch(e){el('benefitStatus').textContent='Teksten ble ikke lagret. Oppdater og prøv igjen. '+e.message;}
  finally{el('benefitSave').disabled=false;}
 };
 return {load};
}
