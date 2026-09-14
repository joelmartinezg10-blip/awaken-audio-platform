"""Mission, Vision and the Academy Framework. Imported by build.py."""

# ---- 1. Mission, directly under the hero ------------------------------
MISSION_ANCHOR = """      <h1>Backstage energy.<em>Front-row excellence.</em></h1>
      <p class="lead">We develop Front of House and Monitor engineers. Great ears, real musical instinct, calm hands when something breaks.</p>"""

# The mission IS the headline now. Previously the hero said one thing and a
# mission block directly underneath said another, and the two competed.
MISSION = """      <h1>Turning knowledge<em>into skill.</em></h1>
      <p class="lead">We develop audio engineers through intentional learning,
         critical listening, hands-on practice, real-world application, and
         continuous reflection.</p>
      <p class="tagline">Backstage energy &#183; Front-row excellence</p>"""

CHAIN_ANCHOR = ('<p class="chain-cap">The signal path &#8212; '
                '<b>every problem lives somewhere on this line</b></p>')

# ---- 2. The Academy Framework ----------------------------------------
#
# The full treatment now lives on Program Overview, replacing the old
# journey rail (Foundations -> ... -> Certify). Home keeps a compact
# version: a visitor should see how we develop people without the front
# page turning into the curriculum.
OLD_RAIL_HEAD = '''      <p class="eyebrow">How development works</p>
      <h2>Knowledge alone is not competency</h2>'''

FRAMEWORK_HEAD = '''      <p class="eyebrow">The Academy Framework</p>
      <h2>Knowledge alone is not skill</h2>'''

JOURNEY_RAIL = open(__file__.replace("framework_patch.py", "_journey_rail.txt")).read()

# what replaces it on Program Overview
PROGRAM_FRAMEWORK = '''<div class="fw">
        <div class="fws"><span class="n">01</span><b>Learn</b>
          <p>Understand what it is, why it matters, and how to use it.</p></div>
        <div class="fws"><span class="n">02</span><b>Listen</b>
          <p>Train your ears to recognize what you&rsquo;re learning.</p></div>
        <div class="fws"><span class="n">03</span><b>Practice</b>
          <p>Turn understanding into repeatable action.</p></div>
        <div class="fws offsite"><span class="n">04</span><b>Apply</b>
          <p>Use the skill in a real worship environment.</p>
          <span class="room">In the room</span></div>
        <div class="fws"><span class="n">05</span><b>Reflect</b>
          <p>Evaluate what happened, identify what needs work, and keep developing.</p></div>
      </div>

      <p style="margin-top:26px;max-width:64ch">Every topic in the Academy runs
        all five, in order. The platform tracks four of them &mdash; the fourth
        happens where we cannot follow you: in the room, on a Sunday. Skip
        <b style="color:var(--white)">Listen</b> and you build a confident wrong
        habit. Skip <b style="color:var(--white)">Reflect</b> and you can run
        forty services while only improving during the first three.</p>'''

# the Home page keeps a compact version that points here
HOME_COMPACT = '''      <p class="eyebrow">The Academy Framework</p>
      <h2>Knowledge alone is not skill</h2>
      <p style="margin-top:16px;max-width:60ch">Five steps, every topic, every
        time. It is how we turn what somebody knows into something they can do
        on a Sunday.</p>
      <div class="fwmini">
        <span><i>01</i>Learn</span><span><i>02</i>Listen</span>
        <span><i>03</i>Practice</span><span class="room"><i>04</i>Apply</span>
        <span><i>05</i>Reflect</span>
      </div>
      <div class="cta-row" style="margin-top:26px">
        <a class="btn" href="#/program">How the program works &#8594;</a>
      </div>'''

