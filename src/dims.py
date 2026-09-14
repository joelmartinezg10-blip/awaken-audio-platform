"""Replaces the 'Seven dimensions' block on Program Overview.

The original was a fixed-coordinate SVG whose two legend labels overlapped
at any width, and it made only half the argument: it said a quiz measures
one dimension without ever saying what to do instead.
"""

OLD = open(__file__.replace("dims.py", "_dims_old.txt")).read()

NEW = '''<section class="band">
    <div class="wrap">
      <p class="eyebrow">Why this is not a course</p>
      <h2>Watch a video.<br>Take a quiz.<br>Still can&rsquo;t run a Sunday.</h2>
      <p class="lead" style="margin-top:20px;max-width:64ch">That is how most
        production training works, and it is why most of it does not produce
        engineers. A video is something you watched. A quiz measures whether
        you can recognise a right answer while sitting still, with time to
        think and nothing on the line. Neither one has ever been the job.</p>

      <div class="oldway">
        <div class="ow">
          <div class="owk">The old way</div>
          <ol>
            <li>Watch the module</li>
            <li>Answer the questions</li>
            <li>Receive the certificate</li>
          </ol>
          <p>Measures recall. Produces confidence that has never been tested.</p>
        </div>
        <div class="owarrow" aria-hidden="true">&#8594;</div>
        <div class="ow now">
          <div class="owk">The Academy</div>
          <ol>
            <li>Learn it, then <b>hear</b> it</li>
            <li>Get reps until it is repeatable</li>
            <li>Use it in a real service</li>
            <li>Come back and say what happened</li>
          </ol>
          <p>Measures what you can do when the band is loud and nobody is
             waiting for you to look something up.</p>
        </div>
      </div>

      <p class="eyebrow" style="margin-top:56px">Assessment</p>
      <h2>Seven dimensions.<br>A quiz reaches one.</h2>

      <div class="dimlegend">
        <span class="dleg on">What a quiz measures</span>
        <span class="dleg">What the seat requires</span>
      </div>
      <div class="dims">
        <div class="dim on"><i></i><span>Knowledge</span></div>
        <div class="dim"><i></i><span>Hearing</span></div>
        <div class="dim"><i></i><span>Application</span></div>
        <div class="dim"><i></i><span>Judgment</span></div>
        <div class="dim"><i></i><span>Troubleshooting</span></div>
        <div class="dim"><i></i><span>Communication</span></div>
        <div class="dim"><i></i><span>Live execution</span></div>
      </div>
      <p class="note" style="margin-top:18px;max-width:60ch">Quizzes are not
        useless. They are one seventh of the picture, and the only seventh
        that is easy to score &mdash; which is exactly why so much training
        stops there.</p>

      <p class="eyebrow" style="margin-top:56px">The thing behind the framework</p>
      <h2>Knowledge is what you have met.<br>Skill is what you can do on a Sunday.</h2>

      <div class="skillgrid">
        <div class="sk">
          <div class="skn">01</div>
          <h3>Knowledge is not skill</h3>
          <p>You could memorise the manual for a dLive &mdash; every menu, every
             parameter &mdash; and still freeze the first time a vocal starts
             feeding back mid-song. Not because you did not know what to do.
             Knowing what to do, and doing it under time pressure with a room
             full of people, are two different capabilities. Only one of them
             comes from reading.</p>
        </div>
        <div class="sk">
          <div class="skn">02</div>
          <h3>Skill is built by repetition</h3>
          <p>The ear that hears 250&nbsp;Hz instantly was built by someone
             hearing 250&nbsp;Hz slowly, hundreds of times, until it stopped
             requiring thought. That is what the arcade cabinets are for. They
             are not games we bolted on &mdash; they are reps, compressed into
             sixty seconds so you can get a hundred of them in a week instead
             of a year.</p>
        </div>
        <div class="sk">
          <div class="skn">03</div>
          <h3>Skill is never finished</h3>
          <p>There is no point at which you have arrived. New rooms, new bands,
             new consoles, new problems &mdash; the work keeps handing you things
             you have not seen. A completed topic is a checkpoint, not a finish
             line.</p>
        </div>
        <div class="sk">
          <div class="skn">04</div>
          <h3>Skill decays without maintenance</h3>
          <p>This is the one people are most surprised by. Frequency
             recognition, the reflex of reaching for the right control, the calm
             you had the last time something broke &mdash; all of it fades when it
             is not used. Which is why the cabinets stay open after you have
             passed them, and why we keep score: so you can see honestly
             whether what you could do in March you can still do in September.</p>
        </div>
      </div>

      <div class="starthere" style="margin-top:38px">
        <div>
          <div class="lab">Start here</div>
          <h3>Turning Knowledge Into Skill</h3>
          <p>The five-minute version of the above, built as the first module
             in the Academy &mdash; and the one everything else assumes you have
             read.</p>
        </div>
        <div class="spacer"></div>
        <a class="btn primary" href="#/arcade">Open the module &#8594;</a>
      </div>
    </div>
  </section>'''

