// Builds the site from src/template.html + content/*.json.
// English copy lives in content/*.json (edited in Pages CMS).
// Translations live in content/i18n/<code>.json and fall back to English
// for anything missing. Dates and times are formatted per language here,
// so changing a date in English updates every language automatically.
// Netlify runs this on every deploy. Never hand-edit the generated HTML.
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const readJSON = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const read = f => readJSON(path.join('content', f + '.json'));

const LANGS = readJSON('src/languages.json');
const config = readJSON('src/config.json');
config.logoSvg = fs.readFileSync(path.join(ROOT, 'images', 'esl-omaha-logo.svg'), 'utf8').replace('<svg ', '<svg aria-hidden="true" focusable="false" ');
const uiEn = readJSON('src/ui.json');
const loadTr = l => { const f = path.join(ROOT, 'content', 'i18n', l.file + '.json'); return l.code === 'en' || !fs.existsSync(f) ? {} : JSON.parse(fs.readFileSync(f, 'utf8')); };
const SECTIONS = ['hero', 'facts', 'classes', 'expect', 'faq', 'register', 'contact', 'footer', 'seo'];
const en = Object.fromEntries(SECTIONS.map(s => [s, read(s)]));

// ---------- helpers ----------
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// keep the last two words together so lines never end on one orphaned word
const tie = s => s.replace(/ ([^\s<>]{1,14})$/, '&nbsp;$1');
const fmt = s => tie(esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\*(.+?)\*/g, '<em>$1</em>')
  .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+|tel:[^\s)]+)\)/g, '<a href="$2">$1</a>'));
