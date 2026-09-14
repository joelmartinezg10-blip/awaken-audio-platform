#!/usr/bin/env python3
"""
Assemble the deployable Awaken Audio site.

Input : ../site-with-arcade.html  (the training platform, unchanged)
Output: public/index.html

Everything this script does is additive. It never edits a training
module — if a patch anchor stops matching, it fails loudly rather
than producing a page with a silently missing feature.
"""
import re, sys, os, pathlib

ROOT = pathlib.Path(__file__).parent
SRC  = ROOT.parent / "site-with-arcade.html"
OUT  = ROOT / "public" / "index.html"

sys.path.insert(0, str(ROOT / "src"))
import strip as _strip
import framework_patch
import dims as _dims

html = SRC.read_text(encoding="utf-8")
def sub(old, new, what):
    global html
    if html.count(old) != 1:
        sys.exit("build: anchor for %r matched %d times, expected 1" % (what, html.count(old)))
    html = html.replace(old, new, 1)

app_css   = (ROOT / "src" / "app.css").read_text(encoding="utf-8")
pages     = (ROOT / "src" / "pages.html").read_text(encoding="utf-8")
iem_css   = (ROOT / "src" / "iem.css").read_text(encoding="utf-8")
fw_css    = (ROOT / "src" / "framework.css").read_text(encoding="utf-8")
iem_html  = (ROOT / "src" / "iem.html").read_text(encoding="utf-8")

# ---------------------------------------------------------------
# 1. styles
# ---------------------------------------------------------------
# the site has two <style> blocks (site chrome, then the scoped arcade);
# ours goes at the end of the first so the arcade's scoped rules still win
_i = html.index("\n</style>")
html = (html[:_i] + "\n\n/* ===== accounts & dashboards ===== */\n" + app_css
        + "\n\n/* ===== Academy Framework ===== */\n" + fw_css
        + "\n\n/* ===== why this is not a course ===== */\n" + _dims.CSS

        + "\n\n/* ===== IEM Mix Room ===== */\n" + iem_css + html[_i:])

# ---------------------------------------------------------------
# 2. new pages, injected before the arcade page so the arcade
#    markup stays exactly where it was
# ---------------------------------------------------------------
sub('<!-- ================= ARCADE ================= -->',
    pages + "\n" + iem_html + '\n<!-- ================= ARCADE ================= -->',
    "arcade page marker")

# ---------------------------------------------------------------
# 3. router: register the new routes
# ---------------------------------------------------------------
sub("""    '/login':   {el:'p-login',   accent:'#FF5A36', g:'login'}
  };""",
    """    '/login':   {el:'p-login',   accent:'#FF5A36', g:'login'},
    '/dashboard':{el:'p-dashboard',accent:'#FF5A36', g:'me'},
    '/courses': {el:'p-courses', accent:'#FF5A36', g:'me'},
    '/admin':   {el:'p-admin',   accent:'#7657FF', g:'me'},
    '/iem':     {el:'p-iem',     accent:'#7657FF', g:'training'}
  };""", "pages map")

sub("""    training: [['/ear','Ear Training'],['/arcade','Arcade'],['/proc','Processing']]
  };""",
    """    training: [['/ear','Ear Training'],['/arcade','Arcade'],['/iem','IEM Mix Room'],['/proc','Processing']],
    me:       [['/dashboard','My Progress'],['/courses','Courses'],['/admin','Admin']]
  };""", "groups map")

# The Admin sub-nav link must not exist for non-admins.
sub("""      sub.className='subnav sub-'+g;
      inner.innerHTML = (g==='seats' ? '<span class="sub-lab">Choose a seat</span>' : '') +
        groups[g].map(function(c){""",
    """      sub.className='subnav sub-'+g;
      var items = groups[g].filter(function(c){
        if(c[0]!=='/admin') return true;
        return !!(window.AwakenData && window.AwakenData.isAdmin());
      });
      inner.innerHTML = (g==='seats' ? '<span class="sub-lab">Choose a seat</span>' : '') +
        items.map(function(c){""", "subnav render")

