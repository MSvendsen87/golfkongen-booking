/** GolfKongen Booking 2.0 — prototype logic. Pure functions, no API access or production side effects. */
export const RESOURCE_IDS = Object.freeze(['hyzr','dart_a','dart_b']);
export const RESOURCE_LABELS = Object.freeze({hyzr:'HYZR-simulator',dart_a:'Dartbane A',dart_b:'Dartbane B',venue:'Hele lokalet'});
export const ACTIVE_STATES = new Set(['confirmed','held','pending_payment','blocked']);
export const DEFAULT_RULES = Object.freeze({
  hyzr: {min:30,max:240,step:30},
  dart_a:{min:30,max:240,step:30},
  dart_b:{min:30,max:240,step:30},
  venue:{min:240,max:720,step:30}
});
export function timeToMinutes(text) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(text));
  if(!m) throw new Error('Invalid HH:MM time');
  const h = Number(m[1]), min=Number(m[2]);
  if(h>23 || min>59) throw new Error('Time outside day');
  return h*60+min;
}
export function minutesToTime(number) {
  if(!Number.isInteger(number)||number<0||number>1440) throw new Error('Invalid minutes');
  return String(Math.floor(number/60)).padStart(2,'0')+':'+String(number%60).padStart(2,'0');
}
export function resourcesFor(resource) {
  if(resource==='venue') return [...RESOURCE_IDS];
  if(!RESOURCE_IDS.includes(resource)) throw new Error('Unknown resource');
  return [resource];
}
export function overlaps(aStart,aEnd,bStart,bEnd) {
  return aStart < bEnd && aEnd > bStart;
}
function sameDate(item,date) { return !date || item.date === date; }
export function appliesOnDate(rule,date) {
  if(!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if(rule.date && rule.date!==date) return false;
  if(rule.dateFrom && date<rule.dateFrom) return false;
  if(rule.dateTo && date>rule.dateTo) return false;
  if(Array.isArray(rule.weekdays) && rule.weekdays.length && !rule.weekdays.includes(new Date(date+'T12:00:00Z').getUTCDay()))return false;
  return true;
}
function currentOccupancy(item,nowEpochMs){
  if(!ACTIVE_STATES.has(item.status)) return false;
  if(item.status==='held' && item.holdUntil && new Date(item.holdUntil).getTime() <= nowEpochMs) return false;
  return true;
}
export function availability({resource,date,start,end,reservations=[],blocks=[],nowEpochMs=Date.now(),rules=DEFAULT_RULES}) {
  const definition=rules[resource];
  if(!definition) return {ok:false,reason:'Ukjent aktivitet'};
  if(!Number.isInteger(start)||!Number.isInteger(end)||start>=end) return {ok:false,reason:'Ugyldig tidsrom'};
  const duration=end-start;
  if(duration<definition.min||duration>definition.max||duration%definition.step!==0||start%30!==0||end%30!==0) return {ok:false,reason:'Varighet er ikke tillatt'};
  const targets=resourcesFor(resource);
  for(const rule of blocks){
    if(!appliesOnDate(rule,date)||!overlaps(start,end,rule.start,rule.end))continue;
    if(rule.resource==='all'||rule.resource==='venue'||resource==='venue'||targets.includes(rule.resource)) {
      if(rule.resource==='venue' && resource!=='venue' && !rule.blocksAll) continue;
      if(resource==='venue' && rule.resource==='venue' && rule.scope==='venue_only') return {ok:false,reason:'Stengt for utleie av lokalet',kind:'blocked'};
      if(resource==='venue'||rule.resource==='all'||targets.includes(rule.resource)||rule.blocksAll) return {ok:false,reason:rule.label||'Stengt',kind:'blocked'};
    }
  }
  for(const booking of reservations){
    if(!sameDate(booking,date)||!currentOccupancy(booking,nowEpochMs)) continue;
    if(!overlaps(start,end,booking.start,booking.end)) continue;
    const occupied=resourcesFor(booking.resource);
    if(occupied.some(x=>targets.includes(x))) return {ok:false,reason:booking.status==='held'?'Midlertidig reservert':'Opptatt',kind:booking.status};
  }
  return {ok:true,reason:'Ledig',kind:'available'};
}
export function slotsForDay({resource,date,from=600,to=1320,duration=60,reservations=[],blocks=[],nowEpochMs=Date.now(),rules=DEFAULT_RULES}){
  const slots=[];
  for(let start=from;start+duration<=to;start+=30){
    const result=availability({resource,date,start,end:start+duration,reservations,blocks,nowEpochMs,rules});
    slots.push({start,end:start+duration,startLabel:minutesToTime(start),endLabel:minutesToTime(start+duration),...result});
  }
  return slots;
}
export function demoQuote(resource,duration,prices){
  if(resource==='venue'){
    const extra=Math.max(0,duration-240);
    return prices.venueBase+Math.ceil(extra/30)*prices.venueExtraHalf;
  }
  return Math.ceil(duration/30)*prices[resource];
}
export function validateReservation({resource,date,start,end,reservations,blocks,rules}) {
  return availability({resource,date,start,end,reservations,blocks,rules});
}
