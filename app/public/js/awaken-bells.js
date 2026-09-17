/* ============================================================
 * Awaken Audio — the Frequency Frenzy curve
 *
 * The board is nine clickable answer zones. It was nine flat blocks,
 * which reads as a bar chart when the thing being taught is an
 * equaliser.
 *
 * ONE CURVE, NOT NINE BELLS. At rest it is a near-flat line with a
 * gentle scallop over each band - an EQ sitting at unity, with the nine
 * positions still legible. Point at a band and the line bends up into a
 * bell there, in that band's colour. Nine permanent bells implied nine
 * permanent boosts, which is not what the drill is doing.
 *
 * Why not flat-with-nothing at rest: hover does not exist on a phone.
 * A dead flat line would leave a touch visitor an empty box with no
 * sign the board is divided at all. The scallop is what keeps it
 * discoverable without lying.
 *
 * RETRO comes from two things, both switchable on #sprintSpec:
 *   data-steps="on|off"  quantise the curve into columns, the way a
 *                        1980s rack analyser drew one. Smooth splines
 *                        are what make a display read as a plugin.
 *   data-glow="on|off"   phosphor bloom around the stroke, like a
 *                        vector monitor.
 *   data-scan="on|off"   CRT scanlines across the board.
 *   data-bells="heat|spectrum"   colour ramp.
 *
 * THE CURVE NEVER SHOWS THE LIVE EQ. Drawing the real boost would hand
 * over the answer. It shows what you are POINTING at, and afterwards
 * what the answer WAS - never what is playing.
 *
 * PURELY ADDITIVE: the zones keep their geometry, handlers and hit
 * areas; hover listeners are added rather than replaced; answer state is
 * mirrored out with a MutationObserver rather than by editing the game.
 * Wrapped in try/catch - if this throws, the cabinet still plays.
 * Remove by deleting the script tag; ?bells=off for one visit.
 * ============================================================ */
