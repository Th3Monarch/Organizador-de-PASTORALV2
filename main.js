/**
 * main.js - Proceso Principal de Organizador Pastoral
 * Desarrollado para pastoral educativa católica (espiritualidad dominicana).
 * Incluye soporte nativo para Google Login OAuth 2.0 y Google Gemini Oficial.
 * Autor: Manuel Guia
 */

const { app, BrowserWindow, ipcMain, dialog, shell, Notification, Menu, MenuItem } = require('electron');
const path = require('path');
const fs = require('fs');
const cloudManager = require('./cloud-manager');
const saintManager = require('./saint-manager');
const readingManager = require('./reading-manager');
const songData = require('./song-data');
const liturgicalTemplates = require('./liturgical-templates');

// Estado de la ventana y controlador de IA
let mainWindow = null;
let currentChatAbortController = null;

// Rutas de almacenamiento
const userDataPath = app.getPath('userData');
const dataFilePath = path.join(userDataPath, 'pastoral-data.json');
const backupsDir = path.join(userDataPath, 'backups');

// Estructura por defecto según la especificación
const DEFAULT_DATA = {
  notes: [],
  events: [],
  tasks: [],
  groups: [],
  persons: [],
  chat: [],
  songs: songData.DEFAULT_SONGS,
  liturgicalScripts: [],
  saintOfTheDay: null,
  dailyReadings: null,
  settings: {
    pastorName: 'Agente Pastoral',
    schoolName: 'Colegio Católico',
    theme: 'light',
    colorPalette: 'amber', // 'amber' | 'emerald' | 'sky' | 'purple' | 'rose' | 'orange' | 'cyan' | 'custom'
    customColor: '#d97706',
    backgroundStyle: 'tinted', // 'tinted' | 'neutral'
    showWelcome: true,
    notifications: true,
    cloud: {
      provider: 'gemini', // 'gemini' | 'openrouter'
      apiKey: '',
      model: 'gemini-flash-latest'
    }
  }
};

/**
 * Asegura la existencia de directorios necesarios.
 */
function ensureDirectories() {
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
}

/**
 * Migración por mezcla superficial (shallow merge sobre valores por defecto).
 */
