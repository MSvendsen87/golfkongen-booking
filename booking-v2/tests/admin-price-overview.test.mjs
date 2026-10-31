import test from 'node:test';
import assert from 'node:assert/strict';
import {setupPriceControls} from '../../docs/booking/admin/price-controls.mjs';

test('overview uses shared display prices, approval statuses, filters and refreshed data',async()=>{
 const savedDocument=globalThis.document;
 const nodes={};
 for(const id of ['priceCount','priceRefresh','gFilter','rFilter','sFilter','pFilter','priceQueue','queuePages','queueAll','draftQueue','qbCompare','qbCompareResult'])
  nodes[id]={value:['gFilter','rFilter','sFilter'].includes(id)?'all':'',innerHTML:'',textContent:'',classList:{toggle(){}},querySelectorAll:()=>[]};
 let markup='';
 const panel={insertAdjacentHTML:(_pos,html)=>{markup=html},querySelector:s=>nodes[s.slice(1)]};
 globalThis.document={querySelector:()=>panel};
 let queue=[{resource:'dart_a',group:'ansatte',minutes:60,quickbutikProductId:1486,expectedOre:240,stage:'manual_checked',manualChecked:true},
 {resource:'hyzr',group:'ansatte',minutes:60,quickbutikProductId:1477,expectedOre:300,stage:'pending_manual',manualChecked:false}];
 try{
  const ui=setupPriceControls({api:async path=>path==='/admin/group-price-queue'?{queue}:{drafts:[]},approved:()=>true,
   esc:x=>String(x??''),table:(_columns,rows)=>rows.join(''),resLabel:{dart_a:'Dart A',hyzr:'HYZR'},groupLabel:{ansatte:'Ansatte'}});
  await ui.loadAll();
  assert.match(nodes.priceQueue.innerHTML,/2,40/);
  assert.match(nodes.priceQueue.innerHTML,/3,00/);
  assert.match(nodes.priceQueue.innerHTML,/Manuelt kontrollert – OK/);
  assert.match(nodes.priceCount.textContent,/1 manuelt kontrollert/);
  assert(!markup.includes('Meldt lagt inn'));
  assert(!nodes.priceQueue.innerHTML.includes('ikke kassetestet'));
  nodes.sFilter.value='manual_checked';nodes.sFilter.onchange();
  assert(nodes.priceQueue.innerHTML.includes('Dart A'));assert(!nodes.priceQueue.innerHTML.includes('HYZR'));
  queue=queue.map(r=>({...r,stage:'pending_manual',manualChecked:false}));
  nodes.sFilter.value='all';await ui.loadQueue();
  assert.match(nodes.priceCount.textContent,/0 manuelt kontrollert/);
  assert(!nodes.priceQueue.innerHTML.includes('Manuelt kontrollert – OK'));
  assert.match(nodes.priceQueue.innerHTML,/2,40/);
 }finally{globalThis.document=savedDocument;}
});
