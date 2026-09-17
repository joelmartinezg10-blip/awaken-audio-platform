/* ============================================================
 * Awaken Audio - Service Companion
 *
 * The line check and soundcheck, as an interactive checklist, on a
 * phone, in a dark room, one-handed, standing up. The FOH booth and
 * Monitor World are the primary devices; a desk is the exception.
 *
 * ONE RUN PER PERSON PER SEAT PER DATE. FOH and MONS each walk the
 * same 23-input sequence with their own seat's tasks. They advance
 * independently - MONS calls the room, FOH shadows the same channel,
 * but each phone keeps its own position. A shared live position is a
 * websocket and a presence model; the seam is left for it and nothing
 * here assumes it is absent.
 *
 * COME BACK TO IT is the protocol, so a flag never stops the run -
 * except on tracks, click, cue and drums, which carry blocks_run and
 * hold everything until they are resolved. Flagged items reappear at
 * the end of line check automatically.
 *
 * FIFTEEN MINUTES is a real budget, not decoration: any minute over
 * eats the band's rehearsal. The clock runs against it during line
 * check and the run records where the minutes went.
 *
 * Nothing here writes to another person's run. Insert and update are
 * profile_id = auth.uid() at the database; this file never tries.
 * ============================================================ */
(function (global) {
  "use strict";
  var D = global.AwakenData;
  if (!D || !D.client) return;
  var sb = D.client;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
      "-" + String(d.getDate()).padStart(2, "0");
  }

  var LINE_CHECK_TARGET = 15 * 60;        /* seconds */
  var PHASE_ORDER = ["foh_prep", "mons_prep", "huddle", "line_check", "rehearsal", "pre_service"];
  var PHASE_LABEL = {
    foh_prep:    "FOH prep",
    mons_prep:   "Monitor prep",
    huddle:      "Huddle",
    line_check:  "Line check",
    rehearsal:   "Rehearsal",
    pre_service: "Pre-service"
  };

  var S = {
    items: null,        /* the template, all 54, in sort order */
    run: null,          /* the row from service_companion_runs */
    seat: "foh",
    phase: null,
    saveTimer: null,
    tick: null,
    dirty: false
  };

  /* ---------- data ---------- */

  /* Two plain queries rather than one with an embedded filter. The embed
     syntax resolves through a foreign key and fails in ways that are hard
     to read from a booth; this cannot be ambiguous. */
  function loadTemplate() {
    if (S.items) return Promise.resolve(S.items);
    return sb.from("service_companion_templates")
      .select("id,version").eq("is_active", true).maybeSingle()
      .then(function (r) {
        if (r.error) throw r.error;
        if (!r.data) throw new Error("No active checklist template");
        return sb.from("service_companion_items")
          .select("id,code,phase,seat_scope,label,detail,sort_order,is_critical,blocks_run,is_optional,is_marker,template_id")
          .eq("template_id", r.data.id)
          .order("sort_order", { ascending: true });
      })
      .then(function (r) {
        if (r.error) throw r.error;
        S.items = r.data || [];
        if (!S.items.length) throw new Error("Checklist template is empty");
        return S.items;
      });
  }

  /* getCurrentUser returns the profile row, whose id IS the auth uid
     (profiles.id references auth.users.id). Null until the profile lands. */
  function myId() {
    var u = D.getCurrentUser && D.getCurrentUser();
    return u ? u.id : null;
  }

  function findRun(date, seat) {
    var id = myId();
    if (!id) return Promise.resolve(null);
    return sb.from("service_companion_runs")
      .select("*")
      .eq("profile_id", id).eq("service_date", date).eq("seat", seat)
      .maybeSingle()
      .then(function (r) { if (r.error) throw r.error; return r.data; });
  }

  function createRun(date, seat, label) {
    var id = myId();
    if (!id) return Promise.reject(new Error("signed out"));
    return sb.from("service_companion_runs").insert({
      profile_id: id,
      template_id: S.items[0].template_id,
      seat: seat,
      service_date: date,
      service_label: label || null,
      item_states: {},
      notes: ""
    }).select().single().then(function (r) {
      if (r.error) throw r.error;
      return r.data;
    });
  }

  /* Debounced. A checklist at a console gets tapped fast and the network
     in a booth is not always kind; batching keeps it to one write a
     second rather than one per tap. */
  function save(now) {
    if (!S.run) return;
    S.dirty = true;
    if (S.saveTimer) clearTimeout(S.saveTimer);
    var go = function () {
      S.saveTimer = null;
      var patch = {
        item_states: S.run.item_states,
        notes: S.run.notes || "",
        line_check_started_at: S.run.line_check_started_at,
        line_check_ended_at: S.run.line_check_ended_at,
        completed_at: S.run.completed_at
      };
      sb.from("service_companion_runs").update(patch).eq("id", S.run.id)
        .then(function (r) {
          S.dirty = false;
          setHint(r.error ? "Not saved - check your connection" : "Saved", !!r.error);
        });
    };
    if (now) go(); else S.saveTimer = setTimeout(go, 900);
  }

  function setHint(msg, bad) {
    var el = $("#cpHint"); if (!el) return;
    el.textContent = msg || "";
    el.className = "cphint" + (bad ? " bad" : "");
  }

  /* ---------- state helpers ---------- */

  function stateOf(item) {
    var st = S.run && S.run.item_states && S.run.item_states[item.id];
    return st || null;
  }
  function setState(item, value, note) {
    if (!S.run) return;
    if (!S.run.item_states) S.run.item_states = {};
    if (value === null) delete S.run.item_states[item.id];
    else S.run.item_states[item.id] = {
      state: value,
      note: note || "",
      at: new Date().toISOString()
    };
    if (item.phase === "line_check" && !S.run.line_check_started_at) {
      S.run.line_check_started_at = new Date().toISOString();
      startTick();
    }
    save();
  }

  /* Items this seat actually sees. A FOH engineer is not walked through
     scanning IEM packs, and the reverse. */
  function visible(phase) {
    return (S.items || []).filter(function (i) {
      if (i.phase !== phase) return false;
      return i.seat_scope === "both" || i.seat_scope === S.seat;
    });
  }
  function phasesForSeat() {
    return PHASE_ORDER.filter(function (p) {
      if (p === "foh_prep"  && S.seat !== "foh")  return false;
      if (p === "mons_prep" && S.seat !== "mons") return false;
      return visible(p).length > 0;
    });
  }
  function flagged() {
    return (S.items || []).filter(function (i) {
      var st = stateOf(i);
      return st && st.state === "flagged";
    });
  }
  /* Only a FLAGGED blocking item holds the run. An untouched one just has
     not been reached yet - counting those made the banner shout "4 inputs
     holding the run" the instant line check opened, before anyone had done
     anything. A warning that fires when nothing is wrong gets ignored by
     week three, and then it is worse than no warning. */
  function blockers() {
    return (S.items || []).filter(function (i) {
      if (!i.blocks_run) return false;
      var st = stateOf(i);
      return !!st && st.state === "flagged";
    });
  }
  function counts(phase) {
    var list = visible(phase).filter(function (i) { return !i.is_marker; });
    var done = list.filter(function (i) {
      var st = stateOf(i); return st && st.state !== "flagged";
    }).length;
    return { done: done, total: list.length };
  }

  /* ---------- the clock ---------- */

  function lineCheckSeconds() {
    if (!S.run || !S.run.line_check_started_at) return 0;
    var end = S.run.line_check_ended_at ? new Date(S.run.line_check_ended_at) : new Date();
    return Math.max(0, Math.round((end - new Date(S.run.line_check_started_at)) / 1000));
  }
  function mmss(s) {
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  function startTick() {
    stopTick();
    S.tick = setInterval(paintClock, 1000);
    paintClock();
  }
  function stopTick() { if (S.tick) { clearInterval(S.tick); S.tick = null; } }
  function paintClock() {
    var el = $("#cpClock"); if (!el) return;
    if (!S.run || !S.run.line_check_started_at) { el.hidden = true; return; }
    var s = lineCheckSeconds(), over = s > LINE_CHECK_TARGET;
    el.hidden = false;
    el.className = "cpclock" + (over ? " over" : (s > LINE_CHECK_TARGET * 0.8 ? " near" : ""));
    el.innerHTML = '<b>' + mmss(s) + '</b><span>of 15:00' +
      (over ? " &middot; over" : "") + '</span>';
    if (S.run.line_check_ended_at) stopTick();
  }

  /* ---------- rendering ---------- */

  function itemHTML(i) {
    var st = stateOf(i), cls = st ? " s-" + st.state : "";
    var tags = "";
    if (i.blocks_run)  tags += '<span class="cptag block">holds the run</span>';
    else if (i.is_critical) tags += '<span class="cptag crit">critical</span>';
    if (i.is_optional) tags += '<span class="cptag opt">if any</span>';

    return '<div class="cpitem' + cls + '" data-id="' + esc(i.id) + '">' +
      '<div class="cpi-h"><span class="cpcode">' + esc(i.code) + '</span>' +
      '<b>' + esc(i.label) + '</b>' + tags + '</div>' +
      (i.detail ? '<p class="cpi-d">' + esc(i.detail) + '</p>' : '') +
      '<div class="cpi-btns">' +
        '<button type="button" class="cpb cpb-ok"   data-act="ok">Good</button>' +
        '<button type="button" class="cpb cpb-skip" data-act="skipped">Skip</button>' +
        '<button type="button" class="cpb cpb-flag" data-act="flagged">Flag</button>' +
      '</div>' +
      '<div class="cpi-note"' + (st && st.state === "flagged" ? "" : " hidden") + '>' +
        '<textarea rows="2" placeholder="What is wrong? Short is fine.">' +
          esc(st ? st.note : "") + '</textarea>' +
      '</div>' +
    '</div>';
  }

  function markerHTML(i) {
    if (i.code === "D24") {
      var f = flagged();
      return '<div class="cpmark" data-id="' + esc(i.id) + '">' +
        '<h4>' + esc(i.label) + '</h4><p>' + esc(i.detail) + '</p>' +
        (f.length
          ? '<ul class="cpflags">' + f.map(function (x) {
              return '<li><span class="cpcode">' + esc(x.code) + '</span> ' +
                esc(x.label) + (x.note ? "" : "") +
                (stateOf(x).note ? ' <i>' + esc(stateOf(x).note) + '</i>' : '') + '</li>';
            }).join("") + '</ul>'
          : '<p class="cpnone">Nothing was flagged. Good line check.</p>') +
      '</div>';
    }
    if (i.code === "E1") {
      return '<div class="cpmark" data-id="' + esc(i.id) + '">' +
        '<h4>' + esc(i.label) + '</h4><p>' + esc(i.detail) + '</p>' +
        '<textarea id="cpNotes" rows="5" placeholder="Anything worth remembering from the run-through.">' +
          esc(S.run.notes || "") + '</textarea></div>';
    }
    return '<div class="cpmark" data-id="' + esc(i.id) + '">' +
      '<h4>' + esc(i.label) + '</h4><p>' + esc(i.detail) + '</p></div>';
  }

  function render() {
    var page = $("#p-companion"); if (!page) return;

    if (!S.run) { renderSetup(); return; }

    var phases = phasesForSeat();
    if (!S.phase || phases.indexOf(S.phase) < 0) S.phase = phases[0];

    var nav = phases.map(function (p) {
      var c = counts(p);
      return '<button type="button" class="cpph' + (p === S.phase ? " on" : "") +
        '" data-phase="' + p + '">' + esc(PHASE_LABEL[p]) +
        (c.total ? '<i>' + c.done + "/" + c.total + '</i>' : '') + '</button>';
    }).join("");

    var list = visible(S.phase).map(function (i) {
      return i.is_marker ? markerHTML(i) : itemHTML(i);
    }).join("");

    var bl = S.phase === "line_check" ? blockers() : [];
    var blockHTML = bl.length
      ? '<div class="cpblock"><b>' + bl.length + ' input' + (bl.length > 1 ? "s" : "") +
        ' still holding the run</b><span>' +
        bl.map(function (x) { return esc(x.label); }).join(", ") +
        ' &mdash; everything else can come back to it, these cannot.</span></div>'
      : "";

    var idx = phases.indexOf(S.phase);
    $("#cpBody").innerHTML =
      blockHTML +
      '<div class="cplist">' + list + '</div>' +
      '<div class="cpnav">' +
        (idx > 0 ? '<button type="button" class="btn" data-go="' + phases[idx - 1] + '">&larr; ' + esc(PHASE_LABEL[phases[idx - 1]]) + '</button>' : '<span></span>') +
        (idx < phases.length - 1
          ? '<button type="button" class="btn primary" data-go="' + phases[idx + 1] + '">' + esc(PHASE_LABEL[phases[idx + 1]]) + ' &rarr;</button>'
          : '<button type="button" class="btn primary" id="cpFinish">Finish this service</button>') +
      '</div>';

    $("#cpPhases").innerHTML = nav;
    $("#cpMeta").innerHTML =
      '<span class="cpseat ' + S.seat + '">' + (S.seat === "foh" ? "FOH" : "MONS") + '</span>' +
      '<b>' + esc(S.run.service_date) + '</b>' +
      (S.run.service_label ? '<span>' + esc(S.run.service_label) + '</span>' : '');
    $("#cpSetup").hidden = true;
    $("#cpRun").hidden = false;
    page.classList.add("running");
    paintClock();
  }

  /* This card is deliberately NOT a data-auth element. The header painter
     un-hides every [data-auth] node on each auth repaint, which fought
     render() and left the setup card stacked above a running checklist. One
     owner per element. */
  function renderSetup() {
    var pg = $("#p-companion"); if (pg) pg.classList.remove("running");
    $("#cpRun").hidden = true;
    $("#cpSetup").hidden = !myId();
    var d = $("#cpDate"); if (d && !d.value) d.value = todayISO();
    stopTick();
  }

  /* ---------- events ---------- */

  function wire() {
    var page = $("#p-companion"); if (!page || page.__wired) return;
    page.__wired = true;

    page.addEventListener("click", function (e) {
      var seatBtn = e.target.closest("[data-seat]");
      if (seatBtn) {
        S.seat = seatBtn.dataset.seat;
        Array.prototype.forEach.call(page.querySelectorAll("[data-seat]"), function (b) {
          b.setAttribute("aria-pressed", b === seatBtn);
        });
        return;
      }
      if (e.target.id === "cpStart")  { return start(); }
      if (e.target.id === "cpFinish") { return finish(); }

      var ph = e.target.closest("[data-phase]");
      if (ph) { S.phase = ph.dataset.phase; render(); return; }

      var go = e.target.closest("[data-go]");
      if (go) { S.phase = go.dataset.go; render();
                document.getElementById("p-companion").scrollIntoView({behavior:"smooth",block:"start"}); return; }

      var act = e.target.closest("[data-act]");
      if (act) {
        var card = act.closest(".cpitem"), id = card.dataset.id;
        var item = S.items.filter(function (x) { return x.id === id; })[0];
        if (!item) return;
        var cur = stateOf(item), value = act.dataset.act;
        if (cur && cur.state === value) setState(item, null);          /* tap again to clear */
        else setState(item, value, cur ? cur.note : "");
        render();
        return;
      }
    });

    page.addEventListener("input", function (e) {
      if (e.target.id === "cpNotes") { S.run.notes = e.target.value; save(); return; }
      var card = e.target.closest(".cpi-note");
      if (card) {
        var id = card.closest(".cpitem").dataset.id;
        var item = S.items.filter(function (x) { return x.id === id; })[0];
        if (!item) return;
        var st = stateOf(item);
        setState(item, st ? st.state : "flagged", e.target.value);
      }
    });
  }

  function start() {
    if (!myId()) { setHint("Sign in first", true); return; }
    var date = $("#cpDate").value || todayISO();
    var label = ($("#cpLabel").value || "").trim().slice(0, 80);
    setHint("Starting...");
    loadTemplate()
      .then(function () { return findRun(date, S.seat); })
      .then(function (r) { return r || createRun(date, S.seat, label); })
      .then(function (r) {
        S.run = r; S.phase = null;
        if (r.line_check_started_at && !r.line_check_ended_at) startTick();
        setHint("");
        render();
      })
      .catch(function (err) {
        setHint(err && err.message ? err.message : "Could not start", true);
      });
  }

  function finish() {
    if (!S.run.line_check_ended_at && S.run.line_check_started_at)
      S.run.line_check_ended_at = new Date().toISOString();
    S.run.completed_at = new Date().toISOString();
    save(true);
    stopTick();

    var f = flagged(), secs = lineCheckSeconds();
    var lines = f.map(function (x) {
      var n = stateOf(x).note;
      return "- " + x.label + (n ? ": " + n : "");
    });
    /* Handed to the reflection rather than retyped. The blank page is the
       reason journals die; two honest technical notes written at 5:20 are
       something to react to at 12:15. */
    try {
      sessionStorage.setItem("awaken.companion.handoff", JSON.stringify({
        date: S.run.service_date,
        label: S.run.service_label || "",
        seat: S.seat,
        flags: lines
      }));
    } catch (e) {}

    $("#cpBody").innerHTML =
      '<div class="cpdone">' +
        '<h3>Run complete</h3>' +
        (S.run.line_check_started_at
          ? '<p class="cpsum">Line check took <b>' + mmss(secs) + '</b> against a 15:00 target' +
            (secs > LINE_CHECK_TARGET ? ' &mdash; over by ' + mmss(secs - LINE_CHECK_TARGET) : '') + '.</p>'
          : '') +
        (lines.length
          ? '<p class="cpsum">' + lines.length + ' flagged:</p><ul class="cpflags">' +
            f.map(function (x) {
              var n = stateOf(x).note;
              return '<li><span class="cpcode">' + esc(x.code) + '</span> ' + esc(x.label) +
                     (n ? ' <i>' + esc(n) + '</i>' : '') + '</li>';
            }).join("") + '</ul>'
          : '<p class="cpsum">Nothing flagged.</p>') +
        '<div class="foot">' +
          '<a class="btn primary" href="#/reflections">Write the reflection &rarr;</a>' +
          '<button type="button" class="btn" id="cpAnother">Start another seat</button>' +
        '</div>' +
      '</div>';
    $("#cpAnother").onclick = function () { S.run = null; render(); };
  }

  /* When the reflection form opens after a finished run, fill the service
     line and drop the flagged items in as context. Only ever fills a field
     the person has left empty - it never overwrites their own words.

     The reflections page paints its own form on the same hashchange, and
     won the race on the first attempt, so this retries for two seconds and
     only clears the handoff once a value has actually stuck. */
  function handoffToReflection(attempt) {
    attempt = attempt || 0;
    var raw;
    try { raw = sessionStorage.getItem("awaken.companion.handoff"); } catch (e) { return; }
    if (!raw) return;
    var h; try { h = JSON.parse(raw); } catch (e) { return; }

    var date = $("#rfDate"), svc = $("#rfService"), work = $("#rfWork");
    if (!date || !svc || !work) {
      if (attempt < 20) setTimeout(function () { handoffToReflection(attempt + 1); }, 100);
      return;
    }

    var text = (h.flags && h.flags.length)
      ? "From the line check:\n" + h.flags.join("\n") + "\n\n" : "";
    var label = h.label || ((h.seat === "foh" ? "FOH" : "MONS") + " service");

    if (h.date && !date.value) date.value = h.date;
    if (!svc.value) svc.value = label;
    if (text && !work.value.trim()) work.value = text;

    /* Did it survive the other page's paint? */
    var stuck = (svc.value === label) && (!text || work.value.indexOf("From the line check") === 0);
    if (!stuck) {
      if (attempt < 20) setTimeout(function () { handoffToReflection(attempt + 1); }, 100);
      return;
    }
    try { sessionStorage.removeItem("awaken.companion.handoff"); } catch (e) {}
  }

  /* ---------- entry ---------- */

  function onCompanion() {
    return location.hash.replace(/^#/, "").split(/[#?&]/)[0] === "/companion";
  }

  /* Supabase restores the session from localStorage asynchronously. Asking
     for the template before that lands sends the request as anon, RLS
     correctly returns nothing, and the page would sit there claiming there
     is no checklist. So: only fetch once there is a signed-in identity, and
     let onChange bring us back when it arrives. */
  function ensureLoaded() {
    if (!onCompanion()) return;
    wire();
    if (!myId()) { renderSetup(); return; }
    if (S.items) { render(); return; }
    loadTemplate().then(render).catch(function (e) {
      setHint("Could not load the checklist: " + (e.message || e), true);
    });
  }

  function onRoute() {
    if (onCompanion()) ensureLoaded();
    if (location.hash.replace(/^#/, "").split(/[#?&]/)[0] === "/reflections")
      setTimeout(handoffToReflection, 60);
  }

  function init() {
    wire();
    window.addEventListener("hashchange", onRoute);
    if (D.onChange) D.onChange(function () { ensureLoaded(); });
    onRoute();
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();

  global.AwakenCompanion = { state: S };
})(window);
