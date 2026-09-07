/**
 * WhatsApp follow-up for a Google Sheets contact list.
 *
 * After a call: click the contact's row, pick a template in the side panel,
 * adjust the text and press the green button. WhatsApp opens with the message
 * already typed for that number; you only press Send. The time is written back
 * into the sheet so you can see who has been contacted.
 *
 * No API keys, no Meta Business account, no risk of a number ban.
 * See CloudApi.gs for the fully automatic (zero-click) alternative.
 */

const CONFIG = {
  // Country code used when a number has no international prefix (420 = CZ).
  defaultCountryCode: '420',
  // Row that holds the column headers.
  headerRow: 1,
  // Column the script writes the "sent at" timestamp into. Created if missing.
  sentColumnHeader: 'WhatsApp odesláno',
  // Checkbox column that acts as a per-row send button (used by CloudApi.gs).
  sendColumnHeader: 'Odeslat',
  // Clickable link in every row. Column I = 9, so columns A-H stay untouched.
  linkColumnHeader: 'WhatsApp',
  linkColumn: 9,
  linkLabel: 'Napsat',
  // Colour of the "Napsat" text in the column.
  linkColor: '#1FA855',
  // Where the link in the column opens:
  //   'app' - wa.me, which hands over to the desktop app after one click
  //   'web' - web.whatsapp.com in the browser
  // 'macapp' (whatsapp://) works in the side panel but NOT here: a spreadsheet
  // cell only accepts http/https links and rejects anything else with
  // "Exception: Neplatný argument".
  linkColumnTarget: 'app',
  // Which entry of TEMPLATES the link in the column uses.
  linkTemplateIndex: 0,
};

// Header names recognised automatically, in Czech and English. Diacritics and
// letter case are ignored, so "Jméno" and "jmeno" both match. If your headers
// are different, use "WhatsApp -> Nastavit sloupce" instead of editing this.
const COLUMN_ALIASES = {
  name: ['jmeno', 'jmeno a prijmeni', 'name', 'kontakt', 'osoba', 'klient', 'prijmeni', 'firma'],
  phone: ['telefon', 'tel', 'mobil', 'cislo', 'telefonni cislo', 'phone', 'number', 'kontakt telefon'],
  note: ['poznamka', 'poznamky', 'note', 'notes', 'popis', 'detail'],
  status: ['stav', 'status', 'hovor', 'volano', 'volani', 'vysledek'],
};

// Message templates offered in the side panel.
// Placeholders: {jmeno} (fifth case - "Martine"), {jmeno1} (as written in the
// sheet - "Martin"), {poznamka}, {datum}
const TEMPLATES = [
  {
    name: 'Po hovoru – shrnutí',
    body: 'Dobrý den, {jmeno},\n\nděkuji za dnešní telefonát. Posílám shrnutí toho, na čem jsme se domluvili:\n\n- \n- \n\nKdyby cokoliv, klidně mi napište sem.\n\nHezký den',
  },
  {
    name: 'Nedovolala jsem se',
    body: 'Dobrý den, {jmeno},\n\nzkoušela jsem se Vám dnes dovolat, bohužel jsem Vás nezastihla. Ozvěte se prosím, až budete mít chvíli, nebo mi napište, kdy se Vám to hodí.\n\nDěkuji a hezký den',
  },
  {
    name: 'Poslání informací',
    body: 'Dobrý den, {jmeno},\n\njak jsme se domluvili po telefonu, posílám slíbené informace:\n\n\nDejte mi prosím vědět, jestli je to takhle v pořádku.\n\nS pozdravem',
  },
  {
    name: 'Připomenutí schůzky',
    body: 'Dobrý den, {jmeno},\n\njen připomínám naši domluvenou schůzku. Kdyby se něco změnilo, dejte mi prosím včas vědět.\n\nTěším se',
  },
];

// The "Napsat" cell carries the state itself, so no timestamp column is needed:
// red until the contact has been messaged, green afterwards.
const PENDING_COLOR = '#EA4335';
const SENT_COLOR = '#34A853';
const LABEL_TEXT_COLOR = '#FFFFFF';
const LINK_COLUMN_WIDTH = 70;

const FIELD_LABELS = {
  name: 'Jméno',
  phone: 'Telefon',
  note: 'Poznámka',
  status: 'Stav',
  sent: 'Odesláno',
  send: 'Odeslat (tlačítko)',
  link: 'Odkaz WhatsApp',
};

