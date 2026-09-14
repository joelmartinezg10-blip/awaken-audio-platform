/* ============================================================
 * Awaken Audio — the account menu and the profile page
 *
 * The photo is resized and re-encoded on the device before it goes
 * anywhere: a phone camera JPEG is several megabytes, and none of
 * that resolution survives being drawn at 32 pixels in a header.
 * ============================================================ */
(function (global) {
  "use strict";
  var D = global.AwakenData;
  if (!D) return;

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  var EXPERIENCE = {
    "new":         "Brand new",
    some:          "Some experience",
    serving:       "Serving regularly",
    experienced:   "Experienced",
    lead:          "Leading and training"
  };
  var ROLES = { user: "Engineer in Training", admin: "Audio Trainer",
                super_admin: "Master Admin" };

  function initials(p) {
    var n = (p && (p.full_name || p.email) || "").trim();
    if (!n) return "··";
    var bits = n.split(/[\s@._-]+/).filter(Boolean);
    return ((bits[0] || "")[0] + (bits.length > 1 ? (bits[1] || "")[0] : "")).toUpperCase();
  }
  function paintAvatar(el, p) {
    if (!el) return;
    if (p && p.avatar_url)
      el.innerHTML = '<img src="' + esc(p.avatar_url) + '" alt="">';
    else
      el.innerHTML = "<i>" + esc(initials(p)) + "</i>";
  }

  /* ---------- the header menu ---------- */
  function paintAccount() {
    var p = D.getCurrentUser();
    paintAvatar($("#acctAv"), p);
    paintAvatar($("#acctAvBig"), p);
    var nm = $("#acctName");
    if (nm) nm.textContent = p ? (p.full_name || p.email || "").split(" ")[0] : "…";
    var an = $("#amName");
    if (an) an.textContent = p ? (p.full_name || p.email || "You") : "…";
    var am = $("#amMeta");
    if (am) am.textContent = p
      ? (ROLES[p.role] || "Engineer in Training") +
        (p.experience && EXPERIENCE[p.experience] ? " · " + EXPERIENCE[p.experience] : "")
      : "";
  }
  function closeMenu() {
    var m = $("#acctMenu"), b = $("#acctBtn");
    if (m) m.hidden = true;
    if (b) b.setAttribute("aria-expanded", "false");
  }
  function wireMenu() {
    var b = $("#acctBtn"), m = $("#acctMenu");
    if (!b || !m || b.__wired) return;
    b.__wired = true;
    b.onclick = function (e) {
      e.stopPropagation();
      var open = m.hidden;
      m.hidden = !open;
      b.setAttribute("aria-expanded", String(open));
      if (open) paintAccount();
    };
    document.addEventListener("click", function (e) {
      if (!m.hidden && !m.contains(e.target) && e.target !== b) closeMenu();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMenu();
    });
    $$("#acctMenu a").forEach(function (a) { a.addEventListener("click", closeMenu); });
  }

  /* ---------- resize on the device ----------
     A 4000px phone photo becomes a 512px square before upload. Doing
     this here rather than server-side is the difference between a
     four-megabyte upload on church wifi and about forty kilobytes. */
  function shrink(file, size) {
    return new Promise(function (resolve, reject) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var s = Math.min(img.width, img.height);          /* centre crop to square */
        var cv = document.createElement("canvas");
        cv.width = cv.height = size;
        var g = cv.getContext("2d");
        g.imageSmoothingQuality = "high";
        g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        cv.toBlob(function (b) {
          b ? resolve(b) : reject(new Error("could not read that image"));
        }, "image/webp", 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("that file is not an image")); };
      img.src = url;
    });
  }

  /* ---------- the profile page ---------- */
  var dirty = false;
  function msg(kind, text) {
    var e = $("#pfMsg");
    if (!e) return;
    e.className = "lbl " + (kind || "");
    e.textContent = text || "";
  }

  function renderProfile() {
    var p = D.getCurrentUser();
    if (!p) return;
    paintAvatar($("#pfAv"), p);
    $("#pfName").value = p.full_name || "";
    $("#pfBio").value  = p.bio || "";
    $("#pfExp").value  = p.experience || "";
    $("#pfCount").textContent = ($("#pfBio").value || "").length;
    $("#pfClear").hidden = !p.avatar_url;
    $("#pfEmail").textContent = p.email || "—";
    $("#pfRole").textContent  = ROLES[p.role] || "Engineer in Training";
    msg("", "");

    D.getCampuses().then(function (list) {
      var c = list.filter(function (x) { return x.slug === p.campus; })[0];
      $("#pfCampus").textContent = c ? c.name : (p.campus || "Not set yet");
    });

    /* who is following this person — read from the roster, which is
       already scoped, rather than a second bespoke query */
    D.getRoster(p.campus || null).then(function (rows) {
      var me = rows.filter(function (r) { return r.profile_id === p.id; })[0];
      $("#pfTrainer").textContent = me && me.trainer_name ? me.trainer_name : "Not assigned yet";
    }).catch(function () { $("#pfTrainer").textContent = "—"; });
  }

  function save() {
    var patch = {
      full_name:  $("#pfName").value.trim().slice(0, 120),
      bio:        $("#pfBio").value.trim().slice(0, 600) || null,
      experience: $("#pfExp").value || null
    };
    if (!patch.full_name) { msg("bad", "Your name cannot be empty."); return; }
    $("#pfSave").disabled = true;
    msg("", "Saving…");
    D.updateProfile(patch).then(function () {
      $("#pfSave").disabled = false;
      dirty = false;
      msg("ok", "Saved.");
      paintAccount();
    }).catch(function (e) {
      $("#pfSave").disabled = false;
      msg("bad", (e && e.message) || "That did not save.");
    });
  }

  function pickPhoto(file) {
    if (!file) return;
    msg("", "Preparing the photo…");
    shrink(file, 512).then(function (blob) {
      msg("", "Uploading…");
      return D.uploadAvatar(blob);
    }).then(function (url) {
      var p = D.getCurrentUser();
      if (p) p.avatar_url = url;
      paintAvatar($("#pfAv"), p);
      paintAccount();
      $("#pfClear").hidden = false;
      msg("ok", "Photo updated.");
    }).catch(function (e) {
      msg("bad", (e && e.message) || "The photo did not upload.");
    });
  }

  function wireProfile() {
    if (!$("#pfSave") || $("#pfSave").__wired) return;
    $("#pfSave").__wired = true;
    $("#pfSave").onclick = save;
    $("#pfBio").oninput = function () {
      $("#pfCount").textContent = this.value.length; dirty = true;
    };
    $("#pfName").oninput = $("#pfExp").onchange = function () { dirty = true; };
    $("#pfPick").onclick = function () { $("#pfFile").click(); };
    $("#pfFile").onchange = function () { pickPhoto(this.files && this.files[0]); this.value = ""; };
    $("#pfClear").onclick = function () {
      msg("", "Removing…");
      D.updateProfile({ avatar_url: null }).then(function () {
        var p = D.getCurrentUser();
        paintAvatar($("#pfAv"), p); paintAccount();
        $("#pfClear").hidden = true; msg("ok", "Photo removed.");
      }).catch(function (e) { msg("bad", (e && e.message) || "Could not remove it."); });
    };
    global.addEventListener("beforeunload", function (e) {
      if (dirty) { e.preventDefault(); e.returnValue = ""; }
    });
  }

  function onRoute() {
    closeMenu();
    wireMenu();
    paintAccount();
    if (location.hash.indexOf("/profile") >= 0) {
      wireProfile();
      renderProfile();
    }
  }

  global.addEventListener("hashchange", function () { setTimeout(onRoute, 80); });
  D.onChange(function () { paintAccount(); });

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", function () { setTimeout(onRoute, 250); });
  else setTimeout(onRoute, 250);

  global.AwakenProfile = { paint: paintAccount, render: renderProfile };
})(window);
