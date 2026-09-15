/* ============================================================
 * Awaken Audio — EQ bells under the Frequency Frenzy board
 *
 * The board is nine clickable answer zones. It was nine flat
 * rectangles, which is honest but reads as a bar chart rather than as
 * an equaliser. This draws a bell over each zone so the board looks
 * like the thing it is teaching.
 *
 * PURELY ADDITIVE. It does not touch the game: the zones keep their
 * geometry, their handlers and their hit areas, and the bells are an
 * SVG overlay with pointer-events:none. State is mirrored out of the
 * zones with a MutationObserver rather than by editing answer() - so
 * if anything here throws, the cabinet still plays exactly as it does
 * today. Geometry is read from the live buttons, so it needs to know
 * nothing about BANDS, EDGES or the frequency maths.
 *
 * IMPORTANT: the bells never show the live EQ. Drawing the actual
 * boost would hand over the answer. They are a resting decoration, a
 * hover preview, and an after-the-fact reveal - never a readout.
 *
 * TO REMOVE: delete the <script src="/js/awaken-bells.js"> tag. The
 * board returns to flat zones. ?bells=off does it for one visit.
 * ============================================================ */
(function (global) {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var H  = 210;                       /* matches .fstrip height */

  function off() {
    try { return /[?&]bells=off\b/.test(global.location.search || ""); }
    catch (e) { return false; }
  }

  /* Two ramps. "heat" keeps the site's own accents - red through
     magenta to violet, no green or cyan, which is what stops it
     reading as a stock plugin. "spectrum" is the familiar EQ rainbow. */
  function hue(i, n, ramp) {
    var t = n > 1 ? i / (n - 1) : 0;
    if (ramp === "spectrum") return 8 + t * 262;         /* red -> violet the long way */
    return 12 - t * 121;                                 /* red -> magenta -> violet */
  }

  function bell(cx, halfW, peak, w) {
    /* a gaussian, sampled - smoother than a quadratic and it decays to
       the baseline instead of stopping dead at the band edge */
    var sigma = halfW * 0.62, pts = [], x, y;
    for (var k = 0; k <= 48; k++) {
      x = cx - halfW * 2.6 + (halfW * 5.2 * k) / 48;
      y = H - 6 - peak * Math.exp(-((x - cx) * (x - cx)) / (2 * sigma * sigma));
      pts.push((Math.max(-40, Math.min(w + 40, x))).toFixed(1) + "," + y.toFixed(1));
    }
    return pts;
  }

  function build(strip) {
    var zones = Array.prototype.slice.call(strip.querySelectorAll(".fzone"));
    if (zones.length < 2) return null;

    var w = strip.clientWidth || 1000;
    var svg = strip.querySelector(".fbells");
    if (!svg) {
      svg = document.createElementNS(NS, "svg");
      svg.setAttribute("class", "fbells");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("preserveAspectRatio", "none");
      strip.insertBefore(svg, strip.firstChild);
    }
    svg.setAttribute("viewBox", "0 0 " + w + " " + H);
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var ramp = strip.dataset.bells || "heat";
    var defs = document.createElementNS(NS, "defs");
    svg.appendChild(defs);

    zones.forEach(function (z, i) {
      var cx = z.offsetLeft + z.offsetWidth / 2;
      var hw = z.offsetWidth / 2;
      var h  = hue(i, zones.length, ramp);
      var col = "hsl(" + h.toFixed(1) + ",92%,62%)";

      var g = document.createElementNS(NS, "linearGradient");
      g.setAttribute("id", "bellg" + i);
      g.setAttribute("x1", "0"); g.setAttribute("y1", "0");
      g.setAttribute("x2", "0"); g.setAttribute("y2", "1");
      g.innerHTML =
        '<stop offset="0" stop-color="' + col + '" stop-opacity=".78"/>' +
        '<stop offset=".55" stop-color="' + col + '" stop-opacity=".22"/>' +
        '<stop offset="1" stop-color="' + col + '" stop-opacity="0"/>';
      defs.appendChild(g);

      var pts = bell(cx, hw, H * 0.62, w);
      var fill = document.createElementNS(NS, "path");
      fill.setAttribute("class", "bfill");
      fill.setAttribute("d", "M" + pts[0].split(",")[0] + "," + (H - 6) +
                             " L" + pts.join(" L") +
                             " L" + pts[pts.length - 1].split(",")[0] + "," + (H - 6) + " Z");
      fill.setAttribute("fill", "url(#bellg" + i + ")");

      var line = document.createElementNS(NS, "polyline");
      line.setAttribute("class", "bline");
      line.setAttribute("points", pts.join(" "));
      line.setAttribute("fill", "none");
      line.setAttribute("stroke", col);
      line.setAttribute("vector-effect", "non-scaling-stroke");

      var node = document.createElementNS(NS, "circle");
      node.setAttribute("class", "bnode");
      node.setAttribute("cx", cx); node.setAttribute("cy", H - 6 - H * 0.62);
      node.setAttribute("r", 3.2); node.setAttribute("fill", col);

      var grp = document.createElementNS(NS, "g");
      grp.setAttribute("class", "bell");
      grp.dataset.i = i;
      grp.appendChild(fill); grp.appendChild(line); grp.appendChild(node);
      svg.appendChild(grp);
    });
    return svg;
  }

  function wire(strip) {
    if (strip.__bells) return;
    strip.__bells = true;
    var svg = build(strip);
    if (!svg) return;

    var zones = Array.prototype.slice.call(strip.querySelectorAll(".fzone"));
    function bells() { return strip.querySelectorAll(".bell"); }
    function at(i) { return strip.querySelector('.bell[data-i="' + i + '"]'); }

    /* hover and focus are added, never replaced - the game's own
       handlers on these buttons keep running untouched */
    zones.forEach(function (z, i) {
      z.addEventListener("mouseenter", function () { mark(i, "hot", true); });
      z.addEventListener("mouseleave", function () { mark(i, "hot", false); });
      z.addEventListener("focus",      function () { mark(i, "hot", true); });
      z.addEventListener("blur",       function () { mark(i, "hot", false); });
    });
    function mark(i, cls, on) {
      var b = at(i); if (b) b.classList.toggle(cls, !!on);
    }

    /* the game writes correct/wrong/elim/off onto the zones; mirror them */
    var STATES = ["correct", "wrong", "elim", "off", "armed"];
    var obs = new MutationObserver(function (recs) {
      recs.forEach(function (r) {
        var i = zones.indexOf(r.target);
        if (i < 0) return;
        var b = at(i); if (!b) return;
        STATES.forEach(function (c) { b.classList.toggle(c, r.target.classList.contains(c)); });
      });
    });
    zones.forEach(function (z) { obs.observe(z, { attributes: true, attributeFilter: ["class"] }); });

    var t = null;
    global.addEventListener("resize", function () {
      clearTimeout(t);
      t = setTimeout(function () { build(strip); wireRedraw(strip, zones); }, 160);
    });
  }

  /* a rebuild throws the nodes away, so the mirrored state goes back on */
  function wireRedraw(strip, zones) {
    zones.forEach(function (z, i) {
      var b = strip.querySelector('.bell[data-i="' + i + '"]');
      if (!b) return;
      ["correct", "wrong", "elim", "off", "armed"].forEach(function (c) {
        b.classList.toggle(c, z.classList.contains(c));
      });
    });
  }

  function init() {
    if (off()) return;
    var strip = document.getElementById("sprintSpec");
    if (!strip) return;
    /* the zones are built by the arcade's own script; wait for them */
    if (!strip.querySelector(".fzone")) return setTimeout(init, 150);
    try { wire(strip); } catch (e) { /* the cabinet still plays */ }
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();

  global.AwakenBells = { init: init, rebuild: function () {
    var s = document.getElementById("sprintSpec");
    if (s) { build(s); }
  } };
})(window);
