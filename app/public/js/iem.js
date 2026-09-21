/* Stem manifest. The audio lives in /audio/iem/ as ordinary cached
   files rather than 10 MB of base64 inside the page. */
var EMBED=[["BASS.webm", "/audio/iem/bass.webm"], ["CLICK.webm", "/audio/iem/click.webm"], ["CUE.webm", "/audio/iem/cue.webm"], ["EG1.webm", "/audio/iem/eg1.webm"], ["EG2.webm", "/audio/iem/eg2.webm"], ["GUITAR TRACKS.webm", "/audio/iem/guitar-tracks.webm"], ["HI-HAT.webm", "/audio/iem/hi-hat.webm"], ["KEYS.webm", "/audio/iem/keys.webm"], ["KICK.webm", "/audio/iem/kick.webm"], ["MUSIC TRACKS.webm", "/audio/iem/music-tracks.webm"], ["OVERHEAD L.webm", "/audio/iem/overhead-l.webm"], ["OVERHEAD R.webm", "/audio/iem/overhead-r.webm"], ["PADS TRACKS.webm", "/audio/iem/pads-tracks.webm"], ["PERC TRACKS.webm", "/audio/iem/perc-tracks.webm"], ["SNARE.webm", "/audio/iem/snare.webm"], ["SYNTH BASS TRACKS.webm", "/audio/iem/synth-bass-tracks.webm"], ["TOM 1.webm", "/audio/iem/tom-1.webm"], ["TOM 3.webm", "/audio/iem/tom-3.webm"], ["TOM2.webm", "/audio/iem/tom2.webm"], ["VOX 1.webm", "/audio/iem/vox-1.webm"], ["VOX 2.webm", "/audio/iem/vox-2.webm"], ["VOX 3.webm", "/audio/iem/vox-3.webm"], ["VOX 5.webm", "/audio/iem/vox-5.webm"], ["VOX 6.webm", "/audio/iem/vox-6.webm"], ["VOX TRACKS.webm", "/audio/iem/vox-tracks.webm"], ["VOX4.webm", "/audio/iem/vox4.webm"]];


