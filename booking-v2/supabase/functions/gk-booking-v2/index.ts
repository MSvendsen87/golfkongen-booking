import {auditDayCatalog,PRODUCT_IDS} from "./checkout-preflight.mjs";
import {auditQuickbutikOrder,loadV1OrderRecord} from "./quickbutik-order-audit.mjs";
import {checkV1BookingPayment} from "./quickbutik-v1-payment-check.mjs";
import {expectedSlotSku} from "./payment-validation.mjs";
import {mutateHeldCartVariant} from "./quickbutik-cart-variant.mjs";
import {verifyQuickbutikWebhook} from "./quickbutik-webhook-guard.mjs";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
const url=Deno.env.get("SUPABASE_URL")||"";
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const origins=new Set(["https://golfkongen.no","https://www.golfkongen.no","https://app.golfkongen.no","https://eadgdcimcmfyuicizboo.supabase.co","https://msvendsen87.github.io"]);
const allowedEmails=new Set(["post@golfkongen.no","kristoffer.mrk@gmail.com"]);
const db=url&&serviceKey?createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}}):null;
const getCors=(origin:string)=>origin&&origins.has(origin)?{"Access-Control-Allow-Origin":origin,"Vary":"Origin"}:{};
function reply(data:unknown,status=200,origin=""){
 return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff",...getCors(origin)}});
}
function err(code:string,status=400,origin=""){return reply({ok:false,code},status,origin)}
function validDate(s:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const t=new Date(s+"T12:00:00Z");return !Number.isNaN(t.valueOf())&&t.toISOString().slice(0,10)===s}
async function body(req:Request){const raw=await req.text();if(raw.length>12000)throw new Error("payload_too_large");return JSON.parse(raw)}
async function admin(req:Request){
 if(!db)return null;
 const header=req.headers.get("authorization")||"";
 if(!header.startsWith("Bearer ")||header.length>7000)return null;
 const {data,error}=await db.auth.getUser(header.slice(7));
 const user=data?.user,email=user?.email?.toLowerCase().trim();
 if(error||!user||!email||!user.email_confirmed_at||!allowedEmails.has(email))return null;
 const {data:valid,error:checkError}=await db.rpc("gk2_is_admin",{p_email:email});
 if(checkError||valid!==true)return null;
 return {email,id:user.id};
}
async function rpc(method:string,args:Record<string,unknown>){
 if(!db)throw new Error("server_not_configured");
 const {data,error}=await db.rpc(method,args);
 if(error)throw new Error("rpc_failed:"+method+":"+error.code);
 return data;
}
Deno.serve(async (req:Request)=>{
 const origin=req.headers.get("origin")||"";
 if(origin&&!origins.has(origin))return err("forbidden_origin",403,origin);
 const allow={"Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Max-Age":"600"};
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{...getCors(origin),...allow}});
 if(!db)return err("backend_not_ready",503,origin);
 const requestPath=new URL(req.url).pathname;
 const slug="/gk-booking-v2";
 const pos=requestPath.indexOf(slug);
 const p0=pos>=0?requestPath.slice(pos+slug.length):requestPath;
 const path=p0.endsWith("/")&&p0.length>1?p0.slice(0,-1):p0||"/";
 const u=new URL(req.url);
 try{
  if(req.method==="GET"&&path==="/admin")return new Response(null,{status:302,headers:{"Location":"https://msvendsen87.github.io/golfkongen-booking/","Cache-Control":"no-store"}});
  if(req.method==="GET"&&path==="/health")return reply({ok:true,environment:"staging",bookingEnabled:false,checkout:false},200,origin);
  if(req.method==="GET"&&path==="/window"){
    // Derived on every request from Europe/Oslo PostgreSQL clock, no cron required for new dates.
    const window=await rpc("gk2_booking_window",{});
    return reply({ok:true,...window,checkoutEnabled:false,
      explanation:"The 45-day calendar rolls daily; Quickbutik variants and payments must be configured separately."},200,origin);
  }
  if(req.method==="GET"&&path==="/availability"){
   const day=u.searchParams.get("date")||"";
   if(!validDate(day))return err("invalid_date",400,origin);
   const result=await rpc("gk2_day_availability",{p_day:day});
   const safeBlocks=Array.isArray(result.blocks)?result.blocks.map((x:Record<string,unknown>)=>({target:x.target,start_min:x.start_min,end_min:x.end_min})):[];
   return reply({ok:true,day:result.day,claims:result.claims||[],blocks:safeBlocks,openingHoursByResource:result.openingHoursByResource||{},bookingEnabled:result.bookingEnabled===true},200,origin);
  }
  if(req.method==="GET"&&path==="/webhook/quickbutik"){
    // Dual release lock: env + 8 database gates. Until BOTH pass, never
    // acknowledge a paid Quickbutik event or modify a reservation.
    if(Deno.env.get("GK2_WEBHOOK_ENABLED")!=="true")
      return err("webhook_not_enabled",503,origin);
    const gates=await rpc("gk2_release_gates_satisfied",{});
    if(gates!==true)return err("webhook_release_gates_closed",503,origin);
    const verified=await verifyQuickbutikWebhook(u.toString(),Deno.env.get("GK2_WEBHOOK_SECURITYHASH")||"");
    if(!verified.ok)return err("webhook_source_rejected",403,origin);
    if(verified.eventType!=="order.new")
      return err("cancellation_webhook_not_ready",503,origin);
    const apiKey=Deno.env.get("GK2_QUICKBUTIK_API_KEY")||"";
    if(!apiKey)return err("quickbutik_key_not_configured",503,origin);
    try{
      const rawOrder=await loadV1OrderRecord(verified.orderNumber,{apiKey});
      if(!["1","2"].includes(String(rawOrder.status)))
        return err("order_is_not_paid",409,origin);
      let hold=await rpc("gk2_get_bound_checkout",{p_order:verified.orderNumber});
      if(!hold){
        // Same trusted cart-first pattern as legacy booking. A Quickbutik
        // order number does not exist BEFORE the customer opens checkout.
        // Find only an already-held slot with matching customer/product/SKU.
        const bookingLines=(Array.isArray(rawOrder.products)?rawOrder.products:[])
          .filter((x:Record<string,unknown>)=>{
            const pid=Number(x?.product_id);
            return Number.isSafeInteger(pid)&&pid>=1474&&pid<=1506;
          });
        if(bookingLines.length!==1||Number(bookingLines[0]?.qty)!==1)
          return err("order_has_no_unique_booking_line",409,origin);
        const matched=await rpc("gk2_match_paid_order_to_hold",{
          p_order:verified.orderNumber,
          p_product_id:Number(bookingLines[0].product_id),
          p_sku:String(bookingLines[0].sku||""),
          p_customer_email:String(rawOrder.customer?.email||"")
        });
        if(!matched?.matched)
          return err("no_active_matching_precheckout_hold_manual_review",409,origin);
        hold=await rpc("gk2_get_bound_checkout",{p_order:verified.orderNumber});
      }
      if(!hold||!Number.isInteger(Number(hold.checkout_product_id)))
        return err("order_not_bound_to_a_checkout",409,origin);
      const payment=checkV1BookingPayment(rawOrder,{
        reservation:hold,expectedProductId:hold.checkout_product_id,
        expectedPaidOre:hold.quoted_ore,expectedRentalSets:hold.rental_sets_count,
        // Quickbutik calculates and charges customer prices/discounts.
        // V1 gross 'total_amount' is NOT the actual paid net after coupons.
        paymentPolicy:"trusted_status"
      });
      if(!payment.eligible)return err("order_did_not_pass_payment_verification",409,origin);
      const confirmed=await rpc("gk2_confirm_paid_order_status",{
        p_reservation:hold.id,p_order:verified.orderNumber,
        p_event_id:"qb.order.new:"+verified.orderNumber
      });
      if(!["confirmed","paid_unallocated"].includes(confirmed?.status))
        return err("booking_not_confirmed",503,origin);
      return reply({ok:true,bookingStatus:confirmed.status,
        notificationQueued:confirmed.status==="confirmed"},200,origin);
    }catch(_e){
      return err("webhook_processing_failed",503,origin);
    }
  }
  if(req.method==="POST"&&path==="/hold"){
    // Unified old-style Quickbutik checkout: DB hold -> product variant cart.
    // This stays OFF until full release testing. Browser price/group is never
    // used; Quickbutik computes and charges the correct customer group price.
    if(!origin||!origins.has(origin))return err("forbidden_checkout_origin",403,origin);
    if(Deno.env.get("GK2_CHECKOUT_ENABLED")!=="true")
      return err("checkout_not_enabled",503,origin);
    if(await rpc("gk2_release_gates_satisfied",{})!==true)
      return err("checkout_release_gates_closed",503,origin);
    const data=await body(req);
    const key=String(data?.idempotencyKey||""),
      day=String(data?.date||""),resource=String(data?.resource||""),
      start=Number(data?.startMin),minutes=Number(data?.duration),
      rentalSets=Number(data?.rentalSets??0),email=String(data?.email||"");
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)||
       !validDate(day)||!["hyzr","dart_a","dart_b","venue"].includes(resource)||
       !Number.isInteger(start)||start%30!==0||
       !Number.isInteger(minutes)||minutes%30!==0||minutes<30||
       !Number.isInteger(rentalSets)||rentalSets<0||rentalSets>6||
       data?.acceptedTerms!==true||!/^\S+@\S+\.\S+$/.test(email))
      return err("invalid_hold_payload",400,origin);
    const productId=await rpc("gk2_checkout_product_for",{p_resource:resource,p_minutes:minutes});
    if(!Number.isSafeInteger(Number(productId))||Number(productId)<1474||Number(productId)>1506)
      return err("booking_product_not_approved",503,origin);
    const apiKey=Deno.env.get("GK2_QUICKBUTIK_API_KEY")||"";
    if(!apiKey)return err("quickbutik_key_not_configured",503,origin);
    let heldId="";
    try{
      const held=await rpc("gk2_hold_slot",{
        p_key:key,p_day:day,p_resource:resource,p_start:start,
        p_duration:minutes,p_terms:"gk-v1"
      });
      if(held?.status!=="held"||!held?.id)return err("hold_unavailable",409,origin);
      heldId=String(held.id);
      await rpc("gk2_prepare_cart_intent",{
        p_reservation:heldId,p_email:email,
        p_rental_sets:rentalSets,p_terms_accepted:true
      });
      const sku=expectedSlotSku(day,start,start+minutes);
      const variant=await mutateHeldCartVariant({
        productId:Number(productId),sku,action:"open",apiKey
      });
      return reply({ok:true,holdId:heldId,holdExpiresAt:held.hold_expires_at,
        productId:Number(productId),variantId:variant.variantId,
        sku,rentalSets,checkoutEnabled:true},200,origin);
    }catch(_e){
      if(heldId){
        try{
          // Never release the DB hold if the variant cannot first be safely
          // relocked; an uncertain state is kept for manual review.
          const sku=expectedSlotSku(day,start,start+minutes);
          await mutateHeldCartVariant({
            productId:Number(productId),sku,action:"close",apiKey
          });
          await rpc("gk2_abort_precheckout_hold",{p_reservation:heldId});
        }catch(_cleanupError){return err("checkout_manual_review_required",503,origin)}
      }
      return err("hold_checkout_failed",503,origin);
    }
  }
  if(path==="/hold"||path==="/checkout"||path.startsWith("/webhook/")){
   // A working checkout must be verified against Quickbutik with protected server-side price
   // calculation, existing 7 customer groups and authoritative paid order retrieval.
   return err("not_enabled_until_payment_and_safety_tests",503,origin);
  }
  if(!path.startsWith("/admin/"))return err("not_found",404,origin);
  const user=await admin(req);if(!user)return err("admin_forbidden",403,origin);
  if(req.method==="GET"&&path==="/admin/order-audit"){
    // Read-only diagnostic, always after owner-only JWT + allowlist check.
    const order=u.searchParams.get("order")||"";
    if(!/^[1-9][0-9]{0,8}$/.test(order))return err("invalid_order_number",400,origin);
    const key=Deno.env.get("GK2_QUICKBUTIK_API_KEY")||"";
    if(!key)return err("quickbutik_key_not_configured",503,origin);
    const audit=await auditQuickbutikOrder(order,{apiKey:key});
    return reply({ok:true,...audit,bookingConfirmed:false,notificationSent:false},200,origin);
  }
  if(req.method==="GET"&&path==="/admin/health")return reply({ok:true,email:user.email,status:"isolated_staging"},200,origin);
  if(req.method==="GET"&&path==="/admin/snapshot"){
    const day=u.searchParams.get("date")||"";if(!validDate(day))return err("invalid_date",400,origin);
    return reply({ok:true,...await rpc("gk2_admin_snapshot",{p_actor:user.email,p_day:day})},200,origin);
  }
  if(req.method==="GET"&&path==="/admin/checkout-preflight"){
    const day=u.searchParams.get("date")||"";
    if(!validDate(day))return err("invalid_date",400,origin);
    const catalogs=await Promise.all(Object.entries(PRODUCT_IDS).map(async ([resource,pid])=>{
      const response=await fetch("https://cold-shadow-36dc.post-cd6.workers.dev/products/"+pid,{
        headers:{"Accept":"application/json"},signal:AbortSignal.timeout(12000)
      });
      if(!response.ok)throw Error("catalog_unavailable:"+resource);
      const body=await response.json();
      if(!body?.product||!Array.isArray(body.product.variants))throw Error("invalid_catalog:"+resource);
      return [resource,body.product];
    }));
    const stagingIds={hyzr:1474,dart_a:1475,dart_b:1476};
    const stage=await Promise.all(Object.entries(stagingIds).map(async ([resource,pid])=>{
      const response=await fetch("https://cold-shadow-36dc.post-cd6.workers.dev/products/"+pid,{
        headers:{"Accept":"application/json"},signal:AbortSignal.timeout(12000)
      });
      if(!response.ok)throw Error("staging_catalog_unavailable:"+resource);
      const body=await response.json();
      if(!body?.product||!Array.isArray(body.product.variants))throw Error("invalid_staging_catalog:"+resource);
      return {resource,productId:pid,productHidden:body.product.visible===false,
        totalVariants:body.product.variants.length,
        sampleTestVariantExists:body.product.variants.some(v=>v.sku===day+"-1000-1030" && v.hidden===true && Number(v.stock??v.qty)===0),
        readyHalfhours:body.product.variants.filter(v=>v.sku?.startsWith(day+"-")
          && /^\\d{4}-\\d{2}-\\d{2}-\\d{4}-\\d{4}$/.test(v.sku)
          && v.hidden!==true && Number(v.stock??v.qty)>0).length,
        checkoutEnabled:false};
    }));
    return reply({ok:true,...auditDayCatalog({date:day,products:Object.fromEntries(catalogs)}),
      stagingProducts:stage,pricesControlledInAdmin:true,pricesApproved:false,
      checkoutEnabled:false,existingPushoverUntouched:true},200,origin);
  }
  if(req.method==="GET"&&path==="/admin/integration-readiness"){
    const window=await rpc("gk2_booking_window",{});
    const plans=await rpc("gk2_admin_checkout_design",{p_actor:user.email});
    const queue=await rpc("gk2_admin_group_price_queue",{p_actor:user.email});
    const stages=Array.isArray(queue)?queue:[];
    return reply({ok:true,firstBookable:window.firstBookable,lastBookable:window.lastBookable,
      daysAhead:window.daysAhead,
      mappedProducts:Array.isArray(plans)?plans.filter((p:Record<string,unknown>)=>Number.isInteger(p.quickbutikProductId)).length:0,
      readyProducts:Array.isArray(plans)?plans.filter((p:Record<string,unknown>)=>p.isReady===true&&p.publishEnabled===true).length:0,
      specialPriceRequired:stages.length,
      specialPriceReported:stages.filter((p:Record<string,unknown>)=>p.stage==="entered_reported").length,
      specialPriceVerified:stages.filter((p:Record<string,unknown>)=>p.stage==="checkout_verified").length,
      quickbutikOrderReadKeyConfigured:!!Deno.env.get("GK2_QUICKBUTIK_API_KEY"),
      webhookPaidVerificationDeployed:false,
      pushoverPaidFlowValidated:false,legacyBookingsFullyReconciled:false,
      publicCheckoutEnabled:false,note:"No customer checkout or Quickbutik write while release gates closed."},200,origin);
  }
  if(req.method==="GET"&&path==="/admin/checkout-design"){
    const plans=await rpc("gk2_admin_checkout_design",{p_actor:user.email});
    return reply({ok:true,plans,readyProducts:plans.filter((p:Record<string,unknown>)=>p.isReady===true&&p.publishEnabled===true).length,liveCheckoutEnabled:false,
      blockers:["Quickbutik duration products missing","Group prices not synced","Paid-order webhook not verified","Pushover not adapted to new product IDs"]},200,origin);
  }
  if(req.method==="GET"&&path==="/admin/quote-preview"){
    const resource=u.searchParams.get("resource")||"",group=u.searchParams.get("group")||"";
    const minutes=Number(u.searchParams.get("minutes")||0);
    if(!["hyzr","dart_a","dart_b","venue"].includes(resource) || 
      !["public","betalt_medlem","teamgolfkongen","frisbee_dart","ansatte","ambassador","frisbeeklubb","dartklubb"].includes(group)
      || !Number.isInteger(minutes) || minutes<30 || minutes>720)return err("invalid_preview",400,origin);
    const preview=await rpc("gk2_admin_quote_preview",{p_actor:user.email,p_resource:resource,p_group:group,p_minutes:minutes});
    return reply({ok:true,...preview},200,origin);
  }
  if(req.method==="GET"&&path==="/admin/group-price-queue"){
    const queue=await rpc("gk2_admin_group_price_queue",{p_actor:user.email});
    return reply({ok:true,queue,checkoutVerified:false,quickbutikPricesReadable:false},200,origin);
  }
  if(req.method==="GET"&&path==="/admin/price-sync-check"){
    const resource=u.searchParams.get("resource")||"",group=u.searchParams.get("group")||"";
    const minutes=Number(u.searchParams.get("minutes")||0);
    if(!["hyzr","dart_a","dart_b","venue"].includes(resource)||
      !["public","betalt_medlem","teamgolfkongen","frisbee_dart","ansatte","ambassador","frisbeeklubb","dartklubb"].includes(group)||
      !Number.isSafeInteger(minutes)||minutes<30||minutes>720)
      return err("invalid_price_selection",400,origin);
    const selected=await rpc("gk2_admin_quote_preview",{p_actor:user.email,
      p_resource:resource,p_group:group,p_minutes:minutes});
    const prodId=Number(selected.checkoutProductId);
    if(!Number.isSafeInteger(prodId)||prodId<=0)return err("product_not_mapped",400,origin);
    if(group==="public"){
      // Only regular product price can be checked through the supported Quickbutik proxy.
      // It NEVER exposes a logged-in customer's group-specific price.
      const resp=await fetch("https://cold-shadow-36dc.post-cd6.workers.dev/products/"+prodId,
        {headers:{"Accept":"application/json"},signal:AbortSignal.timeout(10000)});
      if(!resp.ok)return err("quickbutik_price_unavailable",503,origin);
      const product=(await resp.json())?.product;
      const rawPrice=product?.price;
      const shopOre=typeof rawPrice==="number"&&Number.isFinite(rawPrice) ? Math.round(rawPrice*100):null;
      return reply({ok:true,resource,minutes,group,quickbutikProductId:prodId,
        booking2PriceOre:selected.priceOre,quickbutikRegularPriceOre:shopOre,
        regularPriceMatches:shopOre!==null&&shopOre===selected.priceOre,
        quickbutikUpdated:false,customerGroupPriceVerified:false,
        reason:"readonly_comparison_not_synchronization"},200,origin);
    }
    const entries=await rpc("gk2_admin_group_price_queue",{p_actor:user.email});
    const record=Array.isArray(entries)?entries.find((p:Record<string,unknown>)=>
      p.resource===resource&&p.minutes===minutes&&p.group===group):null;
    return reply({ok:true,resource,minutes,group,quickbutikProductId:prodId,
      booking2PriceOre:selected.priceOre,specialPriceRequired:!!record,
      manualStatus:record?.stage||"same_as_regular_or_not_reported",
      quickbutikUpdated:false,customerGroupPriceVerified:false,
      reason:"quickbutik_group_price_not_exposed_by_supported_api"},200,origin);
  }
  if(req.method==="GET"&&path==="/admin/price-matrix"){
    const prices=await rpc("gk2_admin_price_matrix",{p_actor:user.email});
    return reply({ok:true,prices,quickbutikUpdated:false,bookingEnabled:false},200,origin);
  }
  if(req.method!=="POST")return err("method_not_allowed",405,origin);
  const b=await body(req);
  const a=user.email;
  if(path==="/admin/hours"){
   if(!["hyzr","dart_a","dart_b","venue"].includes(b.resource)||![1,2,3,4,5,6,7].includes(Number(b.weekday))||!Number.isInteger(b.opens)||!Number.isInteger(b.closes)||typeof b.active!=="boolean")return err("invalid_hours",400,origin);
   return reply({ok:true,changed:await rpc("gk2_admin_set_hours",{p_actor:a,p_resource:b.resource,p_weekday:b.weekday,p_opens:b.opens,p_closes:b.closes,p_active:b.active})},200,origin);
  }
  if(path==="/admin/block"){
   if(!validDate(String(b.dateFrom||""))||!validDate(String(b.dateTo||""))||!Number.isInteger(b.start)||!Number.isInteger(b.end))return err("invalid_block",400,origin);
   return reply({ok:true,id:await rpc("gk2_admin_block",{p_actor:a,p_target:b.target,p_from:b.dateFrom,p_to:b.dateTo,p_start:b.start,p_end:b.end,p_label:b.label,p_weekdays:Array.isArray(b.weekdays)?b.weekdays:null})},200,origin);
  }
  if(path==="/admin/unblock")return reply({ok:true,changed:await rpc("gk2_admin_unblock",{p_actor:a,p_id:b.id})},200,origin);
  if(path==="/admin/group-price-stage"){
    if(!["hyzr","dart_a","dart_b","venue"].includes(b.resource)
      ||!["betalt_medlem","teamgolfkongen","frisbee_dart","ansatte","ambassador","frisbeeklubb","dartklubb"].includes(b.group)
      ||!Number.isInteger(b.minutes)||!["pending","entered_reported","checkout_verified"].includes(b.stage))
      return err("invalid_group_price_state",400,origin);
    const result=await rpc("gk2_admin_group_price_stage",{p_actor:a,p_resource:b.resource,
      p_minutes:b.minutes,p_group:b.group,p_stage:b.stage,p_note:String(b.note||"").slice(0,300)});
    return reply({ok:true,...result,bookingEnabled:false},200,origin);
  }
  if(path==="/admin/price-draft"||path==="/admin/price-save"){
   if(!Number.isInteger(b.minutes)||!Number.isInteger(b.ore)||b.ore<0||b.ore>10000000)return err("invalid_price",400,origin);
   const saved=await rpc("gk2_admin_save_price",{p_actor:a,p_resource:b.resource,p_group:b.group,p_minutes:b.minutes,p_price_ore:b.ore,p_note:b.note||""});
   return reply({ok:true,...saved,status:"saved_in_staging_not_quickbutik",checkoutEnabled:false},200,origin);
  }
  if(path==="/admin/member-request"){
   return reply({ok:true,id:await rpc("gk2_admin_request_membership",{p_actor:a,p_email:b.email,p_group:b.group,p_action:b.action}),status:"pending_external_sync"},202,origin);
  }
  if(path==="/admin/tournament-draft"){
   if(!validDate(String(b.from||""))||!validDate(String(b.to||"")))return err("invalid_tournament",400,origin);
   return reply({ok:true,id:await rpc("gk2_admin_tournament_draft",{p_actor:a,p_name:b.name,p_from:b.from,p_to:b.to,p_format:b.format,p_course:b.course||""}),status:"draft"},202,origin);
  }
  return err("not_implemented",404,origin);
 }catch(e){
  const msg=e instanceof Error?e.message:"unknown";
  console.error("gk2-staging-error",msg.replace(/([a-z0-9._%+-]+)@([a-z0-9.-]+)/ig,"[redacted-email]"));
  return err("request_rejected_or_service_unavailable",400,origin);
 }
});
