"""The GS-01 channel strip. Imported by build.py."""

OLD_DESK = open(__file__.replace("strip.py", "_gsdesk_old.txt")).read()

NEW_DESK = '''<div class="gsdesk">

            <!-- the channel strip, in signal order, the way it reads on the
                 console: gain, then trim, then the filters. Only the two
                 controls a volunteer actually operates are live. -->
            <div class="chstrip">
              <div class="csh"><b id="gsChNo">CH 01</b><span id="gsChName">LEAD VOCAL</span></div>

              <div class="csmod locked" id="gsPreMod">
                <div class="csk">Gain</div>
                <div class="csknob big" id="gsGainKnob"><i></i><u></u></div>
                <div class="csv"><b id="gsPreVal">+36</b><em>dB</em></div>
                <div class="cslock" id="gsPreLock"><span>&#128274;</span>System preset</div>
                <div class="csstat">Status<b id="gsPreStat">HEALTHY</b></div>
                <button class="btn" id="gsPreTouch">TRY TO ADJUST</button>
              </div>

              <div class="csmod live" id="gsTrimMod">
                <div class="csk">Trim<span class="yours">yours</span></div>
                <div class="csrow">
                  <div class="trimknob" id="gsTrimHost"></div>
                  <div class="csmeter" id="gsStripMeter"><i></i></div>
                </div>
              </div>

              <a class="csmod ref" href="#/arcade" id="gsHpfMod">
                <div class="csk">HPF<span class="refchip">ref</span></div>
                <canvas class="cscurve" id="gsHpfCurve" width="220" height="120"
                        aria-label="High-pass filter response for this channel"></canvas>
                <div class="csv"><b id="gsHpfVal">80</b><em>Hz</em></div>
              </a>

              <div class="csmod ref">
                <div class="csk">LPF<span class="refchip">ref</span></div>
                <canvas class="cscurve" id="gsLpfCurve" width="220" height="120"
                        aria-label="Low-pass filter, out on this channel"></canvas>
                <div class="csv"><b id="gsLpfVal">OUT</b><em></em></div>
              </div>

              <p class="csnote">The filters are shown because they live on the
                 strip. Neither is applied here &mdash; set them in the
                 <b>HPF Lab</b>.</p>
            </div>

            <!-- everything downstream of the strip -->
            <div class="gsright">
              <div class="gsmod fad">
                <div class="mh"><span>&#127898;</span>Fader</div>
                <div id="gsFaderHost"></div>
              </div>
              <div class="gsmod" style="justify-content:center">
                <div class="mh">Meters</div>
                <div class="gsmeters" id="gsLadders"></div>
              </div>
            </div>
          </div>

          '''

FADER_OLD = """function makeFader(o){
  const w=document.createElement("div"); w.className="fv";
  const tr=document.createElement("div"); tr.className="track"; tr.tabIndex=0;
  tr.setAttribute("role","slider"); tr.setAttribute("aria-label",o.label);
  const cap=document.createElement("div"); cap.className="cap";
  const un=document.createElement("div"); un.className="unity";
  tr.append(un,cap);
  const lab=document.createElement("div"); lab.className="lab"; lab.textContent=o.label;
  const num=document.createElement("div"); num.className="num";
  w.append(tr,lab,num);
  let v=o.value;
  const toN=db=>Math.pow(Math.max(0,(db-o.min)/(o.max-o.min)),0.45);
  const toDb=n=>o.min+Math.pow(Math.max(0,Math.min(1,n)),1/0.45)*(o.max-o.min);
  function paint(){
    const n=toN(v), H=172, ch=20;
    cap.style.bottom=(n*(H-ch))+"px";
    un.style.bottom=(toN(0)*(H-ch)+ch/2)+"px";
    num.textContent=(v<=o.min+0.01?"\u2212\u221e":(v>0?"+":"")+v.toFixed(1));
    tr.setAttribute("aria-valuetext",num.textContent+" dB");
  }"""