/** Adds the custom menu when the spreadsheet is opened. */
function onOpen() {
  const menu = SpreadsheetApp.getUi()
    .createMenu('WhatsApp')
    .addItem('Otevřít panel', 'showSidebar')
    .addItem('Vytvořit odkazy ve sloupci ' + columnLetter_(CONFIG.linkColumn), 'setupLinkColumn')
    .addSeparator()
    .addItem('Nastavit sloupce', 'showColumnPicker');

  // The automatic sending (CloudApi.gs) is optional - only offer it when that
  // file has actually been added to the project.
  if (typeof showApiSettings === 'function') {
    menu.addItem('Automatické odesílání – nastavení', 'showApiSettings');
    menu.addItem('Vytvořit tlačítka Odeslat', 'setupSendButtons');
  }

  // The lead webhook (Webhook.gs) is optional in the same way.
  if (typeof showWebhookInfo === 'function') {
    menu.addSeparator().addItem('Webhook pro inzerát', 'showWebhookInfo');
  }

  menu.addToUi();

  // Open the panel straight away, so clicking a row is all it takes: the panel
  // follows the selection and its button goes to the app without a browser.
  showSidebar();
}

/** Opens the side panel. */
function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('WhatsApp');
  SpreadsheetApp.getUi().showSidebar(html);
}

/** Opens the dialog for mapping sheet columns onto the fields the script uses. */
function showColumnPicker() {
  const html = HtmlService.createHtmlOutputFromFile('Columns').setWidth(420).setHeight(430);
  SpreadsheetApp.getUi().showModalDialog(html, 'Nastavit sloupce');
}

// --- called from the HTML files ---------------------------------------------

/** Returns the templates and the saved "open in" preference. */
function getPanelSettings() {
  return {
    templates: TEMPLATES,
    target: linkTarget_(),
  };
}

/** Remembers whether links open WhatsApp Web or the app. */
function saveLinkTarget(target) {
  const allowed = ['web', 'app', 'macapp'];
  PropertiesService.getUserProperties().setProperty(
    'linkTarget',
    allowed.indexOf(target) !== -1 ? target : 'web'
  );
}

/** Headers of the active sheet plus the current mapping, for the dialog. */
function getColumnSetup() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const width = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(CONFIG.headerRow, 1, 1, width).getDisplayValues()[0];
  return {
    sheetName: sheet.getName(),
    headers: headers.map(function (header, index) {
      return { index: index + 1, label: columnLetter_(index + 1) + ' – ' + (header || '(prázdné)') };
    }),
    detected: findColumns_(sheet),
    saved: readSavedMap_(sheet),
    fields: FIELD_LABELS,
  };
}

/** Stores the mapping chosen in the dialog. Values are 1-based, 0 = auto. */
function saveColumnMap(map) {
  const sheet = SpreadsheetApp.getActiveSheet();
  const cleaned = {};
  Object.keys(FIELD_LABELS).forEach(function (field) {
    const value = Number(map && map[field]);
    if (value > 0) cleaned[field] = value;
  });
  PropertiesService.getDocumentProperties().setProperty(mapKey_(sheet), JSON.stringify(cleaned));
  return findColumns_(sheet);
}

/** Forgets the mapping, so the automatic header detection is used again. */
function clearColumnMap() {
  const sheet = SpreadsheetApp.getActiveSheet();
  PropertiesService.getDocumentProperties().deleteProperty(mapKey_(sheet));
  return findColumns_(sheet);
}

/**
 * Reads the currently selected row and returns everything the panel needs.
 * Called on load and while polling for a new selection.
 */
function getSelection() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const range = SpreadsheetApp.getActiveRange();
  if (!range) {
    return { ok: false, error: 'Není vybrán žádný řádek.' };
  }

  const row = range.getRow();
  if (row <= CONFIG.headerRow) {
    return { ok: false, error: 'Klikněte na řádek s kontaktem (ne na hlavičku).' };
  }

  const columns = findColumns_(sheet);
  if (!columns.phone) {
    return {
      ok: false,
      error: 'Nenašla jsem sloupec s telefonem. Otevřete WhatsApp → Nastavit sloupce.',
    };
  }

  // Display values keep the number formatted exactly as it looks in the sheet,
  // which avoids losing a leading "+" or "00".
  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const cell = function (index) {
    return index ? String(values[index - 1] || '').trim() : '';
  };

  const rawPhone = cell(columns.phone);
  const phone = normalizePhone_(rawPhone);

  return {
    ok: true,
    row: row,
    sheetName: sheet.getName(),
    name: cell(columns.name),
    firstName: firstName_(cell(columns.name)),
    note: cell(columns.note),
    status: cell(columns.status),
    rawPhone: rawPhone,
    phone: phone,
    phoneValid: phone.length >= 9,
    sentAt: cell(columns.sent),
    progress: getProgress_(sheet, columns),
  };
}

