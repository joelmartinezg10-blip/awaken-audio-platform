/* ============================================================
 * Awaken Audio - Service Companion
 *
 * The line check and soundcheck, on a phone, in a dark room,
 * one-handed, standing up. Line check is a live pass: one Now
 * card, a signal-path you can feel, swipe or a large Next to
 * advance. Prep phases stay a list. The FOH booth and Monitor
 * World are the primary devices; a desk is the exception.
 *
 * ONE RUN PER PERSON PER SEAT PER DATE. FOH and MONS each walk
 * the same 23-input sequence with their own seat's tasks. They
 * advance independently - MONS calls the room, FOH shadows the
 * same channel, but each phone keeps its own position. A shared
 * live position is a websocket and a presence model; the seam
 * is left for it and nothing here assumes it is absent.
 *
 * COME BACK TO IT is the protocol, so a flag never stops the run -
 * except on tracks, click, cue and drums, which carry blocks_run and
 * hold everything until they are resolved. Flagged items reappear at
 * the end of line check automatically.
 *
 * FIFTEEN MINUTES is a real budget, not decoration: any minute over
 * eats the band's rehearsal. The clock is minutes on this pass.
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
  var SWIPE_PX = 72;

  var S = {
    items: null,        /* the template, all 54, in sort order */
    run: null,          /* the row from service_companion_runs */
    seat: "foh",
    phase: null,
    focusId: null,      /* current line-check item; derived if null */
    preview: false,     /* in-memory pass; never writes */
    saveTimer: null,
    tick: null,
    dirty: false
  };
  var swallowClick = false;

  /* ---------- preview fixture ---------- */

  /* Same sequence as the live template. Used only for a booth walk
     that writes nothing. Real Start still loads service_companion_*. */
  function pv(code, phase, seat, label, detail, order, flags) {
    flags = flags || "";
    return {
      id: "pv-" + code, code: code, phase: phase, seat_scope: seat,
      label: label, detail: detail, sort_order: order,
      is_critical: flags.indexOf("c") >= 0,
      blocks_run: flags.indexOf("b") >= 0,
      is_optional: flags.indexOf("o") >= 0,
      is_marker: flags.indexOf("m") >= 0,
      template_id: "preview"
    };
  }
  function previewItems() {
    return [
      pv("A1","foh_prep","foh","Play a song through the PA","Music up first, before anything else gets checked.",10),
      pv("A2","foh_prep","foh","Walk the room","PA and fills working and sounding right. Walk it, do not assume it.",20,"c"),
      pv("A3","foh_prep","foh","Console file loaded","Correct file for this campus and this service.",30,"c"),
      pv("A4","foh_prep","foh","Scene / snapshot recalled","Verify it actually recalled. Do not assume.",40,"c"),
      pv("A5","foh_prep","foh","Stage patch verified","With the Stage Manager: every input landed where the patch says. An instrument with nowhere to plug in is the most common line check delay.",50,"c"),
      pv("A6","foh_prep","foh","Pre-service countdown video","Audio present, level correct.",60),
      pv("A7","foh_prep","foh","60-second countdown","Audio present, level correct.",70),
      pv("A8","foh_prep","foh","Video 1","Audio present, level correct.",80),
      pv("A9","foh_prep","foh","Video 2","If there is one this week.",90,"o"),
      pv("A10","foh_prep","foh","Additional videos / pastor media","Anything requested by pastors. Check the plan.",100,"o"),
      pv("A11","foh_prep","foh","MC1","Speaking mic. Normally EQ and processing are set for a MALE speaker.",110,"c"),
      pv("A12","foh_prep","foh","MC2","Speaking mic. Normally EQ and processing are set for a FEMALE speaker.",120,"c"),
      pv("A13","foh_prep","foh","MC3","Preacher, male or female. Check who is preaching this week.",130,"c"),
      pv("A14","foh_prep","foh","MC4","Aux mic for a second preacher, or a lav.",140,"o"),
      pv("B1","mons_prep","mons","Console powers up and is responsive","If the board is down, say so now. It has happened, and it is not a five minute fix at 5:10.",150,"c"),
      pv("B2","mons_prep","mons","Scene loaded","Correct scene for this campus and this service.",160,"c"),
      pv("B3","mons_prep","mons","Scene verified in order","Everything where it should be before anyone walks up.",170,"c"),
      pv("B4","mons_prep","mons","IEM packs scanned to correct RF","With the Stage Manager. Each pack matches its body pack name: Drums, Bass, EG1, and so on.",180,"c"),
      pv("B5","mons_prep","mons","Talkback routing checked","Every talkback reaches where it should.",190),
      pv("B6","mons_prep","mons","Click routing checked","Click present in every mix that needs it.",200),
      pv("B7","mons_prep","mons","Tracks connection verified","Before line check, not during. A tracks connection problem holds the whole run.",210,"c"),
      pv("C1","huddle","both","Worship and Production huddle","5:00, 10 minutes, at the altar. Led by Worship Leader, Producer and on-site Pastors.",220,"m"),
      pv("D1","line_check","both","Tracks","A problem here holds the whole line check.",230,"cb"),
      pv("D2","line_check","both","Click","A problem here holds the whole line check.",240,"cb"),
      pv("D3","line_check","both","Cue (Guide)","A problem here holds the whole line check.",250,"cb"),
      pv("D4","line_check","both","Drums","Full kit. A problem here holds the whole line check.",260,"cb"),
      pv("D5","line_check","both","Bass","Level for every position on stage.",270),
      pv("D6","line_check","both","EG 1","Level for every position on stage.",280),
      pv("D7","line_check","both","EG 2","Level for every position on stage.",290),
      pv("D8","line_check","both","Acoustic guitar","Level for every position on stage.",300),
      pv("D9","line_check","both","Keys 1","Level for every position on stage.",310),
      pv("D10","line_check","both","Keys 2","If there is one this week.",320,"o"),
      pv("D11","line_check","both","VOX 1","Level for every position on stage.",330),
      pv("D12","line_check","both","VOX 2","Level for every position on stage.",340),
      pv("D13","line_check","both","VOX 3","Often the Worship Leader.",350),
      pv("D14","line_check","both","VOX 4","Level for every position on stage.",360),
      pv("D15","line_check","both","VOX 5","If there is one this week.",370,"o"),
      pv("D16","line_check","both","VOX 6","If there is one this week.",380,"o"),
      pv("D17","line_check","both","ALL VOX","Together. Blend, not individuals.",390),
      pv("D18","line_check","both","MD Talkback","Usually EG TB or Keys TB.",400),
      pv("D19","line_check","both","Drums TB","Talkback from the kit.",410),
      pv("D20","line_check","both","Other stage TB","Any remaining stage talkback.",420,"o"),
      pv("D21","line_check","both","Worship Leader TB","Talkback from the Worship Leader.",430),
      pv("D22","line_check","both","Drummers click (backup)","Backup click at the kit.",440),
      pv("D23","line_check","both","Tracks / Click / Cue recheck","End of run recheck.",450),
      pv("D24","line_check","both","Revisit flagged inputs","Anything flagged earlier comes back here. Come back to it is the protocol, not a suggestion.",460,"m"),
      pv("E1","rehearsal","both","Rehearsal notes","Scratchpad. Anything written here carries over to the reflection for this service.",470,"m"),
      pv("F1","pre_service","both","Run the first 30 to 60 seconds of the opener","Worship and Production together.",480,"c"),
      pv("F2","pre_service","foh","Music in the house","Before doors open.",490),
      pv("F3","pre_service","both","Tidy your area and final checks","Anything outstanding, handle it now.",500),
      pv("F4","pre_service","both","Fuel","Beige room.",510),
      pv("F5","pre_service","foh","Back at the desk, 8 minutes out","6.22pm",520,"c"),
      pv("F6","pre_service","foh","Pre-service countdown video","6.25pm",530,"c"),
      pv("F7","pre_service","both","Ready to go live","6.30pm",540,"c")
    ];
  }

  /* ---------- data ---------- */

  /* Two plain queries rather than one with an embedded filter. The embed
     syntax resolves through a foreign key and fails in ways that are hard
     to read from a booth; this cannot be ambiguous. */
  function loadTemplate() {
    if (S.items && !S.preview) return Promise.resolve(S.items);
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
    if (S.preview) {
      S.dirty = false;
      setHint("Preview — not saved");
      return;
    }
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
    ["#cpHint", "#cpHint2"].forEach(function (sel) {
      var el = $(sel); if (!el) return;
      el.textContent = msg || "";
      el.className = "cphint" + (bad ? " bad" : "");
    });
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

  function itemById(id) {
    return (S.items || []).filter(function (x) { return x.id === id; })[0] || null;
  }
  function indexOfItem(list, item) {
    if (!item) return -1;
    var i;
    for (i = 0; i < list.length; i++) if (list[i].id === item.id) return i;
    return -1;
  }
  /* Walked on the first pass: Good, Skip, or a non-blocking Flag.
     Blocking flags stay underfoot until they are resolved. */
  function passed(item) {
    var st = stateOf(item);
    if (!st) return false;
    if (st.state === "ok" || st.state === "skipped") return true;
    if (st.state === "flagged" && !item.blocks_run) return true;
    return false;
  }
  function lineInputs(list) {
    return (list || []).filter(function (i) { return !i.is_marker; });
  }

  function focusItem() {
    var list = visible("line_check");
    if (!list.length) return null;

    var bl = blockers();
    if (bl.length) return bl[0];

    if (S.focusId) {
      var hit = itemById(S.focusId);
      if (hit && hit.phase === "line_check") return hit;
    }

    var i, it;
    for (i = 0; i < list.length; i++) {
      it = list[i];
      if (it.is_marker) continue;
      if (!passed(it)) return it;
    }
    for (i = 0; i < list.length; i++) {
      if (list[i].is_marker) return list[i];
    }
    return list[list.length - 1];
  }

  function advanceFrom(item) {
    var list = visible("line_check");
    var idx = indexOfItem(list, item);
    var i, it, open;
    for (i = idx + 1; i < list.length; i++) {
      it = list[i];
      if (it.is_marker) {
        open = list.filter(function (x) { return !x.is_marker && !passed(x); });
        if (!open.length) { S.focusId = it.id; return; }
        continue;
      }
      if (!passed(it)) { S.focusId = it.id; return; }
    }
    if (list.length) S.focusId = list[list.length - 1].id;
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
    var label = "on this pass";
    if (over) label = "over the 15 min budget";
    else if (s > LINE_CHECK_TARGET * 0.8) label = "on this pass · 15 min budget";
    el.hidden = false;
    el.className = "cpclock" + (over ? " over" : (s > LINE_CHECK_TARGET * 0.8 ? " near" : ""));
    el.innerHTML = "<b>" + mmss(s) + "</b><span>" + label + "</span>";
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
              return '<li><button type="button" class="cpflag-jump" data-focus="' + esc(x.id) + '">' +
                '<span class="cpcode">' + esc(x.code) + '</span> ' + esc(x.label) +
                '</button>' +
                (stateOf(x).note ? " <i>" + esc(stateOf(x).note) + "</i>" : "") + "</li>";
            }).join("") + "</ul>"
          : '<p class="cpnone">Nothing was flagged. Good line check.</p>') +
      "</div>";
    }
    if (i.code === "E1") {
      return '<div class="cpmark" data-id="' + esc(i.id) + '">' +
        '<h4>' + esc(i.label) + '</h4><p>' + esc(i.detail) + '</p>' +
        '<textarea id="cpNotes" rows="5" placeholder="Anything worth remembering from the run-through.">' +
          esc(S.run.notes || "") + "</textarea></div>";
    }
    return '<div class="cpmark" data-id="' + esc(i.id) + '">' +
      "<h4>" + esc(i.label) + "</h4><p>" + esc(i.detail) + "</p></div>";
  }

  function destLabel() {
    return S.seat === "mons" ? "MIXES" : "HOUSE";
  }

  function pathHTML(list, current) {
    var inputs = lineInputs(list);
    var idx = 0, on = false, i;
    for (i = 0; i < inputs.length; i++) {
      if (current && inputs[i].id === current.id) { idx = i; on = true; break; }
    }
    if (!on && current && current.is_marker) idx = inputs.length;
    var pct = 0;
    if (inputs.length) {
      pct = on
        ? Math.round(((idx + 0.55) / inputs.length) * 100)
        : Math.round((idx / inputs.length) * 100);
    }
    var ticks = inputs.map(function (it, n) {
      var st = stateOf(it);
      var cls = "cptick";
      if (n < idx) cls += " done";
      if (on && n === idx) cls += " now";
      if (st && st.state === "flagged") cls += " flag";
      else if (st && st.state === "ok") cls += " ok";
      else if (st && st.state === "skipped") cls += " skipped";
      return '<button type="button" class="' + cls + '" data-focus="' + esc(it.id) +
        '" aria-label="' + esc(it.label) + '"></button>';
    }).join("");
    return '<div class="cppath" style="--p:' + pct + '%">' +
      '<span class="cppath-end">STAGE</span>' +
      '<div class="cppath-track"><div class="cppath-fill"></div>' +
      '<div class="cppath-ticks">' + ticks + "</div></div>" +
      '<span class="cppath-end">' + destLabel() + "</span></div>";
  }

  function trailHTML(list, current) {
    var idx = indexOfItem(list, current);
    var prev = list.slice(0, Math.max(0, idx)).filter(function (i) { return !i.is_marker; });
    if (!prev.length) return '<div class="cptrail" hidden></div>';
    return '<div class="cptrail">' + prev.map(function (it) {
      var st = stateOf(it);
      var cls = "cptrail-i" + (st ? " s-" + st.state : "");
      return '<button type="button" class="' + cls + '" data-focus="' + esc(it.id) + '">' +
        esc(it.label) + "</button>";
    }).join("") + "</div>";
  }

  function nowActions(item, st) {
    if (item.is_marker) {
      return '<div class="cpnow-act">' +
        '<button type="button" class="cpb cpb-next" data-next>Next phase</button></div>';
    }
    var hold = !!(item.blocks_run && st && st.state === "flagged");
    return '<div class="cpnow-act">' +
      '<button type="button" class="cpb cpb-next"' + (hold ? " disabled" : "") + " data-next>" +
        (hold ? "Holding — Good or Skip to release" : "Good · Next") + "</button>" +
      '<div class="cpi-btns cpnow-fb">' +
        '<button type="button" class="cpb cpb-skip" data-act="skipped">Skip</button>' +
        '<button type="button" class="cpb cpb-flag" data-act="flagged">Flag</button>' +
      "</div>" +
      '<p class="cpnow-fbhint">Swipe the channel right for Good, left for Flag. Skip is a tap.</p>' +
    "</div>";
  }

  function nowHTML(item, list) {
    if (!item) return "";
    var st = stateOf(item);
    var next = null;
    var i = indexOfItem(list, item);
    if (i >= 0 && i < list.length - 1) next = list[i + 1];

    var tags = "";
    if (item.blocks_run) tags += '<span class="cptag block">holds the run</span>';
    else if (item.is_critical) tags += '<span class="cptag crit">critical</span>';
    if (item.is_optional) tags += '<span class="cptag opt">if any</span>';

    var seat = S.seat === "foh" ? "FOH" : "MONS";
    var cls = "cpnow" + (st ? " s-" + st.state : "") + (item.is_marker ? " marker" : "");

    var card = '<div class="' + cls + '" data-id="' + esc(item.id) + '">' +
      '<div class="cpnow-ghost ok" aria-hidden="true">GOOD</div>' +
      '<div class="cpnow-ghost flag" aria-hidden="true">FLAG</div>' +
      '<p class="cpnow-sub"><span class="cpnow-seat ' + S.seat + '">' + seat +
        "</span> · LINE CHECK</p>" +
      '<h2 class="cpnow-name">' + esc(item.label) + "</h2>" +
      (item.detail ? '<p class="cpnow-d">' + esc(item.detail) + "</p>" : "") +
      (tags ? '<div class="cpnow-tags">' + tags + "</div>" : "") +
      '<p class="cpnow-hint"><span>FLAG ←</span><b>swipe</b><span>→ GOOD</span></p>' +
      (!item.is_marker
        ? '<div class="cpi-note"' + (st && st.state === "flagged" ? "" : " hidden") + ">" +
            '<textarea rows="2" placeholder="What is wrong? Short is fine.">' +
              esc(st ? st.note : "") + "</textarea></div>"
        : "") +
    "</div>";

    var peek = "";
    if (next) {
      peek = '<p class="cppeek">Next <b>' + esc(next.label) + "</b></p>";
    }

    if (item.is_marker) {
      return pathHTML(list, item) + card + markerHTML(item) + peek + nowActions(item, st);
    }
    return pathHTML(list, item) + card + peek + nowActions(item, st);
  }

  function applyAct(item, value, fromGesture) {
    if (!item || item.is_marker) return;
    var cur = stateOf(item);
    if (!fromGesture && cur && cur.state === value) {
      setState(item, null);
      S.focusId = item.id;
      render();
      return;
    }
    setState(item, value, cur ? cur.note : "");
    if (S.phase === "line_check") {
      if (value === "flagged") {
        S.focusId = item.id;
        render();
        return;
      }
      advanceFrom(item);
    }
    render();
  }

  function doNext(item) {
    if (!item) return;
    if (item.is_marker) {
      var phases = phasesForSeat();
      var idx = phases.indexOf(S.phase);
      if (idx < phases.length - 1) {
        S.phase = phases[idx + 1];
        S.focusId = null;
      }
      render();
      return;
    }
    var st = stateOf(item);
    if (item.blocks_run && st && st.state === "flagged") {
      setHint("This input holds the run until it is Good or Skip", true);
      S.focusId = item.id;
      render();
      return;
    }
    if (st && (st.state === "ok" || st.state === "skipped" || st.state === "flagged")) {
      advanceFrom(item);
      render();
      return;
    }
    setState(item, "ok", st ? st.note : "");
    advanceFrom(item);
    render();
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
        (c.total ? "<i>" + c.done + "/" + c.total + "</i>" : "") + "</button>";
    }).join("");

    var bodyInner, bl, blockHTML = "";
    if (S.phase === "line_check") {
      var list = visible(S.phase);
      var cur = focusItem();
      if (cur) S.focusId = cur.id;
      bl = blockers();
      blockHTML = bl.length
        ? '<div class="cpblock"><b>' + bl.length + " input" + (bl.length > 1 ? "s" : "") +
          " still holding the run</b><span>" +
          bl.map(function (x) { return esc(x.label); }).join(", ") +
          " &mdash; everything else can come back to it, these cannot.</span></div>"
        : "";
      bodyInner = '<div class="cpass">' +
        trailHTML(list, cur) +
        blockHTML +
        nowHTML(cur, list) +
      "</div>";
    } else {
      var rows = visible(S.phase).map(function (i) {
        return i.is_marker ? markerHTML(i) : itemHTML(i);
      }).join("");
      bodyInner = '<div class="cplist">' + rows + "</div>";
    }

    var idx = phases.indexOf(S.phase);
    $("#cpBody").innerHTML =
      bodyInner +
      '<div class="cpnav">' +
        (idx > 0 ? '<button type="button" class="btn" data-go="' + phases[idx - 1] + '">&larr; ' + esc(PHASE_LABEL[phases[idx - 1]]) + "</button>" : "<span></span>") +
        (idx < phases.length - 1
          ? '<button type="button" class="btn primary" data-go="' + phases[idx + 1] + '">' + esc(PHASE_LABEL[phases[idx + 1]]) + " &rarr;</button>"
          : '<button type="button" class="btn primary" id="cpFinish">Finish this service</button>') +
      "</div>";

    $("#cpPhases").innerHTML = nav;
    $("#cpMeta").innerHTML =
      '<span class="cpseat ' + S.seat + '">' + (S.seat === "foh" ? "FOH" : "MONS") + "</span>" +
      "<b>" + esc(S.run.service_date) + "</b>" +
      (S.run.service_label ? "<span>" + esc(S.run.service_label) + "</span>" : "") +
      (S.preview ? '<span class="cppreview-tag">Preview · not saved</span>' : "");
    $("#cpSetup").hidden = true;
    $("#cpRun").hidden = false;
    page.classList.add("running");
    page.classList.toggle("linepass", S.phase === "line_check");
    paintClock();
  }

  /* This card is deliberately NOT a data-auth element. The header painter
     un-hides every [data-auth] node on each auth repaint, which fought
     render() and left the setup card stacked above a running checklist. One
     owner per element. */
  function renderSetup() {
    var pg = $("#p-companion");
    if (pg) {
      pg.classList.remove("running");
      pg.classList.remove("linepass");
    }
    $("#cpRun").hidden = true;
    $("#cpSetup").hidden = false;
    var d = $("#cpDate"); if (d && !d.value) d.value = todayISO();
    var start = $("#cpStart");
    if (start) start.disabled = !myId();
    stopTick();
  }

  /* ---------- events ---------- */

  function wire() {
    var page = $("#p-companion"); if (!page || page.__wired) return;
    page.__wired = true;

    page.addEventListener("click", function (e) {
      if (swallowClick) {
        swallowClick = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      var seatBtn = e.target.closest("[data-seat]");
      if (seatBtn) {
        S.seat = seatBtn.dataset.seat;
        Array.prototype.forEach.call(page.querySelectorAll("[data-seat]"), function (b) {
          b.setAttribute("aria-pressed", b === seatBtn ? "true" : "false");
        });
        return;
      }
      if (e.target.closest("[data-preview]")) { return startPreview(); }
      if (e.target.id === "cpStart")  { return start(); }
      if (e.target.id === "cpFinish") { return finish(); }

      var ph = e.target.closest("[data-phase]");
      if (ph) { S.phase = ph.dataset.phase; if (S.phase !== "line_check") S.focusId = null; render(); return; }

      var go = e.target.closest("[data-go]");
      if (go) {
        S.phase = go.dataset.go;
        if (S.phase !== "line_check") S.focusId = null;
        render();
        document.getElementById("p-companion").scrollIntoView({behavior:"smooth",block:"start"});
        return;
      }

      var foc = e.target.closest("[data-focus]");
      if (foc) {
        S.focusId = foc.getAttribute("data-focus");
        S.phase = "line_check";
        render();
        return;
      }

      var nxt = e.target.closest("[data-next]");
      if (nxt) {
        var nowCard = $(".cpnow") || page.querySelector(".cpmark");
        var nowItem = nowCard ? itemById(nowCard.dataset.id) : focusItem();
        return doNext(nowItem);
      }

      var act = e.target.closest("[data-act]");
      if (act) {
        var card = act.closest(".cpitem") || act.closest(".cpnow");
        var id = card && card.dataset.id;
        var item = id ? itemById(id) : null;
        if (!item) return;
        applyAct(item, act.dataset.act, false);
        return;
      }
    });

    page.addEventListener("input", function (e) {
      if (e.target.id === "cpNotes") { S.run.notes = e.target.value; save(); return; }
      var card = e.target.closest(".cpi-note");
      if (card) {
        var host = card.closest(".cpitem") || card.closest(".cpnow");
        var id = host && host.dataset.id;
        var item = id ? itemById(id) : null;
        if (!item) return;
        var st = stateOf(item);
        setState(item, st ? st.state : "flagged", e.target.value);
      }
    });

    wireSwipe(page);
  }

  function wireSwipe(page) {
    var swipe = { on: false, x0: 0, y0: 0, dx: 0, axis: null, card: null, pid: null };

    function targetCard(e) {
      var t = e.target;
      if (!t.closest) return null;
      if (t.closest("button, textarea, a, input, .cptrail, .cppath, .cpnow-act, .cpmark")) return null;
      return t.closest(".cpnow");
    }
    function resetCard(card) {
      if (!card) return;
      card.style.transform = "";
      card.classList.remove("swipe-ok", "swipe-flag", "swiping");
    }
    function end(e) {
      if (!swipe.on) return;
      var card = swipe.card, dx = swipe.dx, item;
      swipe.on = false;
      swipe.card = null;
      swipe.axis = null;
      if (e && swipe.pid != null) {
        try { page.releasePointerCapture(swipe.pid); } catch (err) {}
      }
      swipe.pid = null;
      resetCard(card);
      if (!card || Math.abs(dx) < SWIPE_PX) return;
      swallowClick = true;
      item = itemById(card.dataset.id);
      if (!item) return;
      if (dx > 0) doNext(item);
      else applyAct(item, "flagged", true);
    }

    page.addEventListener("pointerdown", function (e) {
      if (S.phase !== "line_check") return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      var card = targetCard(e);
      if (!card) return;
      swipe.on = true;
      swipe.x0 = e.clientX;
      swipe.y0 = e.clientY;
      swipe.dx = 0;
      swipe.axis = null;
      swipe.card = card;
      swipe.pid = e.pointerId;
      try { page.setPointerCapture(e.pointerId); } catch (err) {}
    });
    page.addEventListener("pointermove", function (e) {
      if (!swipe.on || !swipe.card) return;
      var dx = e.clientX - swipe.x0, dy = e.clientY - swipe.y0;
      if (!swipe.axis) {
        if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
        swipe.axis = Math.abs(dx) > Math.abs(dy) * 1.15 ? "x" : "y";
        if (swipe.axis === "y") { swipe.on = false; resetCard(swipe.card); swipe.card = null; return; }
        swipe.card.classList.add("swiping");
      }
      if (swipe.axis !== "x") return;
      if (e.cancelable) e.preventDefault();
      swipe.dx = dx;
      var x = Math.max(-160, Math.min(160, dx));
      swipe.card.style.transform = "translateX(" + x + "px)";
      swipe.card.classList.toggle("swipe-ok", x > 36);
      swipe.card.classList.toggle("swipe-flag", x < -36);
    }, { passive: false });
    page.addEventListener("pointerup", end);
    page.addEventListener("pointercancel", end);
  }

  function clearPreviewCache() {
    if (S.items && S.items[0] && S.items[0].template_id === "preview") S.items = null;
    S.preview = false;
    S.focusId = null;
  }

  function start() {
    if (!myId()) { setHint("Sign in first", true); return; }
    clearPreviewCache();
    var date = $("#cpDate").value || todayISO();
    var label = ($("#cpLabel").value || "").trim().slice(0, 80);
    setHint("Starting...");
    loadTemplate()
      .then(function () { return findRun(date, S.seat); })
      .then(function (r) { return r || createRun(date, S.seat, label); })
      .then(function (r) {
        S.run = r; S.phase = null; S.focusId = null;
        if (r.line_check_started_at && !r.line_check_ended_at) startTick();
        setHint("");
        render();
      })
      .catch(function (err) {
        setHint(err && err.message ? err.message : "Could not start", true);
      });
  }

  function startPreview() {
    S.preview = true;
    S.items = previewItems();
    S.focusId = null;
    S.run = {
      id: "preview",
      seat: S.seat,
      service_date: ($("#cpDate") && $("#cpDate").value) || todayISO(),
      service_label: "Preview pass",
      item_states: {},
      notes: "",
      line_check_started_at: null,
      line_check_ended_at: null,
      completed_at: null
    };
    S.phase = "line_check";
    setHint("Preview pass — nothing is saved");
    render();
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
    if (!S.preview) {
      try {
        sessionStorage.setItem("awaken.companion.handoff", JSON.stringify({
          date: S.run.service_date,
          label: S.run.service_label || "",
          seat: S.seat,
          flags: lines
        }));
      } catch (e) {}
    }

    var page = $("#p-companion");
    if (page) page.classList.remove("linepass");

    $("#cpBody").innerHTML =
      '<div class="cpdone">' +
        "<h3>Run complete</h3>" +
        (S.run.line_check_started_at
          ? '<p class="cpsum">Line check took <b>' + mmss(secs) + "</b> against a 15:00 target" +
            (secs > LINE_CHECK_TARGET ? " &mdash; over by " + mmss(secs - LINE_CHECK_TARGET) : "") + ".</p>"
          : "") +
        (lines.length
          ? '<p class="cpsum">' + lines.length + ' flagged:</p><ul class="cpflags">' +
            f.map(function (x) {
              var n = stateOf(x).note;
              return '<li><span class="cpcode">' + esc(x.code) + "</span> " + esc(x.label) +
                     (n ? " <i>" + esc(n) + "</i>" : "") + "</li>";
            }).join("") + "</ul>"
          : '<p class="cpsum">Nothing flagged.</p>') +
        '<div class="foot">' +
          (S.preview
            ? ""
            : '<a class="btn primary" href="#/reflections">Write the reflection &rarr;</a>') +
          '<button type="button" class="btn" id="cpAnother">Start another seat</button>' +
        "</div>" +
      "</div>";
    $("#cpAnother").onclick = function () {
      S.run = null;
      clearPreviewCache();
      render();
    };
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
    if (S.run && S.preview) { render(); return; }
    if (!myId()) { renderSetup(); return; }
    if (S.items && !S.preview) { render(); return; }
    if (S.run) { render(); return; }
    renderSetup();
    loadTemplate().then(function () { /* template warm; wait for Start */ }).catch(function (e) {
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

  global.AwakenCompanion = { state: S, render: render, startPreview: startPreview };
})(window);
