"use strict";
/* Landing: hero product animation, scroll reveals, sticky nav. */

const LETTER = [
  "I am requesting a formal internal appeal of your September 24 determination denying coverage for my lumbar spine MRI. Section 4.2 of my Evidence of Coverage states that ",
  "conservative therapy is not required", // underlined as a citation
  " when the member presents with a progressive neurological deficit.\n\nOn September 4, Dr. Raman documented left ankle weakness of 3/5 and diagnosed a progressive motor deficit.",
];

async function typeLetter(el) {
  const full = LETTER.join("");
  const render = (n) => {
    let out = "", used = 0;
    LETTER.forEach((part, i) => {
      const take = Math.max(0, Math.min(part.length, n - used));
      const s = esc(part.slice(0, take));
      out += i === 1 && take ? `<u>${s}</u>` : s;
      used += part.length;
    });
    return out;
  };
  if (REDUCED) { el.innerHTML = render(full.length); return; }
  const dur = 2600, t0 = performance.now();
  await new Promise((done) => {
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      el.innerHTML = render(Math.floor(full.length * p)) + (p < 1 ? '<span class="caret"></span>' : "");
      p < 1 ? requestAnimationFrame(step) : done();
    };
    requestAnimationFrame(step);
    setTimeout(done, dur + 500);
  });
  el.innerHTML = render(full.length);
}

async function heroSequence() {
  const gauge = $("#mGauge");
  gauge.innerHTML = gaugeSVG(196);
  await sleep(REDUCED ? 0 : 900);
  const typing = typeLetter($("#mLetter"));
  $$(".mr-row").forEach((r, i) => setTimeout(() => r.classList.add("on"), (REDUCED ? 0 : 1500) + i * 420));
  await sleep(REDUCED ? 0 : 1300);
  setGauge(gauge, 92);
  tween($("#mNum"), 92, { dur: 1500, from: 0 });
  await typing;
  $("#mPen").classList.add("go");
  await sleep(REDUCED ? 0 : 900);
  $("#mStamp").classList.add("go");
}

/* Gentle parallax on the mockup layers (desktop pointer only). */
function parallax() {
  const mock = $("#mock");
  if (REDUCED || !matchMedia("(pointer: fine)").matches) return;
  const layers = [["#mPaper", 6], ["#mRoute", 14], ["#mScore", 18], ["#mStamp", 10], ["#mPen", 9]];
  let raf;
  mock.addEventListener("pointermove", (e) => {
    const r = mock.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => layers.forEach(([s, k]) => { const el = $(s); el.style.translate = `${-x * k}px ${-y * k}px`; }));
  });
  mock.addEventListener("pointerleave", () => layers.forEach(([s]) => ($(s).style.translate = "0 0")));
  layers.forEach(([s]) => ($(s).style.transition = ($(s).style.transition ? $(s).style.transition + ", " : "") + "translate .5s cubic-bezier(.2,.8,.2,1)"));
}

function nav() {
  const n = $("#lnav");
  const on = () => n.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", on, { passive: true });
  on();
}

$("#watchSample").addEventListener("click", async () => {
  const id = await caseFromSample("mri-red-flags");
  location.href = `/app/case?id=${encodeURIComponent(id)}&run=1`;
});

nav();
initReveal();
parallax();
heroSequence();