FADER_NEW = """function makeFader(o){
  /* A real console fader is not a power curve — the travel above unity is a
     narrow band and everything below \u221210 dB is squeezed into the bottom
     half. This is that law as a table, which also gives us honest positions
     to print the scale at: a tick that does not sit where the cap sits is
     worse than no tick at all.

     Position runs 0 at the bottom of travel to 1 at the top. Unity sits at
     0.82, so +10 dB occupies only the top fifth. */
  const LAW=[[-60,0],[-50,0.10],[-40,0.20],[-30,0.32],[-20,0.46],
             [-15,0.55],[-10,0.63],[-5,0.73],[0,0.82],[5,0.91],[10,1]];
  function toN(db){
    if(db<=LAW[0][0]) return 0;
    for(let i=1;i<LAW.length;i++){
      if(db<=LAW[i][0]){
        const a=LAW[i-1], b=LAW[i];
        return a[1]+(db-a[0])/(b[0]-a[0])*(b[1]-a[1]);
      }
    }
    return 1;
  }
  function toDb(n){
    n=Math.max(0,Math.min(1,n));
    for(let i=1;i<LAW.length;i++){
      if(n<=LAW[i][1]){
        const a=LAW[i-1], b=LAW[i];
        return a[0]+(n-a[1])/(b[1]-a[1])*(b[0]-a[0]);
      }
    }
    return LAW[LAW.length-1][0];
  }

  const w=document.createElement("div"); w.className="fv";
  const tr=document.createElement("div"); tr.className="track"; tr.tabIndex=0;
  tr.setAttribute("role","slider"); tr.setAttribute("aria-label",o.label);
  const scale=document.createElement("div"); scale.className="fscale";
  const cap=document.createElement("div"); cap.className="cap";
  const un=document.createElement("div"); un.className="unity";
  tr.append(un,cap);
  const row=document.createElement("div"); row.className="frow";
  row.append(scale,tr);
  const lab=document.createElement("div"); lab.className="lab"; lab.textContent=o.label;
  const num=document.createElement("div"); num.className="num";
  w.append(row,lab,num);

  /* the printed scale */
  [10,5,0,-5,-10,-20,-30,-40,-60].forEach(function(db){
    const t=document.createElement("span");
    t.className="ft"+(db===0?" unity":"");
    t.textContent=(db<=-60?"\u2212\u221e":(db>0?"+"+db:String(db)));
    t.dataset.n=toN(db);
    scale.appendChild(t);
  });

  let v=o.value;
  function trackH(){ return tr.clientHeight||300; }
  function paint(){
    const H=trackH(), ch=cap.offsetHeight||26, travel=H-ch;
    cap.style.bottom=(toN(v)*travel)+"px";
    un.style.bottom=(toN(0)*travel+ch/2)+"px";
    [].forEach.call(scale.children,function(t){
      t.style.bottom=(parseFloat(t.dataset.n)*travel+ch/2)+"px";
    });
    num.textContent=(v<=o.min+0.01?"\u2212\u221e":(v>0?"+":"")+v.toFixed(1));
    tr.setAttribute("aria-valuetext",num.textContent+" dB");
  }
  if(window.ResizeObserver){ try{ new ResizeObserver(()=>paint()).observe(tr); }catch(e){} }"""