(function(){
"use strict";

/* This module used to own the whole page. Inside the site it is one route
   among several, so every document- and window-level handler below is gated
   on the IEM page actually being visible — otherwise its spacebar shortcut
   would hijack the sign-in form and its drop handler would swallow files
   anywhere on the site. */
function iemOn(){
  var p=document.getElementById("p-iem");
  return !!p && !p.hidden;
}

var CH = [
  ["Kick","DRUMS",0],["Snare","DRUMS",0],["Hi-Hats","DRUMS",0],
  ["Tom 1","DRUMS",0],["Tom 2","DRUMS",0],["Tom 3","DRUMS",0],
  ["OH L","DRUMS",0],["OH R","DRUMS",0],
  ["Bass","BAND",0],["EG1","BAND",1],["EG2","BAND",1],
  ["Acoustic Gtr","BAND",0],["Keys","BAND",1],
  ["VOX 1","VOX",0],["VOX 2","VOX",0],["VOX 3","VOX",0],
  ["VOX 4","VOX",0],["VOX 5","VOX",0],["VOX 6","VOX",0],
  ["MD Talkback","COMMS",0],["MC","COMMS",0],["Click","COMMS",0],["Cue","COMMS",0],
  ["Music Trax","TRACKS",1],["Guitar Trax","TRACKS",1],["Perc Trax","TRACKS",1],
  ["Pad Trax","TRACKS",1],["Vox Trax","TRACKS",1],["Synth Bass","TRACKS",0]
];
var BANKS=["DRUMS","BAND","VOX","COMMS","TRACKS"];
/* Plate colours from the redesign. Still the dLive scheme \u2014 drums red,
   band green, bass orange, vox pink, comms white, tracks blue \u2014 but
   desaturated to sit on the cool slate ground instead of glowing off it. */
var PLATE={
  red:    ["#ef7a70","#e2574c","#a8362d"],
  green:  ["#74c78e","#4caf6e","#2f7a4a"],
  orange: ["#f0b268","#e0a33c","#a6721f"],
  pink:   ["#ef92c0","#e56aa8","#a84174"],
  white:  ["#eef2f7","#d7dee8","#a8b2c0"],
  blue:   ["#7cbcff","#54b0ff","#2a6fb8"]
};
function plateFor(s2){
  if(s2.name==="Bass") return "orange";
  if(s2.bank==="DRUMS")  return "red";
  if(s2.bank==="BAND")   return "green";
  if(s2.bank==="VOX")    return "pink";
  if(s2.bank==="COMMS")  return "white";        /* MD Talkback, MC, Click, Cue */
  return "blue";                                 /* Tracks */
}
var PRESET={ names:["Drums","Band","Vocals","Tracks"],
             map:[0,0,0,0,0,0,0,0, 1,1,1,1,1, 2,2,2,2,2,2, 2,2, 3,3,3,3,3,3,3,3] };

var UNITY=0.78;
function posToDb(p){
  if(p<=0.001) return -Infinity;
  if(p>=UNITY) return (p-UNITY)/(1-UNITY)*10;
  var t=p/UNITY; return -60*Math.pow(1-t,1.9);
}
function dbToGain(d){ return d===-Infinity?0:Math.pow(10,d/20); }
function dbToPos(db){ return db>=0 ? UNITY+db/10*(1-UNITY) : (1-Math.pow(-db/60,1/1.9))*UNITY; }
function fmtDb(d){ if(d===-Infinity||d<-59.5) return "-∞"; return (d>0?"+":"")+d.toFixed(1); }

var st = CH.map(function(c,i){
  var dp = c[0]==="OH L" ? -0.7 : (c[0]==="OH R" ? 0.7 : 0);
  return {i:i,name:c[0],bank:c[1],stereo:!!c[2],defPan:dp,
          pos:0,pan:dp,bass:0,treb:0,mute:false,solo:false,grp:-1,buf:null,file:null,pots:null};
});
var groups=[0,1,2,3].map(function(g){ return {name:PRESET.names[g],pos:UNITY,mute:false}; });

/* ================= SAVING MIXES =================
   No accounts and no server: the mix lives in this browser, and a short
   code carries it to anyone else. Declaring the shared store would make the
   artifact org-internal and break the public link, which is not worth it. */
var MIXKEY="iemMixes", AUTOKEY="iemAutosave";

function captureMix(){
  var c={};
  st.forEach(function(x){
    if(x.pos!==0 || x.pan!==x.defPan || x.bass!==0 || x.treb!==0 || x.mute)
      c[x.i]=[Math.round(x.pos*1000), Math.round(x.pan*100),
              Math.round(x.bass*10), Math.round(x.treb*10), x.mute?1:0];
  });
  return {v:1, m:Math.round(masterPos*1000),
          g:groups.map(function(g){ return [g.name, Math.round(g.pos*1000), g.mute?1:0]; }),
          a:st.map(function(x){ return x.grp; }),
          c:c};
}
function applyMix(o){
  if(!o||o.v!==1) return false;
  st.forEach(function(x){
    var d=o.c && o.c[x.i];
    x.pos = d? d[0]/1000 : 0;
    x.pan = d? d[1]/100  : x.defPan;
    x.bass= d? d[2]/10   : 0;
    x.treb= d? d[3]/10   : 0;
    x.mute= d? !!d[4]    : false;
    x.solo= false;
    if(o.a && typeof o.a[x.i]==="number") x.grp=o.a[x.i];
  });
  if(o.g) o.g.forEach(function(g,i){
    if(!groups[i]) return;
    groups[i].name=g[0]||groups[i].name; groups[i].pos=g[1]/1000; groups[i].mute=!!g[2];
  });
  if(typeof o.m==="number"){ masterPos=o.m/1000; applyMaster(); }
  applyAll(); paintChans(); buildGroupsView(); buildTabs();
  return true;
}
function b64enc(str){ return btoa(unescape(encodeURIComponent(str))).replace(/=+$/,""); }
function b64dec(b64){ return decodeURIComponent(escape(atob(b64))); }
function mixToCode(o){ return "AWK1-"+b64enc(JSON.stringify(o)); }
function codeToMix(code){
  try{
    code=(code||"").trim().replace(/\s+/g,"");
    if(code.indexOf("AWK1-")!==0) return null;
    return JSON.parse(b64dec(code.slice(5)));
  }catch(e){ return null; }
}

/* ---- local storage ---- */
function lsGet(k,def){ try{ var v=localStorage.getItem(k); return v?JSON.parse(v):def; }catch(e){ return def; } }
function lsSet(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }

var autoT=null;
function autosave(){
  clearTimeout(autoT);
  autoT=setTimeout(function(){ lsSet(AUTOKEY,{at:Date.now(),mix:captureMix()}); },700);
}
function savedMixes(){ return lsGet(MIXKEY,[]); }
function saveMixNamed(name){
  var list=savedMixes();
  list.unshift({id:Date.now()+"", name:name, at:Date.now(), mix:captureMix()});
  lsSet(MIXKEY,list.slice(0,40));
}

/* ---------- linked pairs: one instrument on two channels ----------
   Level, EQ, mute and solo mirror. Pan deliberately does NOT — the whole
   point of splitting overheads is that they sit at opposite sides. */
var LINK={};
(function(){
  [["OH L","OH R"]].forEach(function(pr){
    var a=-1,b=-1;
    st.forEach(function(x){ if(x.name===pr[0])a=x.i; if(x.name===pr[1])b=x.i; });
    if(a>=0&&b>=0){ LINK[a]=b; LINK[b]=a; }
  });
})();
function partner(i){ return LINK[i]===undefined ? -1 : LINK[i]; }
function mirror(i,fields){
  var j=partner(i); if(j<0) return -1;
  fields.forEach(function(k){ st[j][k]=st[i][k]; });
  applyChan(j); paintChan(j);
  return j;
}

var isMobile = (window.matchMedia && matchMedia("(pointer:coarse)").matches) || innerWidth<820;
var masterPos=UNITY;
var sel=0, view="ch", assignTab=0, playing=false, looping=true;

/* ---------- audio ---------- */
var ac=null,master=null,limiter=null,masterAn=null,nodes=[],startAt=0,offset=0,dur=0;
function ensureAudio(){
  if(ac) return;
  var AC=window.AudioContext||window.webkitAudioContext;
  /* phones decode into a third less RAM at 32 kHz — 29 channels of float adds up fast */
  try{ ac = isMobile ? new AC({sampleRate:32000}) : new AC(); }
  catch(e){ ac = new AC(); }
  master=ac.createGain(); master.gain.value=0.64;
  masterAn=ac.createAnalyser(); masterAn.fftSize=1024;
  limiter = ac.createDynamicsCompressor();
  limiter.threshold.value=-2.5; limiter.knee.value=0;
  limiter.ratio.value=20; limiter.attack.value=0.003; limiter.release.value=0.25;
  master.connect(limiter); limiter.connect(masterAn); limiter.connect(ac.destination);
  st.forEach(function(s,i){
    var g=ac.createGain(),p=ac.createStereoPanner(),
        b=ac.createBiquadFilter(),t=ac.createBiquadFilter(),an=ac.createAnalyser();
    b.type="lowshelf"; b.frequency.value=180;
    t.type="highshelf"; t.frequency.value=3800;
    an.fftSize=512;
    b.connect(t); t.connect(p); p.connect(g); g.connect(an); g.connect(master);
    nodes[i]={gain:g,pan:p,bass:b,treb:t,an:an,src:null,data:new Uint8Array(an.fftSize)};
    applyChan(i);
  });
}
function soloActive(){ return st.some(function(s){return s.solo}); }
function chanGain(i){
  var s=st[i];
  if(s.mute) return 0;
  if(soloActive()&&!s.solo) return 0;
  if(s.grp>=0&&groups[s.grp].mute) return 0;
  var g=dbToGain(posToDb(s.pos));
  if(s.grp>=0) g*=dbToGain(posToDb(groups[s.grp].pos));
  return g;
}
function applyChan(i){
  if(typeof autosave==='function') autosave();
  if(!ac) return;
  var n=nodes[i],s=st[i];
  n.gain.gain.setTargetAtTime(chanGain(i),ac.currentTime,.012);
  n.pan.pan.setTargetAtTime(s.pan,ac.currentTime,.02);
  n.bass.gain.setTargetAtTime(s.bass,ac.currentTime,.02);
  n.treb.gain.setTargetAtTime(s.treb,ac.currentTime,.02);
}
function applyAll(){ st.forEach(function(_,i){applyChan(i)}); if(typeof autosave==='function') autosave(); }
function applyMaster(){
  if(ac) master.gain.setTargetAtTime(dbToGain(posToDb(masterPos))*0.7, ac.currentTime, .02);
  paintMaster();
}
var mCaps=[],mDbEls=[],mWord=null,mWheel=null;
function paintMaster(){
  var db=posToDb(masterPos);
  mCaps.forEach(function(c){ c.style.bottom="calc(9px + "+(masterPos*100)+"% - "+(masterPos*18)+"px)"; });
  if(mWheel) mWheel.set(masterPos);
  if(mWord) mWord.textContent=levelWord(db);
  mDbEls.forEach(function(e){ e.textContent=fmtDb(db)+" dB"; });
  var bd=document.getElementById("masterDb"); if(bd) bd.textContent=fmtDb(db);
}
function stopSources(){ nodes.forEach(function(n){ if(n&&n.src){ try{n.src.stop()}catch(e){} n.src.disconnect(); n.src=null; } }); }
function startSources(at){
  stopSources();
  st.forEach(function(s,i){
    if(!s.buf) return;
    var src=ac.createBufferSource();
    src.buffer=s.buf; src.loop=looping;
    src.connect(nodes[i].bass);
    src.start(0,Math.min(at,s.buf.duration-0.02));
    nodes[i].src=src;
  });
}
function anyStem(){ return st.some(function(s){return s.buf}); }
function play(){
  ensureAudio();
  unlockAudio();
  if(ac.state==="suspended") ac.resume();
  if(!anyStem()) toast("No stems loaded yet — use Load Stems");
  startSources(offset); startAt=ac.currentTime-offset; playing=true; paintTransport();
}
function pause(){ if(!ac) return; offset=now(); stopSources(); playing=false; paintTransport(); }
function now(){
  if(!ac||!playing) return offset;
  var t=ac.currentTime-startAt;
  if(dur>0) t=looping?(t%dur):Math.min(t,dur);
  return t;
}

/* ---------- stems ---------- */
function norm(s){ return s.toLowerCase().replace(/\.[a-z0-9]+$/,"").replace(/[^a-z0-9]+/g," ").trim(); }
var ALIAS={
  "kick":0,"kik":0,"bd":0,"snare":1,"sd":1,"sn":1,"hat":2,"hats":2,"hi hats":2,"hh":2,
  "tom 1":3,"tom1":3,"rack tom":3,"tom 2":4,"tom2":4,"tom 3":5,"tom3":5,"floor tom":5,
  "oh l":6,"ohl":6,"oh left":6,"overhead l":6,"overheads l":6,"oh 1":6,
  "oh r":7,"ohr":7,"oh right":7,"overhead r":7,"overheads r":7,"oh 2":7,
  "oh":6,"overhead":6,"overheads":6,"cymbals":6,
  "bass":8,"bass gtr":8,"bass guitar":8,
  "eg1":9,"eg 1":9,"electric 1":9,"gtr 1":9,"eg2":10,"eg 2":10,"electric 2":10,"gtr 2":10,
  "acoustic":11,"acoustic guitar":11,"ag":11,"keys":12,"key":12,"piano":12,
  "vox 1":13,"vox1":13,"lead vox":13,"vox 2":14,"vox2":14,"vox 3":15,"vox3":15,
  "vox 4":16,"vox4":16,"vox 5":17,"vox5":17,"vox 6":18,"vox6":18,
  "md":19,"talkback":19,"md talkback":19,"mc":20,"click":21,"met":21,"cue":22,"guide":22,
  "music":23,"music tracks":23,"trax":23,"guitar tracks":24,"guitar trax":24,
  "perc":25,"percussion":25,"perc tracks":25,
  "pad":26,"pads":26,"pad tracks":26,"pad trax":26,
  "vox tracks":27,"vox trax":27,"bgv tracks":27,"vocal tracks":27,
  "synth bass":28,"sub":28
};
function matchChannel(f){
  var k=norm(f).replace(/^\d+[\s]*/,"");
  if(ALIAS[k]!==undefined) return ALIAS[k];
  for(var i=0;i<st.length;i++) if(norm(st[i].name)===k) return i;
  var best=-1,bl=0;
  Object.keys(ALIAS).forEach(function(a){ if(k.indexOf(a)>=0&&a.length>bl){bl=a.length;best=ALIAS[a];} });
  return best;
}
function loadFiles(files){
  ensureAudio();
  var arr=[].slice.call(files),hits=0,done=0;
  if(!arr.length) return;
  arr.forEach(function(f){
    var idx=matchChannel(f.name),fr=new FileReader();
    fr.onload=function(){
      ac.decodeAudioData(fr.result,function(buf){
        if(idx>=0){ st[idx].buf=buf; st[idx].file=f.name; hits++; }
        dur=Math.max(dur,buf.duration);
        if(++done===arr.length) afterLoad(hits,arr.length);
      },function(){ if(++done===arr.length) afterLoad(hits,arr.length); });
    };
    fr.readAsArrayBuffer(f);
  });
}
function afterLoad(hits,total){
  paintLoadList(); paintChans();
  toast(hits+" of "+total+" file"+(total>1?"s":"")+" matched to channels");
  if(playing){ startSources(now()); startAt=ac.currentTime-offset; }
}
function paintLoadList(){
  var loaded=st.filter(function(s){return s.buf}),el=document.getElementById("loadlist");
  el.innerHTML = loaded.length
    ? loaded.length+" of "+st.length+" channels armed<br>"+loaded.map(function(s){return "<s>"+s.name+"</s>"}).join(" · ")
    : "Nothing loaded yet. Every fader, knob and group still responds, so the board is worth exploring silent.";
}

/* ---------- knob ---------- */
function makeKnob(host,val,min,max,fmt,onchange,size,cls,resetVal){
  /* size is styled in CSS, not inline — inline beats media queries */
  var span=max-min, mid=(min<0&&max>0)?0:min;
  var reset = (resetVal===undefined) ? mid : resetVal;   /* 0 dB for a level wheel, centre for pan, flat for EQ */
  function ang(v){ return -135+(v-min)/span*270; }
  host.innerHTML =
    '<svg viewBox="0 0 100 100" aria-hidden="true">'+
      '<circle cx="50" cy="50" r="37" fill="none" stroke="#26262D" stroke-width="8" stroke-linecap="round" stroke-dasharray="174 233" transform="rotate(135 50 50)"/>'+
      '<path class="arc" fill="none" stroke="var(--accent)" stroke-width="8" stroke-linecap="round"/>'+
      '<circle cx="50" cy="50" r="25" fill="#1D1D24" stroke="#33333d" stroke-width="1.5"/>'+
      '<line class="ptr" x1="50" y1="50" x2="50" y2="26" stroke="#F5F3EF" stroke-width="4" stroke-linecap="round"/>'+
    '</svg>'+
    '<div class="'+(cls||"kv")+'"></div>';
  var svg=host.querySelector("svg"),arc=host.querySelector(".arc"),
      ptr=host.querySelector(".ptr"),kv=host.querySelector("."+(cls||"kv"));
  var cur=val;
  function polar(a,r){ var rad=(a-90)*Math.PI/180; return [50+r*Math.cos(rad),50+r*Math.sin(rad)]; }
  function render(){
    var a0=ang(mid),a1=ang(cur);
    var s=polar(Math.min(a0,a1),37),e=polar(Math.max(a0,a1),37);
    var big=Math.abs(a1-a0)>180?1:0;
    arc.setAttribute("d",Math.abs(a1-a0)<0.6?"":"M"+s[0]+" "+s[1]+" A37 37 0 "+big+" 1 "+e[0]+" "+e[1]);
    ptr.setAttribute("transform","rotate("+ang(cur)+" 50 50)");
    kv.innerHTML=fmt(cur);
    host.classList.toggle("act",Math.abs(cur-mid)>0.02);
  }
  var drag=false,sy=0,sv=0;
  var lastTap=0, lastX=0, lastY=0;
  function doReset(){ cur=reset; render(); onchange(cur); }
  host.addEventListener("pointerdown",function(e){
    /* double-tap / double-click -> back to 0 dB (works on touch, where dblclick is unreliable) */
    var t=Date.now();
    if(t-lastTap<340 && Math.abs(e.clientX-lastX)<30 && Math.abs(e.clientY-lastY)<30){
      lastTap=0; drag=false;
      host.classList.remove("grabbing");
      try{ host.releasePointerCapture(e.pointerId); }catch(err){}
      doReset(); e.preventDefault(); e.stopPropagation();
      return;
    }
    lastTap=t; lastX=e.clientX; lastY=e.clientY;
    drag=true;host.classList.add("grabbing");host.setPointerCapture(e.pointerId);sy=e.clientY;sv=cur;e.preventDefault();e.stopPropagation();
  });
  host.addEventListener("pointermove",function(e){
    if(!drag) return;
    cur=Math.max(min,Math.min(max,sv+(sy-e.clientY)/150*span)); render(); onchange(cur);
  });
  host.addEventListener("pointerup",function(){drag=false;host.classList.remove("grabbing")});
  host.addEventListener("pointercancel",function(){drag=false;host.classList.remove("grabbing")});
  host.addEventListener("dblclick",function(e){ e.stopPropagation(); doReset(); });
  render();
  return {set:function(v){cur=v;render();}};
}
function fmtPan(v){ return '<i>Pan</i>'+(Math.abs(v)<0.02 ? "C" : (v<0?"L":"R")+Math.round(Math.abs(v)*100)); }
function fmtBass(v){ return '<i>Bass</i>'+(v>0?"+":"")+Math.round(v); }
function fmtTreb(v){ return '<i>Treb</i>'+(v>0?"+":"")+Math.round(v); }


/* ---------- scenarios: a starting mix for a real person ---------- */
var SCENARIOS = [
  {key:"drummer", who:"I'm the drummer", role:"Drums",
   note:"You need time before you need tone. The click sits on top, your own kit under it, and the bass close behind — everything else is context.",
   mix:{0:-2,1:-4,2:-9,3:-11,4:-11,5:-11,6:-8,7:-8,8:-2,9:-15,10:-17,11:-15,12:-12,13:-7,14:-15,19:-5,20:-8,21:0,22:-7,23:-11,26:-14,28:-8}},
  {key:"leader", who:"I'm the worship leader", role:"VOX 1",
   note:"Your own voice leads, your instrument sits under it, and the band is there to tell you where the song is. Most leaders want less click than they expect.",
   mix:{0:-11,1:-13,6:-14,7:-14,8:-10,11:-4,12:-8,13:0,14:-12,15:-14,19:-5,20:-8,21:-15,23:-13,26:-13,27:-13}},
  {key:"bass", who:"I'm on bass", role:"Bass",
   note:"Kick and bass are one instrument from where you're standing. Get those two locked first — the rest of the kit is only there for the fills.",
   mix:{0:-1,1:-9,2:-15,6:-12,7:-12,8:-2,11:-15,12:-12,13:-8,19:-5,21:-4,23:-13,26:-15,28:-6}},
  {key:"bgv", who:"I'm singing BGV", role:"VOX 3",
   note:"You need to hear the lead more than you need to hear yourself. Pitch comes from keys and acoustic, not from the drums.",
   mix:{0:-13,8:-13,11:-10,12:-8,13:-4,14:-11,15:-1,19:-5,20:-8,21:-11,23:-13,26:-11,27:-9}},
  {key:"blank", who:"Start from silence", role:"Everything down",
   note:"Nothing is up. Bring things in one at a time and stop the moment you can do your job — that restraint is the whole skill.",
   mix:{}}
];
var scnActive=null;
function applyScenario(k){
  var sc=null; SCENARIOS.forEach(function(x){ if(x.key===k) sc=x; });
  if(!sc) return;
  scnActive=k;
  st.forEach(function(s2){
    var db = sc.mix[s2.i];
    s2.pos = (db===undefined) ? 0 : dbToPos(db);
    s2.pan=s2.defPan; s2.mute=false; s2.solo=false;
  });
  groups.forEach(function(g){ g.pos=UNITY; g.mute=false; });
  masterPos=UNITY; applyMaster();
  applyAll(); paintChans(); updateGroups(); buildScenarios();
  var n=document.getElementById("scnNote");
  n.textContent=sc.note; n.hidden=false;
}
function buildScenarios(){
  var host=document.getElementById("scenarios"); if(!host) return;
  host.innerHTML="";
  SCENARIOS.forEach(function(sc){
    var b=document.createElement("button");
    b.className="scn"+(scnActive===sc.key?" on":"");
    b.innerHTML='<b>'+sc.who+'</b><span>'+sc.role+'</span>';
    b.onclick=function(){ applyScenario(sc.key); };
    host.appendChild(b);
  });
}

/* plain-language level word */
function levelWord(db){
  if(db===-Infinity||db<-45) return "Off";
  if(db<-24) return "Barely there";
  if(db<-12) return "Quiet";
  if(db<-3)  return "Down a bit";
  if(db<=3)  return "Normal";
  if(db<=7)  return "Loud";
  return "Very loud";
}

/* ---------- board ---------- */
var wall=document.getElementById("wall");
function buildWall(){
  wall.innerHTML="";

  BANKS.forEach(function(b){
    var bank=document.createElement("div"); bank.className="bank"; bank.dataset.bank=b;
    var mk=document.createElement("div"); mk.className="bankmark"; mk.textContent=b;
    bank.appendChild(mk);
    st.forEach(function(s){ if(s.bank===b) bank.appendChild(buildChan(s)); });
    wall.appendChild(bank);
  });
  wall.appendChild(buildMasterStrip());
  buildBankNav();
  applyBank();
}

/* ===== Bank nav =====
   29 strips will not fit on any screen worth designing for, so the wall shows
   one bank at a time. "All" is still there for anyone who wants the full board. */
var BANKC={DRUMS:"#e2574c",BAND:"#4caf6e",VOX:"#e56aa8",COMMS:"#d7dee8",TRACKS:"#54b0ff"};
var curBank="DRUMS";
function buildBankNav(){
  var nav=document.getElementById("banknav");
  if(!nav) return;
  nav.hidden=false; nav.innerHTML="";
  ["ALL"].concat(BANKS).forEach(function(b){
    var btn=document.createElement("button");
    btn.className="bkbtn"; btn.dataset.bank=b;
    btn.style.setProperty("--bkc", b==="ALL" ? "#4da3ff" : BANKC[b]);
    btn.innerHTML='<i></i><span>'+b+'</span>';
    btn.onclick=function(){ curBank=b; applyBank(); };
    nav.appendChild(btn);
  });
  var note=document.createElement("span");
  note.className="bknote";
  note.textContent=CH.length+" channels \u00b7 tap a bank";
  nav.appendChild(note);
}
function applyBank(){
  var nav=document.getElementById("banknav");
  if(nav) Array.prototype.forEach.call(nav.querySelectorAll(".bkbtn"),function(b){
    b.classList.toggle("on", b.dataset.bank===curBank);
  });
  Array.prototype.forEach.call(wall.querySelectorAll(".bank"),function(b){
    b.hidden = !(curBank==="ALL" || b.dataset.bank===curBank);
  });
  wall.scrollLeft=0;
}
function buildMasterStrip(){
  var host=document.createElement("div"); host.className="masterch";
  var el=document.createElement("div"); el.className="ch";
  el.innerHTML =
    '<div class="mplate"><div class="n">Master</div><div class="t">VOLUME</div></div>'+
    '<div class="grptag">everything</div>'+
    '<div class="faderbox">'+
      '<div class="ledmeter"><i class="mled"></i></div>'+
      '<div class="fslot" id="mSlot"><div class="ticks"></div><div class="unity"></div><div class="cap"></div></div>'+
    '</div>'+
    '<div class="db" id="mDb1"></div>';
  host.appendChild(el);
  var slot=el.querySelector("#mSlot");
  slot.querySelector(".unity").style.bottom="calc(9px + "+(UNITY*100)+"% - "+(UNITY*18)+"px)";
  mCaps.push(slot.querySelector(".cap"));
  bindMaster(slot);
  return host;
}
function bindMaster(tr){
  var drag=false,sy=0,sp=0;
  function set(p){ masterPos=Math.max(0,Math.min(1,p)); applyMaster(); }
  tr.addEventListener("pointerdown",function(e){ drag=true; tr.classList.add("grabbing"); tr.setPointerCapture(e.pointerId); sy=e.clientY; sp=masterPos; e.preventDefault(); });
  tr.addEventListener("pointermove",function(e){ if(!drag) return; set(sp+(sy-e.clientY)/Math.max(40,tr.getBoundingClientRect().height-18)); });
  tr.addEventListener("pointerup",function(){drag=false;tr.classList.remove("grabbing")});
  tr.addEventListener("pointercancel",function(){drag=false;tr.classList.remove("grabbing")});
  tr.addEventListener("dblclick",function(){ set(UNITY); });
}
function buildChan(s){
  var i=s.i,el=document.createElement("div");
  el.className="ch"; el.dataset.i=i;
  el.onclick=function(){ sel=i; paintChans(); };

  var nm=document.createElement("button"); nm.className="name";
  nm.onclick=function(ev){ ev.stopPropagation(); sel=i; paintChans(); if(shortScreen.matches) openChannelSheet(i); };
  var key=plateFor(s), cc=PLATE[key];
  if(key==="white") nm.classList.add("lite");
  if(partner(i)>=0) nm.classList.add("linked");
  nm.style.setProperty("--cc-lt",cc[0]);
  nm.style.setProperty("--cc",cc[1]);
  nm.style.setProperty("--cc-dk",cc[2]);
  /* the strip owns the colour too, so the fader cap line can pick it up */
  el.style.setProperty("--cc",cc[1]);
  /* Console 2.0 plate: channel name on top, its bank underneath */
  nm.innerHTML='<div class="t'+(s.stereo?" st":"")+'">'+s.name+'</div><div class="n">'+s.bank+'</div>';
  el.appendChild(nm);

  var gt=document.createElement("div"); gt.className="grptag"; el.appendChild(gt);

  var pots=document.createElement("div"); pots.className="pots";
  var pPan=document.createElement("div"); pPan.className="pot";
  var pBas=document.createElement("div"); pBas.className="pot";
  var pTre=document.createElement("div"); pTre.className="pot";
  pots.appendChild(pPan); pots.appendChild(pBas); pots.appendChild(pTre);
  el.appendChild(pots);
  s.pots={
    pan: makeKnob(pPan,s.pan,-1,1,fmtPan,function(v){ s.pan=Math.abs(v)<0.02?0:v; applyChan(i); },34,null,s.defPan),
    bass:makeKnob(pBas,s.bass,-12,12,fmtBass,function(v){ s.bass=v; applyChan(i); mirror(i,["bass"]); },34,null,0),
    treb:makeKnob(pTre,s.treb,-12,12,fmtTreb,function(v){ s.treb=v; applyChan(i); mirror(i,["treb"]); },34,null,0)
  };

  var cr=document.createElement("div"); cr.className="chip-row";
  var mb=document.createElement("button"); mb.className="chip mute"; mb.textContent="MUTE";
  mb.onclick=function(e){ e.stopPropagation(); s.mute=!s.mute; mirror(i,["mute"]); applyAll(); paintChans(); };
  var sb=document.createElement("button"); sb.className="chip solo"; sb.textContent="SOLO";
  sb.onclick=function(e){ e.stopPropagation(); s.solo=!s.solo; mirror(i,["solo"]); applyAll(); paintChans(); };
  cr.appendChild(mb); cr.appendChild(sb); el.appendChild(cr);

  var fb=document.createElement("div"); fb.className="faderbox";

  var lm=document.createElement("div"); lm.className="ledmeter";
  lm.innerHTML='<i class="meter"></i>';
  fb.appendChild(lm);

  var sl=document.createElement("div"); sl.className="fslot";
  sl.innerHTML='<div class="ticks"></div><div class="unity"></div><div class="cap"></div>';
  sl.querySelector(".unity").style.bottom="calc(9px + "+(UNITY*100)+"% - "+(UNITY*18)+"px)";
  bindFader(sl,i); fb.appendChild(sl); el.appendChild(fb);

  var db=document.createElement("div"); db.className="db"; el.appendChild(db);
  return el;
}
function bindFader(tr,i){
  var drag=false,sy=0,sp=0;
  function set(p){ st[i].pos=Math.max(0,Math.min(1,p)); applyChan(i); paintChan(i); mirror(i,["pos"]); }
  tr.addEventListener("pointerdown",function(e){ drag=true; tr.classList.add("grabbing"); tr.setPointerCapture(e.pointerId); sy=e.clientY; sp=st[i].pos; sel=i; paintChans(); e.preventDefault(); });
  tr.addEventListener("pointermove",function(e){ if(!drag) return; set(sp+(sy-e.clientY)/Math.max(40,tr.getBoundingClientRect().height-18)); });
  tr.addEventListener("pointerup",function(){drag=false;tr.classList.remove("grabbing")});
  tr.addEventListener("pointercancel",function(){drag=false;tr.classList.remove("grabbing")});
  tr.addEventListener("dblclick",function(){ set(UNITY); });
}


var expOpen=-1, expRows={};
function buildExpansion(gi,host){
  host.innerHTML=""; expRows={};
  var list=st.filter(function(x){ return x.grp===gi; });
  if(!list.length){
    host.innerHTML='<div class="empty">No channels in this group yet — use Assign Groups</div>';
    return;
  }
  list.forEach(function(s2){
    var i=s2.i, cc=PLATE[plateFor(s2)];
    var row=document.createElement("div"); row.className="exrow";
    row.innerHTML =
      '<span class="ex-sw" style="background:'+cc[1]+'"></span>'+
      '<span class="ex-nm">'+s2.name+'</span>'+
      '<div class="ex-fad"><span class="ex-unity"></span><div class="ex-cap"></div></div>'+
      '<span class="ex-db"></span>'+
      '<button class="ex-mute">M</button>';
    var fad=row.querySelector(".ex-fad"),
        cap=row.querySelector(".ex-cap"),
        db=row.querySelector(".ex-db"),
        mu=row.querySelector(".ex-mute");
    row.querySelector(".ex-unity").style.left="calc(11px + "+(UNITY*100)+"% - "+(UNITY*22)+"px)";
    mu.onclick=function(){ s2.mute=!s2.mute; mirror(i,["mute"]); applyAll(); paintChans(); };
    bindExFader(fad,i);
    expRows[i]={cap:cap,db:db,mute:mu};
    host.appendChild(row);
    paintChan(i);
  });
}
function bindExFader(el,i){
  var drag=false,sx=0,sp=0;
  function set(p){ st[i].pos=Math.max(0,Math.min(1,p)); applyChan(i); paintChan(i); mirror(i,["pos"]); }
  el.addEventListener("pointerdown",function(e){
    drag=true; el.setPointerCapture(e.pointerId); sx=e.clientX; sp=st[i].pos; e.preventDefault();
  });
  el.addEventListener("pointermove",function(e){
    if(!drag) return;
    set(sp+(e.clientX-sx)/Math.max(40,el.getBoundingClientRect().width-22));
  });
  el.addEventListener("pointerup",function(){drag=false});
  el.addEventListener("pointercancel",function(){drag=false});
  el.addEventListener("dblclick",function(){ set(UNITY); });
}

/* ---------- groups view ---------- */
var gWheels=[],gWord=[],gDb=[],gName=[],gCount=[],gCard=[],gMuteBtn=[];
function buildGroupsView(){
  var host=document.getElementById("gvGrid"); host.innerHTML="";
  mCaps=mCaps.filter(function(c){ return c.isConnected; }); mWheel=null; expRows={};
  gWheels=[];gWord=[];gDb=[];gName=[];gCount=[];gCard=[];gMuteBtn=[];
  groups.forEach(function(g,gi){
    var card=document.createElement("div"); card.className="gcard";
    var nm=document.createElement("input"); nm.className="gname"; nm.value=g.name; nm.maxLength=14;
    nm.oninput=function(){ g.name=nm.value||("Group "+(gi+1)); updateGroups(); paintChans(); buildTabs(); };
    var ct=document.createElement("div"); ct.className="gcount";
    var wh=document.createElement("div"); wh.className="wheel";
    var wd=document.createElement("div"); wd.className="gword";
    var db=document.createElement("div"); db.className="gdb";
    var mu=document.createElement("button"); mu.className="gmute"; mu.textContent="MUTE";
    mu.onclick=function(){ g.mute=!g.mute; applyAll(); updateGroups(); };
    var ex=document.createElement("button"); ex.className="gexpand"; ex.textContent="▾ Show faders";
    var exBox=document.createElement("div"); exBox.className="gexp"; exBox.hidden=true;
    ex.onclick=function(){
      if(expOpen===gi){ expOpen=-1; }
      else { expOpen=gi; }
      buildGroupsView();
    };
    var txt=document.createElement("div"); txt.className="gc-txt";
    txt.appendChild(nm); txt.appendChild(ct); txt.appendChild(wd); txt.appendChild(db);
    card.appendChild(txt); card.appendChild(wh); card.appendChild(mu); card.appendChild(ex); card.appendChild(exBox);
    if(expOpen===gi){
      card.classList.add("open"); ex.classList.add("on"); ex.textContent="▴ Hide faders";
      exBox.hidden=false; buildExpansion(gi,exBox);
    }
    host.appendChild(card);
    var k=makeKnob(wh,g.pos,0,1,function(){return "";},function(v){
      g.pos=v; applyAll();
      wd.textContent=levelWord(posToDb(v)); db.textContent=fmtDb(posToDb(v))+" dB";
      paintChans();
    },146,"gvhide",UNITY);
    gWheels.push(k); gWord.push(wd); gDb.push(db); gName.push(nm); gCount.push(ct); gCard.push(card); gMuteBtn.push(mu);
  });
  // master card sits alongside the four groups
  var mc=document.createElement("div"); mc.className="gcard master";
  var mn=document.createElement("div"); mn.className="gname"; mn.textContent="Master Volume";
  var mct=document.createElement("div"); mct.className="gcount"; mct.textContent="everything you hear";
  var mwh=document.createElement("div"); mwh.className="wheel";
  var mwd=document.createElement("div"); mwd.className="gword";
  var mdb=document.createElement("div"); mdb.className="gdb";
  var mtx=document.createElement("div"); mtx.className="gc-txt";
  mtx.appendChild(mn); mtx.appendChild(mct); mtx.appendChild(mwd); mtx.appendChild(mdb);
  mc.appendChild(mtx); mc.appendChild(mwh);
  host.appendChild(mc);
  mWheel = makeKnob(mwh,masterPos,0,1,function(){return "";},function(v){
    masterPos=v; applyMaster();
  },146,"gvhide",UNITY);
  mWord=mwd; mDbEls=[mdb];
  var d1=document.getElementById("mDb1"); if(d1) mDbEls.push(d1);
  paintMaster();
  updateGroups();
}
function updateGroups(){
  groups.forEach(function(g,gi){
    if(gName[gi]&&document.activeElement!==gName[gi]) gName[gi].value=g.name;
    var n=st.filter(function(s){return s.grp===gi}).length;
    if(gCount[gi]) gCount[gi].textContent = n ? n+" channel"+(n>1?"s":"") : "no channels yet";
    if(gWheels[gi]) gWheels[gi].set(g.pos);
    if(gWord[gi]) gWord[gi].textContent=levelWord(posToDb(g.pos));
    if(gDb[gi]) gDb[gi].textContent=fmtDb(posToDb(g.pos))+" dB";
    if(gCard[gi]) gCard[gi].classList.toggle("muted",g.mute);
    if(gMuteBtn[gi]) gMuteBtn[gi].classList.toggle("on",g.mute);
  });
}

/* ---------- assign overlay ---------- */
function buildTabs(){
  var host=document.getElementById("gtabs"); if(!host) return;
  host.innerHTML="";
  groups.forEach(function(g,gi){
    var t=document.createElement("div"); t.className="gtab"+(assignTab===gi?" on":"");
    var sw=document.createElement("span"); sw.className="sw";
    var inp=document.createElement("input"); inp.value=g.name; inp.maxLength=14;
    inp.oninput=function(){ g.name=inp.value||("Group "+(gi+1)); updateGroups(); paintChans(); };
    var em=document.createElement("em"); em.textContent=st.filter(function(s){return s.grp===gi}).length+" ch";
    t.appendChild(sw); t.appendChild(inp); t.appendChild(em);
    t.onclick=function(e){ if(e.target===inp) return; assignTab=gi; buildTabs(); buildPicker(); };
    host.appendChild(t);
  });
}
function buildPicker(){
  var host=document.getElementById("picker2"); host.innerHTML="";
  st.forEach(function(s){
    var b=document.createElement("button");
    b.className="pk"+(s.grp===assignTab?" mine":(s.grp>=0?" other":""));
    b.innerHTML='<b>'+s.name+'</b><span>Ip '+(s.i+1)+(s.grp>=0&&s.grp!==assignTab?' · '+groups[s.grp].name:'')+'</span>';
    b.onclick=function(){
      s.grp=(s.grp===assignTab)?-1:assignTab;
      applyAll(); buildPicker(); buildTabs(); updateGroups(); paintChans();
    };
    host.appendChild(b);
  });
}
function openAssign(){ document.getElementById("ovl").hidden=false; buildTabs(); buildPicker(); }
function closeAssign(){ document.getElementById("ovl").hidden=true; }
function applyPreset(){
  PRESET.map.forEach(function(g,i){ st[i].grp=g; });
  groups.forEach(function(g,gi){ g.name=PRESET.names[gi]; });
  applyAll(); buildTabs(); buildPicker(); updateGroups(); paintChans();
  toast("Standard preset applied — Drums, Band, Vocals, Tracks");
}

/* ---------- paint ---------- */
function paintChan(i){
  var el=wall.querySelector('.ch[data-i="'+i+'"]'); if(!el) return;
  var s=st[i];
  el.classList.toggle("sel",i===sel);
  el.querySelector(".cap").style.bottom="calc(9px + "+(s.pos*100)+"% - "+(s.pos*18)+"px)";
  /* the phone fader is a filled gradient column, so the slot needs to know
     where the handle is to dim everything above it */
  el.querySelector(".fslot").style.setProperty("--p",(s.pos*100)+"%");
  el.querySelector(".name").classList.toggle("noaudio",!s.buf);
  el.querySelector(".db").textContent=fmtDb(posToDb(s.pos));
  el.querySelector(".chip.mute").classList.toggle("on",s.mute);
  el.querySelector(".chip.solo").classList.toggle("on",s.solo);
  var gt=el.querySelector(".grptag");
  gt.textContent = s.grp>=0 ? groups[s.grp].name : "—";
  gt.classList.toggle("on",s.grp>=0);
  if(s.pots){ s.pots.pan.set(s.pan); s.pots.bass.set(s.bass); s.pots.treb.set(s.treb); }
  var er=expRows[i];
  if(er){
    er.cap.style.left="calc(11px + "+(s.pos*100)+"% - "+(s.pos*22)+"px)";
    er.db.textContent=fmtDb(posToDb(s.pos));
    er.mute.classList.toggle("on",s.mute);
  }
}
function paintChans(){ st.forEach(function(_,i){paintChan(i)}); }
function paintTransport(){
  var b=document.getElementById("btnPlay");
  b.classList.toggle("on",playing);
  b.innerHTML = playing
    ? '<svg viewBox="0 0 16 16"><path d="M3 2h4v12H3zM9 2h4v12H9z"/></svg><span>Pause</span>'
    : '<svg viewBox="0 0 16 16"><path d="M3 2l11 6-11 6z"/></svg><span>Play stems</span>';
  var lp=document.getElementById("btnLoop");
  lp.classList.toggle("on",looping);
  lp.innerHTML = looping ? "Loop\u2002ON" : "Loop\u2002OFF";
}
function setView(v){
  view=v;
  document.getElementById("wallwrap").hidden = v!=="ch";
  document.getElementById("gview").hidden = v!=="gr";
  var gd=document.getElementById("gdview"); if(gd) gd.hidden = v!=="gd";
  var ln=document.getElementById("lnview"); if(ln) ln.hidden = v!=="ln";
  var mg=document.getElementById("mgroups"); if(mg) mg.hidden = v!=="gr";
  var bn=document.getElementById("banknav"); if(bn) bn.hidden = v!=="ch";
  var pd=document.getElementById("pagedots"); if(pd) pd.hidden = v!=="ch";
  document.querySelectorAll("#viewsw button,#tabbar button").forEach(function(b){ b.classList.toggle("on",b.dataset.v===v); });
  if(v==="gr"){ updateGroups(); buildMobileGroups(); }
  if(v==="gd") buildGuided();
  if(v==="ln") buildLearn();
  if(v==="ch") paintDots();
}

/* ===== Mobile: M1 groups, M2 page dots, Learn =====
   The phone gets the same four groups as a 2x2 of ribbed wheels, because a
   volunteer can run a whole service from that screen with one thumb. */
var mgWheels=[], mgHeld=null;
function mgColour(gi){
  var mem=st.filter(function(x){ return x.grp===gi; });
  var tally={}; mem.forEach(function(x){ var k=plateFor(x); tally[k]=(tally[k]||0)+1; });
  var key="blue", best=0;
  Object.keys(tally).forEach(function(k){ if(tally[k]>best){best=tally[k];key=k;} });
  return PLATE[key][1];
}
function buildMobileGroups(){
  var host=document.getElementById("mgGrid"); if(!host) return;
  host.innerHTML=""; mgWheels=[];
  var role=document.getElementById("mgRole");
  var sc=null; SCENARIOS.forEach(function(x){ if(x.key===scnActive) sc=x; });
  if(role) role.textContent = sc ? sc.role : "Pick a seat in Learn";

  groups.forEach(function(g,gi){
    var w=document.createElement("div"); w.className="mwheel";
    w.style.setProperty("--wc",mgColour(gi));
    var lab=document.createElement("div"); lab.className="lab";
    lab.innerHTML='<i></i><b></b>';
    lab.querySelector("b").textContent=g.name;
    lab.onclick=function(){ g.mute=!g.mute; applyAll(); updateGroups(); buildMobileGroups(); };
    var body=document.createElement("div"); body.className="body";
    var halo=document.createElement("div"); halo.className="halo";
    var det=document.createElement("div"); det.className="det";
    body.appendChild(halo); body.appendChild(det);
    var read=document.createElement("div"); read.className="read";
    read.innerHTML="<b></b><span></span>";
    w.appendChild(lab); w.appendChild(body); w.appendChild(read);
    w.classList.toggle("muted",g.mute);
    host.appendChild(w);

    function paint(){
      var top=(1-g.pos)*100;
      det.style.top=top+"%"; halo.style.top=top+"%";
      var d=posToDb(g.pos);
      read.querySelector("b").textContent=levelWord(d);
      read.querySelector("span").textContent=fmtDb(d)+" dB";
    }
    /* a wheel is turned, so the gesture is vertical travel, not an absolute
       position \u2014 the same feel as the ME hardware it is copying */
    var drag=false, sy=0, sp=0;
    body.addEventListener("pointerdown",function(e){
      drag=true; body.setPointerCapture(e.pointerId); sy=e.clientY; sp=g.pos; e.preventDefault();
    });
    body.addEventListener("pointermove",function(e){
      if(!drag) return;
      g.pos=Math.max(0,Math.min(1,sp+(sy-e.clientY)/Math.max(60,body.getBoundingClientRect().height)));
      applyAll(); paint(); updateGroups();
    });
    body.addEventListener("pointerup",function(){ drag=false; });
    body.addEventListener("pointercancel",function(){ drag=false; });
    body.addEventListener("dblclick",function(){ g.pos=UNITY; applyAll(); paint(); updateGroups(); });
    paint();
    mgWheels.push(paint);
  });

  var mt=document.getElementById("mgMeter"), knob=document.getElementById("mgKnob");
  if(mt && !mt.dataset.bound){
    mt.dataset.bound="1";
    var mdrag=false, msy=0, msp=0;
    mt.addEventListener("pointerdown",function(e){ mdrag=true; mt.setPointerCapture(e.pointerId); msy=e.clientY; msp=masterPos; e.preventDefault(); });
    mt.addEventListener("pointermove",function(e){
      if(!mdrag) return;
      masterPos=Math.max(0,Math.min(1,msp+(msy-e.clientY)/Math.max(60,mt.getBoundingClientRect().height)));
      applyMaster(); paintMobileMaster();
    });
    mt.addEventListener("pointerup",function(){ mdrag=false; });
    mt.addEventListener("pointercancel",function(){ mdrag=false; });
    mt.addEventListener("dblclick",function(){ masterPos=UNITY; applyMaster(); paintMobileMaster(); });
  }
  var mm=document.getElementById("mgMute");
  if(mm && !mm.dataset.bound){
    mm.dataset.bound="1";
    /* there is no master-mute in the engine, so mute parks the master at the
       bottom and remembers where it was */
    mm.onclick=function(){
      if(mgHeld===null){ mgHeld=masterPos; masterPos=0; }
      else { masterPos=mgHeld; mgHeld=null; }
      applyMaster(); paintMobileMaster();
    };
  }
  paintMobileMaster();
}
function paintMobileMaster(){
  var knob=document.getElementById("mgKnob");
  if(knob) knob.style.top=((1-masterPos)*100)+"%";
  var mm=document.getElementById("mgMute");
  if(mm) mm.classList.toggle("on",mgHeld!==null);
}
function paintDots(){
  var host=document.getElementById("pagedots"); if(!host) return;
  var strips=wall.querySelectorAll(".bank:not([hidden]) .ch");
  var per=4, pages=Math.max(1,Math.ceil(strips.length/per));
  var page=0;
  if(strips.length){
    var w=strips[0].getBoundingClientRect().width+10;
    page=Math.round(wall.scrollLeft/Math.max(1,w*per));
  }
  host.innerHTML="";
  for(var k=0;k<pages;k++){
    var i=document.createElement("i");
    if(k===Math.min(page,pages-1)) i.className="on";
    host.appendChild(i);
  }
}
function buildLearn(){
  var host=document.getElementById("lnList"); if(!host) return;
  var chips=document.getElementById("lnChips");
  if(chips){
    chips.innerHTML="";
    SCENARIOS.forEach(function(x){
      var bt=document.createElement("button");
      bt.className="gd-chip"+(scnActive===x.key?" on":"");
      bt.textContent=x.who;
      bt.onclick=function(){ applyScenario(x.key); buildLearn(); buildMobileGroups(); };
      chips.appendChild(bt);
    });
  }
  host.innerHTML="";
  GUIDE.forEach(function(g,k){
    var li=document.createElement("li");
    li.innerHTML='<em>STEP '+(k+1)+' OF '+GUIDE.length+'</em><b></b><span></span>';
    li.querySelector("b").textContent=g[0];
    li.querySelector("span").textContent=g[1];
    host.appendChild(li);
  });
}

/* ===== Guided Cards =====
   Figma frame "B \u2014 Guided Cards". Same state as everything else: the card
   slider is the group fader, the Me card is a single channel, and the tiles
   are that channel's pan and tone. Nothing here holds a level of its own. */
var gdSel="me", gdCompare=false;
var GDTIPS={
  drummer:["Mute Band. Can you still hold the tempo?","Push Click up until it cuts, then back it off one notch.","Open Me and move Where it sits."],
  leader: ["Mute Drums. What do you lose?","Push Other Singers up \u2014 can you still hear yourself?","Open Me and move Where it sits."],
  bass:   ["Mute everything but Kick and Me.","Bring Drums back one notch at a time.","Open Me and take some brightness out."],
  bgv:    ["Mute Me. Can you still find your note?","Push the lead vocal up before pushing yourself up.","Open Me and move Where it sits."],
  blank:  ["Bring in what keeps you in time first.","Add whatever tells you where you are in the song.","Put yourself in last, and only until you can hear yourself."]
};
function gdMeIndex(){
  var role=null; SCENARIOS.forEach(function(x){ if(x.key===scnActive) role=x.role; });
  var idx=-1;
  st.forEach(function(x){ if(role && x.name.toLowerCase()===String(role).toLowerCase()) idx=x.i; });
  if(idx<0) st.forEach(function(x){ if(idx<0 && x.name==="VOX 1") idx=x.i; });
  return idx<0?0:idx;
}
function gdWord(db){ return levelWord(db); }
function gdMakeSlider(host,get,set){
  var fill=document.createElement("i"), knob=document.createElement("u");
  host.appendChild(fill); host.appendChild(knob);
  function paint(){
    var p=Math.max(0,Math.min(1,get()));
    fill.style.width=(p*100)+"%"; knob.style.left=(p*100)+"%";
  }
  var drag=false;
  function from(e){
    var r=host.getBoundingClientRect();
    set(Math.max(0,Math.min(1,(e.clientX-r.left)/Math.max(1,r.width))));
    paint();
  }
  host.addEventListener("pointerdown",function(e){ drag=true; host.setPointerCapture(e.pointerId); from(e); e.preventDefault(); e.stopPropagation(); });
  host.addEventListener("pointermove",function(e){ if(drag) from(e); });
  host.addEventListener("pointerup",function(){ drag=false; });
  host.addEventListener("pointercancel",function(){ drag=false; });
  host.addEventListener("click",function(e){ e.stopPropagation(); });
  paint();
  return paint;
}
function gdTile(host,label,words,get,set){
  var t=document.createElement("div"); t.className="gdc-tile";
  var em=document.createElement("em"); em.textContent=label;
  var b=document.createElement("b");
  var trk=document.createElement("div"); trk.className="trk";
  var knob=document.createElement("u"); trk.appendChild(knob);
  t.appendChild(em); t.appendChild(b); t.appendChild(trk);
  host.appendChild(t);
  function paint(){
    var p=Math.max(0,Math.min(1,get()));
    knob.style.left=(p*100)+"%";
    b.textContent=words(p);
  }
  var drag=false;
  function from(e){
    var r=trk.getBoundingClientRect();
    set(Math.max(0,Math.min(1,(e.clientX-r.left)/Math.max(1,r.width)))); paint();
  }
  trk.addEventListener("pointerdown",function(e){ drag=true; trk.setPointerCapture(e.pointerId); from(e); e.preventDefault(); e.stopPropagation(); });
  trk.addEventListener("pointermove",function(e){ if(drag) from(e); });
  trk.addEventListener("pointerup",function(){ drag=false; });
  trk.addEventListener("pointercancel",function(){ drag=false; });
  paint();
}
function gdCardList(){
  var list=[], me=gdMeIndex(), meCh=st[me];
  list.push({id:"me",badge:"ME",title:"Me \u2014 "+meCh.name,
    sub:"Your own mic \u00b7 "+meCh.name,
    colour:PLATE[plateFor(meCh)][1], ch:meCh,
    get:function(){ return meCh.pos; },
    set:function(p){ meCh.pos=p; applyChan(me); mirror(me,["pos"]); paintChan(me); },
    db:function(){ return posToDb(meCh.pos); },
    mute:function(){ return meCh.mute; },
    toggle:function(){ meCh.mute=!meCh.mute; mirror(me,["mute"]); applyAll(); paintChans(); }
  });
  groups.forEach(function(g,gi){
    var mem=st.filter(function(x){ return x.grp===gi && x.i!==me; });
    if(!mem.length) return;
    /* colour the group by the plate its members mostly wear, not by whichever
       channel happens to be first (Bass would make the whole band orange) */
    var tally={};
    mem.forEach(function(x){ var k=plateFor(x); tally[k]=(tally[k]||0)+1; });
    var key="blue", best=0;
    Object.keys(tally).forEach(function(k){ if(tally[k]>best){best=tally[k];key=k;} });
    list.push({id:"g"+gi,badge:g.name.slice(0,2).toUpperCase(),title:g.name,
      sub:mem.map(function(x){return x.name}).slice(0,4).join(" \u00b7 ")+
          (mem.length>4?" \u2026":"")+" \u2014 "+mem.length+" channel"+(mem.length>1?"s":""),
      colour:PLATE[key][1], members:mem,
      get:function(){ return g.pos; },
      set:function(p){ g.pos=p; applyAll(); updateGroups(); paintChans(); },
      db:function(){
        /* average member level plus the group fader \u2014 what the group
           actually sounds like, not just where the fader sits */
        var tot=0,n=0;
        mem.forEach(function(x){ var d=posToDb(x.pos); if(d!==-Infinity){ tot+=d; n++; } });
        if(!n) return -Infinity;
        return tot/n + posToDb(g.pos);
      },
      mute:function(){ return g.mute; },
      toggle:function(){ g.mute=!g.mute; applyAll(); updateGroups(); }
    });
  });
  return list;
}
function gdRefDb(card){
  var sc=null; SCENARIOS.forEach(function(x){ if(x.key===scnActive) sc=x; });
  if(!sc) return null;
  var idxs = card.ch ? [card.ch.i] : card.members.map(function(x){return x.i});
  var vals=idxs.map(function(i){ var d=sc.mix[i]; return d===undefined?-60:d; });
  if(!vals.length) return null;
  return vals.reduce(function(a,b){return a+b},0)/vals.length;
}
function buildGuided(){
  var host=document.getElementById("gdCards"); if(!host) return;
  host.innerHTML="";
  var sc=null; SCENARIOS.forEach(function(x){ if(x.key===scnActive) sc=x; });

  var role=document.getElementById("gdRole");
  role.textContent = sc ? ("You\u2019re mixing as: "+sc.role) : "Pick a seat to start from";

  var chips=document.getElementById("gdChips"); chips.innerHTML="";
  SCENARIOS.forEach(function(x){
    var b=document.createElement("button");
    b.className="gd-chip"+(scnActive===x.key?" on":"");
    b.textContent=x.who;
    b.onclick=function(){ applyScenario(x.key); buildGuided(); };
    chips.appendChild(b);
  });

  document.getElementById("gdWhy").textContent = sc ? sc.note
    : "Pick a seat above and this explains the mix it loaded.";
  var tips=document.getElementById("gdTips"); tips.innerHTML="";
  (GDTIPS[scnActive]||GDTIPS.blank).forEach(function(t,k){
    var row=document.createElement("div"); row.className="gd-tip";
    row.innerHTML="<b>"+(k+1)+"</b><span></span>";
    row.querySelector("span").textContent=t;
    tips.appendChild(row);
  });
  var cmp=document.getElementById("gdCompare");
  cmp.classList.toggle("on",gdCompare);

  gdCardList().forEach(function(c){
    var card=document.createElement("div");
    card.className="gdcard"+(gdSel===c.id?" sel":"")+(c.mute()?" muted":"");
    card.style.setProperty("--gc",c.colour);
    card.onclick=function(){ gdSel = (gdSel===c.id?"":c.id); buildGuided(); };

    var top=document.createElement("div"); top.className="gdc-top";
    var badge=document.createElement("div"); badge.className="gdc-badge"; badge.textContent=c.badge;
    var txt=document.createElement("div"); txt.className="gdc-txt";
    var tb=document.createElement("b"); tb.textContent=c.title;
    var ts=document.createElement("span"); ts.textContent=c.sub;
    txt.appendChild(tb); txt.appendChild(ts);
    var gap=document.createElement("div"); gap.className="gdc-gap";
    var read=document.createElement("div"); read.className="gdc-read";
    var rb=document.createElement("b"); var rs=document.createElement("span");
    read.appendChild(rb); read.appendChild(rs);
    var mu=document.createElement("button"); mu.className="gdc-mute"+(c.mute()?" on":"");
    mu.textContent="MUTE";
    mu.onclick=function(e){ e.stopPropagation(); c.toggle(); buildGuided(); };
    top.appendChild(badge); top.appendChild(txt); top.appendChild(gap);
    top.appendChild(read); top.appendChild(mu);
    card.appendChild(top);

    function readout(){
      var d=c.db();
      rb.textContent=gdWord(d);
      var line=fmtDb(d)+" dB";
      if(gdCompare){
        var r=gdRefDb(c);
        if(r!==null) line+="  \u00b7  MD "+fmtDb(r)+" dB";
      }
      rs.textContent=line;
    }
    var sl=document.createElement("div"); sl.className="gdc-slider";
    card.appendChild(sl);
    gdMakeSlider(sl,c.get,function(p){ c.set(p); readout(); });
    readout();

    if(gdSel===c.id){
      var tiles=document.createElement("div"); tiles.className="gdc-tiles";
      var targets = c.ch ? [c.ch] : c.members;
      gdTile(tiles,"Where it sits",
        function(p){ var v=p*2-1; return Math.abs(v)<.04?"Centre":(v<0?"Left":"Right")+" "+Math.round(Math.abs(v)*100)+"%"; },
        function(){ return (targets[0].pan+1)/2; },
        function(p){ var v=p*2-1; if(Math.abs(v)<.04) v=0;
          targets.forEach(function(x){ x.pan=v; applyChan(x.i); }); paintChans(); });
      gdTile(tiles,"Low end",
        function(p){ var v=p*24-12; return v>2?"A bit more":(v<-2?"A bit less":"As it comes"); },
        function(){ return (targets[0].bass+12)/24; },
        function(p){ var v=p*24-12;
          targets.forEach(function(x){ x.bass=v; applyChan(x.i); mirror(x.i,["bass"]); }); paintChans(); });
      gdTile(tiles,"Brightness",
        function(p){ var v=p*24-12; return v>2?"A bit more":(v<-2?"A bit less":"As it comes"); },
        function(){ return (targets[0].treb+12)/24; },
        function(p){ var v=p*24-12;
          targets.forEach(function(x){ x.treb=v; applyChan(x.i); mirror(x.i,["treb"]); }); paintChans(); });
      card.appendChild(tiles);
    }
    host.appendChild(card);
  });
}

var frame=0;
function tick(){
  frame++;
  var skip = document.hidden || (isMobile && (frame%2));
  if(ac && !skip){
    if(view==="ch"){
      for(var i=0;i<nodes.length;i++){
        var n=nodes[i]; if(!n) continue;
        var el=wall.querySelector('.ch[data-i="'+i+'"] .meter'); if(!el) continue;
        var lv=0;
        if(playing&&st[i].buf){
          n.an.getByteTimeDomainData(n.data);
          var pk=0; for(var k=0;k<n.data.length;k+=4){ var d=Math.abs(n.data[k]-128); if(d>pk)pk=d; }
          lv=Math.min(1,pk/110);
        }
        var prev=parseFloat(el.dataset.l||"0"), next= lv>prev?lv:prev*0.86;
        el.dataset.l=next; el.style.height=(next*100)+"%";
      }
    }
    var md=new Uint8Array(masterAn.fftSize); masterAn.getByteTimeDomainData(md);
    var mp=0; for(var j=0;j<md.length;j+=4){ var dd=Math.abs(md[j]-128); if(dd>mp)mp=dd; }
    var mv=Math.min(100,mp/110*100);
    document.getElementById("mL").style.width=mv+"%";
    document.getElementById("mR").style.width=(mv*0.97)+"%";
    var leds=document.querySelectorAll(".mled");
    for(var q=0;q<leds.length;q++){
      var mm=leds[q];
      var pv=parseFloat(mm.dataset.l||"0"), nv=(mv/100)>pv?(mv/100):pv*0.86;
      mm.dataset.l=nv; mm.style.height=(nv*100)+"%";
    }
  }
  var t=now();
  document.getElementById("clock").innerHTML="<b>"+ts(t)+"</b> / "+ts(dur);
  if(dur>0) document.getElementById("scrub").value=Math.round(t/dur*1000);
  requestAnimationFrame(tick);
}
function ts(s){ if(!isFinite(s)||s<0)s=0; var m=Math.floor(s/60),q=Math.floor(s%60); return m+":"+(q<10?"0":"")+q; }

var toastT=null;
function toast(msg){
  var el=document.getElementById("toast"); el.textContent=msg; el.classList.add("show");
  clearTimeout(toastT); toastT=setTimeout(function(){el.classList.remove("show")},2800);
}


/* ---------- first-run guide ---------- */
var GUIDE=[
 ["This is your in-ear mix.","Four wheels, one for each part of the stage. Turn a wheel up to hear more of that part, down to get it out of your way. That's the whole idea."],
 ["Pick who you are.","The buttons under the wheels load a starting mix for a real seat — drummer, worship leader, bass, BGV. Start from one of those rather than from nothing."],
 ["Press play, then adjust.","The transport is at the top. Stems loop, so leave it running and keep moving things while you listen. You can't break anything."],
 ["Build in this order.","What keeps you in time first — usually click and drums. Then whatever tells you where you are in the song. Your own channel goes up last, and only until you can hear yourself. Loud is not the same as clear."],
 ["When four wheels aren't enough.","Switch to Channels at the top for every input, each with its own pan, bass and treble. Reset puts everything back whenever you want a clean start."]
];
var gi_=0;
function paintGuide(){
  var g=GUIDE[gi_], bar=document.getElementById("coachbar");
  document.getElementById("ovl3").hidden=true;
  if(!bar) return;
  bar.hidden=false;
  document.getElementById("coachStep").textContent="STEP "+(gi_+1)+" OF "+GUIDE.length;
  document.getElementById("coachText").textContent=g[0]+"  "+g[1];
  document.getElementById("coachPrev").hidden = gi_===0;
  document.getElementById("coachNext").textContent = gi_===GUIDE.length-1 ? "Start mixing" : "Next";
}
function closeGuide(){
  document.getElementById("ovl3").hidden=true;
  var bar=document.getElementById("coachbar"); if(bar) bar.hidden=true;
  try{ localStorage.setItem("iemGuideSeen","1"); }catch(e){}
}
document.getElementById("coachNext").onclick=function(){
  if(gi_===GUIDE.length-1){ closeGuide(); return; }
  gi_++; paintGuide();
};
document.getElementById("coachPrev").onclick=function(){ if(gi_>0){gi_--;paintGuide();} };
document.getElementById("coachSkip").onclick=closeGuide;

/* ---------- advanced toggle ---------- */
var adv=false;
document.getElementById("btnAdv").onclick=function(){
  adv=!adv;
  document.getElementById("p-iem").classList.toggle("adv",adv);
  this.classList.toggle("big",adv);
  document.getElementById("btnClearSolo").hidden=!adv;
  if(!adv){ st.forEach(function(s2){s2.solo=false}); applyAll(); paintChans(); }
  toast(adv?"Advanced on — Solo and the dB scale are showing":"Back to the simple board");
};





/* ---------- mixes overlay ---------- */
function paintMixList(){
  var host=document.getElementById("mixList"), list=savedMixes();
  host.innerHTML="";
  if(!list.length){ host.innerHTML='<div class="mixempty">Nothing saved yet</div>'; return; }
  list.forEach(function(m){
    var row=document.createElement("div"); row.className="mixitem";
    var d=new Date(m.at);
    row.innerHTML='<b></b><span>'+(d.getMonth()+1)+'/'+d.getDate()+'</span>';
    row.querySelector("b").textContent=m.name;
    var load=document.createElement("button"); load.className="ghost"; load.textContent="Load";
    load.onclick=function(){ if(applyMix(m.mix)){ toast('Loaded "'+m.name+'"'); closeMixes(); } };
    var del=document.createElement("button"); del.className="ghost"; del.textContent="✕";
    del.onclick=function(){
      lsSet(MIXKEY, savedMixes().filter(function(x){ return x.id!==m.id; }));
      paintMixList();
    };
    row.appendChild(load); row.appendChild(del);
    host.appendChild(row);
  });
}
function openMixes(){
  document.getElementById("ovl5").hidden=false;
  document.getElementById("mixOut").value=mixToCode(captureMix());
  document.getElementById("mixCopied").textContent="";
  paintMixList();
}
function closeMixes(){ document.getElementById("ovl5").hidden=true; }
document.getElementById("btnMixes").onclick=openMixes;
document.getElementById("mixDone").onclick=closeMixes;
document.getElementById("ovl5").addEventListener("click",function(e){ if(e.target===this) closeMixes(); });
document.getElementById("mixSave").onclick=function(){
  var el=document.getElementById("mixName");
  var n=(el.value||"").trim() || ("Mix "+new Date().toLocaleDateString());
  saveMixNamed(n); el.value=""; paintMixList(); toast('Saved "'+n+'"');
};
document.getElementById("mixCopy").onclick=function(){
  var ta=document.getElementById("mixOut");
  ta.select(); ta.setSelectionRange(0,99999);
  var ok=false;
  try{ ok=document.execCommand("copy"); }catch(e){}
  if(navigator.clipboard) navigator.clipboard.writeText(ta.value).catch(function(){});
  document.getElementById("mixCopied").textContent = ok||navigator.clipboard ? "Copied" : "Select and copy";
};
document.getElementById("mixLoad").onclick=function(){
  var o=codeToMix(document.getElementById("mixIn").value);
  if(!o){ toast("That code doesn't look right — it should start with AWK1-"); return; }
  if(applyMix(o)){ toast("Mix loaded"); closeMixes(); }
};

/* ---------- per-channel sheet: pots with room for a thumb ---------- */
var shortScreen = matchMedia("(max-height:620px) and (pointer:coarse)");
var csKnobs=null, csIdx=0;
function openChannelSheet(i){
  csIdx=i;
  var s2=st[i], key=plateFor(s2), cc=PLATE[key];
  var plate=document.getElementById("csPlate");
  plate.style.setProperty("--cc-lt",cc[0]);
  plate.style.setProperty("--cc",cc[1]);
  plate.style.setProperty("--cc-dk",cc[2]);
  plate.classList.toggle("lite",key==="white");
  var pj=partner(i);
  plate.querySelector(".n").textContent="Input "+(i+1)+(s2.grp>=0?" · "+groups[s2.grp].name:"")+
    (pj>=0?" · linked to "+st[pj].name:"");
  plate.querySelector(".t").textContent=s2.name;

  csKnobs={
    pan: makeKnob(document.getElementById("csPan"),s2.pan,-1,1,fmtPan,function(v){
      s2.pan=Math.abs(v)<0.02?0:v; applyChan(i); paintChan(i); },74,null,s2.defPan),
    bass:makeKnob(document.getElementById("csBass"),s2.bass,-12,12,fmtBass,function(v){
      s2.bass=v; applyChan(i); paintChan(i); mirror(i,["bass"]); },74,null,0),
    treb:makeKnob(document.getElementById("csTreb"),s2.treb,-12,12,fmtTreb,function(v){
      s2.treb=v; applyChan(i); paintChan(i); mirror(i,["treb"]); },74,null,0)
  };
  document.getElementById("csMute").classList.toggle("on",s2.mute);
  document.getElementById("ovl4").hidden=false;
}
function closeChannelSheet(){ document.getElementById("ovl4").hidden=true; csKnobs=null; }
document.getElementById("csClose").onclick=closeChannelSheet;
document.getElementById("ovl4").addEventListener("click",function(e){ if(e.target===this) closeChannelSheet(); });
document.getElementById("csMute").onclick=function(){
  st[csIdx].mute=!st[csIdx].mute; mirror(csIdx,["mute"]); applyAll(); paintChans();
  this.classList.toggle("on",st[csIdx].mute);
};
document.getElementById("csCentre").onclick=function(){
  st[csIdx].pan=st[csIdx].defPan; applyChan(csIdx); paintChan(csIdx);
  if(csKnobs) csKnobs.pan.set(st[csIdx].pan);
};
document.getElementById("csFlat").onclick=function(){
  st[csIdx].bass=0; st[csIdx].treb=0; applyChan(csIdx); paintChan(csIdx); mirror(csIdx,["bass","treb"]);
  if(csKnobs){ csKnobs.bass.set(0); csKnobs.treb.set(0); }
};
document.getElementById("csUnity").onclick=function(){
  st[csIdx].pos=UNITY; applyChan(csIdx); paintChan(csIdx); mirror(csIdx,["pos"]);
};

/* ---------- embedded stems ---------- */
function b64ToBuf(b64){
  var bin=atob(b64), n=bin.length, u=new Uint8Array(n);
  for(var i=0;i<n;i++) u[i]=bin.charCodeAt(i);
  return u.buffer;
}
function setLoad(txt,frac){
  var bar=document.getElementById("loadbar");
  if(txt===null){ bar.hidden=true; return; }
  bar.hidden=false;
  document.getElementById("lbText").textContent=txt;
  document.getElementById("lbFill").style.width=Math.round((frac||0)*100)+"%";
}
/* iOS Safari cannot decode Opus in any container, so every stem ships as
   AAC as well and the browser is asked what it can actually play. Anything
   that can take the WebM gets it — the files are smaller. */
var IEM_EXT=(function(){
  try{
    var a=document.createElement("audio");
    if(a.canPlayType('audio/webm; codecs="opus"')) return ".webm";
  }catch(e){}
  return ".m4a";
})();
function iemUrl(u,ext){ return u.replace(/\.webm$/,ext||IEM_EXT); }
function iemFetch(url){
  var first=IEM_EXT, other=first===".webm"?".m4a":".webm";
  function once(ext){
    return fetch(iemUrl(url,ext)).then(function(r){
      if(!r.ok) throw new Error(r.status);
      return r.arrayBuffer();
    }).then(function(buf){
      return new Promise(function(res,rej){
        var p=ac.decodeAudioData(buf,res,rej);
        if(p&&p.then) p.then(res,rej);
      });
    });
  }
  /* canPlayType describes the <audio> element, not decodeAudioData, and the
     two do not always agree — so a failed decode switches codec for good
     rather than losing the stem. */
  return once(first)["catch"](function(){ IEM_EXT=other; return once(other); });
}

function loadEmbedded(){
  if(typeof EMBED==="undefined" || !EMBED.length) return;
  ensureAudio();
  /* The stems are ordinary files under /audio/iem/ rather than a base64 blob
     inside the page. That keeps the page itself small and lets the browser
     cache each stem, so the second visit costs nothing. Four at a time is
     enough to saturate a normal connection without stalling the decode. */
  var total=EMBED.length, done=0, hits=0, i=0, inflight=0, LANES=4;
  setLoad("Loading stems\u2026",0);
  function finish(){
    setLoad(null); paintChans(); paintLoadList();
    toast(hits+" stems loaded \u2014 press play");
  }
  function step(){
    if(done>=total){ finish(); return; }
    while(inflight<LANES && i<total){
      (function(e){
        inflight++;
        var idx=matchChannel(e[0]);
        iemFetch(e[1]).then(function(ab){
          if(idx>=0){ st[idx].buf=ab; st[idx].file=e[0]; hits++; }
          dur=Math.max(dur,ab.duration);
        })["catch"](function(){ /* one missing stem must not stop the rest */ })
        .then(function(){
          inflight--; done++;
          setLoad("Loading stems\u2026 "+done+" / "+total, done/total);
          if(done%4===0) paintChans();
          step();
        });
      })(EMBED[i++]);
    }
  }
  step();
}

/* ---------- iOS / mobile audio unlock ----------
   Safari will not start an AudioContext outside a real touch, and Web Audio alone
   obeys the hardware ring/silent switch. Holding a silent <audio> element open puts
   the page on the media channel so the mix is audible with the switch on silent. */
var SILENCE="data:audio/wav;base64,UklGRhQLAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YfAKAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA";
var keepAlive=null, unlocked=false;
function unlockAudio(){
  if(unlocked) return;
  unlocked=true;
  ensureAudio();
  if(ac.state==="suspended") ac.resume();
  try{
    var b=ac.createBuffer(1,1,22050), src=ac.createBufferSource();
    src.buffer=b; src.connect(ac.destination); src.start(0);
  }catch(e){}
  try{
    keepAlive=new Audio(SILENCE);
    keepAlive.loop=true; keepAlive.volume=0.0001;
    keepAlive.setAttribute("playsinline","");
    keepAlive.play().catch(function(){});
  }catch(e){}
}
["pointerdown","touchend","keydown"].forEach(function(ev){
  document.addEventListener(ev,unlockAudio,{once:true,passive:true});
});
document.addEventListener("visibilitychange",function(){
  if(!document.hidden && ac && ac.state==="suspended" && playing) ac.resume();
});

/* ---------- wiring ---------- */
document.querySelectorAll("#viewsw button").forEach(function(b){ b.onclick=function(){ setView(b.dataset.v); }; });
document.querySelectorAll("#tabbar button").forEach(function(b){ b.onclick=function(){ setView(b.dataset.v); }; });
(function(){
  var tb=document.getElementById("tabbar");
  function syncShell(){
    if(!tb) return;
    tb.hidden = !isMobile && !window.matchMedia("(max-width:820px)").matches;
    if(view==="gd" && tb.hidden===false) setView("ch");
  }
  syncShell();
  window.addEventListener("resize",function(){ syncShell(); paintDots(); });
  if(wall) wall.addEventListener("scroll",paintDots,{passive:true});
})();
(function(){
  var eng=document.getElementById("gdEngineer");
  if(eng) eng.onclick=function(){ setView("ch"); };
  var rst=document.getElementById("gdReset");
  if(rst) rst.onclick=function(){ var r=document.getElementById("btnReset"); if(r) r.click(); buildGuided(); };
  var cmp=document.getElementById("gdCompare");
  if(cmp) cmp.onclick=function(){ gdCompare=!gdCompare; buildGuided(); };
})();
var toolsEl=document.getElementById("tools");
document.getElementById("btnMore").onclick=function(e){ e.stopPropagation(); toolsEl.classList.toggle("open"); };
document.addEventListener("click",function(e){
  if(!toolsEl.contains(e.target) && e.target.id!=="btnMore") toolsEl.classList.remove("open");
});
toolsEl.addEventListener("click",function(){ toolsEl.classList.remove("open"); });

document.getElementById("btnAssign").onclick=openAssign;
document.getElementById("btnAssign2").onclick=openAssign;
document.getElementById("btnDone").onclick=closeAssign;
document.getElementById("btnPreset").onclick=applyPreset;
document.getElementById("btnClearGrp").onclick=function(){
  st.forEach(function(s){ if(s.grp===assignTab) s.grp=-1; });
  applyAll(); buildPicker(); buildTabs(); updateGroups(); paintChans();
};
document.getElementById("btnClearAll").onclick=function(){
  st.forEach(function(s){ s.grp=-1; });
  applyAll(); buildPicker(); buildTabs(); updateGroups(); paintChans();
};
document.getElementById("ovl").addEventListener("click",function(e){ if(e.target===this) closeAssign(); });
document.getElementById("btnAllUnity").onclick=function(){
  groups.forEach(function(g){ g.pos=UNITY; g.mute=false; }); applyAll(); updateGroups(); paintChans();
};

document.getElementById("btnStems").onclick=function(){ document.getElementById("ovl2").hidden=false; };
document.getElementById("btnDone2").onclick=function(){ document.getElementById("ovl2").hidden=true; };
document.getElementById("ovl2").addEventListener("click",function(e){ if(e.target===this) this.hidden=true; });

document.getElementById("btnPlay").onclick=function(){ playing?pause():play(); };
/* Stop stops. It used to rewind to zero and carry on playing, which is a
   "return to zero" button wearing a stop icon — you pressed stop and the
   music restarted. */
document.getElementById("btnStop").onclick=function(){
  stopSources(); offset=0; playing=false; paintTransport();
};
document.getElementById("btnLoop").onclick=function(){ looping=!looping; if(playing){ startSources(now()); startAt=ac.currentTime-offset; } paintTransport(); };
document.getElementById("scrub").oninput=function(e){
  if(!dur) return;
  offset=e.target.value/1000*dur;
  if(playing){ startSources(offset); startAt=ac.currentTime-offset; }
};
document.getElementById("btnClearSolo").onclick=function(){ st.forEach(function(s){s.solo=false}); applyAll(); paintChans(); };
document.getElementById("btnReset").onclick=function(){
  st.forEach(function(s){ s.pos=0; s.pan=s.defPan; s.bass=0; s.treb=0; s.mute=false; s.solo=false; });
  groups.forEach(function(g){ g.pos=UNITY; g.mute=false; });
  masterPos=UNITY; applyMaster();
  applyAll(); paintChans(); updateGroups();
  scnActive=null; buildScenarios(); document.getElementById("scnNote").hidden=true;
  toast("Mix reset — faders down, knobs centred, groups at 0 dB");
};

var drop=document.getElementById("drop"),picker=document.getElementById("picker");
drop.onclick=function(){picker.click()};
picker.onchange=function(e){ loadFiles(e.target.files); picker.value=""; };
["dragenter","dragover"].forEach(function(ev){ drop.addEventListener(ev,function(e){e.preventDefault();drop.classList.add("over")}); });
["dragleave","drop"].forEach(function(ev){ drop.addEventListener(ev,function(e){e.preventDefault();drop.classList.remove("over")}); });
drop.addEventListener("drop",function(e){ loadFiles(e.dataTransfer.files); });
window.addEventListener("dragover",function(e){
  if(!iemOn()) return;e.preventDefault()});
window.addEventListener("drop",function(e){
  if(!iemOn()) return;
  e.preventDefault();
  if(e.dataTransfer&&e.dataTransfer.files.length){ document.getElementById("ovl2").hidden=false; loadFiles(e.dataTransfer.files); }
});

document.addEventListener("keyup",function(e){
  if(!iemOn()) return;
  if((e.code==="Space"||e.key===" ") && e.target && e.target.tagName==="BUTTON") e.preventDefault();
});
document.addEventListener("keydown",function(e){
  if(!iemOn()) return;
  var t=e.target, tag=t&&t.tagName;
  /* A range slider is an INPUT but nobody types into one. Treating it as
     typing meant that once you touched the scrubber, the spacebar stopped
     working until you clicked elsewhere. */
  var isRange = tag==="INPUT" && (t.type==="range");
  var typing = (tag==="INPUT" && !isRange) || tag==="TEXTAREA" || (t&&t.isContentEditable);
  if(typing) return;
  if(e.key==="Escape"){ closeAssign(); closeChannelSheet(); closeMixes(); document.getElementById("ovl2").hidden=true; if(!document.getElementById("ovl3").hidden) closeGuide(); return; }
  if(e.code==="Space"||e.key===" "){
    /* stop the browser scrolling, stop a focused button firing its own
       click, and stop the arcade's own space handler seeing this too */
    e.preventDefault();
    e.stopImmediatePropagation();
    if(tag==="BUTTON") t.blur();
    playing?pause():play();
    return;
  }
  if(view!=="ch") return;
  if(e.key==="ArrowRight"){ sel=Math.min(st.length-1,sel+1); paintChans(); }
  if(e.key==="ArrowLeft"){ sel=Math.max(0,sel-1); paintChans(); }
  if(e.key==="m"||e.key==="M"){ st[sel].mute=!st[sel].mute; mirror(sel,["mute"]); applyAll(); paintChans(); }
  if(e.key==="s"||e.key==="S"){ st[sel].solo=!st[sel].solo; mirror(sel,["solo"]); applyAll(); paintChans(); }
});

/* ---------- boot ---------- */
buildWall();
PRESET.map.forEach(function(g,i){ st[i].grp=g; });
buildGroupsView(); buildTabs(); buildScenarios();
setView("gr");
paintChans(); paintTransport(); paintLoadList(); paintMaster(); tick();
loadEmbedded();

var auto=lsGet(AUTOKEY,null);
if(auto && auto.mix){
  applyMix(auto.mix);
  toast("Picked up where you left off");
}

/* A small control surface for the site router. Two modules on one site each
   own an AudioContext, so whichever page you leave has to go quiet. */
window.IEMRoom = {
  isPlaying: function(){ return !!playing; },
  pause: function(){ try{ if(playing) pause(); }catch(e){} }
};

var seen=false; try{ seen=localStorage.getItem("iemGuideSeen")==="1"; }catch(e){}
document.getElementById("ovl3").hidden=true;
if(!seen){ paintGuide(); }
})();