OLD_RAIL = ('''<div class="rail heat"><div class="rail-i"><span class="rail-d">1</span><b>Learn</b>'''
            '''<span>Understand the concept</span></div><div class="rail-i"><span class="rail-d">2</span>'''
            '''<b>Listen</b><span>Hear it by ear</span></div><div class="rail-i"><span class="rail-d">3</span>'''
            '''<b>Practice</b><span>Use it with no pressure</span></div><div class="rail-i">'''
            '''<span class="rail-d">4</span><b>Demonstrate</b><span>Explain the decision</span></div>'''
            '''<div class="rail-i"><span class="rail-d">5</span><b>Deploy</b><span>Do it live</span></div>'''
            '''<div class="rail-i"><span class="rail-d">6</span><b>Reflect</b><span>Named next steps</span></div></div>''')

FRAMEWORK = '''<div class="fw">
        <div class="fws"><span class="n">01</span><b>Learn</b>
          <p>Understand what it is, why it matters, and how to use it.</p></div>
        <div class="fws"><span class="n">02</span><b>Listen</b>
          <p>Train your ears to recognize what you&rsquo;re learning.</p></div>
        <div class="fws"><span class="n">03</span><b>Practice</b>
          <p>Turn understanding into repeatable action.</p></div>
        <div class="fws offsite"><span class="n">04</span><b>Apply</b>
          <p>Use the skill in a real worship environment.</p>
          <span class="room">In the room</span></div>
        <div class="fws"><span class="n">05</span><b>Reflect</b>
          <p>Evaluate what happened, identify what needs work, and keep developing.</p></div>
      </div>'''

OLD_RAIL_TAIL = ('<p style="margin-top:30px;max-width:60ch">A concept you can define but cannot hear '
                 '\u2014 and cannot use on a Sunday \u2014 has not been learned yet. '
                 'Every module runs all six steps.</p>')

# Home keeps only the START HERE callout under the compact strip; the
# argument for the framework now lives on Program Overview.
FRAMEWORK_TAIL_HOME = '''<div class="starthere">
        <div>
          <div class="lab">Before anything technical</div>
          <h3>START HERE &#183; Turning Knowledge Into Skill</h3>
          <p>Five minutes on why finishing a module is not the same as being
             able to do the thing &mdash; and how the Framework closes that gap.</p>
        </div>
        <div class="spacer"></div>
        <a class="btn primary" href="#/arcade">Open START HERE &#8594;</a>
      </div>'''

# ---- 3. Vision, deeper in the Academy experience ----------------------
VISION_ANCHOR = '''      <p class="eyebrow">Program Overview</p>'''

VISION = '''      <div class="acmission" style="border-top:0;margin-top:0;padding-top:0">
        <div>
          <p class="mk">Our vision</p>
        </div>
        <div>
          <p style="color:var(--white);font-family:var(--display);font-size:clamp(19px,2.3vw,26px);line-height:1.3">
            To develop skilled, confident, and continually growing audio
            engineers who serve worship with excellence.</p>
        </div>
      </div>

      <p class="eyebrow" style="margin-top:52px">Program Overview</p>'''

# ---- 4. the stale "step one of six" line ------------------------------
OLD_SIX = ('''<p>Reading this page took ten minutes and taught you nothing you can be trusted with. '''
           '''Knowledge is step one of six. Here is the rest of it.</p>''')
NEW_SIX = ('''<p>Reading this page took ten minutes and taught you nothing you can be trusted with. '''
           '''Learn is step one of five. Here is the rest of it.</p>''')

OLD_DO = ('<div class="dl"><b>Demonstrate</b><span>Set a compressor on a lead vocal and explain '
          'out loud why you chose that ratio, that attack and that amount of GR.</span></div>\n'
          '          <div class="dl"><b>Deploy</b><span>Build it into a real console template at '
          'your campus, then run it in a rehearsal.</span></div>')
NEW_DO = ('<div class="dl"><b>Apply</b><span>Build it into a real console template at your campus, '
          'then run it in a rehearsal &#8212; and be able to say out loud why you chose that ratio, '
          'that attack and that amount of gain reduction.</span></div>\n'
          '          <div class="dl"><b>Reflect</b><span>Afterwards: what held up, what did not, '
          'and what you are changing before the next one.</span></div>')

