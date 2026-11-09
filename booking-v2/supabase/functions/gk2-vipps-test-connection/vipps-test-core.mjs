/** Vipps TEST-only configuration guard. No payment calls. */
export const TEST_MSN="321607";
export function validateTestVippsCredentials(input={}) {
 const id=typeof input.clientId==="string"?input.clientId.trim():"";
 const secret=typeof input.clientSecret==="string"?input.clientSecret.trim():"";
 const subscription=typeof input.subscriptionKey==="string"?input.subscriptionKey.trim():"";
 const msn=typeof input.msn==="string"?input.msn.trim():"";
 if(msn!==TEST_MSN)return {ok:false,reason:"unexpected_test_sales_unit"};
 if(!/^[0-9a-fA-F-]{36}$/.test(id))return {ok:false,reason:"client_id_not_configured"};
 if(secret.length<20||secret.length>300)return {ok:false,reason:"client_secret_not_configured"};
 if(!/^[0-9a-fA-F]{32}$/.test(subscription))return {ok:false,reason:"subscription_key_not_configured"};
 return {ok:true,msn:TEST_MSN};
}
export function isValidVippsTokenResponse(response) {
 return response && typeof response.access_token==="string" && response.access_token.length>80 && (response.token_type===undefined || response.token_type==="Bearer");
}
