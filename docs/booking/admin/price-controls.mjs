/* GolfKongen Booking 2.0 Admin: safe Quickbutik reconciliation.
 * Import from same-origin Booking 2.0 admin. No API secrets or customer keys.
 */
export function setupPriceControls({api,approved,esc,table,resLabel,groupLabel,onPricesChanged=()=>{}}) {
 const panel=document.querySelector('[data-panel="priser"]');
 if(!panel)throw Error("price_panel_missing");
 panel.insertAdjacentHTML("beforeend",'<div class="card">'+
  '<h2>Quickbutik – kontroll av kundegruppepriser</h2>'+
  '<p class="small">Alle spesialpriser er registrert tidligere. «Meldt lagt inn» betyr IKKE at de er testet i kassen. Ingen endring gjøres i Quickbutik fra denne listen.</p>'+
  '<div class="row spaced"><strong id="priceCount">Henter …</strong><button class="btn outline" id="priceRefresh" type="button">Oppdater</button></div>'+
  '<div class="fields three" style="margin-top:15px">'+
  '<div class="field"><label for="gFilter">Gruppe</label><select id="gFilter"><option value="all">Alle grupper</option>'+
  ['ansatte','betalt_medlem','teamgolfkongen','frisbee_dart','ambassador','frisbeeklubb','dartklubb'].map(x=>'<option value="'+x+'">'+esc(groupLabel[x]||x)+'</option>').join("")+'</select></div>'+
  '<div class="field"><label for="rFilter">Aktivitet</label><select id="rFilter"><option value="all">Alle</option>'+
  ['hyzr','dart_a','dart_b','venue'].map(x=>'<option value="'+x+'">'+esc(resLabel[x]||x)+'</option>').join("")+'</select></div>'+
  '<div class="field"><label for="sFilter">Status</label><select id="sFilter"><option value="all">Alle</option>'+
  '<option value="entered_reported">Meldt lagt inn</option><option value="checkout_verified">Kassetest registrert</option>'+
  '<option value="pending">Ikke lagt inn</option><option value="stale_price">Utdatert</option><option value="remove_override">Fjern overstyring</option></select></div></div>'+
  '<div class="field"><label for="pFilter">Søk produktnummer</label><input id="pFilter" placeholder="F.eks. 1477"></div>'+
  '<div id="priceQueue" class="tablewrap"></div><div class="row spaced"><span id="queuePages" class="small"></span>'+
  '<button id="queueAll" class="btn secondary hidden" type="button">Vis alle treff</button></div>'+
  '<div class="divider"></div><h2>Kontroller ordinærpris</h2><p class="small">Velg aktivitet og varighet i prismatrisen over. Denne kontrollen leser kun grunnprisen på produktet, ikke alle tidsvarianter eller spesialpris i en innlogget kasse.</p>'+
  '<div class="row"><button id="qbCompare" class="btn outline" type="button">Sjekk ordinærpris</button><span class="small" id="qbCompareResult" role="status"></span></div>'+
  '<p class="small" style="margin-top:14px">Kundegruppepriser endres i Quickbutik → Kunder → Kundegrupper → Spesifikke priser. Merk aldri en rabatt som kontrollert bare fordi den er registrert her.</p>'+
  '</div><div class="card"><h2>Lagrede prisutkast</h2>'+
  '<p class="small">Godkjenn et lagret utkast for å oppdatere visningsprisen i prismatrisen. Dette endrer ikke nettbutikkens priser eller kundens betaling.</p>'+
  '<div class="tablewrap" id="draftQueue"></div></div>');
 const el=id=>panel.querySelector("#"+id);
 const fmt=v=>(Number(v)/100).toLocaleString("nb-NO",{minimumFractionDigits:2,maximumFractionDigits:2})+" kr";
 const descriptions={entered_reported:"Meldt lagt inn · ikke kassetestet",checkout_verified:"Kassetest rapportert",pending:"Ikke registrert",stale_price:"Utdatert · må endres",remove_override:"Overstyring må fjernes"};
 let rows=[],all=false;
 function render(){
  const n=st=>rows.filter(x=>x.stage===st).length;
  el("priceCount").textContent=rows.length+" særpriser · "+n("entered_reported")+" meldt innlagt (ikke kassetestet), "+n("checkout_verified")+" med rapportert kassetest · "+n("stale_price")+" utdaterte";
  const filtered=rows.filter(x=>(el("gFilter").value==="all"||el("gFilter").value===x.group)&&
   (el("rFilter").value==="all"||el("rFilter").value===x.resource)&&
   (el("sFilter").value==="all"||el("sFilter").value===x.stage)&&String(x.quickbutikProductId).includes(el("pFilter").value.trim()));
  const display=all?filtered:filtered.slice(0,25);
  el("priceQueue").innerHTML=table(["Gruppe","Aktivitet","Tid","QB-produkt","Særpris","Status","Handling"],display.map(x=>{
    const key=[x.resource,x.group,x.minutes].join("|");
    const pending=x.stage==="pending"||x.stage==="stale_price";
    const action=pending?'<button type="button" class="btn outline" data-report="'+esc(key)+'">Jeg har lagt inn</button>':
     '<button type="button" class="btn secondary" data-copy="'+esc(key)+'">Kopier</button>';
    return '<tr><td>'+esc(groupLabel[x.group]||x.group)+'</td><td>'+esc(resLabel[x.resource]||x.resource)+'</td>'+
     '<td>'+esc(x.minutes)+' min</td><td><strong>'+esc(x.quickbutikProductId)+'</strong></td>'+
     '<td>'+esc(fmt(x.expectedOre))+'</td><td><span class="pill '+(pending?"error":"held")+'">'+esc(descriptions[x.stage]||x.stage)+'</span></td><td>'+action+'</td></tr>';
  }));
  el("queuePages").textContent="Viser "+display.length+" av "+filtered.length+" treff";
  el("queueAll").classList.toggle("hidden",all||filtered.length<=25);
  for(const b of el("priceQueue").querySelectorAll("[data-copy]"))b.onclick=()=>{
   const x=rows.find(z=>[z.resource,z.group,z.minutes].join("|")===b.dataset.copy);if(!x)return;
   const text="Quickbutik produkt "+x.quickbutikProductId+" · "+(groupLabel[x.group]||x.group)+" · "+x.minutes+" min · "+fmt(x.expectedOre);
   if(navigator.clipboard?.writeText)navigator.clipboard.writeText(text).then(()=>b.textContent="Kopiert").catch(()=>prompt("Kopier",text));else prompt("Kopier",text);
  };
  for(const b of el("priceQueue").querySelectorAll("[data-report]"))b.onclick=async()=>{
   const x=rows.find(z=>[z.resource,z.group,z.minutes].join("|")===b.dataset.report);if(!x)return;
   if(!confirm("Har du selv lagret "+fmt(x.expectedOre)+" for "+(groupLabel[x.group]||x.group)+
    " på Quickbutik-produkt "+x.quickbutikProductId+"? Dette tester IKKE kassen."))return;
   b.disabled=true;
   try{await api("/admin/group-price-stage","POST",{resource:x.resource,group:x.group,minutes:x.minutes,
     stage:"entered_reported",note:"Manuelt registrert av admin; ikke kontrollert i kassen"});await loadQueue();}
   catch(e){alert("Status ble ikke lagret: "+e.message);b.disabled=false;}
  };
 }
 async function loadQueue(){
  if(!approved())return;
  el("priceCount").textContent="Henter spesialpriser …";
  try{const data=await api("/admin/group-price-queue");rows=Array.isArray(data.queue)?data.queue:[];all=false;render();}
  catch(e){el("priceCount").textContent="Kunne ikke hente priser: "+e.message;}
 }
 async function loadDrafts(){
  if(!approved())return;
  try{
   const data=await api("/admin/price-drafts"),drafts=Array.isArray(data.drafts)?data.drafts:[];
   el("draftQueue").innerHTML=table(["Aktivitet","Gruppe","Tid","Gjeldende","Utkast","Status","Handling"],drafts.map(d=>{
    const key=[d.resource,d.group,d.minutes].join("|");
    return '<tr><td>'+esc(resLabel[d.resource]||d.resource)+'</td><td>'+esc(groupLabel[d.group]||d.group)+
    '</td><td>'+esc(d.minutes)+' min</td><td>'+esc(fmt(d.currentOre))+'</td><td><strong>'+esc(fmt(d.proposedOre))+
    '</strong></td><td><span class="pill '+(d.stale?"error":"held")+'">'+(d.stale?"Visningspris endret":"Venter på godkjenning")+'</span></td>'+
    '<td><button type="button" class="btn" data-approve-display="'+esc(key)+'" '+(d.stale?'disabled ':'')+'>Godkjenn i prismatrisen</button> <button type="button" class="btn warning" data-remove="'+esc(key)+'">Slett utkast</button></td></tr>';
   }));
   for(const b of el("draftQueue").querySelectorAll("[data-approve-display]"))b.onclick=async()=>{
    const d=drafts.find(x=>[x.resource,x.group,x.minutes].join("|")===b.dataset.approveDisplay);
    if(!d||d.stale)return;
    b.disabled=true;
    try{
     const result=await api("/admin/price-display-approve","POST",{
      resource:d.resource,group:d.group,minutes:d.minutes,ore:d.proposedOre,updated:d.updated});
     if(result.approved!==true)throw Error("Godkjenningen ble ikke lagret.");
     await Promise.all([loadDrafts(),onPricesChanged()]);
    }catch(e){alert("Kunne ikke godkjenne visningsprisen: "+e.message);b.disabled=false;}
   };
   for(const b of el("draftQueue").querySelectorAll("[data-remove]"))b.onclick=async()=>{
    const d=drafts.find(x=>[x.resource,x.group,x.minutes].join("|")===b.dataset.remove);
    if(!d||!confirm("Slette utkastet? Aktive priser påvirkes ikke."))return;
    b.disabled=true;
    try{await api("/admin/price-draft-delete","POST",{resource:d.resource,group:d.group,minutes:d.minutes});await loadDrafts();}
    catch(e){alert("Kunne ikke slette utkast: "+e.message);b.disabled=false;}
   };
  }catch(e){el("draftQueue").textContent="Kunne ikke hente prisutkast: "+e.message}
 }
 el("qbCompare").onclick=async()=>{
  const status=el("qbCompareResult");
  if(document.getElementById("pricegroup").value!=="public"){
   status.textContent="Gruppepriser kan ikke kontrolleres via produkt-API.";return;
  }
  const b=el("qbCompare");b.disabled=true;status.textContent="Henter pris …";
  try{
   const query=new URLSearchParams({resource:document.getElementById("priceresource").value,
      group:"public",minutes:document.getElementById("priceminutes").value});
   const d=await api("/admin/price-sync-check?"+query);
   status.textContent=d.quickbutikRegularPriceOre==null?
    "Kunne ikke lese ordinærprisen fra Quickbutik for produkt "+d.quickbutikProductId+".":
    d.regularPriceMatches?
    "Produkt "+d.quickbutikProductId+": "+fmt(d.quickbutikRegularPriceOre)+" stemmer med Booking 2.0 (varianter og kasse ikke kontrollert).":
    "AVVIK produkt "+d.quickbutikProductId+": Quickbutik "+fmt(d.quickbutikRegularPriceOre)+
     ", Booking 2.0 "+fmt(d.booking2PriceOre)+". Ingen endring utført.";
  }catch(e){status.textContent="Kontroll feilet: "+e.message}finally{b.disabled=false;}
 };
 for(const id of ["gFilter","rFilter","sFilter"])el(id).onchange=()=>{all=false;render()};
 el("pFilter").oninput=()=>{all=false;render()};
 el("queueAll").onclick=()=>{all=true;render()};
 el("priceRefresh").onclick=loadQueue;
 return {loadAll:()=>Promise.all([loadQueue(),loadDrafts()]),loadDrafts};
}
