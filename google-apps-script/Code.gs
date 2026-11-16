/**
 * ESL Omaha form connector
 * Receives the three website forms and adds a row to the matching
 * Google Sheet, the same sheets Squarespace used. Columns are matched
 * by their header names, so the sheets keep working exactly as before.
 * Any new question becomes a new column at the end.
 *
 * Setup: paste into a new Apps Script project (script.google.com) from
 * the Google account that owns the sheets, fill in CONFIG, then
 * Deploy > New deployment > Web app, Execute as: Me, Who has access: Anyone.
 * Put the web app URL in src/config.json ("formEndpoint").
 */
var CONFIG = {
  sheets: {
    tuesday:  '1db1EsP8gCsKq2bHq84k0Z9o9uzMe2z6_vzc68pzNVbc', // ESL Omaha Tuesday Registration
    thursday: '1QRefqjFL32MLoRaqcsOUOIaw4RjaQM1IJAaQdjNfxcE', // ESL Omaha Thursday Registration
    contact:  '1rw_c5w5s_guqYBXrAsNf6grs5nV5xiLMHW-4upOUGGw'  // ESL Omaha Contact Form
  },
  // Who gets an email for each submission. Separate several with commas.
  notify: {
    tuesday:  'ESL.Omaha.NE@gmail.com',
    thursday: 'ESL.Omaha.NE@gmail.com',
    contact:  'ESL.Omaha.NE@gmail.com'
  },
  // The timestamp goes in whichever of these the sheet already has (leftmost wins).
  timestampHeaders: ['Submitted On', 'Date'],
  timeZone: 'America/Chicago'
};

var LABELS = { tuesday: 'Tuesday registration', thursday: 'Thursday registration', contact: 'Contact form' };
var LANG_NAMES = { en: 'English', es: 'Spanish', 'fa-AF': 'Dari', ps: 'Pashto', ar: 'Arabic', 'zh-Hans': 'Chinese', sw: 'Swahili', fr: 'French', vi: 'Vietnamese', ru: 'Russian', 'pt-BR': 'Portuguese', te: 'Telugu', ne: 'Nepali', ko: 'Korean' };

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var data = JSON.parse(e.postData.contents);
    var id = CONFIG.sheets[data.form];
    if (!id || id.indexOf('PASTE_') === 0) throw new Error('Unknown form: ' + data.form);
    lock.waitLock(20000);
    var sheet = SpreadsheetApp.openById(id).getSheets()[0];
    var row = writeRow(sheet, data);
    lock.releaseLock();
    notify(data, row);
    return json({ ok: true });
  } catch (err) {
    try { lock.releaseLock(); } catch (x) {}
    console.error(err);
    return json({ ok: false, error: String(err.message || err) });
  }
}

function doGet() { return json({ ok: true, service: 'ESL Omaha forms' }); }

function writeRow(sheet, data) {
  var norm = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ''); };
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  if (headers.every(function (h) { return !h; })) headers = [];
  var index = {};
  headers.forEach(function (h, i) { if (h) index[norm(h)] = i; });

  var values = {};
  var stamp = Utilities.formatDate(new Date(), CONFIG.timeZone, 'MM/dd/yyyy HH:mm:ss');
  var stampHeader = null, stampPos = Infinity;
  CONFIG.timestampHeaders.forEach(function (h) {
    if (norm(h) in index && index[norm(h)] < stampPos) { stampHeader = headers[index[norm(h)]]; stampPos = index[norm(h)]; }
  });
  values[stampHeader || CONFIG.timestampHeaders[0]] = stamp;
  Object.keys(data.fields || {}).forEach(function (k) { values[k] = data.fields[k]; });

  // Alternate columns (First Name, City...) are filled only if the sheet already has them.
  var alt = data.alt || {};
  Object.keys(alt).forEach(function (k) { if (norm(k) in index) values[k] = alt[k]; });
  // If the sheet splits the name or address, skip the combined columns it does not have.
  if (!('name' in index) && ('firstname' in index)) delete values['Name'];
  if (!('address' in index) && ('addressline1' in index)) delete values['Address'];

  Object.keys(values).forEach(function (k) {
    if (!(norm(k) in index)) {
      headers.push(k);
      index[norm(k)] = headers.length - 1;
      sheet.getRange(1, headers.length).setValue(k);
    }
  });

  var row = [];
  for (var c = 0; c < headers.length; c++) row.push('');
  Object.keys(values).forEach(function (k) {
    var v = values[k] == null ? '' : String(values[k]);
    // never let an answer run as a spreadsheet formula
    if (/^[=+\-@]/.test(v)) v = "'" + v;
    row[index[norm(k)]] = v;
  });
  sheet.appendRow(row);
  return values;
}

