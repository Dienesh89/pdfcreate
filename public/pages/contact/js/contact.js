/* Contact Us: validates the form and posts it to /api/contact (which sends it with Resend). */
(function () {
  var form = document.getElementById('contactForm');
  var emailEl = document.getElementById('email');
  var issueEl = document.getElementById('issue');
  var hpEl = document.getElementById('website');
  var msgEl = document.getElementById('msg');
  var sendBtn = document.getElementById('sendBtn');
  var sendLabel = sendBtn.querySelector('span');
  var counter = document.getElementById('counter');
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function showMsg(text, ok) {
    msgEl.textContent = text;
    msgEl.className = 'msg' + (ok ? ' ok' : '');
    msgEl.hidden = false;
  }
  function setInvalid(el, bad) { el.parentElement.classList.toggle('invalid', !!bad); }

  issueEl.addEventListener('input', function () {
    counter.textContent = issueEl.value.length + ' / ' + issueEl.maxLength;
    setInvalid(issueEl, false);
  });
  emailEl.addEventListener('input', function () { setInvalid(emailEl, false); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = emailEl.value.trim();
    var issue = issueEl.value.trim();
    msgEl.hidden = true;

    var badEmail = !EMAIL_RE.test(email);
    var badIssue = issue.length < 5;
    setInvalid(emailEl, badEmail);
    setInvalid(issueEl, badIssue);
    if (badEmail) { showMsg('Please enter a valid email address.'); emailEl.focus(); return; }
    if (badIssue) { showMsg('Please describe your issue (at least a few words).'); issueEl.focus(); return; }

    sendBtn.disabled = true;
    sendLabel.textContent = 'Sending...';

    fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, issue: issue, website: hpEl.value })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (r) {
        if (r.ok) {
          form.reset();
          counter.textContent = '0 / ' + issueEl.maxLength;
          showMsg('Thank you! Your message was sent. We will reply to your email address.', true);
        } else {
          showMsg((r.data && r.data.error) || 'Could not send your message. Please try again.');
        }
      })
      .catch(function () {
        showMsg('Network problem. Please check your connection and try again.');
      })
      .then(function () {
        sendBtn.disabled = false;
        sendLabel.textContent = 'Send';
      });
  });
})();
