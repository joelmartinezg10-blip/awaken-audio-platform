/* ============================================================
 * Awaken Audio — application data layer
 *
 * The training modules call this and nothing else. They never see
 * a Supabase client, a table name, a UUID or a JWT: they say
 * "learn-hp is complete" or "the raid run scored 4200 at 71%",
 * and this file decides what that means and when to write it.
 *
 * Everything here assumes the database is the authority. The
 * client never computes a status the server could compute, and
 * never sends a field the server derives (best score, completion
 * timestamps, roles) — those are ignored or rejected by design.
 * ============================================================ */
(function (global) {
  "use strict";

  var SUPABASE_URL = global.AWAKEN_CONFIG && global.AWAKEN_CONFIG.supabaseUrl;
  var SUPABASE_KEY = global.AWAKEN_CONFIG && global.AWAKEN_CONFIG.supabaseAnonKey;
  var COURSE       = (global.AWAKEN_CONFIG && global.AWAKEN_CONFIG.courseSlug) || "awaken-audio";

  var sb = null;
  var configured = !!(SUPABASE_URL && SUPABASE_KEY && global.supabase);
  if (configured) {
    sb = global.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }

  /* Supabase restores the session from localStorage asynchronously and
     refreshes the token on its own schedule. Without this listener the
     header only reflects whatever was true at the moment boot() ran —
     so a refresh, a sign-out in another tab, or a slow restore would
     leave the page claiming the wrong thing. Registered below, once the
     state object exists. */
  var authWatch = null;

  /* ---------- in-memory session state ---------- */
  var state = {
    user: null,        // auth user
    profile: null,     // profiles row
    topics: null,      // cached v_topic_progress rows
    course: null,      // cached v_course_progress row
    loadedAt: 0
  };
  var listeners = [];
  function emit() { listeners.slice().forEach(function (f) { try { f(state); } catch (e) {} }); }

  /* Any change to the session repaints everything that depends on it. */
  if (configured) {
    authWatch = sb.auth.onAuthStateChange(function (event, session) {
      var had = !!state.user;
      state.user = session ? session.user : null;
      if (!state.user) { state.profile = null; emit(); return; }
      /* a token refresh is the same person: do not re-fetch the profile */
      if (had && state.profile) { emit(); return; }
      sb.from("profiles").select("*").eq("id", state.user.id).maybeSingle()
        .then(function (p) { if (p && p.data) state.profile = p.data; emit(); })
        .catch(function () { emit(); });
    });
  }

  /* ---------- error handling ----------
   * Progress must never break a drill. Every write is best-effort:
   * it is queued, retried, and if it still fails the volunteer keeps
   * training and we say so quietly rather than throwing mid-game. */
  var lastError = null;
  function note(err, where) {
    if (!err) return null;
    lastError = { message: err.message || String(err), where: where, at: Date.now() };
    if (global.console && console.warn) console.warn("[awaken-data] " + where + ":", err.message || err);
    return lastError;
  }

  /* ============================================================
   * AUTH
   * ============================================================ */
  function signUp(email, password, fullName, campus) {
    if (!configured) return Promise.reject(new Error("not configured"));
    return sb.auth.signUp({
      email: email,
      password: password,
      options: {
        // read by the handle_new_user trigger; role is NOT read from here
        data: { full_name: fullName || "", campus: campus || "" },
        emailRedirectTo: global.location.origin + "/#/login"
      }
    });
  }

  function signIn(email, password) {
    if (!configured) return Promise.reject(new Error("not configured"));
    return sb.auth.signInWithPassword({ email: email, password: password });
  }

  function resetPassword(email) {
    if (!configured) return Promise.reject(new Error("not configured"));
    return sb.auth.resetPasswordForEmail(email, {
      redirectTo: global.location.origin + "/#/reset"
    });
  }

  function updatePassword(newPassword) {
    if (!configured) return Promise.reject(new Error("not configured"));
    return sb.auth.updateUser({ password: newPassword });
  }

  function signOut() {
    if (!configured) return Promise.resolve();
    flush();
    return sb.auth.signOut().then(function () {
      state.user = null; state.profile = null; state.topics = null; state.course = null;
      emit();
    });
  }

  function getCurrentUser() { return state.profile; }
  function isSignedIn()     { return !!state.user; }
  function isAdmin()        { return !!state.profile && (state.profile.role === "admin" || state.profile.role === "super_admin"); }
  function isSuperAdmin()   { return !!state.profile && state.profile.role === "super_admin"; }

  /* Resolve the session and profile. Called on boot and whenever
   * Supabase reports an auth change. */
  function loadSession() {
    if (!configured) return Promise.resolve(null);
    return sb.auth.getSession().then(function (r) {
      var session = r && r.data && r.data.session;
      state.user = session ? session.user : null;
      if (!state.user) { state.profile = null; emit(); return null; }
      // The profile row is a second round trip. If it fails we retry once
      // before giving up, because a null profile costs an admin their Admin
      // tab and makes a signed-in user look signed out.
      function fetchProfile(attempt) {
        return sb.from("profiles").select("*").eq("id", state.user.id).maybeSingle()
          .then(function (p) {
            if (p.error || !p.data) {
              if (attempt < 2) {
                return new Promise(function (r) { setTimeout(r, 700); })
                  .then(function () { return fetchProfile(attempt + 1); });
              }
              note(p.error || new Error("no profile row"), "loadSession/profile");
              emit();
              return null;
            }
            state.profile = p.data; emit(); return state.profile;
          });
      }
      return fetchProfile(1);
    });
  }

  if (configured) {
    sb.auth.onAuthStateChange(function (evt) {
      if (evt === "SIGNED_IN" || evt === "TOKEN_REFRESHED" || evt === "SIGNED_OUT") loadSession();
    });
  }

  /* ============================================================
   * PROFILE
   * ============================================================ */
  function updateProfile(patch) {
    if (!state.user) return Promise.reject(new Error("signed out"));
    // role/email/id are stripped server-side; sending them is pointless
    var safe = {};
    if ("full_name" in patch)  safe.full_name  = String(patch.full_name || "").slice(0, 120);
    if ("campus"    in patch)  safe.campus     = patch.campus ? String(patch.campus).slice(0, 80) : null;
    if ("bio"       in patch)  safe.bio        = patch.bio ? String(patch.bio).slice(0, 600) : null;
    if ("experience" in patch) safe.experience = patch.experience || null;
    if ("avatar_url" in patch) safe.avatar_url = patch.avatar_url || null;
    return sb.from("profiles").update(safe).eq("id", state.user.id).select().single()
      .then(function (r) {
        if (r.error) { note(r.error, "updateProfile"); throw r.error; }
        state.profile = r.data; emit(); return r.data;
      });
  }

  /* ============================================================
   * PROGRESS — reads
   * ============================================================ */
  function getCourses() {
    if (!configured) return Promise.resolve([]);
    return sb.from("courses").select("*").order("sort_order")
      .then(function (r) { return r.error ? (note(r.error, "getCourses"), []) : r.data; });
  }

  /* One round trip gives the whole dashboard. */
  function getUserProgress(force) {
    if (!state.user) return Promise.resolve({ course: null, topics: [] });
    if (!force && state.topics && Date.now() - state.loadedAt < 15000) {
      return Promise.resolve({ course: state.course, topics: state.topics });
    }
    return Promise.all([
      sb.from("v_topic_progress").select("*")
        .eq("profile_id", state.user.id).eq("course_slug", COURSE).order("topic_order"),
      sb.from("v_course_progress").select("*")
        .eq("profile_id", state.user.id).eq("course_slug", COURSE).maybeSingle()
    ]).then(function (res) {
      if (res[0].error) note(res[0].error, "getUserProgress/topics");
      if (res[1].error) note(res[1].error, "getUserProgress/course");
      state.topics   = res[0].data || [];
      state.course   = res[1].data || null;
      state.loadedAt = Date.now();
      emit();
      return { course: state.course, topics: state.topics };
    });
  }

  function getCourseProgress() {
    return getUserProgress().then(function (p) { return p.course; });
  }

  function getNextTopic() {
    if (!state.user) return Promise.resolve(null);
    return sb.rpc("get_next_topic", { p_course_slug: COURSE })
      .then(function (r) {
        if (r.error) { note(r.error, "getNextTopic"); return null; }
        return (r.data && r.data[0]) || null;
      });
  }

  /* Status of one module by the key the front-end already uses. */
  function getModuleStatus(uiKey) {
    if (!state.topics) return null;
    for (var i = 0; i < state.topics.length; i++) {
      var t = state.topics[i];
      if (t.__modules) {
        for (var j = 0; j < t.__modules.length; j++)
          if (t.__modules[j].ui_key === uiKey) return t.__modules[j];
      }
    }
    return null;
  }

  function getModuleProgress() {
    if (!state.user) return Promise.resolve([]);
    return sb.from("v_module_progress").select("*")
      .eq("profile_id", state.user.id).eq("course_slug", COURSE)
      .then(function (r) { return r.error ? (note(r.error, "getModuleProgress"), []) : r.data; });
  }

  /* ============================================================
   * PROGRESS — writes
   *
   * A volunteer clicking through a Learn module fires dozens of UI
   * events. None of them are worth a row-trip. So:
   *   - the first sight of a module marks it in_progress, once, ever
   *   - completion is written immediately (it is the event that matters)
   *   - anything else is coalesced and flushed on a timer, on tab
   *     hide, and on unload
   * ============================================================ */
  var pending = {};              // ui_key -> {status, percent}
  var timer = null;
  var seen = {};                 // ui_key -> true, once per session
  var FLUSH_MS = 8000;

  function queue(uiKey, status, percent) {
    var cur = pending[uiKey] || { status: "in_progress", percent: 0 };
    // never queue a downgrade
    var rank = { not_started: 0, in_progress: 1, complete: 2 };
    if (rank[status] >= rank[cur.status]) cur.status = status;
    cur.percent = Math.max(cur.percent || 0, percent || 0);
    pending[uiKey] = cur;
    if (!timer) timer = setTimeout(flush, FLUSH_MS);
  }

  function writeOne(uiKey, entry) {
    return sb.rpc("record_module_progress", {
      p_ui_key: uiKey,
      p_status: entry.status,
      p_percent: entry.percent || null
    }).then(function (r) {
      if (r.error) { note(r.error, "record_module_progress/" + uiKey); return null; }
      state.loadedAt = 0;                 // rollups are stale now
      return r.data;
    });
  }

  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!state.user || !configured) { pending = {}; return Promise.resolve(); }
    var keys = Object.keys(pending);
    if (!keys.length) return Promise.resolve();
    var batch = pending; pending = {};
    return Promise.all(keys.map(function (k) { return writeOne(k, batch[k]); }));
  }

  /* Called when a learner opens a module. Cheap and idempotent:
   * writes at most one row per module per browser session. */
  function markModuleSeen(uiKey) {
    if (!state.user || seen[uiKey]) return;
    seen[uiKey] = true;
    queue(uiKey, "in_progress", 0);
  }

  /* Called when a learner finishes a Learn or Listen module. */
  function updateModuleProgress(uiKey, status, percent) {
    if (!state.user) return Promise.resolve(null);
    seen[uiKey] = true;
    if (status === "complete") {           // worth a round trip of its own
      delete pending[uiKey];
      return writeOne(uiKey, { status: "complete", percent: 100 })
        .then(function (r) { emit(); return r; });
    }
    queue(uiKey, status || "in_progress", percent);
    return Promise.resolve(null);
  }

  /* Called once at the end of an arcade run.
   * accuracy (0–100) is what decides completion; score is the
   * high-score number the dashboards display. */
  function recordArcadeAttempt(uiKey, result) {
    if (!state.user) return Promise.resolve(null);
    result = result || {};
    var acc = result.accuracy;
    if (acc !== null && acc !== undefined) acc = Math.max(0, Math.min(100, Number(acc)));
    return sb.rpc("record_arcade_attempt", {
      p_ui_key: uiKey,
      p_score: Math.max(0, Math.round(Number(result.score) || 0)),
      p_accuracy: (acc === null || acc === undefined || isNaN(acc)) ? null : Number(acc.toFixed(2)),
      p_max_streak: result.maxStreak != null ? Math.round(result.maxStreak) : null,
      p_wave: result.wave != null ? Math.round(result.wave) : null,
      p_duration_ms: result.durationMs != null ? Math.round(result.durationMs) : null,
      p_completed: !!result.completed,
      p_detail: result.detail || {}
    }).then(function (r) {
      if (r.error) { note(r.error, "record_arcade_attempt/" + uiKey); return null; }
      state.loadedAt = 0; emit();
      return r.data;
    });
  }

  /* Don't lose the last few seconds of a session. */
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") flush();
    });
    global.addEventListener("pagehide", flush);
  }

  /* ============================================================
   * ADMIN
   *
   * These read exactly what row level security allows and nothing
   * more. There is no "admin mode" flag in this file that changes
   * what comes back — an unassigned learner returns zero rows
   * because the database says so, not because the UI hid them.
   * ============================================================ */
  /* ---------- Reflect ---------- */
  function getReflection(topicSlug) {
    if (!state.user) return Promise.resolve(null);
    return sb.from("reflections")
      .select("went_well,needs_work,next_rep,updated_at,topics!inner(slug)")
      .eq("profile_id", state.user.id).eq("topics.slug", topicSlug).maybeSingle()
      .then(function (r) { return r.error ? (note(r.error, "getReflection"), null) : r.data; });
  }

  function saveReflection(topicSlug, wentWell, needsWork, nextRep) {
    if (!state.user) return Promise.reject(new Error("signed out"));
    return sb.rpc("save_reflection", {
      p_topic_slug: topicSlug,
      p_went_well: String(wentWell || "").slice(0, 2000),
      p_needs_work: String(needsWork || "").slice(0, 2000),
      p_next_rep: String(nextRep || "").slice(0, 2000),
      p_course_slug: COURSE
    }).then(function (r) {
      if (r.error) { note(r.error, "saveReflection"); throw r.error; }
      state.loadedAt = 0; emit();
      return r.data;
    });
  }

  function getMemberReflections(memberId) {
    if (!isAdmin()) return Promise.resolve([]);
    return sb.rpc("get_member_reflections", { p_member: memberId, p_course_slug: COURSE })
      .then(function (r) { return r.error ? (note(r.error, "getMemberReflections"), []) : (r.data || []); });
  }

  function getAssignedUsers() {
    if (!isAdmin()) return Promise.resolve([]);
    return sb.rpc("get_assigned_users", { p_course_slug: COURSE })
      .then(function (r) { return r.error ? (note(r.error, "getAssignedUsers"), []) : (r.data || []); });
  }

  function getUserProgressForAdmin(memberId) {
    if (!isAdmin()) return Promise.resolve([]);
    return sb.rpc("get_member_topic_progress", { p_member: memberId, p_course_slug: COURSE })
      .then(function (r) { return r.error ? (note(r.error, "getUserProgressForAdmin"), []) : (r.data || []); });
  }

  function getMemberProfile(memberId) {
    return sb.from("profiles").select("*").eq("id", memberId).maybeSingle()
      .then(function (r) { return r.error ? (note(r.error, "getMemberProfile"), null) : r.data; });
  }

  function getMemberArcadeAttempts(memberId, limit) {
    return sb.from("arcade_attempts")
      .select("score,accuracy,max_streak,wave,created_at,module_id,modules(ui_key,title)")
      .eq("profile_id", memberId).order("created_at", { ascending: false })
      .limit(limit || 20)
      .then(function (r) { return r.error ? (note(r.error, "getMemberArcadeAttempts"), []) : r.data; });
  }


  /* ============================================================
   * CAMPUSES, ROSTERS AND ASSIGNMENT
   *
   * None of these decide who may see what — every one of them is a
   * plain call through RLS, so the same function returns the master
   * admin every campus, a director their campus, and a trainer their
   * campus peers. There is deliberately no role branching here: a
   * check in this file would be a check an attacker can skip.
   * ============================================================ */

  var campusCache = null;
  function getCampuses() {
    if (campusCache) return Promise.resolve(campusCache);
    return sb.from("campuses").select("slug,name,region,sort_order")
      .eq("is_active", true).order("sort_order")
      .then(function (r) {
        if (r.error) { note(r.error, "getCampuses"); return []; }
        campusCache = r.data || [];
        return campusCache;
      });
  }

  function getRoster(campus) {
    return sb.rpc("get_roster", { p_campus: campus || null, p_course_slug: COURSE })
      .then(function (r) { return r.error ? (note(r.error, "getRoster"), []) : (r.data || []); });
  }

  function getCampusTopicStats(campus) {
    return sb.rpc("get_campus_topic_stats", { p_campus: campus || null, p_course_slug: COURSE })
      .then(function (r) { return r.error ? (note(r.error, "getCampusTopicStats"), []) : (r.data || []); });
  }

  function getCampusArcade(campus) {
    return sb.rpc("get_campus_arcade", { p_campus: campus || null, p_course_slug: COURSE })
      .then(function (r) { return r.error ? (note(r.error, "getCampusArcade"), []) : (r.data || []); });
  }

  function getCampusReflections(campus, limit) {
    return sb.rpc("get_campus_reflections",
      { p_campus: campus || null, p_limit: limit || 40, p_course_slug: COURSE })
      .then(function (r) { return r.error ? (note(r.error, "getCampusReflections"), []) : (r.data || []); });
  }

  function getCampusDirectors() {
    return sb.rpc("get_campus_directors")
      .then(function (r) { return r.error ? (note(r.error, "getCampusDirectors"), []) : (r.data || []); });
  }

  /* the campus this account LEADS, or null — read from the table, so
     it is the same answer the database enforces its rules with */
  function getDirectorCampus() {
    if (!state.user) return Promise.resolve(null);
    return sb.from("campus_directors").select("campus_slug")
      .eq("profile_id", state.user.id).maybeSingle()
      .then(function (r) { return r.data ? r.data.campus_slug : null; });
  }

  /* An engineer has one primary trainer, so this replaces rather than
     adds. The unique constraint on member_id is what actually enforces
     that; the upsert just avoids a pointless round trip. */
  function assignMember(memberId, trainerId) {
    return sb.from("admin_user_assignments")
      .upsert({ admin_id: trainerId, member_id: memberId,
                assigned_by: state.user ? state.user.id : null },
              { onConflict: "member_id" })
      .then(function (r) { if (r.error) { note(r.error, "assignMember"); throw r.error; } return true; });
  }

  function unassignMember(memberId) {
    return sb.from("admin_user_assignments").delete().eq("member_id", memberId)
      .then(function (r) { if (r.error) { note(r.error, "unassignMember"); throw r.error; } return true; });
  }

  function setMemberCampus(memberId, slug) {
    return sb.from("profiles").update({ campus: slug || null }).eq("id", memberId)
      .then(function (r) { if (r.error) { note(r.error, "setMemberCampus"); throw r.error; } return true; });
  }

  function setMemberRole(memberId, role) {
    return sb.from("profiles").update({ role: role }).eq("id", memberId)
      .then(function (r) { if (r.error) { note(r.error, "setMemberRole"); throw r.error; } return true; });
  }

  function setCampusDirector(campusSlug, slot, memberId) {
    return sb.from("campus_directors")
      .upsert({ campus_slug: campusSlug, slot: slot, profile_id: memberId,
                assigned_by: state.user ? state.user.id : null },
              { onConflict: "campus_slug,slot" })
      .then(function (r) { if (r.error) { note(r.error, "setCampusDirector"); throw r.error; } return true; });
  }

  function clearCampusDirector(campusSlug, slot) {
    return sb.from("campus_directors").delete()
      .eq("campus_slug", campusSlug).eq("slot", slot)
      .then(function (r) { if (r.error) { note(r.error, "clearCampusDirector"); throw r.error; } return true; });
  }


  /* ------------------------------------------------------------
   * Avatars.
   *
   * The path is always <user id>/<file>, because the storage policy
   * reads the first folder as the owner. Changing that shape breaks
   * the policy, not just the URL.
   *
   * The filename carries a timestamp so a new photo is a new URL —
   * otherwise the browser and the CDN keep serving the old one for
   * as long as they feel like it.
   * ------------------------------------------------------------ */
  function uploadAvatar(blob) {
    if (!state.user) return Promise.reject(new Error("signed out"));
    var path = state.user.id + "/" + Date.now() + ".webp";
    return sb.storage.from("avatars")
      .upload(path, blob, { contentType: "image/webp", upsert: true })
      .then(function (r) {
        if (r.error) { note(r.error, "uploadAvatar"); throw r.error; }
        var url = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
        return updateProfile({ avatar_url: url }).then(function () { return url; });
      });
  }

  /* ============================================================ */
  global.AwakenData = {
    configured: configured,
    client: sb,
    courseSlug: COURSE,

    onChange: function (fn) { listeners.push(fn); return function () {
      listeners = listeners.filter(function (f) { return f !== fn; }); }; },
    lastError: function () { return lastError; },

    signUp: signUp, signIn: signIn, signOut: signOut,
    resetPassword: resetPassword, updatePassword: updatePassword,
    loadSession: loadSession,
    getCurrentUser: getCurrentUser, isSignedIn: isSignedIn,
    isAdmin: isAdmin, isSuperAdmin: isSuperAdmin,
    updateProfile: updateProfile,
    uploadAvatar: uploadAvatar,

    getCourses: getCourses,
    getUserProgress: getUserProgress,
    getCourseProgress: getCourseProgress,
    getModuleProgress: getModuleProgress,
    getModuleStatus: getModuleStatus,
    getNextTopic: getNextTopic,

    markModuleSeen: markModuleSeen,
    updateModuleProgress: updateModuleProgress,
    recordArcadeAttempt: recordArcadeAttempt,
    flush: flush,

    getReflection: getReflection,
    saveReflection: saveReflection,
    getMemberReflections: getMemberReflections,

    getAssignedUsers: getAssignedUsers,
    getUserProgressForAdmin: getUserProgressForAdmin,
    getMemberProfile: getMemberProfile,
    getMemberArcadeAttempts: getMemberArcadeAttempts,

    getCampuses: getCampuses,
    getRoster: getRoster,
    getCampusTopicStats: getCampusTopicStats,
    getCampusArcade: getCampusArcade,
    getCampusReflections: getCampusReflections,
    getCampusDirectors: getCampusDirectors,
    getDirectorCampus: getDirectorCampus,
    assignMember: assignMember,
    unassignMember: unassignMember,
    setMemberCampus: setMemberCampus,
    setMemberRole: setMemberRole,
    setCampusDirector: setCampusDirector,
    clearCampusDirector: clearCampusDirector
  };
})(window);
