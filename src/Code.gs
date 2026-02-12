/**
 * DD-EventGenerator — Google Apps Script Backend
 *
 * DÉPLOIEMENT :
 * 1. npm install -g @google/clasp
 * 2. clasp login
 * 3. clasp create --type webapp --title "DD-EventGenerator"
 *    (copier le scriptId dans .clasp.json)
 * 4. cp ../appsscript.json .   (clasp a besoin du manifeste dans rootDir)
 * 5. clasp push
 * 6. clasp deploy
 * 7. Ouvrir l'URL déployée, autoriser les scopes Google lors du premier accès.
 */

// ─── Configuration ──────────────────────────────────────────────
var CONFIG = {
  SHEET_NAME: 'Events',
  FOLDER_NAME: 'EventGenerator-Images',
  COLUMNS: ['id', 'title', 'subtitle', 'eventDate', 'progress', 'optionalText', 'backgroundImageId', 'format', 'showTimer', 'showProgress', 'showGradient', 'gradientOpacity', 'bgBrightness', 'progressLabel', 'preCountdownText', 'postCountdownText', 'showDays', 'showHours', 'showMinutes', 'showSeconds', 'titleStyle', 'subtitleStyle', 'preCountdownStyle', 'postCountdownStyle', 'progressLabelStyle', 'progressValueStyle', 'optionalTextStyle', 'contentOffsetY', 'optionalTextOffsetY', 'createdAt', 'updatedAt', 'name', 'bgPositionX', 'bgPositionY', 'folderId', 'autoProgress', 'autoProgressMode', 'autoProgressStart', 'autoProgressMilestones', 'autoProgressStartPct', 'fxConfetti', 'fxVignette', 'fxGlow', 'fxRays', 'fxShimmer', 'eventTime', 'fxConfettiSpeed', 'fxConfettiOpacity', 'fxVignetteSpeed', 'fxVignetteOpacity', 'fxGlowSpeed', 'fxGlowOpacity', 'fxRaysSpeed', 'fxRaysOpacity', 'fxShimmerSpeed', 'fxShimmerOpacity'],
  FOLDERS_SHEET: 'Folders',
  FOLDER_COLUMNS: ['id', 'name', 'sortOrder']
};

// ─── Routing ────────────────────────────────────────────────────

