/* Back button: goes to the previous page of this site if there is one,
   otherwise to the page given in the button's href (its fallback). */
document.addEventListener('DOMContentLoaded', function () {
  var btn = document.getElementById('backNavBtn');
  if (!btn) return;
  btn.addEventListener('click', function (e) {
    var ref = document.referrer;
    var sameSite = false;
    try { sameSite = !!ref && new URL(ref).origin === location.origin; } catch (err) {}
    if (sameSite && history.length > 1) {
      e.preventDefault();
      history.back();
    }
    /* else: the link's own href (fallback) is followed */
  });
});
