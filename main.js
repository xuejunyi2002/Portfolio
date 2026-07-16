/* ============================================================
   CUSTOM CURSOR
   ============================================================ */
const cursor   = document.getElementById('cursor');
const follower = document.getElementById('cursor-follower');
let mouseX = 0, mouseY = 0, followerX = 0, followerY = 0;

if (window.matchMedia('(pointer: fine)').matches && cursor && follower) {
  document.addEventListener('mousemove', e => {
    mouseX = e.clientX; mouseY = e.clientY;
    cursor.style.transform = `translate(${mouseX - 4}px, ${mouseY - 4}px)`;
  });
  (function tick() {
    followerX += (mouseX - followerX - 17) * 0.11;
    followerY += (mouseY - followerY - 17) * 0.11;
    follower.style.transform = `translate(${followerX}px, ${followerY}px)`;
    requestAnimationFrame(tick);
  })();
  document.querySelectorAll('a, button, input, textarea').forEach(el => {
    el.addEventListener('mouseenter', () => { follower.style.opacity = '0.15'; follower.style.borderColor = 'var(--coral)'; });
    el.addEventListener('mouseleave', () => { follower.style.opacity = '0.5';  follower.style.borderColor = ''; });
  });
}

/* ============================================================
   HEADER — compact on scroll
   ============================================================ */
const header = document.getElementById('header');
if (header) {
  window.addEventListener('scroll', () => {
    header.classList.toggle('compact', window.scrollY > 60);
  }, { passive: true });
}

/* ============================================================
   HAMBURGER — mobile menu
   ============================================================ */
const hamburger = document.getElementById('hamburger');
const mobileNav = document.getElementById('mobileNav');

if (hamburger && mobileNav) {
  hamburger.addEventListener('click', () => {
    const isOpen = mobileNav.classList.toggle('open');
    hamburger.classList.toggle('active', isOpen);
    hamburger.setAttribute('aria-expanded', String(isOpen));
    mobileNav.setAttribute('aria-hidden', String(!isOpen));
  });
  document.querySelectorAll('.mobile-nav-link').forEach(link => {
    link.addEventListener('click', () => {
      mobileNav.classList.remove('open');
      hamburger.classList.remove('active');
      hamburger.setAttribute('aria-expanded', 'false');
      mobileNav.setAttribute('aria-hidden', 'true');
    });
  });
  document.addEventListener('click', e => {
    if (header && !header.contains(e.target) && !mobileNav.contains(e.target)) {
      mobileNav.classList.remove('open');
      hamburger.classList.remove('active');
    }
  });
}

/* ============================================================
   SCROLL REVEAL
   ============================================================ */
const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

/* ============================================================
   PARALLAX DOODLES (hero only)
   ============================================================ */
const parallaxEls = document.querySelectorAll('.parallax');
if (parallaxEls.length) {
  window.addEventListener('scroll', () => {
    const sy = window.scrollY;
    parallaxEls.forEach(el => {
      const speed = parseFloat(el.dataset.speed) || 0.05;
      el.style.transform = `translateY(${sy * speed}px)`;
    });
  }, { passive: true });
}

/* ============================================================
   CURSOR-FOLLOWING DOODLES (hero)
   ============================================================ */
if (window.matchMedia('(pointer: fine)').matches) {
  const hero = document.querySelector('.hero');
  const floatingDoodles = document.querySelectorAll('.hero .doodle');
  if (hero && floatingDoodles.length) {
    document.addEventListener('mousemove', e => {
      const r = hero.getBoundingClientRect();
      const dx = (e.clientX - r.width / 2) / (r.width / 2);
      const dy = (e.clientY - r.height / 2) / (r.height / 2);
      floatingDoodles.forEach((d, i) => {
        const f = (i % 2 === 0 ? 1 : -1) * 6;
        d.style.transform = `translate(${dx * f}px, ${dy * f}px)`;
      });
    });
  }
}

/* ============================================================
   TAB COMPONENT (home page PM traits)
   ============================================================ */
const tabBtns   = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
    tabPanels.forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    const target = document.getElementById(btn.dataset.tab);
    if (target) {
      target.classList.add('active');
      // Trigger reveal for newly shown items
      target.querySelectorAll('.reveal:not(.visible)').forEach(el => {
        setTimeout(() => el.classList.add('visible'), 50);
      });
    }
  });
});