function notify(data, values, toOverride) {
  var to = toOverride || CONFIG.notify[data.form];
  if (!to) return;
  var lines = Object.keys(values).filter(function (k) { return values[k] !== '' && values[k] != null; })
    .map(function (k) { return k + ': ' + values[k]; });
  var lang = LANG_NAMES[data.lang] || data.lang || 'English';
  if (lang !== 'English') lines.push('', 'Website language used: ' + lang);
  var who = (data.fields && data.fields['Name']) || 'Someone';
  var opts = { name: 'ESL Omaha Website', htmlBody: buildEmail(data, values, lang) };
  if (data.fields && /@/.test(data.fields['Email'] || '')) opts.replyTo = data.fields['Email'];
  // The plain-text lines are the fallback for mail apps that do not show HTML.
  MailApp.sendEmail(to, 'ESL Omaha: new ' + LABELS[data.form] + ' from ' + who, lines.join('\n'), opts);
}

// The styled email, matching eslomaha.com (logo, aqua bar, navy buttons).
function buildEmail(data, values, lang) {
  var esc = function (v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  var INK = '#101935', INK2 = '#3b4462', LINE = '#e6dfd3', PAPER = '#FFFBF4', AQUA = '#8DE2E0';
  var FONT = "font-family:'Proxima Nova',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;";
  var f = data.fields || {};
  var who = f['Name'] || 'Someone';
  var isContact = data.form === 'contact';
  var email = /@/.test(f['Email'] || '') ? f['Email'] : '';
  var phone = f['Phone'] || '';
  var sheetUrl = 'https://docs.google.com/spreadsheets/d/' + CONFIG.sheets[data.form];
  var first = String(who).split(' ')[0];

  var btn = function (href, label, dark) {
    return '<a href="' + esc(href) + '" style="display:inline-block;margin:0 8px 8px 0;padding:11px 20px;border-radius:999px;border:2px solid ' + INK + ';' +
      'background:' + (dark ? INK : '#ffffff') + ';color:' + (dark ? '#ffffff' : INK) + ';' + FONT + 'font-size:15px;font-weight:bold;text-decoration:none;">' + esc(label) + '</a>';
  };
  var buttons = '';
  if (email) buttons += btn('mailto:' + email, 'Email ' + first, true);
  if (phone) buttons += btn('tel:' + String(phone).replace(/[^\d+]/g, ''), 'Call ' + phone, false);
  buttons += btn(sheetUrl, 'Open the spreadsheet', false);

  var skip = { 'Name': 1, 'Message': 1 };
  var rows = Object.keys(values).filter(function (k) { return !skip[k] && values[k] !== '' && values[k] != null; }).map(function (k) {
    return '<tr><td style="padding:11px 0;border-top:1px solid ' + LINE + ';vertical-align:top;width:42%;' + FONT + 'font-size:13px;font-weight:bold;color:' + INK2 + ';">' + esc(k) + '</td>' +
      '<td style="padding:11px 0 11px 14px;border-top:1px solid ' + LINE + ';vertical-align:top;' + FONT + 'font-size:15px;color:' + INK + ';">' + esc(values[k]).replace(/\n/g, '<br>') + '</td></tr>';
  }).join('');

  var message = isContact && f['Message']
    ? '<div style="margin:0 0 22px;padding:16px 18px;background:#E3F7F6;border-radius:14px;' + FONT + 'font-size:16px;line-height:1.55;color:' + INK + ';">' + esc(f['Message']).replace(/\n/g, '<br>') + '</div>'
    : '';
  var langNote = lang !== 'English'
    ? '<p style="margin:0 0 20px;padding:10px 14px;background:#ECFBF2;border-radius:10px;' + FONT + 'font-size:14px;color:' + INK + ';">Filled out on the <strong>' + esc(lang) + '</strong> page. Answers are saved in English where there were choices.</p>'
    : '';

  return '<div style="margin:0;padding:24px 12px;background:' + PAPER + ';">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid ' + LINE + ';border-radius:18px;overflow:hidden;">' +
    '<tr><td style="background:' + AQUA + ';padding:18px 28px;"><img src="https://eslomaha.com/images/esl-omaha-logo-black.png" alt="ESL Omaha" height="34" style="display:block;height:34px;width:auto;border:0;"></td></tr>' +
    '<tr><td style="padding:28px 28px 8px;">' +
    '<span style="display:inline-block;padding:5px 14px;border-radius:999px;background:#FFE3CC;color:#9A4300;' + FONT + 'font-size:13px;font-weight:bold;">' + (isContact ? 'New message' : 'New ' + esc(LABELS[data.form])) + '</span>' +
    '<h1 style="margin:14px 0 18px;' + FONT + 'font-size:28px;line-height:1.15;font-weight:800;color:' + INK + ';">' + esc(who) + '</h1>' +
    message + langNote +
    '<div style="margin:0 0 14px;">' + buttons + '</div>' +
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-bottom:1px solid ' + LINE + ';">' + rows + '</table>' +
    '</td></tr>' +
    '<tr><td style="padding:18px 28px 26px;' + FONT + 'font-size:13px;line-height:1.5;color:' + INK2 + ';">This was also added to the ' + esc(LABELS[data.form]) + ' spreadsheet. Reply to this email to write back to ' + esc(first) + '.<br>Sent from <a href="https://eslomaha.com" style="color:' + INK2 + ';">eslomaha.com</a></td></tr>' +
    '</table></div>';
}

// Run this from the editor to see the styled emails without touching the sheets.
// Sends one sample registration and one sample contact email to the address below.
function sendSamples() {
  var to = 'etwendt@gmail.com';
  var reg = { 'Name': 'Sample Student', 'Middle Name': '', 'Date of Birth': '07/04/1990', 'Gender': 'Female', 'Phone': '(402) 555-0102',
    'Email': 'sample@example.com', 'Address': '404 S 108th Ave, Apt 1, Omaha, NE 68154, United States', 'Preferred Methods of Contact': 'Text,WhatsApp',
    'Country of Origin': 'Afghanistan', 'First Language': 'Dari', 'Have you attended ESL classes at The Porch before?': 'No',
    'How did you hear about us?': 'Friend', 'Do you need childcare?': 'Yes', 'If yes, please list each child:': 'Child 1: Sample, 3, girl',
    'Are you interested in transportation?': 'No' };
  var stamp = { 'Submitted On': Utilities.formatDate(new Date(), CONFIG.timeZone, 'MM/dd/yyyy HH:mm:ss') };
  var merge = function (a, b) { var o = {}; Object.keys(a).forEach(function (k) { o[k] = a[k]; }); Object.keys(b).forEach(function (k) { o[k] = b[k]; }); return o; };
  notify({ form: 'thursday', lang: 'fa-AF', fields: reg }, merge(stamp, reg), to);
  var msg = { 'Name': 'Sample Person', 'Email': 'sample@example.com', 'Message': 'Hello, I would like to learn English.\nDo you have evening classes for beginners?' };
  notify({ form: 'contact', lang: 'en', fields: msg }, merge(stamp, msg), to);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