CSS = """
/* ============================================================
   GS-01 channel strip
   Laid out in the order of a real channel strip — gain, trim,
   then the filters — so the shape is familiar the first time
   somebody stands at the console. Rendered in the arcade's own
   language rather than imitating any manufacturer's software.
   ============================================================ */
#p-arcade .gsdesk{display:grid;grid-template-columns:210px 1fr;gap:16px;align-items:stretch}

#p-arcade .chstrip{
  display:flex;flex-direction:column;gap:1px;background:#2A2A31;
  border:1px solid #35353B;border-radius:4px;overflow:hidden}
#p-arcade .chstrip .csh{
  background:linear-gradient(180deg,#1E2A1E,#162016);padding:8px 10px;text-align:center;
  border-bottom:1px solid #35353B}
#p-arcade .chstrip .csh b{display:block;font-family:var(--arcade);font-size:9px;color:var(--good)}
#p-arcade .chstrip .csh span{display:block;font-family:var(--mono);font-size:8.5px;
  letter-spacing:.16em;color:#6E6A5E;margin-top:4px;text-transform:uppercase}

#p-arcade .csmod{
  background:linear-gradient(180deg,#17171B,#101013);padding:13px 10px 12px;
  display:flex;flex-direction:column;align-items:center;gap:8px;text-decoration:none}
#p-arcade .csmod .csk{
  font-family:var(--mono);font-size:9px;letter-spacing:.2em;text-transform:uppercase;
  color:var(--muted);display:flex;align-items:center;gap:6px}
#p-arcade .csmod .csk .yours{
  font-size:7.5px;letter-spacing:.14em;color:var(--heat);border:1px solid var(--heat);
  padding:1px 4px;border-radius:2px}
#p-arcade .csmod .csv{display:flex;align-items:baseline;gap:4px}
#p-arcade .csmod .csv b{font-family:var(--display);font-size:20px;color:var(--white);line-height:1}
#p-arcade .csmod .csv em{font-family:var(--mono);font-size:9px;font-style:normal;color:var(--dim)}

/* the gain knob — locked, so it is drawn rather than driven */
#p-arcade .csknob{
  width:52px;height:52px;border-radius:50%;position:relative;
  background:radial-gradient(circle at 34% 28%,#4A2018,#24100C 62%,#160A08);
  border:1px solid #6A3520;box-shadow:0 2px 6px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.07)}
#p-arcade .csknob i{
  position:absolute;left:50%;top:7px;width:2px;height:18px;background:var(--heat);
  transform-origin:50% 19px;transform:translateX(-50%) rotate(38deg);border-radius:1px;
  box-shadow:0 0 5px var(--heat)}
#p-arcade .csknob u{
  position:absolute;inset:-5px;border-radius:50%;
  border:1px dashed rgba(255,90,54,.18)}
#p-arcade .csmod.locked{background:linear-gradient(180deg,#191509,#111015)}
#p-arcade .csmod.locked .csk{color:var(--warn)}
#p-arcade .cslock{
  font-family:var(--mono);font-size:7.5px;letter-spacing:.12em;text-transform:uppercase;
  color:var(--warn);border:1px solid #5A4A22;border-radius:2px;padding:4px 7px;
  display:flex;align-items:center;gap:5px;text-align:center}
#p-arcade .cslock.bad{color:var(--bad);border-color:var(--bad)}
#p-arcade .csstat{font-family:var(--mono);font-size:7.5px;letter-spacing:.12em;
  text-transform:uppercase;color:var(--dim);display:flex;gap:6px}
#p-arcade .csstat b{color:var(--good)}
#p-arcade .csmod.locked .btn{font-size:7.5px;padding:7px 10px;margin-top:2px}

/* trim — the one control in their hands, so it gets the accent */
#p-arcade .csmod.live{background:linear-gradient(180deg,#1B120E,#111013);
  box-shadow:inset 2px 0 0 var(--heat)}
#p-arcade .csrow{display:flex;align-items:center;gap:10px}
#p-arcade .csmeter{
  width:9px;height:64px;border:1px solid #35353B;border-radius:2px;background:#0A0A0C;
  position:relative;overflow:hidden}
#p-arcade .csmeter i{
  position:absolute;left:0;right:0;bottom:0;height:0%;
  background:linear-gradient(180deg,var(--bad) 0%,var(--warn) 22%,var(--good) 46%,#1E6B43 100%);
  transition:height .06s linear}

/* the filters — shown because they are on the strip, not operated here.
   Everything about them is deliberately dormant: no accent colour, dashed
   curve, a "ref" chip and a line of copy saying where they actually live. */
#p-arcade .csmod .refchip{
  font-size:7px;letter-spacing:.12em;color:var(--faint,#6B655E);
  border:1px solid #35353B;border-radius:2px;padding:1px 4px}
#p-arcade .csnote{
  background:#0B0B0E;margin:0;padding:10px 11px 12px;
  font-family:var(--mono);font-size:8.5px;line-height:1.65;color:var(--faint,#6B655E)}
#p-arcade .csnote b{color:var(--muted)}
#p-arcade .csmod.ref{background:linear-gradient(180deg,#131317,#0D0D10);cursor:default;opacity:.82}
#p-arcade .csmod.ref .csk{color:var(--faint,#6B655E)}
#p-arcade .csmod.ref .csv b{color:var(--muted)}
#p-arcade a.csmod.ref{cursor:pointer}
#p-arcade a.csmod.ref:hover{background:linear-gradient(180deg,#191922,#0D0D10)}
#p-arcade a.csmod.ref:hover{opacity:1}
#p-arcade a.csmod.ref:hover .csk{color:var(--muted)}
#p-arcade .cscurve{width:100%;max-width:110px;height:auto;display:block;
  border:1px solid #2A2A31;border-radius:2px;background:#0A0A0C}

/* the fader and the meters share whatever the strip does not use */
#p-arcade .gsright{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:stretch}
#p-arcade .gsright .gsmod{min-width:0;justify-content:center}
#p-arcade .gsright .gsmeters{justify-content:center;width:100%;padding-left:0}

/* the trim knob was sized for a full-width row; inside a 210px strip it
   needs to come down or it swallows the module */
#p-arcade .chstrip .trimknob .knob{width:74px;height:74px}
#p-arcade .chstrip .trimknob .knob::before{inset:8px}
#p-arcade .chstrip .trimknob .knob i{width:2.5px;height:23px;top:7px;transform-origin:50% 30px}
#p-arcade .chstrip .trimknob .kslot{width:auto}
#p-arcade .chstrip .trimknob .klab{font-size:8.5px;letter-spacing:.18em}
#p-arcade .chstrip .trimknob .kval{font-size:17px;margin-top:6px}
#p-arcade .chstrip .csmeter{height:86px}

/* The fader and the meters were drawn for a cramped row and looked lost
   once they had a column each. Scale them to the space they now own. */
#p-arcade .gsright .fv{width:100%}
/* the printed dB scale beside the track */
#p-arcade .fv .frow{display:flex;align-items:stretch;justify-content:center;gap:9px}
#p-arcade .fv .fscale{position:relative;width:26px;flex:0 0 auto}
#p-arcade .fv .ft{
  position:absolute;right:0;transform:translateY(50%);
  font-family:var(--mono);font-size:9px;letter-spacing:.04em;color:#8C8A95;
  white-space:nowrap;line-height:1}
#p-arcade .fv .ft::after{
  content:"";position:absolute;right:-7px;top:50%;width:5px;height:1px;background:#3A3A42}
#p-arcade .fv .ft.unity{color:var(--warn);font-weight:600}
#p-arcade .fv .ft.unity::after{background:var(--warn);width:7px;right:-9px}
#p-arcade .gsright .fv .track{height:300px;width:40px;border-radius:4px}
#p-arcade .gsright .fv .track::before{width:4px;margin-left:-2px;top:12px;bottom:12px}
#p-arcade .gsright .fv .cap{height:30px;left:-7px;right:-7px;border-radius:4px}
#p-arcade .gsright .fv .cap::after{top:14px;height:3px}
#p-arcade .gsright .fv .lab{font-size:10px;letter-spacing:.22em;margin-top:14px}
#p-arcade .gsright .fv .num{font-family:var(--display);font-size:24px;color:#F3E4C4;margin-top:6px}

#p-arcade .gsright .gsmeters{gap:22px}
#p-arcade .gsright .ladder{width:58px}
#p-arcade .gsright .ladder .cells{gap:3px;padding:7px;border-radius:4px}
#p-arcade .gsright .ladder .cells i{height:9px;border-radius:2px}
#p-arcade .gsright .ladder .cap{font-size:9px;letter-spacing:.16em;margin-top:9px}
#p-arcade .gsright .ladder .val{font-family:var(--display);font-size:17px;color:#F3E4C4;margin-top:5px}

@media(max-width:820px){
  #p-arcade .gsdesk{grid-template-columns:1fr}
  #p-arcade .chstrip{flex-direction:row;flex-wrap:wrap}
  #p-arcade .chstrip .csh{width:100%}
  #p-arcade .csmod{flex:1;min-width:132px}
}
"""