# ---- 5. Tab order follows the signal chain ---------------------------
#
# Gain \u2192 HPF \u2192 EQ \u2192 Compressor \u2192 FX is the order of a dLive
# channel strip, so the tabs now match the console a volunteer actually
# sits at. Feedback comes last: it is not a processor on the strip, it is
# what happens to the whole system.
OLD_TABS = ('<button role="tab" data-sub="learn-gain" aria-selected="false">GAIN STRUCTURE</button>\n'
            '      <button role="tab" data-sub="learn-eq" aria-selected="true">EQUALIZATION</button>\n'
            '      <button role="tab" data-sub="learn-comp" aria-selected="false">COMPRESSION</button>\n'
            '      <button role="tab" data-sub="learn-space" aria-selected="false">TIME &amp; SPACE</button>\n'
            '      <button role="tab" data-sub="learn-hp" aria-selected="false">HIGH-PASS</button>\n'
            '      <button role="tab" data-sub="learn-fb" aria-selected="false">FEEDBACK</button>')
NEW_TABS = ('<button role="tab" data-sub="learn-start" aria-selected="true">START HERE</button>\n'
            '      <button role="tab" data-sub="learn-gain" aria-selected="false">GAIN STRUCTURE</button>\n'
            '      <button role="tab" data-sub="learn-hp" aria-selected="false">HIGH-PASS</button>\n'
            '      <button role="tab" data-sub="learn-eq" aria-selected="false">EQUALIZATION</button>\n'
            '      <button role="tab" data-sub="learn-comp" aria-selected="false">COMPRESSION</button>\n'
            '      <button role="tab" data-sub="learn-space" aria-selected="false">TIME &amp; SPACE</button>\n'
            '      <button role="tab" data-sub="learn-fb" aria-selected="false">FEEDBACK</button>')

OLD_LISTEN = ('<button role="tab" data-sub="listen-eq" aria-selected="true">EQ A/B</button>\n'
              '      <button role="tab" data-sub="listen-comp" aria-selected="false">COMPRESSOR LAB</button>\n'
              '      <button role="tab" data-sub="listen-verb" aria-selected="false">REVERB LAB</button>\n'
              '      <button role="tab" data-sub="listen-gain" aria-selected="false">SIGNAL MACHINE</button>\n'
              '      <button role="tab" data-sub="listen-hp" aria-selected="false">HPF LAB</button>')
NEW_LISTEN = ('<button role="tab" data-sub="listen-gain" aria-selected="true">SIGNAL MACHINE</button>\n'
              '      <button role="tab" data-sub="listen-hp" aria-selected="false">HPF LAB</button>\n'
              '      <button role="tab" data-sub="listen-eq" aria-selected="false">EQ A/B</button>\n'
              '      <button role="tab" data-sub="listen-comp" aria-selected="false">COMPRESSOR LAB</button>\n'
              '      <button role="tab" data-sub="listen-verb" aria-selected="false">REVERB LAB</button>')

# whichever substage carries "on" is the one shown before any click
OLD_ON_LEARN  = '<div class="substage on" id="learn-eq">'
NEW_ON_LEARN  = '<div class="substage" id="learn-eq">'
OLD_ON_LISTEN = '<div class="substage on" id="listen-eq">'
NEW_ON_LISTEN = '<div class="substage" id="listen-eq">'
OLD_OFF_GAIN  = '<div class="substage" id="listen-gain">'
NEW_OFF_GAIN  = '<div class="substage on" id="listen-gain">' 

SUBSTAGE_ANCHOR = '<div class="substage" id="learn-gain">'


# ---- 6. Nav: one honest meaning per tab ------------------------------
#
# Training had become a junk drawer — a reference page, a reading page and
# two interactive tools under one label. Program is what you learn, Seats
# is where you serve, Training is where you go to get reps.
OLD_NAV = '''        <span class="drop">
          <a href="#/program">Program Overview</a>
          <a href="#/labs">Labs</a>
          <a href="#/certify">Certification</a>
        </span>'''
NEW_NAV = '''        <span class="drop">
          <a href="#/program">Program Overview</a>
          <a href="#/ear">Critical Listening</a>
          <a href="#/proc">Processing</a>
          <a href="#/labs">Labs</a>
        </span>'''

