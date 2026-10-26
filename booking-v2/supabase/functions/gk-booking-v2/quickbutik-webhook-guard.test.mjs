import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyQuickbutikWebhook} from './quickbutik-webhook-guard.mjs';

const secret='demo-only-not-a-real-secret-0123456789';
const url=(suffix='')=>'https://example.invalid/functions/v1/gk-booking-v2/webhook/quickbutik?event_type=order.new&order_id=3777&securityhash='+encodeURIComponent(secret)+suffix;
test('accepts one signed Quickbutik order.new event without confirming anything',async()=>{
 assert.deepEqual(await verifyQuickbutikWebhook(url(),secret),{ok:true,eventType:'order.new',orderNumber:'3777'});
});
test('handles cancellation event for explicit downstream cancellation handling',async()=>{
 const u=url().replace('order.new','order.cancelled');
 assert.equal((await verifyQuickbutikWebhook(u,secret)).eventType,'order.cancelled');
});
test('fails closed without a server-side webhook secret',async()=>{
 assert.equal((await verifyQuickbutikWebhook(url(),undefined)).reason,'webhook_secret_not_configured');
});
test('rejects wrong securityhash and repeated securityhash parameters',async()=>{
 assert.equal((await verifyQuickbutikWebhook(url().replace(encodeURIComponent(secret),'attacker'),secret)).reason,'webhook_not_authorized');
 assert.equal((await verifyQuickbutikWebhook(url()+'&securityhash=another',secret)).reason,'missing_or_repeated_parameter');
});
test('rejects injected order IDs and unsupported event types',async()=>{
 assert.equal((await verifyQuickbutikWebhook(url().replace('order_id=3777','order_id=3777%26secret%3D1'),secret)).reason,'invalid_webhook_event');
 assert.equal((await verifyQuickbutikWebhook(url().replace('order.new','product.add'),secret)).reason,'invalid_webhook_event');
});
test('does not accept omission or duplication of required params',async()=>{
 assert.equal((await verifyQuickbutikWebhook(url().replace('order_id=3777&',''),secret)).reason,'missing_or_repeated_parameter');
 assert.equal((await verifyQuickbutikWebhook(url()+'&order_id=3778',secret)).reason,'missing_or_repeated_parameter');
});
