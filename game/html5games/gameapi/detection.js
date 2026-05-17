(function (global) {
  "use strict";
  var ua = navigator.userAgent || "";
  var isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  var isTablet = /iPad|Tablet/i.test(ua) || (isMobile && Math.min(screen.width, screen.height) > 600);
  global.detection = {
    is: {
      touch: "ontouchstart" in global || navigator.maxTouchPoints > 0,
      pc: !isMobile && !isTablet,
      tablet: isTablet,
      mobile: isMobile && !isTablet
    }
  };
})(window);