OLD_TRAIN_NAV = '''        <a href="#/ear" data-g="training">Training <i class="cv"></i></a>
        <span class="drop">
          <a href="#/ear">Ear Training</a>
          <a href="#/arcade">Arcade</a>
          <a href="#/proc">Processing</a>
        </span>'''
NEW_TRAIN_NAV = '''        <a href="#/arcade" data-g="training">Training <i class="cv"></i></a>
        <span class="drop">
          <a href="#/arcade">Arcade</a>
          <a href="#/iem">IEM Mix Room</a>
        </span>'''

# Critical Listening and Processing are curriculum, so they answer to Program
OLD_GROUPS = ("    '/ear':     {el:'p-ear',     accent:'#FF5A36', g:'training'},")
NEW_GROUPS = ("    '/ear':     {el:'p-ear',     accent:'#FF5A36', g:'program'},")
OLD_PROC   = ("    '/proc':    {el:'p-proc',    accent:'#FF5A36', g:'training'},")
NEW_PROC   = ("    '/proc':    {el:'p-proc',    accent:'#FF5A36', g:'program'},")

OLD_SUB = ("""    program:  [['/program','Program Overview'],['/labs','Labs'],['/certify','Certification']],""")
NEW_SUB = ("""    program:  [['/program','Program Overview'],['/ear','Critical Listening'],"""
           """['/proc','Processing'],['/labs','Labs']],""")

OLD_SUBT = ("""    training: [['/ear','Ear Training'],['/arcade','Arcade'],['/iem','IEM Mix Room'],['/proc','Processing']],""")
NEW_SUBT = ("""    training: [['/arcade','Arcade'],['/iem','IEM Mix Room']],""")


# The page keeps its own identity in step with the nav. "Ear Training for
# Awaken Audio Engineers" is the arcade marquee and stays as it is — that
# is the machine's name, not a nav label.
RENAMES = [
    ('<p class="eyebrow">Ear Training \u00b7 Module 01</p>',
     '<p class="eyebrow">Critical Listening \u00b7 Module 01</p>'),
    ('>Ear Training &#8594;<', '>Critical Listening &#8594;<'),
    ('Dynamics is the next Ear Training module',
     'Dynamics is the next Critical Listening module'),
]


def apply(html, sub, start_here=""):
    sub(MISSION_ANCHOR, MISSION, "hero headline")
    sub(OLD_RAIL_HEAD + "\n      " + OLD_RAIL, HOME_COMPACT.rstrip(), "home framework")
    sub(OLD_RAIL_TAIL, FRAMEWORK_TAIL_HOME, "home framework tail")
    sub(VISION_ANCHOR, VISION, "vision block")
    sub(OLD_SIX, NEW_SIX, "step one of six")
    sub(OLD_DO, NEW_DO, "compression next-steps list")
    for _o, _n in RENAMES:
        sub(_o, _n, "rename " + _o[:34])
    sub(OLD_NAV, NEW_NAV, "program dropdown")
    sub(OLD_TRAIN_NAV, NEW_TRAIN_NAV, "training dropdown")
    sub(OLD_GROUPS, NEW_GROUPS, "ear route group")
    sub(OLD_PROC, NEW_PROC, "processing route group")
    sub(OLD_SUB, NEW_SUB, "program sub-nav")
    sub(OLD_SUBT, NEW_SUBT, "training sub-nav")
    sub(JOURNEY_RAIL, PROGRAM_FRAMEWORK, "journey rail -> framework")
    sub(OLD_TABS, NEW_TABS, "learn tab strip")
    sub(OLD_LISTEN, NEW_LISTEN, "listen tab strip")
    sub(OLD_ON_LEARN, NEW_ON_LEARN, "learn default off")
    sub(OLD_ON_LISTEN, NEW_ON_LISTEN, "listen default off")
    sub(OLD_OFF_GAIN, NEW_OFF_GAIN, "signal machine default on")
    sub(SUBSTAGE_ANCHOR, start_here.rstrip() + "\n\n    " + SUBSTAGE_ANCHOR,
        "start-here substage")
    return None
