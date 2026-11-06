const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
class Element {
 constructor(){this.children=[];this.classList={toggle:(name,on)=>this.marked=on};this.dataset={};}
 append(child){this.children.push(child);}
 createTHead(){return new Element();}
 createTBody(){this.body=new Element();return this.body;}
 insertRow(){const row=new Element();row.sectionRowIndex=this.children.length;this.append(row);return row;}
 insertCell(){const cell=new Element();cell.cellIndex=this.children.length;this.append(cell);return cell;}
 setAttribute(){}
 replaceChildren(child){this.children=[child];}
 querySelectorAll(){return this.children[0].body.children;}
 get cells(){return this.children;}
 get firstElementChild(){return this.children[0];}
 focus(){}
}
test('click handlers extend, shorten and clear the selected range and total',()=>{
 const html=readFileSync('docs/booking/index.html','utf8');
 const nodes={};const $=id=>nodes[id]??=new Element();
 $('gk-v2-resource').value='hyzr';$('gk-v2-duration').value=30;$('gk-v2-sets-qty').value=0;
 const context={$,selected:null,document:{createElement:()=>new Element(),getElementById:$},PUBLIC_PRICES:JSON.parse(readFileSync('booking-v2/data/public-prices.json','utf8')),advanceFinishedDay:()=>false,bookingStartOpen:()=>true,CONF:{checkoutVerified:false},canUseQuickbutikCart:()=>false};
 vm.createContext(context);
 vm.runInContext(html.slice(html.indexOf('function priceFor('),html.indexOf('function refreshDartSets(')),context);
 context.render({day:'2026-11-07',bookingEnabled:true,openingHoursByResource:{hyzr:{from:600,to:1320}},claims:[{resource:'hyzr',slot_min:900}]});
 const click=time=>$('gk-v2-times').querySelectorAll().find(row=>row.children[0].textContent===time).children[1].children[0].onclick();
 const check=(count,total)=>{assert.equal($('gk-v2-times').querySelectorAll().filter(row=>row.children[1].children[0].marked).length,count);assert.match($('gk-v2-summary').innerHTML,total);};
 click('16:30');check(1,/16:30–17:00 · 90 kr/);
 click('17:00');check(2,/16:30–17:30 · 150 kr/);
 click('17:30');check(3,/16:30–18:00 · 240 kr/);
 click('17:00');check(2,/16:30–17:30 · 150 kr/);
 click('16:30');assert.equal(context.selected,null);
 click('14:30');click('15:30');check(1,/15:30–16:00 · 90 kr/);
});
