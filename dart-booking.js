(function () {

  console.log("[DART BOOKING v25] LOADED");

  // Produkter
  var PRODUCT_A = "1316";
  var PRODUCT_B = "1317";
  var PRODUCT_SETS = "1318";

  // Quickbutik eventId
  var EVENT_ID = "9847005";

  // Cart
  var CART_URL = "/cart/index";

  // API
  var API_BASE = "https://cold-shadow-36dc.post-cd6.workers.dev/products/";
  var API_A = API_BASE + PRODUCT_A;
  var API_B = API_BASE + PRODUCT_B;

  // Path check
  var path = String(location.pathname || "");
  while (path.length && path.charAt(path.length - 1) === "/" && path !== "/") path = path.slice(0, -1);
  if (path !== "/sider/dart-booking") return;

  var root = document.getElementById("gk-booking");
  var status = document.getElementById("gk-booking-status");
  var daysEl = document.getElementById("gk-booking-days");
  if (!root || !status || !daysEl) return;

  status.innerHTML = "";
  daysEl.innerHTML = "";

  // -----------------------------
  // UI TOPBAR
  // -----------------------------
  var topbar = document.getElementById("gk-booking-topbar");
  if (!topbar) {
    topbar = document.createElement("div");
    topbar.id = "gk-booking-topbar";
    topbar.style.display = "flex";
    topbar.style.flexWrap = "wrap";
    topbar.style.gap = "10px";
    topbar.style.alignItems = "center";
    topbar.style.justifyContent = "space-between";
    topbar.style.margin = "10px 0 12px 0";
    topbar.style.padding = "10px 12px";
    topbar.style.border = "1px solid #ddd";
    topbar.style.borderRadius = "10px";
    root.insertBefore(topbar, root.firstChild);
  } else {
    topbar.innerHTML = "";
  }

  var leftBox = document.createElement("div");
  leftBox.style.display = "flex";
  leftBox.style.flexWrap = "wrap";
  leftBox.style.gap = "10px";
  leftBox.style.alignItems = "center";
  topbar.appendChild(leftBox);

  var rightBox = document.createElement("div");
  rightBox.style.display = "flex";
  rightBox.style.gap = "10px";
  rightBox.style.alignItems = "center";
  topbar.appendChild(rightBox);

  var cartBtn = document.createElement("a");
  cartBtn.id = "gk-booking-cartbtn";
  cartBtn.href = CART_URL;
  cartBtn.textContent = "Gå til handlekurv";
  cartBtn.style.display = "inline-block";
  cartBtn.style.padding = "10px 12px";
  cartBtn.style.borderRadius = "10px";
  cartBtn.style.border = "1px solid #111";
  cartBtn.style.textDecoration = "none";
  cartBtn.style.fontWeight = "700";
  rightBox.appendChild(cartBtn);

  // Pilsett-velger
  var setsWrap = document.createElement("div");
  setsWrap.style.display = "flex";
  setsWrap.style.gap = "8px";
  setsWrap.style.alignItems = "center";
  leftBox.appendChild(setsWrap);

  var setsLabel = document.createElement("div");
  setsLabel.textContent = "Leie pilsett:";
  setsLabel.style.fontWeight = "700";
  setsWrap.appendChild(setsLabel);

  function mkBtn(txt) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = txt;
    b.style.padding = "6px 10px";
    b.style.borderRadius = "8px";
    b.style.border = "1px solid #111";
    b.style.cursor = "pointer";
    return b;
  }

  var btnMinus = mkBtn("-");
  var btnPlus = mkBtn("+");

  var setsVal = document.createElement("div");
  setsVal.textContent = "0";
  setsVal.style.minWidth = "18px";
  setsVal.style.textAlign = "center";
  setsVal.style.fontWeight = "700";

  setsWrap.appendChild(btnMinus);
  setsWrap.appendChild(setsVal);
  setsWrap.appendChild(btnPlus);

  var setsHint = document.createElement("div");
  setsHint.textContent = "For deg som ikke har eget (25 kr pr sett). Legges til per dato du booker.";
  setsHint.style.opacity = "0.8";
  setsHint.style.fontSize = "12px";
  leftBox.appendChild(setsHint);

  // -----------------------------
  // STATE
  // -----------------------------
  var setsQty = 0;               // 0-8 (valg)
  var setsCountByDate = {};      // { "YYYY-MM-DD": number } hvor mange som er lagt til for den datoen

  function getJSON(key, def) {
    try {
      var v = localStorage.getItem(key);
      if (!v) return def;
      return JSON.parse(v);
    } catch (e) { return def; }
  }
  function getInt(key, def) {
    try {
      var v = parseInt(localStorage.getItem(key), 10);
      if (isNaN(v)) return def;
      return v;
    } catch (e) { return def; }
  }
  function saveState() {
    try { localStorage.setItem("gk_dart_sets_qty_v25", String(setsQty)); } catch (e) {}
    try { localStorage.setItem("gk_dart_sets_count_by_date_v25", JSON.stringify(setsCountByDate)); } catch (e2) {}
  }
  function loadState() {
    setsQty = getInt("gk_dart_sets_qty_v25", 0);
    setsCountByDate = getJSON("gk_dart_sets_count_by_date_v25", {});
  }
  function updateSetsUI() {
    setsVal.textContent = String(setsQty);
    saveState();
  }

  loadState();
  updateSetsUI();

  btnMinus.onclick = function () {
    if (setsQty <= 0) return;
    setsQty -= 1;
    updateSetsUI();
  };
  btnPlus.onclick = function () {
    if (setsQty >= 8) return;
    setsQty += 1;
    updateSetsUI();
  };

  // -----------------------------
  // Cart helpers
  // -----------------------------
  function postAddForm(bodyStr) {
    return fetch("/cart/add", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest"
      },
      body: bodyStr,
      credentials: "same-origin"
    }).then(function (r) { return r.text(); });
  }

  function addVariantToCart(productId, variantId, cb) {
    var body =
      "product_id=" + encodeURIComponent(String(productId)) +
      "&variant=" + encodeURIComponent(String(variantId)) +
      "&qty=1&quantity=1" +
      "&eventId=" + encodeURIComponent(String(EVENT_ID)) +
      "&page=product";

    console.log("[DART] POST /cart/add (variant) body:", body);

    postAddForm(body).then(function () { cb(true); })
      .catch(function (e) { console.log("[DART] addVariantToCart error:", e); cb(false); });
  }

  function addProductToCart(productId, qty, cb) {
    if (!qty || qty <= 0) { cb(true); return; }

    var body =
      "product_id=" + encodeURIComponent(String(productId)) +
      "&qty=" + encodeURIComponent(String(qty)) +
      "&quantity=" + encodeURIComponent(String(qty)) +
      "&eventId=" + encodeURIComponent(String(EVENT_ID)) +
      "&page=product";

    console.log("[DART] POST /cart/add (product) body:", body);

    postAddForm(body).then(function () { cb(true); })
      .catch(function (e) { console.log("[DART] addProductToCart error:", e); cb(false); });
  }

  // -----------------------------
  // Variants parsing
  // -----------------------------
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
      if (isNaN(qty) || qty <= 0) continue;

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

  // -----------------------------
  // Pilsett per dato (riktig)
  // - Hvis du har valgt 2 pilsett og booker 2 datoer => total 4
  // - Vi legger bare til differansen hvis dato allerede har noe
  // -----------------------------
  function ensureSetsForDate(dateKey, cb) {
    if (setsQty <= 0) { cb(true); return; }
    if (!dateKey) { cb(true); return; }

    var already = parseInt(setsCountByDate[dateKey] || 0, 10);
    if (isNaN(already)) already = 0;

    var need = setsQty - already;
    if (need <= 0) { cb(true); return; }

    status.innerHTML = "Legger til pilsett… (" + need + " stk)";

    function addOne() {
      if (need <= 0) {
        setsCountByDate[dateKey] = setsQty;
        saveState();
        cb(true);
        return;
      }
      addProductToCart(PRODUCT_SETS, 1, function (ok) {
        if (!ok) { cb(false); return; }
        need -= 1;
        addOne();
      });
    }

    addOne();
  }

  // -----------------------------
  // Render
  // -----------------------------
  status.innerHTML = "Laster ledige tider…";

  Promise.all([
    fetch(API_A).then(function (r) { return r.json(); }),
    fetch(API_B).then(function (r) { return r.json(); })
  ]).then(function (res) {

    var a = res[0] && res[0].product ? res[0].product : null;
    var b = res[1] && res[1].product ? res[1].product : null;

    var varsA = a && a.variants ? a.variants : [];
    var varsB = b && b.variants ? b.variants : [];

    var mapA = buildIndex(varsA, PRODUCT_A, "A");
    var mapB = buildIndex(varsB, PRODUCT_B, "B");

    var slots = merge(mapA, mapB);
    var dates = keys(slots);

    status.innerHTML = "";

    if (!dates.length) {
      status.innerHTML = "Ingen ledige tider akkurat nå.";
      return;
    }

    for (var di = 0; di < dates.length; di++) {
      var date = dates[di];

      var box = document.createElement("div");
      box.style.border = "1px solid #ddd";
      box.style.margin = "10px 0";
      box.style.padding = "10px";
      box.style.borderRadius = "10px";

      var title = document.createElement("div");
      title.textContent = date;
      title.style.fontWeight = "800";
      title.style.fontSize = "18px";
      title.style.marginBottom = "8px";
      box.appendChild(title);

      var times = keys(slots[date]);

      for (var ti = 0; ti < times.length; ti++) {
        var time = times[ti];

        var row = document.createElement("div");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "10px";
        row.style.margin = "6px 0";

        var t = document.createElement("div");
        t.textContent = time;
        t.style.minWidth = "92px";
        t.style.fontWeight = "700";
        row.appendChild(t);

        function mkLaneBtn(label, slot) {
          var b = document.createElement("button");
          b.type = "button";
          b.textContent = label;
          b.style.padding = "7px 10px";
          b.style.borderRadius = "8px";
          b.style.border = "1px solid #111";
          b.style.cursor = "pointer";

          b.onclick = function () {
            b.disabled = true;
            b.textContent = "Legger til…";

            // 1) Sikre pilsett pr dato
            ensureSetsForDate(slot.date, function (okSets) {
              if (!okSets) {
                b.disabled = false;
                b.textContent = label + " (feil – prøv igjen)";
                return;
              }

              // 2) Legg til booking-variant
              addVariantToCart(slot.product, slot.variant, function (okVar) {
                if (okVar) {
                  status.innerHTML = "";
                  b.textContent = "Lagt i handlekurv ✓";
                } else {
                  b.disabled = false;
                  b.textContent = label + " (feil – prøv igjen)";
                }
              });
            });
          };

          return b;
        }

        if (slots[date][time].A) row.appendChild(mkLaneBtn("Bane A", slots[date][time].A));
        if (slots[date][time].B) row.appendChild(mkLaneBtn("Bane B", slots[date][time].B));

        box.appendChild(row);
      }

      daysEl.appendChild(box);
    }

  }).catch(function (e) {
    console.log("[DART] load error:", e);
    status.innerHTML = "Kunne ikke laste tider (se console).";
  });

})();
