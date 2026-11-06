export function setupSheetMembers({api,approved,esc}) {
 const panel=document.querySelector('[data-panel="grupper"]');
 const card=document.createElement("div");card.className="card";card.style.marginTop="20px";
 card.innerHTML='<h2>Medlemslisten – popup og klubbtilgang</h2><p class="small">Denne listen leses fra Google-arket. Endringer gjelder popupen og klubbtilgangen. Rabatter i kassen administreres separat.</p><div class="fields"><input type="search" placeholder="Søk navn eller e-post" data-search><button class="btn outline" data-refresh>Oppdater medlemslisten</button><button class="btn" data-new>Nytt medlem</button></div><p role="status" data-message></p><div class="tablewrap" data-list></div><form data-form class="hidden"><h3 data-title>Rediger medlem</h3><div class="fields"><div class="field"><label>Navn<input name="name" maxlength="160" required></label></div><div class="field"><label>E-post<input name="email" type="email" maxlength="254" required></label></div></div><fieldset><legend>Grupper</legend><div data-groups></div></fieldset><label><input type="checkbox" name="active" style="width:auto;min-height:auto"> Aktivt medlem</label><p><button class="btn" type="submit">Lagre medlemsliste</button> <button class="btn outline" type="button" data-close>Lukk</button></p></form>';
 panel.append(card);const q=s=>card.querySelector(s),form=q("[data-form]");
 const groups={ansatte:"Ansatte",teamgolfkongen:"Team GolfKongen",ambassador:"Ambassadør",medlemmer:"Medlem – discgolf",frisbeeklubb:"Frisbeeklubb",dartklubb:"Dartklubb"};
 q("[data-groups]").innerHTML=Object.entries(groups).map(([key,label])=>'<label style="display:block"><input type="checkbox" value="'+key+'" data-group style="width:auto;min-height:auto"> '+esc(label)+'</label>').join("");
 let members=[],selected=null,loaded=false,busy=false;
 const message=t=>q("[data-message]").textContent=t;
 function render(){
  const search=q("[data-search]").value.trim().toLowerCase();
  const filtered=members.filter(m=>(m.name+" "+m.email).toLowerCase().includes(search));
  q("[data-list]").innerHTML=filtered.length?'<table><thead><tr><th>Navn</th><th>E-post</th><th>Grupper</th><th>Status</th><th></th></tr></thead><tbody>'+filtered.map(m=>'<tr><td>'+esc(m.name)+'</td><td>'+esc(m.email)+'</td><td>'+esc(m.groups.map(g=>groups[g]||g).join(", "))+'</td><td>'+esc(m.active?"Aktiv":"Inaktiv")+'</td><td><button class="btn outline" data-edit="'+m.row+'">Rediger</button></td></tr>').join("")+'</tbody></table>':'<p>Ingen medlemmer å vise.</p>';
  for(const button of card.querySelectorAll("[data-edit]"))button.onclick=()=>edit(members.find(m=>m.row===Number(button.dataset.edit)));
 }
 function edit(member){
  if(!approved()||busy)return;
  if(member?.groups.some(g=>!Object.hasOwn(groups,g))){message("Medlemmet har en ukjent gruppe. Kontroller den i Google-arket før redigering.");return;}
  selected=member||null;form.classList.remove("hidden");form.elements.name.value=member?.name||"";
  form.elements.email.value=member?.email||"";form.elements.email.readOnly=!!member;
  form.elements.active.checked=member?.active??true;
  for(const input of card.querySelectorAll("[data-group]"))input.checked=!!member?.groups.includes(input.value);
  q("[data-title]").textContent=member?"Rediger medlem":"Nytt medlem";
 }
 async function load(){
  if(!approved()||busy)return;busy=true;
  q("[data-new]").disabled=true;
  try{const result=await api("/admin/sheet-members");members=result.members||[];loaded=true;form.classList.add("hidden");render();message(members.length+" medlemmer lest fra Google-arket.");q("[data-new]").disabled=false;}
  catch(_){members=[];loaded=false;q("[data-list]").textContent="";form.classList.add("hidden");message("Medlemskoblingen er ikke klar eller kunne ikke lastes. Apps Script må være publisert med samme sikkerhetsnøkkel som Supabase.");}
  finally{busy=false;}
 }
 q("[data-new]").disabled=true;q("[data-new]").onclick=()=>{if(loaded)edit(null)};
 q("[data-refresh]").onclick=load;q("[data-search]").oninput=render;q("[data-close]").onclick=()=>form.classList.add("hidden");
 form.onsubmit=async event=>{
  event.preventDefault();if(!approved()||busy||!loaded)return;
  busy=true;const button=form.querySelector('[type="submit"]');button.disabled=true;
  try{
   const result=await api("/admin/sheet-member-save","POST",{name:form.elements.name.value.trim(),email:form.elements.email.value.trim().toLowerCase(),groups:Array.from(card.querySelectorAll("[data-group]:checked"),x=>x.value),active:form.elements.active.checked,version:selected?.version||""});
   members=members.filter(m=>m.row!==result.member.row).concat([result.member]);render();form.classList.add("hidden");
   message("Lagret og kontrollert i Google-arket. Popup og klubbtilgang kan bruke opptil fem minutter på å oppdatere.");
  }catch(_){message("Kunne ikke bekrefte lagring. Oppdater medlemslisten før du prøver igjen; arket kan ha blitt endret.");}
  finally{busy=false;button.disabled=false;}
 };
 return {load};
}
