// GolfKongen Booking 2.0 — Quickbutik /aktiviteter loader.
// Can be included from the Quickbutik theme's Body End. Does nothing on other pages.
// Checkout remains independently gated by gk-booking-v2 /window + 8 release gates.
(function(){
 'use strict';
 if(location.pathname.replace(/\/$/,'')!=='/aktiviteter')return;
 if(document.getElementById('gk2-activities-loader-loaded'))return;
 const marker=document.createElement('span');
 marker.id='gk2-activities-loader-loaded';marker.hidden=true;
 document.body.appendChild(marker);
 function mount(){
  let anchor=document.getElementById('gk2-booking-anchor');
  if(!anchor){
   anchor=document.createElement('div');
   anchor.id='gk2-booking-anchor';
   anchor.style.cssText='max-width:1180px;margin:32px auto;padding:0 12px;scroll-margin-top:80px;';
   const root=document.querySelector('#gk-aktiviteter')||
    document.querySelector('main article')||document.querySelector('main')||
    document.querySelector('#content')||document.body;
   root.appendChild(anchor);
  }
  if(document.querySelector('script[data-gk2-native-loader]'))return;
  const script=document.createElement('script');
  script.src='https://msvendsen87.github.io/golfkongen-booking/booking/embed.js?v=20261027-install-v2';
  script.dataset.gk2NativeLoader='1';
  script.defer=true;
  document.body.appendChild(script);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
 else mount();
})();
