/* ESL Omaha site script: languages, forms, small UI touches. */
(function () {
  'use strict';
  var D = window.ESL || {};
  var T = D.t || {};
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  var yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();

  // header border once scrolled
  var top = document.querySelector('.top');
  var onScroll = function () { top && top.classList.toggle('scrolled', window.scrollY > 8); };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // ---------- languages ----------
  document.querySelectorAll('[data-lang]').forEach(function (a) {
    a.addEventListener('click', function () { store.set('esl-lang', a.getAttribute('data-lang')); });
  });

  var dlg = document.getElementById('lang-dialog');
  document.querySelectorAll('[data-open-lang]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (dlg && dlg.showModal) dlg.showModal(); else location.hash = 'footer';
    });
  });
  if (dlg) {
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();
    });
  }

  // more languages open this page through Google Translate's page proxy
  document.querySelectorAll('[data-gt]').forEach(function (b) {
    b.addEventListener('click', function () {
      var code = b.getAttribute('data-gt');
      var host = location.hostname;
      var url;
      if (/\.translate\.goog$/.test(host)) {
        var u = new URL(location.href);
        u.searchParams.set('_x_tr_tl', code); u.searchParams.set('_x_tr_hl', code);
        url = u.toString();
      } else {
        var proxy = host.replace(/-/g, '--').replace(/\./g, '-') + '.translate.goog';
        url = 'https://' + proxy + '/?_x_tr_sl=en&_x_tr_tl=' + code + '&_x_tr_hl=' + code + '&_x_tr_pto=wapp';
      }
      location.href = url;
    });
  });

  // offer the visitor's own language once, on the English page
  (function suggest() {
    var box = document.getElementById('suggest');
    if (!box || D.lang !== 'en' || store.get('esl-lang') || /translate\.goog$/.test(location.hostname)) return;
    var codes = Object.keys(D.suggest || {});
    var prefs = (navigator.languages || [navigator.language || '']).map(function (l) { return l.toLowerCase(); });
    var match = null;
    for (var i = 0; i < prefs.length && !match; i++) {
      var p = prefs[i];
      if (p.indexOf('en') === 0) return; // English speaker: no prompt
      codes.forEach(function (c) {
        if (match) return;
        var base = c.toLowerCase().split('-')[0];
        if (p === c.toLowerCase() || p.split('-')[0] === base || (base === 'fa' && p.indexOf('prs') === 0)) match = c;
      });
    }
    if (!match || match === 'en') return;
    var s = D.suggest[match];
    var p0 = box.querySelector('p');
    p0.textContent = s.text; p0.setAttribute('lang', match); box.setAttribute('dir', s.dir);
    box.querySelector('[data-yes]').textContent = s.yes;
    box.querySelector('[data-no]').textContent = s.no;
    box.hidden = false;
    box.querySelector('[data-yes]').addEventListener('click', function () { store.set('esl-lang', match); location.href = s.path; });
    box.querySelector('[data-no]').addEventListener('click', function () { store.set('esl-lang', 'en'); box.hidden = true; });
  })();

  // ---------- forms ----------
  function val(form, name) {
    var els = form.querySelectorAll('[name="' + name + '"]');
    if (!els.length) return '';
    if (els[0].type === 'radio') { var c = form.querySelector('[name="' + name + '"]:checked'); return c ? c.value : ''; }
    if (els[0].type === 'checkbox') return Array.prototype.filter.call(els, function (e) { return e.checked; }).map(function (e) { return e.value; }).join(', ');
    return (els[0].value || '').trim();
  }
  function visible(el) { return !el.closest('[hidden]'); }

  function updateFollowUps(form) {
    form.querySelectorAll('[data-show-if]').forEach(function (el) {
      var parts = el.getAttribute('data-show-if').split('=');
      el.hidden = val(form, parts[0]) !== parts[1];
    });
  }

  function setErr(holder, msg) {
    if (!holder) return;
    var err = holder.querySelector('.err');
    holder.classList.toggle('invalid', !!msg);
    if (err) { err.textContent = msg || ''; err.hidden = !msg; }
  }

  function validate(form) {
    var first = null;
    var fail = function (holder, msg) { setErr(holder, msg); if (!first) first = holder; };
    form.querySelectorAll('.field').forEach(function (f) { setErr(f, ''); });
    form.querySelectorAll('input[required],textarea[required],select[required]').forEach(function (inp) {
      if (!visible(inp)) return;
      var holder = inp.closest('.field');
      if (!inp.value.trim()) fail(holder, T.required);
      else if (inp.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inp.value.trim())) fail(holder, T.email);
    });
    form.querySelectorAll('fieldset[data-required]').forEach(function (fs) {
      if (!visible(fs)) return;
      var name = fs.getAttribute('data-name');
      if (name === 'dob') {
        var m = val(form, 'dob_month'), d = +val(form, 'dob_day'), y = +val(form, 'dob_year');
        if (!m || !d || !y) return fail(fs, T.required);
        var dt = new Date(y, +m - 1, d), now = new Date().getFullYear();
        if (dt.getDate() !== d || dt.getMonth() !== +m - 1 || y < now - 110 || y > now - 10) fail(fs, T.date);
        return;
      }
      if (!val(form, name)) fail(fs, T.required);
    });
    if (first) {
      var box = form.querySelector('.form-error');
      box.textContent = T.summary; box.hidden = false;
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var focusable = first.querySelector('input,select,textarea');
      if (focusable) setTimeout(function () { focusable.focus({ preventScroll: true }); }, 350);
      return false;
    }
    form.querySelector('.form-error').hidden = true;
    return true;
  }

  // Build the row exactly as the spreadsheets expect it (column header -> value).
  function payload(form) {
    var kind = form.getAttribute('data-kind');
    var g = function (n) { return val(form, n); };
    var name = (g('first') + ' ' + g('last')).trim();
    if (kind === 'contact') {
      return { form: 'contact', lang: D.lang, fields: { 'Name': name, 'Email': g('email'), 'Message': g('message') },
        alt: { 'First Name': g('first'), 'Last Name': g('last') } };
    }
    var cls = g('class');
    var addr = [g('line1'), g('line2'), g('city'), (g('state') + ' ' + g('zip')).trim()].filter(Boolean).join(', ');
    var f = {
      'Name': name,
      'Middle Name': g('middle'),
      'Date of Birth': g('dob_month') + '/' + ('0' + g('dob_day')).slice(-2) + '/' + g('dob_year'),
      'Gender': g('gender'),
      'Phone': g('phone'),
      'Email': g('email'),
      'Address': addr,
      'Preferred Method(s) of Contact': g('contact_method'),
      'Country of Origin': g('country'),
      'First Language': g('first_language'),
      'Have you attended ESL classes at The Porch before?': g('before'),
      'If yes, what level did you last attend?': g('before') === 'Yes' ? g('level') : '',
      'How did you hear about us?': g('heard'),
      'If other, please state where': g('heard') === 'Other' ? g('heard_other') : ''
    };
    if (cls === 'thursday') {
      f['Do you need childcare?'] = g('childcare');
      f['If yes, please list each child:'] = g('childcare') === 'Yes' ? g('children') : '';
    }
    f['Are you interested in transportation?'] = g('ride');
    return { form: cls, lang: D.lang, fields: f,
      alt: { 'First Name': g('first'), 'Last Name': g('last'), 'Address Line 1': g('line1'), 'Address Line 2': g('line2'),
        'City': g('city'), 'State': g('state'), 'ZIP Code': g('zip'), 'Zip Code': g('zip'), 'Country': 'United States' } };
  }

  function sendToSheets(data) {
    return fetch(D.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j || !j.ok) throw new Error((j && j.error) || 'Sheet error'); return j; });
  }
  // backup: Netlify Forms keeps a copy if Google is unreachable
  function sendToNetlify(form) {
    var body = new URLSearchParams(new FormData(form));
    return fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() })
      .then(function (r) { if (!r.ok) throw new Error('Netlify ' + r.status); });
  }

  document.querySelectorAll('form[data-kind]').forEach(function (form) {
    updateFollowUps(form);
    form.addEventListener('change', function (e) {
      updateFollowUps(form);
      var holder = e.target.closest('.field');
      if (holder && holder.classList.contains('invalid')) setErr(holder, '');
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (form.querySelector('[name=company]').value) return; // bot
      if (!validate(form)) return;
      var btn = form.querySelector('button[type=submit]');
      var label = btn.textContent;
      btn.disabled = true; btn.textContent = T.sending;
      var data = payload(form);
      var go = D.endpoint ? sendToSheets(data).catch(function () { return sendToNetlify(form); }) : sendToNetlify(form);
      go.then(function () {
        form.hidden = true;
        var ok = document.getElementById(form.id.replace('-form', '-success'));
        ok.hidden = false; ok.focus();
        ok.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }).catch(function () {
        var box = form.querySelector('.form-error');
        box.textContent = T.send; box.hidden = false;
        btn.disabled = false; btn.textContent = label;
      });
    });
  });

  // "Register for Tuesdays/Thursdays" picks the class in the form
  document.querySelectorAll('[data-class]').forEach(function (a) {
    a.addEventListener('click', function () {
      var r = document.querySelector('#register-form input[name=class][value="' + a.getAttribute('data-class') + '"]');
      if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  });
})();
