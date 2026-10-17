/**
 * preload.js - Puente seguro ContextBridge para Organizador Pastoral
 * Expone un objeto único `window.pastoral` hacia el Renderer
 */

const { contextBridge, ipcRenderer } = require('electron');

const pastoralAPI = {
  // Persistencia de datos
  getData: () => ipcRenderer.invoke('pastoral:get-data'),
  saveData: (data) => ipcRenderer.invoke('pastoral:save-data', data),
  openDataFolder: () => ipcRenderer.invoke('pastoral:open-data-folder'),
  openExternal: (url) => ipcRenderer.invoke('pastoral:open-external', url),
  notify: (payload) => ipcRenderer.invoke('pastoral:notify', payload),
  printToPdf: (defaultName) => ipcRenderer.invoke('pastoral:print-to-pdf', defaultName),
  refocusWindow: () => ipcRenderer.invoke('pastoral:refocus-window'),


  // Copias de seguridad (Backups)
  backups: {
    list: () => ipcRenderer.invoke('pastoral:backup-list'),
    create: () => ipcRenderer.invoke('pastoral:backup-create'),
    restore: (filename) => ipcRenderer.invoke('pastoral:backup-restore', filename),
    delete: (filename) => ipcRenderer.invoke('pastoral:backup-delete', filename),
    export: () => ipcRenderer.invoke('pastoral:backup-export'),
    import: () => ipcRenderer.invoke('pastoral:backup-import')
  },

  // Santoral e Historia del Santo (Estilo ePrex - 24 horas)
  saints: {
    getSaintOfTheDay: (options) => ipcRenderer.invoke('pastoral:get-saint-of-the-day', options)
  },

  // Lecturas bíblicas y Oración de la Mañana Escolar
  readings: {
    getDailyReadings: (options) => ipcRenderer.invoke('pastoral:get-daily-readings', options),
    generateMorningPrayer: (options) => ipcRenderer.invoke('pastoral:generate-morning-prayer', options)
  },

  // Cancionero y Acordes
  songs: {
    transposeChords: (options) => ipcRenderer.invoke('pastoral:transpose-chords', options),
    parseLyrics: (options) => ipcRenderer.invoke('pastoral:parse-song-lyrics', options),
    resetDefaults: () => ipcRenderer.invoke('pastoral:reset-default-songs')
  },

  // Plantillas Litúrgicas Oficiales Independientes
  liturgicalTemplates: {
    list: () => ipcRenderer.invoke('pastoral:get-liturgical-templates')
  },

  // Asistente de IA (Google Gemini Oficial y OpenRouter)
  ai: {
    testConnection: (params) => ipcRenderer.invoke('pastoral:ai-test-connection', params),
    getModels: (params) => ipcRenderer.invoke('pastoral:ai-get-models', params),
    analyzeImage: (params) => ipcRenderer.invoke('pastoral:ai-analyze-image', params),
    startChat: (params) => ipcRenderer.invoke('pastoral:ai-chat-start', params),
    cancelChat: () => ipcRenderer.invoke('pastoral:ai-chat-cancel'),
    generateEventAnnouncement: (params) => ipcRenderer.invoke('pastoral:generate-event-announcement', params),

    // Suscripción a eventos de streaming
    onStreamChunk: (callback) => {
      const listener = (_event, chunk) => callback(chunk);
      ipcRenderer.on('pastoral:ai-stream-chunk', listener);
      return () => ipcRenderer.removeListener('pastoral:ai-stream-chunk', listener);
    },
    onStreamStatus: (callback) => {
      const listener = (_event, status) => callback(status);
      ipcRenderer.on('pastoral:ai-stream-status', listener);
      return () => ipcRenderer.removeListener('pastoral:ai-stream-status', listener);
    },
    onDataUpdated: (callback) => {
      const listener = (_event, info) => callback(info);
      ipcRenderer.on('pastoral:data-updated', listener);
      return () => ipcRenderer.removeListener('pastoral:data-updated', listener);
    }
  }
};

contextBridge.exposeInMainWorld('pastoral', pastoralAPI);
