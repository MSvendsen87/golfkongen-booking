/* Routing only. The signed server webhook remains payment and balance authority. */
(function(){
 'use strict';
 if(window.__gkPunchReceipt)return;window.__gkPunchReceipt=true;
 const key='gk_punch_receipt_v1',ttl=30*60*1000;
 function product(row){
  const item=row?.item||row||{};
  return ['1160','1161'].includes(String(item.product_id||item.productId||item.raw_id||row?.product_id||'').replace(/^prod_/,''))||['1160','1161'].includes(String(item.sku||row?.sku||''));
 }
 function save(isCard){
  try{if(isCard)localStorage.setItem(key,JSON.stringify({at:Date.now()}));else localStorage.removeItem(key)}catch(_){}
 }
 function cart(data){
  if(!Array.isArray(data?.items)||!data.items.length)return;
  save(data.items.every(product));
 }
 function hook(name,handler){
  if(typeof window[name]!=='function')return;
  const original=window[name];
  window[name]=function(){try{handler(arguments[0])}catch(_){}return original.apply(this,arguments)};
 }
 const order=/^\/success\/([1-9][0-9]{0,8})(?=\/|-|$)/.exec(location.pathname);
 if(order){
  try{
   const marker=JSON.parse(localStorage.getItem(key)||'null');
   localStorage.removeItem(key);
   const age=Date.now()-Number(marker?.at);
   if(marker&&Number.isFinite(age)&&age>=0&&age<=ttl)
    location.replace('https://msvendsen87.github.io/golfkongen-booking/booking/klippekort-takk/?order='+encodeURIComponent(order[1]));
  }catch(_){}
  return;
 }
 hook('QS_CART_SET',cart);
 hook('QS_CART_PRODUCT_ADDED',data=>{if(Array.isArray(data?.items))cart(data);else if(product(data))save(true)});
})();
