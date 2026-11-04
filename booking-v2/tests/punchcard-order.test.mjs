import test from 'node:test';
import assert from 'node:assert/strict';
import {punchcardOrder} from '../supabase/functions/gk-booking-v2/punchcard-order.mjs';
const paid={order_id:'3999',currency:'NOK',status:'1',total_pay_amount:'1200.00',shipping_amount:'0',customer:{email:'test@example.invalid'},products:[{product_id:1160,qty:1}]};
test('credits only the verified purchase quantity',()=>{
 assert.equal(punchcardOrder(paid,'3999').quantity,1);
 assert.equal(punchcardOrder({...paid,total_pay_amount:'2400.00',products:[{product_id:1160,qty:2}]},'3999').quantity,2);
});
test('rejects unpaid, discounted, refunded and conflicting customer orders',()=>{
 for(const change of [{status:'0'},{total_pay_amount:'24.00'},{refunds:{sum:100}},{customer_email:'other@example.invalid'},{products:[{product_id:1160,qty:1},{product_id:10,qty:1}]}])assert.throws(()=>punchcardOrder({...paid,...change},'3999'));
});
test('verified cancellation cannot be replayed as a purchase',()=>assert.equal(punchcardOrder({...paid,status:'-1'},'3999').cancelled,true));

test('20-hour pack requires 2000 NOK per pack and credits 1200 minutes',()=>{
 const order={...paid,total_pay_amount:'2000.00',products:[{product_id:1161,qty:1}]};
 assert.equal(punchcardOrder(order,'3999').unitMinutes,1200);
 assert.equal(punchcardOrder(paid,'3999').unitMinutes,600);
 assert.throws(()=>punchcardOrder({...order,total_pay_amount:'1200.00'},'3999'));
 assert.equal(punchcardOrder({...order,status:'-1'},'3999').unitMinutes,1200);
});
