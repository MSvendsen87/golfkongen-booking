import {auditDayCatalog,PRODUCT_IDS} from "./checkout-preflight.mjs";
import {auditQuickbutikOrder,loadV1OrderRecord} from "./quickbutik-order-audit.mjs";
import {checkV1BookingPayment} from "./quickbutik-v1-payment-check.mjs";
import {v1NokToOre,verifiedV1CustomerEmail} from "./quickbutik-v1-payment-check.mjs";
import {expectedSlotSku} from "./payment-validation.mjs";
import {mutateHeldCartVariant} from "./quickbutik-cart-variant.mjs";
import {verifyCleanupRequest} from "./cleanup-auth.mjs";
import {verifyQuickbutikWebhook} from "./quickbutik-webhook-guard.mjs";
import {signDispatchRequest} from "./dispatch-auth.mjs";
import {createClient} from "npm:@supabase/supabase-js@2.58.0";
const url=Deno.env.get("SUPABASE_URL")||"";
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const origins=new Set(["https://golfkongen.no","https://www.golfkongen.no","https://app.golfkongen.no","https://eadgdcimcmfyuicizboo.supabase.co","https://msvendsen87.github.io"]);
const allowedEmails=new Set(["post@golfkongen.no","kristoffer.mrk@gmail.com","kristoffer@golfkongen.no"]);
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
// Dispatch queued confirmations immediately after a verified paid order.
// The outbox is the source of truth; failure leaves events retryable by the scheduler.
async function dispatchConfirmedBookingOutbox(){
 const apiKey=Deno.env.get("GK2_QUICKBUTIK_API_KEY")||"";
 const base=Deno.env.get("SUPABASE_URL")||"";
 if(apiKey.length<20||!base.startsWith("https://"))throw Error("notification_dispatch_not_configured");
 const timestamp=String(Math.floor(Date.now()/1000));
 const signature=await signDispatchRequest(apiKey,timestamp);
 const response=await fetch((base.endsWith("/")?base.slice(0,-1):base)+"/functions/v1/gk-booking-notifier/internal/dispatch",{
  method:"POST",headers:{"content-type":"application/json",
   "x-gk2-dispatch-timestamp":timestamp,"x-gk2-dispatch-signature":signature},
  body:"{}",signal:AbortSignal.timeout(50000)
 });
 if(!response.ok)throw Error("notification_dispatch_http_"+response.status);
}
function liveCheckoutConfigured(){return Deno.env.get("GK2_WEBHOOK_ENABLED")==="true"&&Boolean(Deno.env.get("GK2_QUICKBUTIK_API_KEY"))}
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
  if(req.method==="GET"&&path==="/health"){const window=await rpc("gk2_booking_window",{});const enabled=liveCheckoutConfigured()&&window.bookingEnabled===true;return reply({ok:true,environment:enabled?"production":"staging",bookingEnabled:window.bookingEnabled===true,checkout:enabled},200,origin);}
  if(req.method==="GET"&&path==="/window"){
    // Derived on every request from Europe/Oslo PostgreSQL clock, no cron required for new dates.
    const window=await rpc("gk2_booking_window",{});
    return reply({ok:true,...window,
      checkoutEnabled:liveCheckoutConfigured()&&window.bookingEnabled===true,
      explanation:"The 45-day calendar rolls daily; Quickbutik checkout follows the server release gates."},200,origin);
  }
  if(req.method==="GET"&&path==="/availability"){
   const day=u.searchParams.get("date")||"";
   if(!validDate(day))return err("invalid_date",400,origin);
   const result=await rpc("gk2_day_availability",{p_day:day});
   const safeBlocks=Array.isArray(result.blocks)?result.blocks.map((x:Record<string,unknown>)=>({target:x.target,start_min:x.start_min,end_min:x.end_min})):[];
   return reply({ok:true,day:result.day,claims:result.claims||[],blocks:safeBlocks,openingHoursByResource:result.openingHoursByResource||{},bookingEnabled:result.bookingEnabled===true},200,origin);
  }
  if(req.method==="POST"&&path==="/club/hold"){
    // No browser-supplied customer ID. Membership identity is the verified Supabase Auth user UUID.
    if(!origin||!origins.has(origin))return err("forbidden_checkout_origin",403,origin);
    if(Deno.env.get("GK2_CHECKOUT_ENABLED")!=="true"||
       Deno.env.get("GK2_CLUB_CHECKOUT_ENABLED")!=="true")
      return err("club_checkout_not_enabled",503,origin);
    if(await rpc("gk2_release_gates_satisfied",{})!==true)
      return err("checkout_release_gates_closed",503,origin);
    const token=req.headers.get("authorization")||"";
    if(!token.startsWith("Bearer ")||token.length>7000)return err("login_required",401,origin);
    const {data:authData,error:authError}=await db.auth.getUser(token.slice(7));
    const member=authData?.user;
    if(authError||!member?.id||!member.email_confirmed_at)return err("verified_login_required",401,origin);
    const input=await body(req);
    const key=String(input?.idempotencyKey||""),day=String(input?.date||"");
    const seats=Number(input?.seats);
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)
       ||!validDate(day)||new Date(day+"T12:00:00Z").getUTCDay()!==4
       ||!Number.isInteger(seats)||seats<1||seats>10||input?.acceptedTerms!==true)
       return err("invalid_club_request",400,origin);
    // Hold alone does not create payment confirmation or door authorization.
    const held=await rpc("gk2_hold_club_seats",{
      p_key:key,p_day:day,p_customer:member.id,p_seats:seats
    });
    if(!member.email||held.status!=="held"||!held.id)return err("club_hold_not_active",409,origin);
    await rpc("gk2_bind_club_verified_email",{
      p_enrolment:held.id,p_customer:member.id,p_email:member.email
    });
    return reply({ok:true,holdId:held.id,status:held.status,remaining:held.remaining,
      paymentReady:false,checkoutEnabled:false},200,origin);
  }
  if(req.method==="GET"&&path==="/club/availability"){
    const day=u.searchParams.get("date")||"";
    if(!validDate(day)||new Date(day+"T12:00:00Z").getUTCDay()!==4)
      return err("not_club_thursday",400,origin);
    const status=await rpc("gk2_club_day_status",{p_day:day});
    return reply({ok:true,...status,checkoutEnabled:false},200,origin);
  }
  if(req.method==="GET"&&path==="/webhook/quickbutik"){
    // Independent webhook gate: signed paid order callbacks must be testable
    // before public checkout release gates are marked verified.
    // Customer checkout remains separately locked by GK2_CHECKOUT_ENABLED and DB gates.
    if(Deno.env.get("GK2_WEBHOOK_ENABLED")!=="true")
      return err("webhook_not_enabled",503,origin);
    const verified=await verifyQuickbutikWebhook(u.toString(),Deno.env.get("GK2_WEBHOOK_SECURITYHASH")||"");
    if(!verified.ok)return err("webhook_source_rejected",403,origin);
    const apiKey=Deno.env.get("GK2_QUICKBUTIK_API_KEY")||"";
    if(!apiKey)return err("quickbutik_key_not_configured",503,origin);
    try{
      const rawOrder=await loadV1OrderRecord(verified.orderNumber,{apiKey});
      // Club payments are recognized exclusively through authoritative Quickbutik V1 readback.
      const clubLines=(Array.isArray(rawOrder.products)?rawOrder.products:[])
        .filter((x:Record<string,unknown>)=>Number(x?.product_id)===1507);
      if(clubLines.length){
        if(clubLines.length!==1||rawOrder.products.length!==1||rawOrder.currency!=="NOK"||
           String(rawOrder.order_id)!==verified.orderNumber)
          return err("invalid_club_order_lines",409,origin);
        const clubLine=clubLines[0];
        const quantity=Number(clubLine.qty),sku=String(clubLine.sku||"");
        if(!Number.isSafeInteger(quantity)||quantity<1||quantity>10||
           !/^GK2-CLUB-[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(sku))
          return err("invalid_club_variant",409,origin);
        if(verified.eventType==="order.cancelled"){
          if(String(rawOrder.status)!=="-1")return err("club_cancellation_not_verified",409,origin);
          const cancelled=await rpc("gk2_cancel_club_by_order",{p_order:verified.orderNumber});
          return reply({ok:true,clubCancellation:cancelled},200,origin);
        }
        if(verified.eventType!=="order.new"||!["1","2"].includes(String(rawOrder.status)))
          return err("club_payment_not_verified",409,origin);
        if(v1NokToOre(rawOrder.shipping_amount)!==0||
           (rawOrder.refunds!==null&&rawOrder.refunds!==undefined&&
           !(Array.isArray(rawOrder.refunds)&&rawOrder.refunds.length===0)&&
           !(typeof rawOrder.refunds==="object"&&!Array.isArray(rawOrder.refunds)&&
             Object.keys(rawOrder.refunds).length===0)))
          return err("club_shipping_or_refund_requires_review",409,origin);
        const paid=rawOrder.total_pay_amount!==null&&rawOrder.total_pay_amount!==undefined?
          v1NokToOre(rawOrder.total_pay_amount):
          (()=>{
            const gross=v1NokToOre(rawOrder.total_amount),discount=v1NokToOre(rawOrder.discount_amount);
            return gross===null||discount===null||discount>gross?null:gross-discount;
          })();
        if(rawOrder.total_pay_amount!==undefined&&rawOrder.total_pay_amount!==null&&
           rawOrder.total_amount!==undefined&&rawOrder.discount_amount!==undefined){
          const gross=v1NokToOre(rawOrder.total_amount),discount=v1NokToOre(rawOrder.discount_amount);
          if(gross===null||discount===null||discount>gross||gross-discount!==paid)
            return err("club_payment_amount_fields_conflict",409,origin);
        }
        if(paid!==quantity*5000)return err("club_total_paid_mismatch",409,origin);
        const result=await rpc("gk2_match_club_paid_order",{
          p_order:verified.orderNumber,p_sku:sku,
          p_email:verifiedV1CustomerEmail(rawOrder),
          p_seats:quantity,p_paid_ore:paid
        });
        if(result?.matched!==true)return err("club_paid_unallocated_manual_review",409,origin);
        return reply({ok:true,clubStatus:"confirmed",alreadyConfirmed:result.alreadyConfirmed===true,
          doorCodeQueued:false,manualAccessRequired:true},200,origin);
      }
      if(verified.eventType==="order.cancelled"){
        // Never revoke door access solely from a caller's order number.
        // Quickbutik must independently confirm the order is cancelled.
        if(String(rawOrder.status)!=="-1")
          return err("cancellation_not_verified_by_quickbutik",409,origin);
        const cancellation=await rpc("gk2_cancel_verified_paid_order",{
          p_order:verified.orderNumber
        });
        return reply({ok:true,cancellationQueued:cancellation?.queuedRevocation===true,
          alreadyCancelled:cancellation?.alreadyCancelled===true},200,origin);
      }
      if(verified.eventType!=="order.new")
        return err("unsupported_webhook_event",400,origin);
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
          p_customer_email:verifiedV1CustomerEmail(rawOrder)
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
      if(confirmed.status==="confirmed"){
        EdgeRuntime.waitUntil(dispatchConfirmedBookingOutbox().catch((error)=>{
          console.error("booking2_notification_dispatch_deferred",String(error?.message||"unknown").slice(0,80));
        }));
      }
      return reply({ok:true,bookingStatus:confirmed.status,
        notificationQueued:confirmed.status==="confirmed"},200,origin);
    }catch(_e){
      return err("webhook_processing_failed",503,origin);
    }
  }
  if(req.method==="POST"&&path==="/internal/relock-expired"){
    // Private maintenance endpoint. No user or browser may trigger door/booking
    // operations or disclose reservation identifiers.
    const apiKey=Deno.env.get("GK2_QUICKBUTIK_API_KEY")||"";
    if(!await verifyCleanupRequest({
      apiKey,
      timestamp:req.headers.get("x-gk2-cleanup-timestamp")||"",
      signature:req.headers.get("x-gk2-cleanup-signature")||""
    }))return err("unauthorized_maintenance",403,origin);
    let leases:Record<string,unknown>[];
    try{
      const taken=await rpc("gk2_take_expired_cart_leases",{p_limit:10});
      leases=Array.isArray(taken)?taken:[];
    }catch(_e){return err("cleanup_unavailable",503,origin)}
    let closed=0,failed=0;
    for(const lease of leases){
      const reservationId=String(lease.reservationId||"");
      try{
        await mutateHeldCartVariant({
          productId:Number(lease.productId),sku:String(lease.sku||""),
          action:"close",apiKey
        });
        await rpc("gk2_finish_cart_variant_relock",{
          p_reservation:reservationId,p_success:true
        });
        closed++;
      }catch(_e){
        failed++;
        try{await rpc("gk2_finish_cart_variant_relock",{
          p_reservation:reservationId,p_success:false
        })}catch(_other){/* leave lease for owner to inspect */}
      }
    }
    return reply({ok:true,processed:leases.length,closed,failed},200,origin);
  }
  if(req.method==="POST"&&path==="/hold"){
    // Unified old-style Quickbutik checkout: DB hold -> product variant cart.
    // This stays OFF until full release testing. Browser price/group is never
    // used; Quickbutik computes and charges the correct customer group price.
    if(!origin||!origins.has(origin))return err("forbidden_checkout_origin",403,origin);
    if(!liveCheckoutConfigured())
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
    let leaseStarted=false;
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
      await rpc("gk2_mark_cart_variant_opening",{
        p_reservation:heldId,p_product:Number(productId),p_sku:sku
      });
      leaseStarted=true;
      const variant=await mutateHeldCartVariant({
        productId:Number(productId),sku,action:"open",apiKey
      });
      await rpc("gk2_mark_cart_variant_open",{
        p_reservation:heldId,p_variant_id:variant.variantId
      });
      const checkoutExpiresAt=await rpc("gk2_checkout_hold_expires",{p_reservation:heldId});
      return reply({ok:true,holdId:heldId,holdExpiresAt:checkoutExpiresAt,
        productId:Number(productId),variantId:variant.variantId,
        sku,rentalSets,checkoutEnabled:true},200,origin);
    }catch(_e){
      if(heldId){
        try{
          if(leaseStarted){
            // If checkout creation fails, Quickbutik must be relocked first.
            // Failed relocking leaves DB claims held for manual recovery.
            const sku=expectedSlotSku(day,start,start+minutes);
            await mutateHeldCartVariant({
              productId:Number(productId),sku,action:"close",apiKey
            });
            await rpc("gk2_finish_cart_variant_relock",{
              p_reservation:heldId,p_success:true
            });
          }
          const aborted=await rpc("gk2_abort_precheckout_hold",{p_reservation:heldId});
          if(aborted!==true)return err("checkout_hold_retained_for_review",503,origin);
        }catch(_cleanupError){
          if(leaseStarted){
            try{await rpc("gk2_finish_cart_variant_relock",{
              p_reservation:heldId,p_success:false
            })}catch(_logErr){/* mark remains opening/failed for periodic recovery */}
          }
          return err("checkout_manual_review_required",503,origin)
        }
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
  // A payment pilot is ONLY available after a verified owner login.
  // No public launch flags are changed and no public hold may call this route.
  if(req.method==="POST"&&path==="/admin/paid-test/hold"){
    const data=await body(req);
    const key=String(data?.idempotencyKey||""),day=String(data?.date||""),
      resource=String(data?.resource||""),start=Number(data?.startMin),
      minutes=Number(data?.duration),sets=Number(data?.rentalSets??0);
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)||
      !validDate(day)||!["hyzr","dart_a","dart_b","venue"].includes(resource)||
      !Number.isSafeInteger(start)||start%30!==0||
      !Number.isSafeInteger(minutes)||minutes%30!==0||
      !Number.isSafeInteger(sets)||sets<0||sets>6||
      (resource==="hyzr"&&sets!==0)||data?.acceptedTerms!==true)
      return err("invalid_paid_pilot_request",400,origin);
    const apiKey=Deno.env.get("GK2_QUICKBUTIK_API_KEY")||"";
    if(!apiKey)return err("quickbutik_api_not_configured",503,origin);
    const productId=Number(await rpc("gk2_owner_paid_checkout_product_for",{
      p_actor:user.email,p_resource:resource,p_minutes:minutes
    }));
    let heldId="",leaseStarted=false;
    const sku=expectedSlotSku(day,start,start+minutes);
    try{
      const held=await rpc("gk2_owner_paid_test_hold",{
        p_actor:user.email,p_key:key,p_day:day,p_resource:resource,
        p_start:start,p_duration:minutes
      });
      if(held?.status!=="held"||!held?.id)return err("pilot_slot_unavailable",409,origin);
      heldId=String(held.id);
      await rpc("gk2_prepare_cart_intent",{
        p_reservation:heldId,p_email:user.email,
        p_rental_sets:sets,p_terms_accepted:true
      });
      await rpc("gk2_owner_paid_mark_opening",{
        p_actor:user.email,p_reservation:heldId,p_product:productId,p_sku:sku
      });
      leaseStarted=true;
      const variant=await mutateHeldCartVariant({productId,sku,action:"open",apiKey});
      await rpc("gk2_mark_cart_variant_open",{
        p_reservation:heldId,p_variant_id:variant.variantId
      });
      const expires=await rpc("gk2_checkout_hold_expires",{p_reservation:heldId});
      return reply({ok:true,ownerPaidTest:true,holdId:heldId,holdExpiresAt:expires,
        productId,variantId:variant.variantId,sku,rentalSets:sets,checkoutEnabled:true},200,origin);
    }catch(error){
      if(heldId){
        try{
          if(leaseStarted){
            await mutateHeldCartVariant({productId,sku,action:"close",apiKey});
            await rpc("gk2_finish_cart_variant_relock",{p_reservation:heldId,p_success:true});
          }
          await rpc("gk2_abort_precheckout_hold",{p_reservation:heldId});
        }catch(_relock){
          if(leaseStarted)try{await rpc("gk2_finish_cart_variant_relock",{
            p_reservation:heldId,p_success:false
          })}catch(_e){}
          return err("pilot_cleanup_manual_review",503,origin);
        }
      }
      return err("pilot_checkout_not_opened",503,origin);
    }
  }
  if(req.method==="POST"&&path==="/admin/paid-test/confirm"){
    const data=await body(req),order=String(data?.orderNumber||"");
    if(!/^[1-9][0-9]{0,8}$/.test(order))
      return err("invalid_order_number",400,origin);
    const key=Deno.env.get("GK2_QUICKBUTIK_API_KEY")||"";
    if(!key)return err("quickbutik_key_not_configured",503,origin);
    try{
      // Obtain the actual order from Quickbutik V1: never trust client payment claims.
      const rawOrder=await loadV1OrderRecord(order,{apiKey:key});
      const products=Array.isArray(rawOrder.products)?rawOrder.products:[];
      const booking=products.filter((p:Record<string,unknown>)=>
        Number.isSafeInteger(Number(p?.product_id))&&
        Number(p.product_id)>=1474&&Number(p.product_id)<=1506);
      if(String(rawOrder.order_id)!==order||
        !["1","2"].includes(String(rawOrder.status))||
        rawOrder.currency!=="NOK"||
        verifiedV1CustomerEmail(rawOrder)!==user.email.toLowerCase()||
        booking.length!==1||Number(booking[0].qty)!==1)
        return err("paid_test_order_unverified",409,origin);
      const actualPaid=rawOrder.total_pay_amount!==undefined&&rawOrder.total_pay_amount!==null?
        v1NokToOre(rawOrder.total_pay_amount):
        (()=>{
          const gross=v1NokToOre(rawOrder.total_amount);
          const discount=v1NokToOre(rawOrder.discount_amount);
          return gross===null||discount===null||gross<discount?null:gross-discount;
        })();
      // Quickbutik V1 can omit its net paid field for discounted orders.
      // Do not invent a price. Trusted paid status + strictly matched
      // order/email/product/SKU/quantity/shipping/refunds is authoritative.
      if(actualPaid!==null&&actualPaid<=0)
        return err("paid_test_zero_total_requires_review",409,origin);
      if(rawOrder.total_pay_amount!==undefined&&rawOrder.total_amount!==undefined&&
        rawOrder.discount_amount!==undefined){
        const gross=v1NokToOre(rawOrder.total_amount);
        const discount=v1NokToOre(rawOrder.discount_amount);
        if(gross!==null&&discount!==null&&actualPaid!==null&&gross-discount!==actualPaid)
          return err("paid_test_amount_conflict",409,origin);
      }
      const matched=await rpc("gk2_owner_match_paid_order_to_hold",{
        p_actor:user.email,p_order:order,
        p_product_id:Number(booking[0].product_id),
        p_sku:String(booking[0].sku||"")
      });
      if(matched?.matched!==true)return err("paid_pilot_hold_not_matched_manual_review",409,origin);
      const hold=await rpc("gk2_get_bound_checkout",{p_order:order});
      if(!hold||String(hold.id)!==String(matched.id))
        return err("paid_test_binding_mismatch_manual_review",409,origin);
      const payment=checkV1BookingPayment(rawOrder,{
        reservation:hold,
        expectedProductId:hold.checkout_product_id,
        expectedPaidOre:hold.quoted_ore,
        expectedRentalSets:hold.rental_sets_count,
        paymentPolicy:"trusted_status"
      });
      if(!payment.eligible)return err("paid_test_payment_validation_failed_manual_review",409,origin);
      const confirmed=await rpc("gk2_confirm_paid_order_status",{
        p_reservation:hold.id,p_order:order,p_event_id:"qb.order.new:"+order
      });
      if(confirmed?.status!=="confirmed")
        return err("paid_test_manual_allocation_required",409,origin);
      let dispatchResult="pending";
      try{
        const url=Deno.env.get("SUPABASE_URL")+
          "/functions/v1/gk-booking-notifier/owner/dispatch-paid-test";
        const notify=await fetch(url,{
          method:"POST",
          headers:{"authorization":req.headers.get("authorization")||"",
            "content-type":"application/json"},
          body:JSON.stringify({reservationId:String(hold.id)}),
          signal:AbortSignal.timeout(22000)
        });
        dispatchResult=notify.ok?"started":"requires_follow_up";
      }catch(_e){dispatchResult="requires_follow_up"}
      return reply({ok:true,bookingStatus:"confirmed",bookingId:String(hold.id),
        notificationStatus:dispatchResult,amountChecked:actualPaid!==null,
        thankYouUrl:"https://msvendsen87.github.io/golfkongen-booking/booking/takk/"},200,origin);
    }catch(_e){return err("paid_test_requires_manual_review",503,origin)}
  }
  if(req.method==="GET"&&path==="/admin/paid-test/status"){
    const bookingId=u.searchParams.get("bookingId")||"";
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bookingId))
      return err("invalid_booking_id",400,origin);
    const status=await rpc("gk2_owner_paid_test_delivery_status",{
      p_actor:user.email,p_reservation:bookingId
    });
    if(status.bookingStatus==="confirmed"&&
      !status.accessEmailSent&&!status.needsReview){
      try{
        await fetch(Deno.env.get("SUPABASE_URL")+
          "/functions/v1/gk-booking-notifier/owner/dispatch-paid-test",{
          method:"POST",headers:{"authorization":req.headers.get("authorization")||"",
            "content-type":"application/json"},
          body:JSON.stringify({reservationId:bookingId}),signal:AbortSignal.timeout(22000)
        });
      }catch(_e){}
    }
    const latest=await rpc("gk2_owner_paid_test_delivery_status",{
      p_actor:user.email,p_reservation:bookingId
    });
    return reply({ok:true,...latest,thankYouUrl:
      "https://msvendsen87.github.io/golfkongen-booking/booking/takk/"},200,origin);
  }
  if(req.method==="GET"&&path==="/admin/order-audit"){
    // Read-only diagnostic, always after owner-only JWT + allowlist check.
    const order=u.searchParams.get("order")||"";
    if(!/^[1-9][0-9]{0,8}$/.test(order))return err("invalid_order_number",400,origin);
    const key=Deno.env.get("GK2_QUICKBUTIK_API_KEY")||"";
    if(!key)return err("quickbutik_key_not_configured",503,origin);
    const audit=await auditQuickbutikOrder(order,{apiKey:key});
    return reply({ok:true,...audit,bookingConfirmed:false,notificationSent:false},200,origin);
  }
  if(req.method==="GET"&&path==="/admin/club-access"){
    const members=await rpc("gk2_admin_list_club_access",{p_actor:user.email});
    return reply({ok:true,members},200,origin);
  }
  if(req.method==="GET"&&path==="/admin/health")return reply({ok:true,email:user.email,status:"isolated_staging"},200,origin);
  if(req.method==="GET"&&path==="/admin/agenda"){
    const from=u.searchParams.get("from")||"",days=Number(u.searchParams.get("days")||21);
    if(!validDate(from)||!Number.isInteger(days)||days<1||days>45)
      return err("invalid_agenda_range",400,origin);
    const agenda=await rpc("gk2_admin_agenda",{p_actor:user.email,p_from:from,p_days:days});
    return reply({ok:true,agenda},200,origin);
  }
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
  if(req.method==="GET"&&path==="/admin/price-drafts"){
    const drafts=await rpc("gk2_admin_price_drafts_list",{p_actor:user.email});
    return reply({ok:true,drafts,quickbutikUpdated:false},200,origin);
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
  if(path==="/admin/price-draft-delete"){
   if(!["hyzr","dart_a","dart_b","venue"].includes(b.resource)
      ||!["public","betalt_medlem","teamgolfkongen","frisbee_dart","ansatte","ambassador","frisbeeklubb","dartklubb"].includes(b.group)
      ||!Number.isInteger(b.minutes))return err("invalid_draft_target",400,origin);
   return reply({ok:true,deleted:await rpc("gk2_admin_delete_price_draft",
      {p_actor:a,p_resource:b.resource,p_group:b.group,p_minutes:b.minutes})},200,origin);
  }
  if(path==="/admin/price-draft"||path==="/admin/price-save"){
   if(!Number.isInteger(b.minutes)||!Number.isInteger(b.ore)||b.ore<0||b.ore>10000000)return err("invalid_price",400,origin);
   const saved=await rpc("gk2_admin_save_price_draft",{p_actor:a,p_resource:b.resource,p_group:b.group,p_minutes:b.minutes,p_price_ore:b.ore,p_note:b.note||""});
   return reply({ok:true,...saved,status:"draft_only_no_live_price_change",quickbutikUpdated:false,activeBookingPriceUpdated:false},200,origin);
  }
  if(path==="/admin/club-access"){
    const customerId=String(b.customerId||"").trim();
    if(customerId.length<3||customerId.length>128||typeof b.active!=="boolean")
      return err("invalid_club_access",400,origin);
    const changed=await rpc("gk2_admin_set_club_access",{p_actor:a,p_customer:customerId,p_active:b.active});
    return reply({ok:true,changed},200,origin);
  }
  if(path==="/admin/member-verify"){
   const requestId=String(b.id||"");
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)
      ||b.confirmQuickbutik!==true)return err("manual_verification_confirmation_required",400,origin);
   const result=await rpc("gk2_admin_confirm_membership_quickbutik",{p_actor:a,p_id:requestId});
   return reply({ok:true,...result},200,origin);
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
