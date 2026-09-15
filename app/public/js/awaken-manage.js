/* ============================================================
 * Awaken Audio — Manage, and the Campus Performance Overview
 *
 * Two screens, both of which live as tabs inside the admin page so
 * the trainer dashboard that already worked is untouched.
 *
 * Nothing in this file decides who may see or do anything. Every
 * read is a plain call that RLS scopes, and every write will simply
 * fail if the database disagrees — which is the point. A check here
 * would be a check an attacker can skip by calling the API directly,
 * so the UI only ever hides controls that would fail anyway.
 * ============================================================ */
(function (global) {
  "use strict";
  var D = global.AwakenData;
  if (!D) return;

  var $  = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function ago(ts) {
    if (!ts) return "never";
    var d = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (d < 90) return "just now";
    if (d < 5400) return Math.round(d / 60) + "m ago";
    if (d < 172800) return Math.round(d / 3600) + "h ago";
    return Math.round(d / 86400) + "d ago";
  }
  function pill(status) {
    var m = { complete: ["ok", "Complete"], in_progress: ["mid", "In progress"] };
    var v = m[status] || ["no", "Not started"];
    return '<span class="pillst ' + v[0] + '">' + v[1] + "</span>";
  }
  function roleTag(row) {
    if (row.is_director) return '<span class="tagrole dir">Director</span>';
    if (row.role === "super_admin") return '<span class="tagrole super">Master</span>';
    if (row.role === "admin") return '<span class="tagrole admin">Trainer</span>';
    return '<span class="tagrole">Engineer</span>';
  }

  var state = { campuses: [], directorCampus: null, roster: [], scope: null, tab: "team" };
  /* Reflections are journal entries since 15 Sep 2026: what a trainer
     wants to see is the service it was written about, not when the text
     was last touched. Falls back for rows written before the change. */
  function servedLabel(r) {
    if (!r.served_on) return ago(r.updated_at);
    var p = String(r.served_on).split("-");
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    var txt = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return r.service_label ? txt + " \u00b7 " + r.service_label : txt;
  }


  /* ---------- who is looking, and therefore which tabs exist ---------- */
  function refreshTabs() {
    var isSuper = D.isSuperAdmin();
    var isDir   = !!state.directorCampus;
    var cTab = $('#adTabs [data-adtab="campus"]');
    var mTab = $('#adTabs [data-adtab="manage"]');
    if (cTab) cTab.hidden = !(isSuper || isDir);
    if (mTab) mTab.hidden = !isSuper;
  }

  function showTab(name) {
    state.tab = name;
    $$("#adTabs button").forEach(function (b) {
      b.setAttribute("aria-selected", String(b.dataset.adtab === name));
    });
    var team = $("#adRoster"), det = $("#adDetail"),
        camp = $("#adCampus"), man = $("#adManage");
    if (team) team.hidden = (name !== "team");
    if (det)  det.hidden  = true;
    if (camp) camp.hidden = (name !== "campus");
    if (man)  man.hidden  = (name !== "manage");
    if (name === "team")   renderPeers();
    if (name === "campus") renderCampus();
    if (name === "manage") renderManage();
  }

  /* ------------------------------------------------------------
   * Campus peers, under the trainer's own roster.
   *
   * Progress only. Reflection text is governed by a separate rule in
   * the database and is not fetched here at all — which is why this
   * list has no reflection column rather than an empty one, and why
   * the heading says so out loud.
   * ------------------------------------------------------------ */
  function renderPeers() {
    var wrap = $("#adPeersWrap");
    if (!wrap) return;
    var me = D.getCurrentUser();
    var campus = me && me.campus;
    if (!campus || D.isSuperAdmin()) { wrap.hidden = true; return; }

    D.getRoster(campus).then(function (rows) {
      var peers = rows.filter(function (r) {
        return r.role === "user" && r.trainer_id !== me.id;
      });
      wrap.hidden = !peers.length;
      if (!peers.length) return;
      $("#adPeers").innerHTML = peers.map(function (r) {
        return '<div class="userrow" style="cursor:default">' +
          '<span class="un">' + esc(r.full_name || "Unnamed") +
            "<small>" + esc(r.email) + "</small></span>" +
          '<span class="pcell"><span class="pbar" style="flex:1"><i style="width:' +
            (r.percent || 0) + '%"></i></span><b>' + (r.percent || 0) + "%</b></span>" +
          '<span class="ct">' + esc(r.trainer_name || "No trainer yet") + "</span>" +
          '<span class="ct">' + ago(r.last_active_at) + "</span>" +
          "<span>" + pill(r.status) + "</span></div>";
      }).join("");
    });
  }

  /* ============================================================
   * CAMPUS PERFORMANCE OVERVIEW
   * ============================================================ */
  function campusName(slug) {
    var c = state.campuses.filter(function (x) { return x.slug === slug; })[0];
    return c ? c.name : slug || "All campuses";
  }

  function renderCampus() {
    var slug = state.scope;
    $("#adCampusName").textContent = slug ? campusName(slug) : "Every campus";
    $("#adCampusWho").textContent  = D.isSuperAdmin() ? "Master Admin" : "Campus Production Director";

    /* the master admin picks a campus; a director has exactly one */
    var wrap = $("#adCampusPickWrap");
    if (wrap) wrap.hidden = !D.isSuperAdmin();

    D.getRoster(slug).then(function (rows) {
      var eng = rows.filter(function (r) { return r.role === "user"; });
      var tr  = rows.filter(function (r) { return r.role === "admin"; });
      var refl = rows.reduce(function (a, r) { return a + (r.reflections || 0); }, 0);
      var avg = eng.length
        ? Math.round(eng.reduce(function (a, r) { return a + (r.percent || 0); }, 0) / eng.length) : 0;
      $("#cpEng").textContent      = eng.length;
      $("#cpTrainers").textContent = tr.length;
      $("#cpAvg").innerHTML        = avg + "<small>%</small>";
      $("#cpRefl").textContent     = refl;

      $("#cpPeople").innerHTML = rows.length ? rows.map(function (r) {
        return '<div class="userrow" style="cursor:default">' +
          '<span class="un">' + esc(r.full_name || "Unnamed") + " " + roleTag(r) +
            "<small>" + esc(r.email) + "</small></span>" +
          '<span class="pcell"><span class="pbar" style="flex:1"><i style="width:' +
            (r.percent || 0) + '%"></i></span><b>' + (r.percent || 0) + "%</b></span>" +
          '<span class="ct">' + esc(r.trainer_name || "—") + "</span>" +
          '<span class="ct">' + ago(r.last_active_at) + "</span>" +
          "<span>" + pill(r.status) + "</span></div>";
      }).join("") : '<div class="emptynote">Nobody at this campus yet.</div>';
    });

    D.getCampusTopicStats(slug).then(function (rows) {
      $("#cpTopics").innerHTML = rows.length ? rows.map(function (t) {
        var n = Math.max(1, t.engineers);
        var w = function (v) { return (v / n * 100).toFixed(1) + "%"; };
        return '<div class="topicrow" style="cursor:default">' +
          '<span class="tn">' + esc(t.topic_title) + "</span>" +
          '<span class="fwcell"><span class="cpbar">' +
            '<i class="ok" style="width:' + w(t.complete) + '"></i>' +
            '<i class="mid" style="width:' + w(t.in_progress) + '"></i>' +
            '<i class="no" style="width:' + w(t.not_started) + '"></i>' +
          "</span></span>" +
          '<span style="font-family:var(--mono);font-size:12px;color:var(--dim)">' +
            t.avg_percent + "%</span>" +
          '<span class="r" style="font-family:var(--mono);font-size:12px;color:var(--dim)">' +
            t.complete + " / " + t.engineers + "</span></div>";
      }).join("") : '<div class="emptynote">No progress recorded here yet.</div>';
    });

    D.getCampusArcade(slug).then(function (rows) {
      $("#cpArcade").innerHTML = rows.length ? rows.map(function (a) {
        return '<div class="topicrow" style="cursor:default">' +
          '<span class="tn">' + esc(a.title) + "</span>" +
          '<span style="font-family:var(--mono);font-size:12px;color:var(--dim)">' +
            a.players + " playing &middot; " + a.attempts + " runs</span>" +
          '<span style="font-family:var(--mono);font-size:12px;color:var(--white)">' +
            a.best_score + "</span>" +
          '<span class="r" style="font-family:var(--mono);font-size:12px;color:var(--dim)">' +
            a.avg_accuracy + "%</span></div>";
      }).join("") : '<div class="emptynote">No cabinet runs from this campus yet.</div>';
    });

    D.getCampusReflections(slug, 25).then(function (rows) {
      $("#cpRefls").innerHTML = rows.length ? rows.map(function (r) {
        return '<div class="reflcard"><div class="rh">' + esc(r.full_name) +
          " &middot; " + esc(r.topic_title) + " &middot; " +
          esc(servedLabel(r)) + "</div>" +
          (r.went_well  ? '<div class="rq"><b>Went well.</b> ' + esc(r.went_well) + "</div>" : "") +
          (r.needs_work ? '<div class="rq"><b>Needs work.</b> ' + esc(r.needs_work) + "</div>" : "") +
          (r.next_rep   ? '<div class="rq"><b>Next rep.</b> ' + esc(r.next_rep) + "</div>" : "") +
          "</div>";
      }).join("") : '<div class="emptynote">No reflections written yet.</div>';
    });

    D.getCampusDirectors().then(function (rows) {
      var mine = slug ? rows.filter(function (d) { return d.campus_slug === slug; }) : rows;
      $("#cpLeads").innerHTML = mine.length
        ? "Led by " + mine.map(function (d) { return "<b>" + esc(d.full_name || d.email) + "</b>"; }).join(" and ")
        : "No Campus Production Director set for this campus yet.";
    });
  }

  /* ============================================================
   * MANAGE  (master admin only)
   * ============================================================ */
  function trainerOptions(rows, selected) {
    var trainers = rows.filter(function (r) { return r.role === "admin" || r.role === "super_admin"; });
    return '<option value="">No trainer</option>' + trainers.map(function (t) {
      return '<option value="' + esc(t.profile_id) + '"' +
        (t.profile_id === selected ? " selected" : "") + ">" +
        esc(t.full_name || t.email) + "</option>";
    }).join("");
  }

  function campusOptions(selected, allLabel) {
    return '<option value="">' + (allLabel || "No campus") + "</option>" +
      state.campuses.map(function (c) {
        return '<option value="' + esc(c.slug) + '"' +
          (c.slug === selected ? " selected" : "") + ">" + esc(c.name) + "</option>";
      }).join("");
  }

  function renderManage() {
    var q      = ($("#mgSearch") ? $("#mgSearch").value : "").trim().toLowerCase();
    var campus = $("#mgCampus") ? $("#mgCampus").value : "";
    var filter = $("#mgFilter") ? $("#mgFilter").value : "all";

    D.getRoster(campus || null).then(function (rows) {
      state.roster = rows;
      var view = rows.filter(function (r) {
        if (q && (esc(r.full_name) + " " + r.email).toLowerCase().indexOf(q) < 0) return false;
        if (filter === "unassigned") return r.role === "user" && !r.trainer_id;
        if (filter === "nocampus")   return !r.campus;
        if (filter === "trainers")   return r.role === "admin" || r.role === "super_admin";
        return true;
      });
      $("#mgCount").textContent = view.length + " of " + rows.length;

      $("#mgList").innerHTML = view.length ? view.map(function (r) {
        var locked = r.role === "super_admin";
        return '<div class="mgrow" data-id="' + esc(r.profile_id) + '">' +
          '<div class="mn">' + esc(r.full_name || "Unnamed") + " " + roleTag(r) +
            "<small>" + esc(r.email) + " &middot; " + (r.percent || 0) + "% &middot; " +
            ago(r.last_active_at) + "</small></div>" +
          '<div><span class="sl">Campus</span><div class="sel">' +
            '<select data-act="campus" aria-label="Campus for ' + esc(r.full_name || r.email) + '"' +
            (locked ? " disabled" : "") + ">" +
            campusOptions(r.campus) + "</select></div></div>" +
          '<div><span class="sl">Trainer</span><div class="sel">' +
            '<select data-act="trainer" aria-label="Trainer for ' + esc(r.full_name || r.email) + '"' +
            (r.role !== "user" || locked ? " disabled" : "") + ">" +
            trainerOptions(state.roster, r.trainer_id) + "</select></div></div>" +
          '<div><span class="sl">Role</span><div class="sel">' +
            '<select data-act="role" aria-label="Role for ' + esc(r.full_name || r.email) + '"' +
            (locked ? " disabled" : "") + ">" +
            '<option value="user"' + (r.role === "user" ? " selected" : "") + ">Engineer</option>" +
            '<option value="admin"' + (r.role === "admin" ? " selected" : "") + ">Trainer</option>" +
          "</select></div></div></div>";
      }).join("") : '<div class="emptynote">Nobody matches that.</div>';

      $$("#mgList .mgrow select").forEach(function (sel) {
        sel.onchange = function () {
          var row = sel.closest(".mgrow");
          var id  = row.dataset.id;
          var who = (row.querySelector(".mn") ? row.querySelector(".mn").firstChild.nodeValue : "").trim();
          var act = sel.dataset.act, val = sel.value;
          var what = act === "campus" ? "Campus" : act === "role" ? "Role" : "Trainer";
          var p;
          if (act === "campus")  p = D.setMemberCampus(id, val || null);
          else if (act === "role") p = D.setMemberRole(id, val);
          else p = val ? D.assignMember(id, val) : D.unassignMember(id);
          sel.disabled = true;
          p.then(function () { toast(what + " saved" + (who ? " for " + who : "")); renderManage(); })
           .catch(function (e) {
             sel.disabled = false;
             global.alert("That change was refused by the database:\n\n" +
               (e && e.message ? e.message : "insufficient privilege"));
             renderManage();
           });
        };
      });
    });

    renderDirectors();
  }

  /* Every dropdown writes on change with no Save button, which is right -
     but a successful save looked like almost nothing, so "saved" and "my
     click did not register" were indistinguishable. Two lines of feedback
     removes a whole category of doubt from every director handed this. */
  var toastTimer = null;
  function toast(msg) {
    var el = $("#mgToast");
    if (!el) return;
    el.textContent = "\u2713 " + msg;
    el.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("on"); }, 2600);
  }

  function renderDirectors() {
    Promise.all([D.getCampusDirectors(), D.getRoster(null)]).then(function (res) {
      var dirs = res[0], all = res[1];
      /* Anyone at the campus may be seated, not only Trainers. Directorship
         is a relationship, not a rung on a ladder - requiring a promotion
         first was this list's invention, never the database's rule.
         Day 2, 15 Sep 2026. */
      var eligible = all.slice();
      $("#mgDirectors").innerHTML = state.campuses.map(function (c) {
        var here = dirs.filter(function (d) { return d.campus_slug === c.slug; });
        var cells = [1, 2].map(function (slot) {
          var held = here.filter(function (d) { return d.slot === slot; })[0];
          var opts = '<option value="">Empty</option>' + eligible.map(function (t) {
            return '<option value="' + esc(t.profile_id) + '"' +
              (held && held.profile_id === t.profile_id ? " selected" : "") + ">" +
              esc(t.full_name || t.email) + "</option>";
          }).join("");
          return '<div class="sel"><select data-campus="' + esc(c.slug) +
            '" data-slot="' + slot + '">' + opts + "</select></div>";
        }).join("");
        return '<div class="mgrow"><div class="mn">' + esc(c.name) +
          "<small>" + esc(c.region) + "</small></div>" + cells +
          '<div class="lbl">' + here.length + " / 2</div></div>";
      }).join("");

      $$("#mgDirectors select").forEach(function (sel) {
        sel.onchange = function () {
          var c = sel.dataset.campus, slot = +sel.dataset.slot, id = sel.value;
          var p = id ? D.setCampusDirector(c, slot, id) : D.clearCampusDirector(c, slot);
          sel.disabled = true;
          p.then(renderDirectors).catch(function (e) {
            sel.disabled = false;
            global.alert("That change was refused by the database:\n\n" +
              (e && e.message ? e.message : "insufficient privilege"));
            renderDirectors();
          });
        };
      });
    });
  }

  /* ============================================================
   * wiring
   * ============================================================ */
  function boot() {
    if (!$("#adTabs")) return;

    $$("#adTabs button").forEach(function (b) {
      b.onclick = function () { showTab(b.dataset.adtab); };
    });
    ["#mgSearch", "#mgCampus", "#mgFilter"].forEach(function (s) {
      var el = $(s); if (el) el.oninput = el.onchange = renderManage;
    });
    var rf = $("#mgRefresh"); if (rf) rf.onclick = renderManage;

    Promise.all([D.getCampuses(), D.getDirectorCampus()]).then(function (res) {
      state.campuses = res[0] || [];
      state.directorCampus = res[1];
      state.scope = D.isSuperAdmin() ? null : state.directorCampus;

      var mc = $("#mgCampus");
      if (mc) mc.innerHTML = campusOptions("", "All campuses");
      var cp = $("#adCampusPick");
      if (cp) {
        cp.innerHTML = campusOptions("", "All campuses");
        cp.onchange = function () { state.scope = cp.value || null; renderCampus(); };
      }
      refreshTabs();
      renderPeers();
    });
  }

  /* the dashboard is rendered by awaken-app.js on route change; this
     only has to re-assert which tab is showing after that happens */
  global.addEventListener("hashchange", function () {
    setTimeout(function () {
      if (location.hash.indexOf("/admin") >= 0) { refreshTabs(); showTab(state.tab || "team"); }
    }, 120);
  });

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();

  D.onChange(function () { refreshTabs(); });

  global.AwakenManage = { showTab: showTab, refresh: renderManage };
})(window);
