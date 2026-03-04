(function () {

  console.log("[DART BOOKING v27] LOADED");

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
  // Styles (Mobile first - GK dark)
  // -----------------------------
  function injectCSS() {
    if (document.getElementById("gk-dart-css-v27")) return;

    var css = ""
      + ":root{--gk-bg:#111;--gk-card:#171717;--gk-card2:#1c1c1c;--gk-line:rgba(255,255,255,.10);--gk-soft:rgba(255,255,255,.08);--gk-text:rgba(255,255,255,.92);--gk-muted:rgba(255,255,255,.72);--gk-ac:#2bd18b;--gk-ac2:#7dffb8;--gk-btn:#fff;--gk-btnText:#111}"
      + "#gk-booking{max-width:1100px;margin:0 auto;padding:12px;color:var(--gk-text)}"

      // TOPBAR CARD
      + ".gk-b-top{position:sticky;top:0;z-index:8;background:linear-gradient(180deg, rgba(17,17,17,.92), rgba(17,17,17,.82));backdrop-filter:blur(10px);border:1px solid var(--gk-line);border-radius:16px;padding:12px;margin:10px 0 14px 0;box-shadow:0 10px 30px rgba(0,0,0,.25)}"
      + ".gk-b-top-inner{display:flex;flex-direction:column;gap:12px}"

      // row 1: title + cart
      + ".gk-top-row1{display:flex;gap:10px;align-items:flex-start;justify-content:space-between}"
      + ".gk-top-title{display:flex;flex-direction:column;gap:4px}"
      + ".gk-top-title b{font-size:14px;letter-spacing:.2px}"
      + ".gk-top-title span{font-size:12px;color:var(--gk-muted);line-height:1.2}"

      // cart button
      + ".gk-cartbtn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 14px;border-radius:14px;border:1px solid rgba(43,209,139,.55);background:linear-gradient(135deg, rgba(43,209,139,.18), rgba(125,255,184,.08));color:var(--gk-text);text-decoration:none;font-weight:900;white-space:nowrap;min-width:160px}"
      + ".gk-cartbtn:active{transform:scale(.99)}"

      // row 2: sets control
      + ".gk-sets{display:flex;flex-direction:column;gap:8px;background:rgba(255,255,255,.04);border:1px solid var(--gk-line);border-radius:14px;padding:10px}"
      + ".gk-sets-head{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}"
      + ".gk-sets-head strong{font-weight:900}"
      + ".gk-sets-hint{font-size:12px;color:var(--gk-muted);line-height:1.25}"
      + ".gk-sets-ctrl{display:flex;gap:10px;align-items:center}"
      + ".gk-sets-btn{width:44px;height:44px;border-radius:14px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:var(--gk-text);font-weight:900;font-size:18px;cursor:pointer}"
      + ".gk-sets-btn:active{transform:scale(.99)}"
      + ".gk-sets-val{min-width:28px;text-align:center;font-weight:900;font-size:16px}"

      // CALENDAR CARD
      + ".gk-cal{border:1px solid var(--gk-line);border-radius:16px;overflow:hidden;background:linear-gradient(180deg, var(--gk-card), var(--gk-card2));box-shadow:0 10px 30px rgba(0,0,0,.18)}"
      + ".gk-cal-head{padding:12px 12px;border-bottom:1px solid var(--gk-line);display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}"
      + ".gk-cal-title{font-weight:900;font-size:16px}"
      + ".gk-cal-nav{display:flex;gap:8px;align-items:center}"
      + ".gk-navbtn{padding:10px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:var(--gk-text);cursor:pointer;font-weight:900}"
      + ".gk-navbtn:active{transform:scale(.99)}"

      // DATE CHIPS (bigger cards)
      + ".gk-chips{display:flex;gap:10px;overflow:auto;padding:12px;border-bottom:1px solid var(--gk-line);scrollbar-width:none}"
      + ".gk-chips::-webkit-scrollbar{display:none}"
      + ".gk-chip{flex:0 0 auto;min-width:96px;padding:10px 12px;border-radius:16px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);cursor:pointer;color:var(--gk-text);text-align:left}"
      + ".gk-chip[data-active='1']{border-color:rgba(43,209,139,.75);background:linear-gradient(135deg, rgba(43,209,139,.18), rgba(125,255,184,.08))}"
      + ".gk-chip .gk-chip-top{font-weight:900;font-size:13px;line-height:1.05}"
      + ".gk-chip .gk-chip-sub{font-size:11px;color:var(--gk-muted);margin-top:4px}"

      // GRID
      + ".gk-grid{padding:12px;display:flex;flex-direction:column;gap:10px}"
      + ".gk-row{display:grid;grid-template-columns:92px 1fr;gap:10px;align-items:stretch}"
      + ".gk-time{display:flex;align-items:center;justify-content:flex-start;font-weight:900;color:var(--gk-text);opacity:.95}"
      + ".gk-lanes{display:grid;grid-template-columns:1fr 1fr;gap:10px}"

      // Lane button
      + ".gk-lbtn{width:100%;padding:14px 12px;border-radius:16px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:var(--gk-text);cursor:pointer;font-weight:900}"
      + ".gk-lbtn:hover{border-color:rgba(43,209,139,.55)}"
      + ".gk-lbtn:active{transform:scale(.99)}"
      + ".gk-lbtn[disabled]{opacity:.65;cursor:not-allowed}"
      + ".gk-lbtn.gk-ok{border-color:rgba(43,209,139,.75);background:linear-gradient(135deg, rgba(43,209,139,.18), rgba(125,255,184,.08))}"

      // Notes
      + ".gk-note{padding:12px;color:var(--gk-muted);font-size:12px;line-height:1.35}"
      + ".gk-empty{padding:16px 12px;color:var(--gk-muted)}"

      // Desktop tweaks
      + "@media (min-width:900px){"
      + "  #gk-booking{padding:16px}"
      + "  .gk-b-top-inner{flex-direction:row;align-items:stretch;justify-content:space-between}"
      + "  .gk-top-row1{flex:1}"
      + "  .gk-sets{max-width:520px;flex:0 0 520px}"
      + "  .gk-row{grid-template-columns:130px 1fr}"
      + "  .gk-cal-title{font-size:18px}"
      + "}"
      ;

    var style = document.createElement("style");
    style.id = "gk-dart-css-v27";
    style.type = "text/css";
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }
  injectCSS();

  // -----------------------------
  // Topbar (new structure)
  // -----------------------------
  var topbar = document.createElement("div");
  topbar.className = "gk-b-top";

  var topInner = document.createElement("div");
  topInner.className = "gk-b-top-inner";
  topbar.appendChild(topInner);

  var row1 = document.createElement("div");
  row1.className = "gk-top-row1";
  topInner.appendChild(row1);

  var titleBox = document.createElement("div");
  titleBox.className = "gk-top-title";
  row1.appendChild(titleBox);

  var titleB = document.createElement("b");
  titleB.textContent = "Dart booking";
  titleBox.appendChild(titleB);

  var titleS = document.createElement("span");
  titleS.textContent = "Velg pilsett (valgfritt), legg til tider – gå til handlekurv når du er klar.";
  titleBox.appendChild(titleS);

  var cartBtn = document.createElement("a");
  cartBtn.className = "gk-cartbtn";
  cartBtn.href = CART_URL;
  cartBtn.textContent = "Gå til handlekurv";
  row1.appendChild(cartBtn);

  // Sets card
  var setsWrap = document.createElement("div");
  setsWrap.className = "gk-sets";
  topInner.appendChild(setsWrap);

  var setsHead = document.createElement("div");
  setsHead.className = "gk-sets-head";
  setsWrap.appendChild(setsHead);

  var setsLabel = document.createElement("strong");
  setsLabel.textContent = "Leie pilsett";
  setsHead.appendChild(setsLabel);

  var setsCtrl = document.createElement("div");
  setsCtrl.className = "gk-sets-ctrl";
  setsHead.appendChild(setsCtrl);

  function mkBtn(txt) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "gk-sets-btn";
    b.textContent = txt;
    return b;
  }
  var btnMinus = mkBtn("−");
  var btnPlus = mkBtn("+");

  var setsVal = document.createElement("div");
  setsVal.className = "gk-sets-val";
  setsVal.textContent = "0";

  setsCtrl.appendChild(btnMinus);
  setsCtrl.appendChild(setsVal);
  setsCtrl.appendChild(btnPlus);

  var setsHint = document.createElement("div");
  setsHint.className = "gk-sets-hint";
  setsHint.textContent = "For deg som ikke har eget sett. 25 kr per pilsett. Legges til per dato du booker.";
  setsWrap.appendChild(setsHint);

  // Insert topbar
  root.insertBefore(topbar, root.firstChild);

  // -----------------------------
  // State
  // -----------------------------
  var setsQty = 0;               // 0-8
  var setsCountByDate = {};      // { "YYYY-MM-DD": number }

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
    try { localStorage.setItem("gk_dart_sets_qty_v27", String(setsQty)); } catch (e) {}
    try { localStorage.setItem("gk_dart_sets_count_by_date_v27", JSON.stringify(setsCountByDate)); } catch (e2) {}
  }
  function loadState() {
    setsQty = getInt("gk_dart_sets_qty_v27", 0);
    setsCountByDate = getJSON("gk_dart_sets_count_by_date_v27", {});
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

  function fmtChip(dateStr) {
    var d = new Date(dateStr + "T00:00:00");
    var wd = ["Søn","Man","Tir","Ons","Tor","Fre","Lør"][d.getDay()];
    var dd = ("0" + d.getDate()).slice(-2);
    var mm = ("0" + (d.getMonth() + 1)).slice(-2);
    return { top: wd + " " + dd + "." + mm, sub: dateStr };
  }

  function isToday(dateStr) {
    var now = new Date();
    var y = now.getFullYear();
    var m = ("0" + (now.getMonth() + 1)).slice(-2);
    var d = ("0" + now.getDate()).slice(-2);
    return dateStr === (y + "-" + m + "-" + d);
  }

  // -----------------------------
  // Sets per date (correct)
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
  // Calendar UI
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
  note.textContent = "Du kan legge flere tider i handlekurven før du går til kassa.";
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
                b.className = "gk-lbtn gk-ok";
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

    // Build chips (bigger)
    for (var i = 0; i < ALL_DATES.length; i++) {
      (function () {
        var d = ALL_DATES[i];
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "gk-chip";
        chip.setAttribute("data-date", d);

        var f = fmtChip(d);

        var top = document.createElement("div");
        top.className = "gk-chip-top";
        top.textContent = f.top;
        chip.appendChild(top);

        var sub = document.createElement("div");
        sub.className = "gk-chip-sub";
        sub.textContent = isToday(d) ? "I dag" : f.sub;
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
