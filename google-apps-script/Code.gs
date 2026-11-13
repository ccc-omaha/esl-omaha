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
    tuesday:  'PASTE_TUESDAY_SHEET_ID',   // ESL Tuesday registration
    thursday: 'PASTE_THURSDAY_SHEET_ID',  // ESL Thursday registration
    contact:  'PASTE_CONTACT_SHEET_ID'    // ESL contact form
  },
  // Who gets an email for each submission. Separate several with commas.
  notify: {
    tuesday:  '',
    thursday: '',
    contact:  ''
  },
  timestampHeader: 'Submitted On',
  timeZone: 'America/Chicago'
};

var LABELS = { tuesday: 'Tuesday registration', thursday: 'Thursday registration', contact: 'Contact form' };
var LANG_NAMES = { en: 'English', es: 'Spanish', 'fa-AF': 'Dari', ps: 'Pashto', ar: 'Arabic', 'zh-Hans': 'Chinese', uk: 'Ukrainian', sw: 'Swahili', fr: 'French', vi: 'Vietnamese' };

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
  var norm = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); };
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  if (headers.every(function (h) { return !h; })) headers = [];
  var index = {};
  headers.forEach(function (h, i) { if (h) index[norm(h)] = i; });

  var values = {};
  var stamp = Utilities.formatDate(new Date(), CONFIG.timeZone, 'yyyy-MM-dd HH:mm:ss');
  values[CONFIG.timestampHeader] = stamp;
  Object.keys(data.fields || {}).forEach(function (k) { values[k] = data.fields[k]; });

  // Alternate columns (First Name, City...) are filled only if the sheet already has them.
  var alt = data.alt || {};
  Object.keys(alt).forEach(function (k) { if (norm(k) in index) values[k] = alt[k]; });
  // If the sheet splits the name or address, skip the combined columns it does not have.
  if (!('name' in index) && ('first name' in index)) delete values['Name'];
  if (!('address' in index) && ('address line 1' in index)) delete values['Address'];

  Object.keys(values).forEach(function (k) {
    if (!(norm(k) in index)) {
      headers.push(k);
      index[norm(k)] = headers.length - 1;
      sheet.getRange(1, headers.length).setValue(k);
    }
  });

  var row = new Array(headers.length).fill('');
  Object.keys(values).forEach(function (k) {
    var v = values[k] == null ? '' : String(values[k]);
    // keep phone numbers, ZIPs and dates as typed instead of letting Sheets convert them
    if (/^[=+\-@]/.test(v) || /^[\d\s()\/.\-]+$/.test(v)) v = "'" + v;
    row[index[norm(k)]] = v;
  });
  sheet.appendRow(row);
  return values;
}

function notify(data, values) {
  var to = CONFIG.notify[data.form];
  if (!to) return;
  var lines = Object.keys(values).filter(function (k) { return values[k] !== '' && values[k] != null; })
    .map(function (k) { return k + ': ' + values[k]; });
  var lang = LANG_NAMES[data.lang] || data.lang || 'English';
  if (lang !== 'English') lines.push('', 'Website language used: ' + lang);
  var who = (data.fields && data.fields['Name']) || 'Someone';
  var opts = { name: 'ESL Omaha Website' };
  if (data.fields && /@/.test(data.fields['Email'] || '')) opts.replyTo = data.fields['Email'];
  MailApp.sendEmail(to, 'ESL Omaha: new ' + LABELS[data.form] + ' from ' + who, lines.join('\n'), opts);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
