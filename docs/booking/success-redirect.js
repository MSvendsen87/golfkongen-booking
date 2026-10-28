// GolfKongen Booking 2.0 – install this script once as site-wide Quickbutik custom JS.
// No payment or customer data is handled here. Only a recent, local booking checkout
// marker on Quickbutik's native successful-payment page triggers the redirect.
(()=>{'use strict';
 const match=/^\/success\/([1-9][0-9]{0,8})\/?$/.exec(location.pathname);
 if(!match)return;
 const key='gk2_pending_success_v1';
 try{
  const pending=JSON.parse(localStorage.getItem(key)||'null');
  if(!pending||typeof pending.createdAt!=='number'||
     Date.now()-pending.createdAt<0||Date.now()-pending.createdAt>30*60*1000||
     !/^20\d{2}-\d{2}-\d{2}-\d{4}-\d{4}$/.test(String(pending.sku||''))){
   localStorage.removeItem(key);return;
  }
  localStorage.removeItem(key);
  location.replace('https://msvendsen87.github.io/golfkongen-booking/booking/takk/?order='+encodeURIComponent(match[1]));
 }catch(_error){/* keep original Quickbutik success page if storage is unavailable */}
})();
