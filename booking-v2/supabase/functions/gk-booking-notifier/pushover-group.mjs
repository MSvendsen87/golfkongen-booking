// GolfKongen uses its existing Pushover Delivery Group.
// Never expose the group key in UI, responses or logs.
export const GROUP_NAME="Golfkongen";
const isKey=(s)=>typeof s==="string"&&/^[A-Za-z0-9]{30}$/.test(s);
export async function resolveGolfkongenDeliveryGroup(appToken,{fetchImpl=fetch}={}){
 if(!isKey(appToken))return {ok:false,reason:"invalid_app_token_format"};
 try{
  const res=await fetchImpl("https://api.pushover.net/1/groups.json?token="+encodeURIComponent(appToken),{
   method:"GET",headers:{"Accept":"application/json"},signal:AbortSignal.timeout(12000)
  });
  if(!res.ok)return {ok:false,reason:res.status===401||res.status===400?
   "groups_api_rejected":"groups_api_unavailable"};
  const json=await res.json();
  if(json?.status!==1||!Array.isArray(json.groups))
   return {ok:false,reason:"groups_response_invalid"};
  const found=json.groups.filter(g=>g?.name?.trim().toLowerCase()===GROUP_NAME.toLowerCase()&&isKey(g?.group));
  if(found.length!==1)return {ok:false,reason:found.length===0?"group_not_found":"ambiguous_group"};
  // A group key is valid for sending only if at least one member's device
  // is reachable. Check without creating a message.
  const check=await fetchImpl("https://api.pushover.net/1/users/validate.json",{
   method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
   body:new URLSearchParams({token:appToken,user:found[0].group}),
   signal:AbortSignal.timeout(12000)
  });
  const body=await check.json().catch(()=>null);
  if(check.ok&&body?.status===1)
   return {ok:true,reason:"group_valid",key:found[0].group};
  return {ok:false,reason:"group_no_active_members"};
 }catch(_e){return {ok:false,reason:"groups_network_error"}}
}
