/* ============================================================
 * Awaken Audio — level select for the Learn pages
 *
 * The Learn modules are 600-1,400 word chapters with five to seven
 * numbered sections, rendered as one continuous scroll. The structure
 * was already written - 01 WHAT A HIGH-PASS FILTER ACTUALLY DOES, 02
 * WHAT NEEDS LOW END - it just was not being used as navigation, so a
 * rookie met the whole chapter at once and an experienced engineer
 * scrolled past it hunting for the settings table.
 *
 * This changes nothing about the words. It turns the sections the
 * author already wrote into a level select: one section on screen at a
 * time, chips to jump, a NEXT at the bottom of each, and READ ALL for
 * anyone who wants the continuous version back.
 *
 * Runtime rather than markup: the sections are deeply nested and a
 * hand-wrap would risk the content. Walking siblings from each .gnum to
 * the next cannot damage anything it does not understand.
 * ============================================================ */
(function (global) {
  "use strict";

  function build(host) {
    if (host.__levelled) return;
    var heads = Array.prototype.slice.call(host.querySelectorAll(":scope > .gnum"));
    if (heads.length < 3) return;          /* not worth it for one or two */
    host.__levelled = true;

    /* 1. wrap each heading plus everything after it, up to the next one */
    var secs = heads.map(function (h, i) {
      var sec = document.createElement("section");
      sec.className = "lvl";
      sec.setAttribute("aria-label", text(h));
      h.parentNode.insertBefore(sec, h);
      var node = h;
      while (node && !(i + 1 < heads.length && node === heads[i + 1])) {
        var nxt = node.nextSibling;
        sec.appendChild(node);
        node = nxt;
        if (node && node.nodeType === 1 && node.classList.contains("gnum")) break;
      }
      return sec;
    });

    /* 2. the chip row, from the numbers and titles already on the page */
    var nav = document.createElement("div");
    nav.className = "lvlnav";
    nav.setAttribute("role", "tablist");
    nav.innerHTML = heads.map(function (h, i) {
      return '<button type="button" role="tab" data-lvl="' + i + '"' +
             (i === 0 ? ' aria-selected="true"' : ' aria-selected="false"') + '>' +
             '<i>' + num(h) + "</i><span>" + title(h) + "</span></button>";
    }).join("") +
    '<button type="button" class="lvlall" data-lvl="all" aria-pressed="false">Read all</button>';
    host.insertBefore(nav, secs[0]);

    /* 3. a way onward that is not the scrollbar */
    secs.forEach(function (sec, i) {
      if (i + 1 >= secs.length) return;
      var f = document.createElement("button");
      f.type = "button";
      f.className = "lvlnext";
      f.dataset.lvl = i + 1;
      f.innerHTML = "Next &#183; <b>" + num(heads[i + 1]) + " " + title(heads[i + 1]) + "</b> &#8594;";
      sec.appendChild(f);
    });

    function show(which) {
      var all = which === "all";
      secs.forEach(function (s, i) { s.hidden = !all && String(i) !== String(which); });
      Array.prototype.forEach.call(nav.querySelectorAll("[data-lvl]"), function (b) {
        if (b.dataset.lvl === "all") b.setAttribute("aria-pressed", String(all));
        else b.setAttribute("aria-selected", String(!all && b.dataset.lvl === String(which)));
      });
      host.dataset.lvl = which;
    }

    host.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("[data-lvl]") : null;
      if (!b || !host.contains(b)) return;
      var v = b.dataset.lvl;
      show(v === "all" && host.dataset.lvl === "all" ? "0" : v);
      /* keep the chips in view rather than jumping to the top of a section */
      if (v !== "all") nav.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });

    show("0");
  }

  function text(h)  { return (h.textContent || "").replace(/\s+/g, " ").trim(); }
  function num(h)   { var e = h.querySelector(".i"); return e ? e.textContent.trim() : ""; }
  function title(h) {
    var e = h.querySelector(".t");
    if (!e) return "";
    /* The headings break across lines with <br>, which contributes no
       whitespace to textContent - so reading it directly welds the halves
       together: "HIGH-PASSFILTER", "STARTING POINTSFOR OUR STAGE". */
    return e.innerHTML
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-levels]"), build);
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();

  global.AwakenLevels = { init: init };
})(window);
