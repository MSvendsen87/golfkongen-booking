(function () {

console.log("[GK BOOKING v23] LOADED");

// PRODUKTER
var PRODUCT_A = "1316";
var PRODUCT_B = "1317";
var PRODUCT_SETS = "1318";
var PRODUCT_COFFEE = "1319";

var EVENT_ID = "9847005";
var API_BASE = "https://cold-shadow-36dc.post-cd6.workers.dev/products/";

var path = location.pathname.replace(/\/$/, "");
if (path !== "/sider/dart-booking") return;

var root = document.getElementById("gk-booking");
var status = document.getElementById("gk-booking-status");
var daysEl = document.getElementById("gk-booking-days");

if (!root || !status || !daysEl) return;

status.innerHTML = "";
daysEl.innerHTML = "";

// UI TOPBAR
var topbar = document.createElement("div");
topbar.style.display = "flex";
topbar.style.gap = "20px";
topbar.style.alignItems = "center";
topbar.style.marginBottom = "10px";

root.insertBefore(topbar, status);

// PILSETT
var setsQty = 0;

var setsWrap = document.createElement("div");
setsWrap.innerHTML = "<strong>Leie pilsett</strong>";
topbar.appendChild(setsWrap);

var setsMinus = document.createElement("button");
setsMinus.textContent = "-";
setsWrap.appendChild(setsMinus);

var setsVal = document.createElement("span");
setsVal.textContent = "0";
setsVal.style.margin = "0 6px";
setsWrap.appendChild(setsVal);

var setsPlus = document.createElement("button");
setsPlus.textContent = "+";
setsWrap.appendChild(setsPlus);

setsMinus.onclick = function(){
if(setsQty>0) setsQty--;
setsVal.textContent = setsQty;
};

setsPlus.onclick = function(){
if(setsQty<8) setsQty++;
setsVal.textContent = setsQty;
};

// KAFFE
var coffeeQty = 0;

var coffeeWrap = document.createElement("div");
coffeeWrap.innerHTML = "<strong>Kaffe / te</strong>";
topbar.appendChild(coffeeWrap);

var coffeeMinus = document.createElement("button");
coffeeMinus.textContent = "-";
coffeeWrap.appendChild(coffeeMinus);

var coffeeVal = document.createElement("span");
coffeeVal.textContent = "0";
coffeeVal.style.margin = "0 6px";
coffeeWrap.appendChild(coffeeVal);

var coffeePlus = document.createElement("button");
coffeePlus.textContent = "+";
coffeeWrap.appendChild(coffeePlus);

coffeeMinus.onclick = function(){
if(coffeeQty>0) coffeeQty--;
coffeeVal.textContent = coffeeQty;
};

coffeePlus.onclick = function(){
if(coffeeQty<8) coffeeQty++;
coffeeVal.textContent = coffeeQty;
};

// ADD TO CART
function addProduct(product, qty, done){

if(!product || qty<=0){ done(); return; }

fetch("/cart/add",{
method:"POST",
headers:{
"Content-Type":"application/x-www-form-urlencoded"
},
body:"product_id="+product+"&qty="+qty+"&eventId="+EVENT_ID+"&page=product",
credentials:"same-origin"
})
.then(function(){done();})
.catch(function(){done();});
}

function addVariant(product, variant, done){

fetch("/cart/add",{
method:"POST",
headers:{
"Content-Type":"application/x-www-form-urlencoded"
},
body:"product_id="+product+"&variant="+variant+"&qty=1&eventId="+EVENT_ID+"&page=product",
credentials:"same-origin"
})
.then(function(){done(true);})
.catch(function(){done(false);});
}

// SLOT
function parseDT(v){

var date="",time="";

if(v.values){

for(var i=0;i<v.values.length;i++){

var n=v.values[i].name.toLowerCase();

if(n.indexOf("dag")>-1) date=v.values[i].val;
if(n.indexOf("tid")>-1) time=v.values[i].val;

}

}

return{date:date,time:time};
}

function passed(date,time){

var start=time.split("-")[0];
var d=new Date(date+"T"+start+":00");

return d.getTime()<Date.now();

}

function buildIndex(vars,product,lane){

var map={};

for(var i=0;i<vars.length;i++){

var v=vars[i];

if(parseInt(v.qty)<=0) continue;

var dt=parseDT(v);

if(!dt.date||!dt.time) continue;
if(passed(dt.date,dt.time)) continue;

if(!map[dt.date]) map[dt.date]={};
if(!map[dt.date][dt.time]) map[dt.date][dt.time]={};

map[dt.date][dt.time][lane]={
product:product,
variant:v.id,
date:dt.date
};

}

return map;

}

function merge(a,b){

var out={};

for(var d in a){

if(!out[d]) out[d]={};

for(var t in a[d]){

if(!out[d][t]) out[d][t]={};

out[d][t].A=a[d][t].A;

}

}

for(var d2 in b){

if(!out[d2]) out[d2]={};

for(var t2 in b[d2]){

if(!out[d2][t2]) out[d2][t2]={};

out[d2][t2].B=b[d2][t2].B;

}

}

return out;

}

function keys(o){

var arr=[];
for(var k in o) arr.push(k);
arr.sort();
return arr;

}

// LOAD
Promise.all([
fetch(API_BASE+PRODUCT_A).then(r=>r.json()),
fetch(API_BASE+PRODUCT_B).then(r=>r.json())
]).then(function(res){

var mapA=buildIndex(res[0].product.variants,PRODUCT_A,"A");
var mapB=buildIndex(res[1].product.variants,PRODUCT_B,"B");

var slots=merge(mapA,mapB);

var dates=keys(slots);

dates.forEach(function(date){

var box=document.createElement("div");
box.style.border="1px solid #ddd";
box.style.margin="10px 0";
box.style.padding="10px";

var title=document.createElement("h3");
title.textContent=date;
box.appendChild(title);

var times=keys(slots[date]);

times.forEach(function(time){

var row=document.createElement("div");
row.style.margin="5px 0";

var t=document.createElement("strong");
t.textContent=time+" ";
row.appendChild(t);

function makeBtn(txt,slot){

var b=document.createElement("button");
b.textContent=txt;
b.style.marginLeft="6px";

b.onclick=function(){

b.disabled=true;

addProduct(PRODUCT_SETS,setsQty,function(){

addProduct(PRODUCT_COFFEE,coffeeQty,function(){

addVariant(slot.product,slot.variant,function(ok){

if(ok) b.textContent="Lagt til";
else{
b.disabled=false;
b.textContent="Prøv igjen";
}

});

});

});

};

return b;

}

if(slots[date][time].A)
row.appendChild(makeBtn("Bane A",slots[date][time].A));

if(slots[date][time].B)
row.appendChild(makeBtn("Bane B",slots[date][time].B));

box.appendChild(row);

});

daysEl.appendChild(box);

});

});

})();
