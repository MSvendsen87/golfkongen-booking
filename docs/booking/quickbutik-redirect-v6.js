/* GolfKongen Booking 2.0 – receipt routing v6.1
 * External file, loaded by a short Quickbutik Body End loader.
 * Redirect is navigation only. Payment, booking and Nuki are server-verified.
 */
(function () {
  'use strict';
  if (window.__GK_BOOKING2_V6_LOADED__) return;
  window.__GK_BOOKING2_V6_LOADED__ = true;

  var PENDING = 'gk2_pending_success_v1';
  var HOLD = 'gk_booking2_recent_hold';
  var CART = 'gk2_redirect_cart_v6';
  var TTL = 30 * 60 * 1000;
  var TARGET = 'https://msvendsen87.github.io/golfkongen-booking/booking/takk/?order=';

  function read(storage, key) {
    try { return JSON.parse(storage.getItem(key) || 'null'); }
    catch (_) { return null; }
  }
  function remove(storage, key) {
    try { storage.removeItem(key); } catch (_) {}
  }
  function fresh(stamp) {
    var age = Date.now() - Number(stamp);
    return Number.isFinite(age) && age >= 0 && age <= TTL;
  }
  function validSku(sku) {
    return /^20\d{2}-\d{2}-\d{2}-\d{4}-\d{4}$/.test(String(sku || ''));
  }
  function pending() {
    var p = read(localStorage, PENDING);
    return p && fresh(p.createdAt) && validSku(p.sku) ? p : null;
  }
  function isBooking(row, p) {
    if (!row) return false;
    var item = row.item || row;
    var sku = String(item.sku || row.sku || '');
    var id = Number(String(item.product_id || item.productId ||
      row.product_id || row.productId || '').replace(/^prod_/, ''));
    return (p && sku === String(p.sku)) ||
      (Number.isInteger(id) && id >= 1474 && id <= 1506 && validSku(sku));
  }
  function saveCart(type) {
    try {
      sessionStorage.setItem(CART, JSON.stringify({ type: type, at: Date.now() }));
    } catch (_) {}
  }
  function cleanBooking() {
    remove(localStorage, PENDING);
    remove(sessionStorage, HOLD);
  }
  function cartSet(data) {
    if (!data || !Array.isArray(data.items)) return;
    var p = pending();
    var has = data.items.some(function (row) { return isBooking(row, p); });
    saveCart(has ? 'booking2' : 'normal');
    if (!has) cleanBooking();
  }
  function cartAdded(data) {
    if (isBooking(data, pending())) saveCart('booking2');
  }
  function hook(name, fn) {
    if (typeof window[name] !== 'function') return;
    var original = window[name];
    window[name] = function () {
      try { fn(arguments[0]); } catch (_) {}
      return original.apply(this, arguments);
    };
  }

  var order = /^\/success\/([1-9][0-9]{0,8})\/?$/.exec(location.pathname);
  if (order) {
    var p = pending();
    var hold = read(sessionStorage, HOLD);
    var state = read(sessionStorage, CART);
    var sameTab = !!(p && hold && hold.sku === p.sku);
    var cartType = state && fresh(state.at) ? state.type : null;
    var eligible = !!(p && cartType !== 'normal' &&
      (sameTab || cartType === 'booking2'));
    cleanBooking();
    remove(sessionStorage, CART);
    remove(sessionStorage, 'gk_success_target_v2');
    remove(localStorage, 'gk_success_target');
    if (eligible) location.replace(TARGET + encodeURIComponent(order[1]));
    return;
  }

  hook('QS_CART_SET', cartSet);
  hook('QS_CART_PRODUCT_ADDED', cartAdded);
})();