JS = """
/* ---- the channel strip's filter thumbnails ----
   Drawn rather than photographed, so they stay legible at 110px and
   match whatever the HPF module says the recommended corner is. */
function gsCurve(cv,kind,fc){
  if(!cv) return;
  const g=cv.getContext("2d"), W=cv.width, H=cv.height;
  g.clearRect(0,0,W,H);
  g.fillStyle="#0A0A0C"; g.fillRect(0,0,W,H);
  g.strokeStyle="rgba(255,255,255,.05)"; g.lineWidth=1;
  for(let i=1;i<4;i++){ const x=W*i/4; g.beginPath(); g.moveTo(x,0); g.lineTo(x,H); g.stroke(); }
  const LO=20, HI=20000, L0=Math.log10(LO), SP=Math.log10(HI)-L0;
  const X=f=>(Math.log10(f)-L0)/SP*W;
  /* fc null means "not set" — draw a flat line, which is what OUT looks like */
  const resp=f=>{
    if(!fc) return 0;
    const r=f/fc;
    if(kind==="hp") return 10*Math.log10(Math.pow(r,4)/(1+Math.pow(r,4)));
    return 10*Math.log10(1/(1+Math.pow(r,4)));
  };
  const Y=db=>H-6-(Math.max(-30,db)+30)/32*(H-12);
  g.beginPath(); g.moveTo(0,H);
  for(let x=0;x<=W;x+=2){ const f=Math.pow(10,L0+x/W*SP); g.lineTo(x,Y(resp(f))); }
  g.lineTo(W,H); g.closePath();
  /* muted, and dashed — an engaged filter would be solid and lit. This is
     a reference read-out, and it should never look like it is doing work. */
  g.fillStyle="rgba(150,150,162,.10)"; g.fill();
  g.beginPath();
  for(let x=0;x<=W;x+=2){ const f=Math.pow(10,L0+x/W*SP); const y=Y(resp(f)); x?g.lineTo(x,y):g.moveTo(x,y); }
  g.strokeStyle="#9A98A4"; g.lineWidth=2.5; g.setLineDash([5,4]); g.stroke(); g.setLineDash([]);
  if(fc){
    g.strokeStyle="rgba(124,122,133,.45)"; g.lineWidth=1;
    g.beginPath(); g.moveTo(X(fc),0); g.lineTo(X(fc),H); g.stroke();
  }
}

/* the strip's own input meter, and the reference filter values.
   These two panels are DISPLAY ONLY. Nothing here is wired to the audio
   graph — they are on the strip because they are on the strip, and the
   place to actually operate them is the HPF Lab.

   The first version read S.band and showed it as the channel HPF. That
   was wrong: a band-limited source like the kick is carved out of the
   drum stem at 30-160 Hz to make the source exist at all, which is a
   completely different thing from a filter an operator set. Showing the
   two under one label implied this screen was filtering when it is not. */
function gsStrip(){
  const S=(typeof gsrcOf==="function")?gsrcOf(gsSrc):null;
  if(!S) return;
  const nm=document.getElementById("gsChName");
  if(nm) nm.textContent=S.n.toUpperCase();
  const no=document.getElementById("gsChNo");
  if(no){
    const i=GSRC.findIndex(x=>x.k===gsSrc);
    no.textContent="CH "+String((i<0?0:i)+1).padStart(2,"0");
  }

  /* the corner the HPF module recommends for this source, so the two
     modules never print different numbers for the same channel */
  let hp = 80;
  if(typeof HPSRC!=="undefined"){
    const h=HPSRC.find(x=>x.stem===S.stem);
    if(h) hp=h.rec;
  }
  const hv=document.getElementById("gsHpfVal");
  if(hv) hv.textContent=Math.round(hp);
  gsCurve(document.getElementById("gsHpfCurve"),"hp",hp);
  gsCurve(document.getElementById("gsLpfCurve"),"lp",null);

  const m=document.querySelector("#gsStripMeter i");
  if(m){
    const live=gsV?gsV.chanPeak():-90;
    m.style.height=Math.max(0,Math.min(100,(live+60)/60*100))+"%";
  }
}
"""