CSS = """
/* ---------- old way vs the Academy ---------- */
.oldway{display:grid;grid-template-columns:1fr auto 1fr;gap:22px;align-items:stretch;margin:34px 0 0}
.oldway .ow{border:1px solid var(--line);padding:24px 26px;display:flex;flex-direction:column}
.oldway .ow.now{border-color:var(--accent);background:var(--accent-soft)}
.oldway .owk{font-family:var(--mono);font-size:10px;letter-spacing:.22em;
  text-transform:uppercase;color:var(--dim);margin-bottom:16px}
.oldway .ow.now .owk{color:var(--accent)}
.oldway ol{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:9px}
.oldway li{font-family:var(--display);font-size:16px;color:var(--white);line-height:1.3}
.oldway .ow:not(.now) li{color:var(--muted)}
.oldway p{margin:18px 0 0;font-size:13.5px;line-height:1.6;color:var(--dim)}
.oldway .owarrow{align-self:center;color:var(--accent);font-size:22px}
@media(max-width:820px){
  .oldway{grid-template-columns:1fr;gap:14px}
  .oldway .owarrow{transform:rotate(90deg);justify-self:center}
}

/* ---------- seven dimensions ---------- */
.dimlegend{display:flex;gap:26px;flex-wrap:wrap;margin:28px 0 14px}
.dimlegend .dleg{font-family:var(--mono);font-size:10px;letter-spacing:.16em;
  text-transform:uppercase;color:var(--dim);display:flex;align-items:center;gap:8px}
.dimlegend .dleg::before{content:"";width:11px;height:11px;border-radius:2px;background:#26262D}
.dimlegend .dleg.on{color:var(--accent)}
.dimlegend .dleg.on::before{background:var(--accent)}
.dims{display:grid;grid-template-columns:repeat(7,1fr);gap:12px;align-items:end}
.dims .dim i{display:block;height:86px;border-radius:3px;background:#26262D}
.dims .dim.on i{background:var(--accent)}
.dims .dim span{display:block;margin-top:11px;font-family:var(--mono);font-size:9.5px;
  letter-spacing:.1em;text-transform:uppercase;color:var(--dim);line-height:1.4}
.dims .dim.on span{color:var(--accent)}
@media(max-width:820px){
  .dims{grid-template-columns:repeat(2,1fr);gap:14px}
  .dims .dim i{height:44px}
}

/* ---------- the four things about skill ---------- */
/* four items, so two-by-two — auto-fit gave three across and a dead cell */
.skillgrid{display:grid;grid-template-columns:repeat(2,1fr);
  gap:1px;background:var(--line);border:1px solid var(--line);margin:30px 0 0}
@media(max-width:760px){.skillgrid{grid-template-columns:1fr}}
.skillgrid .sk{background:var(--blackout);padding:26px 26px 28px}
.skillgrid .skn{font-family:var(--mono);font-size:10px;letter-spacing:.2em;color:var(--accent);margin-bottom:12px}
.skillgrid h3{font-family:var(--display);font-size:19px;line-height:1.15;margin:0 0 12px}
.skillgrid p{margin:0;font-size:14px;line-height:1.65;color:var(--muted)}
"""