/**
 * Jumps the selection to the next contact that has no timestamp yet, starting
 * below the current row and wrapping around at the end.
 */
function goToNextUncontacted() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const columns = findColumns_(sheet);
  if (!columns.phone) {
    return { ok: false, error: 'Nenašla jsem sloupec s telefonem. Otevřete WhatsApp → Nastavit sloupce.' };
  }

  const lastRow = sheet.getLastRow();
  const count = lastRow - CONFIG.headerRow;
  if (count < 1) return { ok: false, error: 'V tabulce nejsou žádné kontakty.' };

  const linkColumn = columns.link || CONFIG.linkColumn;
  const phones = sheet.getRange(CONFIG.headerRow + 1, columns.phone, count, 1).getDisplayValues();
  const states = sheet.getRange(CONFIG.headerRow + 1, linkColumn, count, 1).getBackgrounds();

  const active = SpreadsheetApp.getActiveRange();
  const start = active ? Math.max(active.getRow() - CONFIG.headerRow, 0) : 0;

  for (let step = 0; step < count; step++) {
    const index = (start + step) % count;
    if (normalizePhone_(phones[index][0]).length < 9) continue;
    if (String(states[index][0]).toLowerCase() === SENT_COLOR.toLowerCase()) continue;
    sheet.setActiveRange(sheet.getRange(CONFIG.headerRow + 1 + index, 1));
    return getSelection();
  }

  return { ok: false, error: 'Hotovo – všem kontaktům s číslem už jste psala.' };
}

/** How many contacts with a usable number already have a timestamp. */
function getProgress_(sheet, columns) {
  const lastRow = sheet.getLastRow();
  const count = lastRow - CONFIG.headerRow;
  if (count < 1 || !columns.phone) return { total: 0, done: 0 };

  const linkColumn = columns.link || CONFIG.linkColumn;
  const phones = sheet.getRange(CONFIG.headerRow + 1, columns.phone, count, 1).getDisplayValues();
  const states = sheet.getRange(CONFIG.headerRow + 1, linkColumn, count, 1).getBackgrounds();

  let total = 0;
  let done = 0;
  for (let i = 0; i < count; i++) {
    if (normalizePhone_(phones[i][0]).length < 9) continue;
    total++;
    if (String(states[i][0]).toLowerCase() === SENT_COLOR.toLowerCase()) done++;
  }
  return { total: total, done: done };
}

/**
 * Builds the click-to-chat link.
 * "web" goes straight into WhatsApp Web; "app" uses wa.me, which hands over to
 * the desktop or mobile app (with one extra confirmation click).
 * https://faq.whatsapp.com/5913398998672934
 */
function buildLink(phone, message, target) {
  const digits = normalizePhone_(phone);
  const text = encodeURIComponent(message);
  if (target === 'macapp') return 'whatsapp://send?phone=' + digits + '&text=' + text;
  // app_absent=0 tells WhatsApp's own page that the desktop app is installed,
  // so it hands over on its own instead of waiting for a "Continue to chat"
  // click. The page still loads for a moment - a spreadsheet cell cannot skip
  // the browser, it only accepts http/https links.
  if (target === 'app') {
    return 'https://api.whatsapp.com/send/?phone=' + digits + '&text=' + text +
      '&type=phone_number&app_absent=0';
  }
  return 'https://web.whatsapp.com/send?phone=' + digits + '&text=' + text;
}

/** Turns the row's button green, which is what "already messaged" means now. */
function markSent(row) {
  const sheet = SpreadsheetApp.getActiveSheet();
  const columns = findColumns_(sheet);
  const column = columns.link || CONFIG.linkColumn;
  sheet.getRange(row, column).setBackground(SENT_COLOR);
  return 'ano';
}