(function (global) {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var H = 210, BASE = H - 8, PEAK = H * 0.60, COLS = 84;
  /* How tall the resting scallop sits. On a device that can hover, it only
     has to hint that the board is divided - the hover bell does the real
     explaining. On a touch device there IS no hover, so the resting state
     is everything a volunteer gets until they tap, and it has to carry the
     whole job of showing nine bands. */
  function restHeight() {
    try {
      if (global.matchMedia && global.matchMedia("(hover: none)").matches) return 20;
    } catch (e) {}
    return 8;
  }
  var REST = restHeight();

  function offSwitch() {
    try { return /[?&]bells=off\b/.test(global.location.search || ""); }
    catch (e) { return false; }
  }
  function opt(strip, name, dflt) {
    var v = strip.dataset[name];
    return v === undefined ? dflt : v;
  }
  function hue(i, n, ramp) {
    var t = n > 1 ? i / (n - 1) : 0;
    return ramp === "spectrum" ? 8 + t * 262 : 12 - t * 121;
  }

  function wire(strip) {
    if (strip.__curve) return;
    strip.__curve = true;

    var zones = Array.prototype.slice.call(strip.querySelectorAll(".fzone"));
    if (zones.length < 2) return;

    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "fbells");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("preserveAspectRatio", "none");
    var fill = document.createElementNS(NS, "path");
    fill.setAttribute("class", "cfill");
    var line = document.createElementNS(NS, "path");
    line.setAttribute("class", "cline");
    line.setAttribute("fill", "none");
    line.setAttribute("vector-effect", "non-scaling-stroke");
    svg.appendChild(fill); svg.appendChild(line);
    strip.insertBefore(svg, strip.firstChild);

    var W = 1000, centres = [], halves = [], measured = false;
    function measure() {
      /* This runs first while the cabinet is still hidden, where every
         zone reports offsetLeft 0 and width 0 - which drew the whole
         scallop stacked at x=0. Refuse to measure a board that has no
         width yet, and let the ResizeObserver below come back to it. */
      var w = strip.clientWidth;
      if (!w || !zones[zones.length - 1].offsetWidth) return false;
      REST = restHeight();
      W = w;
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      centres = zones.map(function (z) { return z.offsetLeft + z.offsetWidth / 2; });
      halves  = zones.map(function (z) { return Math.max(18, z.offsetWidth / 2); });
      measured = true;
      return true;
    }
    measure();

    /* what the curve is currently saying */
    var active = -1, mode = "", amp = 0, shown = 0, raf = null;

    function y(x) {
      /* the resting scallop: every band, always, but barely */
      var v = 0, i, s;
      for (i = 0; i < centres.length; i++) {
        s = halves[i] * 0.66;
        v += REST * Math.exp(-((x - centres[i]) * (x - centres[i])) / (2 * s * s));
      }
      if (active >= 0 && shown > 0.001) {
        s = halves[active] * 0.62;
        v += PEAK * shown *
             Math.exp(-((x - centres[active]) * (x - centres[active])) / (2 * s * s));
      }
      return BASE - v;
    }

    function draw() {
      if (!measured && !measure()) return;
      var stepped = opt(strip, "steps", "on") !== "off";
      var d = "", i, x, yy, w = W / COLS;
      if (stepped) {
        /* one flat-topped column per slot: a segmented display, not a spline */
        for (i = 0; i <= COLS; i++) {
          x = i * w;
          yy = y(x + w / 2);
          d += (i === 0 ? "M" + x.toFixed(1) + "," + yy.toFixed(1)
                        : "L" + x.toFixed(1) + "," + yy.toFixed(1));
          d += "L" + Math.min(W, x + w).toFixed(1) + "," + yy.toFixed(1);
        }
      } else {
        for (i = 0; i <= COLS; i++) {
          x = (i * W) / COLS;
          d += (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y(x).toFixed(1);
        }
      }
      line.setAttribute("d", d);
      fill.setAttribute("d", d + "L" + W + "," + BASE + "L0," + BASE + " Z");
    }

    function paint() {
      var ramp = opt(strip, "bells", "heat");
      var col = mode === "correct" ? "#3ECF8E"
              : mode === "wrong"   ? "#E5484D"
              : active >= 0 ? "hsl(" + hue(active, zones.length, ramp).toFixed(1) + ",92%,62%)"
              : "hsl(12,92%,58%)";
      line.setAttribute("stroke", col);
      fill.setAttribute("fill", col);
      svg.style.setProperty("--cglow", col);
    }

    /* the bend is animated rather than snapped: a filter sweeping in
       reads as a machine responding, which a hard cut does not */
    function run() {
      var target = active >= 0 ? amp : 0;
      shown += (target - shown) * 0.22;
      if (Math.abs(target - shown) < 0.002) { shown = target; draw(); raf = null; return; }
      draw();
      raf = global.requestAnimationFrame(run);
    }
    function nudge() { if (!raf) raf = global.requestAnimationFrame(run); }

    function set(i, m, a) {
      active = i; mode = m || ""; amp = a === undefined ? 1 : a;
      paint(); nudge();
    }

    zones.forEach(function (z, i) {
      z.addEventListener("mouseenter", function () { if (!locked()) set(i, "", 1); });
      z.addEventListener("focus",      function () { if (!locked()) set(i, "", 1); });
      z.addEventListener("mouseleave", function () { if (!locked() && active === i) set(-1); });
      z.addEventListener("blur",       function () { if (!locked() && active === i) set(-1); });
    });
    function locked() { return mode === "correct" || mode === "wrong"; }

    /* the game writes correct / wrong onto a zone; follow it, hold the
       reveal, and let go when the classes clear for the next round */
    var obs = new MutationObserver(function (recs) {
      recs.forEach(function (r) {
        var i = zones.indexOf(r.target);
        if (i < 0) return;
        if (r.target.classList.contains("correct")) return set(i, "correct", 1);
        if (r.target.classList.contains("wrong"))   return set(i, "wrong", 1);
        if (locked() && active === i) set(-1);
      });
    });
    zones.forEach(function (z) {
      obs.observe(z, { attributes: true, attributeFilter: ["class"] });
    });

    var t = null;
    global.addEventListener("resize", function () {
      clearTimeout(t);
      t = setTimeout(function () { if (measure()) draw(); }, 150);
    });
    /* the board is laid out the moment the cabinet is opened, long after
       this file runs - that is the event worth listening for */
    if (global.ResizeObserver) {
      new ResizeObserver(function () {
        if (measure()) draw();
      }).observe(strip);
    }

    paint(); draw();
    strip.__redraw = function () { measure(); paint(); draw(); };
  }

  function init() {
    if (offSwitch()) return;
    var strip = document.getElementById("sprintSpec");
    if (!strip) return;
    if (!strip.querySelector(".fzone")) return setTimeout(init, 150);
    try { wire(strip); } catch (e) { /* the cabinet still plays */ }
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();

  global.AwakenBells = {
    init: init,
    rebuild: function () {
      var s = document.getElementById("sprintSpec");
      if (s && s.__redraw) s.__redraw();
    }
  };
})(window);
