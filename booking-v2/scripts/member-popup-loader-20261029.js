(function () {
  var path = String(location.pathname || "").replace(/\/$/, "");
  if (path !== "/customer/index") return;
  var s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/gh/MSvendsen87/gk-member-popup.js@93c926e23bb89767d3fd1fa6a98dae5a92ef4965/gk-member-popup.js?v=" + Date.now();
  s.defer = true;
  document.head.appendChild(s);
})();