/** Fills {jmeno}, {poznamka} and {datum} in a template body. */
function renderTemplate(body, contact) {
  const today = Utilities.formatDate(
    new Date(),
    SpreadsheetApp.getActive().getSpreadsheetTimeZone(),
    'd.M.yyyy'
  );
  const first = contact.firstName || contact.name || '';
  return String(body)
    .replace(/\{jmeno1\}/g, first)
    .replace(/\{jmeno\}/g, vocative_(first))
    .replace(/\{poznamka\}/g, contact.note || '')
    .replace(/\{datum\}/g, today);
}

// --- link column (I) --------------------------------------------------------

/**
 * Fills a whole column with a clickable "Napsat" link for every contact, so a
 * row can be messaged without opening the panel at all. Columns A-H (or
 * whatever comes before CONFIG.linkColumn) are never touched.
 */
function setupLinkColumn() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  const columns = findColumns_(sheet);

  if (!columns.phone) {
    ui.alert('Nenašla jsem sloupec s telefonem. Otevřete nejdřív WhatsApp → Nastavit sloupce.');
    return;
  }

  const column = columns.link || CONFIG.linkColumn;
  if (sheet.getMaxColumns() < column) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), column - sheet.getMaxColumns());
  }

  // Never overwrite something that is already in that column.
  if (!columns.link) {
    const existing = sheet.getRange(CONFIG.headerRow, column).getDisplayValue().trim();
    if (existing) {
      ui.alert(
        'Sloupec ' + columnLetter_(column) + ' už obsahuje "' + existing + '".\n\n' +
          'Uvolněte ho, nebo v Code.gs změňte CONFIG.linkColumn na jiný sloupec.'
      );
      return;
    }

    const lastRow = sheet.getLastRow();
    if (lastRow > CONFIG.headerRow) {
      const below = sheet
        .getRange(CONFIG.headerRow + 1, column, lastRow - CONFIG.headerRow, 1)
        .getDisplayValues()
        .filter(function (value) { return String(value[0]).trim(); }).length;
      if (below) {
        ui.alert(
          'Ve sloupci ' + columnLetter_(column) + ' je ' + below + ' vyplněných buněk. ' +
            'Skript by je přepsal, tak radši nic nedělám.\n\n' +
            'Uvolněte sloupec, nebo změňte CONFIG.linkColumn na jiný.'
        );
        return;
      }
    }

    sheet.getRange(CONFIG.headerRow, column).setValue(CONFIG.linkColumnHeader).setFontWeight('bold');
  }

  const written = refreshLinkColumn_(sheet);

  ui.alert(
    'Hotovo',
    'Ve sloupci ' + columnLetter_(column) + ' je u ' + written + ' kontaktů "' +
      CONFIG.linkLabel + '".\n\n' +
      'Kliknutím se otevře panel; odkaz na buňce vede do WhatsAppu i bez něj.',
    ui.ButtonSet.OK
  );
}

/** Rewrites the link for every data row. Returns how many were written. */
function refreshLinkColumn_(sheet) {
  const columns = findColumns_(sheet);
  const lastRow = sheet.getLastRow();
  let written = 0;
  for (let row = CONFIG.headerRow + 1; row <= lastRow; row++) {
    if (writeLinkForRow_(sheet, row, columns)) written++;
  }
  sheet.setColumnWidth(columns.link || CONFIG.linkColumn, LINK_COLUMN_WIDTH);
  return written;
}

/**
 * Writes one row's link. Returns true when a link was written, false when the
 * row has no usable phone number (the cell is then left empty).
 */
function writeLinkForRow_(sheet, row, columns) {
  const column = columns.link || CONFIG.linkColumn;
  const cell = sheet.getRange(row, column);
  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const read = function (index) {
    return index ? String(values[index - 1] || '').trim() : '';
  };

  const phone = normalizePhone_(read(columns.phone));
  if (phone.length < 9) {
    if (ownsCell_(cell)) cell.clearContent().clearDataValidations().setBackground(null);
    return false;
  }

  // A checkbox rather than a label: ticking it is an *edit*, and an installable
  // edit trigger runs with full authorisation, so it may open the panel -
  // selecting a cell may not. The background still carries the state.
  const done = isDone_(cell);
  cell.insertCheckboxes();
  cell.uncheck();
  cell.setHorizontalAlignment('center').setBackground(done ? SENT_COLOR : PENDING_COLOR);
  return true;
}

