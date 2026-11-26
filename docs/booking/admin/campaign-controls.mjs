/* Booking 2.0: safe administrative price and campaign planning.
 * NO checkout writes and NO Quickbutik writes. Existing approved API remains the
 * sole source of display prices; campaign drafts are browser-local until a
 * server-side checkout integration has been independently verified.
 */
export function setupCampaignControls({api,approved,esc,table,resLabel,groupLabel,onDraftsChanged=()=>{}}) {
  const panel=document.querySelector('[data-panel="kampanjer"]');
  if(!panel)throw Error("booking_campaign_panel_missing");
  const $=id=>panel.querySelector("#"+id);
  const resources=["hyzr","dart_a","dart_b","venue"];
  const groups=["public","betalt_medlem","frisbee_dart","ambassador","frisbeeklubb","dartklubb","teamgolfkongen","ansatte"];
  const localKey="gk2_campaign_plan_local_v1";
  let matrix=[], preview=[],bulkPreview=[],loading=false,saving=false;
  const roundOre=n=>Math.round(Number(n));
  const nok=ore=>(Number(ore)/100).toLocaleString("nb-NO",{minimumFractionDigits:2,maximumFractionDigits:2})+" kr";
  const title=html=>html;
  const options=(vals,labels)=>vals.map(v=>'<option value="'+esc(v)+'">'+esc(labels[v]||v)+'</option>').join("");
  const currentDate=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Oslo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  panel.innerHTML=
  '<div class="card"><div class="row spaced"><div><h2>Bookingkampanjer</h2><p class="small">Planlegg tidsavgrensede kampanjer uten doble grupperabatter.</p></div><span class="pill held">Utkast – ikke aktiv i kassen</span></div>'+
  '<div class="notice"><strong>Viktig:</strong> Ingen kampanje her endrer Quickbutik, aktive kundegrupper eller kundens betaling. Lagrede kampanjeplaner ligger foreløpig bare i denne nettleseren. Før aktivering må kassens faktiske sluttpris testes og serveren støtte tidsstyrt rabatt.</div>'+
  '<div class="fields three"><div class="field"><label for="campaignName">Kampanjenavn</label><input id="campaignName" maxlength="100" value="Black Week"></div>'+
  '<div class="field"><label for="campaignDiscount">Rabatt fra ordinærpris (%)</label><input id="campaignDiscount" type="number" min="0" max="100" step="0.1" value="50"></div>'+
  '<div class="field"><label for="campaignScope">Aktiviteter</label><select id="campaignScope"><option value="all">Alle bookinger</option>'+options(resources,resLabel)+'</select></div></div>'+
  '<div class="fields three"><div class="field"><label for="campaignFrom">Fra dato</label><input id="campaignFrom" type="date"></div><div class="field"><label for="campaignTo">Til dato (inkl.)</label><input id="campaignTo" type="date"></div>'+
  '<div class="field"><label for="campaignGroup">Kunder</label><select id="campaignGroup"><option value="all">Alle kunder og grupper</option>'+options(groups,groupLabel)+'</select></div></div>'+
  '<div class="row"><button type="button" class="btn" id="campaignPreview">Forhåndsvis prisene</button><button type="button" class="btn secondary" id="campaignSave">Lagre plan lokalt</button><button type="button" class="btn outline" id="campaignReload">Last inn lagret plan</button></div>'+
  '<p class="small">Kampanjeprisen sammenlignes med hver gruppes ordinære gruppepris. Det beste tilbudet gjelder uten å kombinere rabatter. <strong>Kun ansatte</strong> får ytterligere kampanjerabatt på sin allerede reduserte pris.</p>'+
  '<p id="campaignStatus" class="status" role="status"></p><div id="campaignSummary" class="small"></div><div id="campaignResults" class="tablewrap"></div></div>'+
  '<div class="card"><h2>Endre mange visningspriser</h2>'+
  '<p class="small">Opprett prisutkast i Booking 2.0 per aktivitet eller kundegruppe. Endringene blir <strong>ikke</strong> gjeldende i Quickbutik. Dette er for varige prisendringsforslag, ikke tidsavgrenset kampanje.</p>'+
  '<div class="fields three"><div class="field"><label for="bulkResource">Aktivitet</label><select id="bulkResource"><option value="all">Alle aktiviteter</option>'+options(resources,resLabel)+'</select></div>'+
  '<div class="field"><label for="bulkGroup">Gruppe</label><select id="bulkGroup"><option value="all">Alle prisgrupper</option>'+options(groups,groupLabel)+'</select></div>'+
  '<div class="field"><label for="bulkMethod">Endring</label><select id="bulkMethod"><option value="percent">Prosentvis endring</option><option value="fixed">Fast pris per varighet</option></select></div></div>'+
  '<div class="fields"><div class="field"><label for="bulkValue">Prosent (+/−) eller fast beløp (kr)</label><input id="bulkValue" type="number" step="0.01" value="0"></div>'+
  '<div class="field"><label for="bulkNote">Begrunnelse</label><input id="bulkNote" maxlength="180" value="Administrativ prisjustering"></div></div>'+
  '<div class="row"><button id="bulkPreview" class="btn secondary" type="button">Vis forslag</button><button id="bulkSave" class="btn outline" type="button" disabled>Lagre utkast (ikke aktiv pris)</button></div>'+
  '<p id="bulkStatus" class="status" role="status"></p><div id="bulkResults" class="tablewrap"></div></div>';
  function say(id,message,ok=false) {const node=$(id);node.textContent=message;node.className=ok?"status oknote":"status error";}
  function inputPlan() {
    const raw=$("campaignDiscount").value,percent=Number(raw);
    const p={name:$("campaignName").value.trim(),percent,from:$("campaignFrom").value,to:$("campaignTo").value,
      scope:$("campaignScope").value,group:$("campaignGroup").value};
    if(!p.name||!raw.trim()||!Number.isFinite(percent)||percent<0||percent>100)throw Error("Skriv navn og gyldig rabatt 0–100 %.");
    if(!/^\d{4}-\d{2}-\d{2}$/.test(p.from)||!/^\d{4}-\d{2}-\d{2}$/.test(p.to)||p.from>p.to)throw Error("Velg en gyldig datoperiode.");
    if((Date.parse(p.to)-Date.parse(p.from))/86400000>365)throw Error("Maks ett år per plan.");
    return p;
  }
  function priceRow(resource,minutes,group) {
    return matrix.find(x=>x.resource===resource && Number(x.minutes)===Number(minutes) && x.group===group);
  }
  function campaignPrice(regularOre,groupOre,discountPercent,employee){
    // Never compound public campaign and non-employee group discounts.
    const campaignOre=roundOre(regularOre*(100-discountPercent)/100);
    return employee ? roundOre(groupOre*(100-discountPercent)/100) : Math.min(groupOre,campaignOre);
  }
  function buildCampaign() {
    const p=inputPlan(),allPublic=matrix.filter(x=>x.group==="public"&&(p.scope==="all"||p.scope===x.resource));
    if(!allPublic.length)throw Error("Ingen ordinærpriser tilgjengelige. Oppdater prislisten.");
    const lines=[];
    for(const x of allPublic){
      const regularOre=Number(x.ore);
      if(!Number.isSafeInteger(regularOre)||regularOre<0)continue;
      const selected=p.group==="all"?groups:[p.group];
      for(const g of selected){
        const gr=g==="public"?x:priceRow(x.resource,x.minutes,g);
        if(!gr)continue; // No guessed membership prices.
        const groupOre=Number(gr.ore);
        if(!Number.isSafeInteger(groupOre)||groupOre<0)continue;
        const finalOre=campaignPrice(regularOre,groupOre,p.percent,g==="ansatte");
        lines.push({resource:x.resource,minutes:Number(x.minutes),group:g,regularOre,groupOre,finalOre,
          source:g==="ansatte"?"Kombinert ansattrabatt":groupOre<=roundOre(regularOre*(100-p.percent)/100)?"Gruppepris":"Kampanjepris"});
      }
    }
    if(!lines.length)throw Error("Ingen verifiserte visningspriser for utvalget.");
    return {p,lines};
  }
  function displayCampaign(){
    try{
      const res=buildCampaign();preview=res.lines;
      $("campaignSummary").textContent=res.lines.length+" priseksempler for "+res.p.from+" – "+res.p.to+" · "+res.p.percent+" % kampanje. Priser fra Booking 2.0-visningsmatrisen; faktisk kassepris er ikke kontrollert.";
      const shown=res.lines.slice(0,100);
      $("campaignResults").innerHTML=table(["Aktivitet","Varighet","Kundegruppe","Ordinærpris","Gruppepris","Beregnet kampanjepris","Regel"],
        shown.map(x=>'<tr><td>'+esc(resLabel[x.resource]||x.resource)+'</td><td>'+esc(x.minutes)+' min</td><td>'+esc(groupLabel[x.group]||x.group)+'</td><td>'+esc(nok(x.regularOre))+'</td><td>'+esc(nok(x.groupOre))+'</td><td><strong>'+esc(nok(x.finalOre))+'</strong></td><td>'+esc(x.source)+'</td></tr>'));
      say("campaignStatus","Beregning klar. Dette er ingen aktiv rabatt.",true);
      if(res.lines.length>shown.length)$("campaignSummary").textContent+=" Viser de første 100.";
    }catch(e){preview=[];$("campaignResults").innerHTML="";say("campaignStatus",e.message);}
  }
  function saveCampaignLocal(){
    try{
      const p=inputPlan();
      // Only the config is persisted, never customer or pricing data.
      localStorage.setItem(localKey,JSON.stringify({...p,savedAt:new Date().toISOString()}));
      say("campaignStatus","Plan lagret i denne nettleseren. Ikke aktivert i Booking 2.0 eller Quickbutik.",true);
    }catch(e){say("campaignStatus",e.message);}
  }
  function restoreCampaign(){
    try{
      const text=localStorage.getItem(localKey);if(!text)throw Error("Ingen kampanjeplan lagret i denne nettleseren.");
      const p=JSON.parse(text);
      $("campaignName").value=p.name||"Black Week";$("campaignDiscount").value=p.percent;
      $("campaignFrom").value=p.from||"";$("campaignTo").value=p.to||"";
      $("campaignScope").value=p.scope||"all";$("campaignGroup").value=p.group||"all";
      displayCampaign();
    }catch(e){say("campaignStatus",e.message);}
  }
  function makeBulkPreview(){
    bulkPreview=[];$("bulkSave").disabled=true;
    try {
      const resource=$("bulkResource").value,group=$("bulkGroup").value,method=$("bulkMethod").value;
      const raw=$("bulkValue").value,val=Number(raw);
      if(!raw.trim()||!Number.isFinite(val))throw Error("Angi en gyldig prisendring.");
      if(method==="percent"&&(val<=-100||val>1000))throw Error("Prosent må være større enn −100 og maks 1000.");
      if(method==="fixed"&&(val<0||val>100000))throw Error("Fastpris må være mellom 0 og 100 000 kr.");
      const filtered=matrix.filter(x=>(resource==="all"||x.resource===resource)&&(group==="all"||x.group===group));
      for(const x of filtered) {
        const old=Number(x.ore),ore=method==="fixed"?Math.round(val*100):roundOre(old*(1+val/100));
        if(!Number.isSafeInteger(old)||!Number.isSafeInteger(ore)||ore<0||ore>10000000)continue;
        if(ore!==old)bulkPreview.push({resource:x.resource,minutes:x.minutes,group:x.group,old,ore});
      }
      if(bulkPreview.length>250)throw Error("For mange prisrader. Begrens aktivitet eller kundegruppe (maks 250 utkast).");
      $("bulkSave").disabled=!bulkPreview.length;
      $("bulkResults").innerHTML=table(["Aktivitet","Varighet","Gruppe","Nå (visning)","Foreslått (utkast)"],
        bulkPreview.slice(0,100).map(x=>'<tr><td>'+esc(resLabel[x.resource]||x.resource)+'</td><td>'+esc(x.minutes)+' min</td><td>'+esc(groupLabel[x.group]||x.group)+'</td><td>'+esc(nok(x.old))+'</td><td><strong>'+esc(nok(x.ore))+'</strong></td></tr>'));
      say("bulkStatus",bulkPreview.length+" forslag. Bare admin-utkast; ingen priser endres i kassen.",true);
    }catch(e){bulkPreview=[];$("bulkResults").innerHTML="";say("bulkStatus",e.message);}
  }
  async function saveBulk(){
    if(!approved()||saving||!bulkPreview.length)return;
    if(!confirm("Lagre "+bulkPreview.length+" prisutkast i Booking 2.0? Ingen priser endres i Quickbutik eller aktiv kasse."))return;
    saving=true;$("bulkSave").disabled=true;$("bulkPreview").disabled=true;
    let saved=0;const failed=[];
    for(const row of bulkPreview){
      try{
        await api("/admin/price-draft","POST",{resource:row.resource,group:row.group,minutes:Number(row.minutes),ore:row.ore,note:$("bulkNote").value.trim().slice(0,180)});
        saved++;
      }catch(e){failed.push({row,error:e.message});if(/401|403|unauthor|forbidden/i.test(e.message))break;}
      say("bulkStatus","Lagrer prisutkast: "+saved+" av "+bulkPreview.length+" · "+failed.length+" feil.",false);
    }
    saving=false;$("bulkPreview").disabled=false;$("bulkSave").disabled=false;
    say("bulkStatus","Lagret "+saved+" utkast. "+failed.length+" feil. Ingen aktiv bookingpris endret.",failed.length===0);
    if(saved)await onDraftsChanged();
  }
  async function loadAll(){
    if(!approved()||loading)return;
    loading=true;
    try{
      const res=await api("/admin/price-matrix");
      if(!Array.isArray(res.prices))throw Error("Prislisten mangler.");
      matrix=res.prices;displayCampaign();
    }catch(e){say("campaignStatus","Kunne ikke hente Booking 2.0-priser: "+e.message);}
    finally{loading=false;}
  }
  $("campaignFrom").value="2026-11-23";$("campaignTo").value="2026-11-29";
  $("campaignPreview").onclick=displayCampaign;
  $("campaignSave").onclick=saveCampaignLocal;
  $("campaignReload").onclick=restoreCampaign;
  $("bulkPreview").onclick=makeBulkPreview;
  $("bulkSave").onclick=saveBulk;
  restoreCampaign();
  return {loadAll};
}
