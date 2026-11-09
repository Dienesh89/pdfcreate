(function () {
  var header = document.getElementById('siteHeader');
  var hero = document.getElementById('hero');
  var glow = document.getElementById('glow');
  var stage = document.getElementById('stage');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fineMouse = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* Sticky header: shrink slightly once the page is scrolled (class only toggled when it changes) */
  var scrolled = false;
  function onScroll() {
    var s = window.scrollY > 20;
    if (s !== scrolled) { scrolled = s; header.classList.toggle('scrolled', s); }
  }
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* The hero (animations, typing) only runs while it is visible and the tab is open */
  var heroVisible = true, typingWaiting = false, resumeTyping = function () {};
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      heroVisible = entries[0].isIntersecting;
      hero.classList.toggle('is-offscreen', !heroVisible);
      if (heroVisible) resumeTyping();
    }).observe(hero);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) resumeTyping(); });

  /* Typed rotating words in the tagline */
  var el = document.getElementById('typed');
  var words = ['exam papers', 'syllabus sheets', 'class notes', 'assignments'];
  if (reduce) { el.textContent = words[0]; }
  else {
    var w = 0, c = 0, del = false;
    var tick = function () {
      if (!heroVisible || document.hidden) { typingWaiting = true; return; }
      var word = words[w];
      el.textContent = word.slice(0, c);
      var delay = del ? 45 : 95;
      if (!del && c === word.length) { del = true; delay = 1400; }
      else if (del && c === 0) { del = false; w = (w + 1) % words.length; delay = 350; }
      c += del ? -1 : 1;
      setTimeout(tick, delay);
    };
    resumeTyping = function () { if (typingWaiting) { typingWaiting = false; tick(); } };
    tick();
  }

  /* Mouse interaction (desktop only): glow follows cursor, icons drift, paper stack tilts.
     Work is done at most once per frame. */
  if (!reduce && fineMouse) {
    var floaters = document.querySelectorAll('.floaters i');
    var lastEvt = null, raf = 0;
    var frame = function () {
      raf = 0;
      var e = lastEvt; if (!e) return;
      var r = hero.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      glow.style.transform = 'translate(' + x + 'px,' + y + 'px) translate(-50%, -50%)';
      var nx = (x / r.width - 0.5), ny = (y / r.height - 0.5);
      floaters.forEach(function (f) {
        var d = +f.dataset.depth || 30;
        f.style.transform = 'translate(' + (-nx * d) + 'px,' + (-ny * d) + 'px)';
      });
      var s = stage.getBoundingClientRect();
      var sx = (e.clientX - (s.left + s.width / 2)) / r.width;
      var sy = (e.clientY - (s.top + s.height / 2)) / r.height;
      stage.style.transform = 'rotateY(' + (sx * 30) + 'deg) rotateX(' + (-sy * 30) + 'deg)';
    };
    hero.addEventListener('mousemove', function (e) { lastEvt = e; if (!raf) raf = requestAnimationFrame(frame); }, { passive: true });
    hero.addEventListener('mouseleave', function () {
      lastEvt = null; stage.style.transform = ''; floaters.forEach(function (f) { f.style.transform = ''; });
    });
  }

  /* Get Started: ripple, then navigate to the All Features page */
  document.querySelectorAll('.get-started').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      var r = btn.getBoundingClientRect(), size = Math.max(r.width, r.height);
      var s = document.createElement('span');
      s.className = 'ripple';
      s.style.width = s.style.height = size + 'px';
      s.style.left = (e.clientX - r.left - size / 2) + 'px';
      s.style.top = (e.clientY - r.top - size / 2) + 'px';
      btn.appendChild(s);
      setTimeout(function () { s.remove(); }, 600);
      if (e.ctrlKey || e.metaKey || e.shiftKey || reduce) return;
      e.preventDefault();
      document.body.style.transition = 'opacity .25s'; document.body.style.opacity = '0';
      setTimeout(function () { window.location.href = btn.getAttribute('href'); }, 220);
    });
  });
  window.addEventListener('pageshow', function () { document.body.style.opacity = ''; });

  /* Scroll reveal */
  var items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { setTimeout(function () { en.target.classList.add('in'); }, (en.target.dataset.i || 0) * 90); io.unobserve(en.target); }
      });
    }, { threshold: 0.15 });
    items.forEach(function (it, i) { it.dataset.i = i % 4; io.observe(it); });
  } else { items.forEach(function (it) { it.classList.add('in'); }); }
})();
