/* Hamburger -> opens / closes the Tools Menu sidebar on mobile (used by every sub-page) */
document.addEventListener('DOMContentLoaded', function () {
  var menuToggle = document.getElementById('menuToggle');
  var sidebar = document.getElementById('sidebar');
  if (!menuToggle || !sidebar) return;
  var header = document.querySelector('header.main-header');
  var icon = menuToggle.querySelector('i');
  function placeSidebar() {
    if (header) document.documentElement.style.setProperty('--header-h', Math.max(0, header.getBoundingClientRect().bottom) + 'px');
  }
  function setOpen(open) {
    if (open) placeSidebar();
    sidebar.classList.toggle('open', open);
    menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (icon) { icon.classList.toggle('fa-bars', !open); icon.classList.toggle('fa-xmark', open); }
  }
  menuToggle.addEventListener('click', function (e) {
    e.stopPropagation();
    setOpen(!sidebar.classList.contains('open'));
  });
  document.addEventListener('click', function (e) {
    if (sidebar.classList.contains('open') && !sidebar.contains(e.target)) setOpen(false);
  });
  window.addEventListener('resize', placeSidebar);
  window.addEventListener('scroll', function () { if (sidebar.classList.contains('open')) placeSidebar(); }, { passive: true });
  placeSidebar();
});
