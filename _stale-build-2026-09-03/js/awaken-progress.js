/* ============================================================
 * Awaken Audio — the bridge between the training modules and the
 * progress layer.
 *
 * The modules do not import this and do not know it exists. It
 * observes what they already do to the DOM, and receives one
 * explicit call at the end of an arcade run. Nothing in here can
 * change how a drill behaves: if the whole file throws, the
 * training still works, it just stops saving.
 * ============================================================ */
(function (global) {
  "use strict";
  var D = global.AwakenData;
  if (!D) return;

  /* ---------- Learn / Listen ----------
   * Opening a substage marks it in progress. Reaching the end of it
   * marks it complete: for a reading module "the end" is genuinely
   * having scrolled to the bottom, which is the only honest signal
   * a page can offer without pretending to measure comprehension. */
  var COMPLETE_AT = 0.9;          // fraction of the substage scrolled
  var DWELL_MS    = 20000;        // and it has to have been open a while
  var openedAt    = {};

  /* The IEM Mix Room is a page, not a substage. Opening it counts as
     starting the module; using the transport counts as real use. */
  function watchIemRoute() {
    function check() {
      var p = document.getElementById("p-iem");
      if (p && !p.hidden) { seen("listen-iem"); wireLabUse(); }
    }
    window.addEventListener("hashchange", function () { setTimeout(check, 300); });
    setTimeout(check, 1500);
  }

  function activeSub() {
    var el = document.querySelector(".substage.on, .substage:not([hidden])[id^=learn-], " +
                                   ".substage:not([hidden])[id^=listen-]");
    return el && el.id;
  }

  function seen(id) {
    if (!id) return;
    if (!openedAt[id]) openedAt[id] = Date.now();
    try { D.markModuleSeen(id); } catch (e) {}
  }

  function checkComplete() {
    var id = activeSub();
    if (!id || !openedAt[id]) return;
    if (Date.now() - openedAt[id] < DWELL_MS) return;
    var el = document.getElementById(id);
    if (!el) return;
    var r = el.getBoundingClientRect();
    var viewed = (global.innerHeight - r.top) / Math.max(1, r.height);
    if (viewed >= COMPLETE_AT) {
      try { D.updateModuleProgress(id, "complete"); } catch (e) {}
    } else {
      var pct = Math.max(0, Math.min(95, Math.round(viewed * 100)));
      try { D.updateModuleProgress(id, "in_progress", pct); } catch (e) {}
    }
  }

  /* A listening lab has no bottom to scroll to that means anything —
   * you finish it by using it. Any of these counts as real use. */
  var USE_EVENTS = {
    "listen-eq":   ["#lPlay", "#lA", "#lB"],
    "listen-comp": ["#cPlay", "#cIn", "#cOut"],
    "listen-verb": ["#vbPlay"],
    "listen-gain": ["#gsPlay"],
    "listen-hp":   ["#hpPlay", "#hpMatch"],
    /* the IEM room is its own page rather than a substage, so it reports
       through the same path but is triggered by its transport */
    "listen-iem":  ["#btnPlay", "#btnAssign"]
  };
  var used = {};
  function wireLabUse() {
    Object.keys(USE_EVENTS).forEach(function (id) {
      USE_EVENTS[id].forEach(function (sel) {
        var el = document.querySelector(sel);
        if (!el || el.__awakenWired) return;
        el.__awakenWired = true;
        el.addEventListener("click", function () {
          if (used[id]) return;
          used[id] = true;
          seen(id);
          // using a lab for real is worth most of the module
          try { D.updateModuleProgress(id, "in_progress", 60); } catch (e) {}
        });
      });
    });
  }

  /* Watch the substage tabs the site already has. */
  function wireTabs() {
    document.addEventListener("click", function (e) {
      var b = e.target && e.target.closest && e.target.closest("[data-sub]");
      if (b) setTimeout(function () { seen(b.dataset.sub); wireLabUse(); }, 60);
    }, true);
  }

  var scrollTick = null;
  function onScroll() {
    if (scrollTick) return;
    scrollTick = setTimeout(function () { scrollTick = null; checkComplete(); }, 900);
  }

  /* ---------- Arcade ----------
   * Called once per finished run by the training code, through a
   * single hook added to its shared game-over handler. */
  var ARCADE_KEY = {
    frenzy: "arcade-sprint",
    match:  "arcade-match",
    knee:   "arcade-knee",
    gain:   "arcade-gain",
    raid:   "arcade-raid"
  };

  function arcade(game, run) {
    var key = ARCADE_KEY[game];
    if (!key || !run) return;
    try {
      D.recordArcadeAttempt(key, {
        score:      run.score,
        accuracy:   run.accuracy,
        maxStreak:  run.streak,
        wave:       run.wave,
        completed:  !!run.completed,
        detail:     run.detail || {}
      });
    } catch (e) {}
  }

  /* ---------- boot ---------- */
  function start() {
    wireTabs();
    wireLabUse();
    global.addEventListener("scroll", onScroll, { passive: true });
    setInterval(function () { wireLabUse(); }, 4000);
    // whatever substage is open on load counts as opened
    setTimeout(function () { seen(activeSub()); }, 1200);
    watchIemRoute();
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start);
  else start();

  global.AwakenProgress = { arcade: arcade, seen: seen, check: checkComplete };
})(window);
