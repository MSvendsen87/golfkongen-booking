import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {benefitPreview} from '../../docs/booking/admin/benefit-controls.mjs';
const source=readFileSync(new URL('../../docs/booking/member-popup-admin-linked.js',import.meta.url),'utf8');
function instance(fetchImpl){
 const code=source.replace('  if (document.readyState === "loading") {','  globalThis.testApi={CONFIG,resolveBenefits,refreshBenefitTexts,escapeHtml};\n  if (document.readyState === "loading") {');
 const c={document:{readyState:'loading',addEventListener(){}},fetch:fetchImpl,AbortController,setTimeout,clearTimeout,console};vm.createContext(c);vm.runInContext(code,c);return c.testApi;
}
test('staff 98% wins over club membership and club-night line is not duplicated',()=>{
 const api=instance();const r=api.resolveBenefits(['frisbeeklubb','ansatte','dartklubb']);
 assert(r.lines.includes('98% rabatt på booking av disc simulator'));assert(r.lines.includes('98% rabatt på booking av dart'));
 assert(!r.lines.includes('Disc simulator til 120 kr timen'));assert.equal(r.lines.filter(x=>x==='Tilgang til klubbkvelder').length,1);
});
test('admin text edit is fetched; legacy member retains only original disc benefit',async()=>{
 const api=instance(async()=>({ok:true,json:async()=>({ok:true,schemaVersion:1,groups:{ansatte:{label:'Ansatte',retailText:'Oppdatert butikktekst',discBookingText:'98% simulator',dartBookingText:'98% dart',clubNightText:'Klubbkveld',retailPriority:100,discBookingPriority:100,dartBookingPriority:100}}})}));
 await api.refreshBenefitTexts();assert(api.resolveBenefits(['ansatte']).lines.includes('Oppdatert butikktekst'));
 assert.deepEqual(Array.from(api.resolveBenefits(['medlemmer']).lines),['Disc simulator til 100 kr timen']);
});
test('unavailable config preserves popup fallback and preview escapes untrusted text',async()=>{
 const api=instance(async()=>{throw Error('offline')});await api.refreshBenefitTexts();
 assert(api.resolveBenefits(['ansatte']).lines.includes('98% rabatt på booking av dart'));
 const html=benefitPreview({label:'<script>bad</script>',retailText:'<img onerror=bad>',discBookingText:'',dartBookingText:'',clubNightText:''},api.escapeHtml);
 assert(!html.includes('<script>bad'));assert(!html.includes('<img onerror'));assert(html.includes('&lt;script&gt;'));
});
