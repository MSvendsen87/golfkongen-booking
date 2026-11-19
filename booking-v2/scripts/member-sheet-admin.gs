// GolfKongen medlemsliste: eksisterende GET + signert admin-POST.
// Kjor gkOpprettAdminNokkel en gang. Nokkel finnes deretter under
// Prosjektinnstillinger > Skriptegenskaper > GK2_MEMBER_SHEET_SECRET.
// Samme verdi legges i Supabase Edge Function Secrets. Ikke del nokkelen.
const GK_SHEET_ID = "17jhezENGfYxgIV-Rzwrippc054vLERH5j4dUwlvXxb8";
const GK_GROUPS = ["ansatte","teamgolfkongen","ambassador","medlemmer","frisbeeklubb","dartklubb"];
function gkOpprettAdminNokkel() {
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty("GK2_MEMBER_SHEET_SECRET"))
    p.setProperty("GK2_MEMBER_SHEET_SECRET", Utilities.getUuid() + Utilities.getUuid());
}
function gkJson(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
function gkHash(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(x => ("0" + ((x + 256) % 256).toString(16)).slice(-2)).join("");
}
function gkRead() {
  const sheet = SpreadsheetApp.openById(GK_SHEET_ID).getSheetByName("Medlemmer");
  if (!sheet) throw Error("sheet_missing");
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0].map(x => String(x || "").trim().toLowerCase());
  const indexes = ["navn","email","gruppe","aktiv"].map(x => headers.indexOf(x));
  if (indexes.some(x => x < 0)) throw Error("headers_missing");
  const members = [];
  rows.slice(1).forEach((row, index) => {
    const raw = indexes.map(i => String(row[i] == null ? "" : row[i]));
    const name = raw[0].trim(), email = raw[1].trim().toLowerCase();
    if (!name && !email) return;
    members.push({row:index+2,name,email,groups:raw[2].toLowerCase().split(",").map(x=>x.trim()).filter(Boolean),
      active:["ja","yes","true","1","aktiv"].includes(raw[3].trim().toLowerCase()),
      version:gkHash(JSON.stringify(raw))});
  });
  return {sheet,indexes,members};
}
function doGet(e) {
  try {
    const out = gkRead().members.filter(m=>m.active).map(m=>({name:m.name,email:m.email,groups:m.groups,active:true}));
    const callback = e && e.parameter && e.parameter.callback ? String(e.parameter.callback) : "";
    if (callback) {
      if (!/^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*)*$/.test(callback)) return gkJson({error:"invalid_callback"});
      return ContentService.createTextOutput(callback+"("+JSON.stringify(out)+");").setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return gkJson(out);
  } catch (_) { return gkJson({error:"member_source_unavailable"}); }
}
function gkAuthorized(envelope) {
  const secret = PropertiesService.getScriptProperties().getProperty("GK2_MEMBER_SHEET_SECRET") || "";
  if (secret.length < 32 || typeof envelope.payload !== "string" || envelope.payload.length > 10000 ||
      typeof envelope.timestamp !== "string" || !/^\d{10}$/.test(envelope.timestamp) ||
      Math.abs(Date.now()/1000 - Number(envelope.timestamp)) > 120 ||
      typeof envelope.signature !== "string" || !/^[0-9a-f]{64}$/.test(envelope.signature)) return false;
  const signature = Utilities.computeHmacSha256Signature(envelope.timestamp+"."+envelope.payload, secret, Utilities.Charset.UTF_8)
    .map(x => ("0" + ((x + 256) % 256).toString(16)).slice(-2)).join("");
  let diff = 0;
  for (let i=0;i<64;i++) diff |= signature.charCodeAt(i)^envelope.signature.charCodeAt(i);
  return diff === 0;
}
function doPost(e) {
  let lock;
  try {
    const raw = e && e.postData ? e.postData.contents : "";
    if (raw.length > 16000) return gkJson({ok:false,code:"invalid_request"});
    const envelope = JSON.parse(raw);
    if (!gkAuthorized(envelope)) return gkJson({ok:false,code:"forbidden"});
    const b = JSON.parse(envelope.payload);
    if (!["list","save"].includes(b.action)) return gkJson({ok:false,code:"invalid_action"});
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return gkJson({ok:false,code:"busy"});
    const source = gkRead();
    if (b.action === "list") return gkJson({ok:true,members:source.members,source:"google_sheet"});
    if (typeof b.email !== "string" || b.email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email) ||
        typeof b.name !== "string" || !b.name.trim() || b.name.length>160 || /[\x00-\x1f\x7f]/.test(b.name) ||
        !Array.isArray(b.groups) || !b.groups.length || b.groups.length>6 || b.groups.some(g=>!GK_GROUPS.includes(g)) ||
        new Set(b.groups).size!==b.groups.length || typeof b.active !== "boolean" ||
        typeof b.version !== "string") return gkJson({ok:false,code:"invalid_member"});
    const email = b.email.trim().toLowerCase();
    const matches = source.members.filter(m=>m.email===email);
    if (matches.length>1) return gkJson({ok:false,code:"duplicate_email"});
    const old = matches[0];
    if ((old && old.version!==b.version) || (!old && b.version!==""))
      return gkJson({ok:false,code:"source_changed"});
    const row = old ? old.row : source.sheet.getLastRow()+1;
    // Write only the four known columns. Leading apostrophe prevents formula input.
    const text = x => /^[=+@\-']/.test(x) ? "'"+x : x;
    [text(b.name.trim()),text(email),b.groups.join(","),b.active?"ja":"nei"].forEach((value,i)=>
      source.sheet.getRange(row,source.indexes[i]+1).setValue(value));
    SpreadsheetApp.flush();
    const saved = gkRead().members.find(m=>m.row===row);
    if (!saved || saved.email!==email || saved.name!==b.name.trim() || saved.active!==b.active ||
        saved.groups.join(",")!==b.groups.join(",")) return gkJson({ok:false,code:"readback_failed"});
    return gkJson({ok:true,member:saved,source:"google_sheet"});
  } catch (_) { return gkJson({ok:false,code:"member_source_unavailable"}); }
  finally { if (lock) lock.releaseLock(); }
}