function shallowMerge(defaults, target) {
  if (!target || typeof target !== 'object') return { ...defaults };
  const merged = { ...defaults, ...target };
  if (target.settings && typeof target.settings === 'object') {
    merged.settings = { ...defaults.settings, ...target.settings };
    if (target.settings.cloud && typeof target.settings.cloud === 'object') {
      merged.settings.cloud = { ...defaults.settings.cloud, ...target.settings.cloud };
    }
  }
  // Migración y normalización inteligente de configuración IA
  if (merged.settings && merged.settings.cloud) {
    const c = merged.settings.cloud;
    // Si tiene clave de Gemini (AQ. o AIza) pero el proveedor no estaba en gemini, ajustarlo
    if (c.apiKey && (c.apiKey.startsWith('AQ.') || c.apiKey.startsWith('AIza'))) {
      c.provider = 'gemini';
    }
    // Normalizar modelos retirados de Gemini
    const deprecated = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
    if (c.provider === 'gemini' && (!c.model || deprecated.includes(c.model) || c.model.includes('llama') || c.model.includes('nemotron'))) {
      c.model = 'gemini-flash-latest';
    }
  }
  ['notes', 'events', 'tasks', 'groups', 'persons', 'chat'].forEach(key => {
    if (!Array.isArray(merged[key])) merged[key] = [];
  });
  if (!Array.isArray(merged.songs) || merged.songs.length === 0) {
    merged.songs = [...songData.DEFAULT_SONGS];
  } else {
    // Si las canciones por defecto existentes tienen el formato antiguo sin secciones, actualizarlas
    const defaultMap = new Map(songData.DEFAULT_SONGS.map(s => [s.id, s]));
    merged.songs = merged.songs.map(s => {
      if (defaultMap.has(s.id)) {
        const def = defaultMap.get(s.id);
        const hasSections = (s.lyricsWithChords || '').includes('[CORO]') || (s.lyricsWithChords || '').includes('[ESTROFA');
        const hasEmbedded = /([a-záéíóúñA-ZÁÉÍÓÚÑ]+)\[([A-G][b#]?[^\]]*)\]([a-záéíóúñA-ZÁÉÍÓÚÑ]+)/.test(s.lyricsWithChords || '');
        if (!hasSections || hasEmbedded) {
          return { ...def, ...s, lyricsWithChords: def.lyricsWithChords, key: s.key || def.key, tempo: s.tempo || def.tempo, timeSignature: def.timeSignature, season: def.season };
        }
      }
      return s;
    });
  }
  if (!Array.isArray(merged.liturgicalScripts)) {
    merged.liturgicalScripts = [];
  } else {
    // Las plantillas son un catálogo independiente y NO son misas registradas: filtrarlas si quedaron de versiones previas
    merged.liturgicalScripts = merged.liturgicalScripts.filter(s => s && s.id && !s.id.startsWith('template-'));
  }
  return merged;
}

/**
 * Carga los datos de pastoral-data.json. Si no existe, lo crea con los valores por defecto.
 */
function loadData() {
  ensureDirectories();
  try {
    if (fs.existsSync(dataFilePath)) {
      const raw = fs.readFileSync(dataFilePath, 'utf-8');
      const parsed = JSON.parse(raw);
      return shallowMerge(DEFAULT_DATA, parsed);
    }
  } catch (err) {
    console.error('Error al cargar pastoral-data.json:', err);
  }
  saveDataAtomic(DEFAULT_DATA);
  return { ...DEFAULT_DATA };
}

/**
 * Guarda los datos de forma atómica (escribe a .tmp y renombra).
 */
function saveDataAtomic(data) {
  ensureDirectories();
  const tmpPath = `${dataFilePath}.tmp`;
  const jsonContent = JSON.stringify(data, null, 2);
  try {
    fs.writeFileSync(tmpPath, jsonContent, 'utf-8');
    fs.renameSync(tmpPath, dataFilePath);
    return { success: true };
  } catch (err) {
    console.error('Error en guardado atómico:', err);
    if (fs.existsSync(tmpPath)) {
      try { fs.unlinkSync(tmpPath); } catch (_) {}
    }
    throw err;
  }
}

/**
 * Realiza una copia de seguridad automática diaria y conserva las últimas 30.
 */
function checkDailyBackup() {
  ensureDirectories();
  const todayStr = new Date().toISOString().split('T')[0];
  const todayBackupPath = path.join(backupsDir, `pastoral-${todayStr}.json`);

  if (!fs.existsSync(todayBackupPath) && fs.existsSync(dataFilePath)) {
    try {
      fs.copyFileSync(dataFilePath, todayBackupPath);
      cleanOldBackups();
    } catch (e) {
      console.error('Error creando copia de seguridad automática:', e);
    }
  }
}

/**
 * Conserva únicamente las últimas 30 copias de seguridad en backupsDir.
 */
function cleanOldBackups() {
  try {
    const files = fs.readdirSync(backupsDir)
      .filter(f => f.startsWith('pastoral-') && f.endsWith('.json'))
      .map(f => {
        const full = path.join(backupsDir, f);
        return { name: f, path: full, time: fs.statSync(full).mtime.getTime() };
      })
      .sort((a, b) => b.time - a.time);

    if (files.length > 30) {
      const toDelete = files.slice(30);
      toDelete.forEach(file => {
        try { fs.unlinkSync(file.path); } catch (_) {}
      });
    }
  } catch (e) {
    console.error('Error limpiando backups antiguos:', e);
  }
}

/**
 * Crea la ventana principal de la aplicación.
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 800,
    minHeight: 560,
    title: 'Organizador Pastoral',
    backgroundColor: '#0f172a',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Menú contextual nativo para copiar/cortar/pegar en selecciones y campos editables
  mainWindow.webContents.on('context-menu', (event, params) => {
    const menu = new Menu();
    if (params.selectionText && params.selectionText.trim().length > 0) {
      menu.append(new MenuItem({ role: 'copy', label: 'Copiar' }));
      menu.append(new MenuItem({ role: 'selectAll', label: 'Seleccionar todo' }));
    } else if (params.isEditable) {
      menu.append(new MenuItem({ role: 'undo', label: 'Deshacer' }));
      menu.append(new MenuItem({ role: 'redo', label: 'Rehacer' }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ role: 'cut', label: 'Cortar' }));
      menu.append(new MenuItem({ role: 'copy', label: 'Copiar' }));
      menu.append(new MenuItem({ role: 'paste', label: 'Pegar' }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ role: 'selectAll', label: 'Seleccionar todo' }));
    }
    if (menu.items.length > 0) {
      menu.popup({ window: mainWindow });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (currentChatAbortController) {
      currentChatAbortController.abort();
      currentChatAbortController = null;
    }
  });
}

// Inicialización de la aplicación
app.whenReady().then(() => {
  ensureDirectories();
  checkDailyBackup();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ========================================================
// IPC Handlers: Datos y Persistencia
// ========================================================

ipcMain.handle('pastoral:get-data', async () => {
  return loadData();
});

ipcMain.handle('pastoral:save-data', async (event, newData) => {
  try {
    saveDataAtomic(newData);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('pastoral:open-data-folder', async () => {
  try {
    await shell.openPath(userDataPath);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('pastoral:open-external', async (event, url) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});

// ========================================================
// IPC Handlers: Copias de Seguridad (Backups)
// ========================================================

ipcMain.handle('pastoral:backup-list', async () => {
  ensureDirectories();
  try {
    const files = fs.readdirSync(backupsDir)
      .filter(f => f.startsWith('pastoral-') && f.endsWith('.json'))
      .map(filename => {
        const full = path.join(backupsDir, filename);
        const stat = fs.statSync(full);
        return {
          filename,
          sizeBytes: stat.size,
          createdAt: stat.birthtime || stat.mtime
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return { success: true, backups: files };
  } catch (err) {
    return { success: false, error: err.message, backups: [] };
  }
});

ipcMain.handle('pastoral:backup-create', async () => {
  ensureDirectories();
  try {
    const now = new Date();
    const datePart = now.toISOString().split('T')[0];
    const timePart = `${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}`;
    const filename = `pastoral-${datePart}_${timePart}.json`;
    const targetPath = path.join(backupsDir, filename);

    if (fs.existsSync(dataFilePath)) {
      fs.copyFileSync(dataFilePath, targetPath);
      cleanOldBackups();
      return { success: true, filename };
    } else {
      return { success: false, error: 'No existe archivo de datos para respaldar.' };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('pastoral:backup-restore', async (event, filename) => {
  ensureDirectories();
  const sourcePath = path.join(backupsDir, filename);
  if (!fs.existsSync(sourcePath)) {
    return { success: false, error: 'El archivo de copia de seguridad no existe.' };
  }

  try {
    const preRestoreDate = new Date().toISOString().replace(/[:.]/g, '-');
    const preRestorePath = path.join(backupsDir, `pastoral-pre-restore-${preRestoreDate}.json`);
    if (fs.existsSync(dataFilePath)) {
      fs.copyFileSync(dataFilePath, preRestorePath);
    }

    const content = fs.readFileSync(sourcePath, 'utf-8');
    const parsed = JSON.parse(content);
    saveDataAtomic(shallowMerge(DEFAULT_DATA, parsed));
    cleanOldBackups();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('pastoral:backup-delete', async (event, filename) => {
  ensureDirectories();
  const targetPath = path.join(backupsDir, filename);
  try {
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
      return { success: true };
    }
    return { success: false, error: 'Archivo no encontrado' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('pastoral:backup-export', async () => {
  if (!mainWindow) return { success: false };
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Exportar respaldo de datos de Pastoral',
    defaultPath: `respaldo-pastoral-${new Date().toISOString().split('T')[0]}.json`,
    filters: [{ name: 'Archivos JSON', extensions: ['json'] }]
  });

  if (canceled || !filePath) return { success: false, canceled: true };

  try {
    const currentData = loadData();
    fs.writeFileSync(filePath, JSON.stringify(currentData, null, 2), 'utf-8');
    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('pastoral:backup-import', async () => {
  if (!mainWindow) return { success: false };
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Importar respaldo de datos de Pastoral',
    filters: [{ name: 'Archivos JSON', extensions: ['json'] }],
    properties: ['openFile']
  });

  if (canceled || !filePaths || filePaths.length === 0) return { success: false, canceled: true };

  try {
    const content = fs.readFileSync(filePaths[0], 'utf-8');
    const parsed = JSON.parse(content);
    const merged = shallowMerge(DEFAULT_DATA, parsed);
    saveDataAtomic(merged);
    return { success: true, data: merged };
  } catch (err) {
    return { success: false, error: 'Archivo de respaldo inválido o corrupto: ' + err.message };
  }
});

// ========================================================
// IPC Handlers: Notificaciones Nativas
// ========================================================

ipcMain.handle('pastoral:notify', async (event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({
      title: title || 'Organizador Pastoral',
      body: body || '',
      icon: path.join(__dirname, 'build', 'icon.png')
    }).show();
    return true;
  }
  return false;
});

ipcMain.handle('pastoral:refocus-window', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
  }
  return true;
});

// ========================================================
// IPC Handlers: Imprimir a PDF / Imprimir
// ========================================================

ipcMain.handle('pastoral:print-to-pdf', async (event, defaultName = 'reporte-pastoral.pdf') => {
  if (!mainWindow) return { success: false };
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Guardar como PDF',
    defaultPath: defaultName,
    filters: [{ name: 'Documento PDF', extensions: ['pdf'] }]
  });

  if (canceled || !filePath) return { success: false, canceled: true };

  try {
    const pdfData = await mainWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
    });
    fs.writeFileSync(filePath, pdfData);
    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ========================================================
// IPC Handler: Santoral y Santo del Día (Estilo ePrex - 24 horas)
// ========================================================

ipcMain.handle('pastoral:get-saint-of-the-day', async (event, { force = false, targetDate } = {}) => {
  try {
    const data = loadData();
    const cloudSettings = data.settings?.cloud;
    const currentCache = data.saintOfTheDay;

    const res = await saintManager.getSaintOfTheDay({
      force,
      currentCache,
      cloudSettings,
      cloudManager,
      targetDate: targetDate ? new Date(targetDate) : new Date()
    });

    // Si no provino de la caché local, persistir la actualización en disco de inmediato
    if (!res.cached && res.saint) {
      data.saintOfTheDay = res.saint;
      saveDataAtomic(data);
    }

    return { success: true, saint: res.saint, cached: res.cached };
  } catch (err) {
    console.error('[main] Error en pastoral:get-saint-of-the-day:', err);
    return { success: false, error: err.message };
  }
});

// ========================================================
// IPC Handler: Lecturas y Evangelio del Día (24 horas)
// ========================================================

ipcMain.handle('pastoral:get-daily-readings', async (event, { force = false, targetDate } = {}) => {
  try {
    const data = loadData();
    const currentCache = data.dailyReadings;

    const res = await readingManager.getDailyReadings({
      targetDate: targetDate ? new Date(targetDate) : new Date(),
      force,
      currentCache
    });

    if (!res.cached && res.readings) {
      data.dailyReadings = res.readings;
      saveDataAtomic(data);
    }

    return { success: true, readings: res.readings, cached: res.cached };
  } catch (err) {
    console.error('[main] Error en pastoral:get-daily-readings:', err);
    return { success: false, error: err.message };
  }
});

// ========================================================
// IPC Handler: Generar Oración de la Mañana Escolar
// ========================================================

ipcMain.handle('pastoral:generate-morning-prayer', async (event, { audience = 'juvenil', gospel, targetDate } = {}) => {
  try {
    const data = loadData();
    const cloudSettings = data.settings?.cloud;
    const schoolName = data.settings?.schoolName || 'Colegio Católico';
    const pastorName = data.settings?.pastorName || 'Agente Pastoral';

    const prayer = await readingManager.generateMorningPrayer({
      audience,
      gospel,
      schoolName,
      pastorName,
      cloudSettings,
      cloudManager
    });

    return { success: true, prayer };
  } catch (err) {
    console.error('[main] Error en pastoral:generate-morning-prayer:', err);
    return { success: false, error: err.message };
  }
});

// ========================================================
// IPC Handler: Generar Convocatoria / Circular Escolar con IA
// ========================================================

ipcMain.handle('pastoral:generate-event-announcement', async (event, { eventData = {}, target = 'apoderados' } = {}) => {
  try {
    const data = loadData();
    const cloudSettings = data.settings?.cloud;
    const schoolName = data.settings?.schoolName || 'Colegio Católico';
    const pastorName = data.settings?.pastorName || 'Equipo Pastoral';

    const evTitle = eventData.title || 'Encuentro Pastoral';
    const evDate = eventData.date || '';
    const evTime = eventData.time || '';
    const evLoc = eventData.location || 'Colegio';
    const evCat = eventData.category || 'Celebración';
    const evDesc = eventData.description || '';
    const evAtt = eventData.attendees || '';

    // Si hay IA configurada, intentamos redactar con el modelo
    if (cloudSettings && cloudSettings.apiKey) {
      const audienceGuidelines = {
        apoderados: 'Formato circular escolar formal y cordial para padres y apoderados. Incluye saludo cristiano, propósito del encuentro, fecha, hora, lugar, recomendación de puntualidad y despedida fraterna en Cristo.',
        profesores: 'Formato memorándum o aviso interno para docentes y equipo directivo. Incluye instrucciones de coordinación, acompañamiento a los cursos, horarios y agradecimiento por el compromiso pastoral.',
        whatsapp: 'Formato mensaje ágil y cercano para difusión en grupos de WhatsApp o redes escolares. Usa emojis pastorales con moderación (✨, ⛪, 🙏, 📅, 📍), viñetas claras y llamado a participar.'
      };

      const systemPrompt = `Eres el Encargado de Pastoral del "${schoolName}".
Tu tarea es redactar una comunicación oficial para el siguiente evento pastoral:
- Título: ${evTitle}
- Categoría: ${evCat}
- Fecha: ${evDate}
- Hora: ${evTime || 'A confirmar'}
- Lugar: ${evLoc}
${evAtt ? '- Destinatarios: ' + evAtt : ''}
${evDesc ? '- Detalles adicionales: ' + evDesc : ''}

Destinatarios: ${target.toUpperCase()}
Pauta de redacción: ${audienceGuidelines[target] || audienceGuidelines.apoderados}

Requisitos:
- Tono respetuoso, evangélico, alegre y ordenado.
- Máximo 3 a 4 párrafos bien estructurados.
- Menciona que firma el "${pastorName}" y el "Equipo Pastoral - ${schoolName}".
- Responde DIRECTAMENTE con el texto de la circular, sin introducciones ni comentarios explicativos previos.`;

      try {
        const aiResponse = await cloudManager.generateChatResponse({
          messages: [{ role: 'user', content: systemPrompt }],
          cloudSettings,
          temperature: 0.65
        });

        if (aiResponse && aiResponse.content && aiResponse.content.trim()) {
          return { success: true, text: aiResponse.content.trim(), isAi: true };
        }
      } catch (aiErr) {
        console.warn('[main] Error generando circular con IA, usando plantilla de respaldo:', aiErr.message);
      }
    }

    // Fallback de alta calidad según destinatario
    let fallbackText = '';
    const dateFormatted = evDate ? evDate : 'Próxima fecha';
    const timeFormatted = evTime ? ` a las ${evTime} hrs.` : '';

    if (target === 'apoderados') {
      fallbackText = `CIRCULAR PASTORAL N° ${new Date().getFullYear()}

Estimadas Familias y Comunidad Escolar:

Junto con saludarles cordialmente y deseando que la paz de Cristo reine en sus hogares, nos dirigimos a ustedes para convocarles con alegría a nuestra próxima celebración pastoral:

📌 Actividad: ${evTitle}
📅 Fecha: ${dateFormatted}${timeFormatted}
📍 Lugar: ${evLoc}
👥 Convocados: ${evAtt || 'Comunidad educativa y familias'}

${evDesc ? `${evDesc}\n\n` : ''}Para nuestra comunidad es un momento de gracia compartir la fe y fortalecer los lazos de fraternidad que nos unen. Les invitamos a participar activamente y a acompañar a sus hijos en esta importante instancia formativa y litúrgica.

Agradeciendo de antemano su constante apoyo y compromiso cristiano, les saludamos en el Señor,

${pastorName}
Equipo de Pastoral
${schoolName}`;
    } else if (target === 'profesores') {
      fallbackText = `AVISO INTERNO - PASTORAL ESCOLAR

Estimados Colegas, Docentes y Asistentes de la Educación:

Paz y Bien. Les informamos las coordinaciones para el desarrollo de la siguiente actividad pastoral escolar:

• Actividad: ${evTitle} (${evCat})
• Fecha y Horario: ${dateFormatted}${timeFormatted}
• Lugar: ${evLoc}
• Cursos / Participantes: ${evAtt || 'Toda la comunidad escolar'}

${evDesc ? `Detalles organizativos: ${evDesc}\n\n` : ''}Indicaciones de coordinación:
1. Acompañar a los estudiantes con puntualidad hacia el lugar de encuentro.
2. Fomentar una actitud de silencio, respeto y participación activa durante los momentos de oración.
3. El equipo de pastoral estará coordinando la distribución de guiones y signos con anticipación.

Agradecemos profundamente su valioso testimonio y vocación educadora al servicio de la misión pastoral de nuestro colegio.

Fraternalmente en Santo Domingo y Jesús Maestro,

${pastorName}
Coordinación Pastoral - ${schoolName}`;
    } else {
      // WhatsApp / Redes
      fallbackText = `⛪ *PASTORAL ${schoolName.toUpperCase()}* ✨

Querida comunidad escolar:
Les hacemos una cordial invitación a participar en nuestro próximo encuentro de fe y comunión:

🌟 *${evTitle}*
📅 *Fecha:* ${dateFormatted}${timeFormatted}
📍 *Lugar:* ${evLoc}
👥 *Invita:* ${evAtt || 'Toda la comunidad educativa'}

${evDesc ? `💬 _${evDesc}_\n\n` : ''}¡Los esperamos con los brazos abiertos para vivir juntos este hermoso momento en comunidad! 🙏

_"La verdad nos hará libres"_
Equipo Pastoral - ${schoolName}`;
    }

    return { success: true, text: fallbackText, isAi: false };
  } catch (err) {
    console.error('[main] Error en pastoral:generate-event-announcement:', err);
    return { success: false, error: err.message };
  }
});

// ========================================================
// IPC Handler: Transponer acordes de cantos
// ========================================================

ipcMain.handle('pastoral:transpose-chords', async (event, { text, semitones = 0 }) => {
  try {
    const transposed = songData.transposeText(text, semitones);
    const stripped = songData.stripChords(transposed);
    return { success: true, transposed, stripped };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('pastoral:parse-song-lyrics', async (event, { text, semitones = 0, notation = 'latin' } = {}) => {
  try {
    const parsed = songData.parseChordLyrics(text, semitones, notation);
    const stripped = songData.stripChords(songData.transposeText(text, semitones));
    return { success: true, ...parsed, stripped };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('pastoral:reset-default-songs', async () => {
  try {
    const data = loadData();
    const customSongs = (data.songs || []).filter(s => !s.id.startsWith('song-') || parseInt(s.id.replace('song-', ''), 10) > 25);
    data.songs = [...songData.DEFAULT_SONGS, ...customSongs];
    saveDataAtomic(data);
    return { success: true, songs: data.songs };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ========================================================
// IPC Handler: Catálogo Independiente de Plantillas Litúrgicas
// ========================================================

ipcMain.handle('pastoral:get-liturgical-templates', async () => {
  try {
    return { success: true, templates: liturgicalTemplates.DEFAULT_LITURGICAL_TEMPLATES };
  } catch (err) {
    return { success: false, error: err.message, templates: [] };
  }
});

// ========================================================
// IPC Handlers: IA (Google Gemini Oficial y OpenRouter)
// ========================================================

ipcMain.handle('pastoral:ai-test-connection', async (event, { provider, apiKey, model }) => {
  try {
    const res = await cloudManager.testConnection({ provider, apiKey, model });
    return res;
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('pastoral:ai-get-models', async (event, { provider, apiKey }) => {
  try {
    const models = await cloudManager.getAvailableModels({ provider, apiKey });
    return { success: true, models };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('pastoral:ai-analyze-image', async (event, { provider, apiKey, model, imageDataUrl, instructions }) => {
  try {
    const noteData = await cloudManager.analyzeImageForNote({
      provider,
      apiKey,
      model,
      imageDataUrl,
      instructions
    });
    return { success: true, note: noteData };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('pastoral:ai-chat-start', async (event, { provider, apiKey, model, messages, appContext }) => {
  if (currentChatAbortController) {
    currentChatAbortController.abort();
  }

  currentChatAbortController = new AbortController();
  const signal = currentChatAbortController.signal;

  try {
    const response = await cloudManager.streamChat({
      provider,
      apiKey,
      model,
      messages,
      appContext,
      signal,
      onStatus: (statusText) => {
        if (!mainWindow?.isDestroyed()) {
          mainWindow.webContents.send('pastoral:ai-stream-status', statusText);
        }
      },
      onChunk: (chunk) => {
        if (!mainWindow?.isDestroyed()) {
          mainWindow.webContents.send('pastoral:ai-stream-chunk', chunk);
        }
      },
      onToolExecute: async (toolName, toolArgs) => {
        const currentData = loadData();
        const id = 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

        // Helper para buscar elementos por ID o por coincidencia de texto
        const findEntity = (list, targetId, searchKey, query) => {
          if (!Array.isArray(list)) return { item: null, index: -1 };
          if (targetId) {
            const idx = list.findIndex(x => x.id === targetId);
            if (idx !== -1) return { item: list[idx], index: idx };
          }
          if (query && typeof query === 'string' && query.trim()) {
            const q = query.trim().toLowerCase();
            let idx = list.findIndex(x => (x[searchKey] || '').toLowerCase() === q);
            if (idx !== -1) return { item: list[idx], index: idx };
            idx = list.findIndex(x => (x[searchKey] || '').toLowerCase().includes(q) || q.includes((x[searchKey] || '').toLowerCase()));
            if (idx !== -1) return { item: list[idx], index: idx };
          }
          return { item: null, index: -1 };
        };

        // --- NOTAS ---
        if (toolName === 'create_note') {
          const newNote = {
            id,
            title: toolArgs.title || 'Nueva Nota Pastoral',
            body: toolArgs.body || '',
            tags: Array.isArray(toolArgs.tags) ? toolArgs.tags : ['IA'],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          currentData.notes.unshift(newNote);
          saveDataAtomic(currentData);
          if (!mainWindow?.isDestroyed()) {
            mainWindow.webContents.send('pastoral:data-updated', { type: 'note', action: 'created', item: newNote });
          }
          return `Nota creada exitosamente con ID ${id} y título "${newNote.title}".`;
        }

        if (toolName === 'edit_note') {
          const { item } = findEntity(currentData.notes, toolArgs.id, 'title', toolArgs.search_title || toolArgs.title);
          if (!item) {
            return `No se encontró la nota "${toolArgs.search_title || toolArgs.id}". Por favor verifica el título o el ID.`;
          }
          if (toolArgs.title !== undefined) item.title = toolArgs.title;
          if (toolArgs.body !== undefined) item.body = toolArgs.body;
          if (Array.isArray(toolArgs.tags)) item.tags = toolArgs.tags;
          item.updatedAt = new Date().toISOString();
          saveDataAtomic(currentData);
          if (!mainWindow?.isDestroyed()) {
            mainWindow.webContents.send('pastoral:data-updated', { type: 'note', action: 'updated', item });
          }
          return `Nota "${item.title}" actualizada exitosamente.`;
        }

        if (toolName === 'delete_note') {
          const { item, index } = findEntity(currentData.notes, toolArgs.id, 'title', toolArgs.search_title);
          if (!item) {
            return `No se encontró la nota "${toolArgs.search_title || toolArgs.id}" para eliminar.`;
          }
          const removedTitle = item.title;
          currentData.notes.splice(index, 1);
          saveDataAtomic(currentData);
          if (!mainWindow?.isDestroyed()) {
            mainWindow.webContents.send('pastoral:data-updated', { type: 'note', action: 'deleted', id: item.id });
          }
          return `Nota "${removedTitle}" eliminada correctamente del Organizador.`;
        }

        // --- EVENTOS ---
        if (toolName === 'create_event') {
          if (!toolArgs.date) {
            throw new Error('La fecha del evento es obligatoria.');
          }
          let checklist = [];
          if (Array.isArray(toolArgs.checklist)) {
            checklist = toolArgs.checklist.map((item, idx) => {
              if (typeof item === 'string') {
                return { id: 'chk_' + Date.now() + '_' + idx, text: item, done: false };
              }
              return { id: item.id || ('chk_' + Date.now() + '_' + idx), text: item.text || '', done: Boolean(item.done) };
            }).filter(c => c.text);
          }
          const newEvent = {
            id,
            title: toolArgs.title || 'Nuevo Evento',
            date: toolArgs.date,
            time: toolArgs.time || '',
            location: toolArgs.location || '',
            category: toolArgs.category || 'Otro',
            repeat: toolArgs.repeat || 'none',
            repeatUntil: toolArgs.repeatUntil || '',
            description: toolArgs.description || '',
            attendees: toolArgs.attendees || '',
            scriptId: toolArgs.scriptId || null,
            checklist
          };
          currentData.events.push(newEvent);
          saveDataAtomic(currentData);
          if (!mainWindow?.isDestroyed()) {
            mainWindow.webContents.send('pastoral:data-updated', { type: 'event', action: 'created', item: newEvent });
          }
          return `Evento "${newEvent.title}" registrado con éxito para el ${newEvent.date}${checklist.length ? ` con ${checklist.length} preparativos en su checklist.` : '.'}`;
        }

        if (toolName === 'edit_event') {
          const { item } = findEntity(currentData.events, toolArgs.id, 'title', toolArgs.search_title || toolArgs.title);
          if (!item) {
            return `No se encontró el evento "${toolArgs.search_title || toolArgs.id}". Verifica el título o la fecha.`;
          }
          if (toolArgs.title !== undefined) item.title = toolArgs.title;
          if (toolArgs.date !== undefined) item.date = toolArgs.date;
          if (toolArgs.time !== undefined) item.time = toolArgs.time;
          if (toolArgs.location !== undefined) item.location = toolArgs.location;
          if (toolArgs.category !== undefined) item.category = toolArgs.category;
          if (toolArgs.description !== undefined) item.description = toolArgs.description;
          if (toolArgs.repeat !== undefined) item.repeat = toolArgs.repeat;
          if (toolArgs.repeatUntil !== undefined) item.repeatUntil = toolArgs.repeatUntil;
          if (toolArgs.attendees !== undefined) item.attendees = toolArgs.attendees;
          if (toolArgs.scriptId !== undefined) item.scriptId = toolArgs.scriptId || null;
          if (Array.isArray(toolArgs.checklist)) {
            item.checklist = toolArgs.checklist.map((c, idx) => ({
              id: c.id || ('chk_' + Date.now() + '_' + idx),
              text: typeof c === 'string' ? c : (c.text || ''),
              done: Boolean(c.done)
            })).filter(c => c.text);
          }
          saveDataAtomic(currentData);
          if (!mainWindow?.isDestroyed()) {
            mainWindow.webContents.send('pastoral:data-updated', { type: 'event', action: 'updated', item });
          }
          return `Evento "${item.title}" actualizado correctamente (Fecha: ${item.date}${item.time ? ' ' + item.time : ''}).`;
        }

        if (toolName === 'toggle_event_checklist_item') {
          const { item } = findEntity(currentData.events, toolArgs.eventId, 'title', toolArgs.search_event);
          if (!item) {
            return `No se encontró el evento "${toolArgs.search_event || toolArgs.eventId}".`;
          }
          if (!Array.isArray(item.checklist)) item.checklist = [];
          const query = (toolArgs.task_text || '').toLowerCase().trim();
          let taskItem = item.checklist.find(c => c.text.toLowerCase().includes(query) || query.includes(c.text.toLowerCase()));
          if (!taskItem && query) {
            taskItem = { id: 'chk_' + Date.now(), text: toolArgs.task_text.trim(), done: Boolean(toolArgs.done) };
            item.checklist.push(taskItem);
          } else if (taskItem) {
            taskItem.done = Boolean(toolArgs.done);
          } else {
            return `No se especificó la tarea del checklist para actualizar.`;
          }
          saveDataAtomic(currentData);
          if (!mainWindow?.isDestroyed()) {
            mainWindow.webContents.send('pastoral:data-updated', { type: 'event', action: 'updated', item });
          }
          return `Tarea "${taskItem.text}" del evento "${item.title}" marcada como ${taskItem.done ? 'COMPLETADA' : 'PENDIENTE'}.`;
        }

        if (toolName === 'generate_event_announcement') {
          const { item } = findEntity(currentData.events, toolArgs.eventId, 'title', toolArgs.search_event);
          const target = toolArgs.target || 'apoderados';
          const schoolName = currentData.settings?.schoolName || 'Colegio Católico';
          const pastorName = currentData.settings?.pastorName || 'Equipo Pastoral';
          
          const evTitle = item ? item.title : (toolArgs.search_event || 'Encuentro Pastoral');
          const evDate = item ? item.date : '';
          const evTime = item ? item.time : '';
          const evLoc = item ? item.location : 'Colegio';
          const evCat = item ? item.category : 'Celebración';
          const evDesc = item ? item.description : '';
          const evAtt = item ? item.attendees : '';

          let circularText = '';
          const dateFormatted = evDate ? evDate : 'Próxima fecha';
          const timeFormatted = evTime ? ` a las ${evTime} hrs.` : '';

          if (target === 'apoderados') {
            circularText = `CIRCULAR PASTORAL N° ${new Date().getFullYear()}\n\nEstimadas Familias y Comunidad Escolar:\n\nJunto con saludarles cordialmente y deseando que la paz de Cristo reine en sus hogares, nos dirigimos a ustedes para convocarles con alegría a nuestra próxima celebración pastoral:\n\n📌 Actividad: ${evTitle}\n📅 Fecha: ${dateFormatted}${timeFormatted}\n📍 Lugar: ${evLoc}\n👥 Convocados: ${evAtt || 'Comunidad educativa y familias'}\n\n${evDesc ? `${evDesc}\n\n` : ''}Para nuestra comunidad es un momento de gracia compartir la fe y fortalecer los lazos de fraternidad que nos unen. Les invitamos a participar activamente y a acompañar a sus hijos en esta importante instancia formativa y litúrgica.\n\nAgradeciendo de antemano su constante apoyo y compromiso cristiano, les saludamos en el Señor,\n\n${pastorName}\nEquipo de Pastoral\n${schoolName}`;
          } else if (target === 'profesores') {
            circularText = `AVISO INTERNO - PASTORAL ESCOLAR\n\nEstimados Colegas, Docentes y Asistentes de la Educación:\n\nPaz y Bien. Les informamos las coordinaciones para el desarrollo de la siguiente actividad pastoral escolar:\n\n• Actividad: ${evTitle} (${evCat})\n• Fecha y Horario: ${dateFormatted}${timeFormatted}\n• Lugar: ${evLoc}\n• Cursos / Participantes: ${evAtt || 'Toda la comunidad escolar'}\n\n${evDesc ? `Detalles organizativos: ${evDesc}\n\n` : ''}Indicaciones de coordinación:\n1. Acompañar a los estudiantes con puntualidad hacia el lugar de encuentro.\n2. Fomentar una actitud de silencio, respeto y participación activa durante los momentos de oración.\n3. El equipo de pastoral estará coordinando la distribución de guiones y signos con anticipación.\n\nAgradecemos profundamente su valioso testimonio y vocación educadora al servicio de la misión pastoral de nuestro colegio.\n\nFraternalmente en Santo Domingo y Jesús Maestro,\n\n${pastorName}\nCoordinación Pastoral - ${schoolName}`;
          } else {
            circularText = `⛪ *PASTORAL ${schoolName.toUpperCase()}* ✨\n\nQuerida comunidad escolar:\nLes hacemos una cordial invitación a participar en nuestro próximo encuentro de fe y comunión:\n\n🌟 *${evTitle}*\n📅 *Fecha:* ${dateFormatted}${timeFormatted}\n📍 *Lugar:* ${evLoc}\n👥 *Invita:* ${evAtt || 'Toda la comunidad educativa'}\n\n${evDesc ? `💬 _${evDesc}_\n\n` : ''}¡Los esperamos con los brazos abiertos para vivir juntos este hermoso momento en comunidad! 🙏\n\n_"La verdad nos hará libres"_\nEquipo Pastoral - ${schoolName}`;
          }

          return `Convocatoria oficial para ${target.toUpperCase()} generada con éxito:\n\n${circularText}`;
        }

        if (toolName === 'delete_event') {
          const { item, index } = findEntity(currentData.events, toolArgs.id, 'title', toolArgs.search_title);
          if (!item) {
            return `No se encontró el evento "${toolArgs.search_title || toolArgs.id}" para eliminar.`;
          }
          const removedTitle = item.title;
          currentData.events.splice(index, 1);
          saveDataAtomic(currentData);
          if (!mainWindow?.isDestroyed()) {
            mainWindow.webContents.send('pastoral:data-updated', { type: 'event', action: 'deleted', id: item.id });
          }
          return `Evento "${removedTitle}" eliminado del calendario pastoral.`;
        }

        // --- TAREAS ---
        if (toolName === 'create_task') {
          const newTask = {
            id,
            title: toolArgs.title || 'Nueva Tarea',
            due: toolArgs.due || '',
            priority: toolArgs.priority || 'media',
            notes: toolArgs.notes || '',
            done: false,
            createdAt: new Date().toISOString()
          };
          currentData.tasks.unshift(newTask);
          saveDataAtomic(currentData);
          if (!mainWindow?.isDestroyed()) {
            mainWindow.webContents.send('pastoral:data-updated', { type: 'task', action: 'created', item: newTask });
          }
          return `Tarea "${newTask.title}" agregada a la lista de pendientes.`;
        }

        if (toolName === 'edit_task') {
          const { item } = findEntity(currentData.tasks, toolArgs.id, 'title', toolArgs.search_title || toolArgs.title);
          if (!item) {
            return `No se encontró la tarea "${toolArgs.search_title || toolArgs.id}". Verifica el nombre en tu lista.`;
          }
          if (toolArgs.title !== undefined) item.title = toolArgs.title;
          if (toolArgs.due !== undefined) item.due = toolArgs.due;
          if (toolArgs.priority !== undefined) item.priority = toolArgs.priority;
          if (toolArgs.notes !== undefined) item.notes = toolArgs.notes;
          if (toolArgs.done !== undefined) item.done = Boolean(toolArgs.done);
          saveDataAtomic(currentData);
          if (!mainWindow?.isDestroyed()) {
            mainWindow.webContents.send('pastoral:data-updated', { type: 'task', action: 'updated', item });
          }
          const statusText = item.done ? 'marcada como completada' : 'actualizada';
          return `Tarea "${item.title}" ${statusText} correctamente.`;
        }

        if (toolName === 'delete_task') {
          const { item, index } = findEntity(currentData.tasks, toolArgs.id, 'title', toolArgs.search_title);
          if (!item) {
            return `No se encontró la tarea "${toolArgs.search_title || toolArgs.id}" para eliminar.`;
          }
          const removedTitle = item.title;
          currentData.tasks.splice(index, 1);
          saveDataAtomic(currentData);
          if (!mainWindow?.isDestroyed()) {
            mainWindow.webContents.send('pastoral:data-updated', { type: 'task', action: 'deleted', id: item.id });
          }
          return `Tarea "${removedTitle}" eliminada de la lista de deberes.`;
        }

        // --- GRUPOS ---
        if (toolName === 'create_group') {
          const newGroup = {
            id,
            name: toolArgs.name || 'Nuevo Grupo',
            leader: toolArgs.leader || '',
            description: toolArgs.description || '',
            members: toolArgs.members || ''
          };
          currentData.groups.push(newGroup);
          saveDataAtomic(currentData);
          if (!mainWindow?.isDestroyed()) {
            mainWindow.webContents.send('pastoral:data-updated', { type: 'group', action: 'created', item: newGroup });
          }
          return `Grupo pastoral "${newGroup.name}" creado correctamente.`;
        }

        if (toolName === 'edit_group') {
          const { item } = findEntity(currentData.groups, toolArgs.id, 'name', toolArgs.search_name || toolArgs.name);
          if (!item) {
            return `No se encontró el grupo "${toolArgs.search_name || toolArgs.id}".`;
          }
          if (toolArgs.name !== undefined) item.name = toolArgs.name;
          if (toolArgs.leader !== undefined) item.leader = toolArgs.leader;
          if (toolArgs.description !== undefined) item.description = toolArgs.description;
          if (toolArgs.members !== undefined) item.members = toolArgs.members;
          saveDataAtomic(currentData);
          if (!mainWindow?.isDestroyed()) {
            mainWindow.webContents.send('pastoral:data-updated', { type: 'group', action: 'updated', item });
          }
          return `Grupo pastoral "${item.name}" actualizado correctamente.`;
        }

        if (toolName === 'delete_group') {
          const { item, index } = findEntity(currentData.groups, toolArgs.id, 'name', toolArgs.search_name);
          if (!item) {
            return `No se encontró el grupo "${toolArgs.search_name || toolArgs.id}" para eliminar.`;
          }
          const removedName = item.name;
          currentData.groups.splice(index, 1);
          saveDataAtomic(currentData);
          if (!mainWindow?.isDestroyed()) {
            mainWindow.webContents.send('pastoral:data-updated', { type: 'group', action: 'deleted', id: item.id });
          }
          return `Grupo pastoral "${removedName}" eliminado de la comunidad.`;
        }

        // --- PERSONAS ---
        if (toolName === 'create_person') {
          const newPerson = {
            id,
            name: toolArgs.name || 'Nueva Persona',
            role: toolArgs.role || '',
            group: toolArgs.group || '',
            contact: toolArgs.contact || '',
            notes: toolArgs.notes || ''
          };
          currentData.persons.push(newPerson);
          saveDataAtomic(currentData);
          if (!mainWindow?.isDestroyed()) {
            mainWindow.webContents.send('pastoral:data-updated', { type: 'person', action: 'created', item: newPerson });
          }
          return `Persona "${newPerson.name}" agregada a la comunidad.`;
        }

        if (toolName === 'edit_person') {
          const { item } = findEntity(currentData.persons, toolArgs.id, 'name', toolArgs.search_name || toolArgs.name);
          if (!item) {
            return `No se encontró la persona "${toolArgs.search_name || toolArgs.id}".`;
          }
          if (toolArgs.name !== undefined) item.name = toolArgs.name;
          if (toolArgs.role !== undefined) item.role = toolArgs.role;
          if (toolArgs.group !== undefined) item.group = toolArgs.group;
          if (toolArgs.contact !== undefined) item.contact = toolArgs.contact;
          if (toolArgs.notes !== undefined) item.notes = toolArgs.notes;
          saveDataAtomic(currentData);
          if (!mainWindow?.isDestroyed()) {
            mainWindow.webContents.send('pastoral:data-updated', { type: 'person', action: 'updated', item });
          }
          return `Ficha de "${item.name}" actualizada correctamente en la comunidad.`;
        }

        if (toolName === 'delete_person') {
          const { item, index } = findEntity(currentData.persons, toolArgs.id, 'name', toolArgs.search_name);
          if (!item) {
            return `No se encontró a la persona "${toolArgs.search_name || toolArgs.id}" para eliminar.`;
          }
          const removedName = item.name;
          currentData.persons.splice(index, 1);
          saveDataAtomic(currentData);
          if (!mainWindow?.isDestroyed()) {
            mainWindow.webContents.send('pastoral:data-updated', { type: 'person', action: 'deleted', id: item.id });
          }
          return `Persona "${removedName}" eliminada del directorio de la comunidad.`;
        }

        // --- CANTOS / CANCIONERO ---
        if (toolName === 'create_song') {
          const newSong = {
            id,
            title: toolArgs.title || 'Nuevo Canto',
            author: toolArgs.author || '',
            category: toolArgs.category || 'Entrada',
            key: toolArgs.key || 'C',
            tempo: toolArgs.tempo || '',
            lyricsWithChords: toolArgs.lyrics || ''
          };
          if (!Array.isArray(currentData.songs)) currentData.songs = [];
          currentData.songs.unshift(newSong);
          saveDataAtomic(currentData);
          if (!mainWindow?.isDestroyed()) {
            mainWindow.webContents.send('pastoral:data-updated', { type: 'song', action: 'created', item: newSong });
          }
          return `Canto "${newSong.title}" añadido al cancionero pastoral con tono ${newSong.key}.`;
        }

        if (toolName === 'edit_song') {
          const { item } = findEntity(currentData.songs, toolArgs.id, 'title', toolArgs.search_title || toolArgs.title);
          if (!item) {
            return `No se encontró el canto "${toolArgs.search_title || toolArgs.id}". Verifica el título en el cancionero.`;
          }
          if (toolArgs.title !== undefined) item.title = toolArgs.title;
          if (toolArgs.author !== undefined) item.author = toolArgs.author;
          if (toolArgs.category !== undefined) item.category = toolArgs.category;
          if (toolArgs.key !== undefined) item.key = toolArgs.key;
          if (toolArgs.tempo !== undefined) item.tempo = toolArgs.tempo;
          if (toolArgs.lyrics !== undefined) item.lyricsWithChords = toolArgs.lyrics;
          saveDataAtomic(currentData);
          if (!mainWindow?.isDestroyed()) {
            mainWindow.webContents.send('pastoral:data-updated', { type: 'song', action: 'updated', item });
          }
          return `Canto "${item.title}" actualizado correctamente en el cancionero (Tono: ${item.key || 'C'}).`;
        }

        if (toolName === 'delete_song') {
          const { item, index } = findEntity(currentData.songs, toolArgs.id, 'title', toolArgs.search_title);
          if (!item) {
            return `No se encontró el canto "${toolArgs.search_title || toolArgs.id}" para eliminar.`;
          }
          const removedTitle = item.title;
          currentData.songs.splice(index, 1);
          saveDataAtomic(currentData);
          if (!mainWindow?.isDestroyed()) {
            mainWindow.webContents.send('pastoral:data-updated', { type: 'song', action: 'deleted', id: item.id });
          }
          return `Canto "${removedTitle}" eliminado del cancionero pastoral.`;
        }

        // --- GUIONES LITÚRGICOS ---
        if (toolName === 'create_liturgical_script') {
          const newScript = {
            id,
            title: toolArgs.title || 'Nueva Celebración',
            type: toolArgs.type || 'Misa Escolar',
            date: toolArgs.date || '',
            course: toolArgs.course || '',
            celebrant: toolArgs.celebrant || '',
            theme: toolArgs.theme || '',
            initialRites: {
              entranceCommentary: toolArgs.entranceCommentary || '',
              entranceSong: toolArgs.entranceSong || '',
              penitentialAct: toolArgs.penitentialAct || ''
            },
            wordLiturgy: {
              wordCommentary: toolArgs.wordCommentary || '',
              firstReading: toolArgs.firstReading || '',
              psalm: toolArgs.psalm || '',
              gospel: toolArgs.gospel || ''
            },
            petitions: Array.isArray(toolArgs.petitions) ? toolArgs.petitions : [],
            offertory: {
              offertoryCommentary: toolArgs.offertoryCommentary || '',
              offerings: Array.isArray(toolArgs.offerings) ? toolArgs.offerings : [],
              offertorySong: toolArgs.offertorySong || ''
            },
            communion: {
              communionCommentary: toolArgs.communionCommentary || '',
              communionSong: toolArgs.communionSong || ''
            },
            concludingRites: {
              thanksgivingPrayer: toolArgs.thanksgivingPrayer || '',
              recessionalSong: toolArgs.recessionalSong || ''
            }
          };
          if (!Array.isArray(currentData.liturgicalScripts)) currentData.liturgicalScripts = [];
          currentData.liturgicalScripts.unshift(newScript);
          saveDataAtomic(currentData);
          if (!mainWindow?.isDestroyed()) {
            mainWindow.webContents.send('pastoral:data-updated', { type: 'liturgicalScript', action: 'created', item: newScript });
          }
          return `Guión litúrgico "${newScript.title}" creado y guardado exitosamente.`;
        }

        if (toolName === 'edit_liturgical_script') {
          const { item } = findEntity(currentData.liturgicalScripts, toolArgs.id, 'title', toolArgs.search_title || toolArgs.title);
          if (!item) {
            return `No se encontró el guión litúrgico "${toolArgs.search_title || toolArgs.id}".`;
          }
          if (!item.initialRites) item.initialRites = {};
          if (!item.wordLiturgy) item.wordLiturgy = {};
          if (!item.offertory) item.offertory = {};
          if (!item.communion) item.communion = {};
          if (!item.concludingRites) item.concludingRites = {};

          if (toolArgs.title !== undefined) item.title = toolArgs.title;
          if (toolArgs.type !== undefined) item.type = toolArgs.type;
          if (toolArgs.date !== undefined) item.date = toolArgs.date;
          if (toolArgs.course !== undefined) item.course = toolArgs.course;
          if (toolArgs.celebrant !== undefined) item.celebrant = toolArgs.celebrant;
          if (toolArgs.theme !== undefined) item.theme = toolArgs.theme;
          if (toolArgs.entranceCommentary !== undefined) item.initialRites.entranceCommentary = toolArgs.entranceCommentary;
          if (toolArgs.entranceSong !== undefined) item.initialRites.entranceSong = toolArgs.entranceSong;
          if (toolArgs.penitentialAct !== undefined) item.initialRites.penitentialAct = toolArgs.penitentialAct;
          if (toolArgs.wordCommentary !== undefined) item.wordLiturgy.wordCommentary = toolArgs.wordCommentary;
          if (toolArgs.firstReading !== undefined) item.wordLiturgy.firstReading = toolArgs.firstReading;
          if (toolArgs.psalm !== undefined) item.wordLiturgy.psalm = toolArgs.psalm;
          if (toolArgs.gospel !== undefined) item.wordLiturgy.gospel = toolArgs.gospel;
          if (toolArgs.offertoryCommentary !== undefined) item.offertory.offertoryCommentary = toolArgs.offertoryCommentary;
          if (toolArgs.offertorySong !== undefined) item.offertory.offertorySong = toolArgs.offertorySong;
          if (toolArgs.communionCommentary !== undefined) item.communion.communionCommentary = toolArgs.communionCommentary;
          if (toolArgs.communionSong !== undefined) item.communion.communionSong = toolArgs.communionSong;
          if (toolArgs.thanksgivingPrayer !== undefined) item.concludingRites.thanksgivingPrayer = toolArgs.thanksgivingPrayer;
          if (toolArgs.recessionalSong !== undefined) item.concludingRites.recessionalSong = toolArgs.recessionalSong;

          saveDataAtomic(currentData);
          if (!mainWindow?.isDestroyed()) {
            mainWindow.webContents.send('pastoral:data-updated', { type: 'liturgicalScript', action: 'updated', item });
          }
          return `Guión litúrgico "${item.title}" actualizado correctamente.`;
        }

        if (toolName === 'delete_liturgical_script') {
          const { item, index } = findEntity(currentData.liturgicalScripts, toolArgs.id, 'title', toolArgs.search_title);
          if (!item) {
            return `No se encontró el guión litúrgico "${toolArgs.search_title || toolArgs.id}" para eliminar.`;
          }
          const removedTitle = item.title;
          currentData.liturgicalScripts.splice(index, 1);
          saveDataAtomic(currentData);
          if (!mainWindow?.isDestroyed()) {
            mainWindow.webContents.send('pastoral:data-updated', { type: 'liturgicalScript', action: 'deleted', id: item.id });
          }
          return `Guión litúrgico "${removedTitle}" eliminado del registro.`;
        }

        // --- LECTURAS Y SANTORAL DEL DÍA ---
        if (toolName === 'get_daily_gospel_and_saint') {
          let result = '';
          try {
            const readingsRes = await readingManager.getDailyReadings({ force: false });
            if (readingsRes && readingsRes.readings) {
              const r = readingsRes.readings;
              result += `📖 LECTURAS LITÚRGICAS DE HOY:\n`;
              if (r.liturgicTitle) result += `Celebración: ${r.liturgicTitle}\n`;
              if (r.firstReading) result += `1ra Lectura (${r.firstReading.title}): ${r.firstReading.text ? r.firstReading.text.substring(0, 300) : ''}...\n\n`;
              if (r.psalm) result += `Salmo (${r.psalm.title}): ${r.psalm.text ? r.psalm.text.substring(0, 200) : ''}...\n\n`;
              if (r.gospel) result += `Evangelio (${r.gospel.title}): ${r.gospel.text}\n\n`;
            }
          } catch (rErr) {
            result += `No se pudieron cargar las lecturas de hoy: ${rErr.message}\n`;
          }

          try {
            const saintRes = await saintManager.getSaintOfTheDay({ force: false });
            if (saintRes && saintRes.saint) {
              const s = saintRes.saint;
              result += `✝️ SANTO DEL DÍA:\n${s.name} (${s.feastDate})\n${s.shortBio || s.life || ''}\n`;
            }
          } catch (sErr) {
            result += `No se pudo cargar el Santo del día: ${sErr.message}\n`;
          }

          return result || 'Lecturas y santoral no disponibles en este momento.';
        }

        return `Herramienta ${toolName} ejecutada.`;
      }
    });

    currentChatAbortController = null;
    return { success: true, response };
  } catch (err) {
    currentChatAbortController = null;
    const isAborted = signal.aborted;
    return {
      success: false,
      aborted: isAborted,
      error: isAborted ? 'Generación detenida por el usuario.' : err.message
    };
  }
});

ipcMain.handle('pastoral:ai-chat-cancel', async () => {
  if (currentChatAbortController) {
    currentChatAbortController.abort();
    currentChatAbortController = null;
    return { success: true };
  }
  return { success: false, message: 'No hay generación activa.' };
});
