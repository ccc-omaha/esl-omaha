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