# ---------------------------------------------------------------
# 4. header: account chip / sign-in link
# ---------------------------------------------------------------
LOGIN_LINK = '<a class="btn" href="#/login">Log in</a>'
if html.count(LOGIN_LINK) == 1:
    sub(LOGIN_LINK,
        '<a class="btn" href="#/login" data-auth="out">Log in</a>'
        '<span class="acct" data-auth="in" hidden>'
          '<span class="rolechip" id="acctRole" hidden></span>'
          '<span class="nm" id="acctName"></span>'
          '<a class="btn" href="#/dashboard">My progress</a>'
          '<button class="btn" id="signOutBtn">Sign out</button>'
        '</span>', "header login link")
else:
    sys.exit("build: could not find the header log-in link (found %d)" % html.count(LOGIN_LINK))

# ---------------------------------------------------------------
# 5. live auth form in place of the mock
# ---------------------------------------------------------------
AUTH_FORM = """        <div class="auth-tabs" id="authTabs" role="tablist">
          <button type="button" role="tab" data-mode="signin" aria-selected="true">Sign in</button>
          <button type="button" role="tab" data-mode="signup" aria-selected="false">Create account</button>
          <button type="button" role="tab" data-mode="forgot" aria-selected="false">Reset</button>
        </div>
        <div class="auth-msg" id="authMsg" data-kind="info" hidden></div>
        <form class="login-form" id="authForm">
          <div id="authNameRow" hidden>
            <label for="lg-name">Full name</label>
            <input id="lg-name" type="text" autocomplete="name" placeholder="Jordan Reyes">
          </div>
          <div id="authEmailRow">
            <label for="lg-email">Email</label>
            <input id="lg-email" type="email" autocomplete="email" required placeholder="you@awakenchurch.com">
          </div>
          <div id="authPassRow">
            <label for="lg-pass">Password</label>
            <input id="lg-pass" type="password" autocomplete="current-password" placeholder="At least 8 characters">
          </div>
          <div id="authCampusRow" hidden>
            <label for="lg-campus">Campus</label>
            <div class="sel"><select id="lg-campus">
              <option>Balboa</option><option>Bay Ho</option><option>Other campus</option>
            </select></div>
          </div>
          <button class="btn primary lg-btn" id="authSubmit" type="submit">Sign in</button>
          <div class="auth-linkrow">
            <a href="#/ear">Continue without an account</a>
          </div>
        </form>
        <div class="login-note">Your progress, scores and completion are saved to your account &mdash;
          start on the booth laptop, finish on your phone.</div>"""

m = re.search(r'        <form class="login-form" onsubmit="return false">.*?'
              r'<div class="login-note">.*?</div>', html, re.S)
if not m:
    sys.exit("build: could not find the mock login form")
html = html[:m.start()] + AUTH_FORM + html[m.end():]


