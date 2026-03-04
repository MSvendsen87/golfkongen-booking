(function () {

  console.log("[DISC BOOKING v3] LOADED");

  // Produkt
  var PRODUCT_DISC = "1320";

  // Quickbutik eventId
  var EVENT_ID = "9847005";

  // Handlekurv-side (Quickbutik bruker ofte /cart/index)
  var CART_URL = "/cart/index";

  // API (samme worker som dart)
  var API_BASE = "https://cold-shadow-36dc.post-cd6.workers.dev/products/";
  var API_DISC = API_BASE + PRODUCT_DISC;

  // Path check
  var path = String(location.pathname || "");
  while (path.length && path.charAt(path.length - 1) === "/" && path !== "/") path = path.slice(0, -1);
  if (path !== "/sider/disc-booking") return;

  // Root (din HTML)
  var app = document.getElementById("disc-booking-app");
  if (!app) return;
  app.innerHTML = "";

  // -----------------------------
  // Styles (samme GK dark, enkel)
  // -----------------------------
  function injectCSS() {
    if (document.getElementById("gk-disc-css-v3")) return;

    var css = ""
      + ":root{--gk-bg:#111;--gk-card:#171717;--gk-card2:#1c1c1c;--gk-line:rgba(255,255,255,.10);--gk-text:rgba(255,255,255,.92);--gk-muted:rgba(255,255,255,.72);--gk-ac:#2bd18b;--gk-ac2:#7dffb8}"
      + "#disc-booking-app{color:var(--gk-text)}"
      + ".gk-b-top{position:sticky;top:0;z-index:8;background:linear-gradient(180deg, rgba(17,17,17,.92), rgba(17,17,17,.82));backdrop-filter:blur(10px);border:1px solid var(--gk-line);border-radius:16px;padding:12px;margin:10px 0 14px 0;box-shadow:0 10px 30px rgba(0,0,0,.25)}"
      + ".gk-top-row1{display:flex;gap:10px;align-items:flex-start;justify-content:space-between}"
      + ".gk-top-title{display:flex;flex-direction:column;gap:4px}"
      + ".gk-top-title b{font-size:14px;letter-spacing:.2px}"
      + ".gk-top-title span{font-size:12px;color:var(--gk-muted);line-height:1.25}"
      + ".gk-cartbtn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 14px;border-radius:14px;border:1px solid rgba(43,209,139,.55);background:linear-gradient(135deg, rgba(43,209,139,.18), rgba(125,255,184,.08));color:var(--gk-text);text-decoration:none;font-weight:900;white-space:nowrap;min-width:170px}"
      + ".gk-cartbtn:active{transform:scale(.99)}"
      + ".gk-status{padding:8px 2px;color:var(--gk-muted);font-size:12px}"
      + ".gk-cal{border:1px solid var(--gk-line);border-radius:16px;overflow:hidden;background:linear-gradient(180deg, var(--gk-card), var(--gk-card2));box-shadow:0 10px 30px rgba(0,0,0,.18)}"
      + ".gk-cal-head{padding:12px;border-bottom:1px solid var(--gk-line);display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}"
      + ".gk-cal-title{font-weight:900;font-size:16px}"
      + ".gk-cal-nav{display:flex;gap:8px;align-items:center}"
      + ".gk-navbtn{padding:10px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:var(--gk-text);cursor:pointer;font-weight:900}"
      + ".gk-navbtn:active{transform:scale(.99)}"
      + ".gk-chips{display:flex;gap:10px;overflow-x:auto;overflow-y:hidden;padding:12px;border-bottom:1px solid var(--gk-line);scrollbar-width:none;-webkit-overflow-scrolling:touch;touch-action:pan-x}"
      + ".gk-chips::-webkit-scrollbar{display:none}"
      + ".gk-chip{flex:0 0 auto;min-width:86px;padding:10px 12px;border-radius:16px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);cursor:pointer;color:var(--gk-text);text-align:left}"
      + ".gk-chip[data-active='1']{border-color:rgba(43,209,139,.75);background:linear-gradient(135deg, rgba(43,209,139,.18), rgba(125,255,184,.08))}"
      + ".gk-chip-top{font-weight:900;font-size:13px;line-height:1.05}"
      + ".gk-chip-sub{font-size:11px;color:var(--gk-muted);margin-top:4px}"
      + ".gk-grid{padding:12px;display:flex;flex-direction:column;gap:10px}"
      + ".gk-row{display:grid;grid-template-columns:92px 1fr;gap:10px;align-items:stretch}"
      + ".gk-time{display:flex;align-items:center;justify-content:flex-start;font-weight:900;opacity:.95}"
      + ".gk-lbtn{width:100%;padding:14px 12px;border-radius:16px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:var(--gk-text);cursor:pointer;font-weight:900}"
      + ".gk-lbtn:hover{border-color:rgba(43,209,139,.55)}"
      + ".gk-lbtn:active{transform:scale(.99)}"
      + ".gk-lbtn[disabled]{opacity:.65;cursor:not-allowed}"
      + ".gk-lbtn.gk-ok{border-color:rgba(43,209,139,.75);background:linear-gradient(135deg, rgba(43,209,139,.18), rgba(125,255,184,.08))}"
      + ".gk-note{padding:12px;color:var(--gk-muted);font-size:12px;line-height:1.35}"
      + ".gk-empty{padding:16px 12px;color:var(--gk-muted)}"
      + "@media (min-width:900px){.gk-row{grid-template-columns:130px 1fr}.gk-cal-title{font-size:18px}}";

    var style = document.createElement("style");
    style.id = "gk-disc-css-v3";
    style.type = "text/css";
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }
  injectCSS();

  // -----------------------------
  // UI
  // -----------------------------
  var status = document.createElement("div");
  status.className = "gk-status";
  app.appendChild(status);

  var topbar = document.createElement("div");
  topbar.className = "gk-b-top";
  app.appendChild(topbar);

  var row1 = document.createElement("div");
  row1.className = "gk-top-row1";
  topbar.appendChild(row1);

  var titleBox = document.createElement("div");
  titleBox.className = "gk-top-title";
  row1.appendChild(titleBox);

  var titleB = document.createElement("b");
  titleB.textContent = "Disc Simulator booking";
  titleBox.appendChild(titleB);

  var titleS = document.createElement("span");
  titleS.textContent = "Viser kun tider som finnes i beholdning. Fortid filtreres bort. Du kan legge flere tider i handlekurven.";
  titleBox.appendChild(titleS);

  var cartBtn = document.createElement("a");
  cartBtn.className = "gk-cartbtn";
  cartBtn.href = CART_URL;
  cartBtn.textContent = "Gå til handlekurv";
  row1.appendChild(cartBtn);

  var cal = document.createElement("div");
  cal.className = "gk-cal";
  app.appendChild(cal);

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
  prevBtn.textContent = "Forrige uke";
  calNav.appendChild(prevBtn);

  var nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "gk-navbtn";
  nextBtn.textContent = "Neste uke";
  calNav.appendChild(nextBtn);

  var chips = document.createElement("div");
  chips.className = "gk-chips";
  cal.appendChild(chips);

  var grid = document.createElement("div");
  grid.className = "gk-grid";
  cal.appendChild(grid);

  var note = document.createElement("div");
  note.className = "gk-note";
  note.textContent = "Tips: Swipe på dagene for å se hele uka. Bruk knappene for å bytte uke.";
  cal.appendChild(note);

  // -----------------------------
  // Cart helpers (POST /cart/add, ikke navigasjon)
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

  // -----------------------------
  // Variant parsing (Dag/Tid fra values – IDENTISK dart)
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

  function buildIndex(variants, productId) {
    var map = {};
    for (var i = 0; i < variants.length; i++) {
      var v = variants[i];
      var qty = parseInt(v.qty || "0", 10);
      if (isNaN(qty) || qty <= 0) continue;

      var dt = parseDT(v);
      if (!dt.date || !dt.time) continue;
      if (slotPassed(dt.date, dt.time)) continue;

      if (!map[dt.date]) map[dt.date] = {};
      map[dt.date][dt.time] = {
        product: String(productId),
        variant: String(v.id || ""),
        date: dt.date,
        time: dt.time
      };
    }
    return map;
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
  // Render
  // -----------------------------
  var ALL_SLOTS = null;
  var ALL_DATES = [];
  var ACTIVE_DATE = "";
  var WEEK_START = 0;
  var WEEK_SIZE = 7;

  function idxOf(arr, v) {
    for (var i = 0; i < arr.length; i++) if (arr[i] === v) return i;
    return -1;
  }

  function clampWeekStart(i) {
    if (i < 0) i = 0;
    if (i > Math.max(0, ALL_DATES.length - WEEK_SIZE)) i = Math.max(0, ALL_DATES.length - WEEK_SIZE);
    return i;
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
  }

  function renderDay(dateStr) {
    grid.innerHTML = "";

    if (!ALL_SLOTS || !ALL_SLOTS[dateStr]) {
      grid.innerHTML = "<div class='gk-empty'>Ingen ledige tider denne dagen.</div>";
      calTitle.textContent = dateStr ? (dateStr + (isToday(dateStr) ? " (I dag)" : "")) : "Velg dato";
      return;
    }

    calTitle.textContent = dateStr + (isToday(dateStr) ? " (I dag)" : "");

    var times = keys(ALL_SLOTS[dateStr]);
    for (var ti = 0; ti < times.length; ti++) {
      var time = times[ti];
      var slot = ALL_SLOTS[dateStr][time];

      var row = document.createElement("div");
      row.className = "gk-row";

      var t = document.createElement("div");
      t.className = "gk-time";
      t.textContent = time;
      row.appendChild(t);

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "gk-lbtn";
      btn.textContent = "Legg i handlekurv";

      btn.onclick = (function (s, b) {
        return function () {
          b.disabled = true;
          b.textContent = "Legger til…";

          addVariantToCart(s.product, s.variant, function (ok) {
            if (ok) {
              status.innerHTML = "";
              b.className = "gk-lbtn gk-ok";
              b.textContent = "Lagt i handlekurv ✓";
            } else {
              b.disabled = false;
              b.textContent = "Feil – prøv igjen";
            }
          });
        };
      })(slot, btn);

      row.appendChild(btn);
      grid.appendChild(row);
    }
  }

  function renderWeek() {
    chips.innerHTML = "";

    WEEK_START = clampWeekStart(WEEK_START);
    var slice = ALL_DATES.slice(WEEK_START, WEEK_START + WEEK_SIZE);

    if (!slice.length) {
      grid.innerHTML = "<div class='gk-empty'>Ingen ledige tider akkurat nå.</div>";
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

        chip.onclick = function () { setActiveDate(d); };
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

  // -----------------------------
  // Load
  // -----------------------------
  status.innerHTML = "Laster ledige tider…";

  fetch(API_DISC).then(function (r) { return r.json(); }).then(function (res) {
    var p = res && res.product ? res.product : null;
    var vars = p && p.variants ? p.variants : [];

    ALL_SLOTS = buildIndex(vars, PRODUCT_DISC);
    ALL_DATES = keys(ALL_SLOTS);

    console.log("[DISC] dates from variants:", ALL_DATES);

    status.innerHTML = "";

    if (!ALL_DATES.length) {
      grid.innerHTML = "<div class='gk-empty'>Ingen ledige tider akkurat nå.</div>";
      return;
    }

    var todayPick = "";
    for (var j = 0; j < ALL_DATES.length; j++) {
      if (isToday(ALL_DATES[j])) { todayPick = ALL_DATES[j]; break; }
    }
    ACTIVE_DATE = todayPick || ALL_DATES[0];

    var ai = idxOf(ALL_DATES, ACTIVE_DATE);
    if (ai < 0) ai = 0;
    WEEK_START = clampWeekStart(ai - (ai % WEEK_SIZE));

    renderWeek();

  }).catch(function (e) {
    console.log("[DISC] load error:", e);
    status.innerHTML = "Kunne ikke laste tider (se console).";
    grid.innerHTML = "<div class='gk-empty'>Kunne ikke laste tider.</div>";
  });

})();
