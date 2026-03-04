(function () {

  console.log("[DART BOOKING v26] LOADED");

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
  if (!root || !daysEl) return;

  if (status) status.innerHTML = "";
  daysEl.innerHTML = "";

  // -----------------------------
  // Styles (mobile-first)
  // -----------------------------
  function injectCSS() {
    if (document.getElementById("gk-dart-css-v26")) return;
    var css = ""
      + "#gk-booking{max-width:1100px;margin:0 auto;padding:12px}"
      + ".gk-b-top{position:sticky;top:0;z-index:5;background:rgba(255,255,255,0.92);backdrop-filter:blur(6px);border:1px solid #e5e5e5;border-radius:14px;padding:10px;margin:10px 0 12px 0}"
      + ".gk-b-top-inner{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}"
      + ".gk-b-left{display:flex;flex-wrap:wrap;gap:10px;align-items:center}"
      + ".gk-b-right{display:flex;gap:10px;align-items:center}"
      + ".gk-cartbtn{display:inline-block;padding:10px 12px;border-radius:12px;border:1px solid #111;text-decoration:none;font-weight:800}"
      + ".gk-sets{display:flex;gap:8px;align-items:center;flex-wrap:wrap}"
      + ".gk-sets strong{font-weight:900}"
      + ".gk-sets-btn{padding:6px 10px;border-radius:10px;border:1px solid #111;cursor:pointer}"
      + ".gk-sets-val{min-width:20px;text-align:center;font-weight:900}"
      + ".gk-sets-hint{opacity:.78;font-size:12px}"
      + ".gk-cal{border:1px solid #e5e5e5;border-radius:14px;overflow:hidden}"
      + ".gk-cal-head{padding:10px 12px;border-bottom:1px solid #e5e5e5;display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}"
      + ".gk-cal-title{font-weight:900;font-size:16px}"
      + ".gk-cal-nav{display:flex;gap:8px;align-items:center}"
      + ".gk-navbtn{padding:8px 10px;border-radius:10px;border:1px solid #111;background:#fff;cursor:pointer;font-weight:800}"
      + ".gk-chips{display:flex;gap:8px;overflow:auto;padding:10px 12px;border-bottom:1px solid #e5e5e5}"
      + ".gk-chip{white-space:nowrap;padding:8px 10px;border-radius:999px;border:1px solid #d7d7d7;background:#fff;cursor:pointer;font-weight:800}"
      + ".gk-chip[data-active='1']{border-color:#111}"
      + ".gk-chip small{opacity:.75;font-weight:700}"
      + ".gk-grid{padding:10px 12px;display:flex;flex-direction:column;gap:8px}"
      + ".gk-row{display:grid;grid-template-columns:96px 1fr;gap:10px;align-items:center}"
      + ".gk-time{font-weight:900;opacity:.9}"
      + ".gk-lanes{display:flex;gap:8px;flex-wrap:wrap}"
      + ".gk-lbtn{padding:10px 12px;border-radius:12px;border:1px solid #111;background:#fff;cursor:pointer;font-weight:900;flex:1;min-width:120px}"
      + ".gk-lbtn[disabled]{opacity:.65;cursor:not-allowed}"
      + ".gk-note{padding:10px 12px;opacity:.8;font-size:12px}"
      + ".gk-empty{padding:16px 12px;opacity:.85}"
      + "@media (min-width:900px){"
      + "  #gk-booking{padding:16px}"
      + "  .gk-row{grid-template-columns:130px 1fr}"
      + "  .gk-cal-title{font-size:18px}"
      + "  .gk-lbtn{flex:0;min-width:140px}"
      + "}";
    var style = document.createElement("style");
    style.id = "gk-dart-css-v26";
    style.type = "text/css";
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }
  injectCSS();

  // -----------------------------
  // Topbar
  // -----------------------------
  var topbar = document.createElement("div");
  topbar.className = "gk-b-top";

  var topInner = document.createElement("div");
  topInner.className = "gk-b-top-inner";
  topbar.appendChild(topInner);

  var leftBox = document.createElement("div");
  leftBox.className = "gk-b-left";
  topInner.appendChild(leftBox);

  var rightBox = document.createElement("div");
  rightBox.className = "gk-b-right";
  topInner.appendChild(rightBox);

  var cartBtn = document.createElement("a");
  cartBtn.className = "gk-cartbtn";
  cartBtn.href = CART_URL;
  cartBtn.textContent = "Gå til handlekurv";
  rightBox.appendChild(cartBtn);

  // Pilsett UI
  var setsWrap = document.createElement("div");
  setsWrap.className = "gk-sets";
  leftBox.appendChild(setsWrap);

  var setsLabel = document.createElement("strong");
  setsLabel.textContent = "Leie pilsett:";
  setsWrap.appendChild(setsLabel);

  function mkBtn(txt) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "gk-sets-btn";
    b.textContent = txt;
    return b;
  }
  var btnMinus = mkBtn("-");
  var btnPlus = mkBtn("+");
  var setsVal = document.createElement("div");
  setsVal.className = "gk-sets-val";
  setsVal.textContent = "0";

  setsWrap.appendChild(btnMinus);
  setsWrap.appendChild(setsVal);
  setsWrap.appendChild(btnPlus);

  var setsHint = document.createElement("div");
  setsHint.className = "gk-sets-hint";
  setsHint.textContent = "For deg som ikke har eget (25 kr pr sett). Legges til per dato du booker.";
  leftBox.appendChild(setsHint);

  // Insert topbar before content
  root.insertBefore(topbar, root.firstChild);

  // -----------------------------
  // State
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
    try { localStorage.setItem("gk_dart_sets_qty_v26", String(setsQty)); } catch (e) {}
    try { localStorage.setItem("gk_dart_sets_count_by_date_v26", JSON.stringify(setsCountByDate)); } catch (e2) {}
  }
  function loadState() {
    setsQty = getInt("gk_dart_sets_qty_v26", 0);
    setsCountByDate = getJSON("gk_dart_sets_count_by_date_v26", {});
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

    postAddForm(body).then(function () { cb(true); })
      .catch(function () { cb(false); });
  }

  function addProductToCart(productId, qty, cb) {
    if (!qty || qty <= 0) { cb(true); return; }
    var body =
      "product_id=" + encodeURIComponent(String(productId)) +
      "&qty=" + encodeURIComponent(String(qty)) +
      "&quantity=" + encodeURIComponent(String(qty)) +
      "&eventId=" + encodeURIComponent(String(EVENT_ID)) +
      "&page=product";

    postAddForm(body).then(function () { cb(true); })
      .catch(function () { cb(false); });
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

  function fmtDayLabel(dateStr) {
    // YYYY-MM-DD -> "Man 09.03"
    var d = new Date(dateStr + "T00:00:00");
    var wd = ["Søn","Man","Tir","Ons","Tor","Fre","Lør"][d.getDay()];
    var dd = ("0" + d.getDate()).slice(-2);
    var mm = ("0" + (d.getMonth() + 1)).slice(-2);
    return wd + " " + dd + "." + mm;
  }

  function isToday(dateStr) {
    var now = new Date();
    var y = now.getFullYear();
    var m = ("0" + (now.getMonth() + 1)).slice(-2);
    var d = ("0" + now.getDate()).slice(-2);
    return dateStr === (y + "-" + m + "-" + d);
  }

  // -----------------------------
  // Pilsett per dato (riktig)
  // -----------------------------
  function ensureSetsForDate(dateKey, cb) {
    if (setsQty <= 0) { cb(true); return; }
    if (!dateKey) { cb(true); return; }

    var already = parseInt(setsCountByDate[dateKey] || 0, 10);
    if (isNaN(already)) already = 0;

    var need = setsQty - already;
    if (need <= 0) { cb(true); return; }

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
  // Calendar UI (chips + grid)
  // -----------------------------
  var cal = document.createElement("div");
  cal.className = "gk-cal";
  daysEl.appendChild(cal);

  var calHead = document.createElement("div");
  calHead.className = "gk-cal-head";
  cal.appendChild(calHead);

  var calTitle = document.createElement("div");
  calTitle.className = "gk-cal-title";
  calTitle.textContent = "Velg dato";
  calHead.appendChild(calTitle);

  var calNav = document.createElement("div");
  calNav.className = "gk-cal-nav";
  calHead.appendChild(calNav);

  var prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "gk-navbtn";
  prevBtn.textContent = "Forrige";
  calNav.appendChild(prevBtn);

  var nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "gk-navbtn";
  nextBtn.textContent = "Neste";
  calNav.appendChild(nextBtn);

  var chips = document.createElement("div");
  chips.className = "gk-chips";
  cal.appendChild(chips);

  var grid = document.createElement("div");
  grid.className = "gk-grid";
  cal.appendChild(grid);

  var note = document.createElement("div");
  note.className = "gk-note";
  note.textContent = "Tips: Du kan legge flere tider i handlekurven før du går til kassa.";
  cal.appendChild(note);

  // -----------------------------
  // Load & render
  // -----------------------------
  if (status) status.innerHTML = "Laster ledige tider…";

  var ALL_SLOTS = null;
  var ALL_DATES = [];
  var ACTIVE_DATE = "";

  function setActiveDate(d) {
    ACTIVE_DATE = d;
    // chips active state
    var kids = chips.children;
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i];
      if (!el || !el.getAttribute) continue;
      el.setAttribute("data-active", el.getAttribute("data-date") === d ? "1" : "0");
    }
    renderDay(d);
  }

  function scrollChipIntoView(d) {
    var kids = chips.children;
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i];
      if (el && el.getAttribute && el.getAttribute("data-date") === d) {
        try { el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }); } catch (e) {}
        break;
      }
    }
  }

  function renderDay(dateStr) {
    grid.innerHTML = "";

    if (!ALL_SLOTS || !ALL_SLOTS[dateStr]) {
      var em = document.createElement("div");
      em.className = "gk-empty";
      em.textContent = "Ingen ledige tider denne dagen.";
      grid.appendChild(em);
      calTitle.textContent = dateStr ? (dateStr + (isToday(dateStr) ? " (I dag)" : "")) : "Velg dato";
      return;
    }

    calTitle.textContent = dateStr + (isToday(dateStr) ? " (I dag)" : "");

    var times = keys(ALL_SLOTS[dateStr]);
    for (var ti = 0; ti < times.length; ti++) {
      var time = times[ti];

      var row = document.createElement("div");
      row.className = "gk-row";

      var t = document.createElement("div");
      t.className = "gk-time";
      t.textContent = time;
      row.appendChild(t);

      var lanes = document.createElement("div");
      lanes.className = "gk-lanes";
      row.appendChild(lanes);

      function mkLaneBtn(label, slot) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "gk-lbtn";
        b.textContent = label;

        b.onclick = function () {
          b.disabled = true;
          b.textContent = "Legger til…";

          ensureSetsForDate(slot.date, function (okSets) {
            if (!okSets) {
              b.disabled = false;
              b.textContent = label + " (feil – prøv igjen)";
              return;
            }

            addVariantToCart(slot.product, slot.variant, function (okVar) {
              if (okVar) {
                if (status) status.innerHTML = "";
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

      var slotObj = ALL_SLOTS[dateStr][time];

      if (slotObj.A) lanes.appendChild(mkLaneBtn("Bane A", slotObj.A));
      if (slotObj.B) lanes.appendChild(mkLaneBtn("Bane B", slotObj.B));

      grid.appendChild(row);
    }
  }

  function idxOf(arr, v) {
    for (var i = 0; i < arr.length; i++) if (arr[i] === v) return i;
    return -1;
  }

  function goPrev() {
    var i = idxOf(ALL_DATES, ACTIVE_DATE);
    if (i <= 0) return;
    setActiveDate(ALL_DATES[i - 1]);
    scrollChipIntoView(ACTIVE_DATE);
  }
  function goNext() {
    var i = idxOf(ALL_DATES, ACTIVE_DATE);
    if (i < 0 || i >= ALL_DATES.length - 1) return;
    setActiveDate(ALL_DATES[i + 1]);
    scrollChipIntoView(ACTIVE_DATE);
  }

  prevBtn.onclick = goPrev;
  nextBtn.onclick = goNext;

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

    ALL_SLOTS = merge(mapA, mapB);
    ALL_DATES = keys(ALL_SLOTS);

    if (status) status.innerHTML = "";

    chips.innerHTML = "";

    if (!ALL_DATES.length) {
      grid.innerHTML = "<div class='gk-empty'>Ingen ledige tider akkurat nå.</div>";
      return;
    }

    // Build chips
    for (var i = 0; i < ALL_DATES.length; i++) {
      (function () {
        var d = ALL_DATES[i];
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "gk-chip";
        chip.setAttribute("data-date", d);

        var main = document.createElement("div");
        main.textContent = fmtDayLabel(d);
        chip.appendChild(main);

        var sub = document.createElement("small");
        sub.textContent = isToday(d) ? "I dag" : d;
        chip.appendChild(sub);

        chip.onclick = function () {
          setActiveDate(d);
          scrollChipIntoView(d);
        };

        chips.appendChild(chip);
      })();
    }

    // Default: today if available, else first
    var todayPick = "";
    for (var j = 0; j < ALL_DATES.length; j++) {
      if (isToday(ALL_DATES[j])) { todayPick = ALL_DATES[j]; break; }
    }
    setActiveDate(todayPick || ALL_DATES[0]);
    scrollChipIntoView(ACTIVE_DATE);

  }).catch(function (e) {
    console.log("[DART] load error:", e);
    if (status) status.innerHTML = "Kunne ikke laste tider (se console).";
    grid.innerHTML = "<div class='gk-empty'>Kunne ikke laste tider.</div>";
  });

})();
