(function () {

  console.log("[DART BOOKING v21] LOADED");

  // IDs
  var PRODUCT_A = "1316";
  var PRODUCT_B = "1317";
  var PRODUCT_SETS = "1318";

  var EVENT_ID = "9847005";
  var CART_URL = "/cart/index";

  var API_A = "https://cold-shadow-36dc.post-cd6.workers.dev/products/" + PRODUCT_A;
  var API_B = "https://cold-shadow-36dc.post-cd6.workers.dev/products/" + PRODUCT_B;
  var API_S = "https://cold-shadow-36dc.post-cd6.workers.dev/products/" + PRODUCT_SETS;

  // Path check (ikke regex-heavy)
  var path = String(location.pathname || "");
  while (path.length && path.charAt(path.length - 1) === "/" && path !== "/") path = path.slice(0, -1);
  if (path !== "/sider/dart-booking") return;

  var root = document.getElementById("gk-booking");
  var status = document.getElementById("gk-booking-status");
  var daysEl = document.getElementById("gk-booking-days");
  if (!root || !status || !daysEl) return;

  // Clean
  status.innerHTML = "";
  daysEl.innerHTML = "";

  // ---- UI Topbar ----
  var topbar = document.getElementById("gk-booking-topbar");
  if (!topbar) {
    topbar = document.createElement("div");
    topbar.id = "gk-booking-topbar";
    topbar.style.display = "flex";
    topbar.style.gap = "10px";
    topbar.style.alignItems = "center";
    topbar.style.justifyContent = "space-between";
    topbar.style.margin = "10px 0 12px 0";
    topbar.style.padding = "10px 12px";
    topbar.style.border = "1px solid #ddd";
    topbar.style.borderRadius = "10px";
    root.insertBefore(topbar, status);
  }

  var leftBox = document.getElementById("gk-booking-leftbox");
  if (!leftBox) {
    leftBox = document.createElement("div");
    leftBox.id = "gk-booking-leftbox";
    leftBox.style.display = "flex";
    leftBox.style.gap = "12px";
    leftBox.style.alignItems = "center";
    topbar.appendChild(leftBox);
  }

  var rightBox = document.getElementById("gk-booking-rightbox");
  if (!rightBox) {
    rightBox = document.createElement("div");
    rightBox.id = "gk-booking-rightbox";
    rightBox.style.display = "flex";
    rightBox.style.gap = "10px";
    rightBox.style.alignItems = "center";
    topbar.appendChild(rightBox);
  }

  var cartBtn = document.getElementById("gk-booking-cartbtn");
  if (!cartBtn) {
    cartBtn = document.createElement("a");
    cartBtn.id = "gk-booking-cartbtn";
    cartBtn.href = CART_URL;
    cartBtn.textContent = "Gaa til handlekurv (0)";
    cartBtn.style.display = "inline-block";
    cartBtn.style.padding = "10px 12px";
    cartBtn.style.borderRadius = "10px";
    cartBtn.style.border = "1px solid #111";
    cartBtn.style.textDecoration = "none";
    cartBtn.style.fontWeight = "600";
    rightBox.appendChild(cartBtn);
  }

  var setsWrap = document.getElementById("gk-sets-wrap");
  if (!setsWrap) {
    setsWrap = document.createElement("div");
    setsWrap.id = "gk-sets-wrap";
    setsWrap.style.display = "flex";
    setsWrap.style.gap = "8px";
    setsWrap.style.alignItems = "center";
    leftBox.appendChild(setsWrap);
  }

  function ensureEl(id, makeFn) {
    var el = document.getElementById(id);
    if (!el) el = makeFn();
    return el;
  }

  var setsLabel = ensureEl("gk-sets-label", function () {
    var d = document.createElement("div");
    d.id = "gk-sets-label";
    d.textContent = "Leie av pilsett (hvis du ikke har eget):";
    d.style.fontWeight = "600";
    setsWrap.appendChild(d);
    return d;
  });

  var btnMinus = ensureEl("gk-sets-minus", function () {
    var b = document.createElement("button");
    b.id = "gk-sets-minus";
    b.type = "button";
    b.textContent = "-";
    b.style.padding = "6px 10px";
    b.style.borderRadius = "8px";
    b.style.border = "1px solid #111";
    b.style.cursor = "pointer";
    setsWrap.appendChild(b);
    return b;
  });

  var setsVal = ensureEl("gk-sets-val", function () {
    var d = document.createElement("div");
    d.id = "gk-sets-val";
    d.textContent = "0";
    d.style.minWidth = "18px";
    d.style.textAlign = "center";
    setsWrap.appendChild(d);
    return d;
  });

  var btnPlus = ensureEl("gk-sets-plus", function () {
    var b = document.createElement("button");
    b.id = "gk-sets-plus";
    b.type = "button";
    b.textContent = "+";
    b.style.padding = "6px 10px";
    b.style.borderRadius = "8px";
    b.style.border = "1px solid #111";
    b.style.cursor = "pointer";
    setsWrap.appendChild(b);
    return b;
  });

  var setsHint = ensureEl("gk-sets-hint", function () {
    var d = document.createElement("div");
    d.id = "gk-sets-hint";
    d.textContent = "25 kr pr sett (0-8). Legges til pr dato du booker.";
    d.style.opacity = "0.75";
    d.style.fontSize = "12px";
    d.style.marginLeft = "10px";
    leftBox.appendChild(d);
    return d;
  });

  // ---- State ----
  var addedSkus = {};
  var setsAddedDates = {};
  var cartCount = 0;
  var setsQty = 0;
  var setsVariantId = "";

  function getJSON(key, def) {
    try { return JSON.parse(localStorage.getItem(key) || ""); } catch (e) { return def; }
  }
  function getInt(key, def) {
    var n = parseInt(localStorage.getItem(key), 10);
    return isNaN(n) ? def : n;
  }
  function save() {
    try { localStorage.setItem("gk_dart_added_skus_v21", JSON.stringify(addedSkus)); } catch (e) {}
    try { localStorage.setItem("gk_dart_sets_added_dates_v21", JSON.stringify(setsAddedDates)); } catch (e2) {}
    try { localStorage.setItem("gk_dart_cart_count_v21", String(cartCount)); } catch (e3) {}
    try { localStorage.setItem("gk_dart_sets_qty_v21", String(setsQty)); } catch (e4) {}
  }
  function load() {
    addedSkus = getJSON("gk_dart_added_skus_v21", {});
    setsAddedDates = getJSON("gk_dart_sets_added_dates_v21", {});
    cartCount = getInt("gk_dart_cart_count_v21", 0);
    setsQty = getInt("gk_dart_sets_qty_v21", 0);
  }

  function updateUI() {
    cartBtn.textContent = "Gaa til handlekurv (" + cartCount + ")";
    setsVal.textContent = String(setsQty);
    save();
  }

  load();
  updateUI();

  btnMinus.onclick = function () {
    if (setsQty <= 0) return;
    setsQty -= 1;
    updateUI();
  };
  btnPlus.onclick = function () {
    if (setsQty >= 8) return;
    setsQty += 1;
    updateUI();
  };

  // ---- Helpers ----
  function postAdd(body) {
    return fetch("/cart/add", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest"
      },
      body: body,
      credentials: "same-origin"
    }).then(function (r) { return r.text(); });
  }

  function parseDT(v) {
    var date = "", time = "";
    if (v && v.values) {
      for (var i = 0; i < v.values.length; i++) {
        var it = v.values[i];
        var n = String(it.name || "").toLowerCase();
        var val = String(it.val || "");
        if (!date && n.indexOf("dag") !== -1) date = val;
        if (!time && n.indexOf("tid") !== -1) time = val;
      }
    }
    return { date: date, time: time };
  }

  function slotPassed(date, time) {
    if (!date || !time) return false;
    var start = String(time).split("-")[0] || "";
    var d = new Date(date + "T" + start + ":00");
    return d.getTime() < (new Date()).getTime();
  }

  function buildIndex(variants, productId, laneName) {
    var map = {};
    for (var i = 0; i < variants.length; i++) {
      var v = variants[i];
      var qty = parseInt(v.qty || "0", 10);
      if (isNaN(qty) || qty === 0) continue;

      var dt = parseDT(v);
      if (!dt.date || !dt.time) continue;
      if (slotPassed(dt.date, dt.time)) continue;

      if (!map[dt.date]) map[dt.date] = {};
      if (!map[dt.date][dt.time]) map[dt.date][dt.time] = {};
      map[dt.date][dt.time][laneName] = {
        product: String(productId),
        variant: String(v.id || ""),
        sku: String(v.sku || ""),
        date: dt.date,
        time: dt.time
      };
    }
    return map;
  }

  function merge(a, b) {
    var out = {};
    var d;
    for (d in a) {
      if (!a.hasOwnProperty(d)) continue;
      if (!out[d]) out[d] = {};
      var t;
      for (t in a[d]) {
        if (!a[d].hasOwnProperty(t)) continue;
        if (!out[d][t]) out[d][t] = {};
        out[d][t].A = a[d][t].A;
      }
    }
    for (d in b) {
      if (!b.hasOwnProperty(d)) continue;
      if (!out[d]) out[d] = {};
      var t2;
      for (t2 in b[d]) {
        if (!b[d].hasOwnProperty(t2)) continue;
        if (!out[d][t2]) out[d][t2] = {};
        out[d][t2].B = b[d][t2].B;
      }
    }
    return out;
  }

  function keys(o) {
    var arr = [];
    for (var k in o) if (o.hasOwnProperty(k)) arr.push(k);
    arr.sort();
    return arr;
  }

  // Pilsett pr dato: legg til 1 og 1 setsQty ganger
  function addSetsForDate(dateKey, cb) {
    if (setsQty === 0) { cb(); return; }
    if (!dateKey) { cb(); return; }
    if (setsAddedDates[dateKey]) { cb(); return; }
    if (!setsVariantId) { cb(); return; }

    status.innerHTML = "Legger til pilsett...";

    var left = setsQty;

    function one() {
      if (left <= 0) {
        setsAddedDates[dateKey] = true;
        status.innerHTML = "";
        save();
        cb();
        return;
      }

      var body =
        "product_id=" + encodeURIComponent(PRODUCT_SETS) +
        "&variant=" + encodeURIComponent(setsVariantId) +
        "&qty=1" +
        "&eventId=" + encodeURIComponent(EVENT_ID) +
        "&page=product";

      postAdd(body).then(function () {
        cartCount += 1;
        left -= 1;
        updateUI();
        one();
      }).catch(function () {
        status.innerHTML = "";
        cb();
      });
    }

    one();
  }

  function addBooking(slot, btn) {
    var skuKey = slot.product + "|" + slot.sku;
    if (addedSkus[skuKey]) return;

    btn.disabled = true;
    btn.textContent = "Legger til...";

    var body =
      "product_id=" + encodeURIComponent(slot.product) +
      "&variant=" + encodeURIComponent(slot.variant) +
      "&qty=1" +
      "&eventId=" + encodeURIComponent(EVENT_ID) +
      "&page=product";

    postAdd(body).then(function () {
      addedSkus[skuKey] = 1;
      cartCount += 1;
      updateUI();
      btn.textContent = "Lagt til";
      btn.style.opacity = "0.75";
    }).catch(function () {
      btn.disabled = false;
      btn.textContent = "Book";
    });
  }

  function onBook(slot, btn) {
    addSetsForDate(slot.date, function () {
      addBooking(slot, btn);
    });
  }

  function render(slots) {
    daysEl.innerHTML = "";
    var ds = keys(slots);

    for (var i = 0; i < ds.length; i++) {
      var d = ds[i];

      var wrap = document.createElement("div");
      wrap.style.margin = "16px 0";
      wrap.style.padding = "12px";
      wrap.style.border = "1px solid #ddd";
      wrap.style.borderRadius = "10px";

      var h = document.createElement("h3");
      h.textContent = d;
      h.style.margin = "0 0 10px 0";
      wrap.appendChild(h);

      var ts = keys(slots[d]);
      for (var j = 0; j < ts.length; j++) {
        var t = ts[j];

        var row = document.createElement("div");
        row.style.margin = "8px 0";

        var label = document.createElement("div");
        label.textContent = t;
        label.style.fontWeight = "600";
        row.appendChild(label);

        var box = document.createElement("div");
        box.style.display = "flex";
        box.style.gap = "10px";
        box.style.marginTop = "6px";

        var obj = slots[d][t];

        function make(text, s) {
          var b = document.createElement("button");
          b.type = "button";
          b.textContent = text;
          b.style.padding = "8px 10px";
          b.style.border = "1px solid #111";
          b.style.borderRadius = "8px";
          b.style.cursor = "pointer";

          var skuKey = s.product + "|" + s.sku;
          if (addedSkus[skuKey]) {
            b.textContent = text + " (lagt til)";
            b.disabled = true;
            b.style.opacity = "0.75";
            b.style.cursor = "default";
          } else {
            (function (slotRef, btnRef) {
              btnRef.onclick = function () { onBook(slotRef, btnRef); };
            })(s, b);
          }
          return b;
        }

        if (obj.A) box.appendChild(make("Bane A", obj.A));
        if (obj.B) box.appendChild(make("Bane B", obj.B));

        row.appendChild(box);
        wrap.appendChild(row);
      }

      daysEl.appendChild(wrap);
    }
  }

  // Load data
  Promise.all([
    fetch(API_A).then(function (r) { return r.json(); }),
    fetch(API_B).then(function (r) { return r.json(); }),
    fetch(API_S).then(function (r) { return r.json(); })
  ]).then(function (res) {

    var prodA = res[0] && res[0].product ? res[0].product : null;
    var prodB = res[1] && res[1].product ? res[1].product : null;
    var prodS = res[2] && res[2].product ? res[2].product : null;

    if (prodS && prodS.variants && prodS.variants.length) setsVariantId = String(prodS.variants[0].id || "");
    else setsVariantId = "";

    console.log("[DART] setsVariantId:", setsVariantId);

    var mapA = buildIndex(prodA ? prodA.variants : [], PRODUCT_A, "A");
    var mapB = buildIndex(prodB ? prodB.variants : [], PRODUCT_B, "B");

    render(merge(mapA, mapB));

  }).catch(function () {
    status.innerHTML = "Kunne ikke laste tider.";
  });

})(); // END v21