# ---------------------------------------------------------------
# 7. arcade result hooks
#
# Seven result paths, all of which already funnel through
# showGameOver. Each gains a `track:` payload naming the game and
# the accuracy it already computed; showGameOver forwards it once.
# These are the only edits this script makes inside a module, they
# add no behaviour, and a missing anchor fails the build.
# ---------------------------------------------------------------
HOOKS = [
  # (anchor, track payload)
  ("""  setTimeout(()=>showGameOver({
    win: spLives>0,""",
   """  setTimeout(()=>showGameOver({
    track:{game:"frenzy",score:spScore,accuracy:acc,streak:spBest,wave:spWave,completed:false},
    win: spLives>0,"""),

  ("""      setTimeout(()=>showGameOver({
        win:true, title:"ALL FIVE CLEARED",""",
   """      setTimeout(()=>showGameOver({
        track:{game:"match",score:mScore,accuracy:mAcc,completed:true},
        win:true, title:"ALL FIVE CLEARED","""),

  ("""      setTimeout(()=>showGameOver({
        win:false, title:"GAME OVER", sub:"Out of lives on stage "+(mStage+1),""",
   """      setTimeout(()=>showGameOver({
        track:{game:"match",score:mScore,accuracy:mAcc,completed:false},
        win:false, title:"GAME OVER", sub:"Out of lives on stage "+(mStage+1),"""),

  ("""      setTimeout(()=>showGameOver({
        win:true,title:"DIALLED IN",""",
   """      setTimeout(()=>showGameOver({
        track:{game:"knee",score:kScore,accuracy:kAcc,completed:true},
        win:true,title:"DIALLED IN","""),

  ("""      setTimeout(()=>showGameOver({
        win:false,title:"GAME OVER",sub:"Out of lives on "+KSTAGES[kStage].t.toLowerCase(),""",
   """      setTimeout(()=>showGameOver({
        track:{game:"knee",score:kScore,accuracy:kAcc,completed:false},
        win:false,title:"GAME OVER",sub:"Out of lives on "+KSTAGES[kStage].t.toLowerCase(),"""),

  ("""    showGameOver({
      win:finished&&rank!=="FAIL", title:finished?("RANK "+rank):"GAME OVER",""",
   """    showGameOver({
      track:{game:"raid",score:score,accuracy:ear,streak:rrStats.best,
             completed:finished&&rank!=="FAIL",detail:{rank:rank}},
      win:finished&&rank!=="FAIL", title:finished?("RANK "+rank):"GAME OVER","""),

  ("""    showGameOver({
      win:finished&&rank!=="FAIL", title:finished?("RANK "+rank):"RUN ENDED",""",
   """    showGameOver({
      track:{game:"gain",score:score,accuracy:Math.round(pct*100),
             completed:finished&&rank!=="FAIL",detail:{rank:rank,clips:clips}},
      win:finished&&rank!=="FAIL", title:finished?("RANK "+rank):"RUN ENDED","""),
]
for i, (old, new) in enumerate(HOOKS):
    sub(old, new, "arcade hook %d" % (i + 1))

# one forwarding line inside the shared handler
sub("""function showGameOver(o){
  $("#goTitle").textContent=o.title;""",
    """function showGameOver(o){
  if(o.track && window.AwakenProgress){ try{ window.AwakenProgress.arcade(o.track.game,o.track); }catch(e){} }
  $("#goTitle").textContent=o.title;""", "showGameOver hook")

# ---------------------------------------------------------------
# 10. Mission, Vision and the Academy Framework
# ---------------------------------------------------------------
sub(_dims.OLD, _dims.NEW, "seven dimensions section")
framework_patch.apply(html, sub, (ROOT / "src" / "starthere.html").read_text(encoding="utf-8"))

# ---------------------------------------------------------------
# 9. the Monitors page linked out to a claude.ai artifact. That took
#    volunteers off the site, depended on the artifact staying shared,
#    and simply failed for some browsers. Point it at the real page.
# ---------------------------------------------------------------
_m = re.search(r'<a class="btn primary extlink" href="https://claude\.ai/code/artifact/'
               r'7ee4ddb8[^"]*"[^>]*>.*?</a>', html, re.S)
if not _m:
    sys.exit("build: could not find the IEM artifact link on the Monitors page")
html = (html[:_m.start()]
        + '<a class="btn primary" href="#/iem">Open the IEM Mix Room &#8594;</a>'
        + html[_m.end():])

_n = re.search(r'<p class="extnote">Opens in a new tab\..*?</p>', html, re.S)
if _n:
    html = (html[:_n.start()]
            + '<p class="extnote">Opens in the site &mdash; your mix and your '
              'assignments are remembered on this device.</p>'
            + html[_n.end():])


# ---------------------------------------------------------------
# 11. The arcade's document-level key handlers were written when the
#     arcade owned the whole page. On the site they fire everywhere:
#     spacebar on the IEM Mix Room was toggling BOTH transports, and
#     Escape called the arcade's stopAll() from any page. Gate them
#     on the arcade page actually being visible.
# ---------------------------------------------------------------
sub("""document.addEventListener("keydown",e=>{
  if(e.key!=="Escape") return;""",
    """document.addEventListener("keydown",e=>{
  if(!arcadeOn()) return;
  if(e.key!=="Escape") return;""", "arcade escape handler")

