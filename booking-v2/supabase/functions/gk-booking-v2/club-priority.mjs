// Read only the existing club product. Never names, members, orders or prices.
export function clubCapacityForDay(raw,day){
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(day)||new Date(day+'T12:00:00Z').getUTCDay()!==4)
    throw Error('not_a_club_thursday');
  const p=raw?.product??raw;
  if(Number(p?.id)!==1322||p?.title!=='LDK Tilgang'||!Array.isArray(p.variants))
    throw Error('unexpected_club_product');
  const dd=Number(day.slice(8)),mm=Number(day.slice(5,7));
  const matches=p.variants.filter(v=>(v.values||[]).some(x=>{
    const m=String(x.val||'').match(/(?:^|\s)(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?(?:\s|$)/);
    return m&&Number(m[1])===dd&&Number(m[2])===mm&&(!m[3]||m[3]===day.slice(0,4));
  }));
  if(matches.length!==1)throw Error('missing_or_ambiguous_club_date');
  const v=matches[0],q=v.qty??v.stock;
  if(q===null||q===undefined||q===''||!Number.isInteger(Number(q))||Number(q)<0||Number(q)>10
    ||!Number.isSafeInteger(Number(v.id))||Number(v.id)<=0)
    throw Error('invalid_club_capacity');
  return {remaining:Number(q),variantId:Number(v.id)};
}
export async function loadClubCapacity(day,{apiKey,fetchImpl=fetch}={}){
  if(typeof apiKey!=='string'||apiKey.length<10)throw Error('club_key_missing');
  const r=await fetchImpl('https://api.quickbutik.com/v1/products?product_id=1322&include_details=true',{
    headers:{Authorization:'Basic '+btoa(apiKey+':'+apiKey),Accept:'application/json'},
    signal:AbortSignal.timeout(10000),cache:'no-store'
  });
  if(!r.ok)throw Error('club_status_unavailable');
  return clubCapacityForDay(await r.json(),day);
}
