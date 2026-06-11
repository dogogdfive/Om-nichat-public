(function () {
  var root = document.documentElement;

  function applyLandingScale() {
    try {
      var cs = getComputedStyle(root);
      var dw = parseFloat(cs.getPropertyValue("--landing-design-width")) || 1920;
      var dh = parseFloat(cs.getPropertyValue("--landing-design-height")) || 1080;
      var vw = window.innerWidth || document.documentElement.clientWidth || dw;
      var vh = window.innerHeight || document.documentElement.clientHeight || dh;
      var scale = Math.min(vw / dw, vh / dh);
      if (!isFinite(scale) || scale <= 0) scale = 1;
      root.style.setProperty("--landing-scale", String(scale));
      root.style.setProperty("--landing-scaled-width", dw * scale + "px");
      root.style.setProperty("--landing-scaled-height", dh * scale + "px");
    } catch (e) {}
  }

  applyLandingScale();
  window.addEventListener("resize", applyLandingScale);
  window.addEventListener("orientationchange", applyLandingScale);
})();
