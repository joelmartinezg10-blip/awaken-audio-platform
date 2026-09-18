/* ============================================================
 * Awaken Audio - Service Companion  (Figma redesign, Sep 2026)
 *
 * The line check and soundcheck, on a phone, in a dark room,
 * one-handed, standing up. A run is a sequence of STAGES:
 *
 *   Prep (FOH or MONS) > Huddle > Line Check > Revisit Queue >
 *   System Ready > Rehearsal > Pre-Service
 *
 * Line check is one input at a time: a big Now card, Up Next, a
 * note per input, Flag & Delay / Skip / Confirm. Swipe right is
 * Confirm, swipe left is Flag. A Full list sheet jumps anywhere.
 *
 * ONE RUN PER PERSON PER SEAT PER DATE. FOH and MONS advance
 * independently. A shared live position (Mons <-> FOH sync) is
 * parked as its own project; nothing here assumes it is absent.
 *
 * COME BACK TO IT is the protocol, so a flag never stops the run -
 * except on inputs that carry blocks_run (tracks, click, cue,
 * drums). Flagging one of those shows RUN HELD. The engineer can
 * Re-test (Good) or, if they absolutely must move on, BYPASS: hold
 * the button for two seconds and give a reason. Bypassed inputs are
 * red in the Revisit Queue, on System Ready, and in the reflection.
 *
 * FIFTEEN MINUTES is a real budget. The clock starts on the first
 * line-check input, counts DOWN, and goes red and negative when over.
 *
 * States in item_states (jsonb, no schema change):
 *   ok | skipped | flagged | bypassed   + note, reason, at
 * A note may exist with no state yet (a note written before the
 * input was confirmed).
 *
 * Service days: WED and SUN buttons pick the upcoming date (today on
 * a service day). A finished run with no reflection for that date
 * puts a "reflection waiting" banner on Setup.
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
  function iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
      "-" + String(d.getDate()).padStart(2, "0");
  }
  function todayISO() { return iso(new Date()); }
  function parseISO(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  /* The next date that falls on weekday dow (0 = Sun, 3 = Wed); today counts. */
  function nextDow(dow) {
    var d = new Date(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7));
    return iso(d);
  }
  var DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function shortDate(s) { var d = parseISO(s); return DOW[d.getDay()].slice(0, 3) + " " + MON[d.getMonth()] + " " + d.getDate(); }
  function dayName(s) { return DOW[parseISO(s).getDay()]; }

  var LINE_CHECK_TARGET = 15 * 60;        /* seconds */
  var SWIPE_PX = 72;
  var HOLD_MS = 2000;

  var STAGE_LABEL = {
    prep: "Console prep", huddle: "Huddle", line_check: "Live line check",
    revisit: "Revisit queue", ready: "System ready", rehearsal: "Rehearsal",
    pre_service: "Pre-service"
  };
  var STAGE_TITLE = {
    prep: "Console prep", huddle: "Huddle", line_check: "Line check",
    revisit: "Revisit queue", ready: "System ready", rehearsal: "Rehearsal",
    pre_service: "Pre-service"
  };

  var S = {
    items: null,        /* the template, all 54, in sort order */
    run: null,          /* the row from service_companion_runs */
    seat: "foh",
    date: null,         /* chosen service date on Setup */
    stage: null,
    focusId: null,      /* current line-check input */
    revisitId: null,    /* input being re-checked from the queue */
    sheet: false,       /* full list open */
    preview: false,     /* in-memory pass; never writes */
    saveTimer: null,
    tick: null,
    dirty: false,
    saveMsg: "",
    saveBad: false
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

  /* Debounced: one write a second, not one per tap. */
  function save(now) {
    if (!S.run) return;
    if (S.preview) { S.dirty = false; setSave("Preview · not saved"); return; }
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
          setSave(r.error ? "Not saved · check connection" : "Saved", !!r.error);
        });
    };
    if (now) go(); else S.saveTimer = setTimeout(go, 900);
  }
  function setSave(msg, bad) {
    S.saveMsg = msg; S.saveBad = !!bad;
    var el = $("#cpSave"); if (el) { el.textContent = msg; el.className = "cpx-save" + (bad ? " bad" : ""); }
  }
  function setHint(msg, bad) {
    var el = $("#cpHint"); if (!el) return;
    el.textContent = msg || "";
    el.className = "cpx-hint" + (bad ? " bad" : "");
  }

  /* ---------- state helpers ---------- */

  function stateOf(item) {
    return (S.run && S.run.item_states && S.run.item_states[item.id]) || null;
  }
  function st(item) { var x = stateOf(item); return x && x.state ? x.state : null; }
  function noteOf(item) { var x = stateOf(item); return x ? (x.note || "") : ""; }
  function patchState(item, fields) {
    if (!S.run) return;
    if (!S.run.item_states) S.run.item_states = {};
    var cur = S.run.item_states[item.id] || {};
    var next = {};
    Object.keys(cur).forEach(function (k) { next[k] = cur[k]; });
    Object.keys(fields).forEach(function (k) { next[k] = fields[k]; });
    next.at = new Date().toISOString();
    if (!next.state && !next.note && !next.reason) delete S.run.item_states[item.id];
    else S.run.item_states[item.id] = next;
    if (item.phase === "line_check" && fields.state && !S.run.line_check_started_at) {
      S.run.line_check_started_at = new Date().toISOString();
      startTick();
    }
    save();
  }
  function setState(item, value) { patchState(item, { state: value || null }); }

  function visible(phase) {
    return (S.items || []).filter(function (i) {
      if (i.phase !== phase) return false;
      return i.seat_scope === "both" || i.seat_scope === S.seat;
    });
  }
  function lineInputs() {
    return visible("line_check").filter(function (i) { return !i.is_marker; });
  }
  function stages() {
    return ["prep", "huddle", "line_check", "revisit", "ready", "rehearsal", "pre_service"];
  }
  function stageItems(stage) {
    if (stage === "prep") return visible(S.seat === "foh" ? "foh_prep" : "mons_prep");
    if (stage === "huddle") return visible("huddle");
    if (stage === "rehearsal") return visible("rehearsal");
    if (stage === "pre_service") return visible("pre_service");
    return [];
  }
  /* Everything still owed a second look. */
  function revisitList() {
    return lineInputs().filter(function (i) {
      var s = st(i); return s === "flagged" || s === "bypassed";
    });
  }
  function revisitOpen() { return revisitList(); }
  function heldItem() {
    return lineInputs().filter(function (i) { return i.blocks_run && st(i) === "flagged"; })[0] || null;
  }
  function passed(item) {
    var s = st(item);
    if (s === "ok" || s === "skipped" || s === "bypassed") return true;
    if (s === "flagged" && !item.blocks_run) return true;
    return false;
  }
  function itemById(id) {
    return (S.items || []).filter(function (x) { return x.id === id; })[0] || null;
  }
  function stageDone(stage) {
    if (stage === "line_check") return lineInputs().every(passed);
    if (stage === "revisit") return stageDone("line_check") && !revisitOpen().length;
    if (stage === "ready") return !!S.run.line_check_ended_at;
    if (stage === "huddle" || stage === "rehearsal") {
      return stages().indexOf(S.stage) > stages().indexOf(stage);
    }
    var list = stageItems(stage).filter(function (i) { return !i.is_marker && !i.is_optional; });
    return list.length > 0 && list.every(function (i) { return st(i) === "ok" || st(i) === "skipped"; });
  }

  function focusItem() {
    var list = lineInputs();
    if (!list.length) return null;
    var h = heldItem(); if (h) return h;
    if (S.focusId) { var hit = itemById(S.focusId); if (hit && hit.phase === "line_check" && !hit.is_marker) return hit; }
    for (var i = 0; i < list.length; i++) if (!passed(list[i])) return list[i];
    return null;   /* every input walked */
  }
  function advanceFrom(item) {
    var list = lineInputs(), idx = list.indexOf(item), i;
    for (i = idx + 1; i < list.length; i++) if (!passed(list[i])) { S.focusId = list[i].id; return; }
    for (i = 0; i < idx; i++) if (!passed(list[i])) { S.focusId = list[i].id; return; }
    S.focusId = null;
    goStage("revisit");
  }
  function nextAfter(item) {
    var list = lineInputs(), idx = list.indexOf(item);
    for (var i = idx + 1; i < list.length; i++) if (!passed(list[i])) return list[i];
    return idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
  }

  /* ---------- the clock ---------- */

  function lineCheckSeconds() {
    if (!S.run || !S.run.line_check_started_at) return 0;
    var end = S.run.line_check_ended_at ? new Date(S.run.line_check_ended_at) : new Date();
    return Math.max(0, Math.round((end - new Date(S.run.line_check_started_at)) / 1000));
  }
  function mmss(s) {
    var neg = s < 0; s = Math.abs(s);
    return (neg ? "−" : "") + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  function startTick() { stopTick(); S.tick = setInterval(paintClock, 1000); paintClock(); }
  function stopTick() { if (S.tick) { clearInterval(S.tick); S.tick = null; } }
  function budgetHTML() {
    var started = S.run && S.run.line_check_started_at;
    var left = LINE_CHECK_TARGET - lineCheckSeconds();
    var cls = "cpx-budget" + (!started ? " idle" : (left < 0 ? " over" : ""));
    var lab = !started ? "Line check budget" : (left < 0 ? "Over budget" : "Budget remaining");
    var val = !started ? "15:00" : mmss(left);
    var sub = !started ? "Starts on the first input of line check"
      : (S.run.line_check_ended_at ? "Line check finished" : (left < 0 ? "Every minute over eats rehearsal" : "of 15:00"));
    return '<div class="' + cls + '" id="cpClock"><span>' + lab + "</span><b>" + val + "</b><small>" + sub + "</small></div>";
  }
  function paintClock() {
    var el = $("#cpClock"); if (!el) return;
    el.outerHTML = budgetHTML();
    if (S.run && S.run.line_check_ended_at) stopTick();
  }

  /* ---------- rendering ---------- */

  function seatName() { return S.seat === "foh" ? "FOH" : "MONS"; }
  function stageNo() { return stages().indexOf(S.stage) + 1; }

  function subLine() {
    var bits = [seatName(), shortDate(S.run.service_date)];
    if (S.stage === "line_check") {
      var list = lineInputs(), cur = focusItem();
      if (cur) bits.push("Input " + (list.indexOf(cur) + 1) + " of " + list.length);
    } else bits.push("Stage " + stageNo() + " of " + stages().length);
    return bits.join(" · ");
  }

  function headHTML(title) {
    var n = stages().length, done = stages().filter(stageDone).length;
    var pct = Math.round((Math.max(done, stageNo() - 1) / n) * 100);
    return '<div class="ph-only"><div class="cpx-top"><button type="button" class="cpx-exit" data-exit>&larr; Exit</button>' +
        '<span id="cpSave" class="cpx-save' + (S.saveBad ? " bad" : "") + '">' + esc(S.saveMsg) + "</span>" +
        '<span class="cpx-live"><i></i>Live</span></div></div>' +
      '<div><div class="cpx-titlerow"><h1 class="cpx-title">' + esc(title) + "</h1>" +
        (S.preview ? '<span class="cpx-tag preview">Preview · not saved</span>' : '<span class="cpx-tag">Live companion</span>') +
      '</div><p class="cpx-sub" style="margin-top:6px">' + esc(subLine()) + "</p></div>" +
      '<div class="ph-only"><div class="cpx-rule"></div>' +
        '<p class="cpx-prog"><span>Operation progress</span><b>' + stageNo() + "/" + n + " stages</b></p>" +
        '<div class="cpx-bar"><i style="width:' + pct + '%"></i></div></div>' +
      budgetHTML();
  }

  function sideHTML() {
    var list = stages(), n = list.length, rv = revisitOpen().length;
    return '<div class="sd-brand"><span>Awaken Audio</span><span class="cpx-live"><i></i>Live</span></div>' +
      '<div class="sd-camp">' + esc(seatName()) + " · " + esc(shortDate(S.run.service_date)) + "</div>" +
      '<div class="sd-stage"><p><span>Stage ' + stageNo() + " of " + n + "</span><span>" +
        Math.round(((stageNo() - 1) / n) * 100) + '% done</span></p><div class="sd-track">' +
        list.map(function (s, i) { return '<i class="' + (i < stageNo() - 1 || stageDone(s) ? "d" : "") + '"></i>'; }).join("") +
      '</div></div><nav class="sd-nav">' +
        list.map(function (s) {
          var cls = (s === S.stage ? "on" : "") + (stageDone(s) && s !== S.stage ? " done" : "");
          return '<button type="button" class="' + cls + '" data-stage="' + s + '"><i></i>' + esc(STAGE_LABEL[s]) +
            (s === "revisit" && rv ? "<em>" + rv + "</em>" : "") + "</button>";
        }).join("") +
      '</nav><div class="sd-foot">Line check<b>' + (S.run.line_check_started_at ? mmss(lineCheckSeconds()) + " used" : "Not started") + "</b>" +
      '<div style="margin-top:14px"><button type="button" class="cpx-exit" data-exit>Exit run</button></div></div>';
  }

  function checkItemHTML(i) {
    if (i.is_marker) {
      if (i.phase === "rehearsal") {
        return '<div class="cpx-info"><h3>' + esc(i.label) + "</h3><p>" + esc(i.detail) + "</p></div>" +
          '<div class="cpx-notes"><p class="cpx-lab">Rehearsal notes</p><textarea class="cpx-ta" id="cpNotes" rows="7" ' +
          'placeholder="Anything worth remembering from the run-through.">' + esc(S.run.notes || "") + "</textarea></div>";
      }
      return '<div class="cpx-info"><h3>' + esc(i.label) + "</h3><p>" + esc(i.detail) + "</p></div>";
    }
    var s = st(i);
    var tags = (i.is_critical ? '<span class="tg">critical</span>' : "") + (i.is_optional ? '<span class="tg opt">if any</span>' : "");
    return '<div class="cpx-item' + (s ? " " + s : "") + '" role="button" tabindex="0" data-tick="' + esc(i.id) + '">' +
      '<span class="cpx-box"></span><span style="flex:1;min-width:0"><b>' + esc(i.label) + tags + "</b>" +
      (i.detail ? "<small>" + esc(i.detail) + "</small>" : "") +
      (s === "flagged" && noteOf(i) ? '<small style="color:var(--cx-amber)">' + esc(noteOf(i)) + "</small>" : "") +
      '</span><button type="button" class="cpx-more" data-more="' + esc(i.id) + '" aria-label="Skip or flag">' +
      (s === "skipped" ? "Skip" : s === "flagged" ? "Flag" : "⋯") + "</button></div>";
  }

  function nowCardHTML(item, mode) {
    var s = st(item);
    var list = lineInputs(), idx = list.indexOf(item);
    var tags = "";
    if (item.blocks_run) tags += '<span class="cpx-pill hold">Holds the run</span>';
    else if (item.is_critical) tags += '<span class="cpx-pill">Critical</span>';
    if (item.is_optional) tags += '<span class="cpx-pill">If any</span>';
    if (s === "flagged") tags += '<span class="cpx-pill flag">Flagged</span>';
    if (s === "bypassed") tags += '<span class="cpx-pill byp">Bypassed</span>';
    if (s === "ok") tags += '<span class="cpx-pill ok">Good</span>';
    return '<div class="cpx-now' + (s ? " s-" + s : "") + '" data-id="' + esc(item.id) + '">' +
      '<div class="cpx-now-row"><span class="on">' + (mode === "revisit" ? "Revisiting" : "Now testing") + "</span>" +
        "<span>" + String(idx + 1).padStart(2, "0") + " / " + list.length + "</span></div>" +
      '<h2 class="cpx-now-name">' + esc(item.label) + "</h2>" +
      (item.detail ? '<p class="cpx-now-d">' + esc(item.detail) + "</p>" : "") +
      (tags ? '<div class="cpx-now-tags">' + tags + "</div>" : "") +
      (mode === "revisit" && stateOf(item) && stateOf(item).reason
        ? '<p class="cpx-now-d" style="color:var(--cx-red);margin-top:10px">Bypassed: ' + esc(stateOf(item).reason) + "</p>" : "") +
      (mode !== "revisit" ? '<div class="cpx-swipehint"><span>&larr; Flag</span><span>swipe</span><span>Good &rarr;</span></div>' : "") +
    "</div>";
  }

  function lineButtons(item) {
    return '<div class="row"><button type="button" class="cpx-btn amber" data-act="flagged">Flag &amp; delay<kbd>F</kbd></button>' +
      '<button type="button" class="cpx-btn" data-act="skipped">Skip<kbd>S</kbd></button></div>' +
      '<button type="button" class="cpx-go green" data-act="ok">Confirm signal OK<kbd>Space</kbd></button>';
  }

  function queueHTML() {
    var q = revisitList();
    return '<div class="cpx-queue"><p class="cpx-lab" style="display:flex;justify-content:space-between"><span>Flagged queue</span><span>' +
      q.length + " input" + (q.length === 1 ? "" : "s") + "</span></p>" +
      (q.length ? q.map(rvRow).join("") : '<p class="cpx-now-d">Nothing flagged yet.</p>') + "</div>";
  }
  function rvRow(i) {
    var s = st(i), list = lineInputs();
    var sub = s === "bypassed" ? "Bypassed · " + (stateOf(i).reason || "") : (noteOf(i) || "Flagged — no note");
    return '<button type="button" class="cpx-rv' + (s === "bypassed" ? " byp" : "") + '" data-revisit="' + esc(i.id) + '">' +
      '<span class="n">' + String(list.indexOf(i) + 1).padStart(2, "0") + "</span>" +
      '<span style="min-width:0"><b>' + esc(i.label) + "</b><small>" + esc(sub) + '</small></span><span class="ch">&rsaquo;</span></button>';
  }

  function renderLineCheck(ctx) {
    var held = heldItem();
    if (held) return renderHeld(ctx, held);
    var cur = focusItem();
    if (!cur) { goStage("revisit"); return renderStage(ctx); }
    S.focusId = cur.id;
    var nx = nextAfter(cur);
    ctx.title = "Line check";
    ctx.split = true;
    ctx.body =
      '<div class="cpx-col">' + nowCardHTML(cur) +
        '<div class="cpx-desk-controls">' + lineButtons(cur) + "</div></div>" +
      '<div class="cpx-col">' +
        '<div class="cpx-upnext">Up next &rarr; ' + (nx ? "<b>" + esc(nx.label) + "</b>" + (nx.detail ? "<small>(" + esc(nx.detail) + ")</small>" : "") : "<b>Revisit queue</b>") +
          '<button type="button" class="cpx-listbtn" data-sheet>Full list</button></div>' +
        '<div class="cpx-notes"><p class="cpx-lab">Notes · ' + esc(cur.label) + '</p><textarea class="cpx-ta" data-note="' + esc(cur.id) + '" rows="3" ' +
          'placeholder="Write down anything to come back to (EQ, comp, etc.)">' + esc(noteOf(cur)) + "</textarea></div>" +
        queueHTML() +
      "</div>";
    ctx.foot = lineButtons(cur);
  }

  function renderHeld(ctx, item) {
    var x = stateOf(item) || {};
    ctx.title = "Run held";
    ctx.body =
      '<div class="cpx-held" data-id="' + esc(item.id) + '"><div class="row1"><span class="on"><i></i>Critical blocker</span><span>Holds the run</span></div>' +
        "<h2>" + esc(item.label) + '</h2><p class="cpx-now-d">' + esc(item.detail || "") + "</p></div>" +
      '<div class="cpx-notes"><p class="cpx-lab">What is wrong / what is being done</p><textarea class="cpx-ta" data-note="' + esc(item.id) +
        '" rows="3" placeholder="e.g. No signal on snare top. Asked Mons to check the stagebox patch.">' + esc(x.note || "") + "</textarea></div>" +
      '<div class="cpx-notes"><p class="cpx-lab">Bypass reason (required to bypass)</p><textarea class="cpx-ta" id="cpReason" rows="2" ' +
        'placeholder="Why the run must move on without this input">' + esc(x.reason || "") + "</textarea></div>";
    ctx.foot =
      '<button type="button" class="cpx-btn red cpx-bypass" id="cpBypass"' + ((x.reason || "").trim() ? "" : " disabled") +
        '><span class="fill"></span><span>Hold 2s to bypass channel</span></button>' +
      '<button type="button" class="cpx-go green" data-unblock>Re-test &amp; unblock run</button>';
  }

  function renderRevisit(ctx) {
    var q = revisitList();
    if (S.revisitId) {
      var it = itemById(S.revisitId);
      if (it && q.indexOf(it) >= 0) {
        ctx.title = "Revisit";
        ctx.body = nowCardHTML(it, "revisit") +
          '<div class="cpx-notes"><p class="cpx-lab">Notes · ' + esc(it.label) + '</p><textarea class="cpx-ta" data-note="' + esc(it.id) +
          '" rows="3">' + esc(noteOf(it)) + "</textarea></div>";
        ctx.foot = '<div class="row"><button type="button" class="cpx-btn" data-rv-back>Back to queue</button>' +
          '<button type="button" class="cpx-btn amber" data-rv-keep>Still an issue</button></div>' +
          '<button type="button" class="cpx-go green" data-rv-ok>Confirm signal OK</button>';
        return;
      }
      S.revisitId = null;
    }
    ctx.title = "Revisit queue";
    ctx.body = '<div class="cpx-count"><span>Flagged inputs to re-sweep</span><b>' + q.length + " remaining</b></div>" +
      (q.length ? q.map(rvRow).join("") : '<p class="cpx-empty">Nothing flagged. Good line check.</p>');
    ctx.foot = q.length
      ? '<button type="button" class="cpx-go" data-rv-begin>Begin revisit cycle</button>' +
        '<button type="button" class="cpx-btn" data-stage="ready">Move on with ' + q.length + " open</button>"
      : '<button type="button" class="cpx-go" data-stage="ready">Continue to system ready</button>';
  }

  function renderReady(ctx) {
    if (S.run.line_check_started_at && !S.run.line_check_ended_at) {
      S.run.line_check_ended_at = new Date().toISOString(); save(); stopTick();
    }
    var list = lineInputs();
    var ok = list.filter(function (i) { return st(i) === "ok"; }).length;
    var sk = list.filter(function (i) { return st(i) === "skipped"; }).length;
    var fl = list.filter(function (i) { return st(i) === "flagged"; }).length;
    var by = list.filter(function (i) { return st(i) === "bypassed"; }).length;
    var clean = !fl && !by;
    var secs = lineCheckSeconds(), over = secs - LINE_CHECK_TARGET;
    var at = S.run.line_check_ended_at ? new Date(S.run.line_check_ended_at) : null;
    ctx.title = "System ready";
    ctx.body =
      '<div class="cpx-ready' + (clean ? "" : " warn") + '">' +
        '<svg viewBox="0 0 44 44" fill="none" stroke="' + (clean ? "#3DF58E" : "#F5A524") + '" stroke-width="2.5"><circle cx="22" cy="22" r="19"/>' +
        (clean ? '<path d="M14 22.5l5.5 5.5L30 17"/>' : '<path d="M22 13v12M22 30v1"/>') + "</svg>" +
        "<h2>" + (ok + sk) + " / " + list.length + " passed</h2>" +
        "<p>" + (clean ? "All inputs locked and cleared." : (fl + by) + " still open — carried into your reflection.") +
        (at ? "<br>Line check finalized at " + at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + "." : "") + "</p></div>" +
      '<div class="cpx-stats"><p class="cpx-lab">Line check summary</p>' +
        "<div><span>Time used</span><b" + (over > 0 ? ' class="r"' : ' class="g"') + ">" + (S.run.line_check_started_at ? mmss(secs) + " of 15:00" : "—") + "</b></div>" +
        (over > 0 ? '<div><span>Over budget</span><b class="r">' + mmss(over) + "</b></div>" : "") +
        '<div><span>Good</span><b class="g">' + ok + "</b></div>" +
        "<div><span>Skipped</span><b>" + sk + "</b></div>" +
        '<div><span>Still flagged</span><b class="a">' + fl + "</b></div>" +
        '<div><span>Bypassed</span><b class="r">' + by + "</b></div></div>" +
      (clean ? "" : revisitList().map(rvRow).join(""));
    ctx.foot = (clean ? "" : '<button type="button" class="cpx-btn" data-stage="revisit">Back to revisit queue</button>') +
      '<button type="button" class="cpx-go" data-stage="rehearsal">Commence rehearsal run</button>';
  }

  function renderChecklist(ctx) {
    var s = S.stage;
    ctx.title = s === "prep" ? (S.seat === "foh" ? "Console prep" : "Monitor prep") : STAGE_TITLE[s];
    ctx.body = stageItems(s).map(checkItemHTML).join("");
    var i = stages().indexOf(s), prev = stages()[i - 1], nextS = stages()[i + 1];
    var back = prev ? '<button type="button" class="cpx-btn" data-stage="' + prev + '">Back</button>' : '<button type="button" class="cpx-btn" data-exit>Exit</button>';
    var fwd;
    if (s === "pre_service") fwd = '<button type="button" class="cpx-go" id="cpFinish">Finish &amp; reflect</button>';
    else if (s === "huddle") fwd = '<button type="button" class="cpx-go" data-stage="line_check">Huddle done</button>';
    else if (s === "rehearsal") fwd = '<button type="button" class="cpx-go" data-stage="pre_service">Rehearsal done</button>';
    else fwd = '<button type="button" class="cpx-go" data-stage="' + nextS + '">Confirm prep</button>';
    ctx.foot = '<div class="row">' + back + fwd + "</div>";
  }

  function renderStage(ctx) {
    ctx.split = false;
    if (S.stage === "line_check") return renderLineCheck(ctx);
    if (S.stage === "revisit") return renderRevisit(ctx);
    if (S.stage === "ready") return renderReady(ctx);
    return renderChecklist(ctx);
  }

  function sheetHTML() {
    var cur = focusItem();
    return '<div class="cpx-sheet-in"><header><p class="cpx-lab" style="margin:0">Line check · ' + lineInputs().length + ' inputs</p>' +
      '<button type="button" class="cpx-exit" data-sheet-close>Close</button></header>' +
      lineInputs().map(function (i, n) {
        var s = st(i);
        return '<button type="button" class="cpx-li' + (cur && cur.id === i.id ? " cur" : "") + '" data-jump="' + esc(i.id) + '">' +
          '<i class="' + (s || "") + '"></i><span style="font-family:var(--mono);color:var(--cx-dim);font-size:12px">' +
          String(n + 1).padStart(2, "0") + "</span>" + esc(i.label) + (i.blocks_run ? ' <span class="cpx-pill hold" style="margin-left:auto">Holds</span>' : "") + "</button>";
      }).join("") + "</div>";
  }

  function goStage(s) {
    S.stage = s; S.revisitId = null; S.sheet = false;
    if (s === "line_check" && S.run && !S.run.line_check_ended_at && S.run.line_check_started_at) startTick();
  }

  function render() {
    var page = $("#p-companion"); if (!page) return;
    if (!S.run) { renderSetup(); return; }
    if (stages().indexOf(S.stage) < 0) S.stage = "prep";

    var ctx = { title: "", body: "", foot: "", split: false };
    renderStage(ctx);

    $("#cpSetup").hidden = true;
    $("#cpRun").hidden = false;
    document.body.classList.add("cpx-full");
    $("#cpHead").innerHTML = headHTML(ctx.title);
    $("#cpSide").innerHTML = sideHTML();
    var body = $("#cpBody");
    body.className = "cpx-body" + (ctx.split ? " split" : "");
    body.innerHTML = ctx.split ? ctx.body : '<div class="cpx-col">' + ctx.body + "</div>";
    $("#cpFoot").innerHTML = ctx.foot;
    var sh = $("#cpSheet");
    sh.hidden = !S.sheet;
    sh.innerHTML = S.sheet ? sheetHTML() : "";
  }

  /* ---------- setup ---------- */

  /* WED and SUN are the primary choices. Each shows its upcoming date;
     today wins on a service day. On any other day the sooner one is
     preselected. "Other date" keeps a picker for special services. */
  function defaultDate() {
    var w = nextDow(3), s = nextDow(0);
    return w < s ? w : s;
  }
  function paintDays() {
    var w = nextDow(3), s = nextDow(0), t = todayISO();
    if (!S.date) S.date = defaultDate();
    var custom = S.date !== w && S.date !== s;
    $("#cpDays").innerHTML = [["WED", w], ["SUN", s]].map(function (d) {
      return '<button type="button" class="cpx-day" data-day="' + d[1] + '" aria-pressed="' + (S.date === d[1]) + '">' +
        "<b>" + d[0] + "</b><small>" + esc(shortDate(d[1]).slice(4)) + "</small>" + (d[1] === t ? "<em>TODAY</em>" : "") + "</button>";
    }).join("");
    var di = $("#cpDate");
    if (custom) { di.hidden = false; di.value = S.date; }
  }
  function paintSeats() {
    Array.prototype.forEach.call(document.querySelectorAll("#cpSetup [data-seat]"), function (b) {
      b.setAttribute("aria-pressed", b.dataset.seat === S.seat ? "true" : "false");
    });
  }
  var lookupSeq = 0;
  /* Tell the engineer, before they tap, whether this is a fresh run or a
     pick-up. Starting again on the same date and seat resumes. */
  function paintStartLabel() {
    var btn = $("#cpStart"); if (!btn) return;
    btn.disabled = !myId();
    btn.textContent = "Start run";
    if (!myId() || !S.date) return;
    var seq = ++lookupSeq;
    findRun(S.date, S.seat).then(function (r) {
      if (seq !== lookupSeq || !r) return;
      btn.textContent = r.completed_at ? "Open finished run" : "Resume run";
    }).catch(function () {});
  }

  function renderSetup() {
    document.body.classList.remove("cpx-full");
    $("#cpRun").hidden = true;
    $("#cpSetup").hidden = false;
    paintDays(); paintSeats(); paintStartLabel();
    stopTick();
    checkReflectionOwed();
  }

  /* ---------- the reflection that is owed ---------- */

  function flagLines(items, states) {
    return items.filter(function (i) {
      var x = states[i.id]; return x && (x.state === "flagged" || x.state === "bypassed" || (x.note && i.phase === "line_check"));
    }).map(function (i) {
      var x = states[i.id], tag = x.state === "bypassed" ? " (BYPASSED" + (x.reason ? ": " + x.reason : "") + ")" :
        x.state === "flagged" ? " (flagged)" : "";
      return "- " + i.label + tag + (x.note ? ": " + x.note : "");
    });
  }
  function handoffFor(run) {
    var lines = flagLines(S.items || [], run.item_states || {});
    if (run.notes) lines.push("", "Rehearsal notes:", run.notes);
    try {
      sessionStorage.setItem("awaken.companion.handoff", JSON.stringify({
        date: run.service_date,
        label: run.service_label || (dayName(run.service_date) + " service"),
        seat: run.seat, flags: lines
      }));
    } catch (e) {}
  }

  var owedRun = null;
  /* A finished run in the last week with no reflection for its date. */
  function checkReflectionOwed() {
    var box = $("#cpReflect"); if (!box) return;
    var id = myId();
    if (!id) { box.hidden = true; return; }
    var since = new Date(); since.setDate(since.getDate() - 7);
    sb.from("service_companion_runs").select("*")
      .eq("profile_id", id).not("completed_at", "is", null).gte("service_date", iso(since))
      .order("service_date", { ascending: false }).limit(3)
      .then(function (r) {
        if (r.error || !r.data || !r.data.length) { box.hidden = true; return null; }
        var runs = r.data;
        return sb.from("reflections").select("served_on").eq("profile_id", id)
          .in("served_on", runs.map(function (x) { return x.service_date; }))
          .then(function (q) {
            if (q.error) { box.hidden = true; return; }
            var have = (q.data || []).map(function (x) { return x.served_on; });
            owedRun = runs.filter(function (x) { return have.indexOf(x.service_date) < 0; })[0] || null;
            if (!owedRun) { box.hidden = true; return; }
            var when = owedRun.service_date === todayISO() ? "Today's" : dayName(owedRun.service_date) + "'s";
            box.innerHTML = "<b>" + esc(when) + " reflection is waiting</b><p>Your " + (owedRun.seat === "foh" ? "FOH" : "Mons") +
              " run on " + esc(shortDate(owedRun.service_date)) + " is finished. Your line check notes are ready to drop in.</p>" +
              '<button type="button" class="cpx-go green" data-reflect>Write the reflection</button>';
            box.hidden = false;
          });
      }).catch(function () { box.hidden = true; });
  }
  function openOwedReflection() {
    if (!owedRun) return;
    var go = function () { handoffFor(owedRun); location.hash = "#/reflections"; };
    loadTemplate().then(go, go);
  }

  /* ---------- actions ---------- */

  function act(value) {
    var item = S.stage === "line_check" ? focusItem() : null;
    if (!item) return;
    if (value === "ok" || value === "skipped") { setState(item, value); advanceFrom(item); render(); return; }
    if (value === "flagged") {
      setState(item, "flagged");
      if (item.blocks_run) { render(); return; }       /* RUN HELD */
      advanceFrom(item); render();
    }
  }

  var holdTimer = null;
  function startHold(btn) {
    if (btn.disabled) return;
    btn.classList.add("holding");
    holdTimer = setTimeout(function () {
      holdTimer = null;
      var item = heldItem(); if (!item) return;
      var reason = ($("#cpReason").value || "").trim();
      if (!reason) return;
      patchState(item, { state: "bypassed", reason: reason });
      advanceFrom(item); render();
    }, HOLD_MS);
  }
  function cancelHold() {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    var b = $("#cpBypass"); if (b) b.classList.remove("holding");
  }

  function finish() {
    if (S.run.line_check_started_at && !S.run.line_check_ended_at) S.run.line_check_ended_at = new Date().toISOString();
    S.run.completed_at = new Date().toISOString();
    save(true); stopTick();
    if (S.preview) {
      var run = S.run;
      S.run = null; clearPreviewCache(); render();
      setHint("Preview finished — nothing was saved. On a real run this opens your reflection with " +
        flagLines(previewItems(), run.item_states || {}).length + " notes filled in.");
      return;
    }
    handoffFor(S.run);
    S.run = null; S.stage = null;
    document.body.classList.remove("cpx-full");
    location.hash = "#/reflections";
  }

  /* ---------- events ---------- */

  function typing(e) { var t = e.target; return t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT"); }

  function wire() {
    var page = $("#p-companion"); if (!page || page.__wired) return;
    page.__wired = true;

    page.addEventListener("click", function (e) {
      if (swallowClick) { swallowClick = false; e.preventDefault(); e.stopPropagation(); return; }
      var t = e.target, x;

      /* setup */
      if ((x = t.closest("[data-seat]"))) { S.seat = x.dataset.seat; paintSeats(); paintStartLabel(); return; }
      if ((x = t.closest("[data-day]"))) { S.date = x.dataset.day; $("#cpDate").hidden = true; paintDays(); paintStartLabel(); return; }
      if (t.id === "cpOtherBtn") { var di = $("#cpDate"); di.hidden = false; di.value = S.date || todayISO(); di.focus(); return; }
      if (t.closest("[data-preview]")) return startPreview();
      if (t.closest("[data-reflect]")) return openOwedReflection();
      if (t.id === "cpStart") return start();

      /* run */
      if (t.closest("[data-exit]")) { exitRun(); return; }
      if (t.id === "cpFinish") return finish();
      if ((x = t.closest("[data-stage]"))) { goStage(x.dataset.stage); render(); $("#cpBody").scrollTop = 0; return; }
      if (t.closest("[data-sheet]")) { S.sheet = true; render(); return; }
      if (t.closest("[data-sheet-close]") || t.id === "cpSheet") { S.sheet = false; render(); return; }
      if ((x = t.closest("[data-jump]"))) { S.focusId = x.dataset.jump; S.sheet = false; render(); return; }
      if ((x = t.closest("[data-act]"))) return act(x.dataset.act);
      if (t.closest("[data-unblock]")) { var h = heldItem(); if (h) { setState(h, "ok"); advanceFrom(h); render(); } return; }

      if ((x = t.closest("[data-more]"))) {
        var mi = itemById(x.dataset.more), ms = st(mi);
        /* cycles: none > skipped > flagged > none */
        setState(mi, ms === null || ms === "ok" ? "skipped" : ms === "skipped" ? "flagged" : null);
        render(); return;
      }
      if ((x = t.closest("[data-tick]"))) {
        var ti = itemById(x.dataset.tick);
        setState(ti, st(ti) === "ok" ? null : "ok"); render(); return;
      }

      if ((x = t.closest("[data-revisit]"))) { S.stage = "revisit"; S.revisitId = x.dataset.revisit; render(); return; }
      if (t.closest("[data-rv-begin]")) { var q = revisitList(); S.revisitId = q.length ? q[0].id : null; render(); return; }
      if (t.closest("[data-rv-back]")) { S.revisitId = null; render(); return; }
      if (t.closest("[data-rv-ok]") || t.closest("[data-rv-keep]")) {
        var ri = itemById(S.revisitId);
        if (t.closest("[data-rv-ok]")) patchState(ri, { state: "ok" });
        var rest = revisitList(), pos = rest.indexOf(ri);
        var nxt = rest[pos + 1] || rest.filter(function (i) { return i !== ri; })[0] || null;
        S.revisitId = nxt ? nxt.id : null;
        render(); return;
      }
    });

    page.addEventListener("change", function (e) {
      if (e.target.id === "cpDate" && e.target.value) { S.date = e.target.value; paintDays(); paintStartLabel(); }
    });

    page.addEventListener("input", function (e) {
      if (e.target.id === "cpNotes") { S.run.notes = e.target.value; save(); return; }
      if (e.target.id === "cpReason") {
        var h = heldItem(); if (h) patchState(h, { reason: e.target.value });
        var b = $("#cpBypass"); if (b) b.disabled = !e.target.value.trim();
        return;
      }
      var n = e.target.getAttribute && e.target.getAttribute("data-note");
      if (n) patchState(itemById(n), { note: e.target.value });
    });

    page.addEventListener("pointerdown", function (e) { var b = e.target.closest && e.target.closest("#cpBypass"); if (b) startHold(b); });
    ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) {
      page.addEventListener(ev, function (e) { if (holdTimer && (ev !== "pointerleave" || e.target.id === "cpBypass")) cancelHold(); }, true);
    });

    document.addEventListener("keydown", function (e) {
      if (!S.run || !onCompanion() || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (S.stage !== "line_check" || heldItem()) return;
      var k = e.key.toLowerCase();
      if (k === " ") { e.preventDefault(); act("ok"); }
      else if (k === "f") act("flagged");
      else if (k === "s") act("skipped");
    });

    wireSwipe(page);
  }

  function wireSwipe(page) {
    var sw = { on: false, x0: 0, y0: 0, dx: 0, axis: null, card: null };
    function reset(c) { if (c) { c.style.transform = ""; c.classList.remove("swipe-ok", "swipe-flag", "swiping"); } }
    page.addEventListener("pointerdown", function (e) {
      if (!S.run || S.stage !== "line_check" || heldItem()) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      var c = e.target.closest && e.target.closest(".cpx-now");
      if (!c || e.target.closest("button,textarea,a,input")) return;
      sw.on = true; sw.x0 = e.clientX; sw.y0 = e.clientY; sw.dx = 0; sw.axis = null; sw.card = c;
    });
    page.addEventListener("pointermove", function (e) {
      if (!sw.on) return;
      var dx = e.clientX - sw.x0, dy = e.clientY - sw.y0;
      if (!sw.axis) {
        if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
        sw.axis = Math.abs(dx) > Math.abs(dy) * 1.15 ? "x" : "y";
        if (sw.axis === "y") { sw.on = false; reset(sw.card); return; }
        sw.card.classList.add("swiping");
      }
      if (e.cancelable) e.preventDefault();
      sw.dx = dx;
      var xx = Math.max(-160, Math.min(160, dx));
      sw.card.style.transform = "translateX(" + xx + "px)";
      sw.card.classList.toggle("swipe-ok", xx > 36);
      sw.card.classList.toggle("swipe-flag", xx < -36);
    }, { passive: false });
    function end() {
      if (!sw.on) return;
      sw.on = false; reset(sw.card);
      if (Math.abs(sw.dx) < SWIPE_PX) return;
      swallowClick = true;
      act(sw.dx > 0 ? "ok" : "flagged");
    }
    page.addEventListener("pointerup", end);
    page.addEventListener("pointercancel", end);
  }

  function exitRun() {
    if (S.dirty) save(true);
    var was = S.preview;
    S.run = null; S.stage = null; S.sheet = false;
    if (was) clearPreviewCache();
    render();
  }

  function clearPreviewCache() {
    if (S.items && S.items[0] && S.items[0].template_id === "preview") S.items = null;
    S.preview = false; S.focusId = null;
  }

  /* Pick up where the run left off: the first stage that is not done. */
  function resumeStage() {
    var list = stages();
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (s === "huddle" || s === "rehearsal") continue;
      if (s === "ready") { if (!S.run.line_check_ended_at) return "ready"; continue; }
      if (!stageDone(s)) {
        if (s === "prep" && S.run.line_check_started_at) continue;
        return s;
      }
    }
    return "pre_service";
  }

  function start() {
    if (!myId()) { setHint("Sign in first", true); return; }
    clearPreviewCache();
    var date = S.date || todayISO();
    setHint("Starting…");
    loadTemplate()
      .then(function () { return findRun(date, S.seat); })
      .then(function (r) { return r || createRun(date, S.seat, dayName(date) + " service"); })
      .then(function (r) {
        S.run = r; S.focusId = null; S.stage = null; S.saveMsg = ""; S.saveBad = false;
        S.stage = r.line_check_started_at || Object.keys(r.item_states || {}).length ? resumeStage() : "prep";
        if (r.line_check_started_at && !r.line_check_ended_at) startTick();
        setHint("");
        render();
      })
      .catch(function (err) { setHint(err && err.message ? err.message : "Could not start", true); });
  }

  function startPreview() {
    S.preview = true;
    S.items = previewItems();
    S.focusId = null;
    S.run = {
      id: "preview", seat: S.seat, service_date: S.date || todayISO(),
      service_label: "Preview pass", item_states: {}, notes: "",
      line_check_started_at: null, line_check_ended_at: null, completed_at: null
    };
    S.stage = "prep"; S.saveMsg = "Preview · not saved";
    setHint("");
    render();
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

  /* Supabase restores the session asynchronously; only fetch once there
     is a signed-in identity, and let onChange bring us back. */
  function ensureLoaded() {
    if (!onCompanion()) { document.body.classList.remove("cpx-full"); return; }
    wire();
    if (S.run) { render(); return; }
    renderSetup();
    if (myId() && !S.items) loadTemplate().catch(function (e) {
      setHint("Could not load the checklist: " + (e.message || e), true);
    });
  }

  function onRoute() {
    ensureLoaded();
    if (location.hash.replace(/^#/, "").split(/[#?&]/)[0] === "/reflections")
      setTimeout(handoffToReflection, 60);
  }

  function init() {
    wire();
    window.addEventListener("hashchange", onRoute);
    if (D.onChange) D.onChange(function () { if (onCompanion() && !S.run) renderSetup(); else ensureLoaded(); });
    onRoute();
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();

  global.AwakenCompanion = { state: S, render: render, startPreview: startPreview };
})(window);