const txt = s => tie(esc(s));
const img = p => '/' + esc(String(p || '').replace(/^\//, ''));
const mapLink = a => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a);

// deep merge: translation over English, arrays by index, blanks fall back
const merge = (base, over) => {
  if (over === undefined || over === null || over === '') return base;
  if (Array.isArray(base)) return base.map((b, i) => merge(b, Array.isArray(over) ? over[i] : undefined));
  if (base && typeof base === 'object') {
    const out = {};
    for (const k of Object.keys(base)) out[k] = merge(base[k], over[k]);
    return out;
  }
  return typeof over === typeof base ? over : base;
};

// dates and times in each language, always on the Gregorian calendar
const dateFmt = (loc, o) => new Intl.DateTimeFormat(loc, { calendar: 'gregory', timeZone: 'UTC', ...o });
const d = s => new Date(s + (s.length === 7 ? '-01' : '') + 'T00:00:00Z');
const t = s => new Date('2000-01-01T' + s + ':00Z');
const dateRange = (loc, a, b) => dateFmt(loc, { year: 'numeric', month: 'long', day: 'numeric' }).formatRange(d(a), d(b));
const monthRange = (loc, a, b) => `${dateFmt(loc, { year: 'numeric', month: 'long', day: 'numeric' }).format(d(a))} – ${dateFmt(loc, { year: 'numeric', month: 'long' }).format(d(b))}`;
const timeRange = (loc, a, b) => dateFmt(loc, { hour: 'numeric', minute: '2-digit' }).formatRange(t(a), t(b));

const icon = id => `<svg class="i" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const greetings = LANGS.map(l => `<span lang="${l.code}" dir="${l.dir || 'ltr'}">${esc(l.hello)}</span>`).join('<span class="dot" aria-hidden="true"></span>');

// ---------- page ----------
function page(lang) {
  const tr = loadTr(lang);
  const c = Object.fromEntries(SECTIONS.map(s => [s, merge(en[s], tr[s])]));
  const u = merge(uiEn, tr.ui);
  const loc = lang.intl || lang.code;
  const cls = c.classes;
  const when = k => dateRange(loc, en.classes[k].startDate, en.classes[k].endDate);
  const time = k => timeRange(loc, en.classes[k].startTime, en.classes[k].endTime);
  const pre = lang.path ? `/${lang.path}/` : '/';

  const classCard = (k, tone) => {
    const x = cls[k];
    return `
        <article class="class-card ${tone}" id="class-${k}">
          <p class="class-name">${txt(x.name)}</p>
          <h3>${txt(x.day)}</h3>
          <p class="class-time">${esc(time(k))}</p>
          <dl>
            <div><dt>${icon('calendar')}${esc(u.when)}</dt><dd>${esc(when(k))}</dd></div>
            <div><dt>${icon('people')}${esc(u.who)}</dt><dd>${txt(x.who)}</dd></div>
            <div><dt>${icon('pin')}${esc(u.where)}</dt><dd><span dir="ltr">${esc(x.address)}</span> <a class="dir-link" href="${mapLink(x.address)}" target="_blank" rel="noopener">${esc(u.directions)}</a></dd></div>
            <div><dt>${icon('child')}${esc(u.childcare)}</dt><dd>${txt(x.childcare)}</dd></div>
          </dl>
          <a class="btn btn-dark" href="#register" data-class="${k}">${esc(k === 'tuesday' ? u.register_tuesday : u.register_thursday)}</a>
        </article>`;
  };
  const b = cls.bibleStudy;

  // ----- form pieces -----
  const req = `<span class="req">${esc(u.f_required)}</span>`;
  const opt = `<span class="opt">${esc(u.f_optional)}</span>`;
  const field = (id, label, input, { required = true, help = '', cls: fc = '' } = {}) => `
          <div class="field ${fc}">
            <label for="${id}">${esc(label)} ${required ? req : opt}</label>${help ? `\n            <p class="help" id="${id}-help">${esc(help)}</p>` : ''}
            ${input}
            <p class="err" id="${id}-err" hidden></p>
          </div>`;
  const input = (id, name, type = 'text', extra = '') => `<input id="${id}" name="${name}" type="${type}"${extra}>`;
  const radios = (name, legend, options, { required = true, cls: rc = '', checkbox = false } = {}) => `
          <fieldset class="field choice ${rc}" data-name="${name}"${required ? ' data-required' : ''}>
            <legend>${esc(legend)} ${required ? req : (checkbox ? `<span class="opt">${esc(u.f_choose_any)}</span>` : opt)}</legend>
            <div class="opts">
${options.map(([value, label]) => `              <label class="opt-item"><input type="${checkbox ? 'checkbox' : 'radio'}" name="${name}" value="${esc(value)}"><span>${esc(label)}</span></label>`).join('\n')}
            </div>
            <p class="err" hidden></p>
          </fieldset>`;
  const months = u.months.map((m, i) => `<option value="${String(i + 1).padStart(2, '0')}">${esc(m)}</option>`).join('');

  const classOpt = k => `${cls[k].day} · ${time(k)} · ${cls[k].who}`;

  const registerForm = `
        <form class="form" id="register-form" name="registration" data-kind="register" method="POST" data-netlify="true" netlify-honeypot="company" novalidate>
          <input type="hidden" name="form-name" value="registration">
          <input type="hidden" name="language" value="${lang.code}">
          <p class="hp" aria-hidden="true"><label>Company <input name="company" tabindex="-1" autocomplete="off"></label></p>
          ${radios('class', u.f_class, [['tuesday', classOpt('tuesday')], ['thursday', classOpt('thursday')]], { cls: 'class-pick' })}
          <div class="row">
${field('r-first', u.f_first, input('r-first', 'first', 'text', ' autocomplete="given-name" required'))}
${field('r-last', u.f_last, input('r-last', 'last', 'text', ' autocomplete="family-name" required'))}
          </div>
${field('r-middle', u.f_middle, input('r-middle', 'middle', 'text', ' autocomplete="additional-name"'), { required: false })}
          <fieldset class="field dob" data-name="dob" data-required>
            <legend>${esc(u.f_dob)} ${req}</legend>
            <div class="row three dob-row">
              <label><span>${esc(u.f_month)}</span><select name="dob_month" autocomplete="bday-month"><option value="">${esc(u.f_select)}</option>${months}</select></label>
              <label><span>${esc(u.f_day)}</span><input name="dob_day" inputmode="numeric" maxlength="2" autocomplete="bday-day" dir="ltr"></label>
              <label><span>${esc(u.f_year)}</span><input name="dob_year" inputmode="numeric" maxlength="4" autocomplete="bday-year" placeholder="1990" dir="ltr"></label>
            </div>
            <p class="err" hidden></p>
          </fieldset>
${radios('gender', u.f_gender, [['Male', u.o_male], ['Female', u.o_female]], { cls: 'gender' })}
          <div class="row">
${field('r-phone', u.f_phone, input('r-phone', 'phone', 'tel', ' autocomplete="tel" dir="ltr" required'))}
${field('r-email', u.f_email, input('r-email', 'email', 'email', ' autocomplete="email" dir="ltr" required'))}
          </div>
          <fieldset class="field address" data-name="address">
            <legend>${esc(u.f_address)} ${req}</legend>
${field('r-line1', u.f_line1, input('r-line1', 'line1', 'text', ' autocomplete="address-line1" dir="ltr" required'))}
${field('r-line2', u.f_line2, input('r-line2', 'line2', 'text', ' autocomplete="address-line2" dir="ltr"'), { required: false })}
            <div class="row three">
${field('r-city', u.f_city, input('r-city', 'city', 'text', ' autocomplete="address-level2" dir="ltr" value="Omaha" required'))}
${field('r-state', u.f_state, input('r-state', 'state', 'text', ' autocomplete="address-level1" dir="ltr" value="NE" required'))}
${field('r-zip', u.f_zip, input('r-zip', 'zip', 'text', ' autocomplete="postal-code" inputmode="numeric" dir="ltr" required'))}
            </div>
          </fieldset>
${radios('contact_method', u.f_contact_method, [['Text', u.o_text], ['Email', u.o_email], ['Phone Call', u.o_call], ['WhatsApp', u.o_whatsapp]], { required: false, checkbox: true })}
          <div class="row">
${field('r-country', u.f_country, input('r-country', 'country', 'text', ' required aria-describedby="r-country-help"'), { help: u.f_country_help })}
${field('r-language', u.f_language, input('r-language', 'first_language', 'text', ' required'))}
          </div>
${radios('before', u.f_before, [['Yes', u.o_yes], ['No', u.o_no]])}
${radios('level', u.f_level, [['Intro', u.o_intro], ...[1, 2, 3, 4, 5].map(n => [`Level ${n}`, `${u.o_level} ${n}`])], { cls: 'follow', }).replace('class="field choice follow"', 'class="field choice follow" data-show-if="before=Yes" hidden')}
${radios('heard', u.f_heard, [['Family', u.o_family], ['Friend', u.o_friend], ['Website', u.o_website], ['Flyer', u.o_flyer], ['Restaurant', u.o_restaurant], ['Library', u.o_library], ['School', u.o_school], ['Other', u.o_other]])}
          <div class="follow" data-show-if="heard=Other" hidden>
${field('r-heard-other', u.f_heard_other, input('r-heard-other', 'heard_other', 'text', ' required'))}
          </div>
          <div class="follow" data-show-if="class=thursday" hidden>
${radios('childcare', u.f_childcare, [['No', u.o_no], ['Yes', u.o_yes]], { required: false })}
            <div class="follow" data-show-if="childcare=Yes" hidden>
${field('r-children', u.f_children, `<textarea id="r-children" name="children" rows="3" placeholder="${esc(u.f_children_hint)}"></textarea>`, { required: false })}
            </div>
          </div>
${radios('ride', u.f_ride, [['No', u.o_no], ['Yes, I am interested in transportation (for groups of 2+ only)', u.o_ride_yes]], { required: false })}
          <p class="privacy">${esc(u.privacy)}</p>
          <p class="form-error" role="alert" hidden></p>
          <button class="btn btn-dark btn-lg" type="submit">${esc(u.f_submit_register)}</button>
        </form>
        <div class="form-success" id="register-success" tabindex="-1" hidden>
          ${icon('check')}<p>${txt(c.register.success)}</p>
        </div>`;

  const contactForm = `
        <form class="form" id="contact-form" name="contact" data-kind="contact" method="POST" data-netlify="true" netlify-honeypot="company" novalidate>
          <input type="hidden" name="form-name" value="contact">
          <input type="hidden" name="language" value="${lang.code}">
          <p class="hp" aria-hidden="true"><label>Company <input name="company" tabindex="-1" autocomplete="off"></label></p>
          <div class="row">
${field('c-first', u.f_first, input('c-first', 'first', 'text', ' autocomplete="given-name" required'))}
${field('c-last', u.f_last, input('c-last', 'last', 'text', ' autocomplete="family-name" required'))}
          </div>
${field('c-email', u.f_email, input('c-email', 'email', 'email', ' autocomplete="email" dir="ltr" required'))}
${field('c-message', u.f_message, '<textarea id="c-message" name="message" rows="5"></textarea>', { required: false })}
          <p class="form-error" role="alert" hidden></p>
          <button class="btn btn-dark" type="submit">${esc(u.f_submit_contact)}</button>
        </form>
        <div class="form-success" id="contact-success" tabindex="-1" hidden>
          ${icon('check')}<p>${txt(c.contact.success)}</p>
        </div>`;

  const langLinks = (cls2 = '') => LANGS.map(l => `<a class="${cls2}" href="${l.path ? `/${l.path}/` : '/'}" hreflang="${l.code}" lang="${l.code}" dir="${l.dir || 'ltr'}" data-lang="${l.code}"${l.code === lang.code ? ' aria-current="true"' : ''}>${esc(l.native)}</a>`).join('');
  const moreLinks = config.moreLanguages.map(m => `<button type="button" class="more-lang" data-gt="${m.code}" lang="${m.code}">${esc(m.native)}<small>${esc(m.english)}</small></button>`).join('');

  const content = `
<div class="langbar" role="navigation" aria-label="${esc(u.lang_heading)}">
  <div class="wrap">
    <span class="lb-label">${icon('globe')}<span>${esc(u.lang_heading)}</span></span>
    <div class="lb-list">${langLinks()}<button type="button" class="lb-more" data-open-lang>${esc(u.lang_more)} +</button></div>
  </div>
</div>

<header class="top">
  <div class="wrap">
    <a class="logo" href="${pre}" aria-label="ESL Omaha">${config.logoSvg}</a>
    <nav aria-label="Main">
      <a href="#classes">${esc(u.nav_classes)}</a>
      <a href="#faq">${esc(u.nav_faq)}</a>
      <a href="#contact">${esc(u.nav_contact)}</a>
    </nav>
    <button type="button" class="lang-btn" data-open-lang aria-haspopup="dialog">${icon('globe')}<span>${esc(lang.native)}</span></button>
    <a class="btn btn-dark btn-sm" href="#register">${esc(u.nav_register)}</a>
  </div>
</header>

<div class="suggest" id="suggest" hidden>
  <div class="wrap"><p></p><span><button type="button" class="btn btn-dark btn-sm" data-yes></button><button type="button" class="btn-link" data-no></button></span></div>
</div>

<main id="main">
  <section class="hero">
    <div class="wrap">
      <div class="hero-copy">
        <p class="pill">${txt(c.hero.eyebrow)}</p>
        <h1>${txt(c.hero.heading)}</h1>
        <p class="lede">${fmt(c.hero.text)}</p>
        <div class="actions">
          <a class="btn btn-dark btn-lg" href="#register">${esc(c.hero.primaryButton)}</a>
          <a class="btn btn-line btn-lg" href="#classes">${esc(c.hero.secondaryButton)}</a>
        </div>
      </div>
      <figure class="hero-photo">
        <div class="bubble"><img src="${img(c.hero.photo)}" srcset="/images/esl-group-1200.webp 1200w, ${img(c.hero.photo)} 1800w" sizes="(max-width: 900px) 92vw, 50vw" alt="${esc(c.hero.photoAlt)}" width="1800" height="1200" fetchpriority="high"></div>
        <svg class="tail" viewBox="0 0 64 46" aria-hidden="true"><path d="M12 0 L0 44 L54 0 Z" fill="var(--paper)"/><path d="M12 1.5 L1.5 43 L54 1.5" fill="none" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/></svg>
      </figure>
    </div>
  </section>

  <div class="hello" aria-hidden="true"><div class="wrap">${greetings}</div></div>

  <section class="facts" aria-label="ESL Omaha">
    <div class="wrap">
${c.facts.items.map(f => `      <div class="fact"><p class="fact-title">${txt(f.title)}</p><p>${fmt(f.text)}</p></div>`).join('\n')}
    </div>
  </section>

  <section class="classes" id="classes">
    <div class="wrap">
      <div class="head">
        <p class="eyebrow">${txt(cls.eyebrow)}</p>
        <h2>${txt(cls.heading)}</h2>
        <p>${fmt(cls.intro)}</p>
      </div>
      <div class="class-grid">${classCard('tuesday', 'tone-aqua')}${classCard('thursday', 'tone-peach')}
      </div>
      <aside class="bible">
        <div>
          <p class="class-name">${txt(b.day)} · ${esc(timeRange(loc, en.classes.bibleStudy.startTime, en.classes.bibleStudy.endTime))}</p>
          <h3>${txt(b.name)}</h3>
          <p>${fmt(b.text)}</p>
        </div>
        <dl>
          <div><dt>${icon('calendar')}${esc(u.when)}</dt><dd>${esc(monthRange(loc, en.classes.bibleStudy.startDate, en.classes.bibleStudy.endMonth))}</dd></div>
          <div><dt>${icon('pin')}${esc(u.where)}</dt><dd>${txt(b.where)} <a class="dir-link" href="${mapLink('Christ Community Church, 404 S 108th Ave, Omaha, NE')}" target="_blank" rel="noopener">${esc(u.directions)}</a></dd></div>
        </dl>
        <a class="btn btn-line" href="${esc(b.link)}" target="_blank" rel="noopener">${esc(u.learn_more)}</a>
      </aside>
    </div>
  </section>

  <section class="expect">
    <div class="wrap">
      <div class="head">
        <p class="eyebrow">${txt(c.expect.eyebrow)}</p>
        <h2>${txt(c.expect.heading)}</h2>
      </div>
      <ol class="steps">
${c.expect.steps.map(s => `        <li><h3>${txt(s.title)}</h3><p>${fmt(s.text)}</p></li>`).join('\n')}
      </ol>
    </div>
  </section>

  <section class="faq" id="faq">
    <div class="wrap split">
      <div class="head">
        <p class="eyebrow">${txt(c.faq.eyebrow)}</p>
        <h2>${txt(c.faq.heading)}</h2>
      </div>
      <div class="faq-list">
${c.faq.items.map(f => `        <details>
          <summary>${txt(f.question)}</summary>
          <p>${fmt(f.answer)}</p>
        </details>`).join('\n')}
      </div>
    </div>
  </section>

  <section class="register" id="register">
    <div class="wrap narrow">
      <div class="head center">
        <p class="eyebrow">${txt(c.register.eyebrow)}</p>
        <h2>${txt(c.register.heading)}</h2>
        <p>${fmt(c.register.text)}</p>
      </div>
      <div class="panel">${registerForm}
      </div>
    </div>
  </section>

  <section class="contact" id="contact">
    <div class="wrap split">
      <div class="contact-intro">
        <p class="eyebrow">${txt(c.contact.eyebrow)}</p>
        <h2>${txt(c.contact.heading)}</h2>
        <p>${fmt(c.contact.text)}</p>
        <div class="person">
          <img src="${img(c.contact.photo)}" alt="${esc(c.contact.name)}" width="120" height="120" loading="lazy">
          <p><strong>${esc(c.contact.name)}</strong><span>${txt(c.contact.role)}</span></p>
        </div>
      </div>
      <div class="panel">${contactForm}
      </div>
    </div>
  </section>
</main>

<footer>
  <div class="wrap">
    <div class="f-brand">
      <a class="logo" href="${pre}" aria-label="ESL Omaha">${config.logoSvg}</a>
      <p>${txt(c.footer.text)}</p>
      <p dir="ltr">${esc(c.footer.address)}</p>
      <a class="fb" href="${esc(c.footer.facebook)}" target="_blank" rel="noopener">${icon('facebook')}${esc(u.facebook)}</a>
    </div>
    <nav class="f-langs" aria-label="${esc(u.lang_heading)}">
      <p>${icon('globe')}${esc(u.lang_heading)}</p>
      <div>${langLinks()}</div>
    </nav>
  </div>
  <p class="copy">&copy; <span id="yr">2026</span> ESL Omaha</p>
</footer>

<dialog class="lang-dialog" id="lang-dialog" aria-labelledby="lang-dialog-title">
  <div class="ld-head">
    <h2 id="lang-dialog-title">${icon('globe')}${esc(u.lang_heading)}</h2>
    <button type="button" class="ld-close" data-close aria-label="${esc(u.close)}">${icon('x')}</button>
  </div>
  <div class="ld-grid">${langLinks('ld-lang')}</div>
  <h3>${esc(u.lang_more)}</h3>
  <p class="ld-note">${esc(u.lang_more_note)}</p>
  <div class="ld-grid more">${moreLinks}</div>
</dialog>`;

  // strings the browser script needs
  const pageData = {
    lang: lang.code,
    path: pre,
    endpoint: config.formEndpoint,
    t: {
      required: u.f_error_required, email: u.f_error_email, date: u.f_error_date,
      summary: u.f_error_summary, send: u.f_error_send, sending: u.f_sending
    },
    suggest: Object.fromEntries(LANGS.map(l => {
      const lt = loadTr(l);
      const lu = merge(uiEn, lt.ui);
      return [l.code, { text: lu.lang_suggest, yes: lu.lang_yes, no: lu.lang_no, path: l.path ? `/${l.path}/` : '/', dir: l.dir || 'ltr' }];
    }))
  };

  const hreflang = LANGS.map(l => `<link rel="alternate" hreflang="${l.code}" href="${config.siteUrl}${l.path ? `/${l.path}/` : '/'}">`).join('\n  ')
    + `\n  <link rel="alternate" hreflang="x-default" href="${config.siteUrl}/">`;

  let html = fs.readFileSync(path.join(ROOT, 'src', 'template.html'), 'utf8');
  const fill = {
    LANG: lang.code, DIR: lang.dir || 'ltr', TITLE: esc(c.seo.title), DESCRIPTION: esc(c.seo.description),
    CANONICAL: config.siteUrl + pre, OG_IMAGE: config.siteUrl + img(c.seo.shareImage), HREFLANG: hreflang,
    SKIP: esc(u.skip), FONTS: lang.fonts || '', PAGE_DATA: JSON.stringify(pageData).replace(/</g, '\\u003c'),
    SCRIPT_CLASS: lang.script || 'latin'
  };
  html = html.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in fill ? fill[k] : m));
  return html.replace('<!--CONTENT-->', content);
}

for (const lang of LANGS) {
  const out = lang.path ? path.join(ROOT, lang.path, 'index.html') : path.join(ROOT, 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, page(lang));
  console.log('Built', path.relative(ROOT, out));
}