function doGet(e) {
  var action = e && e.parameter && e.parameter.action;

  // ── API JSON publique pour la page hébergée sur GitHub Pages ──
  if (action === 'api') {
    var eventId = e.parameter.id;
    var event = eventId ? getEvent(eventId) : null;
    var payload = event || { error: 'Event not found' };
    // Ajouter l'URL de l'image si présente (lh3 format pour éviter les blocages CORS)
    if (event && event.backgroundImageId) {
      payload.backgroundImageUrl = 'https://lh3.googleusercontent.com/d/' + event.backgroundImageId;
    }
    return ContentService.createTextOutput(JSON.stringify(payload))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ── Admin Generator ──
  var template = HtmlService.createTemplateFromFile('Generator');
  template.webAppUrl = ScriptApp.getService().getUrl();
  return template.evaluate()
    .setTitle('DD-EventGenerator — Admin')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ─── Sheet helpers ──────────────────────────────────────────────

function getOrCreateSheet_() {
  var ss = null;

  // Chercher le spreadsheet existant par nom via DriveApp
  var files = DriveApp.getFilesByName('DD-EventGenerator Data');
  if (files.hasNext()) {
    ss = SpreadsheetApp.openById(files.next().getId());
  }

  // Créer s'il n'existe pas
  if (!ss) {
    ss = SpreadsheetApp.create('DD-EventGenerator Data');
  }

  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    sheet.appendRow(CONFIG.COLUMNS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function rowToObject_(row) {
  var obj = {};
  CONFIG.COLUMNS.forEach(function(col, i) {
    var val = row[i];
    // Convertir les Date en string (google.script.run ne sérialise pas les Date)
    if (val instanceof Date) {
      val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    // Convertir les booléens en string
    if (val === true) val = 'true';
    if (val === false) val = 'false';
    obj[col] = (val !== undefined && val !== null && val !== '') ? val : '';
  });
  return obj;
}

// ─── CRUD ───────────────────────────────────────────────────────

function getEvents() {
  var sheet = getOrCreateSheet_();
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var events = [];
  for (var i = 1; i < data.length; i++) {
    events.push(rowToObject_(data[i]));
  }
  return events;
}

function getAllData() {
  return {
    events: getEvents(),
    folders: getFolders()
  };
}

function getEvent(id) {
  var sheet = getOrCreateSheet_();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      return rowToObject_(data[i]);
    }
  }
  return null;
}

function createOrUpdateEvent(data) {
  var sheet = getOrCreateSheet_();
  var now = new Date().toISOString();

  if (data.id) {
    // Update
    var allData = sheet.getDataRange().getValues();
    for (var i = 1; i < allData.length; i++) {
      if (allData[i][0] === data.id) {
        var row = buildRow_(data, allData[i][29], now);
        sheet.getRange(i + 1, 1, 1, CONFIG.COLUMNS.length).setValues([row]);
        return data.id;
      }
    }
  }

  // Create
  var id = generateId_();
  data.id = id;
  var row = buildRow_(data, now, now);
  sheet.appendRow(row);
  return id;
}

function deleteEvent(id) {
  var sheet = getOrCreateSheet_();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      // Delete background image from Drive if exists
      if (data[i][6]) {
        try {
          DriveApp.getFileById(data[i][6]).setTrashed(true);
        } catch (e) { /* ignore */ }
      }
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

function buildRow_(data, createdAt, updatedAt) {
  return [
    data.id,
    data.title || '',
    data.subtitle || '',
    data.eventDate || '',
    data.progress || 0,
    data.optionalText || '',
    data.backgroundImageId || '',
    data.format || 'landscape',
    data.showTimer !== false ? 'true' : 'false',
    data.showProgress !== false ? 'true' : 'false',
    data.showGradient !== false ? 'true' : 'false',
    data.gradientOpacity !== undefined && data.gradientOpacity !== '' ? data.gradientOpacity : 50,
    data.bgBrightness !== undefined && data.bgBrightness !== '' ? data.bgBrightness : 40,
    data.progressLabel || '',
    data.preCountdownText || '',
    data.postCountdownText || '',
    data.showDays !== false ? 'true' : 'false',
    data.showHours !== false ? 'true' : 'false',
    data.showMinutes !== false ? 'true' : 'false',
    data.showSeconds !== false ? 'true' : 'false',
    data.titleStyle || '',
    data.subtitleStyle || '',
    data.preCountdownStyle || '',
    data.postCountdownStyle || '',
    data.progressLabelStyle || '',
    data.progressValueStyle || '',
    data.optionalTextStyle || '',
    data.contentOffsetY !== undefined && data.contentOffsetY !== '' ? data.contentOffsetY : 0,
    data.optionalTextOffsetY !== undefined && data.optionalTextOffsetY !== '' ? data.optionalTextOffsetY : 0,
    createdAt,
    updatedAt,
    data.name || '',
    data.bgPositionX !== undefined && data.bgPositionX !== '' ? data.bgPositionX : 50,
    data.bgPositionY !== undefined && data.bgPositionY !== '' ? data.bgPositionY : 50,
    data.folderId || '',
    data.autoProgress ? 'true' : 'false',
    data.autoProgressMode || 'linear',
    data.autoProgressStart || '',
    data.autoProgressMilestones || '',
    data.autoProgressStartPct !== undefined && data.autoProgressStartPct !== '' ? data.autoProgressStartPct : 0,
    data.fxConfetti !== undefined ? data.fxConfetti : true,
    data.fxVignette !== undefined ? data.fxVignette : true,
    data.fxGlow !== undefined ? data.fxGlow : true,
    data.fxRays !== undefined ? data.fxRays : true,
    data.fxShimmer !== undefined ? data.fxShimmer : true,
    data.eventTime || '00:00',
    data.fxConfettiSpeed !== undefined && data.fxConfettiSpeed !== '' ? data.fxConfettiSpeed : 50,
    data.fxConfettiOpacity !== undefined && data.fxConfettiOpacity !== '' ? data.fxConfettiOpacity : 100,
    data.fxVignetteSpeed !== undefined && data.fxVignetteSpeed !== '' ? data.fxVignetteSpeed : 50,
    data.fxVignetteOpacity !== undefined && data.fxVignetteOpacity !== '' ? data.fxVignetteOpacity : 100,
    data.fxGlowSpeed !== undefined && data.fxGlowSpeed !== '' ? data.fxGlowSpeed : 50,
    data.fxGlowOpacity !== undefined && data.fxGlowOpacity !== '' ? data.fxGlowOpacity : 100,
    data.fxRaysSpeed !== undefined && data.fxRaysSpeed !== '' ? data.fxRaysSpeed : 50,
    data.fxRaysOpacity !== undefined && data.fxRaysOpacity !== '' ? data.fxRaysOpacity : 100,
    data.fxShimmerSpeed !== undefined && data.fxShimmerSpeed !== '' ? data.fxShimmerSpeed : 50,
    data.fxShimmerOpacity !== undefined && data.fxShimmerOpacity !== '' ? data.fxShimmerOpacity : 100
  ];
}

function generateId_() {
  var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  var id = '';
  for (var i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// ─── Image upload ───────────────────────────────────────────────

function uploadImage(base64Data, filename, oldImageId) {
  // Delete old image if replacing
  if (oldImageId) {
    try {
      DriveApp.getFileById(oldImageId).setTrashed(true);
    } catch (e) { /* ignore */ }
  }

  var folder = getOrCreateImageFolder_();
  var decoded = Utilities.base64Decode(base64Data);
  var blob = Utilities.newBlob(decoded, 'image/jpeg', filename || 'event-bg.jpg');
  var file = folder.createFile(blob);

  // Rendre le fichier public
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return file.getId();
}

function getOrCreateImageFolder_() {
  var folders = DriveApp.getFoldersByName(CONFIG.FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  var folder = DriveApp.createFolder(CONFIG.FOLDER_NAME);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return folder;
}

// ─── Folders CRUD ────────────────────────────────────────────────

function getOrCreateFoldersSheet_() {
  var ss = null;
  var files = DriveApp.getFilesByName('DD-EventGenerator Data');
  if (files.hasNext()) {
    ss = SpreadsheetApp.openById(files.next().getId());
  }
  if (!ss) {
    ss = SpreadsheetApp.create('DD-EventGenerator Data');
  }
  var sheet = ss.getSheetByName(CONFIG.FOLDERS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.FOLDERS_SHEET);
    sheet.appendRow(CONFIG.FOLDER_COLUMNS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getFolders() {
  var sheet = getOrCreateFoldersSheet_();
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var folders = [];
  for (var i = 1; i < data.length; i++) {
    folders.push({ id: data[i][0], name: data[i][1], sortOrder: data[i][2] || 0 });
  }
  folders.sort(function(a, b) { return a.sortOrder - b.sortOrder; });
  return folders;
}

function createFolder(name) {
  var sheet = getOrCreateFoldersSheet_();
  var id = generateId_();
  var data = sheet.getDataRange().getValues();
  var maxOrder = 0;
  for (var i = 1; i < data.length; i++) {
    if (data[i][2] > maxOrder) maxOrder = data[i][2];
  }
  sheet.appendRow([id, name, maxOrder + 1]);
  return { id: id, name: name, sortOrder: maxOrder + 1 };
}

function renameFolder(id, newName) {
  var sheet = getOrCreateFoldersSheet_();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.getRange(i + 1, 2).setValue(newName);
      return true;
    }
  }
  return false;
}

function deleteFolder(id) {
  // Remove folder — events keep their folderId (they'll show in "Sans dossier")
  var sheet = getOrCreateFoldersSheet_();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      // Clear folderId from events that were in this folder
      var evSheet = getOrCreateSheet_();
      var evData = evSheet.getDataRange().getValues();
      var folderColIdx = CONFIG.COLUMNS.indexOf('folderId');
      for (var j = 1; j < evData.length; j++) {
        if (evData[j][folderColIdx] === id) {
          evSheet.getRange(j + 1, folderColIdx + 1).setValue('');
        }
      }
      return true;
    }
  }
  return false;
}

function reorderFolders(orderedIds) {
  var sheet = getOrCreateFoldersSheet_();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var idx = orderedIds.indexOf(data[i][0]);
    if (idx !== -1) {
      sheet.getRange(i + 1, 3).setValue(idx);
    }
  }
  return true;
}

function moveEventToFolder(eventId, folderId) {
  var sheet = getOrCreateSheet_();
  var data = sheet.getDataRange().getValues();
  var folderColIdx = CONFIG.COLUMNS.indexOf('folderId');
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === eventId) {
      sheet.getRange(i + 1, folderColIdx + 1).setValue(folderId || '');
      return true;
    }
  }
  return false;
}

function getImageUrl(fileId) {
  if (!fileId) return '';
  return 'https://drive.google.com/uc?export=view&id=' + fileId;
}
