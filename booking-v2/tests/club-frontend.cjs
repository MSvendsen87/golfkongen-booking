const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));let authed=false,held=null,items=[];
 const sku='GK2-CLUB-2026-11-05-0123456789abcdef0123456789abcdef';
 await page.route('https://esm.sh/**',route=>route.fulfill({contentType:'text/javascript',body:'export function createClient(){return {auth:{getSession:async()=>({data:{session:null}}),verifyOtp:async()=>{window.__verified=true;return {error:null}},signOut:async()=>{window.__verified=false;return {error:null}}}}}'}));
 await page.route('https://eadgdcimcmfyuicizboo.supabase.co/**',async route=>{
  const p=new URL(route.request().url()).pathname.split('/gk-booking-v2')[1];
  if(p==='/club/me'){authed=await page.evaluate(()=>!!window.__verified);return route.fulfill({status:authed?200:403,contentType:'application/json',body:JSON.stringify(authed?{ok:true,email:'test@example.com'}:{ok:false,code:'membership_required'})});}
  if(p==='/club/calendar')return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,days:[{date:'2026-11-05',remaining:10,canBook:true},{date:'2026-11-12',remaining:0,canBook:false,reason:'dart_reserved'}]})});
  if(p==='/club/login')return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,message:'Kode sendt'})});
  if(p==='/club/hold'){held=JSON.parse(route.request().postData());return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,holdId:'test',productId:1507,variantId:1234,sku})});}
 });
 await page.route('https://golfkongen.no/**',route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/cart/add'){
   const data=new URLSearchParams(route.request().postData());const variant=Number(data.get('variant')||0);
   items.push({qty:1,is_variant:variant?1:0,item:{sku:variant?sku:'1318',raw_id:variant||1318}});
   return route.fulfill({contentType:'application/json',body:JSON.stringify({success:1,items})});
  }
  if(url.pathname==='/cart/index')return route.fulfill({contentType:'text/html',body:'<html><body>Handlekurv</body></html>'});
  return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><style>body{margin:0;background:#0d0d0d;font-family:Arial}</style></head><body><div id="gk-clubgate"></div></body></html>'});
 });
 await page.goto('https://golfkongen.no/sider/klubbkveld-lyngdal-dart');
 await page.addScriptTag({content:fs.readFileSync('docs/booking/clubgate-v2.js','utf8')});
 await page.waitForSelector('[data-book]');assert(await page.locator('[data-book]').first().isDisabled());
 await page.fill('#gk-club-email','test@example.com');await page.click('#gk-club-login button');await page.fill('#gk-club-code','123456');await page.click('#gk-club-verify button');
 await page.waitForSelector('#gk-club-options:not([hidden])');
 assert.equal(await page.locator('[data-book="2026-11-12"]').isDisabled(),true);
 await page.check('#gk-club-rental');await page.check('#gk-club-terms');
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
 await page.screenshot({path:'/tmp/gk-club-mobile-qa.png',fullPage:true});
 await page.click('[data-book="2026-11-05"]');await page.waitForURL('**/cart/index');
 assert.equal(held.rentalSets,1);assert.equal(held.acceptedTerms,true);assert.equal(items.length,2);assert.deepEqual(errors,[]);
 await browser.close();console.log('PASS mobile: verified membership, blocked date, terms, rental and verified cart');
})().catch(e=>{console.error(e);process.exit(1)});