/** Installs the edit trigger that opens the panel. Run once from the editor. */
function installPanelTrigger() {
  const spreadsheet = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'onCheckboxEdit') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('onCheckboxEdit').forSpreadsheet(spreadsheet).onEdit().create();
  SpreadsheetApp.getUi().alert(
    'Hotovo. Kliknutí do políčka ve sloupci ' + columnLetter_(CONFIG.linkColumn) +
      ' teď otevře panel s tím kontaktem.'
  );
}

/** Ticking the checkbox opens the panel for that row and clears the tick. */
function onCheckboxEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const row = e.range.getRow();
  if (row <= CONFIG.headerRow) return;
  if (e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return;

  const column = findColumns_(sheet).link || CONFIG.linkColumn;
  if (e.range.getColumn() !== column) return;
  if (e.range.getValue() !== true) return;

  e.range.uncheck();
  showSidebar();
}

/** Green cell = this contact has already been messaged. */
function isDone_(cell) {
  return String(cell.getBackground() || '').toLowerCase() === SENT_COLOR.toLowerCase();
}

/** True when the cell holds a WhatsApp link this script wrote. */
function ownsCell_(cell) {
  const background = String(cell.getBackground() || '').toLowerCase();
  if (background === SENT_COLOR.toLowerCase() || background === PENDING_COLOR.toLowerCase()) {
    return true;
  }
  return String(cell.getDisplayValue() || '').trim() === CONFIG.linkLabel;
}

/** Whether links point at WhatsApp Web or hand over to the app. */
function linkTarget_() {
  const stored = PropertiesService.getUserProperties().getProperty('linkTarget');
  return ['web', 'app', 'macapp'].indexOf(stored) !== -1 ? stored : 'macapp';
}

/**
 * Clicking "Napsat" opens the panel for that row. Sheets has no click event,
 * but selecting the cell is close enough - and it is the only way to get from
 * the sheet into WhatsApp without a browser page on the way.
 */
function onSelectionChange(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const row = e.range.getRow();
  if (row <= CONFIG.headerRow) return;
  if (e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return;

  const columns = findColumns_(sheet);
  const column = columns.link || CONFIG.linkColumn;
  if (e.range.getColumn() !== column) return;
  if (String(e.range.getDisplayValue() || '').trim() !== CONFIG.linkLabel) return;

  showSidebar();
}

/**
 * Keeps the links current: editing a name, phone or note rewrites that row's
 * link. Programmatic edits do not fire this, so it cannot loop.
 */
function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const row = e.range.getRow();
  if (row <= CONFIG.headerRow || e.range.getNumRows() !== 1) return;

  const columns = findColumns_(sheet);
  if (!columns.link || !columns.phone) return;

  const edited = e.range.getColumn();
  if (edited !== columns.phone && edited !== columns.name && edited !== columns.note) return;

  writeLinkForRow_(sheet, row, columns);
}

// --- Czech vocative ---------------------------------------------------------

// Names the rules below get wrong, plus women's names ending in a consonant,
// which stay unchanged. Add your own as you meet them: key in lower case,
// value exactly as it should be written.
const VOCATIVE_EXCEPTIONS = {
  petr: 'Petře',
  pavel: 'Pavle',
  karel: 'Karle',
  daniel: 'Danieli',
  gabriel: 'Gabrieli',
  marcel: 'Marceli',
  dagmar: 'Dagmar',
  ester: 'Ester',
  miriam: 'Miriam',
  karin: 'Karin',
  ingrid: 'Ingrid',
  nikol: 'Nikol',
  sarah: 'Sarah',
  ruth: 'Ruth',
};

/**
 * Fifth case of a first name: Martin -> Martine, Jana -> Jano, Lukáš -> Lukáši.
 * A heuristic, not a dictionary - a name it gets wrong belongs in
 * VOCATIVE_EXCEPTIONS above.
 */
function vocative_(name) {
  const word = String(name || '').trim();
  if (word.length < 2) return word;

  const key = word.toLowerCase();
  if (VOCATIVE_EXCEPTIONS[key]) return VOCATIVE_EXCEPTIONS[key];

  const stem = function (cut) {
    return word.slice(0, word.length - cut);
  };

  // Jana -> Jano, Honza -> Honzo
  if (/[aá]$/.test(key)) return stem(1) + 'o';
  // Marie, Lucie, Jiří, Ivo - already in the right shape
  if (/[eéiíyýoóuúů]$/.test(key)) return word;
  // Marek -> Marku, Vašek -> Vašku, Zdeněk -> Zdeňku
  if (/[eě]k$/.test(key)) {
    let base = stem(2);
    if (key.charAt(key.length - 2) === 'ě' && /n$/.test(base)) base = base.slice(0, -1) + 'ň';
    return base + 'ku';
  }
  // Pavel -> Pavle
  if (/el$/.test(key)) return stem(2) + 'le';
  // Vojtěch -> Vojtěchu, Dominik -> Dominiku
  if (/[kgh]$/.test(key)) return word + 'u';
  // Tomáš -> Tomáši, Ondřej -> Ondřeji, Denis -> Denisi
  if (/[cjsřščťžďň]$/.test(key)) return word + 'i';
  // Martin -> Martine, David -> Davide
  return word + 'e';
}

