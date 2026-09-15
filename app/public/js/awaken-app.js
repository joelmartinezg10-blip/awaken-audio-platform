/* ============================================================
 * Awaken Audio — accounts, dashboards and route protection.
 * Talks only to AwakenData. No Supabase calls live in this file.
 * ============================================================ */
(function () {
  "use strict";
  var D = window.AwakenData;
  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  var PROTECTED = { "/dashboard": 1, "/admin": 1, "/profile": 1, "/reflections": 1, "/welcome": 1 };
  var ADMIN_ONLY = { "/admin": 1 };

  /* ---------- small formatters ---------- */
  var LABEL = { complete: "Complete", in_progress: "In progress", not_started: "Not started" };
  function pill(st) { return '<span class="pill ' + st + '">' + LABEL[st] + "</span>"; }
  /* The Academy Framework, as a progress strip.
     Apply is deliberately not a progress dot: this platform has no honest
     way to know somebody ran a Sunday, and a hollow circle that can never
     fill reads as a bug rather than as a step we do not track. */
  function fwbar(t) {
    var steps = [
      ["Learn",    t.learn_status],
      ["Listen",   t.listen_status],
      ["Practice", t.arcade_status],
      ["Apply",    "room"],
      ["Reflect",  t.reflect_status]
    ];
    var first = true, out = [];
    for (var i = 0; i < steps.length; i++) {
      var name = steps[i][0], st = steps[i][1];
      if (st === undefined || st === null) continue;     // topic has no such step
      var cls;
      if (st === "room") cls = "room";
      else if (st === "complete") cls = "done";
      else if (st === "in_progress") cls = "now";
      else cls = "";
      if (i) out.push('<span class="sep"></span>');
      out.push('<span class="s ' + cls + '"><i></i>' + name + "</span>");
    }
    return '<div class="fwbar">' + out.join("") + "</div>";
  }

  function mk(label, st) {
    return '<span class="mk ' + (st || "not_started") + '"><b>' + label + "</b>" +
           (st === "complete" ? "Complete" : st === "in_progress" ? "In progress" : "&mdash;") + "</span>";
  }
  function ago(ts) {
    if (!ts) return "Never";
    var s = (Date.now() - new Date(ts).getTime()) / 1000;
    if (s < 90) return "Just now";
    if (s < 3600) return Math.round(s / 60) + " min ago";
    if (s < 86400) return Math.round(s / 3600) + "h ago";
    if (s < 86400 * 7) return Math.round(s / 86400) + "d ago";
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  /* Which page in the app a topic's work actually lives on. */
  function topicHref() { return "#/arcade"; }

  /* ============================================================
   * HEADER — account chip + conditional nav
   * ============================================================ */
  function paintHeader() {
    // Key off the SESSION, not the profile row. The profile is a second
    // round trip; if it is slow or fails, a signed-in user must still see
    // themselves as signed in rather than being shown a "Log in" button.
    var inSession = D.isSignedIn();
    var p = D.getCurrentUser();
    $$("[data-auth=in]").forEach(function (el)  { el.hidden = !inSession; });
    $$("[data-auth=out]").forEach(function (el) { el.hidden = !!inSession; });
    $$("[data-auth=admin]").forEach(function (el) { el.hidden = !D.isAdmin(); });
    var nm = $("#acctName");
    if (nm) nm.textContent = p
      ? (p.full_name || p.email || "").split(" ")[0]
      : "\u2026";
    var rc = $("#acctRole");
    if (rc) {
      rc.hidden = !D.isAdmin();
      rc.textContent = D.isSuperAdmin() ? "Master Admin"
                     : (D.isDirector && D.isDirector()) ? "Campus Director"
                     : "Trainer";
    }
    /* the avatar and the menu are painted by awaken-profile.js, which
       owns everything that depends on the profile row rather than the
       session — keeping this function about the session alone */
    if (window.AwakenProfile) try { window.AwakenProfile.paint(); } catch (e) {}
  }

  /* ============================================================
   * AUTH SCREEN
   * ============================================================ */
  var mode = "signin";
  /* Day 3, 15 Sep 2026: this used to be the ONLY recovery check, and it
     never fired. awaken-data.js loads first and creating the Supabase
     client consumes the URL fragment carrying type=recovery, so by the
     time this line ran there was nothing left to match. The reset link
     therefore signed people straight in and dropped them on the
     dashboard with their OLD password still valid - the one they could
     not remember. The authoritative signal is the PASSWORD_RECOVERY
     event, which awaken-data.js now records; the URL test stays as a
     belt-and-braces check for the older link format. */
  /* A recovery form is only honest if there is a session behind it. Reset
     tokens are single use and expire, so an old link in an inbox lands here
     with nothing attached - and offering "Set new password" to somebody the
     server will refuse is the worst of both: they type a password, get
     "Auth session missing!", and have no idea they need a fresh link. */
  /* A route never contains "#", "?" or "&". Anything after one is a
     provider's leftovers, and treating the whole string as the route is
     how a reset link ends up rendering the home page instead. */
  function routeOf() {
    return (location.hash.replace(/^#/, "").split(/[#?&]/)[0]) || "/";
  }

  /* ============================================================
   * FIRST RUN
   *
   * Asked once, answered in one tap, and only of an engineer who has
   * never answered it. Skipping is a real answer - it is remembered per
   * device so nobody is asked twice - and it costs them nothing, because
   * the answer only chooses a starting point. Nothing is ever locked.
   * ============================================================ */
  var WELCOME_SKIPPED = "awaken.welcome.skipped";
  function skippedWelcome() {
    try { return localStorage.getItem(WELCOME_SKIPPED) === "1"; } catch (e) { return false; }
  }
  function needsWelcome() {
    var p = D.getCurrentUser();
    return !!(p && p.role === "user" && !p.experience && !skippedWelcome());
  }

  /* The point of the whole screen: the next thing that happens is a SOUND.
     Beginners get the EQ A/B lab, where a boost appears and disappears on a
     stem from their own stage. Everyone else gets Frequency Frenzy - the
     same question asked as a challenge rather than a demonstration. It is
     scored and objective: you either heard 250 Hz or you did not, which is
     the one kind of first impression an experienced engineer cannot argue
     with. Each hands off to a control the visitor taps themselves, which is
     also what lets the browser start audio. */
  function firstWin(exp) {
    var beginner = (exp === "new" || exp === "some");
    location.hash = "#/arcade";
    setTimeout(function () {
      try {
        if (beginner) {
          var tab = $$("[data-sub]").filter(function (b) {
            return b.dataset.sub === "listen-eq";
          })[0];
          if (tab) { tab.click(); tab.scrollIntoView({ block: "center" }); return; }
        }
        var cab = $$(".cabcard.playable").filter(function (c) {
          return /FREQUENCY/i.test(c.textContent || "");
        })[0];
        if (cab) { cab.scrollIntoView({ block: "center" }); cab.click(); }
      } catch (e) {
        /* the arcade page is a perfectly good place to be left */
      }
    }, 260);
  }

  function wireWelcome() {
    var opts = $("#wcOpts");
    if (!opts || opts.__wired) return;
    opts.__wired = true;

    $$("#wcOpts button").forEach(function (b) {
      b.onclick = function () {
        var exp = b.dataset.exp;
        $$("#wcOpts button").forEach(function (o) {
          o.setAttribute("aria-pressed", String(o === b));
        });
        $("#wcMsg").textContent = "Saving\u2026";
        /* the answer is a preference, not a gate - a failed write must not
           strand somebody on this screen */
        D.updateProfile({ experience: exp })
         .catch(function () {})
         .then(function () { firstWin(exp); });
      };
    });

    var skip = $("#wcSkip");
    if (skip) skip.onclick = function () {
      try { localStorage.setItem(WELCOME_SKIPPED, "1"); } catch (e) {}
      location.hash = "#/dashboard";
    };
  }

  function recoveryUsable() {
    return isRecovering() && D.isSignedIn();
  }
  function deadLink() {
    setMode("signin");
    setMsg("error", "That reset link has expired or was already used \u2014 " +
                    "they only work once. Send yourself a new one.");
  }

  function isRecovering() {
    return /type=recovery/.test(location.hash) ||
           /type=recovery/.test(location.search) ||
           (D && D.isRecovering && D.isRecovering());
  }
  function setMsg(kind, text) {
    var m = $("#authMsg"); if (!m) return;
    if (!text) { m.hidden = true; return; }
    m.hidden = false; m.dataset.kind = kind; m.innerHTML = text;
  }
  function busy(on, label) {
    var b = $("#authSubmit"); if (!b) return;
    b.disabled = on;
    b.textContent = on ? (label || "Working…") : SUBMIT[mode];
  }
  var SUBMIT = { signin: "Sign in", signup: "Create account",
                 forgot: "Send reset link", recover: "Set new password" };

  function setMode(m) {
    mode = m;
    /* "forgot" is a sub-state of signing in, not a third destination, so
       the Sign in tab stays selected while you are in it. */
    var tabMode = (m === "forgot") ? "signin" : m;
    $$("#authTabs button").forEach(function (b) {
      b.setAttribute("aria-selected", String(b.dataset.mode === tabMode));
    });
    /* Mid-recovery the route guard bounces every other destination back
       here, so "Continue without an account" would be a link that looks
       like a way out and isn't. Hide the row rather than lie. */
    var lr = $(".auth-linkrow");
    if (lr) lr.hidden = (m === "recover");
    var fl = $("#forgotLink"), bl = $("#backToSignin");
    if (fl) fl.hidden = (m !== "signin");
    if (bl) bl.hidden = (m !== "forgot");
    $("#authTabs").hidden      = (m === "recover");
    $("#authNameRow").hidden   = (m !== "signup");
    $("#authCampusRow").hidden = (m !== "signup");
    if (m === "signup") fillCampusSelect();
    $("#authPassRow").hidden   = (m === "forgot");
    $("#authPass2Row").hidden  = !(m === "signup" || m === "recover");
    $("#pwMatch").hidden       = true;
    $("#lg-pass2").value       = "";
    /* Changing mode re-hides any revealed password. Leaving one on screen
       because somebody clicked a tab is not a decision they made. */
    $$(".pweye").forEach(function (eye) {
      var input = $("#" + eye.dataset.for);
      if (input) input.type = "password";
      eye.setAttribute("aria-pressed", "false");
      eye.setAttribute("aria-label", "Show password");
      eye.setAttribute("title", "Show password");
    });
    $("#authEmailRow").hidden  = (m === "recover");
    $("#lg-email").required    = (m !== "recover");
    $("#authSubmit").textContent = SUBMIT[m];
    $("#lg-pass").setAttribute("autocomplete", m === "signup" ? "new-password" : "current-password");
    if (m === "recover")
      return setMsg("info", "Choose a new password. You are signed in from the reset link.");
    setMsg("info", m === "forgot"
      ? "Enter the email you signed up with and we will send a reset link."
      : m === "signup"
        ? "Use the email your team already knows you by. Your progress is tied to it."
        : "");
  }

  /* The campus list comes from the database rather than being typed
     into the markup, so adding a campus is a row and not a deploy.
     This runs before sign-in, which is why campuses are readable by
     anonymous visitors. */
  var campusesLoaded = false, campusesAvailable = false;
  function fillCampusSelect() {
    var sel = $("#lg-campus");
    if (!sel || campusesLoaded) return;
    campusesLoaded = true;
    D.getCampuses().then(function (list) {
      /* If the campus table is empty or unreachable, the requirement below
         is dropped rather than locking everybody out of signing up. A
         missing campus is a thing the master admin can fix afterwards; a
         signup form nobody can submit is not. */
      if (!list.length) return;
      campusesAvailable = true;
      var byRegion = {};
      list.forEach(function (c) { (byRegion[c.region || ""] = byRegion[c.region || ""] || []).push(c); });
      var html = '<option value="">Select your campus\u2026</option>';
      Object.keys(byRegion).forEach(function (region) {
        html += region ? '<optgroup label="' + esc(region) + '">' : "";
        byRegion[region].forEach(function (c) {
          html += '<option value="' + esc(c.slug) + '">' + esc(c.name) + "</option>";
        });
        html += region ? "</optgroup>" : "";
      });
      sel.innerHTML = html;
    });
  }

  function wireAuth() {
    if (!$("#authTabs")) return;
    fillCampusSelect();
    $$("#authTabs button, #forgotLink, #backToSignin").forEach(function (b) {
      b.onclick = function () { setMode(b.dataset.mode); };
    });

    /* Show password. Typing a password you cannot see, on a phone, with
       autocorrect fighting you, is the most common reason a new account
       "will not let me in" - the password is simply not what they think
       they typed. Each field toggles on its own. */
    $$(".pweye").forEach(function (eye) {
      eye.onclick = function () {
        var input = $("#" + eye.dataset.for);
        if (!input) return;
        var show = input.type === "password";
        input.type = show ? "text" : "password";
        eye.setAttribute("aria-pressed", String(show));
        var label = show ? "Hide password" : "Show password";
        eye.setAttribute("aria-label", label);
        eye.setAttribute("title", label);
        /* Keep the caret where they left it rather than jumping to the end. */
        var pos = input.selectionStart;
        input.focus();
        try { input.setSelectionRange(pos, pos); } catch (e) {}
      };
    });

    /* Tell them it does not match while they can still see both fields,
       not after they press the button. */
    function checkMatch() {
      var a = $("#lg-pass").value, b2 = $("#lg-pass2").value;
      $("#pwMatch").hidden = !(b2 && a !== b2);
    }
    $("#lg-pass").addEventListener("input", checkMatch);
    $("#lg-pass2").addEventListener("input", checkMatch);
    $("#authForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var email = $("#lg-email").value.trim();
      if (mode === "recover") {
        if ($("#lg-pass").value.length < 8)
          return setMsg("error", "Passwords need to be at least 8 characters.");
        if ($("#lg-pass").value !== $("#lg-pass2").value)
          return setMsg("error", "The two passwords do not match.");
        busy(true);
        return D.updatePassword($("#lg-pass").value).then(function (r) {
          busy(false);
          if (r && r.error) {
            /* Supabase says "Auth session missing!", which tells a volunteer
               nothing. It means the link is spent. */
            if (/session|jwt|token/i.test(r.error.message || "")) {
              if (D.clearRecovery) D.clearRecovery();
              return deadLink();
            }
            return setMsg("error", esc(r.error.message));
          }
          if (D.clearRecovery) D.clearRecovery();
          setMsg("ok", "Password updated.");
          setTimeout(function () { location.hash = "#/dashboard"; }, 900);
        });
      }
      var pass  = $("#lg-pass").value;
      var name  = $("#lg-name") ? $("#lg-name").value.trim() : "";
      var campus= $("#lg-campus") ? $("#lg-campus").value : "";

      if (!email) return setMsg("error", "Enter your email address.");
      if (mode !== "forgot" && pass.length < 8)
        return setMsg("error", "Passwords need to be at least 8 characters.");
      if (mode === "signup" && pass !== $("#lg-pass2").value)
        return setMsg("error", "The two passwords do not match.");
      if (mode === "signup" && !name)
        return setMsg("error", "Enter your name so your admin knows who you are.");
      if (mode === "signup" && campusesAvailable && !campus)
        return setMsg("error", "Choose your campus \u2014 it is how your trainer finds you.");

      setMsg("info", "");
      busy(true);

      var p;
      if (mode === "signin")      p = D.signIn(email, pass);
      else if (mode === "signup") p = D.signUp(email, pass, name, campus);
      else                        p = D.resetPassword(email);

      p.then(function (r) {
        busy(false);
        if (r && r.error) return setMsg("error", esc(r.error.message));
        if (mode === "forgot")
          return setMsg("ok", "Reset link sent. Check your inbox &mdash; the link opens straight back here.");
        if (mode === "signup" && r && r.data && r.data.user && !r.data.session)
          return setMsg("ok", "Account created. Confirm the email we just sent, then sign in.");
        return D.loadSession().then(function () {
          location.hash = D.isAdmin() ? "#/admin" : "#/dashboard";
        });
      }).catch(function (err) {
        busy(false);
        setMsg("error", esc(err.message || "Something went wrong. Try again."));
      });
    });

    /* Every sign-out control, not just the one in the account menu. The
       header link carries .signout so a control added anywhere is wired
       by the same selector rather than needing a new id here. */
    $$("#signOutBtn, .signout").forEach(function (el) {
      el.onclick = function (e) {
        if (e) e.preventDefault();
        D.signOut().then(function () { location.hash = "#/"; });
      };
    });
  }

  /* ============================================================
   * USER DASHBOARD
   * ============================================================ */
  /* START HERE leads, and everything else reads as secondary until it is
     done. Not locked — a volunteer who wants to jump straight into the
     arcade can, they just have to mean it. */
  function gateOnStartHere(topics) {
    var start = null;
    for (var i = 0; i < topics.length; i++)
      if (topics[i].topic_slug === "start-here") start = topics[i];
    var list = $("#dbTopics");
    if (list) list.classList.toggle("gated", !!start && start.status !== "complete");
    return start;
  }

  function renderDashboard() {
    var p = D.getCurrentUser();
    if (!p) return;
    $("#dbName").textContent = (p.full_name || "Engineer").split(" ")[0] || "Engineer";
    $("#dbWho").textContent = "Welcome back";

    /* An engineer with no trainer is the one person on this page who needs
       telling something, and was the one person told nothing. Trainers and
       directors are not waiting on anybody, so they never see this. */
    var wait = $("#dbWaiting");
    if (wait) {
      wait.hidden = true;
      if (p.role === "user") {
        D.getRoster(p.campus || null).then(function (rows) {
          var me = rows.filter(function (r) { return r.profile_id === p.id; })[0];
          wait.hidden = !!(me && me.trainer_name);
        }).catch(function () { /* leave it hidden rather than guess */ });
      }
    }

    D.getUserProgress(true).then(function (res) {
      var topics = res.topics || [], c = res.course;
      var pct = c ? c.percent : 0;
      $("#dbBar").style.width = pct + "%";
      $("#dbPctText").textContent = pct + "% complete";
      $("#dbTopicCount").textContent =
        (c ? c.topics_complete : 0) + " of " + (c ? c.topics_total : topics.length) + " topics";

      // continue card — the first unfinished topic, in course order
      var next = null;
      for (var i = 0; i < topics.length; i++) {
        if (topics[i].status === "in_progress") { next = topics[i]; break; }
      }
      if (!next) for (var j = 0; j < topics.length; j++) {
        if (topics[j].status === "not_started") { next = topics[j]; break; }
      }
      var cont = $("#dbContinue");
      if (next) {
        cont.hidden = false;
        $("#dbContLab").textContent = next.status === "in_progress" ? "Continue training" : "Start here";
        $("#dbContTitle").textContent = next.topic_title;
        $("#dbContText").textContent = next.status === "in_progress"
          ? "You are " + next.percent + "% through this topic."
          : "You have not opened this one yet.";
        $("#dbContBtn").textContent = (next.status === "in_progress" ? "Resume" : "Begin") + " →";
        $("#dbContBtn").setAttribute("href", topicHref());
      } else {
        cont.hidden = false;
        $("#dbContLab").textContent = "Course complete";
        $("#dbContTitle").textContent = "Every topic finished.";
        $("#dbContText").textContent = "Go back to any arcade cabinet and beat your best run.";
        $("#dbContBtn").textContent = "Open the arcade →";
      }

      var start = gateOnStartHere(topics);
      var sc = $("#dbStart");
      if (sc) {
        sc.hidden = !start || start.status === "complete";
        var sb2 = $("#dbStartBtn");
        if (sb2) sb2.textContent = (start && start.status === "in_progress"
          ? "Finish START HERE" : "Open START HERE") + " \u2192";
      }

      // topics you could sensibly reflect on: anything you have started
      /* The form lives on #/reflections now; the dashboard keeps a pointer
         to it. Topic options are filled by renderReflections(). */
      var panel = $("#dbReflect");
      if (panel) panel.hidden = false;
      reflectTopics = topics;

      $("#dbTopics").innerHTML = topics.map(function (t) {
        var score = t.arcade_best_score != null
          ? '<span style="font-family:var(--mono);font-size:11px;color:var(--dim)">' +
            "Best " + t.arcade_best_score + "</span>" : "";
        return '<a class="topicrow" href="' + topicHref() + '">' +
          '<span class="tn">' + esc(t.topic_title) + "<small>" +
            (t.arcade_best_accuracy != null
              ? "Practice " + Math.round(t.arcade_best_accuracy) + "%"
              : t.modules_total + " steps") + "</small></span>" +
          '<span class="fwcell">' + fwbar(t) + "</span>" +
          '<span style="display:flex;align-items:center;gap:10px">' +
            '<span class="pbar" style="flex:1"><i style="width:' + t.percent + '%"></i></span>' +
            '<span class="pc">' + t.percent + "%</span></span>" +
          '<span style="text-align:right">' + pill(t.status) + "</span>" +
        "</a>";
      }).join("") || '<div class="emptynote">No topics found for this course yet.</div>';
    });

    D.getCourses().then(function (cs) {
      $("#dbCourses").innerHTML = cs.filter(function (c) { return c.slug !== D.courseSlug; })
        .map(courseCard).join("");
    });
  }

  /* ---------- Reflect ---------- */
  /* Topics, cached from the last dashboard render so the Reflections page
     can fill its picker without a second round trip. */
  var reflectTopics = null;

  function fillReflectTopics() {
    var sel = $("#rfTopic");
    if (!sel) return Promise.resolve();
    function paint(topics) {
      var keep = sel.value;
      /* A reflection about a service belongs to no module, and is the most
         useful thing most volunteers will write. It goes first. */
      var html = '<option value="">A service \u2014 no module</option>';
      (topics || []).filter(function (t) { return t.topic_slug !== "start-here"; })
        .forEach(function (t) {
          html += '<option value="' + esc(t.topic_slug) + '">' + esc(t.topic_title) + "</option>";
        });
      sel.innerHTML = html;
      sel.value = keep || "";
    }
    if (reflectTopics) { paint(reflectTopics); return Promise.resolve(); }
    return D.getUserProgress().then(function (res) {
      reflectTopics = (res && res.topics) || [];
      paint(reflectTopics);
    });
  }

  function reflectHint(msg, ok) {
    var h = $("#rfHint"); if (!h) return;
    h.textContent = msg || ""; h.className = "hint" + (ok ? " ok" : "");
  }
  /* A reflection is now one entry per topic per SERVED DATE, so the form
     is always editing a particular date. Opening the panel lands on
     today; the list underneath switches between earlier entries. */
  function fmtServed(iso, label) {
    if (!iso) return "";
    var p = String(iso).split("-");
    var d = new Date(+p[0], +p[1] - 1, +p[2]);   // local, not UTC
    var txt = d.toLocaleDateString(undefined,
      { weekday: "short", month: "short", day: "numeric" });
    return label ? txt + " \u00b7 " + label : txt;
  }

  function loadReflection(servedOn) {
    var sel = $("#rfTopic");
    if (!sel) return;
    var slug = sel.value;          // "" is valid: an entry about a service
    var ft = $("#rfFormTitle");
    if (ft) ft.textContent = slug
      ? "Reflect on " + (sel.options[sel.selectedIndex] || {}).text
      : "Reflect on a service";
    var dateEl = $("#rfDate");
    if (dateEl) {
      if (servedOn) dateEl.value = servedOn;
      if (!dateEl.value) dateEl.value = D.todayISO();
      dateEl.max = D.todayISO();          // a reflection is about a service that happened
    }
    var when = dateEl ? dateEl.value : D.todayISO();
    reflectHint("");
    D.getReflection(slug, when).then(function (r) {
      $("#rfWell").value = (r && r.went_well) || "";
      $("#rfWork").value = (r && r.needs_work) || "";
      $("#rfNext").value = (r && r.next_rep) || "";
      if ($("#rfService")) $("#rfService").value = (r && r.service_label) || "";
      if (r && r.updated_at) reflectHint("Saved " + ago(r.updated_at), true);
      else reflectHint("New entry for " + fmtServed(when), false);
      var nb = $("#rfNew"); if (nb) nb.hidden = !r;
    });
    renderReflectionHistory(slug, when);
  }

  function renderReflectionHistory(slug, current) {
    var wrap = $("#rfPast"), list = $("#rfPastList");
    if (!wrap || !list) return;
    D.getReflectionHistory(slug).then(function (rows) {
      var others = rows.filter(function (r) { return r.served_on !== current; });
      wrap.hidden = !others.length;
      if (!others.length) return;
      list.innerHTML = others.map(function (r) {
        return '<div class="rfentry" data-d="' + esc(r.served_on) + '">' +
          "<b>" + esc(fmtServed(r.served_on, r.service_label)) + "</b>" +
          '<span class="grow"></span>' +
          '<small>' + esc((r.went_well || "").slice(0, 44)) +
            ((r.went_well || "").length > 44 ? "\u2026" : "") + "</small>" +
          '<button data-act="open">Open</button>' +
          '<button data-act="del" data-id="' + esc(r.id) + '">Delete</button>' +
        "</div>";
      }).join("");
      $$("#rfPastList button").forEach(function (b) {
        b.onclick = function () {
          var row = b.closest(".rfentry");
          if (b.dataset.act === "open") { loadReflection(row.dataset.d); return; }
          if (!global.confirm("Delete your reflection from " +
              fmtServed(row.dataset.d) + "? This cannot be undone.")) return;
          b.disabled = true;
          D.deleteReflection(b.dataset.id)
            .then(function () { loadReflection($("#rfDate").value); })
            .catch(function () { b.disabled = false; reflectHint("Could not delete."); });
        };
      });
    });
  }
  /* The Reflections page: the form at the top, everything ever written
     underneath. A volunteer could previously only see the entry they were
     editing, which made "look back over six weeks" impossible - the whole
     reason the journal exists. */
  function renderReflections() {
    fillReflectTopics().then(function () { loadReflection(); });

    var host = $("#rfJournal");
    if (!host) return;
    D.getMyReflections().then(function (rows) {
      if (!rows.length) {
        host.innerHTML = '<div class="emptynote">Nothing written yet. ' +
          'The first one is the hardest; after that it takes four minutes.</div>';
        return;
      }
      host.innerHTML = rows.map(function (r) {
        function part(k, v) {
          return v && v.trim()
            ? '<div class="k">' + k + '</div><div class="v">' + esc(v) + "</div>" : "";
        }
        var tag = r.topic_title
          ? '<span class="tp">' + esc(r.topic_title) + "</span>"
          : '<span class="tp">Service</span>';
        return '<div class="rfj"><div class="rfjh">' +
            "<b>" + esc(fmtServed(r.served_on, r.service_label)) + "</b>" + tag +
            '<span class="grow"></span>' +
            '<button data-d="' + esc(r.served_on) + '" data-t="' +
              esc(r.topic_slug || "") + '">Edit</button>' +
          "</div>" +
          part("What went well", r.went_well) +
          part("What needs work", r.needs_work) +
          part("Changing next time", r.next_rep) +
        "</div>";
      }).join("");

      $$("#rfJournal button").forEach(function (b) {
        b.onclick = function () {
          var sel = $("#rfTopic");
          if (sel) sel.value = b.dataset.t || "";
          loadReflection(b.dataset.d);
          var panel = $("#rfPanel");
          if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: "smooth", block: "start" });
        };
      });
    });
  }

  function wireReflect() {
    var sel = $("#rfTopic"), save = $("#rfSave");
    if (!sel || !save || save.__wired) return;
    save.__wired = true;
    /* Not `sel.onchange = loadReflection` - that hands the change Event in
       as servedOn. Changing topic resets to today. */
    sel.onchange = function () { $("#rfDate").value = D.todayISO(); loadReflection(); };
    var dateEl = $("#rfDate");
    if (dateEl) dateEl.onchange = function () { loadReflection(dateEl.value); };
    var newBtn = $("#rfNew");
    if (newBtn) newBtn.onclick = function () {
      $("#rfDate").value = D.todayISO();
      if ($("#rfService")) $("#rfService").value = "";
      loadReflection(D.todayISO());
    };
    save.onclick = function () {
      var slug = sel.value;        // "" means a service, not a module
      save.disabled = true; reflectHint("Saving\u2026");
      D.saveReflection(slug, $("#rfWell").value, $("#rfWork").value, $("#rfNext").value,
                       $("#rfDate") ? $("#rfDate").value : null,
                       $("#rfService") ? $("#rfService").value : null)
        .then(function () {
          save.disabled = false;
          /* the same bar the database applies, said in words rather than
             silently refusing to tick the step */
          var enough = $("#rfWell").value.trim().length >= 40 &&
                       $("#rfWork").value.trim().length >= 40 &&
                       $("#rfNext").value.trim().length >= 20;
          /* Only a topic entry can tick a topic's Reflect step. A service
             note is not evidence you have reflected on compression, and
             the database agrees - apply_reflection finds no module. */
          reflectHint(enough
            ? "Saved \u2014 " + fmtServed($("#rfDate").value, $("#rfService").value) +
              (slug ? "." : ". Service entries do not tick a topic.")
            : "Saved, but too thin to count yet. A sentence on each of the first two, and one specific change.",
            enough);
          renderReflectionHistory(slug, $("#rfDate").value);
          var nb = $("#rfNew"); if (nb) nb.hidden = false;
          renderReflections();
        })
        .catch(function () { save.disabled = false; reflectHint("Could not save. Try again."); });
    };
  }

  function courseCard(c) {
    var live = c.status === "available";
    var tag  = live ? "Active" : c.status === "archived" ? "Archived" : "Coming soon";
    return '<' + (live ? 'a href="#/dashboard"' : "div") + ' class="coursecard ' + (live ? "live" : "soon") + '">' +
      '<div class="crule" style="background:' + esc(c.accent || "var(--accent)") + '"></div>' +
      '<div class="ct">' + esc(c.title) + "</div>" +
      '<div class="cs">' + esc(tag) + "</div>" +
      "<p>" + esc(c.description || "") + "</p>" +
      '<div class="spacer"></div>' +
      (live ? '<span class="pill in_progress">Open</span>' : '<span class="pill not_started">Not yet</span>') +
      "</" + (live ? "a" : "div") + ">";
  }

  function renderCourses() {
    D.getCourses().then(function (cs) {
      $("#csGrid").innerHTML = cs.map(courseCard).join("");
    });
  }

  /* ============================================================
   * ADMIN DASHBOARD
   * ============================================================ */
  function renderAdmin() {
    $("#adRoster").hidden = false;
    $("#adDetail").hidden = true;
    D.getAssignedUsers().then(function (users) {
      var n = users.length;
      var done   = users.filter(function (u) { return u.status === "complete"; }).length;
      var active = users.filter(function (u) { return u.status === "in_progress"; }).length;
      var avg    = n ? Math.round(users.reduce(function (a, u) { return a + (u.percent || 0); }, 0) / n) : 0;
      $("#adTotal").textContent  = n;
      $("#adActive").textContent = active;
      $("#adDone").textContent   = done;
      $("#adAvg").innerHTML      = avg + "<small>%</small>";

      if (!n) {
        $("#adUsers").innerHTML =
          '<div class="emptynote">No engineers are assigned to you yet.<br>' +
          "Assignments are made in Supabase by a super admin &mdash; see " +
          "<code>supabase/seed/0002_first_admin.sql</code>.</div>";
        return;
      }
      $("#adUsers").innerHTML = users.map(function (u) {
        return '<button class="userrow" data-member="' + esc(u.profile_id) + '">' +
          '<span class="un">' + esc(u.full_name || "Unnamed") +
            "<small>" + esc(u.email) + (u.campus ? " &middot; " + esc(u.campus) : "") + "</small></span>" +
          '<span class="pcell"><span class="pbar" style="flex:1"><i style="width:' +
            (u.percent || 0) + '%"></i></span><b>' + (u.percent || 0) + "%</b></span>" +
          '<span class="ct">' + esc(u.current_topic || "—") + "</span>" +
          '<span class="ct">' + ago(u.last_active_at) + "</span>" +
          "<span>" + pill(u.status) + "</span>" +
        "</button>";
      }).join("");
      $$("#adUsers .userrow").forEach(function (b) {
        b.onclick = function () { openMember(b.dataset.member); };
      });
    });
  }

  function openMember(id) {
    $("#adRoster").hidden = true;
    $("#adDetail").hidden = false;
    window.scrollTo(0, 0);

    D.getMemberProfile(id).then(function (p) {
      $("#adDetailName").textContent = (p && p.full_name) || "Engineer";
      $("#adDetailMeta").textContent =
        (p ? p.email : "") + (p && p.campus ? " · " + p.campus : "");
    });

    D.getUserProgressForAdmin(id).then(function (rows) {
      if (!rows.length) {
        $("#adDetailTopics").innerHTML =
          '<div class="emptynote">No progress visible for this engineer.</div>';
        return;
      }
      var avg = Math.round(rows.reduce(function (a, r) { return a + r.percent; }, 0) / rows.length);
      $("#adDetailBar").style.width = avg + "%";
      $("#adDetailPct").textContent = avg + "% complete";

      $("#adDetailTopics").innerHTML = rows.map(function (t) {
        return '<div class="topicrow" style="cursor:default">' +
          '<span class="tn">' + esc(t.topic_title) +
            "<small>" + (t.last_activity_at ? "Last activity " + ago(t.last_activity_at) : "No activity") +
            "</small></span>" +
          '<span class="fwcell">' + fwbar(t) + "</span>" +
          '<span style="font-family:var(--mono);font-size:12px;color:var(--dim)">' +
            (t.arcade_best_score != null
              ? t.arcade_best_score + (t.arcade_best_accuracy != null
                  ? " &middot; " + Math.round(t.arcade_best_accuracy) + "%" : "")
              : "—") + "</span>" +
          '<span style="text-align:right">' + pill(t.status) + "</span>" +
        "</div>";
      }).join("");
    });

    D.getMemberReflections(id).then(function (rs) {
      var host = $("#adDetailRefl"); if (!host) return;
      host.innerHTML = rs.length ? rs.map(function (r) {
        function block(k, v) {
          return v && v.trim()
            ? '<div style="margin-top:10px"><div style="font-family:var(--mono);font-size:9.5px;' +
              'letter-spacing:.16em;text-transform:uppercase;color:var(--dim);margin-bottom:4px">' +
              k + '</div><div style="font-size:14px;line-height:1.6;color:var(--white)">' +
              esc(v) + "</div></div>" : "";
        }
        return '<div class="topicrow" style="grid-template-columns:1fr !important;' +
          'align-items:flex-start;cursor:default;padding:18px 20px">' +
          '<span class="tn">' + esc(r.topic_title) +
            "<small>" + esc(fmtServed(r.served_on, r.service_label) ||
                            ago(r.updated_at)) + "</small></span>" +
          block("What went well", r.went_well) +
          block("What needs work", r.needs_work) +
          block("Changing next time", r.next_rep) +
        "</div>";
      }).join("") : '<div class="emptynote">No reflections written yet.</div>';
    });

    D.getMemberArcadeAttempts(id, 12).then(function (runs) {
      $("#adDetailRuns").innerHTML = runs.length ? runs.map(function (r) {
        var name = (r.modules && r.modules.title) || "Arcade";
        return '<div class="topicrow" style="grid-template-columns:1.6fr 100px 100px 1fr;cursor:default">' +
          '<span class="tn">' + esc(name) + "<small>" + ago(r.created_at) + "</small></span>" +
          '<span class="mk"><b>Score</b>' + r.score + "</span>" +
          '<span class="mk"><b>Accuracy</b>' +
            (r.accuracy != null ? Math.round(r.accuracy) + "%" : "&mdash;") + "</span>" +
          '<span class="mk"><b>Best streak</b>' + (r.max_streak != null ? r.max_streak : "&mdash;") + "</span>" +
        "</div>";
      }).join("") : '<div class="emptynote">No arcade runs recorded yet.</div>';
    });
  }

  /* ============================================================
   * ROUTE GUARD
   *
   * This is convenience, not security. Every one of these pages
   * would render empty for an unauthorised visitor anyway, because
   * the database returns them no rows. The guard just spares them
   * a blank screen.
   * ============================================================ */
  function guard() {
    var h = routeOf();
    if (PROTECTED[h] && !D.isSignedIn()) { location.replace("#/login"); return false; }
    if (ADMIN_ONLY[h] && !D.isAdmin())   { location.replace("#/dashboard"); return false; }
    return true;
  }

  /* Leaving a page silences it. The arcade and the IEM Mix Room each run
     their own AudioContext, and nothing else stops the one you walked away
     from — you would just get both at once on the way back. */
  var lastRoute = null;
  function silenceLeftBehind(next) {
    if (lastRoute === next) return;
    if (lastRoute === "/iem" && window.IEMRoom) window.IEMRoom.pause();
    if (lastRoute === "/arcade") {
      var t = document.getElementById("transport");
      var stop = document.getElementById("stopAllBtn");
      if (t && stop && t.dataset.live === "true") stop.click();
    }
    lastRoute = next;
  }

  function onRoute() {
    paintHeader();
    /* Mid-recovery there is exactly one thing to do. The session is real,
       so every other page would happily render - and the account would be
       left on the password its owner came here to change. */
    if (recoveryUsable() && location.hash !== "#/login") {
      setMode("recover");
      location.replace("#/login");
      return;
    }
    silenceLeftBehind(routeOf());
    if (!guard()) return;
    var h = routeOf();
    if (h === "/dashboard") renderDashboard();
    else if (h === "/reflections") { wireReflect(); renderReflections(); }
    else if (h === "/admin") renderAdmin();
    else if (h === "/courses") renderCourses();
    else if (h === "/welcome") wireWelcome();
    else if (h === "/reset") {
      /* Old reset emails point here. Honour them only if the link worked. */
      if (recoveryUsable()) setMode("recover"); else deadLink();
      location.replace("#/login");
    }
    else if (h === "/login" && D.isSignedIn() && mode !== "recover")
      location.replace(D.isAdmin() ? "#/admin" : "#/dashboard");
  }

  /* ============================================================
   * BOOT
   * ============================================================ */
  function boot() {
    if (!D || !D.configured) {
      // The site still works as a public training tool with no backend;
      // it just cannot save anything. Say so rather than failing silently.
      $$("[data-auth]").forEach(function (el) { el.hidden = true; });
      var m = $("#authMsg");
      if (m) { m.hidden = false; m.dataset.kind = "error";
        m.textContent = "Accounts are not configured for this deployment."; }
      return;
    }
    wireAuth();
    if (recoveryUsable()) setMode("recover");
    else if (isRecovering()) deadLink();
    else setMode("signin");
    /* The event can arrive after boot, because the client resolves the
       link asynchronously. Whenever it does, take over: send them to the
       login card and refuse to show anything else until a new password
       is set. */
    D.onChange(function () {
      if (!recoveryUsable() || mode === "recover") return;
      setMode("recover");
      if (location.hash !== "#/login") location.replace("#/login");
    });

    /* A scrolling tab row is useless if the tab you just picked is off
       screen. Keep the selected one in view without moving the page. */
    $$("[data-sub]").forEach(function (b) {
      b.addEventListener("click", function () {
        try { b.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }); }
        catch (e) {}
      });
    });

    D.onChange(function () { paintHeader(); });
    window.addEventListener("hashchange", onRoute);

    var back = $("#adBack");
    if (back) back.onclick = function (e) { e.preventDefault(); renderAdmin(); };
    var ref = $("#adRefresh");
    if (ref) ref.onclick = function () { renderAdmin(); };

    D.loadSession().then(function () {
      paintHeader();
      /* Only from the places a first sign-in actually lands. Somebody who
         deep-linked to a lesson is mid-thought; interrupting them with a
         questionnaire is worse than not knowing their experience. */
      var h = routeOf();
      if (needsWelcome() && (h === "/" || h === "/dashboard" || h === "/login")) {
        location.replace("#/welcome");
      }
      onRoute();
    });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
