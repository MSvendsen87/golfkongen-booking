(function () {
  console.log("[DART BOOKING v34 VENUE LOCK ONLY] LOADED");

  /* ------------------------------------------------ */
  /* KONFIG */
  /* ------------------------------------------------ */

  var PRODUCT_A = "1316";
  var PRODUCT_B = "1317";
  var PRODUCT_SETS = "1318";
  var PRODUCT_CLUB = "1322";
  var PRODUCT_VENUE = "1349"; // Leie hele lokalet

  var EVENT_ID = "9847005";
  var CART_URL = "/cart/index";

  var WORKER_BASE = "https://cold-shadow-36dc.post-cd6.workers.dev";
  var API_BASE = WORKER_BASE + "/products/";
  var API_A = API_BASE + PRODUCT_A;
  var API_B = API_BASE + PRODUCT_B;
  var API_CLUB = API_BASE + PRODUCT_CLUB;
  var API_VENUE = API_BASE + PRODUCT_VENUE;

  var PAGE_PATH = "/sider/dart-booking";
  var ROOT_ID = "gk-booking";
  var STATUS_ID = "gk-booking-status";
  var DAYS_ID = "gk-booking-days";

  var CUTOFF_MINUTES_BEFORE_START = 20;

  /*
    Klubbregel:
    - Torsdag 19:00–22:00 er reservert for klubb frem til tirsdag 00:01 samme uke.
    - Etter tirsdag 00:01 kan vanlig booking brukes dersom ingen klubbpåmelding finnes.
    - Hvis minst én klubbpåmelding finnes, vises tiden som "Reservert klubb".
    - Tidene vises fortsatt på nettsiden, men knappen deaktiveres.
  */
  var CLUB_CAPACITY = 10;
  var CLUB_RELEASE_WEEKDAY = 2; // 0=søn, 1=man, 2=tir
  var CLUB_RELEASE_HOUR = 0;
  var CLUB_RELEASE_MINUTE = 1;
  var CLUB_TIME_FROM = "19:00";
  var CLUB_TIME_TO = "22:00";

  /*
    Visning på vanlig dartbooking:
    - Kun fra dagens dato og 40 dager frem.
    - Klubbkvelder kan ha egne varianter langt frem i tid, men vanlig dartbooking
      skal ikke vise gamle datoer eller dra inn 30 uker med klubb-torsdager.
  */
  var NORMAL_BOOKING_DAYS_AHEAD = 40;

  /*
    Klubbstatus leses maks 30 uker frem, slik at klubbregler fungerer fremover,
    men dart-siden viser fortsatt bare NORMAL_BOOKING_DAYS_AHEAD.
  */
  var CLUB_WEEKS_AHEAD = 30;

  /*
    Enkel manuell stenging av tider.
    Eksempel for gutteklubb fredag 19–22:
    {
      date: "2026-06-05",
      from: "19:00",
      to: "22:00",
      label: "Stengt – gutteklubb"
    }

    Dette stenger kun i frontend. For full drift bør samme dato også legges i
    gk-booking-admin sin closedTimes, slik at nye tider ikke opprettes unødvendig.
  */
  var CUSTOM_CLOSED_TIMES = [
    // {
    //   date: "2026-06-05",
    //   from: "19:00",
    //   to: "22:00",
    //   label: "Stengt – gutteklubb"
    // }
  ];

  /* ------------------------------------------------ */
  /* PATH / ROOT */
  /* ------------------------------------------------ */

  var path = String(location.pathname || "");
  while (path.length && path.charAt(path.length - 1) === "/" && path !== "/") {
    path = path.slice(0, -1);
  }
  if (path !== PAGE_PATH) return;

  try {
    localStorage.removeItem("gk_last_booking_payload_v1");
  } catch (e) {}

  var root = document.getElementById(ROOT_ID);
  var status = document.getElementById(STATUS_ID);
  var daysEl = document.getElementById(DAYS_ID);

  if (!root || !daysEl) return;

  if (status) status.innerHTML = "";
  daysEl.innerHTML = "";

  /* ------------------------------------------------ */
  /* BOOKING STORAGE */
  /* ------------------------------------------------ */

  function gkStoreBookingDetails(payload) {
    try {
      var KEY = "gk_last_booking_payload_v1";
      var TARGET_KEY = "gk_success_target";

      var current = null;
      try {
        current = JSON.parse(localStorage.getItem(KEY) || "null");
      } catch (e) {
        current = null;
      }

      if (!current || typeof current !== "object") {
        current = {
          createdAt: new Date().toISOString(),
          source: payload && payload.source ? payload.source : "booking",
          title: payload && payload.title ? payload.title : "Booking",
          items: [],
          extras: {}
        };
      }

      if (!current.items || !current.items.push) current.items = [];

      if (payload && payload.item) {
        current.items.push(payload.item);
      }

      if (payload && payload.extras) {
        current.extras = payload.extras;
      }

      if (payload && payload.source) current.source = payload.source;
      if (payload && payload.title) current.title = payload.title;

      localStorage.setItem(KEY, JSON.stringify(current));
      localStorage.setItem(TARGET_KEY, "booking");
    } catch (e) {
      console.log("[GK BOOKING STORE] error", e);
    }
  }

  /* ------------------------------------------------ */
  /* CSS */
  /* ------------------------------------------------ */

  function injectCSS() {
    if (document.getElementById("gk-dart-css-v34")) return;

    var css = ""
      + ":root{"
      + "--gk-bg:#0f0f0f;"
      + "--gk-card:#171717;"
      + "--gk-card2:#101010;"
      + "--gk-soft:#1e1e1e;"
      + "--gk-line:rgba(255,255,255,.10);"
      + "--gk-text:rgba(255,255,255,.94);"
      + "--gk-muted:rgba(255,255,255,.72);"
      + "--gk-ac:#2bd18b;"
      + "--gk-ac2:#7dffb8;"
      + "--gk-gold:#f0c14b;"
      + "--gk-red:#ff6b6b;"
      + "--gk-red-2:#ff9a9a;"
      + "--gk-stop:#ffb86b;"
      + "--gk-stop-2:#ffd3a1;"
      + "}"

      + "#gk-booking{max-width:1040px;margin:0 auto;padding:12px;color:var(--gk-text)}"
      + ".gk-status{padding:0 0 10px 0;color:var(--gk-muted);font-size:13px}"

      + ".gk-top{"
      + "position:relative;"
      + "overflow:hidden;"
      + "border:1px solid var(--gk-line);"
      + "border-radius:22px;"
      + "padding:16px;"
      + "background:radial-gradient(circle at top right, rgba(43,209,139,.12), transparent 42%), linear-gradient(180deg,var(--gk-card),var(--gk-card2));"
      + "box-shadow:0 18px 50px rgba(0,0,0,.35);"
      + "margin:0 0 14px 0;"
      + "}"

      + ".gk-top-grid{display:grid;grid-template-columns:1fr;gap:14px;align-items:center}"
      + ".gk-top-title{display:flex;flex-direction:column;gap:8px;min-width:0}"
      + ".gk-top-title b{font-size:25px;line-height:1.08;letter-spacing:.2px}"
      + ".gk-top-title span{font-size:14px;color:var(--gk-muted);line-height:1.45}"

      + ".gk-meta{display:flex;flex-wrap:wrap;gap:8px}"
      + ".gk-chip-meta{"
      + "display:inline-flex;align-items:center;justify-content:center;"
      + "min-height:36px;padding:8px 12px;border-radius:999px;"
      + "border:1px solid rgba(255,255,255,.10);"
      + "background:rgba(255,255,255,.05);"
      + "font-size:13px;font-weight:800;color:var(--gk-text)"
      + "}"
      + ".gk-chip-meta.price{"
      + "border-color:rgba(240,193,75,.35);"
      + "background:linear-gradient(135deg, rgba(240,193,75,.18), rgba(240,193,75,.06));"
      + "color:#ffe29b"
      + "}"
      + ".gk-chip-meta.warn{"
      + "border-color:rgba(255,107,107,.28);"
      + "background:linear-gradient(135deg, rgba(255,107,107,.14), rgba(255,107,107,.06));"
      + "color:#ffc1c1"
      + "}"

      + ".gk-top-actions{display:flex;flex-wrap:wrap;gap:10px}"
      + ".gk-cartbtn{"
      + "display:inline-flex;align-items:center;justify-content:center;gap:8px;"
      + "min-height:46px;padding:12px 16px;border-radius:14px;"
      + "border:1px solid rgba(43,209,139,.55);"
      + "background:linear-gradient(135deg, rgba(43,209,139,.18), rgba(125,255,184,.08));"
      + "color:var(--gk-text);text-decoration:none;font-weight:900;"
      + "width:100%;"
      + "}"
      + ".gk-cartbtn:active{transform:scale(.99)}"

      + ".gk-sets{"
      + "border:1px solid var(--gk-line);"
      + "border-radius:18px;"
      + "padding:12px;"
      + "background:rgba(255,255,255,.04);"
      + "display:flex;flex-direction:column;gap:10px;"
      + "margin:0 0 14px 0"
      + "}"
      + ".gk-sets-head{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}"
      + ".gk-sets-title{font-size:16px;font-weight:900}"
      + ".gk-sets-sub{font-size:12px;color:var(--gk-muted);line-height:1.35}"
      + ".gk-sets-ctrl{display:flex;gap:10px;align-items:center}"
      + ".gk-sets-btn{"
      + "width:42px;height:42px;border-radius:13px;border:1px solid rgba(255,255,255,.18);"
      + "background:rgba(255,255,255,.06);color:var(--gk-text);font-weight:900;font-size:18px;cursor:pointer"
      + "}"
      + ".gk-sets-btn:active{transform:scale(.99)}"
      + ".gk-sets-val{min-width:26px;text-align:center;font-weight:900;font-size:18px}"

      + ".gk-cal{"
      + "border:1px solid var(--gk-line);"
      + "border-radius:22px;"
      + "overflow:hidden;"
      + "background:linear-gradient(180deg,var(--gk-card),var(--gk-card2));"
      + "box-shadow:0 18px 50px rgba(0,0,0,.30)"
      + "}"

      + ".gk-cal-head{padding:14px;border-bottom:1px solid var(--gk-line);display:flex;flex-direction:column;gap:12px}"
      + ".gk-cal-title{font-size:18px;font-weight:900;line-height:1.1}"
      + ".gk-cal-sub{font-size:13px;color:var(--gk-muted);line-height:1.4}"

      + ".gk-cal-nav{display:grid;grid-template-columns:1fr 1fr;gap:10px}"
      + ".gk-navbtn{"
      + "min-height:42px;border-radius:14px;border:1px solid rgba(255,255,255,.14);"
      + "background:rgba(255,255,255,.05);color:var(--gk-text);font-weight:900;cursor:pointer;padding:10px 12px"
      + "}"
      + ".gk-navbtn:active{transform:scale(.99)}"

      + ".gk-chips-wrap{padding:12px 12px 0 12px}"
      + ".gk-chips{display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none;-webkit-overflow-scrolling:touch;touch-action:pan-x}"
      + ".gk-chips::-webkit-scrollbar{display:none}"

      + ".gk-chip{"
      + "flex:0 0 auto;min-width:92px;"
      + "padding:12px 12px;border-radius:16px;border:1px solid rgba(255,255,255,.10);"
      + "background:rgba(255,255,255,.04);color:var(--gk-text);cursor:pointer;text-align:left"
      + "}"
      + ".gk-chip[data-active='1']{border-color:rgba(43,209,139,.70);background:linear-gradient(135deg, rgba(43,209,139,.18), rgba(125,255,184,.08))}"
      + ".gk-chip-top{font-weight:900;font-size:14px;line-height:1.05}"
      + ".gk-chip-sub{font-size:11px;color:var(--gk-muted);margin-top:5px}"

      + ".gk-grid{padding:12px;display:flex;flex-direction:column;gap:12px}"
      + ".gk-row{"
      + "border:1px solid rgba(255,255,255,.08);"
      + "border-radius:18px;"
      + "padding:14px;"
      + "background:linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02));"
      + "display:flex;flex-direction:column;gap:12px"
      + "}"
      + ".gk-row-head{display:flex;flex-direction:column;gap:8px}"
      + ".gk-time{font-size:21px;font-weight:900;line-height:1.05}"
      + ".gk-slot-meta{display:flex;flex-wrap:wrap;gap:8px}"

      + ".gk-mini{"
      + "display:inline-flex;align-items:center;justify-content:center;"
      + "padding:8px 10px;border-radius:12px;"
      + "background:rgba(255,255,255,.05);"
      + "border:1px solid rgba(255,255,255,.08);"
      + "font-size:12px;font-weight:800;color:var(--gk-text)"
      + "}"
      + ".gk-mini.price{"
      + "border-color:rgba(240,193,75,.30);"
      + "background:linear-gradient(135deg, rgba(240,193,75,.16), rgba(240,193,75,.06));"
      + "color:#ffe29b"
      + "}"
      + ".gk-mini.ok{"
      + "border-color:rgba(43,209,139,.30);"
      + "background:linear-gradient(135deg, rgba(43,209,139,.16), rgba(125,255,184,.06));"
      + "color:#bff5d8"
      + "}"
      + ".gk-mini.warn{"
      + "border-color:rgba(255,107,107,.34);"
      + "background:linear-gradient(135deg, rgba(255,107,107,.18), rgba(255,107,107,.06));"
      + "color:#ffd1d1"
      + "}"
      + ".gk-mini.stop{"
      + "border-color:rgba(255,184,107,.32);"
      + "background:linear-gradient(135deg, rgba(255,184,107,.16), rgba(255,184,107,.05));"
      + "color:#ffe0bc"
      + "}"

      + ".gk-lanes{display:grid;grid-template-columns:1fr;gap:10px}"
      + ".gk-lane-card{"
      + "display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:16px;"
      + "border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03)"
      + "}"
      + ".gk-lane-top{display:flex;flex-direction:column;gap:8px}"
      + ".gk-lane-title{font-size:15px;font-weight:900}"
      + ".gk-lane-meta{display:flex;flex-wrap:wrap;gap:8px}"

      + ".gk-lbtn{"
      + "width:100%;min-height:48px;padding:12px 14px;border-radius:16px;"
      + "border:1px solid rgba(43,209,139,.55);"
      + "background:linear-gradient(135deg, rgba(43,209,139,.18), rgba(125,255,184,.08));"
      + "color:var(--gk-text);font-weight:900;cursor:pointer"
      + "}"
      + ".gk-lbtn:active{transform:scale(.99)}"
      + ".gk-lbtn[disabled]{opacity:.88;cursor:not-allowed;transform:none}"
      + ".gk-lbtn.gk-ok{border-color:rgba(43,209,139,.75)}"
      + ".gk-lbtn.gk-locked{border-color:rgba(255,255,255,.14);background:rgba(255,255,255,.05)}"
      + ".gk-lbtn.gk-stopped{border-color:rgba(255,184,107,.36);background:linear-gradient(135deg, rgba(255,184,107,.14), rgba(255,184,107,.05));color:#ffe0bc}"
      + ".gk-lbtn.gk-booked{border-color:rgba(255,107,107,.45);background:linear-gradient(135deg, rgba(255,107,107,.20), rgba(255,107,107,.07));color:#ffd3d3}"

      + ".gk-note{padding:0 14px 14px 14px;color:var(--gk-muted);font-size:12px;line-height:1.45}"
      + ".gk-empty{padding:18px 14px;color:var(--gk-muted)}"

      + "@media (min-width:760px){"
      + "#gk-booking{padding:16px}"
      + ".gk-top{padding:20px}"
      + ".gk-top-grid{grid-template-columns:1fr auto;align-items:end}"
      + ".gk-cartbtn{width:auto;min-width:190px}"
      + ".gk-cal-head{flex-direction:row;align-items:end;justify-content:space-between}"
      + ".gk-cal-nav{display:flex;grid-template-columns:none}"
      + ".gk-lanes{grid-template-columns:1fr 1fr}"
      + "}";

    var style = document.createElement("style");
    style.id = "gk-dart-css-v34";
    style.type = "text/css";
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }
  injectCSS();

  /* ------------------------------------------------ */
  /* TOPP */
  /* ------------------------------------------------ */

  var appStatus = document.createElement("div");
  appStatus.className = "gk-status";
  root.insertBefore(appStatus, root.firstChild);

  var top = document.createElement("div");
  top.className = "gk-top";
  root.insertBefore(top, appStatus.nextSibling);

  var topGrid = document.createElement("div");
  topGrid.className = "gk-top-grid";
  top.appendChild(topGrid);

  var titleBox = document.createElement("div");
  titleBox.className = "gk-top-title";
  topGrid.appendChild(titleBox);

  var titleB = document.createElement("b");
  titleB.textContent = "Dart booking";
  titleBox.appendChild(titleB);

  var titleS = document.createElement("span");
  titleS.textContent = "Pris vises per bane og tid. Booking stenger 20 minutter før start. Bookede tider vises i rødt.";
  titleBox.appendChild(titleS);

  var meta = document.createElement("div");
  meta.className = "gk-meta";
  titleBox.appendChild(meta);

  var chip1 = document.createElement("div");
  chip1.className = "gk-chip-meta price";
  chip1.textContent = "Pris per tid";
  meta.appendChild(chip1);

  var chip2 = document.createElement("div");
  chip2.className = "gk-chip-meta warn";
  chip2.textContent = "Booking stenger 20 min før start";
  meta.appendChild(chip2);

  var actions = document.createElement("div");
  actions.className = "gk-top-actions";
  topGrid.appendChild(actions);

  var cartBtn = document.createElement("a");
  cartBtn.className = "gk-cartbtn";
  cartBtn.href = CART_URL;
  cartBtn.textContent = "Gå til handlekurv";
  actions.appendChild(cartBtn);

  /* ------------------------------------------------ */
  /* PILSETT */
  /* ------------------------------------------------ */

  var setsWrap = document.createElement("div");
  setsWrap.className = "gk-sets";
  daysEl.appendChild(setsWrap);

  var setsHead = document.createElement("div");
  setsHead.className = "gk-sets-head";
  setsWrap.appendChild(setsHead);

  var setsTitle = document.createElement("div");
  setsTitle.className = "gk-sets-title";
  setsTitle.textContent = "Leie pilsett";
  setsHead.appendChild(setsTitle);

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

  var setsSub = document.createElement("div");
  setsSub.className = "gk-sets-sub";
  setsSub.textContent = "Valgfritt tillegg. 25 kr per pilsett. Legges til per dato du booker.";
  setsWrap.appendChild(setsSub);

  /* ------------------------------------------------ */
  /* STATE */
  /* ------------------------------------------------ */

  var setsQty = 0;
  var setsCountByDate = {};
  var bookedDates = {};
  var syncLock = false;
  var CLUB_STATUS = {};

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
    try { localStorage.setItem("gk_dart_sets_qty_v30", String(setsQty)); } catch (e) {}
    try { localStorage.setItem("gk_dart_sets_count_by_date_v30", JSON.stringify(setsCountByDate)); } catch (e2) {}
    try { localStorage.setItem("gk_dart_booked_dates_v30", JSON.stringify(bookedDates)); } catch (e3) {}
  }

  function loadState() {
    setsQty = getInt("gk_dart_sets_qty_v30", 0);
    setsCountByDate = getJSON("gk_dart_sets_count_by_date_v30", {});
    bookedDates = getJSON("gk_dart_booked_dates_v30", {});
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
    syncSetsForBookedDates();
  };

  btnPlus.onclick = function () {
    if (setsQty >= 8) return;
    setsQty += 1;
    updateSetsUI();
    syncSetsForBookedDates();
  };

  /* ------------------------------------------------ */
  /* CART */
  /* ------------------------------------------------ */

  function gkBumpCartCount() {
    try {
      var selectors = [
        ".cart-count",
        ".cart-counter",
        ".cart-qty",
        ".cart-items",
        ".header-cart-count",
        ".js-cart-count",
        "[data-cart-count]",
        "[data-cart-qty]",
        "a[href*='/cart'] span",
        "a[href*='/cart/index'] span"
      ];

      var updated = false;

      for (var s = 0; s < selectors.length; s++) {
        var nodes = document.querySelectorAll(selectors[s]);

        for (var i = 0; i < nodes.length; i++) {
          var el = nodes[i];
          if (!el) continue;

          var txt = String(el.textContent || "").trim();

          if (/^\d+$/.test(txt)) {
            var n = parseInt(txt, 10);
            if (isNaN(n)) n = 0;
            el.textContent = String(n + 1);
            updated = true;
          }
        }
      }

      var cartLinks = document.querySelectorAll("a[href*='/cart'], a[href*='/cart/index']");
      for (var j = 0; j < cartLinks.length; j++) {
        var link = cartLinks[j];
        var smalls = link.querySelectorAll("span, b, em, strong, i");

        for (var k = 0; k < smalls.length; k++) {
          var child = smalls[k];
          var t = String(child.textContent || "").trim();

          if (/^\d+$/.test(t)) {
            var x = parseInt(t, 10);
            if (isNaN(x)) x = 0;
            child.textContent = String(x + 1);
            updated = true;
          }
        }
      }

      console.log("[DART BOOKING] cart count bumped:", updated);
    } catch (e) {
      console.log("[DART BOOKING] cart count bump error:", e);
    }
  }

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

    postAddForm(body).then(function () {
      gkBumpCartCount();
      cb(true);
    }).catch(function () {
      cb(false);
    });
  }

  function addProductToCart(productId, qty, cb) {
    if (!qty || qty <= 0) { cb(true); return; }

    var body =
      "product_id=" + encodeURIComponent(String(productId)) +
      "&qty=" + encodeURIComponent(String(qty)) +
      "&quantity=" + encodeURIComponent(String(qty)) +
      "&eventId=" + encodeURIComponent(String(EVENT_ID)) +
      "&page=product";

    postAddForm(body).then(function () {
      gkBumpCartCount();
      cb(true);
    }).catch(function () { cb(false); });
  }

  /* ------------------------------------------------ */
  /* HELPERS */
  /* ------------------------------------------------ */

  function parseDT(v) {
    var date = "";
    var time = "";

    if (v && v.values) {
      for (var i = 0; i < v.values.length; i++) {
        var it = v.values[i];
        var n = String(it.name || "").toLowerCase();
        var val = String(it.val || "").trim();

        if (!date && n.indexOf("dag") !== -1 && val) date = val;
        if (!time && n.indexOf("tid") !== -1 && val) time = val;
      }
    }

    var sku = String((v && v.sku) || "").trim();
    var m = sku.match(/^(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})-(\d{2})(\d{2})$/);

    if (m) {
      var skuDate = m[1];
      var skuTime = m[2] + ":" + m[3] + "-" + m[4] + ":" + m[5];

      if (!date) date = skuDate;
      if (!time) time = skuTime;
    }

    return { date: date, time: time };
  }

  function parsePrice(v, productObj) {
    var candidates = [
      v && v.price,
      v && v.special_price,
      v && v.sale_price,
      v && v.final_price,
      v && v.customer_price,
      v && v.regular_price,
      productObj && productObj.price
    ];

    for (var i = 0; i < candidates.length; i++) {
      var raw = candidates[i];
      if (raw === null || typeof raw === "undefined" || raw === "") continue;

      if (typeof raw === "number") return raw;

      var s = String(raw).replace(/\s/g, "").replace(",", ".");
      var m = s.match(/-?\d+(\.\d+)?/);
      if (m) {
        var num = parseFloat(m[0]);
        if (!isNaN(num)) return num;
      }
    }
    return null;
  }

  function formatPriceNOK(num) {
    if (num === null || typeof num === "undefined" || isNaN(num)) return "Pris kommer";
    var rounded = Math.round(Number(num) * 100) / 100;
    if (Math.abs(rounded - Math.round(rounded)) < 0.001) return Math.round(rounded) + " kr";
    return rounded.toFixed(2).replace(".", ",") + " kr";
  }

  function parseStartDateTime(date, time) {
    if (!date || !time) return null;

    var start = String(time).split("-")[0] || "";
    if (!start) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Date(date + "T" + start + ":00");
    }

    var dm = String(date).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (dm) {
      var dd = ("0" + parseInt(dm[1], 10)).slice(-2);
      var mm = ("0" + parseInt(dm[2], 10)).slice(-2);
      var yy = dm[3];
      return new Date(yy + "-" + mm + "-" + dd + "T" + start + ":00");
    }

    return null;
  }

  function buildCutoffDate(date, time) {
    var start = parseStartDateTime(date, time);
    if (!start || isNaN(start.getTime())) return null;
    var cutoff = new Date(start.getTime());
    cutoff.setMinutes(cutoff.getMinutes() - CUTOFF_MINUTES_BEFORE_START);
    return cutoff;
  }

  function slotState(date, time) {
    var now = new Date();
    var start = parseStartDateTime(date, time);
    if (!start || isNaN(start.getTime())) return { passed: false, closed: false };

    var cutoff = buildCutoffDate(date, time);
    if (!cutoff || isNaN(cutoff.getTime())) return { passed: false, closed: false };

    return {
      passed: start.getTime() < now.getTime(),
      closed: now.getTime() >= cutoff.getTime()
    };
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

  function idxOf(arr, v) {
    for (var i = 0; i < arr.length; i++) if (arr[i] === v) return i;
    return -1;
  }

  function bookedDateList() {
    var arr = [];
    for (var k in bookedDates) {
      if (bookedDates.hasOwnProperty(k) && bookedDates[k]) arr.push(k);
    }
    arr.sort();
    return arr;
  }

  function timeToMinutes(t) {
    var p = String(t || "").split(":");
    return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
  }

  function slotOverlaps(time, from, to) {
    var parts = String(time || "").split("-");
    if (parts.length !== 2) return false;

    var s1 = timeToMinutes(parts[0]);
    var e1 = timeToMinutes(parts[1]);
    var s2 = timeToMinutes(from);
    var e2 = timeToMinutes(to);

    return s1 < e2 && e1 > s2;
  }

  function timesOverlap(a, b) {
    var aa = String(a || "").split("-");
    var bb = String(b || "").split("-");
    if (aa.length !== 2 || bb.length !== 2) return false;

    var a1 = timeToMinutes(aa[0]);
    var a2 = timeToMinutes(aa[1]);
    var b1 = timeToMinutes(bb[0]);
    var b2 = timeToMinutes(bb[1]);

    return a1 < b2 && a2 > b1;
  }


  function isThursday(dateStr) {
    var d = new Date(dateStr + "T00:00:00");
    return d.getDay() === 4;
  }

  function mondayOfWeek(dateStr) {
    var d = new Date(dateStr + "T00:00:00");
    var day = d.getDay(); // 0=søn
    var diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function clubReleaseDate(dateStr) {
    var m = mondayOfWeek(dateStr);
    var rel = new Date(m.getTime());
    rel.setDate(m.getDate() + (CLUB_RELEASE_WEEKDAY - 1)); // tirsdag
    rel.setHours(CLUB_RELEASE_HOUR, CLUB_RELEASE_MINUTE, 0, 0);
    return rel;
  }

  function isAfterClubRelease(dateStr) {
    var rel = clubReleaseDate(dateStr);
    return new Date().getTime() >= rel.getTime();
  }

  function getCustomClosedLock(date, time) {
    for (var i = 0; i < CUSTOM_CLOSED_TIMES.length; i++) {
      var r = CUSTOM_CLOSED_TIMES[i];
      if (!r || r.date !== date) continue;
      if (slotOverlaps(time, r.from, r.to)) {
        return {
          active: true,
          text: r.label || "Stengt",
          reason: r.reason || r.label || "Manuelt stengt"
        };
      }
    }

    return null;
  }

  function getClubLockForDateTime(date, time) {
    if (!isThursday(date)) return null;
    if (!slotOverlaps(time, CLUB_TIME_FROM, CLUB_TIME_TO)) return null;

    var club = CLUB_STATUS[date] || null;
    var signedUp = club ? club.signedUp : 0;

    if (signedUp > 0) {
      return {
        active: true,
        text: "Reservert klubb",
        reason: "Klubbkveld er aktiv denne torsdagen."
      };
    }

    if (!isAfterClubRelease(date)) {
      return {
        active: true,
        text: "Reservert klubb",
        reason: "Klubb har prioritet frem til tirsdag 00:01 samme uke."
      };
    }

    return null;
  }

  function dateOnlyLocal(dateStr) {
    var d = new Date(dateStr + "T00:00:00");
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function formatLocalDate(d) {
    var y = d.getFullYear();
    var m = ("0" + (d.getMonth() + 1)).slice(-2);
    var day = ("0" + d.getDate()).slice(-2);
    return y + "-" + m + "-" + day;
  }

  function todayLocalDateString() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return formatLocalDate(d);
  }

  function addDaysLocal(dateStr, days) {
    var d = dateOnlyLocal(dateStr);
    d.setDate(d.getDate() + days);
    return formatLocalDate(d);
  }

  function isDateWithinRange(dateStr, startDateStr, daysAheadInclusive) {
    if (!dateStr || !startDateStr) return false;

    var d = dateOnlyLocal(dateStr);
    var start = dateOnlyLocal(startDateStr);
    var end = dateOnlyLocal(startDateStr);
    end.setDate(end.getDate() + daysAheadInclusive);

    return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
  }

  function isWithinNormalBookingRange(dateStr) {
    return isDateWithinRange(dateStr, todayLocalDateString(), NORMAL_BOOKING_DAYS_AHEAD);
  }

  function isWithinClubReadRange(dateStr) {
    return isDateWithinRange(dateStr, todayLocalDateString(), CLUB_WEEKS_AHEAD * 7);
  }

  function parseClubDateLabel(label) {
    var s = String(label || "");
    var m = s.match(/(\d{1,2})\.(\d{1,2})/);
    if (!m) return "";

    var dd = parseInt(m[1], 10);
    var mm = parseInt(m[2], 10);
    if (!dd || !mm) return "";

    var now = new Date();
    var year = now.getFullYear();

    var d = new Date(year, mm - 1, dd);
    d.setHours(0, 0, 0, 0);

    var today = new Date();
    today.setHours(0, 0, 0, 0);

    if (d.getTime() < today.getTime() - 183 * 24 * 60 * 60 * 1000) {
      d = new Date(year + 1, mm - 1, dd);
      d.setHours(0, 0, 0, 0);
    }

    var y = d.getFullYear();
    var mo = ("0" + (d.getMonth() + 1)).slice(-2);
    var da = ("0" + d.getDate()).slice(-2);
    return y + "-" + mo + "-" + da;
  }

  function buildClubStatus(product) {
    var out = {};
    var vars = product && product.variants ? product.variants : [];

    for (var i = 0; i < vars.length; i++) {
      var v = vars[i];
      var label = "";

      if (v.values && v.values.length) {
        for (var j = 0; j < v.values.length; j++) {
          var it = v.values[j];
          var n = String(it.name || "").toLowerCase();
          var val = String(it.val || "").trim();

          if (val && (n.indexOf("dato") !== -1 || n.indexOf("dag") !== -1)) {
            label = val;
            break;
          }
        }

        if (!label && v.values[0] && v.values[0].val) {
          label = String(v.values[0].val || "").trim();
        }
      }

      var date = parseClubDateLabel(label);
      if (!date) continue;

      // Ikke dra med gamle klubbkvelder, og ikke les mer enn 30 uker frem.
      if (!isWithinClubReadRange(date)) continue;

      var qty = parseInt(v.qty || "0", 10);
      if (isNaN(qty)) qty = 0;

      out[date] = {
        productId: PRODUCT_CLUB,
        variantId: String(v.id || ""),
        sku: String(v.sku || ""),
        label: label,
        remaining: qty,
        signedUp: Math.max(0, CLUB_CAPACITY - qty),
        capacity: CLUB_CAPACITY
      };
    }

    return out;
  }

  function applyClubVisibleSlots(map) {
    for (var date in CLUB_STATUS) {
      if (!CLUB_STATUS.hasOwnProperty(date)) continue;

      // På vanlig dartbooking viser vi bare dagens dato + 40 dager.
      if (!isWithinNormalBookingRange(date)) continue;

      var times = ["19:00-20:00", "20:00-21:00", "21:00-22:00"];

      for (var i = 0; i < times.length; i++) {
        var time = times[i];

        if (!map[date]) map[date] = {};
        if (!map[date][time]) map[date][time] = {};

        var clubLock = getClubLockForDateTime(date, time);
        var st = slotState(date, time);

        // Ikke lag virtuelle klubb-slots for tider som allerede er passert i dag.
        if (st && st.passed) continue;

        if (clubLock) {
          if (!map[date][time].A) {
            map[date][time].A = makeVirtualClubSlot(date, time, "A", clubLock);
          } else {
            map[date][time].A.clubLock = clubLock;
          }

          if (!map[date][time].B) {
            map[date][time].B = makeVirtualClubSlot(date, time, "B", clubLock);
          } else {
            map[date][time].B.clubLock = clubLock;
          }
        }
      }
    }

    return map;
  }

  function makeVirtualClubSlot(date, time, lane, lock) {
    return {
      product: "",
      variant: "",
      sku: "",
      date: date,
      time: time,
      qty: 0,
      soldOut: false,
      closed: true,
      price: null,
      lane: lane,
      isVirtual: true,
      clubLock: lock
    };
  }

  /* ------------------------------------------------ */
  /* PILSETT PER DATO */
  /* ------------------------------------------------ */

  function ensureSetsForDate(dateKey, cb) {
    if (!setsQty || setsQty <= 0) { cb(true); return; }
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

  function syncSetsForBookedDates() {
    if (syncLock) return;

    var dates = bookedDateList();
    if (!dates.length) return;

    syncLock = true;
    var idx = 0;

    function next() {
      if (idx >= dates.length) {
        syncLock = false;
        if (status) status.innerHTML = "";
        if (appStatus) appStatus.innerHTML = "";
        return;
      }

      var d = dates[idx++];
      if (status) status.innerHTML = "Synker pilsett for " + d + "…";
      if (appStatus) appStatus.innerHTML = "Synker pilsett for " + d + "…";

      ensureSetsForDate(d, function () {
        next();
      });
    }

    next();
  }

  /* ------------------------------------------------ */
  /* BUILD INDEX */
  /* ------------------------------------------------ */

  function buildIndex(variants, productId, laneName, productObj) {
    var map = {};

    for (var i = 0; i < variants.length; i++) {
      var v = variants[i];
      var qty = parseInt(v.qty || "0", 10);
      if (isNaN(qty)) qty = 0;

      var dt = parseDT(v);
      if (!dt.date || !dt.time) continue;

      // Vanlig dartbooking skal kun vise fra i dag og 40 dager frem.
      if (!isWithinNormalBookingRange(dt.date)) continue;

      var st = slotState(dt.date, dt.time);
      if (st.passed) continue;

      if (!map[dt.date]) map[dt.date] = {};
      if (!map[dt.date][dt.time]) map[dt.date][dt.time] = {};

      map[dt.date][dt.time][laneName] = {
        product: String(productId),
        variant: String(v.id || ""),
        sku: String(v.sku || ""),
        date: dt.date,
        time: dt.time,
        qty: qty,
        soldOut: qty <= 0,
        closed: !!st.closed,
        price: parsePrice(v, productObj),
        lane: laneName
      };
    }

    return map;
  }

  function buildVenueIndex(variants, productObj) {
    var map = {};

    for (var i = 0; i < variants.length; i++) {
      var v = variants[i];
      var qty = parseInt(v.qty || "0", 10);
      if (isNaN(qty)) qty = 0;

      var dt = parseDT(v);
      if (!dt.date || !dt.time) continue;

      // Vanlig dartbooking skal kun ta hensyn til dagens dato + 40 dager.
      if (!isWithinNormalBookingRange(dt.date)) continue;

      if (!map[dt.date]) map[dt.date] = {};
      map[dt.date][dt.time] = {
        product: PRODUCT_VENUE,
        variant: String(v.id || ""),
        sku: String(v.sku || ""),
        date: dt.date,
        time: dt.time,
        qty: qty,
        soldOut: qty <= 0,
        price: parsePrice(v, productObj)
      };
    }

    return map;
  }

  function getVenueLockForDateTime(date, time) {
    if (!VENUE_SLOTS || !VENUE_SLOTS[date]) return null;

    var venueTimes = keys(VENUE_SLOTS[date]);
    for (var i = 0; i < venueTimes.length; i++) {
      var vt = venueTimes[i];
      var slot = VENUE_SLOTS[date][vt];
      if (!slot || !slot.soldOut) continue;

      if (timesOverlap(time, slot.time)) {
        return {
          active: true,
          text: "Hele lokalet booket",
          reason: "Hele lokalet er booket i dette tidsrommet."
        };
      }
    }

    return null;
  }

  function merge(a, b) {
    var out = {};
    var d, t;

    for (d in a) {
      if (!a.hasOwnProperty(d)) continue;
      if (!out[d]) out[d] = {};
      for (t in a[d]) {
        if (!a[d].hasOwnProperty(t)) continue;
        if (!out[d][t]) out[d][t] = {};
        if (a[d][t].A) out[d][t].A = a[d][t].A;
      }
    }

    for (d in b) {
      if (!b.hasOwnProperty(d)) continue;
      if (!out[d]) out[d] = {};
      for (t in b[d]) {
        if (!b[d][t]) continue;
        if (!out[d][t]) out[d][t] = {};
        if (b[d][t].B) out[d][t].B = b[d][t].B;
      }
    }

    return out;
  }

  /* ------------------------------------------------ */
  /* UI / KALENDER */
  /* ------------------------------------------------ */

  var cal = document.createElement("div");
  cal.className = "gk-cal";
  daysEl.appendChild(cal);

  var calHead = document.createElement("div");
  calHead.className = "gk-cal-head";
  cal.appendChild(calHead);

  var headLeft = document.createElement("div");
  calHead.appendChild(headLeft);

  var calTitle = document.createElement("div");
  calTitle.className = "gk-cal-title";
  calTitle.textContent = "Velg dato";
  headLeft.appendChild(calTitle);

  var calSub = document.createElement("div");
  calSub.className = "gk-cal-sub";
  calSub.textContent = "Swipe på dagene for å se hele uka. Bruk knappene for å bytte uke.";
  headLeft.appendChild(calSub);

  var calNav = document.createElement("div");
  calNav.className = "gk-cal-nav";
  calHead.appendChild(calNav);

  var prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "gk-navbtn";
  prevBtn.textContent = "Forrige uke";
  calNav.appendChild(prevBtn);

  var nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "gk-navbtn";
  nextBtn.textContent = "Neste uke";
  calNav.appendChild(nextBtn);

  var chipsWrap = document.createElement("div");
  chipsWrap.className = "gk-chips-wrap";
  cal.appendChild(chipsWrap);

  var chips = document.createElement("div");
  chips.className = "gk-chips";
  chipsWrap.appendChild(chips);

  var grid = document.createElement("div");
  grid.className = "gk-grid";
  cal.appendChild(grid);

  var note = document.createElement("div");
  note.className = "gk-note";
  note.textContent = "Pris vises per bane. Tider mindre enn 20 minutter før start vises som stengt. Fullbookede tider vises som booket i rødt. Torsdag 19–22 er reservert for klubb frem til tirsdag samme uke.";
  cal.appendChild(note);

  /* ------------------------------------------------ */
  /* DATA / STATE FOR UI */
  /* ------------------------------------------------ */

  var ALL_SLOTS = null;
  var VENUE_SLOTS = {};
  var ALL_DATES = [];
  var ACTIVE_DATE = "";
  var WEEK_START = 0;
  var WEEK_SIZE = 7;

  function clampWeekStart(i) {
    if (i < 0) i = 0;
    if (i > Math.max(0, ALL_DATES.length - WEEK_SIZE)) i = Math.max(0, ALL_DATES.length - WEEK_SIZE);
    return i;
  }

  function scrollActiveChipIntoView() {
    try {
      var nodes = chips.children;
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (el && el.getAttribute && el.getAttribute("data-date") === ACTIVE_DATE) {
          if (el.scrollIntoView) {
            el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
          }
          break;
        }
      }
    } catch (e) {}
  }

  function setActiveDate(d) {
    ACTIVE_DATE = d;

    var kids = chips.children;
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i];
      if (!el || !el.getAttribute) continue;
      el.setAttribute("data-active", el.getAttribute("data-date") === d ? "1" : "0");
    }

    renderDay(d);
    scrollActiveChipIntoView();
  }

  function mkLaneCard(label, slot) {
    var card = document.createElement("div");
    card.className = "gk-lane-card";

    var top = document.createElement("div");
    top.className = "gk-lane-top";
    card.appendChild(top);

    var title = document.createElement("div");
    title.className = "gk-lane-title";
    title.textContent = label;
    top.appendChild(title);

    var meta = document.createElement("div");
    meta.className = "gk-lane-meta";
    top.appendChild(meta);

    var customLock = getCustomClosedLock(slot.date, slot.time);
    var clubLock = slot.clubLock || getClubLockForDateTime(slot.date, slot.time);
    var venueLock = getVenueLockForDateTime(slot.date, slot.time);

    var priceChip = document.createElement("div");
    priceChip.className = "gk-mini price";
    priceChip.textContent = formatPriceNOK(slot.price);
    meta.appendChild(priceChip);

    if (slot.soldOut) {
      var soldChip = document.createElement("div");
      soldChip.className = "gk-mini warn";
      soldChip.textContent = "Booket";
      meta.appendChild(soldChip);
    } else if (venueLock) {
      var vChip = document.createElement("div");
      vChip.className = "gk-mini stop";
      vChip.textContent = venueLock.text || "Hele lokalet booket";
      meta.appendChild(vChip);
    } else if (customLock) {
      var cChip = document.createElement("div");
      cChip.className = "gk-mini stop";
      cChip.textContent = customLock.text || "Stengt";
      meta.appendChild(cChip);
    } else if (clubLock) {
      var clubChip = document.createElement("div");
      clubChip.className = "gk-mini stop";
      clubChip.textContent = clubLock.text || "Reservert klubb";
      meta.appendChild(clubChip);
    } else if (slot.closed) {
      var stopChip = document.createElement("div");
      stopChip.className = "gk-mini stop";
      stopChip.textContent = "Stengt – mindre enn 20 min igjen";
      meta.appendChild(stopChip);
    } else {
      var liveChip = document.createElement("div");
      liveChip.className = "gk-mini ok";
      liveChip.textContent = "Ledig nå";
      meta.appendChild(liveChip);
    }

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gk-lbtn";
    btn.textContent = "Book tid";
    card.appendChild(btn);

    if (slot.soldOut) {
      btn.disabled = true;
      btn.textContent = "Booket";
      btn.className = "gk-lbtn gk-booked";
    } else if (venueLock) {
      btn.disabled = true;
      btn.textContent = venueLock.text || "Hele lokalet booket";
      btn.className = "gk-lbtn gk-stopped";
    } else if (customLock) {
      btn.disabled = true;
      btn.textContent = customLock.text || "Stengt";
      btn.className = "gk-lbtn gk-stopped";
    } else if (clubLock) {
      btn.disabled = true;
      btn.textContent = clubLock.text || "Reservert klubb";
      btn.className = "gk-lbtn gk-stopped";
    } else if (slot.closed || slot.isVirtual || !slot.product || !slot.variant) {
      btn.disabled = true;
      btn.textContent = "Stengt";
      btn.className = "gk-lbtn gk-stopped";
    }

    btn.onclick = function () {
      if (slot.closed || slot.soldOut || slot.isVirtual || !slot.product || !slot.variant) return;
      if (getVenueLockForDateTime(slot.date, slot.time)) return;
      if (getCustomClosedLock(slot.date, slot.time)) return;
      if (getClubLockForDateTime(slot.date, slot.time)) return;

      if (String(btn.getAttribute("data-gk-locked") || "0") === "1") {
        showGate();
        return;
      }

      btn.disabled = true;
      btn.textContent = "Legger til…";

      ensureSetsForDate(slot.date, function (okSets) {
        if (!okSets) {
          btn.disabled = false;
          btn.textContent = "Book tid (feil – prøv igjen)";
          return;
        }

        addVariantToCart(slot.product, slot.variant, function (okVar) {
          if (okVar) {
            gkStoreBookingDetails({
              source: "dart",
              title: "Dart booking",
              item: {
                type: "dart",
                label: slot.lane === "A" ? "Dart – Bane A" : "Dart – Bane B",
                lane: slot.lane || "",
                date: slot.date || "",
                time: slot.time || "",
                productId: String(slot.product || ""),
                variantId: String(slot.variant || ""),
                price: (slot.price !== null && typeof slot.price !== "undefined") ? String(slot.price) : ""
              },
              extras: {
                dartSets: setsQty || 0
              }
            });

            if (status) status.innerHTML = "";
            if (appStatus) appStatus.innerHTML = "";

            bookedDates[slot.date] = true;
            saveState();

            btn.className = "gk-lbtn gk-ok";
            btn.textContent = "Lagt i handlekurv ✓";
          } else {
            btn.disabled = false;
            btn.textContent = "Book tid (feil – prøv igjen)";
          }
        });
      });
    };

    return card;
  }

  function renderDay(dateStr) {
    grid.innerHTML = "";

    if (!ALL_SLOTS || !ALL_SLOTS[dateStr]) {
      var em = document.createElement("div");
      em.className = "gk-empty";
      em.textContent = "Ingen tider denne dagen.";
      grid.appendChild(em);
      calTitle.textContent = dateStr ? (dateStr + (isToday(dateStr) ? " (I dag)" : "")) : "Velg dato";
      return;
    }

    calTitle.textContent = dateStr + (isToday(dateStr) ? " (I dag)" : "");

    var times = keys(ALL_SLOTS[dateStr]);
    if (!times.length) {
      grid.innerHTML = "<div class='gk-empty'>Ingen tider denne dagen.</div>";
      return;
    }

    for (var ti = 0; ti < times.length; ti++) {
      var time = times[ti];
      var slotObj = ALL_SLOTS[dateStr][time];

      var row = document.createElement("div");
      row.className = "gk-row";

      var head = document.createElement("div");
      head.className = "gk-row-head";
      row.appendChild(head);

      var t = document.createElement("div");
      t.className = "gk-time";
      t.textContent = time;
      head.appendChild(t);

      var lanes = document.createElement("div");
      lanes.className = "gk-lanes";
      row.appendChild(lanes);

      if (slotObj.A) lanes.appendChild(mkLaneCard("Bane A", slotObj.A));
      if (slotObj.B) lanes.appendChild(mkLaneCard("Bane B", slotObj.B));

      grid.appendChild(row);
    }

    syncRulesButtonState();
  }

  function renderWeek() {
    chips.innerHTML = "";

    WEEK_START = clampWeekStart(WEEK_START);
    var slice = ALL_DATES.slice(WEEK_START, WEEK_START + WEEK_SIZE);

    if (!slice.length) {
      grid.innerHTML = "<div class='gk-empty'>Ingen tider akkurat nå.</div>";
      return;
    }

    for (var i = 0; i < slice.length; i++) {
      (function () {
        var d = slice[i];

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
        };

        chips.appendChild(chip);
      })();
    }

    if (idxOf(slice, ACTIVE_DATE) === -1) setActiveDate(slice[0]);
    else setActiveDate(ACTIVE_DATE);
  }

  prevBtn.onclick = function () {
    WEEK_START = clampWeekStart(WEEK_START - WEEK_SIZE);
    renderWeek();
  };

  nextBtn.onclick = function () {
    WEEK_START = clampWeekStart(WEEK_START + WEEK_SIZE);
    renderWeek();
  };

  /* ------------------------------------------------ */
  /* LOAD */
  /* ------------------------------------------------ */

  if (status) status.innerHTML = "Laster ledige tider…";
  appStatus.innerHTML = "Laster ledige tider…";

  Promise.all([
    fetch(API_A).then(function (r) { return r.json(); }),
    fetch(API_B).then(function (r) { return r.json(); }),
    fetch(API_CLUB).then(function (r) { return r.json(); }).catch(function () { return { product: null }; }),
    fetch(API_VENUE).then(function (r) { return r.json(); }).catch(function () { return { product: null }; })
  ]).then(function (res) {
    var a = res[0] && res[0].product ? res[0].product : null;
    var b = res[1] && res[1].product ? res[1].product : null;
    var club = res[2] && res[2].product ? res[2].product : null;
    var venue = res[3] && res[3].product ? res[3].product : null;

    CLUB_STATUS = buildClubStatus(club);

    var varsA = a && a.variants ? a.variants : [];
    var varsB = b && b.variants ? b.variants : [];
    var varsVenue = venue && venue.variants ? venue.variants : [];

    VENUE_SLOTS = buildVenueIndex(varsVenue, venue);

    var mapA = buildIndex(varsA, PRODUCT_A, "A", a);
    var mapB = buildIndex(varsB, PRODUCT_B, "B", b);

    ALL_SLOTS = merge(mapA, mapB);
    ALL_SLOTS = applyClubVisibleSlots(ALL_SLOTS);

    ALL_DATES = keys(ALL_SLOTS).filter(function (d) {
      return isWithinNormalBookingRange(d);
    });

    if (status) status.innerHTML = "";
    appStatus.innerHTML = "";

    if (!ALL_DATES.length) {
      grid.innerHTML = "<div class='gk-empty'>Ingen tider akkurat nå.</div>";
      return;
    }

    var todayPick = "";
    for (var j = 0; j < ALL_DATES.length; j++) {
      if (isToday(ALL_DATES[j])) {
        todayPick = ALL_DATES[j];
        break;
      }
    }

    ACTIVE_DATE = todayPick || ALL_DATES[0];

    var ai = idxOf(ALL_DATES, ACTIVE_DATE);
    if (ai < 0) ai = 0;
    WEEK_START = clampWeekStart(ai - (ai % WEEK_SIZE));

    console.log("[DART] Venue lock loaded", { venueDates: keys(VENUE_SLOTS).length, commitBase: "e55e5a2" });

    renderWeek();
    syncSetsForBookedDates();
  }).catch(function (e) {
    console.log("[DART] load error:", e);
    if (status) status.innerHTML = "Kunne ikke laste tider.";
    appStatus.innerHTML = "Kunne ikke laste tider.";
    grid.innerHTML = "<div class='gk-empty'>Kunne ikke laste tider.</div>";
  });

  /* ------------------------------------------------ */
  /* GK RULES GATE */
  /* ------------------------------------------------ */

  (function setupRulesGateGK() {
    var KEY = "gk_booking_rules_ok_daily_v1";
    var TERMS_URL = "https://golfkongen.no/sider/terms-and-conditions";

    function todayKey() {
      var d = new Date();
      var y = d.getFullYear();
      var m = ("0" + (d.getMonth() + 1)).slice(-2);
      var day = ("0" + d.getDate()).slice(-2);
      return y + "-" + m + "-" + day;
    }

    function readOK() {
      try {
        return localStorage.getItem(KEY) === todayKey();
      } catch (e) { return false; }
    }

    function writeOK() {
      try { localStorage.setItem(KEY, todayKey()); } catch (e) {}
    }

    function setButtonsEnabled(enabled) {
      try {
        var btns = document.querySelectorAll(".gk-lbtn");
        for (var i = 0; i < btns.length; i++) {
          var b = btns[i];
          var txt = String(b.textContent || "");

          if (txt.indexOf("Lagt i handlekurv") !== -1) continue;
          if (txt === "Stengt") continue;
          if (txt === "Booket") continue;
          if (txt.indexOf("Reservert") !== -1) continue;
          if (b.classList.contains("gk-stopped") || b.classList.contains("gk-booked")) continue;

          b.disabled = !enabled;
          b.setAttribute("data-gk-locked", enabled ? "0" : "1");

          if (!enabled) b.classList.add("gk-locked");
          else b.classList.remove("gk-locked");
        }
      } catch (e2) {}
    }

    function syncRulesButtonState() {
      setButtonsEnabled(readOK());
    }
    window.syncRulesButtonState = syncRulesButtonState;

    function injectRulesCSS() {
      if (document.getElementById("gk-rules-gate-css-gk1")) return;

      var css = ""
        + ".gk-rules-overlay{position:fixed;inset:0;background:radial-gradient(1200px 600px at 50% 20%, rgba(43,209,139,.12), rgba(0,0,0,0)), rgba(0,0,0,.66);z-index:99999;display:flex;align-items:flex-end;justify-content:center;padding:12px}"
        + "@media(min-width:900px){.gk-rules-overlay{align-items:center}}"
        + ".gk-rules-modal{width:100%;max-width:860px;border:1px solid rgba(255,255,255,.12);border-radius:20px;overflow:hidden;background:linear-gradient(180deg,#171717,#101010);box-shadow:0 28px 80px rgba(0,0,0,.60)}"
        + ".gk-rules-head{padding:14px 14px 10px;border-bottom:1px solid rgba(255,255,255,.10);display:flex;gap:12px;align-items:flex-start;justify-content:space-between}"
        + ".gk-rules-brand{display:flex;gap:10px;align-items:center}"
        + ".gk-rules-dot{width:12px;height:12px;border-radius:999px;background:linear-gradient(135deg, rgba(43,209,139,1), rgba(125,255,184,1));box-shadow:0 0 0 4px rgba(43,209,139,.12)}"
        + ".gk-rules-title b{display:block;font-size:15px;letter-spacing:.2px;color:rgba(255,255,255,.94)}"
        + ".gk-rules-title span{display:block;margin-top:5px;color:rgba(255,255,255,.70);font-size:12px;line-height:1.35}"
        + ".gk-rules-body{padding:12px 14px;color:rgba(255,255,255,.90);font-size:12.5px;line-height:1.48}"
        + ".gk-rules-grid{display:grid;grid-template-columns:1fr;gap:10px}"
        + "@media(min-width:860px){.gk-rules-grid{grid-template-columns:1fr 1fr}}"
        + ".gk-rules-card{border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.04);border-radius:16px;padding:12px}"
        + ".gk-rules-card h3{margin:0 0 8px;font-size:12.5px}"
        + ".gk-rules-card ul{margin:0;padding-left:18px}"
        + ".gk-rules-card li{margin:6px 0}"
        + ".gk-rules-footer{padding:12px 14px;border-top:1px solid rgba(255,255,255,.10);display:flex;gap:10px;flex-direction:column}"
        + "@media(min-width:700px){.gk-rules-footer{flex-direction:row;align-items:center;justify-content:space-between}}"
        + ".gk-rules-check{display:flex;gap:10px;align-items:flex-start}"
        + ".gk-rules-check input{margin-top:3px;transform:scale(1.15)}"
        + ".gk-rules-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}"
        + ".gk-rules-btn{padding:12px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:rgba(255,255,255,.92);font-weight:900;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:8px}"
        + ".gk-rules-btn:active{transform:scale(.99)}"
        + ".gk-rules-btn.ok{border-color:rgba(43,209,139,.55);background:linear-gradient(135deg, rgba(43,209,139,.18), rgba(125,255,184,.08))}"
        + ".gk-rules-btn.link{border-color:rgba(43,209,139,.22)}"
        + ".gk-rules-btn[disabled]{opacity:.55;cursor:not-allowed;transform:none}"
        + ".gk-x{border:none;background:transparent;color:rgba(255,255,255,.75);cursor:pointer;font-size:18px;line-height:1;padding:8px 10px;border-radius:12px}"
        + ".gk-x:hover{background:rgba(255,255,255,.06)}";

      var st = document.createElement("style");
      st.id = "gk-rules-gate-css-gk1";
      st.appendChild(document.createTextNode(css));
      document.head.appendChild(st);
    }

    function rulesHTML() {
      return ""
        + "<div class='gk-rules-grid'>"
        + "  <div class='gk-rules-card'>"
        + "    <h3>Booking, betaling og avbestilling</h3>"
        + "    <ul>"
        + "      <li>Booking skjer via GolfKongen.no og er personlig.</li>"
        + "      <li>Avbestilling senest <b>20 min</b> før start. Senere avbestilling/no-show gir normalt ingen refusjon.</li>"
        + "      <li>Booket tid skal overholdes. Overtid kan faktureres (avrundet til påbegynte timer).</li>"
        + "    </ul>"
        + "  </div>"
        + "  <div class='gk-rules-card'>"
        + "    <h3>Alder, oppførsel og sikkerhet</h3>"
        + "    <ul>"
        + "      <li><b>16 års</b> aldersgrense for å booke og bruke fasilitetene alene.</li>"
        + "      <li>Kun den som spiller skal være i spillområdet. Følg instrukser og skilting.</li>"
        + "      <li>Alkohol er ikke tillatt i lokalet.</li>"
        + "    </ul>"
        + "  </div>"
        + "  <div class='gk-rules-card'>"
        + "    <h3>Ansvar, skade og områder</h3>"
        + "    <ul>"
        + "      <li>Bruk skjer på eget ansvar. Booker er ansvarlig for skade/tyveri/hærverk – også for gjester.</li>"
        + "      <li>Tyveri og hærverk politianmeldes. Skade meldes umiddelbart.</li>"
        + "      <li>Forbudte områder for kunder: kjeller, kjøkken og musikkverksted.</li>"
        + "    </ul>"
        + "  </div>"
        + "  <div class='gk-rules-card'>"
        + "    <h3>Kamera og tekniske feil</h3>"
        + "    <ul>"
        + "      <li>Lokalet er kameraovervåket etter norsk lov (ikke toalett).</li>"
        + "      <li>Ved feil som hindrer bruk: ombooking eller refusjon for berørt tid.</li>"
        + "    </ul>"
        + "  </div>"
        + "</div>";
    }

    function showGate() {
      injectRulesCSS();

      var existing = document.querySelector(".gk-rules-overlay");
      if (existing) return;

      var overlay = document.createElement("div");
      overlay.className = "gk-rules-overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");

      var modal = document.createElement("div");
      modal.className = "gk-rules-modal";
      overlay.appendChild(modal);

      var head = document.createElement("div");
      head.className = "gk-rules-head";
      modal.appendChild(head);

      var brand = document.createElement("div");
      brand.className = "gk-rules-brand";
      head.appendChild(brand);

      var dot = document.createElement("div");
      dot.className = "gk-rules-dot";
      brand.appendChild(dot);

      var title = document.createElement("div");
      title.className = "gk-rules-title";
      brand.appendChild(title);

      var b = document.createElement("b");
      b.textContent = "Vilkår for booking og bruk (GolfKongen)";
      title.appendChild(b);

      var s = document.createElement("span");
      s.textContent = "Du må bekrefte vilkårene før du kan legge tider i handlekurven. Dette spør vi om én gang per dag.";
      title.appendChild(s);

      var x = document.createElement("button");
      x.type = "button";
      x.className = "gk-x";
      x.setAttribute("aria-label", "Lukk");
      x.textContent = "✕";
      head.appendChild(x);

      var body = document.createElement("div");
      body.className = "gk-rules-body";
      body.innerHTML = rulesHTML();
      modal.appendChild(body);

      var footer = document.createElement("div");
      footer.className = "gk-rules-footer";
      modal.appendChild(footer);

      var checkWrap = document.createElement("label");
      checkWrap.className = "gk-rules-check";
      footer.appendChild(checkWrap);

      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = false;
      checkWrap.appendChild(cb);

      var ct = document.createElement("div");
      ct.innerHTML = "Jeg har lest og aksepterer vilkårene.";
      checkWrap.appendChild(ct);

      var actions = document.createElement("div");
      actions.className = "gk-rules-actions";
      footer.appendChild(actions);

      var more = document.createElement("a");
      more.className = "gk-rules-btn link";
      more.href = TERMS_URL;
      more.target = "_blank";
      more.rel = "noopener";
      more.textContent = "Les mer";
      actions.appendChild(more);

      var ok = document.createElement("button");
      ok.type = "button";
      ok.className = "gk-rules-btn ok";
      ok.textContent = "Jeg godtar";
      ok.disabled = true;
      actions.appendChild(ok);

      cb.onchange = function () {
        ok.disabled = !cb.checked;
      };

      function closeOnly() {
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        setButtonsEnabled(false);
      }

      function accept() {
        writeOK();
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        setButtonsEnabled(true);
      }

      x.onclick = closeOnly;

      overlay.onclick = function (e) {
        if (e && e.target === overlay) closeOnly();
      };

      ok.onclick = accept;

      document.body.appendChild(overlay);
    }

    window.showGate = showGate;

    if (readOK()) {
      setButtonsEnabled(true);
    } else {
      setButtonsEnabled(false);

      var tries = 0;
      var t = setInterval(function () {
        setButtonsEnabled(false);
        tries++;
        if (document.querySelectorAll(".gk-lbtn").length > 0 || tries > 60) {
          clearInterval(t);
          showGate();
        }
      }, 250);
    }
  })();

})();