sub("""document.addEventListener("keydown",e=>{
  if(e.code!=="Space"&&e.key!==" ") return;""",
    """document.addEventListener("keydown",e=>{
  if(!arcadeOn()) return;
  if(e.code!=="Space"&&e.key!==" ") return;""", "arcade space handler")

sub("""document.addEventListener("visibilitychange",()=>{ if(document.hidden) stopAll(); });""",
    """document.addEventListener("visibilitychange",()=>{ if(document.hidden&&arcadeOn()) stopAll(); });""",
    "arcade visibilitychange")

# the helper itself, defined before the first handler that uses it
sub("""document.addEventListener("keydown",e=>{
  if(!arcadeOn()) return;
  if(e.key!=="Escape") return;""",
    """/* This module used to own the page; on the site it is one route of
   several, so its global keys only apply while it is on screen. */
function arcadeOn(){
  const p=document.getElementById("p-arcade");
  return !p || !p.hidden;
}
document.addEventListener("keydown",e=>{
  if(!arcadeOn()) return;
  if(e.key!=="Escape") return;""", "arcadeOn helper")


# ---------------------------------------------------------------
# 12. The GS-01 gets a real channel strip: gain, trim, then the
#     filters, in the order they sit on the console, so the shape is
#     familiar the first time somebody stands at one. Only the two
#     controls a volunteer actually operates are live.
# ---------------------------------------------------------------
sub(_strip.OLD_DESK, _strip.NEW_DESK, "GS-01 desk")

_j = html.rindex("\n})();")
html = html[:_j] + "\n" + _strip.JS + html[_j:]

sub(_strip.FADER_OLD, _strip.FADER_NEW, "fader law + printed scale")
sub("function gsPaint(){", "function gsPaint(){\n  try{ gsStrip(); }catch(e){}", "gsPaint strip hook")

_k = html.rindex("\n</style>")
html = html[:_k] + "\n\n/* ===== GS-01 channel strip ===== */\n" + _strip.CSS + html[_k:]

# ---------------------------------------------------------------
# 6. scripts, last so the DOM they touch already exists
# ---------------------------------------------------------------
tail = html.rfind("</body>")
scripts = (
  '\n<script src="/js/supabase.js"></script>\n'
  '<script src="/js/config.js"></script>\n'
  '<script src="/js/awaken-data.js"></script>\n'
  '<script src="/js/awaken-progress.js"></script>\n'
  '<script src="/js/awaken-app.js"></script>\n'
  '<script src="/js/iem.js"></script>\n'
)
html = html + scripts if tail == -1 else html[:tail] + scripts + html[tail:]

# ---------------------------------------------------------------
# 8. wrap as a real HTML document
#
# The artifact host supplied the doctype, charset and viewport. A
# standalone deploy has to declare them itself — without the charset
# the page renders every en-dash and middot as mojibake.
# ---------------------------------------------------------------
html = ("<!doctype html>\n<html lang=\"en\">\n<head>\n"
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
        '<meta name="color-scheme" content="dark">\n'
        '<meta name="description" content="Awaken Church audio training '
        '\u2014 learn it, hear it, then prove it.">\n'
        "</head>\n<body>\n" + html + "\n</body>\n</html>\n")

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(html, encoding="utf-8")
for name, srcname in [("config.js","config.js"), ("awaken-app.js","app.js"),
                     ("awaken-progress.js","progress.js"),
                     ("iem.js","iem.js")]:
    (ROOT / "public" / "js" / name).write_text(
        (ROOT / "src" / srcname).read_text(encoding="utf-8"), encoding="utf-8")
print("built %s  (%.2f MB)" % (OUT, OUT.stat().st_size / 1e6))
