/**
 * Safety layer for a future HYZR Windows companion.
 * Requires an authenticated server snapshot. This module NEVER talks to HYZR.
 * Device must use monotonic uptime, not a wall clock that can be changed.
 */
import {instant} from "./session-state.mjs";
export function evaluateDeviceLease({
  snapshot,
  receivedAtMonotonicMs,
  nowMonotonicMs,
  maxSnapshotAgeMs=6000
}={}) {
  const deny=(reason)=>({access:"locked",reason,reservation_id:null,validForMs:0});
  if(!Number.isFinite(receivedAtMonotonicMs)||!Number.isFinite(nowMonotonicMs)||
    nowMonotonicMs<receivedAtMonotonicMs||receivedAtMonotonicMs<0)
    return deny("invalid_device_clock");
  if(!Number.isInteger(maxSnapshotAgeMs)||maxSnapshotAgeMs<1000||maxSnapshotAgeMs>30000)
    return deny("invalid_freshness_policy");
  if(!snapshot||snapshot.status!=="active"||snapshot.payment_confirmed!==true||
      typeof snapshot.reservation_id!=="string"||!snapshot.reservation_id)
    return deny("no_current_paid_session");
  const received=instant(snapshot.checked_at),end=instant(snapshot.lock_at);
  if(!Number.isFinite(received)||!Number.isFinite(end)||end<=received||end-received>24*60*60*1000)
    return deny("invalid_server_deadline");
  const age=nowMonotonicMs-receivedAtMonotonicMs;
  if(age>=maxSnapshotAgeMs)return deny("connection_stale");
  const hardLeft=end-received-age;
  if(hardLeft<=0)return deny("session_deadline_reached");
  return {
    access:"active",
    reservation_id:snapshot.reservation_id,
    validForMs:Math.floor(Math.min(maxSnapshotAgeMs-age,hardLeft)),
    nextRefreshInMs:Math.min(2000,Math.floor(Math.min(maxSnapshotAgeMs-age,hardLeft))),
    reason:null
  };
}

/** Detect handover even if both consecutive snapshots have status 'active'. */
export function deriveSessionHandover(previous,current) {
  const active=v=>v?.status==="active"&&v.payment_confirmed===true&&
    typeof v.reservation_id==="string"&&Boolean(v.reservation_id);
  if(active(previous)&&active(current)){
    if(previous.reservation_id!==current.reservation_id) {
      return {kind:"new_customer",forceReturnToHyzrStart:true,showWelcomeAfterReset:true};
    }
    if(previous.end_at!==current.end_at){
      return {kind:"extension_confirmed",forceReturnToHyzrStart:false,showWelcomeAfterReset:false};
    }
    if(previous.screen_phase!=="staff"&&current.screen_phase==="staff"){
      return {kind:"staff_mode_enabled",forceReturnToHyzrStart:false,showWelcomeAfterReset:false};
    }
    if(previous.screen_phase==="staff"&&current.screen_phase!=="staff"){
      return {kind:"staff_mode_ended",forceReturnToHyzrStart:false,showWelcomeAfterReset:false};
    }
  }
  if(active(previous)&&!active(current))
    return {kind:"session_locked",forceReturnToHyzrStart:false,showWelcomeAfterReset:false};
  if(!active(previous)&&active(current))
    return {kind:"paid_session_started",forceReturnToHyzrStart:false,showWelcomeAfterReset:true};
  return {kind:"unchanged",forceReturnToHyzrStart:false,showWelcomeAfterReset:false};
}