/**
 * Only for checking in the editor: pick this function in the toolbar, press
 * Run, and the execution log shows what the greeting will look like.
 */
function testSklonovani() {
  ['Martin', 'Jana', 'Lukáš', 'Petr', 'Marek', 'Kateřina'].forEach(function (name) {
    Logger.log(name + ' -> ' + vocative_(name));
  });
  Logger.log(
    'První řádek zprávy: ' +
      renderTemplate(TEMPLATES[CONFIG.linkTemplateIndex].body, { firstName: 'Martin' }).split('\n')[0]
  );
}

// --- helpers ---------------------------------------------------------------

/**
 * Maps the logical fields onto column indexes (1-based, 0 = not found).
 * A mapping saved from the dialog wins; the rest is guessed from the headers.
 */
function findColumns_(sheet) {
  const width = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(CONFIG.headerRow, 1, 1, width).getDisplayValues()[0];
  const found = { name: 0, phone: 0, note: 0, status: 0, sent: 0, send: 0, link: 0 };
  const sentKey = simplify_(CONFIG.sentColumnHeader);
  const sendKey = simplify_(CONFIG.sendColumnHeader);
  const linkKey = simplify_(CONFIG.linkColumnHeader);

  const saved = readSavedMap_(sheet);
  Object.keys(found).forEach(function (field) {
    const value = Number(saved[field]);
    if (value > 0 && value <= width) found[field] = value;
  });

  headers.forEach(function (header, index) {
    const key = simplify_(header);
    if (!key) return;
    if (key === sentKey) {
      found.sent = found.sent || index + 1;
      return;
    }
    if (key === sendKey) {
      found.send = found.send || index + 1;
      return;
    }
    if (key === linkKey) {
      found.link = found.link || index + 1;
      return;
    }
    Object.keys(COLUMN_ALIASES).forEach(function (field) {
      if (found[field]) return;
      if (COLUMN_ALIASES[field].indexOf(key) !== -1) {
        found[field] = index + 1;
      }
    });
  });

  return found;
}

function mapKey_(sheet) {
  return 'columnMap:' + sheet.getSheetId();
}

function readSavedMap_(sheet) {
  const raw = PropertiesService.getDocumentProperties().getProperty(mapKey_(sheet));
  if (!raw) return {};
  try {
    return JSON.parse(raw) || {};
  } catch (error) {
    return {};
  }
}

/** Appends the timestamp column and returns its index. */
function createSentColumn_(sheet) {
  const column = sheet.getLastColumn() + 1;
  sheet.getRange(CONFIG.headerRow, column).setValue(CONFIG.sentColumnHeader).setFontWeight('bold');
  return column;
}

/** Lower-cases a header and strips diacritics, punctuation and spacing. */
function simplify_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Turns "+420 777 123 456", "00420777123456" or "777 123 456" into
 * "420777123456".
 */
function normalizePhone_(raw) {
  let value = String(raw || '').replace(/[^\d+]/g, '');
  if (!value) return '';

  if (value.charAt(0) === '+') {
    value = value.slice(1);
  } else if (value.slice(0, 2) === '00') {
    value = value.slice(2);
  } else if (
    value.length <= 10 &&
    value.slice(0, CONFIG.defaultCountryCode.length) !== CONFIG.defaultCountryCode
  ) {
    // A local number without a prefix - assume the default country.
    value = CONFIG.defaultCountryCode + value.replace(/^0+/, '');
  }

  return value.replace(/\D/g, '');
}

/** First word of the full name, used for the greeting. */
function firstName_(fullName) {
  return String(fullName || '').trim().split(/\s+/)[0] || '';
}

/** 1 -> A, 27 -> AA */
function columnLetter_(column) {
  let letter = '';
  let n = column;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    n = Math.floor((n - remainder) / 26);
  }
  return letter;
}
