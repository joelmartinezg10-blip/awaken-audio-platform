#!/usr/bin/env python3
"""
Mobile overflow sweep for awakenaudio.app.

Checks document.scrollWidth against clientWidth after EVERY route, mode tab and
sub-tab - not once at the end of a click-through. On 7 Sep 2026 a single
unhandled flex row (#p-arcade .subtabs) put 17 of the site's views into
horizontal overflow, and the test that missed it measured once, on a screen
that happened to fit.

When a view overflows, the widest offending element is named, because there is
only ever one cause and the symptom looks like "everything is broken".

    python3 app/tests_mobile_sweep.py https://www.awakenaudio.app
    python3 app/tests_mobile_sweep.py http://localhost:8000

Must print TOTAL VIEWS WITH OVERFLOW: 0
"""
import sys
from playwright.sync_api import sync_playwright

ROUTES = ["#/", "#/program", "#/foh", "#/mons", "#/ear", "#/proc",
          "#/arcade", "#/iem", "#/certify", "#/login"]
WIDTHS = [393, 360, 320]          # modern iPhone, small Android, iPhone SE
HEIGHT = 780

# Finds the widest element actually sticking out past the viewport.
CULPRIT_JS = """() => {
  const vw = document.documentElement.clientWidth;
  let worst = null;
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const right = r.right + window.scrollX;
    if (right > vw + 1 && (!worst || right > worst.right)) {
      worst = {
        right: right,
        width: Math.round(r.width),
        tag: el.tagName.toLowerCase(),
        id: el.id ? '#' + el.id : '',
        cls: el.className && typeof el.className === 'string'
             ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.')
             : ''
      };
    }
  }
  return worst;
}"""


def measure(page, width, label, failures):
    page.wait_for_timeout(120)
    sw = page.evaluate("document.documentElement.scrollWidth")
    cw = page.evaluate("document.documentElement.clientWidth")
    sx = page.evaluate("window.scrollX")
    if sw > cw + 1 or sx > 0:
        culprit = page.evaluate(CULPRIT_JS)
        who = "unknown"
        if culprit:
            who = "{tag}{id}{cls} ({width}px wide, extends to {right}px)".format(
                **{**culprit, "right": round(culprit["right"])})
        failures.append((width, label, sw, cw, who))
        print("  OVERFLOW  {:<44} scrollWidth {} vs {}  <- {}".format(
            label, sw, cw, who))
        return False
    return True


def clickables(page):
    """Tab-like controls in the currently visible view."""
    out = []
    for sel in (".subtabs button", ".modes button", "[data-sub]", ".tabs button"):
        for el in page.query_selector_all(sel):
            try:
                if el.is_visible():
                    out.append(el)
            except Exception:
                pass
    return out


def main():
    base = (sys.argv[1] if len(sys.argv) > 1 else "https://www.awakenaudio.app").rstrip("/")
    failures = []
    views = 0

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for width in WIDTHS:
            print("\n=== {}px ===".format(width))
            ctx = browser.new_context(
                viewport={"width": width, "height": HEIGHT},
                device_scale_factor=2, is_mobile=True, has_touch=True)
            page = ctx.new_page()

            for route in ROUTES:
                page.goto(base + "/" + route, wait_until="domcontentloaded")
                page.wait_for_timeout(350)
                views += 1
                measure(page, width, route, failures)

                # every tab reachable from this route, measured after each click
                for i in range(len(clickables(page))):
                    tabs = clickables(page)
                    if i >= len(tabs):
                        break
                    try:
                        label = (tabs[i].inner_text() or "").strip().split("\n")[0][:22]
                        tabs[i].click(timeout=2500)
                    except Exception:
                        continue
                    views += 1
                    measure(page, width, "{} > {}".format(route, label), failures)

            ctx.close()
        browser.close()

    print("\n" + "=" * 62)
    print("VIEWS CHECKED: {}".format(views))
    print("TOTAL VIEWS WITH OVERFLOW: {}".format(len(failures)))
    if failures:
        print("\nEvery failure, widest element named:")
        for width, label, sw, cw, who in failures:
            print("  {}px  {:<42} {} vs {}  {}".format(width, label, sw, cw, who))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