/* ============================================================
   SCROLL HERO
   ============================================================ */
(function initScrollHero() {
  const container  = document.getElementById('heroScroll');
  const hsIm       = document.getElementById('hsIm');
  const descA      = document.getElementById('hsDescA');
  const descB      = document.getElementById('hsDescB');
  const photoWrap  = document.getElementById('hsPhotoWrap');
  const scrollHint = document.getElementById('hsScrollHint');
if (!container || !hsIm) return;

  const nameTrack = document.getElementById('hsNameTrack');

  /* Clear any stale inline styles from old JS versions */
  const stickyEl = document.getElementById('heroSticky');
  if (stickyEl) stickyEl.style.backgroundColor = '';
  if (nameTrack) nameTrack.style.transform = '';

  function eio(t) { return t<0.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2; }
  function clamp(v,lo,hi) { return Math.min(hi,Math.max(lo,v)); }
  function prog(p,s,e) { return clamp((p-s)/(e-s),0,1); }

  /* Cache I'M span width so ELLA lands at exactly the same left edge */
  let cachedImWidth = 0;
  function getImWidth() {
    if (!cachedImWidth && hsIm) cachedImWidth = hsIm.getBoundingClientRect().width;
    return cachedImWidth;
  }

  function update() {
    const rect = container.getBoundingClientRect();
    const p = clamp(-rect.top / (container.offsetHeight - window.innerHeight), 0, 1);

    /* Slide name track left so ELLA aligns at same 4vw edge */
    if (nameTrack) {
      nameTrack.style.transform = `translateX(${-getImWidth() * eio(prog(p, 0, 0.75))}px)`;
    }

    /* "I'M" fades out as it slides */
    hsIm.style.opacity = clamp(1 - p / 0.45, 0, 1);

    /* description crossfade */
    descA.style.opacity = clamp(1 - p / 0.35, 0, 1);
    descB.style.opacity = eio(prog(p, 0.28, 0.62));

    /* photo slides in */
    const pp = eio(prog(p, 0.22, 0.65));
    photoWrap.style.opacity = pp;
    photoWrap.style.transform = `translateX(${(1 - pp) * 3}rem)`;

    /* scroll hint fades */
    if (scrollHint) scrollHint.style.opacity = clamp(1 - p * 6, 0, 1);
  }

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', () => { cachedImWidth = 0; update(); });
  update();

  // Re-measure after Google Fonts load — fallback font has a different width,
  // which causes ELLA to land at the wrong left edge if cached too early.
  document.fonts.ready.then(() => { cachedImWidth = 0; update(); });
})();

/* ============================================================
   TIMELINE (project pages)
   ============================================================ */
(function initTimeline() {
  const timeline   = document.querySelector('.timeline');
  const tlProgress = document.getElementById('tlProgress');
  if (!timeline) return;

  const tlItems = document.querySelectorAll('.tl-item');
  const dotObserver = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('active'); });
  }, { threshold: 0.4 });
  tlItems.forEach(item => dotObserver.observe(item));

  if (tlProgress) {
    window.addEventListener('scroll', () => {
      const rect = timeline.getBoundingClientRect();
      const pct  = Math.max(0, Math.min(1,
        (window.innerHeight - rect.top) / (rect.height + window.innerHeight)
      ));
      tlProgress.style.height = (pct * 100) + '%';
    }, { passive: true });
  }
})();

/* ============================================================
   CONTACT FORM — Web3Forms
   ============================================================ */
const form = document.getElementById('contactForm');
if (form) {
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn     = form.querySelector('.form-submit');
    const btnText = btn.querySelector('span');
    const orig    = btnText.textContent;
    btnText.textContent = 'Sending…';
    btn.disabled = true;

    try {
      const res  = await fetch('https://formspree.io/f/xnjyrynz', {
        method:  'POST',
        headers: { 'Accept': 'application/json' },
        body:    new FormData(form)
      });
      const data = await res.json();

      if (res.ok) {
        btnText.textContent = 'Sent! Talk soon.';
        form.reset();
        setTimeout(() => { btnText.textContent = orig; btn.disabled = false; }, 3500);
      } else {
        btnText.textContent = data.error || 'Something went wrong — try again.';
        btn.disabled = false;
      }
    } catch {
      btnText.textContent = 'Something went wrong — try again.';
      btn.disabled = false;
    }
  });
}
