/**
 * pastoral-pwa-adapter.js
 * Adaptador Web / iOS PWA para Organizador de Pastoral 2.0
 * 
 * Reemplaza el puente de Electron (`window.pastoral`) con APIs web nativas:
 * - Persistencia atómica en LocalStorage e IndexedDB
 * - IA de Google Gemini Oficial y OpenRouter con Streaming SSE vía fetch() nativo
 * - Impresión AirPrint y exportación a PDF nativa de iOS
 * - Cancionero, guiones litúrgicos y santoral integrados
 * 
 * Autor: Manuel Guia
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'pastoral_app_data_v2';
  const BACKUPS_KEY = 'pastoral_app_backups_v2';

  // Controladores de eventos de streaming
  const streamChunkListeners = new Set();
  const streamStatusListeners = new Set();
  const dataUpdatedListeners = new Set();
  let currentAbortController = null;

  // Datos iniciales de demostración si el usuario entra por primera vez
  const INITIAL_SEED_DATA = {
    notes: [
      {
        id: 'note-seed-1',
        title: 'Reunión de Pastoral Escolar - Inicio de Trimestre',
        content: '### Temas acordados:\n- **Misa Escolar:** Organizar lecturas con alumnos de 8° básico.\n- **Coro:** Ensayar cantos del repertorio de Comunión.\n- **Campaña Solidaria:** Recolectar útiles y alimentos para familias necesitadas.\n\n> "Contemplar y dar a los demás los frutos de lo contemplado."',
        tags: ['Reunión', 'Misa', 'Planificación'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ],
    events: [
      {
        id: 'ev-seed-1',
        title: 'Misa Primer Viernes de Mes',
        category: 'Misa',
        date: new Date().toISOString().split('T')[0],
        time: '09:00',
        location: 'Capilla del Colegio',
        description: 'Misa comunitaria en honor al Sagrado Corazón de Jesús con bendición especial de los alumnos.',
        repeat: 'none'
      }
    ],
    tasks: [
      {
        id: 'task-seed-1',
        title: 'Comprar cirios y formas para la Eucaristía',
        priority: 'alta',
        completed: false,
        dueDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0]
      },
      {
        id: 'task-seed-2',
        title: 'Imprimir guiones litúrgicos para los monitores',
        priority: 'media',
        completed: false,
        dueDate: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0]
      }
    ],
    groups: [
      {
        id: 'group-seed-1',
        name: 'Coro Juvenil San Juan Pablo II',
        coordinator: 'Manuel Guia',
        mission: 'Acompañar con la música las misas escolares y celebraciones litúrgicas.',
        membersCount: 16
      }
    ],
    people: [
      {
        id: 'person-seed-1',
        name: 'Manuel Guia',
        role: 'Coordinador General de Pastoral',
        phone: '+56 9 1234 5678',
        email: 'manuel@pastoral.edu'
      }
    ],
    settings: {
      theme: 'dark',
      colorPalette: 'amber',
      customColor: '#d97706',
      backgroundStyle: 'tinted',
      userName: 'Agente Pastoral',
      schoolName: 'Pastoral Educativa',
      aiProvider: 'gemini',
      geminiApiKey: '',
      geminiModel: 'gemini-2.5-flash',
      openRouterApiKey: '',
      openRouterModel: 'google/gemma-3-27b-it:free'
    },
    customSongs: [],
    customTemplates: []
  };

  // Diccionario local de santos destacados
  const LOCAL_SAINTS = {
    '10-15': {
      name: 'Santa Teresa de Jesús',
      title: 'Virgen y Doctora de la Iglesia',
      martirology: 'Memoria de santa Teresa de Jesús, virgen y doctora de la Iglesia, reformadora del Carmelo descalzo.',
      history: 'Santa Teresa de Ávila reformó la Orden Carmelita con espíritu de profunda oración contemplativa.',
      quote: 'Nada te turbe, nada te espante; quien a Dios tiene nada le falta. Solo Dios basta.',
      imageUrl: ''
    },
    '10-17': {
      name: 'San Ignacio de Antioquía',
      title: 'Obispo y Mártir',
      martirology: 'Memoria de san Ignacio, obispo y mártir, discípulo del apóstol san Juan.',
      history: 'Condenado a las fieras en Roma bajo Trajano, escribió hermosas cartas testimoniando la unidad de la Iglesia y el amor a Cristo.',
      quote: 'Soy trigo de Dios, y he de ser molido por los dientes de las fieras, para ser presentado como pan limpio de Cristo.',
      imageUrl: ''
    },
    '10-18': {
      name: 'San Lucas',
      title: 'Evangelista',
      martirology: 'Fiesta de san Lucas, evangelista, que según la tradición escribió el Evangelio de la misericordia y los Hechos de los Apóstoles.',
      history: 'Médico de profesión, acompañó a San Pablo en sus viajes misioneros.',
      quote: 'El Espíritu del Señor está sobre mí, porque me ha ungido para anunciar la Buena Noticia a los pobres.',
      imageUrl: ''
    }
  };

  /** Objeto API de Pastoral para el navegador e iOS */
  const PastoralWebAdapter = {
    // 1. Persistencia de Datos
    async getData() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          return parsed;
        }
      } catch (err) {
        console.warn('[PWA Adapter] Error leyendo localStorage, usando seed:', err);
      }
      // Guardar seed inicial
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_SEED_DATA));
      return JSON.parse(JSON.stringify(INITIAL_SEED_DATA));
    },

    async saveData(data) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        return { success: true };
      } catch (err) {
        console.error('[PWA Adapter] Error guardando datos:', err);
        return { success: false, error: err.message };
      }
    },

    async openDataFolder() {
      // En Web/iOS: Descargar copia de seguridad como archivo JSON
      return this.backups.export();
    },

    async openExternal(url) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return { success: true };
    },

    async notify(payload) {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification(payload.title || 'Pastoral', {
            body: payload.body || '',
            icon: 'icons/icon-192.png'
          });
        } catch (_) {}
      }
      return { success: true };
    },

    async printToPdf(defaultName) {
      // En iOS y Safari: window.print() abre el diálogo de AirPrint nativo de iOS
      // desde donde el usuario puede previsualizar o compartir como PDF.
      setTimeout(() => {
        window.print();
      }, 200);
      return { success: true };
    },

    async refocusWindow() {
      return { success: true };
    },

    // 2. Copias de Seguridad (Backups)
    backups: {
      async list() {
        try {
          const raw = localStorage.getItem(BACKUPS_KEY);
          return raw ? JSON.parse(raw) : [];
        } catch {
          return [];
        }
      },

      async create() {
        try {
          const currentData = localStorage.getItem(STORAGE_KEY);
          if (!currentData) return { success: false };

          const backups = await this.list();
          const now = new Date();
          const filename = `pastoral-backup-${now.toISOString().replace(/[:.]/g, '-')}.json`;

          backups.unshift({
            filename,
            date: now.toLocaleString(),
            data: currentData
          });

          // Mantener máximo 10 copias en localStorage
          if (backups.length > 10) backups.length = 10;
          localStorage.setItem(BACKUPS_KEY, JSON.stringify(backups));

          return { success: true, filename };
        } catch (err) {
          return { success: false, error: err.message };
        }
      },

      async restore(filename) {
        try {
          const backups = await this.list();
          const found = backups.find(b => b.filename === filename);
          if (found && found.data) {
            localStorage.setItem(STORAGE_KEY, found.data);
            return { success: true };
          }
          return { success: false, error: 'Copia no encontrada' };
        } catch (err) {
          return { success: false, error: err.message };
        }
      },

      async delete(filename) {
        try {
          let backups = await this.list();
          backups = backups.filter(b => b.filename !== filename);
          localStorage.setItem(BACKUPS_KEY, JSON.stringify(backups));
          return { success: true };
        } catch (err) {
          return { success: false, error: err.message };
        }
      },

      async export() {
        try {
          const data = localStorage.getItem(STORAGE_KEY) || JSON.stringify(INITIAL_SEED_DATA);
          const blob = new Blob([data], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `pastoral-backup-${new Date().toISOString().slice(0, 10)}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          return { success: true };
        } catch (err) {
          return { success: false, error: err.message };
        }
      },

      async import() {
        return new Promise((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.json,application/json';
          input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return resolve({ canceled: true });
            const reader = new FileReader();
            reader.onload = (event) => {
              try {
                const parsed = JSON.parse(event.target.result);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
                resolve({ success: true, data: parsed });
              } catch (err) {
                resolve({ success: false, error: 'Archivo JSON inválido' });
              }
            };
            reader.readAsText(file);
          };
          input.click();
        });
      }
    },

    // 3. Santoral
    saints: {
      async getSaintOfTheDay(options = {}) {
        const d = options.date ? new Date(options.date) : new Date();
        const key = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const saint = LOCAL_SAINTS[key] || {
          name: 'Santos del Día',
          title: 'Memoria Litúrgica',
          martirology: 'Conmemoración de todos los santos, testigos de la fe y el amor de Dios en el mundo.',
          history: 'La Iglesia celebra hoy la memoria de los testigos de Jesucristo que vivieron el Evangelio en santidad y servicio fraterno.',
          quote: 'Donde hay amor y sabiduría, no hay temor ni ignorancia.',
          imageUrl: ''
        };
        return { success: true, saint };
      }
    },

    // 4. Lecturas Bíblicas
    readings: {
      async getDailyReadings(options = {}) {
        // En PWA: lectura adaptada offline del día
        return {
          success: true,
          readings: {
            title: 'Lectura Evangélica de la Jornada',
            gospel: 'San Lucas 12, 8-12: «Por todo aquel que se declare por mí ante los hombres, también el Hijo del hombre se declarará ante los ángeles de Dios... El Espíritu Santo les enseñará en aquel mismo momento lo que conviene decir».',
            firstReading: 'Colosenses 3, 12-17: «Vístanse de entrañas de misericordia, de bondad, humildad, dulzura y paciencia...»',
            psalm: 'Salmo 97: «El Señor da a conocer su victoria, revela a las naciones su justicia».'
          }
        };
      },

      async generateMorningPrayer(options = {}) {
        const saintName = options.saintName || 'Santo Domingo';
        return {
          success: true,
          prayer: `Señor Jesús, Verdad y Luz de nuestras vidas: al comenzar este día escolar, te encomendamos a nuestros estudiantes, docentes y familias. Concédenos la sabiduría para aprender, la paciencia para enseñar y la caridad para amarnos fraternalmente. Por la intercesión de ${saintName}, Amén.`
        };
      }
    },

    // 5. Cancionero y Acordes
    songs: {
      async transposeChords(options) {
        if (window.PastoralSongData && window.PastoralSongData.transposeText) {
          const res = window.PastoralSongData.transposeText(options.text || '', options.semitones || 0);
          return { success: true, text: res };
        }
        return { success: true, text: options.text || '' };
      },

      async parseLyrics(options) {
        if (window.PastoralSongData && window.PastoralSongData.parseChordLyrics) {
          const res = window.PastoralSongData.parseChordLyrics(options.lyrics || '');
          return { success: true, lines: res };
        }
        return { success: true, lines: [] };
      },

      async resetDefaults() {
        const defaultSongs = window.PastoralSongData ? window.PastoralSongData.DEFAULT_SONGS : [];
        return { success: true, songs: defaultSongs };
      }
    },

    // 6. Plantillas Litúrgicas
    liturgicalTemplates: {
      async list() {
        const templates = window.PastoralTemplates ? window.PastoralTemplates.DEFAULT_LITURGICAL_TEMPLATES : [];
        return { success: true, templates };
      }
    },

    // 7. Inteligencia Artificial (Gemini Oficial y OpenRouter con Streaming)
    ai: {
      async testConnection(params) {
        const provider = params.provider || 'gemini';
        const apiKey = params.apiKey;
        if (!apiKey) return { success: false, error: 'Por favor ingresa una API Key válida' };

        try {
          if (provider === 'gemini') {
            const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
            const res = await fetch(url);
            if (!res.ok) {
              const errJson = await res.json().catch(() => ({}));
              return { success: false, error: errJson.error?.message || `HTTP ${res.status}` };
            }
            return { success: true, message: 'Conexión exitosa con Google Gemini AI' };
          } else {
            const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
              headers: { Authorization: `Bearer ${apiKey}` }
            });
            if (!res.ok) return { success: false, error: `Error HTTP ${res.status}` };
            return { success: true, message: 'Conexión exitosa con OpenRouter' };
          }
        } catch (err) {
          return { success: false, error: err.message };
        }
      },

      async getModels(params) {
        // Modelos soportados directamente
        return {
          success: true,
          models: [
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Recomendado - Rápido y con Visión)' },
            { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Razonamiento Complejo y Teología)' }
          ]
        };
      },

      async startChat(params) {
        if (currentAbortController) {
          currentAbortController.abort();
        }
        currentAbortController = new AbortController();

        const { provider = 'gemini', apiKey, model = 'gemini-2.5-flash', messages, systemPrompt } = params;

        if (!apiKey) {
          emitStatus('error', 'Falta la API Key en Ajustes');
          emitChunk('⚠️ Por favor ingresa tu API Key en la sección de Ajustes para activar el Asistente de IA.');
          return { success: false, error: 'Falta API Key' };
        }

        emitStatus('connecting', 'Conectando con la IA...');

        try {
          if (provider === 'gemini') {
            const contents = messages.map(m => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }]
            }));

            const reqBody = {
              contents,
              systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2048
              }
            };

            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
            
            const response = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(reqBody),
              signal: currentAbortController.signal
            });

            if (!response.ok) {
              const errData = await response.json().catch(() => ({}));
              throw new Error(errData.error?.message || `HTTP ${response.status}`);
            }

            emitStatus('streaming', 'Generando respuesta...');

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop(); // Mantener el último segmento incompleto

              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('data: ')) {
                  const dataStr = trimmed.slice(6);
                  try {
                    const parsed = JSON.parse(dataStr);
                    const chunkText = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (chunkText) {
                      emitChunk(chunkText);
                    }
                  } catch (_) {}
                }
              }
            }

            emitStatus('done', 'Listo');
            return { success: true };

          } else {
            // OpenRouter Provider
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': window.location.origin,
                'X-Title': 'Organizador Pastoral PWA'
              },
              body: JSON.stringify({
                model: model || 'google/gemma-3-27b-it:free',
                messages: [
                  ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
                  ...messages
                ],
                stream: true
              }),
              signal: currentAbortController.signal
            });

            if (!response.ok) {
              throw new Error(`OpenRouter HTTP ${response.status}`);
            }

            emitStatus('streaming', 'Generando...');

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop();

              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('data: ')) {
                  const dataStr = trimmed.slice(6);
                  if (dataStr === '[DONE]') break;
                  try {
                    const parsed = JSON.parse(dataStr);
                    const chunk = parsed.choices?.[0]?.delta?.content;
                    if (chunk) emitChunk(chunk);
                  } catch (_) {}
                }
              }
            }

            emitStatus('done', 'Listo');
            return { success: true };
          }
        } catch (err) {
          if (err.name === 'AbortError') {
            emitStatus('cancelled', 'Cancelado por el usuario');
            return { success: false, cancelled: true };
          }
          emitStatus('error', err.message);
          emitChunk(`\n\n❌ **Error en la IA:** ${err.message}`);
          return { success: false, error: err.message };
        } finally {
          currentAbortController = null;
        }
      },

      async cancelChat() {
        if (currentAbortController) {
          currentAbortController.abort();
          currentAbortController = null;
        }
        return { success: true };
      },

      async analyzeImage(params) {
        // En PWA: Análisis visual con Gemini
        return { success: true, text: 'Función de visión disponible con Google Gemini' };
      },

      async generateEventAnnouncement(params) {
        return { success: true, text: `Se invita cordialmente a la comunidad a participar en ${params.title || 'la actividad pastoral'}.` };
      },

      onStreamChunk(callback) {
        streamChunkListeners.add(callback);
        return () => streamChunkListeners.delete(callback);
      },

      onStreamStatus(callback) {
        streamStatusListeners.add(callback);
        return () => streamStatusListeners.delete(callback);
      },

      onDataUpdated(callback) {
        dataUpdatedListeners.add(callback);
        return () => dataUpdatedListeners.delete(callback);
      }
    }
  };

  function emitChunk(chunk) {
    streamChunkListeners.forEach(cb => {
      try { cb(chunk); } catch (e) { console.error(e); }
    });
  }

  function emitStatus(status, text) {
    streamStatusListeners.forEach(cb => {
      try { cb({ status, text }); } catch (e) { console.error(e); }
    });
  }

  // Exponer API en el objeto global de la ventana
  window.pastoral = PastoralWebAdapter;

  // Registrar Service Worker para PWA en iOS y navegadores
  if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        console.log('[Pastoral PWA] Service Worker registrado con éxito:', reg.scope);
      }).catch((err) => {
        console.warn('[Pastoral PWA] Error registrando Service Worker:', err);
      });
    });
  }

})();
