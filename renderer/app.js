/**
 * app.js - Lógica Integral de la Interfaz para Organizador Pastoral
 * Desarrollado con JavaScript Vanilla (sin frameworks ni dependencias de runtime).
 * Autor: Manuel Guia
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Estado local sincronizado con la persistencia
  let state = {
    deletedIds: {},
    notes: [],
    events: [],
    tasks: [],
    groups: [],
    persons: [],
    chat: [],
    songs: [],
    liturgicalScripts: [],
    saintOfTheDay: null,
    dailyReadings: null,
    settings: {
      pastorName: 'Agente Pastoral',
      schoolName: 'Colegio Católico',
      theme: 'light',
      colorPalette: 'amber',
      customColor: '#d97706',
      backgroundStyle: 'tinted',
      showWelcome: true,
      notifications: true,
      cloud: {
        apiKey: '',
        model: 'google/gemma-4-31b-it:free'
      }
    }
  };

  // Variables de control de UI
  let currentView = 'dashboard';
  let activeTagFilter = null;
  let calendarYear = new Date().getFullYear();
  let calendarMonth = new Date().getMonth(); // 0..11
  let selectedDateStr = new Date().toISOString().split('T')[0];
  let calendarViewMode = 'month'; // 'month' | 'agenda'
  let activeEventCategoryFilter = 'all'; // 'all' o nombre de categoría
  let currentChatImages = []; // Array de dataURLs (máx 4)
  let isGeneratingChat = false;
  let omnisearchIndex = 0;
  let omnisearchFilteredResults = [];
  let availableModelsCache = [];
  let liturgicalTemplatesCatalog = [];

  // ========================================================
  // INICIALIZACIÓN Y CARGA DE DATOS
  // ========================================================

  async function initApp() {
    try {
      const data = await window.pastoral.getData();
      if (data && typeof data === 'object') {
        state = { ...state, ...data };
        // Las plantillas litúrgicas son un catálogo independiente y nunca deben ser tratadas como misas registradas
        if (Array.isArray(state.liturgicalScripts)) {
          state.liturgicalScripts = state.liturgicalScripts.filter(s => s && s.id && !s.id.startsWith('template-'));
        }
        if (!state.settings) state.settings = {};
        if (!state.settings.cloud) state.settings.cloud = {};
      }

      // Cargar catálogo independiente de plantillas litúrgicas oficiales
      if (window.pastoral?.liturgicalTemplates?.list) {
        try {
          const tmplRes = await window.pastoral.liturgicalTemplates.list();
          if (tmplRes?.success && Array.isArray(tmplRes.templates) && tmplRes.templates.length > 0) {
            liturgicalTemplatesCatalog = tmplRes.templates;
          }
        } catch (errTmpl) {
          console.warn('Error al cargar catálogo de plantillas litúrgicas:', errTmpl);
        }
      }

      // Asegurar valores por defecto de IA
      if (!state.settings.cloud.provider) state.settings.cloud.provider = 'gemini';
      if (!state.settings.cloud.model) state.settings.cloud.model = 'gemini-3.8-flash';
      const deprecatedGemini = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest'];
      if (state.settings.cloud.provider === 'gemini' && (deprecatedGemini.includes(state.settings.cloud.model) || state.settings.cloud.model.includes('llama') || state.settings.cloud.model.includes('nemotron') || state.settings.cloud.model.includes('flash-latest') || state.settings.cloud.model.includes('2.5') || state.settings.cloud.model.includes('1.5') || state.settings.cloud.model.includes('2.0'))) {
        state.settings.cloud.model = 'gemini-3.8-flash';
      }
      if (state.settings.cloud.apiKey && (state.settings.cloud.apiKey.startsWith('AQ.') || state.settings.cloud.apiKey.startsWith('AIza'))) {
        state.settings.cloud.provider = 'gemini';
      }

      // Aplicar tema y paleta de colores personalizada (Pastel en claro / Fuerte en oscuro)
      applyTheme(state.settings.theme || 'light');
      applyColorPalette(
        state.settings.colorPalette || 'amber',
        state.settings.customColor || '#d97706',
        state.settings.backgroundStyle || 'tinted'
      );

      // Aplicar nombres escolares
      updateHeaderIdentity();

      // Renderizar vista inicial
      renderDashboard();
      updateTasksBadge();
      updateAiStatusIndicator();

      // Mostrar pantalla de bienvenida si está habilitada
      if (state.settings.showWelcome !== false) {
        showWelcomeModal();
      }

      // Escuchar eventos de actualización generados por IA (function calling)
      window.pastoral.ai.onDataUpdated((updateInfo) => {
        handleAiDataUpdated(updateInfo);
      });

      // Notificar eventos de hoy si las notificaciones están activas
      checkTodayNotifications();

    } catch (err) {
      console.error('Error inicializando app:', err);
      showToast('Error cargando los datos guardados: ' + err.message, 'error');
    }
  }

  function updateHeaderIdentity() {
    const schoolElem = document.getElementById('sidebar-school-name');
    if (schoolElem) schoolElem.textContent = state.settings.schoolName || 'Colegio Católico';
  }

  function updateAiStatusIndicator() {
    const dot = document.getElementById('sidebar-ai-status');
    if (!dot) return;
    const hasKey = !!(state.settings.cloud && state.settings.cloud.apiKey);
    const providerName = (state.settings.cloud.provider === 'gemini') ? 'Google Gemini' : 'OpenRouter';
    if (hasKey) {
      dot.classList.add('connected');
      dot.title = `Asistente IA Conectado: ${providerName} (${state.settings.cloud.model || 'Flash'})`;
    } else {
      dot.classList.remove('connected');
      dot.title = 'Asistente IA Desconectado (Configurar en Ajustes)';
    }
  }

  function updateTasksBadge() {
    const badge = document.getElementById('sidebar-tasks-count');
    if (!badge) return;
    const pendingCount = (state.tasks || []).filter(t => !t.done).length;
    if (pendingCount > 0) {
      badge.textContent = pendingCount;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }

  function markDeleted(id) {
    if (!id) return;
    if (!state.deletedIds || typeof state.deletedIds !== 'object') {
      state.deletedIds = {};
    }
    state.deletedIds[String(id)] = Date.now();
  }

  async function persistData() {
    try {
      const res = await window.pastoral.saveData(state);
      if (window.pastoralFirebase && typeof window.pastoralFirebase.pushState === 'function') {
        window.pastoralFirebase.pushState(state);
      }
      if (!res.success) {
        showToast('Error guardando datos: ' + res.error, 'error');
      }
    } catch (e) {
      console.error('Error persistiendo:', e);
      showToast('Error al persistir cambios', 'error');
    }
  }

  // ========================================================
  // SISTEMA DE TEMAS Y PERSONALIZACIÓN DE COLORES
  // (Pasteles y frescos en Modo Claro / Fuertes y vibrantes en Modo Oscuro)
  // ========================================================

  const APP_COLOR_PALETTES = [
    {
      id: 'amber',
      name: 'Ámbar Dominicano',
      desc: 'Oro pastoral: calidez luminosa en claro y oro solar brillante en oscuro',
      previewLight: '#fef3c7',
      previewDark: '#fbbf24',
      light: {
        primary: '#b45309',
        primaryHover: '#92400e',
        primaryLight: '#fef3c7',
        primaryText: '#ffffff',
        accent: '#d97706',
        bgApp: '#fdfbf7',
        bgSurface: '#ffffff',
        bgSurfaceAlt: '#fef9ee',
        borderColor: '#f5e6cc',
        borderLight: '#faf0df'
      },
      dark: {
        primary: '#fbbf24',
        primaryHover: '#f59e0b',
        primaryLight: 'rgba(251, 191, 36, 0.22)',
        primaryText: '#0f172a',
        accent: '#f59e0b',
        bgApp: '#0b0904',
        bgSurface: '#161208',
        bgSurfaceAlt: '#231d0d',
        borderColor: '#45381a',
        borderLight: '#2b2310'
      }
    },
    {
      id: 'emerald',
      name: 'Menta & Esmeralda',
      desc: 'Tiempo Ordinario y Esperanza: menta fresca pastel en claro y esmeralda neón en oscuro',
      previewLight: '#ccfbf1',
      previewDark: '#10b981',
      light: {
        primary: '#0d9488',
        primaryHover: '#0f766e',
        primaryLight: '#ccfbf1',
        primaryText: '#ffffff',
        accent: '#059669',
        bgApp: '#f4faf8',
        bgSurface: '#ffffff',
        bgSurfaceAlt: '#e8f6f2',
        borderColor: '#c4eae0',
        borderLight: '#daf3ec'
      },
      dark: {
        primary: '#10b981',
        primaryHover: '#059669',
        primaryLight: 'rgba(16, 185, 129, 0.25)',
        primaryText: '#022c22',
        accent: '#34d399',
        bgApp: '#030f0a',
        bgSurface: '#071f16',
        bgSurfaceAlt: '#0d3425',
        borderColor: '#14533e',
        borderLight: '#0e3b2c'
      }
    },
    {
      id: 'sky',
      name: 'Azul Cielo & Cobalto',
      desc: 'Mariano y Paz: azul brisa pastel en claro y cobalto eléctrico de alto contraste en oscuro',
      previewLight: '#e0f2fe',
      previewDark: '#38bdf8',
      light: {
        primary: '#0284c7',
        primaryHover: '#0369a1',
        primaryLight: '#e0f2fe',
        primaryText: '#ffffff',
        accent: '#3b82f6',
        bgApp: '#f5f9fc',
        bgSurface: '#ffffff',
        bgSurfaceAlt: '#e7f2fa',
        borderColor: '#cde3f5',
        borderLight: '#dff0fc'
      },
      dark: {
        primary: '#38bdf8',
        primaryHover: '#0ea5e9',
        primaryLight: 'rgba(56, 189, 248, 0.25)',
        primaryText: '#082f49',
        accent: '#60a5fa',
        bgApp: '#040d1a',
        bgSurface: '#081a33',
        bgSurfaceAlt: '#0e294f',
        borderColor: '#134079',
        borderLight: '#0d2d55'
      }
    },
    {
      id: 'purple',
      name: 'Lavanda & Amatista',
      desc: 'Cuaresma y Sabiduría: lavanda floral pastel en claro y violeta neón ultra-luminoso en oscuro',
      previewLight: '#ede9fe',
      previewDark: '#c084fc',
      light: {
        primary: '#7c3aed',
        primaryHover: '#6d28d9',
        primaryLight: '#ede9fe',
        primaryText: '#ffffff',
        accent: '#9333ea',
        bgApp: '#faf7fd',
        bgSurface: '#ffffff',
        bgSurfaceAlt: '#f3ecfc',
        borderColor: '#e1d4f8',
        borderLight: '#eee5fd'
      },
      dark: {
        primary: '#c084fc',
        primaryHover: '#a855f7',
        primaryLight: 'rgba(192, 132, 252, 0.25)',
        primaryText: '#3b0764',
        accent: '#a855f7',
        bgApp: '#0d0517',
        bgSurface: '#1a0b2e',
        bgSurfaceAlt: '#291249',
        borderColor: '#4a1d82',
        borderLight: '#34145c'
      }
    },
    {
      id: 'rose',
      name: 'Rosa Palo & Rubí Neón',
      desc: 'Alegría y Gaudete: rosa palo pastel delicado en claro y fucsia / rubí neón intenso en oscuro',
      previewLight: '#ffe4e6',
      previewDark: '#fb7185',
      light: {
        primary: '#e11d48',
        primaryHover: '#be123c',
        primaryLight: '#ffe4e6',
        primaryText: '#ffffff',
        accent: '#f43f5e',
        bgApp: '#fff7f8',
        bgSurface: '#ffffff',
        bgSurfaceAlt: '#fdecee',
        borderColor: '#f8ced3',
        borderLight: '#fde4e7'
      },
      dark: {
        primary: '#fb7185',
        primaryHover: '#f43f5e',
        primaryLight: 'rgba(251, 113, 133, 0.25)',
        primaryText: '#4c0519',
        accent: '#f43f5e',
        bgApp: '#140308',
        bgSurface: '#260812',
        bgSurfaceAlt: '#3e0e1f',
        borderColor: '#661531',
        borderLight: '#470e22'
      }
    },
    {
      id: 'orange',
      name: 'Melocotón & Llama Naranja',
      desc: 'Pentecostés y Misión: melocotón pastel suave en claro y llama naranja volcánica en oscuro',
      previewLight: '#ffedd5',
      previewDark: '#fb923c',
      light: {
        primary: '#ea580c',
        primaryHover: '#c2410c',
        primaryLight: '#ffedd5',
        primaryText: '#ffffff',
        accent: '#f97316',
        bgApp: '#fef9f5',
        bgSurface: '#ffffff',
        bgSurfaceAlt: '#fcf0e4',
        borderColor: '#f5dac2',
        borderLight: '#fbe9db'
      },
      dark: {
        primary: '#fb923c',
        primaryHover: '#f97316',
        primaryLight: 'rgba(251, 146, 60, 0.25)',
        primaryText: '#431407',
        accent: '#f97316',
        bgApp: '#140802',
        bgSurface: '#261005',
        bgSurfaceAlt: '#3d1a0a',
        borderColor: '#632a10',
        borderLight: '#471d0a'
      }
    },
    {
      id: 'cyan',
      name: 'Aqua Glacial & Cian Eléctrico',
      desc: 'Bautismo y Manantial: aqua cristalina pastel en claro y cian neón láser en oscuro',
      previewLight: '#cffafe',
      previewDark: '#22d3ee',
      light: {
        primary: '#0891b2',
        primaryHover: '#0e7490',
        primaryLight: '#cffafe',
        primaryText: '#ffffff',
        accent: '#06b6d4',
        bgApp: '#f3fafb',
        bgSurface: '#ffffff',
        bgSurfaceAlt: '#e4f6f8',
        borderColor: '#bfe9ee',
        borderLight: '#d8f3f6'
      },
      dark: {
        primary: '#22d3ee',
        primaryHover: '#06b6d4',
        primaryLight: 'rgba(34, 211, 238, 0.25)',
        primaryText: '#083344',
        accent: '#06b6d4',
        bgApp: '#020f14',
        bgSurface: '#051f28',
        bgSurfaceAlt: '#093240',
        borderColor: '#10546c',
        borderLight: '#0a3b4c'
      }
    }
  ];

  function hexToHsl(hex) {
    if (!hex || typeof hex !== 'string') return { h: 38, s: 92, l: 50 };
    let c = hex.replace('#', '').trim();
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    if (c.length !== 6) return { h: 38, s: 92, l: 50 };
    const r = parseInt(c.slice(0, 2), 16) / 255;
    const g = parseInt(c.slice(2, 4), 16) / 255;
    const b = parseInt(c.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h = Math.round(h * 60);
    }
    return { h, s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  function computeCustomThemePalette(hex) {
    const { h, s } = hexToHsl(hex);
    return {
      id: 'custom',
      name: 'Personalizado',
      desc: 'Color elegido por el usuario con adaptación pastel en claro y neón en oscuro',
      previewLight: `hsl(${h}, 85%, 93%)`,
      previewDark: `hsl(${h}, 100%, 62%)`,
      light: {
        primary: `hsl(${h}, ${Math.min(s, 72)}%, 40%)`,
        primaryHover: `hsl(${h}, ${Math.min(s, 78)}%, 32%)`,
        primaryLight: `hsl(${h}, 85%, 93%)`,
        primaryText: '#ffffff',
        accent: `hsl(${(h + 15) % 360}, ${Math.min(s, 70)}%, 46%)`,
        bgApp: `hsl(${h}, 25%, 98.4%)`,
        bgSurface: '#ffffff',
        bgSurfaceAlt: `hsl(${h}, 30%, 96.5%)`,
        borderColor: `hsl(${h}, 22%, 88%)`,
        borderLight: `hsl(${h}, 25%, 93%)`
      },
      dark: {
        primary: `hsl(${h}, 100%, 62%)`,
        primaryHover: `hsl(${h}, 100%, 50%)`,
        primaryLight: `hsla(${h}, 100%, 62%, 0.25)`,
        primaryText: '#050914',
        accent: `hsl(${(h + 15) % 360}, 100%, 65%)`,
        bgApp: `hsl(${h}, 50%, 4%)`,
        bgSurface: `hsl(${h}, 45%, 8%)`,
        bgSurfaceAlt: `hsl(${h}, 40%, 13%)`,
        borderColor: `hsl(${h}, 35%, 26%)`,
        borderLight: `hsl(${h}, 30%, 18%)`
      }
    };
  }

  function applyTheme(themeName) {
    document.body.classList.remove('theme-light', 'theme-dark');
    document.body.classList.add(`theme-${themeName}`);
    state.settings.theme = themeName;

    const themeToggleText = document.querySelector('.theme-text');
    if (themeToggleText) {
      themeToggleText.textContent = themeName === 'dark' ? 'Modo Oscuro' : 'Modo Claro';
    }

    updateSettingsAppearanceUI();
  }

  function applyColorPalette(paletteId = 'amber', customHex = '#d97706', bgStyle = 'tinted') {
    state.settings.colorPalette = paletteId;
    state.settings.customColor = customHex;
    state.settings.backgroundStyle = bgStyle;

    let palette = paletteId === 'custom' 
      ? computeCustomThemePalette(customHex)
      : (APP_COLOR_PALETTES.find(p => p.id === paletteId) || APP_COLOR_PALETTES[0]);

    // Generar o actualizar elemento <style id="pastoral-dynamic-theme">
    let styleEl = document.getElementById('pastoral-dynamic-theme');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'pastoral-dynamic-theme';
      document.head.appendChild(styleEl);
    }

    const lightVars = palette.light;
    const darkVars = palette.dark;

    const lightBgApp = bgStyle === 'neutral' ? '#f8fafc' : lightVars.bgApp;
    const lightSurfaceAlt = bgStyle === 'neutral' ? '#f1f5f9' : lightVars.bgSurfaceAlt;
    const lightBorder = bgStyle === 'neutral' ? '#e2e8f0' : lightVars.borderColor;

    const darkBgApp = bgStyle === 'neutral' ? '#090d16' : darkVars.bgApp;
    const darkSurface = bgStyle === 'neutral' ? '#0f172a' : darkVars.bgSurface;
    const darkSurfaceAlt = bgStyle === 'neutral' ? '#1e293b' : darkVars.bgSurfaceAlt;
    const darkBorder = bgStyle === 'neutral' ? '#334155' : darkVars.borderColor;

    styleEl.textContent = `
      body.theme-light {
        --primary: ${lightVars.primary} !important;
        --primary-hover: ${lightVars.primaryHover} !important;
        --primary-light: ${lightVars.primaryLight} !important;
        --primary-text: ${lightVars.primaryText} !important;
        --accent: ${lightVars.accent} !important;
        --bg-app: ${lightBgApp} !important;
        --bg-surface: ${lightVars.bgSurface} !important;
        --bg-surface-alt: ${lightSurfaceAlt} !important;
        --bg-surface-elevated: #ffffff !important;
        --border-color: ${lightBorder} !important;
        --border-light: ${lightVars.borderLight} !important;
      }

      body.theme-dark {
        --primary: ${darkVars.primary} !important;
        --primary-hover: ${darkVars.primaryHover} !important;
        --primary-light: ${darkVars.primaryLight} !important;
        --primary-text: ${darkVars.primaryText} !important;
        --accent: ${darkVars.accent} !important;
        --bg-app: ${darkBgApp} !important;
        --bg-surface: ${darkSurface} !important;
        --bg-surface-alt: ${darkSurfaceAlt} !important;
        --bg-surface-elevated: ${darkSurfaceAlt} !important;
        --border-color: ${darkBorder} !important;
        --border-light: ${darkVars.borderLight} !important;
      }
    `;

    updateSettingsAppearanceUI();
  }

  function updateSettingsAppearanceUI() {
    const currentTheme = state.settings.theme || 'light';
    const currentPalette = state.settings.colorPalette || 'amber';
    const customColor = state.settings.customColor || '#d97706';
    const currentBgStyle = state.settings.backgroundStyle || 'tinted';

    // Segmented modo del sistema (Claro / Oscuro)
    const btnLight = document.getElementById('btn-choice-light');
    const btnDark = document.getElementById('btn-choice-dark');
    if (btnLight && btnDark) {
      btnLight.classList.toggle('active', currentTheme === 'light');
      btnDark.classList.toggle('active', currentTheme === 'dark');
    }

    // Grid de paletas
    const grid = document.getElementById('color-palettes-grid');
    if (grid) {
      grid.innerHTML = APP_COLOR_PALETTES.map(p => {
        const isActive = currentPalette === p.id;
        return `
          <div class="palette-card-option ${isActive ? 'active' : ''}" data-palette-id="${p.id}">
            <div class="palette-dual-swatch">
              <div class="swatch-pastel" style="background:${p.previewLight};" title="Tono Pastel en Modo Claro">☀️ Pastel</div>
              <div class="swatch-bold" style="background:${p.previewDark};" title="Tono Fuerte en Modo Oscuro">🌙 Fuerte</div>
            </div>
            <div class="palette-info">
              <div class="palette-info-title">
                <div class="palette-title-left">
                  <span class="palette-color-dot" style="background:${p.previewDark};"></span>
                  <span>${escapeHtml(p.name)}</span>
                </div>
                <span class="palette-active-pill">✓ Activo</span>
              </div>
              <p class="palette-info-desc">${escapeHtml(p.desc)}</p>
            </div>
          </div>
        `;
      }).join('');

      grid.querySelectorAll('.palette-card-option').forEach(card => {
        card.addEventListener('click', () => {
          const palId = card.dataset.paletteId;
          applyColorPalette(palId, state.settings.customColor, state.settings.backgroundStyle);
          persistData();
          const chosen = APP_COLOR_PALETTES.find(x => x.id === palId);
          if (chosen) showToast(`Paleta "${chosen.name}" activada`, 'info');
        });
      });
    }

    // Color picker
    const pickerBox = document.getElementById('custom-color-picker-box');
    const pickerInput = document.getElementById('settings-custom-color-input');
    const hexLabel = document.getElementById('custom-color-hex-label');

    if (pickerBox) pickerBox.classList.toggle('active', currentPalette === 'custom');
    if (pickerInput && pickerInput.value.toLowerCase() !== customColor.toLowerCase()) {
      pickerInput.value = customColor;
    }
    if (hexLabel) hexLabel.textContent = customColor.toUpperCase();

    // Actualizar fichas de vista previa del color personalizado
    const chipLight = document.getElementById('custom-chip-light');
    const chipDark = document.getElementById('custom-chip-dark');
    if (chipLight || chipDark) {
      const customThemeObj = computeCustomThemePalette(customColor);
      if (chipLight) {
        chipLight.style.background = customThemeObj.previewLight;
        chipLight.style.color = '#1e293b';
        chipLight.style.borderColor = customThemeObj.light.borderColor;
      }
      if (chipDark) {
        chipDark.style.background = customThemeObj.previewDark;
        chipDark.style.color = '#050914';
        chipDark.style.borderColor = customThemeObj.previewDark;
      }
    }

    // Estilo de fondo
    document.querySelectorAll('#settings-bg-style-control .segmented-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.bgStyle === currentBgStyle);
    });
  }

  // ========================================================
  // NAVEGACIÓN ENTRE VISTAS
  // ========================================================

  const navButtons = document.querySelectorAll('.sidebar-nav .nav-item');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetView = btn.dataset.view;
      switchView(targetView);
    });
  });

  // Tarjetas clickeables del dashboard
  document.querySelectorAll('.stat-card').forEach(card => {
    card.addEventListener('click', () => {
      const target = card.dataset.goto;
      if (target) switchView(target);
    });
  });

  function switchView(viewName) {
    currentView = viewName;

    // Actualizar botones de navegación
    navButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Ocultar todas las vistas y mostrar la activa
    document.querySelectorAll('.view-panel').forEach(panel => {
      panel.classList.remove('active');
    });

    const activePanel = document.getElementById(`view-${viewName}`);
    if (activePanel) {
      activePanel.classList.add('active');
    }

    // Renderizado según la vista
    switch (viewName) {
      case 'dashboard':
        renderDashboard();
        break;
      case 'notes':
        renderNotes();
        break;
      case 'events':
        renderCalendar();
        break;
      case 'tasks':
        renderTasks();
        break;
      case 'community':
        renderCommunity();
        break;
      case 'liturgical-scripts':
        renderLiturgicalScriptsView();
        break;
      case 'songbook':
        renderSongbookView();
        break;
      case 'ai-chat':
        renderAiChatView();
        break;
      case 'settings':
        renderSettingsView();
        break;
    }
  }

  // ========================================================
  // VISTA 1: DASHBOARD (INICIO)
  // ========================================================

  function renderDashboard() {
    // 1. Liturgia
    const litInfo = LiturgicalCalendar.getLiturgicalInfo(new Date());
    const ribbonColor = document.getElementById('liturgical-ribbon-color');
    const seasonBadge = document.getElementById('dash-liturgical-season');
    const colorLabel = document.getElementById('dash-liturgical-color');
    const celebTitle = document.getElementById('dash-liturgical-celebration');
    const upcomingP = document.getElementById('dash-liturgical-upcoming');

    if (ribbonColor) ribbonColor.style.backgroundColor = litInfo.colorHex;
    if (seasonBadge) seasonBadge.textContent = litInfo.season;
    if (colorLabel) colorLabel.textContent = `Color Litúrgico: ${litInfo.color}`;
    if (celebTitle) celebTitle.textContent = litInfo.celebration;
    if (upcomingP) {
      if (litInfo.upcoming) {
        upcomingP.textContent = `Próxima solemnidad: ${litInfo.upcoming.name} (en ${litInfo.upcoming.daysLeft} días)`;
      } else {
        upcomingP.textContent = 'Caminando en la fe y la oración';
      }
    }

    // 2. Saludo según la hora
    const now = new Date();
    const hour = now.getHours();
    let greeting = '¡Buenos días!';
    if (hour >= 12 && hour < 19) greeting = '¡Buenas tardes!';
    else if (hour >= 19 || hour < 5) greeting = '¡Buenas noches!';

    const greetingTitle = document.getElementById('dash-greeting-title');
    const greetingSubtitle = document.getElementById('dash-greeting-subtitle');
    if (greetingTitle) {
      greetingTitle.textContent = `${greeting} ${state.settings.pastorName || ''}`.trim();
    }
    if (greetingSubtitle) {
      const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      const dateFormatted = now.toLocaleDateString('es-ES', options);
      greetingSubtitle.textContent = dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1);
    }

    // 3. Versículo del día
    const verseText = document.getElementById('dash-verse-text');
    const verseRef = document.getElementById('dash-verse-ref');
    if (verseText && litInfo.verse) verseText.textContent = `"${litInfo.verse.text}"`;
    if (verseRef && litInfo.verse) verseRef.textContent = litInfo.verse.ref;

    // 4. Santo del Día e Historia (Estilo ePrex - Ciclo de 24 horas)
    loadSaintOfTheDay(false);

    // 4.1. Evangelio del Día y Oración de la Mañana Escolar
    loadDailyReadings(false);

    // 5. Estadísticas
    const notesCount = (state.notes || []).length;
    const eventsCount = (state.events || []).length;
    const tasksCount = (state.tasks || []).filter(t => !t.done).length;
    const personsCount = (state.persons || []).length + (state.groups || []).length;

    const statNotes = document.getElementById('dash-stat-notes');
    const statEvents = document.getElementById('dash-stat-events');
    const statTasks = document.getElementById('dash-stat-tasks');
    const statPersons = document.getElementById('dash-stat-persons');

    if (statNotes) statNotes.textContent = notesCount;
    if (statEvents) statEvents.textContent = eventsCount;
    if (statTasks) statTasks.textContent = tasksCount;
    if (statPersons) statPersons.textContent = personsCount;

    // 5. Próximos eventos inmediatos (los siguientes 5 eventos desde hoy)
    const eventsList = document.getElementById('dash-events-list');
    if (eventsList) {
      const todayStr = now.toISOString().split('T')[0];
      const futureEvents = (state.events || [])
        .filter(e => e.date >= todayStr)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 4);

      if (futureEvents.length === 0) {
        eventsList.innerHTML = '<div class="empty-state-micro">No hay eventos próximos agendados</div>';
      } else {
        eventsList.innerHTML = futureEvents.map(e => `
          <div class="dash-list-item">
            <div>
              <strong>${escapeHtml(e.title)}</strong>
              <div style="font-size:0.75rem; color:var(--text-muted);">
                📅 ${e.date} ${e.time ? '⏰ ' + e.time : ''} ${e.location ? '📍 ' + escapeHtml(e.location) : ''}
              </div>
            </div>
            <span class="legend-chip cat-${escapeHtml((e.category || 'otro').toLowerCase())}">${escapeHtml(e.category || 'Otro')}</span>
          </div>
        `).join('');
      }
    }

    // 6. Tareas pendientes urgentes
    const tasksList = document.getElementById('dash-tasks-list');
    if (tasksList) {
      const pending = (state.tasks || [])
        .filter(t => !t.done)
        .sort((a, b) => {
          if (!a.due) return 1;
          if (!b.due) return -1;
          return a.due.localeCompare(b.due);
        })
        .slice(0, 4);

      if (pending.length === 0) {
        tasksList.innerHTML = '<div class="empty-state-micro">¡Al día! No hay tareas pendientes</div>';
      } else {
        tasksList.innerHTML = pending.map(t => `
          <div class="dash-list-item">
            <div style="display:flex; align-items:center; gap:8px;">
              <input type="checkbox" class="task-checkbox" data-task-id="${t.id}">
              <span>${escapeHtml(t.title)}</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              ${t.due ? `<span style="font-size:0.75rem; color:var(--text-muted);">${t.due}</span>` : ''}
              <span class="priority-badge priority-${t.priority}">${t.priority}</span>
            </div>
          </div>
        `).join('');

        // Listener en checkboxes rápidos
        tasksList.querySelectorAll('.task-checkbox').forEach(cb => {
          cb.addEventListener('change', (e) => {
            const id = e.target.dataset.taskId;
            toggleTaskDone(id);
          });
        });
      }
    }

    // 7. Últimas notas
    const notesContainer = document.getElementById('dash-recent-notes');
    if (notesContainer) {
      const recent = (state.notes || []).slice(0, 3);
      if (recent.length === 0) {
        notesContainer.innerHTML = '<div class="empty-state-micro">Sin notas registradas aún</div>';
      } else {
        notesContainer.innerHTML = recent.map(n => `
          <div class="note-card" style="padding:14px; cursor:pointer;" data-open-note="${n.id}">
            <div class="note-card-header">
              <h4 class="note-title" style="font-size:0.95rem;">${escapeHtml(n.title)}</h4>
            </div>
            <div class="note-body-preview" style="-webkit-line-clamp:3; font-size:0.82rem;">${window.renderMarkdown(n.body)}</div>
            <div class="note-card-footer" style="padding-top:8px;">
              <span>${n.createdAt ? n.createdAt.split('T')[0] : ''}</span>
              <span style="font-size:0.7rem; color:var(--primary);">${(n.tags || []).join(', ')}</span>
            </div>
          </div>
        `).join('');

        notesContainer.querySelectorAll('[data-open-note]').forEach(el => {
          el.addEventListener('click', () => {
            const id = el.dataset.openNote;
            const note = state.notes.find(x => x.id === id);
            if (note) openNoteViewerModal(note);
          });
        });
      }
    }
  }

  // ========================================================
  // SANTORAL Y SANTO DEL DÍA (ESTILO EPREX - CICLO DE 24 HORAS)
  // ========================================================

  let isSaintLoading = false;

  function cleanSaintText(str) {
    if (!str) return '';
    return String(str)
      .replace(/&iquest;?/gi, '¿')
      .replace(/&iexcl;?/gi, '¡')
      .replace(/&laquo;?/gi, '«')
      .replace(/&raquo;?/gi, '»')
      .replace(/&nbsp;?/gi, ' ')
      .replace(/&aacute;?/gi, 'á')
      .replace(/&eacute;?/gi, 'é')
      .replace(/&iacute;?/gi, 'í')
      .replace(/&oacute;?/gi, 'ó')
      .replace(/&uacute;?/gi, 'ú')
      .replace(/&ntilde;?/gi, 'ñ')
      .replace(/&Aacute;?/gi, 'Á')
      .replace(/&Eacute;?/gi, 'É')
      .replace(/&Iacute;?/gi, 'Í')
      .replace(/&Oacute;?/gi, 'Ó')
      .replace(/&Uacute;?/gi, 'Ú')
      .replace(/&Ntilde;?/gi, 'Ñ')
      .replace(/&#191;/g, '¿')
      .replace(/&#161;/g, '¡')
      .replace(/&#([0-9]{1,7});/g, (_, code) => {
        try { return String.fromCharCode(parseInt(code, 10)); } catch (_) { return ''; }
      });
  }

  function cleanScriptureText(str) {
    if (!str) return '';
    const cleaned = cleanSaintText(str);
    return cleaned
      .split(/\r?\n/)
      .filter(line => {
        const l = line.trim().toLowerCase();
        if (!l) return true;
        if (l.includes('evangeliodeldia.org') || l.includes('evangelizo.org')) return false;
        if (l.includes('para recibir cada mañana') || l.includes('para recibir el evangelio')) return false;
        if (l.includes('extraído de la biblia') || l.includes('libro del pueblo de dios')) return false;
        if (l.includes('registrarse:') || l.includes('por correo electrónico, registrarse') || l.includes('registrarse')) return false;
        if (l.startsWith('fuente:') || l.includes('copyright') || l.includes('todos los derechos reservados')) return false;
        return true;
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function getTodayDateKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function isSaintCacheValid(cache) {
    if (!cache || !cache.dateKey || !cache.name || !cache.history) return false;
    // Si la caché guardada carece de imageUrl o tiene URL remota http no convertida a base64,
    // o contiene entidades sin decodificar (como &iquest;) o supera 1800 caracteres,
    // invalidar para cargar de inmediato la nueva versión abreviada, limpia y con arte sacro en base64
    if (cache.imageUrl === undefined || (cache.imageUrl && cache.imageUrl.startsWith('http')) || cache.history.includes('&iquest;') || cache.martirology?.includes('&iquest;') || cache.history.length > 1800) {
      return false;
    }
    const todayKey = getTodayDateKey();
    if (cache.dateKey !== todayKey) return false;
    const now = Date.now();
    const ageMs = now - (cache.timestamp || 0);
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    return ageMs >= 0 && ageMs < ONE_DAY_MS;
  }

  async function loadSaintOfTheDay(force = false) {
    const cached = state.saintOfTheDay;

    // Regla de 24 horas: si la caché es válida (< 24 horas y misma fecha) y no es forzado,
    // NO se vuelve a buscar al abrir y cerrar la app.
    if (!force && isSaintCacheValid(cached)) {
      renderSaintCard(cached, true);
      return;
    }

    if (isSaintLoading) return;
    isSaintLoading = true;

    const historyElem = document.getElementById('saint-history-content');
    if (!cached || force) {
      if (historyElem) historyElem.innerHTML = '<p class="saint-loading-text" style="color:var(--text-muted); font-style:italic;">Consultando santoral del día...</p>';
    }

    try {
      const res = await window.pastoral.saints.getSaintOfTheDay({ force });
      if (res && res.success && res.saint) {
        state.saintOfTheDay = res.saint;
        persistData();
        renderSaintCard(res.saint, res.cached);
      } else if (cached) {
        renderSaintCard(cached, true);
      } else if (historyElem) {
        historyElem.innerHTML = '<p style="color:var(--text-muted); font-style:italic;">No se pudo sincronizar el santoral. Haz clic en "Actualizar" para reintentar.</p>';
      }
    } catch (err) {
      console.warn('[app] Error cargando santo del día:', err);
      if (cached) {
        renderSaintCard(cached, true);
      } else if (historyElem) {
        historyElem.innerHTML = '<p style="color:var(--text-muted); font-style:italic;">No se pudo conectar con el servicio litúrgico. Haz clic en "Actualizar" para reintentar.</p>';
      }
    } finally {
      isSaintLoading = false;
    }
  }

  function renderSaintCard(saint, fromCache = true) {
    if (!saint) return;

    const nameElem = document.getElementById('saint-name');
    const titleElem = document.getElementById('saint-title-rank');
    const dateElem = document.getElementById('saint-card-date');
    const cacheBadge = document.getElementById('saint-card-cache-badge');
    const martirologyBox = document.getElementById('saint-martirology-box');
    const martirologyElem = document.getElementById('saint-martirology');
    const historyElem = document.getElementById('saint-history-content');
    const quoteBanner = document.getElementById('saint-quote-banner');
    const quoteElem = document.getElementById('saint-quote-text');
    const toggleBtn = document.getElementById('btn-toggle-saint-history');
    const imgContainer = document.getElementById('saint-image-container');
    const portraitImg = document.getElementById('saint-portrait-img');
    const avatarFallback = document.getElementById('saint-avatar-fallback');
    const viewImgBtn = document.getElementById('btn-view-saint-image');

    // Retrato sagrado o imagen del Santo
    if (portraitImg && avatarFallback) {
      if (saint.imageUrl) {
        const showImage = () => {
          portraitImg.style.display = 'block';
          avatarFallback.style.display = 'none';
          if (viewImgBtn) viewImgBtn.style.display = 'inline-flex';
          if (imgContainer) {
            imgContainer.style.cursor = 'pointer';
            imgContainer.title = 'Haz clic para ampliar la imagen sagrada';
          }
        };

        portraitImg.onload = showImage;
        portraitImg.onerror = () => {
          portraitImg.style.display = 'none';
          avatarFallback.style.display = 'flex';
          if (viewImgBtn) viewImgBtn.style.display = 'none';
          if (imgContainer) {
            imgContainer.style.cursor = 'default';
            imgContainer.title = cleanSaintText(saint.name || 'Santo del Día');
          }
        };
        portraitImg.src = saint.imageUrl;

        // Si la imagen ya se decodificó de inmediato desde el Data URI base64
        if (portraitImg.complete && portraitImg.naturalWidth > 0) {
          showImage();
        }
      } else {
        portraitImg.style.display = 'none';
        avatarFallback.style.display = 'flex';
        if (viewImgBtn) viewImgBtn.style.display = 'none';
        if (imgContainer) {
          imgContainer.style.cursor = 'default';
          imgContainer.title = cleanSaintText(saint.name || 'Santo del Día');
        }
      }
    }

    // Nombre y título
    if (nameElem) nameElem.textContent = cleanSaintText(saint.name || 'Santo del Día');
    if (titleElem) titleElem.textContent = cleanSaintText(saint.title || 'Liturgia de la Iglesia Católica');

    // Fecha legible
    if (dateElem) {
      const now = new Date();
      const options = { day: 'numeric', month: 'long' };
      dateElem.textContent = now.toLocaleDateString('es-ES', options);
    }

    // Indicador del ciclo de 24 horas
    if (cacheBadge) {
      if (fromCache) {
        cacheBadge.textContent = '✓ Guardado (ciclo 24h)';
        cacheBadge.style.color = 'var(--success)';
        cacheBadge.title = 'Datos guardados. No se volverá a consultar hasta transcurrir 24 horas.';
      } else {
        cacheBadge.textContent = '✨ Recién actualizado';
        cacheBadge.style.color = 'var(--primary)';
        cacheBadge.title = 'Actualizado ahora. Válido por 24 horas.';
      }
    }

    // Martirologio Romano
    if (martirologyElem && martirologyBox) {
      const martText = cleanSaintText(saint.martirology || '');
      if (martText.trim()) {
        martirologyElem.textContent = martText;
        martirologyBox.style.display = 'block';
      } else {
        martirologyBox.style.display = 'none';
      }
    }

    // Reseña biográfica ("Un poco de su historia")
    if (historyElem) {
      const historyText = cleanSaintText(saint.history || saint.martirology || 'No se dispone de reseña histórica detallada para este día.');
      const paragraphs = historyText.split('\n\n').filter(p => p.trim());
      historyElem.innerHTML = paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('');
      // Inicia colapsado con fade-out al estilo ePrex
      historyElem.classList.add('collapsed');
      if (toggleBtn) {
        toggleBtn.innerHTML = '<span>📖 Leer historia completa</span>';
      }
    }

    // Frase o reflexión espiritual
    if (quoteBanner && quoteElem) {
      const qText = cleanSaintText(saint.quote || '');
      if (qText.trim()) {
        quoteElem.textContent = `«${qText}»`;
        quoteBanner.style.display = 'flex';
      } else {
        quoteBanner.style.display = 'none';
      }
    }
  }

  // Toggle expandir / contraer historia del Santo
  document.getElementById('btn-toggle-saint-history')?.addEventListener('click', () => {
    const historyElem = document.getElementById('saint-history-content');
    const toggleBtn = document.getElementById('btn-toggle-saint-history');
    if (!historyElem || !toggleBtn) return;

    const isCollapsed = historyElem.classList.toggle('collapsed');
    toggleBtn.innerHTML = isCollapsed
      ? '<span>📖 Leer historia completa</span>'
      : '<span>▲ Ver menos</span>';
  });

  // Copiar reseña al portapapeles
  document.getElementById('btn-copy-saint-history')?.addEventListener('click', () => {
    const saint = state.saintOfTheDay;
    if (!saint) {
      showToast('No hay reseña disponible para copiar', 'warning');
      return;
    }

    const cleanName = cleanSaintText(saint.name);
    const cleanTitle = cleanSaintText(saint.title || 'Santoral Católico');
    const cleanMart = cleanSaintText(saint.martirology || '');
    const cleanHist = cleanSaintText(saint.history || '');
    const cleanQuote = cleanSaintText(saint.quote || '');

    const textToCopy = [
      `🕊️ SANTO DEL DÍA: ${cleanName} (${cleanTitle})`,
      cleanMart ? `\n📖 Martirologio Romano:\n${cleanMart}` : '',
      `\n📜 Reseña Histórica:\n${cleanHist}`,
      cleanQuote ? `\n💬 Frase espiritual: «${cleanQuote}»` : ''
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(textToCopy).then(() => {
      showToast(`¡Reseña de ${cleanName} copiada al portapapeles!`, 'success');
    }).catch(() => {
      showToast('No se pudo copiar al portapapeles', 'error');
    });
  });

  // Modal para ver imagen sagrada / retrato del Santo en alta resolución
  function showSaintImageModal(saint) {
    if (!saint || !saint.imageUrl) return;
    const cleanName = cleanSaintText(saint.name || 'Santo del Día');
    const cleanTitle = cleanSaintText(saint.title || 'Santoral Católico');
    const bodyHtml = `
      <div style="text-align: center; padding: 6px 0;">
        <div style="max-height: 440px; overflow: hidden; border-radius: 12px; margin-bottom: 14px; background: rgba(0,0,0,0.3); box-shadow: 0 8px 24px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; border: 1px solid var(--border-color);">
          <img src="${escapeHtml(saint.imageUrl)}" alt="${escapeHtml(cleanName)}" style="max-width: 100%; max-height: 440px; object-fit: contain; display: block; border-radius: 12px;" onerror="this.onerror=null; this.parentElement.innerHTML='<p style=\\'color:var(--text-muted); padding:30px;\\'>No se pudo cargar la imagen en alta resolución.</p>';" />
        </div>
        <h4 style="margin: 0 0 6px 0; color: var(--text-primary); font-size: 1.15rem; font-weight: 700;">${escapeHtml(cleanName)}</h4>
        <p style="margin: 0; color: var(--text-muted); font-size: 0.88rem; font-style: italic;">${escapeHtml(cleanTitle)}</p>
      </div>
    `;
    openGenericModal({
      title: 'Arte Sacro - Retrato del Santo',
      bodyHtml,
      onSave: () => true
    });
    if (genericModalSaveBtn) {
      genericModalSaveBtn.style.display = 'none';
    }
    if (genericModalCancelBtn) {
      genericModalCancelBtn.textContent = 'Cerrar';
    }
  }

  // Click en el retrato o en el botón para ver imagen ampliada
  document.getElementById('saint-image-container')?.addEventListener('click', () => {
    const saint = state.saintOfTheDay;
    if (saint && saint.imageUrl) {
      showSaintImageModal(saint);
    }
  });

  document.getElementById('btn-view-saint-image')?.addEventListener('click', () => {
    const saint = state.saintOfTheDay;
    if (saint && saint.imageUrl) {
      showSaintImageModal(saint);
    }
  });

  // Reflexionar con la IA sobre este santo
  document.getElementById('btn-ask-ai-saint')?.addEventListener('click', () => {
    const saint = state.saintOfTheDay;
    const name = saint ? saint.name : 'los santos de hoy';
    const title = saint && saint.title ? ` (${saint.title})` : '';

    switchView('ai-chat');
    const textarea = document.getElementById('chat-textarea');
    if (textarea) {
      textarea.value = `Cuéntame sobre la vida y virtudes de ${name}${title}, y qué lecciones prácticas podemos reflexionar y enseñar hoy a nuestra comunidad escolar en la pastoral.`;
      textarea.focus();
    }
  });

  // Botón manual de refrescar santoral
  document.getElementById('btn-refresh-saint')?.addEventListener('click', () => {
    showToast('Actualizando santoral del día...', 'info');
    loadSaintOfTheDay(true);
  });

  // ========================================================
  // EVANGELIO DEL DÍA Y ORACIÓN DE LA MAÑANA ESCOLAR
  // ========================================================

  let isGospelLoading = false;
  let activePrayerAudience = 'juvenil';
  let currentPrayerData = null;

  function isReadingCacheValid(cache) {
    if (!cache || !cache.dateKey || !cache.gospel || !cache.gospel.text) return false;
    const todayKey = getTodayDateKey();
    if (cache.dateKey !== todayKey) return false;
    const now = Date.now();
    const ageMs = now - (cache.timestamp || 0);
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    return ageMs >= 0 && ageMs < ONE_DAY_MS;
  }

  async function loadDailyReadings(force = false) {
    const cached = state.dailyReadings;

    if (!force && isReadingCacheValid(cached)) {
      renderGospelCard(cached, true);
      return;
    }

    if (isGospelLoading) return;
    isGospelLoading = true;

    const contentElem = document.getElementById('gospel-text-content');
    if (!cached || force) {
      if (contentElem) contentElem.innerHTML = '<p class="saint-loading-text" style="color:var(--text-muted); font-style:italic;">Consultando lecturas litúrgicas de hoy...</p>';
    }

    try {
      const res = await window.pastoral.readings.getDailyReadings({ force });
      if (res && res.success && res.readings) {
        state.dailyReadings = res.readings;
        persistData();
        renderGospelCard(res.readings, res.cached);
      } else if (cached) {
        renderGospelCard(cached, true);
      }
    } catch (err) {
      console.warn('[app] Error cargando lecturas de hoy:', err);
      if (cached) {
        renderGospelCard(cached, true);
      }
    } finally {
      isGospelLoading = false;
    }
  }

  function renderGospelCard(readings, fromCache = true) {
    if (!readings || !readings.gospel) return;

    const litTitleElem = document.getElementById('gospel-liturgic-title');
    const titleElem = document.getElementById('gospel-title');
    const quoteSnippetElem = document.getElementById('gospel-quote-snippet');
    const textContentElem = document.getElementById('gospel-text-content');
    const cacheBadge = document.getElementById('gospel-cached-badge');
    const toggleBtn = document.getElementById('btn-toggle-gospel-text');

    if (litTitleElem) litTitleElem.textContent = cleanScriptureText(readings.liturgicTitle || 'Tiempo Ordinario');
    if (titleElem) titleElem.textContent = cleanScriptureText(readings.gospel.title || 'Evangelio del Día');
    if (quoteSnippetElem) quoteSnippetElem.textContent = cleanScriptureText(readings.gospel.shortText || 'Palabra del Señor');

    if (cacheBadge) {
      if (fromCache) {
        cacheBadge.textContent = '✓ Guardado (ciclo 24h)';
        cacheBadge.style.color = 'var(--success)';
      } else {
        cacheBadge.textContent = '✨ Recién actualizado';
        cacheBadge.style.color = 'var(--primary)';
      }
    }

    if (textContentElem) {
      const text = cleanScriptureText(readings.gospel.text || '');
      const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
      textContentElem.innerHTML = paragraphs.map(p => `<p>${escapeHtml(p.trim())}</p>`).join('');
      textContentElem.classList.add('collapsed');
      if (toggleBtn) toggleBtn.innerHTML = '<span>📖 Leer Evangelio completo</span>';
    }
  }

  // Toggle expandir / contraer texto del Evangelio
  document.getElementById('btn-toggle-gospel-text')?.addEventListener('click', () => {
    const contentElem = document.getElementById('gospel-text-content');
    const toggleBtn = document.getElementById('btn-toggle-gospel-text');
    if (!contentElem || !toggleBtn) return;

    const isCollapsed = contentElem.classList.toggle('collapsed');
    toggleBtn.innerHTML = isCollapsed
      ? '<span>📖 Leer Evangelio completo</span>'
      : '<span>▲ Ver menos</span>';
  });

  // Copiar Evangelio del día
  document.getElementById('btn-copy-gospel')?.addEventListener('click', () => {
    const readings = state.dailyReadings;
    if (!readings || !readings.gospel) {
      showToast('No hay Evangelio disponible para copiar', 'warning');
      return;
    }
    const textToCopy = `📖 ${cleanScriptureText(readings.gospel.title)}\n\n${cleanScriptureText(readings.gospel.text)}\n\nPalabra del Señor. Gloria a Ti, Señor Jesús.`;
    navigator.clipboard.writeText(textToCopy).then(() => {
      showToast('¡Evangelio del día copiado al portapapeles!', 'success');
    }).catch(() => {
      showToast('Error al copiar al portapapeles', 'error');
    });
  });

  // Botón manual de refrescar Evangelio
  document.getElementById('btn-refresh-gospel')?.addEventListener('click', () => {
    showToast('Actualizando Evangelio y lecturas...', 'info');
    loadDailyReadings(true);
  });

  // Modal: Misa Completa (1ª Lectura, Salmo, Evangelio)
  function openAllReadingsModal() {
    const readings = state.dailyReadings;
    if (!readings) {
      showToast('Cargando lecturas...', 'info');
      return;
    }

    const modal = document.getElementById('daily-readings-modal');
    if (!modal) return;

    const firstTitle = document.getElementById('readings-first-title');
    const firstText = document.getElementById('readings-first-text');
    const psalmTitle = document.getElementById('readings-psalm-title');
    const psalmText = document.getElementById('readings-psalm-text');
    const gospelTitle = document.getElementById('readings-gospel-title');
    const gospelText = document.getElementById('readings-gospel-text');

    if (firstTitle) firstTitle.textContent = cleanScriptureText(readings.firstReading?.title || 'Primera Lectura');
    if (firstText) {
      const cleanFirst = cleanScriptureText(readings.firstReading?.text || 'No disponible');
      firstText.innerHTML = cleanFirst.split(/\n\s*\n/).filter(Boolean).map(p => `<p>${escapeHtml(p.trim())}</p>`).join('');
    }

    if (psalmTitle) psalmTitle.textContent = cleanScriptureText(readings.psalm?.title || 'Salmo Responsorial');
    if (psalmText) {
      const cleanPs = cleanScriptureText(readings.psalm?.text || 'No disponible');
      psalmText.innerHTML = cleanPs.split(/\n\s*\n/).filter(Boolean).map(p => `<p>${escapeHtml(p.trim())}</p>`).join('');
    }

    if (gospelTitle) gospelTitle.textContent = cleanScriptureText(readings.gospel?.title || 'Santo Evangelio');
    if (gospelText) {
      const cleanGsp = cleanScriptureText(readings.gospel?.text || '');
      gospelText.innerHTML = cleanGsp.split(/\n\s*\n/).filter(Boolean).map(p => `<p>${escapeHtml(p.trim())}</p>`).join('');
    }

    modal.style.display = 'flex';
  }

  document.getElementById('btn-view-all-readings')?.addEventListener('click', () => {
    openAllReadingsModal();
  });

  document.getElementById('daily-readings-close-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('daily-readings-modal');
    if (modal) modal.style.display = 'none';
  });

  document.getElementById('daily-readings-close-action-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('daily-readings-modal');
    if (modal) modal.style.display = 'none';
  });

  document.getElementById('daily-readings-copy-btn')?.addEventListener('click', () => {
    const r = state.dailyReadings;
    if (!r) return;
    const txt = [
      `🕊️ LECTURAS DE LA MISA: ${cleanScriptureText(r.liturgicTitle)}`,
      `\n📖 ${cleanScriptureText(r.firstReading?.title)}:\n${cleanScriptureText(r.firstReading?.text)}`,
      `\n🎵 ${cleanScriptureText(r.psalm?.title)}:\n${cleanScriptureText(r.psalm?.text)}`,
      `\n✝️ ${cleanScriptureText(r.gospel?.title)}:\n${cleanScriptureText(r.gospel?.text)}`
    ].filter(Boolean).join('\n\n');

    navigator.clipboard.writeText(txt).then(() => {
      showToast('¡Lecturas de la misa copiadas al portapapeles!', 'success');
    });
  });

  // Modal: Oración de la Mañana Escolar
  async function openMorningPrayerModal(audience = activePrayerAudience, forceRegen = false) {
    activePrayerAudience = audience;
    const modal = document.getElementById('morning-prayer-modal');
    if (!modal) return;

    modal.style.display = 'flex';

    // Actualizar botones de audiencia
    document.querySelectorAll('#prayer-audience-tabs .segmented-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.audience === audience);
    });

    const cardTitle = document.getElementById('prayer-card-title');
    const cardEcho = document.getElementById('prayer-card-gospel-echo');
    const cardRefl = document.getElementById('prayer-card-reflection');
    const cardPetitions = document.getElementById('prayer-card-petitions-list');
    const cardClosing = document.getElementById('prayer-card-closing');

    if (cardTitle) cardTitle.textContent = 'Preparando oración para el colegio...';
    if (cardRefl) cardRefl.innerHTML = '<p style="color:var(--text-muted); font-style:italic;">Consultando con el Evangelio de hoy...</p>';

    try {
      const res = await window.pastoral.readings.generateMorningPrayer({
        audience,
        gospel: state.dailyReadings?.gospel
      });

      if (res && res.success && res.prayer) {
        currentPrayerData = res.prayer;
        const p = res.prayer;

        if (cardTitle) cardTitle.textContent = cleanSaintText(p.title || 'Oración de la Mañana');
        if (cardEcho) cardEcho.textContent = cleanSaintText(p.gospelEcho || '');
        if (cardRefl) {
          const paragraphs = (p.reflection || '').split('\n\n').filter(Boolean);
          cardRefl.innerHTML = paragraphs.map(para => `<p>${escapeHtml(cleanSaintText(para))}</p>`).join('');
        }
        if (cardPetitions) {
          const list = Array.isArray(p.petitions) ? p.petitions : [];
          cardPetitions.innerHTML = list.map(item => `<li>${escapeHtml(cleanSaintText(item))}</li>`).join('');
        }
        if (cardClosing) cardClosing.textContent = cleanSaintText(p.closing || 'Amén.');
      }
    } catch (err) {
      console.warn('[app] Error generando oración matutina:', err);
      if (cardRefl) cardRefl.textContent = 'Señor Jesús, bendice nuestra jornada escolar. Haznos instrumentos de tu paz y sabiduría. Amén.';
    }
  }

  document.getElementById('btn-open-morning-prayer-modal')?.addEventListener('click', () => {
    openMorningPrayerModal('juvenil');
  });

  document.getElementById('prayer-modal-close-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('morning-prayer-modal');
    if (modal) modal.style.display = 'none';
  });

  // Selector de audiencia en modal de oración
  document.querySelectorAll('#prayer-audience-tabs .segmented-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const audience = btn.dataset.audience;
      openMorningPrayerModal(audience);
    });
  });

  // Regenerar con IA
  document.getElementById('prayer-modal-ai-regen-btn')?.addEventListener('click', () => {
    showToast('Regenerando oración con IA...', 'info');
    openMorningPrayerModal(activePrayerAudience, true);
  });

  // Copiar oración matutina
  document.getElementById('prayer-modal-copy-btn')?.addEventListener('click', () => {
    if (!currentPrayerData) {
      showToast('No hay oración disponible para copiar', 'warning');
      return;
    }
    const p = currentPrayerData;
    const petitionsTxt = (p.petitions || []).map(pet => `• ${cleanSaintText(pet)}`).join('\n');
    const fullPrayer = [
      `🕊️ ${cleanSaintText(p.title)}`,
      p.signOfCross,
      p.gospelEcho ? `\n📖 Palabra de hoy:\n«${cleanSaintText(p.gospelEcho)}»` : '',
      `\n🙏 Reflexión para la sala de clases:\n${cleanSaintText(p.reflection)}`,
      petitionsTxt ? `\n🙌 Peticiones comunitarias:\n${petitionsTxt}` : '',
      `\n✨ Cierre:\n${cleanSaintText(p.closing)}`
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(fullPrayer).then(() => {
      showToast('¡Oración de la mañana copiada al portapapeles!', 'success');
    });
  });

  // Imprimir hoja de oración para la sala de clases
  document.getElementById('prayer-modal-print-btn')?.addEventListener('click', () => {
    if (!currentPrayerData) return;
    const p = currentPrayerData;
    const printArea = document.getElementById('print-area');
    if (!printArea) return;

    const schoolName = state.settings.schoolName || 'Colegio Católico';
    const now = new Date();
    const dateFormatted = now.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    printArea.innerHTML = `
      <div style="font-family: Arial, sans-serif; padding: 30px; max-width: 750px; margin: 0 auto; color: #111;">
        <div style="text-align: center; border-bottom: 2px solid #b45309; padding-bottom: 12px; margin-bottom: 20px;">
          <h3 style="margin: 0; color: #b45309; font-size: 1.1rem; text-transform: uppercase;">${escapeHtml(schoolName)} • Pastoral Escolar</h3>
          <h1 style="margin: 8px 0; font-size: 1.6rem; color: #111;">${escapeHtml(cleanSaintText(p.title))}</h1>
          <p style="margin: 0; font-size: 0.9rem; color: #666; font-style: italic;">${dateFormatted}</p>
        </div>

        <p style="text-align: center; font-style: italic; font-weight: bold; color: #b45309; margin-bottom: 16px;">
          ${escapeHtml(cleanSaintText(p.signOfCross || 'En el nombre del Padre, y del Hijo y del Espíritu Santo. Amén.'))}
        </p>

        ${p.gospelEcho ? `
          <div style="background: #f8fafc; border-left: 4px solid #3b82f6; padding: 12px 16px; margin-bottom: 18px; font-style: italic; font-size: 1rem;">
            «${escapeHtml(cleanSaintText(p.gospelEcho))}»
          </div>
        ` : ''}

        <div style="font-size: 1.05rem; line-height: 1.7; margin-bottom: 20px;">
          ${(p.reflection || '').split('\n\n').map(para => `<p style="margin-bottom: 12px;">${escapeHtml(cleanSaintText(para))}</p>`).join('')}
        </div>

        ${Array.isArray(p.petitions) && p.petitions.length > 0 ? `
          <div style="background: #fffbeb; border: 1px solid #fde68a; padding: 14px 18px; border-radius: 8px; margin-bottom: 20px;">
            <h4 style="margin: 0 0 10px 0; color: #b45309; font-size: 1rem;">Peticiones de nuestra comunidad:</h4>
            <ul style="margin: 0; padding-left: 20px; line-height: 1.6; font-size: 1rem;">
              ${p.petitions.map(pet => `<li>${escapeHtml(cleanSaintText(pet))} (<em>R: Te lo pedimos, Señor</em>)</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        <p style="text-align: center; font-weight: bold; font-size: 1.05rem; color: #111; margin-top: 24px;">
          ${escapeHtml(cleanSaintText(p.closing || 'Padre Nuestro... Amén.'))}
        </p>
      </div>
    `;

    window.print();
  });

  // Comprobación periódica cada 30 min por si cambia el día mientras la app sigue abierta
  setInterval(() => {
    if (currentView === 'dashboard') {
      const cached = state.saintOfTheDay;
      if (!isSaintCacheValid(cached)) {
        loadSaintOfTheDay(false);
      }
    }
  }, 30 * 60 * 1000);

  // Botones de acción rápida en Dashboard
  document.getElementById('dash-btn-new-event')?.addEventListener('click', () => openEventEditorModal());
  document.getElementById('dash-btn-new-task')?.addEventListener('click', () => openTaskEditorModal());
  document.getElementById('dash-btn-new-note')?.addEventListener('click', () => openNoteEditorModal());

  // Píldoras de IA en el Dashboard
  document.querySelectorAll('.ai-prompt-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const prompt = btn.dataset.prompt;
      switchView('ai-chat');
      const textarea = document.getElementById('chat-textarea');
      if (textarea) {
        textarea.value = prompt;
        textarea.focus();
      }
    });
  });

  // ========================================================
  // VISTA 2: IDEAS Y NOTAS
  // ========================================================

  function renderNotes() {
    const container = document.getElementById('notes-cards-container');
    const searchVal = (document.getElementById('notes-search-input')?.value || '').toLowerCase().trim();
    if (!container) return;

    // Obtener y renderizar tags únicos
    renderNotesTagFilters();

    let list = state.notes || [];

    // Filtro por texto
    if (searchVal) {
      list = list.filter(n =>
        (n.title || '').toLowerCase().includes(searchVal) ||
        (n.body || '').toLowerCase().includes(searchVal)
      );
    }

    // Filtro por tag seleccionado
    if (activeTagFilter) {
      list = list.filter(n => Array.isArray(n.tags) && n.tags.includes(activeTagFilter));
    }

    if (list.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 48px 0; color: var(--text-muted);">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" opacity="0.4" style="margin-bottom: 12px;">
            <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
          </svg>
          <p>No se encontraron notas con los criterios actuales</p>
        </div>
      `;
      return;
    }

    container.innerHTML = list.map(note => {
      const tagsHtml = (note.tags || []).map(t => `<span class="note-tag">${escapeHtml(t)}</span>`).join('');
      const dateDisplay = note.updatedAt ? note.updatedAt.split('T')[0] : (note.createdAt ? note.createdAt.split('T')[0] : '');

      return `
        <div class="note-card" data-note-id="${note.id}">
          <div class="note-card-header">
            <h3 class="note-title">${escapeHtml(note.title)}</h3>
            <div class="note-actions">
              <button class="btn btn-icon btn-ghost btn-sm edit-note-btn" title="Editar">
                <svg viewBox="0 0 24 24" width="16" height="16"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
              </button>
              <button class="btn btn-icon btn-ghost btn-sm delete-note-btn" title="Eliminar">
                <svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
              </button>
            </div>
          </div>
          <div class="note-body-preview">${window.renderMarkdown(note.body)}</div>
          <div class="note-card-footer">
            <div class="note-tags-list">${tagsHtml}</div>
            <time>${dateDisplay}</time>
          </div>
        </div>
      `;
    }).join('');

    // Event listeners para editar y borrar notas desde la tarjeta
    container.querySelectorAll('.edit-note-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const card = btn.closest('.note-card');
        const id = card.dataset.noteId;
        const note = state.notes.find(n => String(n.id) === String(id));
        if (note) openNoteEditorModal(note);
      });
    });

    container.querySelectorAll('.delete-note-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const card = btn.closest('.note-card');
        const id = card.dataset.noteId;
        const note = state.notes.find(n => String(n.id) === String(id));
        openConfirmModal({
          title: 'Eliminar Nota',
          message: `¿Deseas eliminar permanentemente la nota "${note ? escapeHtml(note.title) : ''}"?`,
          confirmText: 'Eliminar',
          confirmBtnClass: 'btn-danger',
          onConfirm: () => {
            markDeleted(id);
            state.notes = state.notes.filter(n => String(n.id) !== String(id));
            persistData();
            if (window.pastoralFirebase && typeof window.pastoralFirebase.pushState === 'function') {
              window.pastoralFirebase.pushState(state, true);
            }
            renderNotes();
            renderDashboard();
            showToast('Nota eliminada con éxito', 'info');
          }
        });
      });
    });

    container.querySelectorAll('.note-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.edit-note-btn') || e.target.closest('.delete-note-btn')) return;
        const id = card.dataset.noteId;
        const note = state.notes.find(n => String(n.id) === String(id));
        if (note) openNoteViewerModal(note);
      });
    });
  }

  function renderNotesTagFilters() {
    const container = document.getElementById('notes-tag-filters');
    if (!container) return;

    // Extraer todos los tags
    const allTags = new Set();
    (state.notes || []).forEach(n => {
      if (Array.isArray(n.tags)) n.tags.forEach(t => allTags.add(t));
    });

    if (allTags.size === 0) {
      container.innerHTML = '';
      return;
    }

    let html = `<button class="tag-chip ${activeTagFilter === null ? 'active' : ''}" data-tag="ALL">Todos</button>`;
    allTags.forEach(t => {
      html += `<button class="tag-chip ${activeTagFilter === t ? 'active' : ''}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`;
    });

    container.innerHTML = html;

    container.querySelectorAll('.tag-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const tag = chip.dataset.tag;
        activeTagFilter = tag === 'ALL' ? null : tag;
        renderNotes();
      });
    });
  }

  // Búsqueda en vivo de notas
  document.getElementById('notes-search-input')?.addEventListener('input', () => {
    renderNotes();
  });

  // Botón Nueva Nota
  document.getElementById('btn-create-note')?.addEventListener('click', () => {
    openNoteEditorModal();
  });

  // Menú de Plantillas
  const templateBtn = document.getElementById('notes-template-btn');
  const templateMenu = document.getElementById('notes-template-menu');
  if (templateBtn && templateMenu) {
    templateBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      templateBtn.parentElement.classList.toggle('open');
    });

    document.addEventListener('click', () => {
      templateBtn.parentElement.classList.remove('open');
    });

    templateMenu.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        const templateType = item.dataset.template;
        loadNoteTemplate(templateType);
      });
    });
  }

  function loadNoteTemplate(type) {
    const today = new Date().toISOString().split('T')[0];
    let noteData = {
      title: '',
      body: '',
      tags: []
    };

    switch (type) {
      case 'reunion':
        noteData = {
          title: `Reunión de Pastoral - ${today}`,
          body: `## Reunión del Equipo de Pastoral
**Fecha:** ${today}
**Lugar:** Sala de Pastoral
**Asistentes:** 

### 1. Oración Inicial
> *"Donde dos o tres se reúnen en mi nombre, allí estoy yo en medio de ellos." (Mt 18, 20)*

### 2. Puntos Tratados
1. 
2. 

### 3. Acuerdos y Responsables
- [ ] Tarea 1 (Responsable: )
- [ ] Tarea 2 (Responsable: )

### 4. Oración de Cierre
Invocación a Santo Domingo de Guzmán y bendición final.`,
          tags: ['Reunión', 'Equipo', 'Planificación']
        };
        break;

      case 'ficha':
        noteData = {
          title: 'Ficha de Acompañamiento Personal',
          body: `## Ficha de Acompañamiento
**Nombre del Estudiante / Joven:** 
**Curso / Grupo:** 
**Fecha de Encuentro:** ${today}

### Motivo o Inquietud Pastoral
- 

### Compromisos y Metas de Vida
- 

### Próximo Encuentro Programado
- Fecha tentativa: `,
          tags: ['Acompañamiento', 'Comunidad']
        };
        break;

      case 'acta':
        noteData = {
          title: `Acta de Consejo Escolar - ${today}`,
          body: `## Acta Oficial de Consejo Pastoral
**Fecha:** ${today}
**Hora de Inicio:** 
**Hora de Término:** 
**Preside:** ${state.settings.pastorName || 'Encargado de Pastoral'}

### Orden del Día
1. Aprobación del acta anterior.
2. Evaluación de las actividades de fe y liturgia.
3. Organización de próximas campañas solidarias.

### Deliberaciones y Acuerdos
- 

### Firmas
________________________            ________________________
Encargado de Pastoral                Representante de Profesores`,
          tags: ['Acta', 'Consejo']
        };
        break;

      case 'retiro':
        noteData = {
          title: 'Planificación de Retiro Espiritual',
          body: `## Plan de Retiro Espiritual
**Lema:** *"Contemplar y dar a los demás lo contemplado"*
**Destinatarios:** 
**Lugar:** 
**Fechas:** 

### Cronograma General
- **08:30** - Llegada, acogida y bienvenida
- **09:00** - Oración comunitaria y animación
- **10:00** - Charla 1: 
- **11:00** - Trabajo personal en desierto
- **12:30** - Plenario y compartir fraterno
- **13:30** - Almuerzo
- **15:00** - Dinámica de profundización
- **16:30** - Adoración al Santísimo y Confesiones
- **18:00** - Santa Misa de Clausura

### Materiales y Recursos Necesarios
- Guías impresas, cuadernos de retiro, equipo de sonido, velas, cirio pascual.`,
          tags: ['Retiro', 'Espiritualidad', 'Formación']
        };
        break;
    }

    openNoteEditorModal(noteData);
  }

  // ========================================================
  // VISOR DE NOTAS (MARKDOWN NATIVO Y CHECKLISTS VIVAS)
  // ========================================================

  let currentViewingNoteId = null;

  function openNoteViewerModal(note) {
    if (!note) return;
    currentViewingNoteId = note.id;

    const modal = document.getElementById('note-viewer-modal');
    if (!modal) return;

    const titleEl = document.getElementById('note-viewer-title');
    const dateEl = document.getElementById('note-viewer-date');
    const tagsEl = document.getElementById('note-viewer-tags');

    if (titleEl) titleEl.textContent = note.title || 'Sin título';
    if (dateEl) {
      const dt = note.updatedAt || note.createdAt;
      dateEl.textContent = dt ? new Date(dt).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
    }
    if (tagsEl) {
      tagsEl.innerHTML = (note.tags || []).map(t => `<span class="note-tag">${escapeHtml(t)}</span>`).join('');
    }

    renderNoteViewerContent(note);

    modal.style.display = 'flex';
  }

  function renderNoteViewerContent(note) {
    const contentEl = document.getElementById('note-viewer-content');
    if (!contentEl) return;

    if (!note.body || !note.body.trim()) {
      contentEl.innerHTML = '<p style="color:var(--text-muted); font-style:italic;">Esta nota no tiene contenido todavía.</p>';
      return;
    }

    contentEl.innerHTML = window.renderMarkdown(note.body, { interactiveCheckboxes: true });

    // Enlazar checkboxes interactivos para actualizar el markdown en vivo
    const checkboxes = contentEl.querySelectorAll('.note-interactive-task-cb');
    checkboxes.forEach(cb => {
      cb.addEventListener('change', (e) => {
        const taskIdx = parseInt(e.target.dataset.taskIndex, 10);
        toggleNoteChecklistItem(note.id, taskIdx, e.target.checked);
      });
    });
  }

  function closeNoteViewerModal() {
    const modal = document.getElementById('note-viewer-modal');
    if (modal) modal.style.display = 'none';
    currentViewingNoteId = null;
  }

  function toggleNoteChecklistItem(noteId, targetTaskIdx, isChecked) {
    const note = (state.notes || []).find(n => n.id === noteId);
    if (!note || !note.body) return;

    let currentIdx = 0;
    const newBody = note.body.replace(/^(\s*[-*+]\s+\[)([ xX])(\]\s+.*)$/gm, (match, prefix, checkChar, rest) => {
      if (currentIdx === targetTaskIdx) {
        currentIdx++;
        return `${prefix}${isChecked ? 'x' : ' '}${rest}`;
      }
      currentIdx++;
      return match;
    });

    note.body = newBody;
    note.updatedAt = new Date().toISOString();
    persistData();
    renderNotes();
    renderDashboard();
    showToast(isChecked ? 'Tarea marcada como completada' : 'Tarea desmarcada', 'info');
  }

  // Listeners de los botones del visor de notas
  document.getElementById('note-viewer-close-btn')?.addEventListener('click', closeNoteViewerModal);
  document.getElementById('btn-viewer-close')?.addEventListener('click', closeNoteViewerModal);

  document.getElementById('btn-viewer-copy-md')?.addEventListener('click', () => {
    const note = (state.notes || []).find(n => n.id === currentViewingNoteId);
    if (!note) return;
    navigator.clipboard.writeText(note.body || '').then(() => {
      showToast('Código Markdown copiado al portapapeles', 'success');
    }).catch(() => {
      showToast('Error al copiar al portapapeles', 'warning');
    });
  });

  document.getElementById('btn-viewer-export-pdf')?.addEventListener('click', async () => {
    const note = (state.notes || []).find(n => n.id === currentViewingNoteId);
    if (!note) return;
    const printArea = document.getElementById('print-area');
    if (!printArea) return;

    printArea.innerHTML = `
      <div style="font-family: 'Segoe UI', system-ui, sans-serif; padding: 32px; max-width: 800px; margin: 0 auto; color: #1e293b;">
        <div style="border-bottom: 2px solid #d97706; padding-bottom: 12px; margin-bottom: 20px;">
          <div style="font-size: 0.85rem; color: #d97706; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
            ${escapeHtml(state.settings.schoolName || 'Pastoral Escolar')} &bull; Nota Pastoral
          </div>
          <h1 style="margin: 6px 0; color: #0f172a; font-size: 1.8rem;">${escapeHtml(note.title)}</h1>
          <div style="font-size: 0.82rem; color: #64748b; margin-top: 4px;">
            Fecha: ${note.updatedAt ? note.updatedAt.split('T')[0] : (note.createdAt ? note.createdAt.split('T')[0] : '')}
            ${note.tags && note.tags.length ? ` &bull; Etiquetas: ${escapeHtml(note.tags.join(', '))}` : ''}
          </div>
        </div>
        <div class="note-markdown-view markdown-body" style="line-height: 1.7; font-size: 1rem;">
          ${window.renderMarkdown(note.body)}
        </div>
        <div style="margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 0.75rem; color: #94a3b8; text-align: center;">
          Organizador Pastoral Escolar &bull; Manuel Guia
        </div>
      </div>
    `;

    try {
      await window.pastoral.printToPdf(`nota-${(note.title || 'pastoral').toLowerCase().replace(/[^a-z0-9]/gi, '_')}.pdf`);
      showToast('Documento PDF generado correctamente', 'success');
    } catch (e) {
      window.print();
    }
  });

  document.getElementById('btn-viewer-delete-note')?.addEventListener('click', () => {
    const id = currentViewingNoteId;
    if (!id) return;
    const note = (state.notes || []).find(n => String(n.id) === String(id));
    closeNoteViewerModal();
    openConfirmModal({
      title: 'Eliminar Nota',
      message: `¿Deseas eliminar permanentemente la nota "${note ? escapeHtml(note.title) : ''}"?`,
      confirmText: 'Eliminar',
      confirmBtnClass: 'btn-danger',
      onConfirm: () => {
        markDeleted(id);
        state.notes = state.notes.filter(n => String(n.id) !== String(id));
        persistData();
        if (window.pastoralFirebase && typeof window.pastoralFirebase.pushState === 'function') {
          window.pastoralFirebase.pushState(state, true);
        }
        renderNotes();
        renderDashboard();
        showToast('Nota eliminada con éxito', 'info');
      }
    });
  });

  document.getElementById('btn-viewer-edit-note')?.addEventListener('click', () => {
    const note = (state.notes || []).find(n => String(n.id) === String(currentViewingNoteId));
    if (note) {
      closeNoteViewerModal();
      openNoteEditorModal(note);
    }
  });

  // ========================================================
  // EDITOR DE NOTAS CON BARRA MARKDOWN Y VISTA PREVIA EN VIVO
  // ========================================================

  let noteEditorCurrentMode = 'write';

  function openNoteEditorModal(note = null) {
    const modal = document.getElementById('note-editor-modal');
    if (!modal) return;

    const isEdit = Boolean(note && note.id);
    const titleModal = document.getElementById('note-editor-title');
    const idInput = document.getElementById('note-editor-id');
    const titleInput = document.getElementById('note-editor-input-title');
    const tagsInput = document.getElementById('note-editor-input-tags');
    const bodyInput = document.getElementById('note-editor-input-body');

    if (titleModal) titleModal.textContent = isEdit ? 'Editar Nota Pastoral' : 'Nueva Nota Pastoral';
    if (idInput) idInput.value = isEdit ? note.id : '';
    if (titleInput) titleInput.value = note ? (note.title || '') : '';
    if (tagsInput) tagsInput.value = (note && Array.isArray(note.tags)) ? note.tags.join(', ') : '';
    if (bodyInput) bodyInput.value = note ? (note.body || '') : '';

    setNoteEditorTab('write');
    updateNoteEditorCounter();

    modal.style.display = 'flex';
    setTimeout(() => {
      if (titleInput) titleInput.focus();
    }, 50);
  }

  function closeNoteEditorModal() {
    const modal = document.getElementById('note-editor-modal');
    if (modal) modal.style.display = 'none';
  }

  function setNoteEditorTab(tab) {
    noteEditorCurrentMode = tab;
    const writePane = document.getElementById('note-pane-write');
    const previewPane = document.getElementById('note-pane-preview');
    const previewContent = document.getElementById('note-editor-preview-content');
    const bodyInput = document.getElementById('note-editor-input-body');
    const toolbar = document.getElementById('note-markdown-toolbar');

    document.querySelectorAll('#note-editor-mode-tabs .segmented-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    if (tab === 'write') {
      if (writePane) writePane.style.display = 'block';
      if (previewPane) previewPane.style.display = 'none';
      if (toolbar) toolbar.style.display = 'flex';
    } else {
      if (writePane) writePane.style.display = 'none';
      if (previewPane) previewPane.style.display = 'block';
      if (toolbar) toolbar.style.display = 'none';

      // Renderizar vista previa markdown instantánea
      const text = bodyInput ? bodyInput.value : '';
      if (previewContent) {
        if (!text.trim()) {
          previewContent.innerHTML = '<p style="color:var(--text-muted); font-style:italic;">Escribe algo en la pestaña "Escribir" para ver la vista previa en Markdown formateado.</p>';
        } else {
          previewContent.innerHTML = window.renderMarkdown(text);
        }
      }
    }
  }

  function updateNoteEditorCounter() {
    const bodyInput = document.getElementById('note-editor-input-body');
    const counter = document.getElementById('note-editor-counter');
    if (!bodyInput || !counter) return;
    const chars = bodyInput.value.length;
    const words = bodyInput.value.trim() ? bodyInput.value.trim().split(/\s+/).length : 0;
    counter.textContent = `${words} palabras | ${chars} caracteres`;
  }

  // Ayudante para insertar Markdown con selección de texto respetada
  function insertMarkdownHelper(action) {
    const textarea = document.getElementById('note-editor-input-body');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);

    let replacement = '';
    let cursorOffset = 0;

    switch (action) {
      case 'bold':
        replacement = selected ? `**${selected}**` : '**texto en negrita**';
        cursorOffset = selected ? replacement.length : 2;
        break;
      case 'italic':
        replacement = selected ? `*${selected}*` : '*texto en cursiva*';
        cursorOffset = selected ? replacement.length : 1;
        break;
      case 'strike':
        replacement = selected ? `~~${selected}~~` : '~~texto tachado~~';
        cursorOffset = selected ? replacement.length : 2;
        break;
      case 'h1':
        replacement = selected ? `\n# ${selected}\n` : '\n# Título Principal\n';
        cursorOffset = replacement.length;
        break;
      case 'h2':
        replacement = selected ? `\n## ${selected}\n` : '\n## Subtítulo o Sección\n';
        cursorOffset = replacement.length;
        break;
      case 'h3':
        replacement = selected ? `\n### ${selected}\n` : '\n### Subapartado\n';
        cursorOffset = replacement.length;
        break;
      case 'quote':
        replacement = selected ? `\n> ${selected}\n` : '\n> *"Donde están dos o tres reunidos en mi nombre..." (Mt 18, 20)*\n';
        cursorOffset = replacement.length;
        break;
      case 'ul':
        replacement = selected ? `\n- ${selected}` : '\n- Elemento de la lista';
        cursorOffset = replacement.length;
        break;
      case 'ol':
        replacement = selected ? `\n1. ${selected}` : '\n1. Primer paso';
        cursorOffset = replacement.length;
        break;
      case 'checklist':
        replacement = selected ? `\n- [ ] ${selected}` : '\n- [ ] Tarea pendiente';
        cursorOffset = replacement.length;
        break;
      case 'table':
        replacement = '\n| Concepto | Responsable | Estado |\n| :--- | :--- | :---: |\n| Guiones de Misa | Equipo Liturgia | Pendiente |\n| Cantos y Coro | Manuel Guia | Listo |\n';
        cursorOffset = replacement.length;
        break;
      case 'link':
        replacement = selected ? `[${selected}](https://)` : '[Enlace](https://ejemplo.com)';
        cursorOffset = selected ? replacement.length - 1 : replacement.length;
        break;
      case 'bible':
        replacement = '\n> *"Ustedes son la luz del mundo. Una ciudad situada sobre un monte no se puede ocultar." (Mt 5, 14)*\n';
        cursorOffset = replacement.length;
        break;
      case 'hr':
        replacement = '\n---\n';
        cursorOffset = replacement.length;
        break;
    }

    textarea.value = text.substring(0, start) + replacement + text.substring(end);
    textarea.focus();
    textarea.selectionStart = start + cursorOffset;
    textarea.selectionEnd = start + cursorOffset;

    updateNoteEditorCounter();
  }

  // Listeners de pestañas del editor
  document.querySelectorAll('#note-editor-mode-tabs .segmented-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setNoteEditorTab(btn.dataset.tab);
    });
  });

  // Listeners de la barra de herramientas Markdown
  document.querySelectorAll('#note-markdown-toolbar .md-tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      insertMarkdownHelper(btn.dataset.action);
    });
  });

  // Conteo en vivo de caracteres y palabras
  document.getElementById('note-editor-input-body')?.addEventListener('input', updateNoteEditorCounter);

  // Cerrar y Cancelar modal del editor
  document.getElementById('note-editor-close-btn')?.addEventListener('click', closeNoteEditorModal);
  document.getElementById('note-editor-cancel-btn')?.addEventListener('click', closeNoteEditorModal);

  // Cerrar haciendo clic en el fondo oscuro (backdrop)
  document.getElementById('note-viewer-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'note-viewer-modal') closeNoteViewerModal();
  });
  document.getElementById('note-editor-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'note-editor-modal') closeNoteEditorModal();
  });

  // Guardar nota desde el editor
  document.getElementById('note-editor-save-btn')?.addEventListener('click', () => {
    const id = document.getElementById('note-editor-id').value;
    const title = document.getElementById('note-editor-input-title').value.trim();
    const body = document.getElementById('note-editor-input-body').value.trim();
    const tagsRaw = document.getElementById('note-editor-input-tags').value;
    const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);

    if (!title) {
      showToast('Por favor ingresa un título para la nota.', 'warning');
      return;
    }

    const nowIso = new Date().toISOString();
    const isEdit = Boolean(id);

    if (isEdit) {
      const idx = state.notes.findIndex(n => String(n.id) === String(id));
      if (idx !== -1) {
        state.notes[idx] = {
          ...state.notes[idx],
          title,
          body,
          tags,
          updatedAt: nowIso
        };
      }
    } else {
      const newId = 'n_' + Date.now();
      state.notes.unshift({
        id: newId,
        title,
        body,
        tags,
        createdAt: nowIso,
        updatedAt: nowIso
      });
    }

    persistData();
    renderNotes();
    renderDashboard();
    closeNoteEditorModal();
    showToast(isEdit ? 'Nota actualizada' : 'Nota creada con éxito', 'success');
  });

  // Exportar Notas a CSV
  document.getElementById('notes-export-csv-btn')?.addEventListener('click', () => {
    if (!state.notes || state.notes.length === 0) {
      showToast('No hay notas para exportar', 'info');
      return;
    }

    let csvContent = '\uFEFFTítulo,Contenido,Etiquetas,Fecha de Creación\n';
    state.notes.forEach(n => {
      const title = `"${(n.title || '').replace(/"/g, '""')}"`;
      const body = `"${(n.body || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`;
      const tags = `"${(n.tags || []).join(', ').replace(/"/g, '""')}"`;
      const date = `"${n.createdAt || ''}"`;
      csvContent += `${title},${body},${tags},${date}\n`;
    });

    downloadBlob(csvContent, 'notas-pastoral.csv', 'text/csv;charset=utf-8;');
    showToast('Archivo CSV descargado con éxito', 'success');
  });

  // Exportar Notas a PDF con Renderizado Markdown Completo
  document.getElementById('notes-export-pdf-btn')?.addEventListener('click', async () => {
    const printArea = document.getElementById('print-area');
    if (!printArea) return;

    printArea.innerHTML = `
      <div style="font-family: 'Segoe UI', system-ui, sans-serif; padding: 24px;">
        <h1 style="color: #0f172a; border-bottom: 2px solid #d97706; padding-bottom: 8px;">
          ${escapeHtml(state.settings.schoolName || 'Pastoral Escolar')} - Registro de Ideas y Notas
        </h1>
        <p style="color: #64748b; font-size: 0.9rem;">Generado el ${new Date().toLocaleDateString('es-ES')}</p>
        <div style="margin-top: 24px;">
          ${state.notes.map(n => `
            <div style="margin-bottom: 24px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; background: #ffffff;">
              <h3 style="margin: 0 0 6px 0; color: #0f172a; font-size: 1.25rem;">${escapeHtml(n.title)}</h3>
              <div style="font-size: 0.8rem; color: #d97706; margin-bottom: 12px; font-weight: 600;">${(n.tags || []).join(' &bull; ')}</div>
              <div class="note-markdown-view markdown-body" style="font-size: 0.92rem; line-height: 1.6;">${window.renderMarkdown(n.body)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    try {
      await window.pastoral.printToPdf('notas-pastoral.pdf');
      showToast('Documento PDF exportado correctamente', 'success');
    } catch (e) {
      window.print();
    }
  });

  // Modal "Desde Imagen con IA"
  let selectedImageDataUrl = null;
  const fromImageModal = document.getElementById('from-image-modal');
  const fromImageBtn = document.getElementById('notes-from-image-btn');
  const dropZone = document.getElementById('image-upload-dropzone');
  const fileInput = document.getElementById('image-upload-file-input');
  const previewBox = document.getElementById('from-image-preview-box');
  const previewImg = document.getElementById('from-image-preview-elem');
  const changeImgBtn = document.getElementById('from-image-change-btn');
  const processBtn = document.getElementById('from-image-process-btn');
  const instructionsInput = document.getElementById('from-image-instructions');

  if (fromImageBtn && fromImageModal) {
    fromImageBtn.addEventListener('click', () => {
      // Verificar si hay clave de API configurada
      if (!state.settings.cloud?.apiKey) {
        showToast('Debes configurar tu Clave de API de OpenRouter en Ajustes para usar la visión de IA.', 'error');
        switchView('settings');
        return;
      }
      resetFromImageModal();
      fromImageModal.style.display = 'flex';
    });

    document.getElementById('from-image-close-btn')?.addEventListener('click', () => {
      fromImageModal.style.display = 'none';
    });
    document.getElementById('from-image-cancel-btn')?.addEventListener('click', () => {
      fromImageModal.style.display = 'none';
    });

    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleImageUpload(e.target.files[0]);
      }
    });

    // Drag and drop en la dropzone
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--primary)';
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = 'var(--border-color)';
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--border-color)';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleImageUpload(e.dataTransfer.files[0]);
      }
    });

    changeImgBtn.addEventListener('click', () => {
      fileInput.value = '';
      resetFromImageModal();
      fileInput.click();
    });

    processBtn.addEventListener('click', async () => {
      if (!selectedImageDataUrl) return;

      processBtn.disabled = true;
      try {
        const provider = state.settings.cloud?.provider || 'gemini';
        const res = await window.pastoral.ai.analyzeImage({
          provider,
          apiKey: state.settings.cloud.apiKey,
          model: state.settings.cloud.model,
          imageDataUrl: selectedImageDataUrl,
          instructions: instructionsInput.value.trim()
        });

        fromImageModal.style.display = 'none';

        if (res.success && res.note) {
          openNoteEditorModal({
            title: res.note.title,
            body: res.note.body,
            tags: res.note.tags
          });
          showToast('Nota generada desde la imagen. Revisa y guarda los cambios.', 'success');
        } else {
          showToast('No se pudo analizar la imagen: ' + (res.error || 'Error desconocido'), 'error');
        }
      } catch (err) {
        showToast('Error de conexión al analizar imagen: ' + err.message, 'error');
      } finally {
        processBtn.disabled = false;
        processBtn.textContent = 'Analizar y Crear Nota';
      }
    });
  }

  function handleImageUpload(file) {
    if (!file.type.startsWith('image/')) {
      showToast('Por favor selecciona un archivo de imagen válido', 'error');
      return;
    }

    resizeImageToDataUrl(file, 1536, (dataUrl) => {
      selectedImageDataUrl = dataUrl;
      previewImg.src = dataUrl;
      dropZone.style.display = 'none';
      previewBox.style.display = 'block';
      processBtn.disabled = false;
    });
  }

  function resetFromImageModal() {
    selectedImageDataUrl = null;
    dropZone.style.display = 'block';
    previewBox.style.display = 'none';
    processBtn.disabled = true;
    instructionsInput.value = '';
  }

  // ========================================================
  // VISTA 3: EVENTOS (CALENDARIO)
  // ========================================================

  let currentAnnouncementEvent = null;

  // Segmented control: Mes / Agenda
  document.getElementById('btn-cal-view-month')?.addEventListener('click', () => {
    setCalendarViewMode('month');
  });

  document.getElementById('btn-cal-view-agenda')?.addEventListener('click', () => {
    setCalendarViewMode('agenda');
  });

  function setCalendarViewMode(mode) {
    calendarViewMode = mode;
    document.getElementById('btn-cal-view-month')?.classList.toggle('active', mode === 'month');
    document.getElementById('btn-cal-view-agenda')?.classList.toggle('active', mode === 'agenda');
    const monthCont = document.getElementById('cal-month-container');
    const agendaCont = document.getElementById('cal-agenda-container');
    if (mode === 'month') {
      if (monthCont) monthCont.style.display = 'block';
      if (agendaCont) agendaCont.style.display = 'none';
    } else {
      if (monthCont) monthCont.style.display = 'none';
      if (agendaCont) agendaCont.style.display = 'flex';
    }
    renderCalendar();
  }

  // Filtro interactivo de categorías
  document.querySelectorAll('#cal-categories-filter .legend-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      activeEventCategoryFilter = chip.dataset.category || 'all';
      document.querySelectorAll('#cal-categories-filter .legend-chip').forEach(c => {
        c.classList.toggle('active', c === chip);
      });
      renderCalendar();
    });
  });

  function renderCalendar() {
    const label = document.getElementById('cal-month-year-label');
    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    if (label) {
      label.textContent = `${monthNames[calendarMonth]} ${calendarYear}`;
    }

    if (calendarViewMode === 'agenda') {
      renderAgendaView();
    } else {
      renderMonthGridView();
    }
  }

  function renderMonthGridView() {
    const grid = document.getElementById('cal-days-grid');
    const searchVal = (document.getElementById('events-search-input')?.value || '').toLowerCase().trim();
    if (!grid) return;

    grid.innerHTML = '';

    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const lastDay = new Date(calendarYear, calendarMonth + 1, 0);
    const totalDays = lastDay.getDate();

    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const prevMonthLastDay = new Date(calendarYear, calendarMonth, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const dNum = prevMonthLastDay - i;
      const cell = document.createElement('div');
      cell.className = 'cal-day-cell other-month';
      cell.innerHTML = `<div class="cal-day-header"><span class="cal-day-number">${dNum}</span></div>`;
      grid.appendChild(cell);
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const monthEventsMap = getEventsMapForMonth(calendarYear, calendarMonth);

    for (let day = 1; day <= totalDays; day++) {
      const dateObj = new Date(calendarYear, calendarMonth, day);
      const dateStr = formatDateYMD(dateObj);
      const isToday = (dateStr === todayStr);
      const isSelected = (dateStr === selectedDateStr);

      const cell = document.createElement('div');
      cell.className = `cal-day-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`;
      cell.dataset.date = dateStr;

      const litInfo = LiturgicalCalendar.getLiturgicalInfo(dateObj);
      let dayEvents = monthEventsMap[dateStr] || [];

      // Filtro de categoría activa
      if (activeEventCategoryFilter && activeEventCategoryFilter !== 'all') {
        dayEvents = dayEvents.filter(e => (e.category || 'Otro').toLowerCase() === activeEventCategoryFilter.toLowerCase());
      }

      // Filtro de búsqueda
      if (searchVal) {
        dayEvents = dayEvents.filter(e => 
          (e.title || '').toLowerCase().includes(searchVal) ||
          (e.location || '').toLowerCase().includes(searchVal) ||
          (e.description || '').toLowerCase().includes(searchVal)
        );
      }

      const eventsHtml = dayEvents.slice(0, 3).map(e => `
        <div class="cal-event-pill cat-${(e.category || 'otro').toLowerCase()}" title="${escapeHtml(e.title)} ${e.time ? '(' + e.time + ')' : ''}">
          ${e.time ? e.time + ' ' : ''}${escapeHtml(e.title)}
        </div>
      `).join('');

      const moreCount = dayEvents.length - 3;
      const moreHtml = moreCount > 0 ? `<div style="font-size:0.68rem; color:var(--text-muted); font-weight:700;">+${moreCount} más</div>` : '';

      cell.innerHTML = `
        <div class="cal-day-header">
          <span class="cal-day-number">${day}</span>
          <span class="cal-liturgical-dot" style="background-color: ${litInfo.colorHex};" title="${escapeHtml(litInfo.celebration)} (${litInfo.color})"></span>
        </div>
        <div class="cal-events-stack">
          ${eventsHtml}
          ${moreHtml}
        </div>
      `;

      cell.addEventListener('click', () => {
        selectedDateStr = dateStr;
        document.querySelectorAll('.cal-day-cell').forEach(c => c.classList.remove('selected'));
        cell.classList.add('selected');
        openDayDetailDrawer(dateStr, dayEvents, litInfo);
      });

      grid.appendChild(cell);
    }

    const totalRendered = startDayOfWeek + totalDays;
    const remaining = (7 - (totalRendered % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const cell = document.createElement('div');
      cell.className = 'cal-day-cell other-month';
      cell.innerHTML = `<div class="cal-day-header"><span class="cal-day-number">${d}</span></div>`;
      grid.appendChild(cell);
    }
  }

  function renderAgendaView() {
    const container = document.getElementById('cal-agenda-container');
    const searchVal = (document.getElementById('events-search-input')?.value || '').toLowerCase().trim();
    if (!container) return;

    container.innerHTML = '';
    const monthEventsMap = getEventsMapForMonth(calendarYear, calendarMonth);
    const sortedDates = Object.keys(monthEventsMap).sort();

    // Filtrar fechas que tengan eventos según filtros
    const filteredGroups = [];
    sortedDates.forEach(dStr => {
      let events = monthEventsMap[dStr] || [];
      if (activeEventCategoryFilter && activeEventCategoryFilter !== 'all') {
        events = events.filter(e => (e.category || 'Otro').toLowerCase() === activeEventCategoryFilter.toLowerCase());
      }
      if (searchVal) {
        events = events.filter(e => 
          (e.title || '').toLowerCase().includes(searchVal) ||
          (e.location || '').toLowerCase().includes(searchVal) ||
          (e.description || '').toLowerCase().includes(searchVal)
        );
      }
      if (events.length > 0) {
        filteredGroups.push({ dateStr: dStr, events });
      }
    });

    if (filteredGroups.length === 0) {
      container.innerHTML = `
        <div class="agenda-empty-state">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
            <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm-8 4H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"/>
          </svg>
          <h4 style="font-size:1.1rem; color:var(--text-primary); margin-bottom:6px;">No hay eventos registrados</h4>
          <p style="font-size:0.9rem; max-width:440px; margin:0 auto 16px auto;">
            No se encontraron eventos para este mes con los filtros seleccionados (${activeEventCategoryFilter === 'all' ? 'todas las categorías' : activeEventCategoryFilter}).
          </p>
          <button class="btn btn-primary" id="btn-agenda-empty-create">+ Registrar Nuevo Evento</button>
        </div>
      `;
      document.getElementById('btn-agenda-empty-create')?.addEventListener('click', () => {
        openEventEditorModal({ date: selectedDateStr });
      });
      return;
    }

    const dayFormatter = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    filteredGroups.forEach(group => {
      const dateParts = group.dateStr.split('-');
      const dateObj = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
      const litInfo = LiturgicalCalendar.getLiturgicalInfo(dateObj);
      const friendlyDate = dayFormatter.format(dateObj);

      const groupDiv = document.createElement('div');
      groupDiv.className = 'agenda-date-group';

      let eventsCardsHtml = group.events.map(e => {
        const catClass = (e.category || 'otro').toLowerCase();
        
        // Checklist summary
        let checklistHtml = '';
        if (Array.isArray(e.checklist) && e.checklist.length > 0) {
          const doneCount = e.checklist.filter(c => c.done).length;
          const totalCount = e.checklist.length;
          const pct = Math.round((doneCount / totalCount) * 100);

          checklistHtml = `
            <div class="agenda-checklist-section">
              <div class="agenda-checklist-header">
                <span>Preparación Pastoral (${doneCount}/${totalCount})</span>
                <span style="font-size:0.75rem; color:var(--text-muted);">${pct}% completado</span>
              </div>
              <div class="agenda-checklist-list">
                ${e.checklist.map(item => `
                  <label class="agenda-check-item ${item.done ? 'done' : ''}">
                    <input type="checkbox" class="agenda-chk-toggle" data-event-id="${e.id}" data-item-id="${item.id}" ${item.done ? 'checked' : ''}>
                    <span>${escapeHtml(item.text)}</span>
                  </label>
                `).join('')}
              </div>
            </div>
          `;
        }

        // Linked script badge
        let scriptHtml = '';
        if (e.scriptId) {
          const linkedScript = (state.liturgicalScripts || []).find(s => s.id === e.scriptId);
          if (linkedScript) {
            scriptHtml = `
              <div style="display:flex; align-items:center; gap:6px; margin-top:2px;">
                <button type="button" class="btn btn-sm btn-secondary btn-open-linked-script" data-script-id="${linkedScript.id}" title="Ver o editar el guión litúrgico">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
                  <span>Guión: ${escapeHtml(linkedScript.title)}</span>
                </button>
                <button type="button" class="btn btn-icon btn-sm btn-ghost btn-print-linked-script" data-script-id="${linkedScript.id}" title="Imprimir guión">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>
                </button>
              </div>
            `;
          }
        }

        return `
          <div class="agenda-event-card cat-${catClass}">
            <div class="agenda-event-header">
              <div class="agenda-event-title-wrap">
                <h4 class="agenda-event-title">${escapeHtml(e.title)}</h4>
                <span class="legend-chip cat-${catClass}">${escapeHtml(e.category || 'Otro')}</span>
              </div>
              <div class="agenda-meta-row">
                ${e.time ? `<span class="agenda-meta-item">⏰ ${e.time} hrs</span>` : ''}
                ${e.location ? `<span class="agenda-meta-item">📍 ${escapeHtml(e.location)}</span>` : ''}
                ${e.attendees ? `<span class="agenda-meta-item">👥 ${escapeHtml(e.attendees)}</span>` : ''}
              </div>
            </div>

            ${e.description ? `<p class="agenda-event-desc">${escapeHtml(e.description)}</p>` : ''}
            ${scriptHtml}
            ${checklistHtml}

            <div class="agenda-event-actions">
              <button class="btn btn-sm btn-secondary btn-announcement-event" data-event-id="${e.id}" title="Generar circular o mensaje de difusión con IA">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="#f59e0b"><path d="M12 2L13.5 5.5L17 7L13.5 8.5L12 12L10.5 8.5L7 7L10.5 5.5L12 2Z"/></svg>
                <span>Convocatoria IA</span>
              </button>
              <button class="btn btn-sm btn-ghost edit-event-btn" data-event-id="${e.id}">Editar</button>
              <button class="btn btn-sm btn-ghost delete-event-btn" data-event-id="${e.id}" style="color:var(--danger);">Eliminar</button>
            </div>
          </div>
        `;
      }).join('');

      groupDiv.innerHTML = `
        <div class="agenda-date-header">
          <div class="agenda-date-title">
            <span style="text-transform:capitalize;">${friendlyDate}</span>
          </div>
          <div class="agenda-liturgical-badge" title="${escapeHtml(litInfo.celebration)} (${litInfo.color})">
            <span class="lit-dot" style="background-color: ${litInfo.colorHex};"></span>
            <span>${escapeHtml(litInfo.celebration)}</span>
          </div>
        </div>
        <div class="agenda-events-list">
          ${eventsCardsHtml}
        </div>
      `;

      container.appendChild(groupDiv);
    });

    // Delegación de eventos en vista Agenda
    container.querySelectorAll('.agenda-chk-toggle').forEach(chk => {
      chk.addEventListener('change', () => {
        const evId = chk.dataset.eventId;
        const itemId = chk.dataset.itemId;
        const ev = state.events.find(x => x.id === evId);
        if (ev && Array.isArray(ev.checklist)) {
          const it = ev.checklist.find(c => c.id === itemId);
          if (it) {
            it.done = chk.checked;
            persistData();
            renderCalendar();
            renderDashboard();
          }
        }
      });
    });

    container.querySelectorAll('.btn-announcement-event').forEach(btn => {
      btn.addEventListener('click', () => {
        const ev = state.events.find(x => x.id === btn.dataset.eventId);
        if (ev) openEventAnnouncementModal(ev);
      });
    });

    container.querySelectorAll('.edit-event-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const ev = state.events.find(x => x.id === btn.dataset.eventId);
        if (ev) openEventEditorModal(ev);
      });
    });

    container.querySelectorAll('.delete-event-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.eventId;
        openConfirmModal({
          title: 'Eliminar Evento',
          message: '¿Deseas eliminar este evento del calendario pastoral?',
          confirmText: 'Eliminar',
          confirmBtnClass: 'btn-danger',
          onConfirm: () => {
            markDeleted(id);
            state.events = state.events.filter(x => x.id !== id);
            persistData();
            if (window.pastoralFirebase && typeof window.pastoralFirebase.pushState === 'function') {
              window.pastoralFirebase.pushState(state, true);
            }
            renderCalendar();
            renderDashboard();
            showToast('Evento eliminado', 'info');
          }
        });
      });
    });

    container.querySelectorAll('.btn-open-linked-script').forEach(btn => {
      btn.addEventListener('click', () => {
        const script = (state.liturgicalScripts || []).find(s => s.id === btn.dataset.scriptId);
        if (script) openScriptEditorModal(script);
      });
    });

    container.querySelectorAll('.btn-print-linked-script').forEach(btn => {
      btn.addEventListener('click', () => {
        const script = (state.liturgicalScripts || []).find(s => s.id === btn.dataset.scriptId);
        if (script) printLiturgicalScript(script);
      });
    });
  }

  /**
   * Mapea y proyecta los eventos (incluyendo semanales y mensuales) en el mes visible
   */
  function getEventsMapForMonth(year, month) {
    const map = {};
    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0);
    const startStr = formatDateYMD(startOfMonth);
    const endStr = formatDateYMD(endOfMonth);

    (state.events || []).forEach(e => {
      if (!e.date) return;

      // Caso 1: Sin repetición
      if (!e.repeat || e.repeat === 'none') {
        if (e.date >= startStr && e.date <= endStr) {
          if (!map[e.date]) map[e.date] = [];
          map[e.date].push(e);
        }
        return;
      }

      // Caso 2: Repetición semanal
      if (e.repeat === 'weekly') {
        const evDate = parseYMD(e.date);
        const repeatUntil = e.repeatUntil ? parseYMD(e.repeatUntil) : new Date(year + 1, 11, 31);

        let curr = new Date(evDate);
        while (curr <= repeatUntil && curr <= endOfMonth) {
          const currStr = formatDateYMD(curr);
          if (curr >= startOfMonth && curr >= evDate) {
            if (!map[currStr]) map[currStr] = [];
            map[currStr].push(e);
          }
          curr.setDate(curr.getDate() + 7);
        }
      }

      // Caso 3: Repetición mensual
      if (e.repeat === 'monthly') {
        const evDate = parseYMD(e.date);
        const dayOfMonth = evDate.getDate();
        const candidate = new Date(year, month, dayOfMonth);
        const candStr = formatDateYMD(candidate);

        const repeatUntil = e.repeatUntil ? e.repeatUntil : '9999-12-31';
        if (candStr >= e.date && candStr <= repeatUntil && candidate.getMonth() === month) {
          if (!map[candStr]) map[candStr] = [];
          map[candStr].push(e);
        }
      }
    });

    return map;
  }

  // Drawer de Detalles de Día
  function openDayDetailDrawer(dateStr, events, litInfo) {
    const drawer = document.getElementById('cal-day-drawer');
    const titleElem = document.getElementById('drawer-date-title');
    const listElem = document.getElementById('drawer-events-list');
    if (!drawer || !titleElem || !listElem) return;

    drawer.style.display = 'flex';
    titleElem.textContent = `${dateStr} - ${litInfo.celebration}`;

    if (events.length === 0) {
      listElem.innerHTML = `
        <div style="text-align:center; padding: 20px 0; color:var(--text-muted);">
          <p>Sin eventos agendados para este día</p>
          <small style="color:${litInfo.colorHex}; font-weight:600;">Celebración: ${litInfo.celebration} (${litInfo.color})</small>
        </div>
      `;
    } else {
      listElem.innerHTML = events.map(e => {
        // Checklist summary
        let checklistHtml = '';
        if (Array.isArray(e.checklist) && e.checklist.length > 0) {
          const doneCount = e.checklist.filter(c => c.done).length;
          checklistHtml = `
            <div class="drawer-checklist-box">
              <div class="drawer-checklist-title">
                <span>Preparación (${doneCount}/${e.checklist.length})</span>
              </div>
              <div class="drawer-checklist-list">
                ${e.checklist.map(item => `
                  <label class="drawer-check-item ${item.done ? 'done' : ''}">
                    <input type="checkbox" class="drawer-chk-toggle" data-event-id="${e.id}" data-item-id="${item.id}" ${item.done ? 'checked' : ''}>
                    <span>${escapeHtml(item.text)}</span>
                  </label>
                `).join('')}
              </div>
            </div>
          `;
        }

        // Linked script
        let scriptHtml = '';
        if (e.scriptId) {
          const linkedScript = (state.liturgicalScripts || []).find(s => s.id === e.scriptId);
          if (linkedScript) {
            scriptHtml = `
              <div style="margin-top:4px;">
                <button type="button" class="btn btn-sm btn-secondary btn-open-linked-script" data-script-id="${linkedScript.id}" style="font-size:0.78rem;">
                  📜 Guión: ${escapeHtml(linkedScript.title)}
                </button>
              </div>
            `;
          }
        }

        return `
          <div class="dash-list-item" style="flex-direction:column; align-items:flex-start; gap:6px; width:100%;">
            <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
              <strong style="color:var(--text-primary); font-size:0.95rem;">${escapeHtml(e.title)}</strong>
              <span class="legend-chip cat-${(e.category || 'otro').toLowerCase()}">${escapeHtml(e.category || 'Otro')}</span>
            </div>
            <div style="font-size:0.8rem; color:var(--text-secondary);">
              ${e.time ? '⏰ ' + e.time + ' hrs ' : ''} ${e.location ? '📍 ' + escapeHtml(e.location) : ''}
              ${e.attendees ? '👥 ' + escapeHtml(e.attendees) : ''}
            </div>
            ${e.description ? `<p style="font-size:0.8rem; color:var(--text-muted); margin:2px 0;">${escapeHtml(e.description)}</p>` : ''}
            ${scriptHtml}
            ${checklistHtml}
            <div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;">
              <button class="btn btn-sm btn-secondary btn-announcement-event" data-event-id="${e.id}">📣 Convocatoria IA</button>
              <button class="btn btn-sm btn-ghost edit-event-btn" data-event-id="${e.id}">Editar</button>
              <button class="btn btn-sm btn-ghost delete-event-btn" data-event-id="${e.id}" style="color:var(--danger);">Eliminar</button>
            </div>
          </div>
        `;
      }).join('');

      listElem.querySelectorAll('.drawer-chk-toggle').forEach(chk => {
        chk.addEventListener('change', () => {
          const ev = state.events.find(x => x.id === chk.dataset.eventId);
          if (ev && Array.isArray(ev.checklist)) {
            const it = ev.checklist.find(c => c.id === chk.dataset.itemId);
            if (it) {
              it.done = chk.checked;
              persistData();
              renderCalendar();
              renderDashboard();
            }
          }
        });
      });

      listElem.querySelectorAll('.btn-announcement-event').forEach(btn => {
        btn.addEventListener('click', () => {
          const ev = state.events.find(x => x.id === btn.dataset.eventId);
          if (ev) openEventAnnouncementModal(ev);
        });
      });

      listElem.querySelectorAll('.edit-event-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.eventId;
          const ev = state.events.find(x => x.id === id);
          if (ev) openEventEditorModal(ev);
        });
      });

      listElem.querySelectorAll('.btn-open-linked-script').forEach(btn => {
        btn.addEventListener('click', () => {
          const script = (state.liturgicalScripts || []).find(s => s.id === btn.dataset.scriptId);
          if (script) openScriptEditorModal(script);
        });
      });

      listElem.querySelectorAll('.delete-event-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.eventId;
          openConfirmModal({
            title: 'Eliminar Evento',
            message: '¿Deseas eliminar este evento del calendario pastoral?',
            confirmText: 'Eliminar',
            confirmBtnClass: 'btn-danger',
            onConfirm: () => {
              markDeleted(id);
              state.events = state.events.filter(x => x.id !== id);
              persistData();
              if (window.pastoralFirebase && typeof window.pastoralFirebase.pushState === 'function') {
                window.pastoralFirebase.pushState(state, true);
              }
              renderCalendar();
              renderDashboard();
              drawer.style.display = 'none';
              showToast('Evento eliminado', 'info');
            }
          });
        });
      });
    }

    document.getElementById('drawer-add-event-btn').onclick = () => {
      openEventEditorModal({ date: dateStr });
    };
  }

  document.getElementById('drawer-close-btn')?.addEventListener('click', () => {
    document.getElementById('cal-day-drawer').style.display = 'none';
  });

  // Controles de mes anterior/siguiente/hoy
  document.getElementById('cal-prev-btn')?.addEventListener('click', () => {
    calendarMonth--;
    if (calendarMonth < 0) {
      calendarMonth = 11;
      calendarYear--;
    }
    renderCalendar();
  });

  document.getElementById('cal-next-btn')?.addEventListener('click', () => {
    calendarMonth++;
    if (calendarMonth > 11) {
      calendarMonth = 0;
      calendarYear++;
    }
    renderCalendar();
  });

  document.getElementById('cal-today-btn')?.addEventListener('click', () => {
    const now = new Date();
    calendarYear = now.getFullYear();
    calendarMonth = now.getMonth();
    selectedDateStr = now.toISOString().split('T')[0];
    renderCalendar();
  });

  document.getElementById('events-search-input')?.addEventListener('input', () => {
    renderCalendar();
  });

  document.getElementById('btn-create-event')?.addEventListener('click', () => {
    openEventEditorModal({ date: selectedDateStr });
  });

  // Modal de Crear/Editar Evento con Checklist y Guión Litúrgico
  function openEventEditorModal(eventData = null) {
    const isEdit = eventData && eventData.id;
    const titleVal = eventData ? eventData.title || '' : '';
    const dateVal = eventData ? eventData.date || selectedDateStr : selectedDateStr;
    const timeVal = eventData ? eventData.time || '' : '';
    const locationVal = eventData ? eventData.location || '' : '';
    const categoryVal = eventData ? eventData.category || 'Misa' : 'Misa';
    const repeatVal = eventData ? eventData.repeat || 'none' : 'none';
    const repeatUntilVal = eventData ? eventData.repeatUntil || '' : '';
    const descVal = eventData ? eventData.description || '' : '';
    const attendeesVal = eventData ? eventData.attendees || '' : '';
    const scriptIdVal = eventData ? eventData.scriptId || '' : '';
    const checklistItems = (eventData && Array.isArray(eventData.checklist)) ? JSON.parse(JSON.stringify(eventData.checklist)) : [];

    const categories = ['Misa', 'Retiro', 'Reunión', 'Campaña', 'Formación', 'Convivencia', 'Otro'];
    const scripts = state.liturgicalScripts || [];

    // Presets de preparación pastoral
    const checklistPresets = {
      misa: [
        'Reservar capilla o gimnasio y verificar amplificación',
        'Confirmar sacerdote celebrante',
        'Asignar lectores (1ra Lectura, Salmo, Oración Universal)',
        'Preparar ofrendas escolares (cirio, flores, pan y vino)',
        'Coordinar coro y lista de cantos aprobada',
        'Imprimir guiones litúrgicos y hojas de cantos'
      ],
      retiro: [
        'Reservar casa de retiros y transporte escolar',
        'Recolectar autorizaciones y fichas médicas',
        'Preparar materiales impresos, lápices y cuadernillos',
        'Asignar profesores tutores y monitores de apoyo',
        'Preparar altar del retiro (cruz, biblia, cirio)',
        'Coordinar menú, colaciones y momentos de descanso'
      ],
      campana: [
        'Diseñar y difundir afiches de la campaña por curso',
        'Habilitar cajas y centros de recolección rotulados',
        'Designar equipo de pastoral para conteo y orden',
        'Coordinar armado digno de canastas familiares',
        'Organizar traslado y entrega fraterna a las familias'
      ]
    };

    openGenericModal({
      title: isEdit ? 'Editar Evento Pastoral' : 'Nuevo Evento Pastoral',
      bodyHtml: `
        <div class="form-group">
          <label for="modal-ev-title">Título del Evento: *</label>
          <input type="text" id="modal-ev-title" value="${escapeHtml(titleVal)}" placeholder="ej: Misa de Inicio de Año Escolar" required>
        </div>
        <div class="form-row-2">
          <div class="form-group">
            <label for="modal-ev-date">Fecha (YYYY-MM-DD): *</label>
            <input type="date" id="modal-ev-date" value="${dateVal}" required>
          </div>
          <div class="form-group">
            <label for="modal-ev-time">Hora (HH:MM):</label>
            <input type="time" id="modal-ev-time" value="${timeVal}">
          </div>
        </div>
        <div class="form-row-2">
          <div class="form-group">
            <label for="modal-ev-category">Categoría:</label>
            <select id="modal-ev-category">
              ${categories.map(c => `<option value="${c}" ${c === categoryVal ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="modal-ev-location">Lugar:</label>
            <input type="text" id="modal-ev-location" value="${escapeHtml(locationVal)}" placeholder="Capilla, Gimnasio, Sala...">
          </div>
        </div>
        <div class="form-row-2">
          <div class="form-group">
            <label for="modal-ev-repeat">Repetición:</label>
            <select id="modal-ev-repeat">
              <option value="none" ${repeatVal === 'none' ? 'selected' : ''}>Sin repetición</option>
              <option value="weekly" ${repeatVal === 'weekly' ? 'selected' : ''}>Semanal</option>
              <option value="monthly" ${repeatVal === 'monthly' ? 'selected' : ''}>Mensual</option>
            </select>
          </div>
          <div class="form-group">
            <label for="modal-ev-repeat-until">Repetir hasta:</label>
            <input type="date" id="modal-ev-repeat-until" value="${repeatUntilVal}">
          </div>
        </div>
        <div class="form-group">
          <label for="modal-ev-attendees">Destinatarios o Convocados:</label>
          <input type="text" id="modal-ev-attendees" value="${escapeHtml(attendeesVal)}" placeholder="ej: Profesores, Estudiantes de Enseñanza Media, Familias">
        </div>
        <div class="form-group">
          <label for="modal-ev-script">Guión Litúrgico Vinculado:</label>
          <select id="modal-ev-script">
            <option value="">-- Sin guión vinculado --</option>
            ${scripts.map(s => `<option value="${s.id}" ${s.id === scriptIdVal ? 'selected' : ''}>${escapeHtml(s.title || 'Guión')} (${s.type || 'Liturgia'})</option>`).join('')}
          </select>
        </div>

        <!-- Checklist de Preparación Pastoral -->
        <div class="event-checklist-builder">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <label style="font-weight:700; font-size:0.85rem; color:var(--text-secondary); margin:0;">Checklist de Preparación Pastoral:</label>
            <span style="font-size:0.75rem; color:var(--text-muted);">Cargar tareas sugeridas:</span>
          </div>
          <div class="event-checklist-presets">
            <button type="button" class="btn btn-sm btn-ghost" id="preset-chk-misa">+ Misa Escolar</button>
            <button type="button" class="btn btn-sm btn-ghost" id="preset-chk-retiro">+ Retiro</button>
            <button type="button" class="btn btn-sm btn-ghost" id="preset-chk-campana">+ Campaña</button>
            <button type="button" class="btn btn-sm btn-ghost" id="preset-chk-clear" style="color:var(--text-muted);">Limpiar</button>
          </div>
          <div id="modal-ev-checklist-rows" style="display:flex; flex-direction:column; gap:6px;"></div>
          <button type="button" class="btn btn-sm btn-secondary mt-2" id="modal-ev-add-task-btn">+ Agregar Tarea</button>
        </div>

        <div class="form-group mt-3">
          <label for="modal-ev-desc">Descripción y Notas:</label>
          <textarea id="modal-ev-desc" rows="3" placeholder="Detalles, avisos pastorales, lecturas, recordatorios...">${escapeHtml(descVal)}</textarea>
        </div>
      `,
      onSave: () => {
        const title = document.getElementById('modal-ev-title').value.trim();
        const date = document.getElementById('modal-ev-date').value;
        const time = document.getElementById('modal-ev-time').value;
        const location = document.getElementById('modal-ev-location').value.trim();
        const category = document.getElementById('modal-ev-category').value;
        const repeat = document.getElementById('modal-ev-repeat').value;
        const repeatUntil = document.getElementById('modal-ev-repeat-until').value;
        const attendees = document.getElementById('modal-ev-attendees').value.trim();
        const scriptId = document.getElementById('modal-ev-script').value || null;
        const description = document.getElementById('modal-ev-desc').value.trim();

        if (!title || !date) {
          showToast('El título y la fecha son campos obligatorios.', 'warning');
          return false;
        }

        // Recolectar checklist
        const rows = document.querySelectorAll('#modal-ev-checklist-rows .checklist-builder-item');
        const checklist = [];
        rows.forEach(r => {
          const txt = r.querySelector('.chk-text-input')?.value.trim();
          const done = r.querySelector('.chk-done-input')?.checked || false;
          const id = r.dataset.id || ('chk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4));
          if (txt) {
            checklist.push({ id, text: txt, done });
          }
        });

        if (isEdit) {
          const idx = state.events.findIndex(e => e.id === eventData.id);
          if (idx !== -1) {
            state.events[idx] = {
              ...state.events[idx],
              title, date, time, location, category, repeat, repeatUntil, attendees, scriptId, checklist, description
            };
          }
        } else {
          state.events.push({
            id: 'ev_' + Date.now(),
            title, date, time, location, category, repeat, repeatUntil, attendees, scriptId, checklist, description
          });
        }

        persistData();
        renderCalendar();
        renderDashboard();
        showToast(isEdit ? 'Evento actualizado' : 'Evento registrado con éxito', 'success');
        return true;
      }
    });

    // Renderizar filas de checklist iniciales
    const rowsContainer = document.getElementById('modal-ev-checklist-rows');
    function addChecklistRow(item = { id: '', text: '', done: false }) {
      if (!rowsContainer) return;
      const rowId = item.id || ('chk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4));
      const row = document.createElement('div');
      row.className = 'checklist-builder-item';
      row.dataset.id = rowId;
      row.innerHTML = `
        <input type="checkbox" class="chk-done-input" ${item.done ? 'checked' : ''} title="Marcar como completada">
        <input type="text" class="chk-text-input" value="${escapeHtml(item.text)}" placeholder="Tarea o preparativo pastoral...">
        <button type="button" class="btn btn-icon btn-sm btn-ghost btn-del-row" title="Quitar tarea">&times;</button>
      `;
      row.querySelector('.btn-del-row').addEventListener('click', () => row.remove());
      rowsContainer.appendChild(row);
    }

    checklistItems.forEach(it => addChecklistRow(it));

    document.getElementById('modal-ev-add-task-btn')?.addEventListener('click', () => {
      addChecklistRow();
    });

    document.getElementById('preset-chk-misa')?.addEventListener('click', () => {
      checklistPresets.misa.forEach(text => addChecklistRow({ text, done: false }));
    });

    document.getElementById('preset-chk-retiro')?.addEventListener('click', () => {
      checklistPresets.retiro.forEach(text => addChecklistRow({ text, done: false }));
    });

    document.getElementById('preset-chk-campana')?.addEventListener('click', () => {
      checklistPresets.campana.forEach(text => addChecklistRow({ text, done: false }));
    });

    document.getElementById('preset-chk-clear')?.addEventListener('click', () => {
      if (rowsContainer) rowsContainer.innerHTML = '';
    });
  }

  // ========================================================
  // GENERADOR IA DE CONVOCATORIAS Y CIRCULARES ESCOLARES
  // ========================================================

  function openEventAnnouncementModal(event) {
    const modal = document.getElementById('event-announcement-modal');
    const infoBanner = document.getElementById('announcement-event-info');
    const textarea = document.getElementById('announcement-result-text');
    const statusElem = document.getElementById('announcement-ai-status');
    const tabsContainer = document.getElementById('announcement-target-tabs');
    if (!modal || !infoBanner || !textarea) return;

    currentAnnouncementEvent = event;
    modal.style.display = 'flex';

    // Banner del evento
    infoBanner.innerHTML = `
      <div class="announcement-banner-title">${escapeHtml(event.title)}</div>
      <div class="announcement-banner-meta">
        <span>📅 ${event.date || 'Fecha por definir'}${event.time ? ' &bull; ' + event.time + ' hrs.' : ''}</span>
        <span>📍 ${escapeHtml(event.location || 'Colegio')}</span>
        <span class="legend-chip cat-${(event.category || 'otro').toLowerCase()}">${escapeHtml(event.category || 'Celebración')}</span>
        ${event.attendees ? `<span>👥 ${escapeHtml(event.attendees)}</span>` : ''}
      </div>
    `;

    let currentTarget = 'apoderados';
    tabsContainer.querySelectorAll('.segmented-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.target === currentTarget);
      btn.onclick = () => {
        currentTarget = btn.dataset.target;
        tabsContainer.querySelectorAll('.segmented-btn').forEach(b => b.classList.toggle('active', b === btn));
        triggerGeneration();
      };
    });

    async function triggerGeneration() {
      if (statusElem) statusElem.textContent = 'Redactando con IA...';
      textarea.value = 'Generando circular y convocatoria pastoral...';

      try {
        const res = await window.pastoral.ai.generateEventAnnouncement({
          eventData: currentAnnouncementEvent,
          target: currentTarget
        });

        if (res && res.success) {
          textarea.value = res.text;
          if (statusElem) {
            statusElem.textContent = res.isAi ? '✨ Redactado con Asistente IA' : '📝 Redacción generada con plantilla';
          }
        } else {
          textarea.value = res?.text || 'No fue posible generar el texto.';
          if (statusElem) statusElem.textContent = '';
        }
      } catch (err) {
        console.error('Error generando convocatoria:', err);
        textarea.value = 'Error al generar la convocatoria.';
        if (statusElem) statusElem.textContent = '';
      }
    }

    // Botones de acción
    document.getElementById('btn-regenerate-announcement').onclick = () => {
      triggerGeneration();
    };

    document.getElementById('btn-copy-announcement').onclick = () => {
      const text = textarea.value;
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        showToast('Texto de la convocatoria copiado al portapapeles', 'success');
      }).catch(() => {
        showToast('No se pudo copiar automáticamente', 'warning');
      });
    };

    const closeHandler = () => {
      modal.style.display = 'none';
      currentAnnouncementEvent = null;
    };

    document.getElementById('announcement-modal-close-btn').onclick = closeHandler;
    document.getElementById('announcement-modal-done-btn').onclick = closeHandler;

    // Generar primera vez
    triggerGeneration();
  }

  // ========================================================
  // PLANTILLAS RÁPIDAS DE EVENTOS ESCOLARES CATÓLICOS
  // ========================================================

  const schoolEventTemplates = [
    {
      title: 'Misa de Inicio de Año Escolar y Bendición',
      category: 'Misa',
      location: 'Patio Central / Gimnasio del Colegio',
      attendees: 'Toda la Comunidad Educativa y Docentes',
      description: 'Eucaristía solemne comunitaria para encomendar el año escolar a Dios, bendición de mochilas, cuadernos e insignias escolares.',
      checklist: [
        { id: 't1_1', text: 'Reservar patio/gimnasio y amplificación de sonido', done: false },
        { id: 't1_2', text: 'Confirmar sacerdote celebrante', done: false },
        { id: 't1_3', text: 'Coordinar coro y cantos con profesores de música', done: false },
        { id: 't1_4', text: 'Asignar lectores de 1ra lectura, salmo y peticiones', done: false },
        { id: 't1_5', text: 'Preparar ofrendas escolares (mochila, cirio, pan y vino)', done: false },
        { id: 't1_6', text: 'Imprimir guiones litúrgicos para el altar', done: false }
      ]
    },
    {
      title: 'Misa de Primer Viernes de Mes',
      category: 'Misa',
      location: 'Capilla del Colegio',
      attendees: 'Docentes, Asistentes y Agentes Pastorales',
      description: 'Eucaristía mensual dedicada a la devoción al Sagrado Corazón de Jesús y la comunión fraternal de los educadores.',
      checklist: [
        { id: 't2_1', text: 'Reservar y preparar capilla (cáliz, corporales, hostias)', done: false },
        { id: 't2_2', text: 'Confirmar sacerdote celebrante', done: false },
        { id: 't2_3', text: 'Asignar departamento a cargo de las lecturas', done: false },
        { id: 't2_4', text: 'Preparar hojas de cantos litúrgicos', done: false },
        { id: 't2_5', text: 'Organizar momento de compartir fraterno post-misa', done: false }
      ]
    },
    {
      title: 'Vía Crucis Escolar de Semana Santa',
      category: 'Retiro',
      location: 'Patios y Capilla del Colegio',
      attendees: 'Todos los niveles de Enseñanza Básica y Media',
      description: 'Conmemoración del camino de la Cruz con estaciones preparadas reflexivamente por cada nivel y curso del colegio.',
      checklist: [
        { id: 't3_1', text: 'Asignar las 14 estaciones a cada curso o departamento', done: false },
        { id: 't3_2', text: 'Distribuir libreto de reflexiones y oraciones del Vía Crucis', done: false },
        { id: 't3_3', text: 'Confeccionar cruces y cirios para cada estación', done: false },
        { id: 't3_4', text: 'Coordinar desplazamiento ordenado y silencioso de los alumnos', done: false },
        { id: 't3_5', text: 'Preparar estación final de Resurrección y esperanza', done: false }
      ]
    },
    {
      title: 'Celebración y Cierre del Mes de María',
      category: 'Misa',
      location: 'Gruta de la Virgen / Patio Techado',
      attendees: 'Estudiantes, Familias y Educadores',
      description: 'Oración comunitaria del Santo Rosario y ofrenda de flores y compromisos a la Santísima Virgen María.',
      checklist: [
        { id: 't4_1', text: 'Adornar altar y gruta de la Virgen con flores y mantos', done: false },
        { id: 't4_2', text: 'Coordinar canastos para recepción de flores por curso', done: false },
        { id: 't4_3', text: 'Asignar misterios del rosario y oraciones a estudiantes', done: false },
        { id: 't4_4', text: 'Preparar coro mariano con cantos tradicionales', done: false },
        { id: 't4_5', text: 'Organizar ofrenda de alimentos para familias necesitadas', done: false }
      ]
    },
    {
      title: 'Retiro Espiritual de Formación y Fraternidad',
      category: 'Retiro',
      location: 'Casa de Retiros / Centro de Espiritualidad',
      attendees: 'Curso convocado y Equipo de Pastoral',
      description: 'Jornada formativa de introspección, dinámicas grupales, sacramento de la reconciliación y encuentro personal con Dios.',
      checklist: [
        { id: 't5_1', text: 'Reservar casa de retiros y transporte escolar', done: false },
        { id: 't5_2', text: 'Recolectar autorizaciones y fichas médicas de apoderados', done: false },
        { id: 't5_3', text: 'Preparar material impreso de trabajo y dinámicas', done: false },
        { id: 't5_4', text: 'Confirmar sacerdotes para confesiones', done: false },
        { id: 't5_5', text: 'Preparar espacio litúrgico (cruz, biblia, cirio, música suave)', done: false },
        { id: 't5_6', text: 'Coordinar colaciones y almuerzo comunitario', done: false }
      ]
    },
    {
      title: 'Misa de Graduación y Envío de Alumnos',
      category: 'Misa',
      location: 'Templo Parroquial / Gimnasio Mayor',
      attendees: 'Egresados, Padres, Apoderados y Docentes',
      description: 'Eucaristía solemne de acción de gracias por los años formativos, bendición especial y entrega de la Cruz de Envío.',
      checklist: [
        { id: 't6_1', text: 'Reservar templo y coordinar ensayo con los egresados', done: false },
        { id: 't6_2', text: 'Adquirir cruces de envío bendecidas para cada graduado', done: false },
        { id: 't6_3', text: 'Asignar discurso de acción de gracias a un estudiante', done: false },
        { id: 't6_4', text: 'Preparar bendición especial de los padres hacia sus hijos', done: false },
        { id: 't6_5', text: 'Imprimir guiones litúrgicos y folletos conmemorativos', done: false }
      ]
    },
    {
      title: 'Campaña Solidaria Fraterna y Canasta Familiar',
      category: 'Campaña',
      location: 'Colegio y Comunidad Beneficiaria',
      attendees: 'Todos los cursos, Centro de Alumnos y Familias',
      description: 'Recolección de alimentos no perecibles y enseres para apoyar a familias en situación de vulnerabilidad.',
      checklist: [
        { id: 't7_1', text: 'Diseñar y difundir afiche informativo con lista de alimentos', done: false },
        { id: 't7_2', text: 'Habilitar cajas y centros de acopio rotulados por curso', done: false },
        { id: 't7_3', text: 'Designar monitores de pastoral para conteo y clasificación', done: false },
        { id: 't7_4', text: 'Coordinar armado de canastas familiares y empaque digno', done: false },
        { id: 't7_5', text: 'Gestionar traslado y entrega directa y respetuosa', done: false },
        { id: 't7_6', text: 'Publicar carta de agradecimiento y balance de lo reunido', done: false }
      ]
    },
    {
      title: 'Jornada de Formación Pastoral y Carisma',
      category: 'Formación',
      location: 'Sala de Pastoral / Biblioteca',
      attendees: 'Docentes, Catequistas y Agentes Pastorales',
      description: 'Taller de profundización en el carisma escolar católico, reflexión teológica y renovación del compromiso evangelizador.',
      checklist: [
        { id: 't8_1', text: 'Definir expositor o tema formativo central', done: false },
        { id: 't8_2', text: 'Preparar material didáctico, lecturas bíblicas y preguntas guía', done: false },
        { id: 't8_3', text: 'Verificar proyector, sonido y conexión de computador', done: false },
        { id: 't8_4', text: 'Organizar café y momento de diálogo fraterno', done: false },
        { id: 't8_5', text: 'Evaluar acuerdos y metas pastorales para el año', done: false }
      ]
    }
  ];

  function openEventTemplatesModal() {
    const modal = document.getElementById('event-templates-modal');
    const container = document.getElementById('event-templates-container');
    if (!modal || !container) return;

    modal.style.display = 'flex';
    container.innerHTML = schoolEventTemplates.map((t, idx) => `
      <div class="template-preset-card" data-template-idx="${idx}">
        <div class="template-preset-header">
          <div>
            <h4 class="template-preset-title">${escapeHtml(t.title)}</h4>
            <p class="template-preset-desc">${escapeHtml(t.description)}</p>
          </div>
          <span class="legend-chip cat-${t.category.toLowerCase()}">${t.category}</span>
        </div>
        <div class="template-preset-meta">
          <span>📍 ${escapeHtml(t.location)}</span>
          &bull;
          <span>📋 ${t.checklist.length} tareas</span>
        </div>
        <button type="button" class="btn btn-sm btn-primary" style="align-self:flex-start; margin-top:4px;">Usar esta Plantilla</button>
      </div>
    `).join('');

    container.querySelectorAll('.template-preset-card').forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.templateIdx);
        const tmpl = schoolEventTemplates[idx];
        if (tmpl) {
          modal.style.display = 'none';
          openEventEditorModal({
            title: tmpl.title,
            category: tmpl.category,
            location: tmpl.location,
            attendees: tmpl.attendees,
            description: tmpl.description,
            checklist: JSON.parse(JSON.stringify(tmpl.checklist)),
            date: selectedDateStr
          });
        }
      });
    });

    const closeHandler = () => {
      modal.style.display = 'none';
    };

    document.getElementById('event-templates-close-btn').onclick = closeHandler;
    document.getElementById('event-templates-cancel-btn').onclick = closeHandler;
  }

  document.getElementById('btn-event-templates')?.addEventListener('click', () => {
    openEventTemplatesModal();
  });

  // Exportar Calendario a iCalendar (.ics)
  document.getElementById('events-export-ics-btn')?.addEventListener('click', () => {
    if (!state.events || state.events.length === 0) {
      showToast('No hay eventos para exportar a .ics', 'info');
      return;
    }

    let ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Organizador Pastoral//ES\r\nCALSCALE:GREGORIAN\r\n';

    state.events.forEach(e => {
      const dateClean = (e.date || '').replace(/-/g, '');
      const timeClean = e.time ? e.time.replace(/:/g, '') + '00' : '090000';
      const dtStart = `${dateClean}T${timeClean}`;

      ics += 'BEGIN:VEVENT\r\n';
      ics += `UID:${e.id}@pastoral\r\n`;
      ics += `SUMMARY:${escapeIcs(e.title)}\r\n`;
      ics += `DTSTART:${dtStart}\r\n`;
      if (e.location) ics += `LOCATION:${escapeIcs(e.location)}\r\n`;
      if (e.description) ics += `DESCRIPTION:${escapeIcs(e.description)}\r\n`;
      if (e.repeat === 'weekly') {
        ics += `RRULE:FREQ=WEEKLY${e.repeatUntil ? ';UNTIL=' + e.repeatUntil.replace(/-/g, '') + 'T235959Z' : ''}\r\n`;
      } else if (e.repeat === 'monthly') {
        ics += `RRULE:FREQ=MONTHLY${e.repeatUntil ? ';UNTIL=' + e.repeatUntil.replace(/-/g, '') + 'T235959Z' : ''}\r\n`;
      }
      ics += 'END:VEVENT\r\n';
    });

    ics += 'END:VCALENDAR\r\n';
    downloadBlob(ics, 'calendario-pastoral.ics', 'text/calendar;charset=utf-8;');
    showToast('Archivo .ics descargado con éxito', 'success');
  });

  function escapeIcs(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }

  // Imprimir Calendario
  document.getElementById('events-print-btn')?.addEventListener('click', async () => {
    const printArea = document.getElementById('print-area');
    if (!printArea) return;

    printArea.innerHTML = `
      <div style="font-family: sans-serif; padding: 20px;">
        <h1 style="color: #0f172a; border-bottom: 2px solid #d97706; padding-bottom: 8px;">
          ${escapeHtml(state.settings.schoolName || 'Pastoral')} - Calendario de Actividades
        </h1>
        <p style="color: #64748b; font-size: 0.9rem;">Impreso el ${new Date().toLocaleDateString('es-ES')}</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 0.9rem;">
          <thead>
            <tr style="background: #f1f5f9; text-align: left;">
              <th style="padding: 8px; border: 1px solid #cbd5e1;">Fecha / Hora</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1;">Evento</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1;">Categoría</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1;">Lugar</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1;">Descripción</th>
            </tr>
          </thead>
          <tbody>
            ${state.events.sort((a,b) => (a.date||'').localeCompare(b.date||'')).map(e => `
              <tr>
                <td style="padding: 8px; border: 1px solid #cbd5e1;">${e.date} ${e.time || ''}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold;">${escapeHtml(e.title)}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1;">${escapeHtml(e.category || '')}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1;">${escapeHtml(e.location || '')}</td>
                <td style="padding: 8px; border: 1px solid #cbd5e1;">${escapeHtml(e.description || '')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    try {
      await window.pastoral.printToPdf('calendario-pastoral.pdf');
      showToast('PDF de calendario generado', 'success');
    } catch (e) {
      window.print();
    }
  });

  // ========================================================
  // VISTA 4: TAREAS
  // ========================================================

  let currentTaskFilter = 'all'; // all | pending | completed

  function renderTasks() {
    const container = document.getElementById('tasks-list-container');
    const searchVal = (document.getElementById('tasks-search-input')?.value || '').toLowerCase().trim();
    const priorityVal = document.getElementById('tasks-priority-filter')?.value || 'all';
    if (!container) return;

    let list = state.tasks || [];

    // Conteos para tabs
    const allCount = list.length;
    const pendingCount = list.filter(t => !t.done).length;
    const completedCount = list.filter(t => t.done).length;

    document.getElementById('count-tasks-all').textContent = allCount;
    document.getElementById('count-tasks-pending').textContent = pendingCount;
    document.getElementById('count-tasks-completed').textContent = completedCount;

    // Filtro estado
    if (currentTaskFilter === 'pending') list = list.filter(t => !t.done);
    else if (currentTaskFilter === 'completed') list = list.filter(t => t.done);

    // Filtro prioridad
    if (priorityVal !== 'all') {
      list = list.filter(t => t.priority === priorityVal);
    }

    // Filtro búsqueda
    if (searchVal) {
      list = list.filter(t =>
        (t.title || '').toLowerCase().includes(searchVal) ||
        (t.notes || '').toLowerCase().includes(searchVal)
      );
    }

    if (list.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-muted);">
          <p>No se encontraron tareas con los filtros actuales</p>
        </div>
      `;
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    container.innerHTML = list.map(t => {
      const isOverdue = t.due && t.due < todayStr && !t.done;

      return `
        <div class="task-item ${t.done ? 'completed' : ''}" data-task-id="${t.id}">
          <div class="task-checkbox-wrap">
            <input type="checkbox" class="task-checkbox" ${t.done ? 'checked' : ''}>
          </div>
          <div class="task-content">
            <div class="task-title">${escapeHtml(t.title)}</div>
            <div class="task-meta-row">
              <span class="priority-badge priority-${t.priority}">${t.priority}</span>
              ${t.due ? `<span class="task-due ${isOverdue ? 'overdue' : ''}">📅 Límite: ${t.due} ${isOverdue ? '(Vencida)' : ''}</span>` : ''}
              ${t.notes ? `<span>💬 ${escapeHtml(t.notes)}</span>` : ''}
            </div>
          </div>
          <div class="task-actions">
            <button class="btn btn-icon btn-ghost btn-sm edit-task-btn" title="Editar">
              <svg viewBox="0 0 24 24" width="16" height="16"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </button>
            <button class="btn btn-icon btn-ghost btn-sm delete-task-btn" title="Eliminar">
              <svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Checkbox toggle
    container.querySelectorAll('.task-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const item = cb.closest('.task-item');
        const id = item.dataset.taskId;
        toggleTaskDone(id);
      });
    });

    // Editar y eliminar
    container.querySelectorAll('.edit-task-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.task-item');
        const id = item.dataset.taskId;
        const task = state.tasks.find(t => t.id === id);
        if (task) openTaskEditorModal(task);
      });
    });

    container.querySelectorAll('.delete-task-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.task-item');
        const id = item.dataset.taskId;
        openConfirmModal({
          title: 'Eliminar Tarea',
          message: '¿Deseas eliminar esta tarea de la lista?',
          confirmText: 'Eliminar',
          confirmBtnClass: 'btn-danger',
          onConfirm: () => {
            markDeleted(id);
            state.tasks = state.tasks.filter(t => t.id !== id);
            persistData();
            if (window.pastoralFirebase && typeof window.pastoralFirebase.pushState === 'function') {
              window.pastoralFirebase.pushState(state, true);
            }
            renderTasks();
            renderDashboard();
            updateTasksBadge();
            showToast('Tarea eliminada', 'info');
          }
        });
      });
    });
  }

  function toggleTaskDone(id) {
    const task = (state.tasks || []).find(t => t.id === id);
    if (task) {
      task.done = !task.done;
      task.updatedAt = new Date().toISOString();
      persistData();
      renderTasks();
      renderDashboard();
      updateTasksBadge();
      showToast(task.done ? 'Tarea completada' : 'Tarea pendiente', 'info');
    }
  }

  // Tabs de tareas
  document.querySelectorAll('#tasks-status-tabs .filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#tasks-status-tabs .filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTaskFilter = tab.dataset.filter;
      renderTasks();
    });
  });

  document.getElementById('tasks-search-input')?.addEventListener('input', () => renderTasks());
  document.getElementById('tasks-priority-filter')?.addEventListener('change', () => renderTasks());
  document.getElementById('btn-create-task')?.addEventListener('click', () => openTaskEditorModal());

  // Modal de Crear/Editar Tarea
  function openTaskEditorModal(task = null) {
    const isEdit = task && task.id;
    const titleVal = task ? task.title || '' : '';
    const dueVal = task ? task.due || '' : '';
    const priorityVal = task ? task.priority || 'media' : 'media';
    const notesVal = task ? task.notes || '' : '';

    openGenericModal({
      title: isEdit ? 'Editar Tarea' : 'Nueva Tarea Pastoral',
      bodyHtml: `
        <div class="form-group">
          <label for="modal-task-title">Descripción de la Tarea:</label>
          <input type="text" id="modal-task-title" value="${escapeHtml(titleVal)}" placeholder="ej: Comprar velas para la vigilia pascual">
        </div>
        <div class="form-row-2">
          <div class="form-group">
            <label for="modal-task-due">Fecha Límite:</label>
            <input type="date" id="modal-task-due" value="${dueVal}">
          </div>
          <div class="form-group">
            <label for="modal-task-priority">Prioridad:</label>
            <select id="modal-task-priority">
              <option value="alta" ${priorityVal === 'alta' ? 'selected' : ''}>Alta</option>
              <option value="media" ${priorityVal === 'media' ? 'selected' : ''}>Media</option>
              <option value="baja" ${priorityVal === 'baja' ? 'selected' : ''}>Baja</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label for="modal-task-notes">Notas adicionales:</label>
          <textarea id="modal-task-notes" rows="3" placeholder="Detalles de contacto, presupuesto o pasos a seguir...">${escapeHtml(notesVal)}</textarea>
        </div>
      `,
      onSave: () => {
        const title = document.getElementById('modal-task-title').value.trim();
        const due = document.getElementById('modal-task-due').value;
        const priority = document.getElementById('modal-task-priority').value;
        const notes = document.getElementById('modal-task-notes').value.trim();

        if (!title) {
          showToast('Por favor ingresa la descripción de la tarea.', 'warning');
          return false;
        }

        if (isEdit) {
          const idx = state.tasks.findIndex(t => t.id === task.id);
          if (idx !== -1) {
            state.tasks[idx] = { 
              ...state.tasks[idx], 
              title, 
              due, 
              priority, 
              notes,
              updatedAt: new Date().toISOString()
            };
          }
        } else {
          state.tasks.unshift({
            id: 't_' + Date.now(),
            title,
            due,
            priority,
            notes,
            done: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }

        persistData();
        renderTasks();
        renderDashboard();
        updateTasksBadge();
        showToast(isEdit ? 'Tarea actualizada' : 'Tarea añadida', 'success');
        return true;
      }
    });
  }

  // ========================================================
  // VISTA 5: COMUNIDAD (GRUPOS Y PERSONAS)
  // ========================================================

  let currentCommunitySubview = 'groups'; // groups | persons

  function renderCommunity() {
    const searchVal = (document.getElementById('community-search-input')?.value || '').toLowerCase().trim();
    const groupsCountElem = document.getElementById('count-groups');
    const personsCountElem = document.getElementById('count-persons');
    const btnLabel = document.getElementById('btn-create-community-label');

    if (groupsCountElem) groupsCountElem.textContent = (state.groups || []).length;
    if (personsCountElem) personsCountElem.textContent = (state.persons || []).length;
    if (btnLabel) {
      btnLabel.textContent = currentCommunitySubview === 'groups' ? 'Nuevo Grupo' : 'Nueva Persona';
    }

    const groupsView = document.getElementById('community-subview-groups');
    const personsView = document.getElementById('community-subview-persons');

    if (currentCommunitySubview === 'groups') {
      groupsView.style.display = 'block';
      personsView.style.display = 'none';
      renderGroups(searchVal);
    } else {
      groupsView.style.display = 'none';
      personsView.style.display = 'block';
      renderPersons(searchVal);
    }
  }

  function renderGroups(searchVal) {
    const container = document.getElementById('groups-container');
    if (!container) return;

    let list = state.groups || [];
    if (searchVal) {
      list = list.filter(g =>
        (g.name || '').toLowerCase().includes(searchVal) ||
        (g.leader || '').toLowerCase().includes(searchVal) ||
        (g.description || '').toLowerCase().includes(searchVal)
      );
    }

    if (list.length === 0) {
      container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:30px; color:var(--text-muted);">No hay grupos pastorales registrados</div>';
      return;
    }

    container.innerHTML = list.map(g => `
      <div class="community-card" data-group-id="${g.id}">
        <div class="community-card-header">
          <h4 class="community-name">${escapeHtml(g.name)}</h4>
          <div style="display:flex; gap:4px;">
            <button class="btn btn-icon btn-ghost btn-sm edit-group-btn" title="Editar">
              <svg viewBox="0 0 24 24" width="16" height="16"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </button>
            <button class="btn btn-icon btn-ghost btn-sm delete-group-btn" title="Eliminar">
              <svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </div>
        </div>
        ${g.leader ? `<div class="community-role">Coordinador: ${escapeHtml(g.leader)}</div>` : ''}
        ${g.description ? `<p class="community-detail-line">${escapeHtml(g.description)}</p>` : ''}
        ${g.members ? `<div class="community-detail-line" style="color:var(--text-muted); font-size:0.75rem; margin-top:8px;">Integrantes: ${escapeHtml(g.members)}</div>` : ''}
      </div>
    `).join('');

    container.querySelectorAll('.edit-group-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.closest('.community-card').dataset.groupId;
        const g = state.groups.find(x => x.id === id);
        if (g) openGroupEditorModal(g);
      });
    });

    container.querySelectorAll('.delete-group-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.closest('.community-card').dataset.groupId;
        openConfirmModal({
          title: 'Eliminar Grupo',
          message: '¿Deseas eliminar este grupo pastoral de la comunidad?',
          confirmText: 'Eliminar',
          confirmBtnClass: 'btn-danger',
          onConfirm: () => {
            markDeleted(id);
            state.groups = state.groups.filter(x => x.id !== id);
            persistData();
            if (window.pastoralFirebase && typeof window.pastoralFirebase.pushState === 'function') {
              window.pastoralFirebase.pushState(state, true);
            }
            renderCommunity();
            renderDashboard();
            showToast('Grupo eliminado', 'info');
          }
        });
      });
    });
  }

  function renderPersons(searchVal) {
    const container = document.getElementById('persons-container');
    if (!container) return;

    let list = state.persons || [];
    if (searchVal) {
      list = list.filter(p =>
        (p.name || '').toLowerCase().includes(searchVal) ||
        (p.role || '').toLowerCase().includes(searchVal) ||
        (p.group || '').toLowerCase().includes(searchVal) ||
        (p.contact || '').toLowerCase().includes(searchVal)
      );
    }

    if (list.length === 0) {
      container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:30px; color:var(--text-muted);">No hay personas registradas en el directorio</div>';
      return;
    }

    container.innerHTML = list.map(p => `
      <div class="community-card" data-person-id="${p.id}">
        <div class="community-card-header">
          <h4 class="community-name">${escapeHtml(p.name)}</h4>
          <div style="display:flex; gap:4px;">
            <button class="btn btn-icon btn-ghost btn-sm edit-person-btn" title="Editar">
              <svg viewBox="0 0 24 24" width="16" height="16"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </button>
            <button class="btn btn-icon btn-ghost btn-sm delete-person-btn" title="Eliminar">
              <svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </div>
        </div>
        ${p.role ? `<div class="community-role">${escapeHtml(p.role)}</div>` : ''}
        ${p.group ? `<div class="community-detail-line"><strong>Grupo:</strong> ${escapeHtml(p.group)}</div>` : ''}
        ${p.contact ? `<div class="community-detail-line"><strong>Contacto:</strong> ${escapeHtml(p.contact)}</div>` : ''}
        ${p.notes ? `<div class="community-detail-line" style="color:var(--text-muted); font-size:0.75rem;">${escapeHtml(p.notes)}</div>` : ''}
      </div>
    `).join('');

    container.querySelectorAll('.edit-person-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.closest('.community-card').dataset.personId;
        const p = state.persons.find(x => x.id === id);
        if (p) openPersonEditorModal(p);
      });
    });

    container.querySelectorAll('.delete-person-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.closest('.community-card').dataset.personId;
        openConfirmModal({
          title: 'Eliminar Persona',
          message: '¿Deseas eliminar a esta persona del directorio pastoral?',
          confirmText: 'Eliminar',
          confirmBtnClass: 'btn-danger',
          onConfirm: () => {
            markDeleted(id);
            state.persons = state.persons.filter(x => x.id !== id);
            persistData();
            if (window.pastoralFirebase && typeof window.pastoralFirebase.pushState === 'function') {
              window.pastoralFirebase.pushState(state, true);
            }
            renderCommunity();
            renderDashboard();
            showToast('Registro eliminado', 'info');
          }
        });
      });
    });
  }

  // Conmutador de subpestañas
  document.querySelectorAll('#community-subview-tabs .filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#community-subview-tabs .filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentCommunitySubview = tab.dataset.subview;
      renderCommunity();
    });
  });

  document.getElementById('community-search-input')?.addEventListener('input', () => renderCommunity());

  document.getElementById('btn-create-community-item')?.addEventListener('click', () => {
    if (currentCommunitySubview === 'groups') {
      openGroupEditorModal();
    } else {
      openPersonEditorModal();
    }
  });

  // Modal Grupo
  function openGroupEditorModal(group = null) {
    const isEdit = group && group.id;
    openGenericModal({
      title: isEdit ? 'Editar Grupo Pastoral' : 'Nuevo Grupo Pastoral',
      bodyHtml: `
        <div class="form-group">
          <label for="modal-g-name">Nombre del Grupo:</label>
          <input type="text" id="modal-g-name" value="${escapeHtml(group ? group.name : '')}" placeholder="ej: Grupo Juvenil Santo Domingo">
        </div>
        <div class="form-group">
          <label for="modal-g-leader">Coordinador / Responsable:</label>
          <input type="text" id="modal-g-leader" value="${escapeHtml(group ? group.leader : '')}" placeholder="ej: Prof. Ignacio">
        </div>
        <div class="form-group">
          <label for="modal-g-desc">Misión y Propósito:</label>
          <textarea id="modal-g-desc" rows="3" placeholder="Objetivos pastorales, días de reunión...">${escapeHtml(group ? group.description : '')}</textarea>
        </div>
        <div class="form-group">
          <label for="modal-g-members">Integrantes / Lista:</label>
          <input type="text" id="modal-g-members" value="${escapeHtml(group ? group.members : '')}" placeholder="Cantidad o nombres">
        </div>
      `,
      onSave: () => {
        const name = document.getElementById('modal-g-name').value.trim();
        const leader = document.getElementById('modal-g-leader').value.trim();
        const description = document.getElementById('modal-g-desc').value.trim();
        const members = document.getElementById('modal-g-members').value.trim();

        if (!name) {
          showToast('El nombre del grupo es obligatorio.', 'warning');
          return false;
        }

        if (isEdit) {
          const idx = state.groups.findIndex(g => g.id === group.id);
          if (idx !== -1) {
            state.groups[idx] = { ...state.groups[idx], name, leader, description, members };
          }
        } else {
          state.groups.push({
            id: 'g_' + Date.now(),
            name, leader, description, members
          });
        }

        persistData();
        renderCommunity();
        renderDashboard();
        showToast(isEdit ? 'Grupo actualizado' : 'Grupo registrado', 'success');
        return true;
      }
    });
  }

  // Modal Persona
  function openPersonEditorModal(person = null) {
    const isEdit = person && person.id;
    openGenericModal({
      title: isEdit ? 'Editar Ficha de Persona' : 'Nueva Persona en Comunidad',
      bodyHtml: `
        <div class="form-group">
          <label for="modal-p-name">Nombre y Apellido:</label>
          <input type="text" id="modal-p-name" value="${escapeHtml(person ? person.name : '')}" placeholder="ej: María González">
        </div>
        <div class="form-row-2">
          <div class="form-group">
            <label for="modal-p-role">Rol Pastoral:</label>
            <input type="text" id="modal-p-role" value="${escapeHtml(person ? person.role : '')}" placeholder="ej: Catequista, Acólito, Docente">
          </div>
          <div class="form-group">
            <label for="modal-p-group">Grupo de Pertenencia:</label>
            <input type="text" id="modal-p-group" value="${escapeHtml(person ? person.group : '')}" placeholder="ej: Coro, Pastoral Juvenil">
          </div>
        </div>
        <div class="form-group">
          <label for="modal-p-contact">Contacto (Teléfono o Correo):</label>
          <input type="text" id="modal-p-contact" value="${escapeHtml(person ? person.contact : '')}" placeholder="ej: maria@colegio.cl | +56 9 ...">
        </div>
        <div class="form-group">
          <label for="modal-p-notes">Notas Pastorales:</label>
          <textarea id="modal-p-notes" rows="2" placeholder="Observaciones, talentos particulares, disponibilidad...">${escapeHtml(person ? person.notes : '')}</textarea>
        </div>
      `,
      onSave: () => {
        const name = document.getElementById('modal-p-name').value.trim();
        const role = document.getElementById('modal-p-role').value.trim();
        const group = document.getElementById('modal-p-group').value.trim();
        const contact = document.getElementById('modal-p-contact').value.trim();
        const notes = document.getElementById('modal-p-notes').value.trim();

        if (!name) {
          showToast('El nombre es obligatorio.', 'warning');
          return false;
        }

        if (isEdit) {
          const idx = state.persons.findIndex(p => p.id === person.id);
          if (idx !== -1) {
            state.persons[idx] = { ...state.persons[idx], name, role, group, contact, notes };
          }
        } else {
          state.persons.push({
            id: 'p_' + Date.now(),
            name, role, group, contact, notes
          });
        }

        persistData();
        renderCommunity();
        renderDashboard();
        showToast(isEdit ? 'Persona actualizada' : 'Persona agregada', 'success');
        return true;
      }
    });
  }

  // Exportar Comunidad a CSV
  document.getElementById('community-export-csv-btn')?.addEventListener('click', () => {
    let csv = '\uFEFFTipo,Nombre,Rol o Coordinador,Grupo o Integrantes,Contacto,Notas\n';
    (state.groups || []).forEach(g => {
      csv += `"Grupo","${escapeCsv(g.name)}","${escapeCsv(g.leader)}","${escapeCsv(g.members)}","","${escapeCsv(g.description)}"\n`;
    });
    (state.persons || []).forEach(p => {
      csv += `"Persona","${escapeCsv(p.name)}","${escapeCsv(p.role)}","${escapeCsv(p.group)}","${escapeCsv(p.contact)}","${escapeCsv(p.notes)}"\n`;
    });

    downloadBlob(csv, 'comunidad-pastoral.csv', 'text/csv;charset=utf-8;');
    showToast('Directorio exportado a CSV', 'success');
  });

  // Exportar Comunidad a PDF
  document.getElementById('community-export-pdf-btn')?.addEventListener('click', async () => {
    const printArea = document.getElementById('print-area');
    if (!printArea) return;

    printArea.innerHTML = `
      <div style="font-family: sans-serif; padding: 20px;">
        <h1 style="color: #0f172a; border-bottom: 2px solid #d97706; padding-bottom: 8px;">
          ${escapeHtml(state.settings.schoolName || 'Pastoral')} - Directorio de Comunidad
        </h1>
        <h2 style="margin-top: 20px; color:#2563eb;">Grupos Pastorales</h2>
        <ul>
          ${(state.groups || []).map(g => `<li><strong>${escapeHtml(g.name)}</strong> (Coordinador: ${escapeHtml(g.leader || 'Sin asignar')}) - ${escapeHtml(g.description || '')}</li>`).join('')}
        </ul>
        <h2 style="margin-top: 20px; color:#2563eb;">Personas y Agentes</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
          <thead>
            <tr style="background: #f1f5f9;">
              <th style="padding: 6px; border: 1px solid #cbd5e1;">Nombre</th>
              <th style="padding: 6px; border: 1px solid #cbd5e1;">Rol</th>
              <th style="padding: 6px; border: 1px solid #cbd5e1;">Grupo</th>
              <th style="padding: 6px; border: 1px solid #cbd5e1;">Contacto</th>
            </tr>
          </thead>
          <tbody>
            ${(state.persons || []).map(p => `
              <tr>
                <td style="padding: 6px; border: 1px solid #cbd5e1;">${escapeHtml(p.name)}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1;">${escapeHtml(p.role || '')}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1;">${escapeHtml(p.group || '')}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1;">${escapeHtml(p.contact || '')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    try {
      await window.pastoral.printToPdf('directorio-comunidad.pdf');
      showToast('PDF de comunidad generado', 'success');
    } catch (e) {
      window.print();
    }
  });

  // ========================================================
  // VISTA: GUIONES LITÚRGICOS Y MISAS ESCOLARES
  // ========================================================

  let activeScriptFilter = 'all';

  function renderLiturgicalScriptsView() {
    // Las plantillas son un catálogo independiente: aquí solo mostramos las celebraciones registradas por el usuario
    const scripts = (state.liturgicalScripts || []).filter(s => s && s.id && !s.id.startsWith('template-'));
    const container = document.getElementById('scripts-container');
    const searchInput = document.getElementById('scripts-search-input');
    const query = (searchInput?.value || '').toLowerCase().trim();
    const countAll = document.getElementById('count-scripts-all');

    if (countAll) countAll.textContent = scripts.length;

    if (!container) return;

    let filtered = scripts.filter(s => {
      if (activeScriptFilter !== 'all' && s.type !== activeScriptFilter) return false;
      if (query) {
        const titleMatch = (s.title || '').toLowerCase().includes(query);
        const themeMatch = (s.theme || '').toLowerCase().includes(query);
        const courseMatch = (s.course || '').toLowerCase().includes(query);
        return titleMatch || themeMatch || courseMatch;
      }
      return true;
    });

    if (filtered.length === 0) {
      if (query || activeScriptFilter !== 'all') {
        container.innerHTML = `
          <div class="empty-state-card" style="grid-column: 1 / -1; padding: 50px 20px;">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="var(--text-muted)"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            <h3>No se encontraron guiones litúrgicos</h3>
            <p>No hay guiones registrados que coincidan con la búsqueda o el filtro seleccionado.</p>
          </div>
        `;
      } else {
        container.innerHTML = `
          <div class="empty-state-card" style="grid-column: 1 / -1; padding: 50px 20px; text-align: center;">
            <div style="width:64px; height:64px; border-radius:50%; background:rgba(245, 158, 11, 0.12); display:flex; align-items:center; justify-content:center; margin:0 auto 16px;">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="#f59e0b"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
            </div>
            <h3 style="font-size:1.15rem; font-weight:700; margin-bottom:8px;">No tienes misas ni guiones registrados aún</h3>
            <p style="max-width:540px; margin:0 auto 20px; color:var(--text-muted); font-size:0.92rem; line-height:1.5;">
              Las plantillas ahora son independientes como en el calendario escolar. Puedes explorar el catálogo de plantillas para comenzar con una celebración preconfigurada o redactar una nueva en blanco.
            </p>
            <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
              <button class="btn btn-primary" id="btn-empty-open-templates">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
                <span>Explorar Catálogo de Plantillas</span>
              </button>
              <button class="btn btn-secondary" id="btn-empty-new-script">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                <span>Nuevo Guión en Blanco</span>
              </button>
            </div>
          </div>
        `;
        document.getElementById('btn-empty-open-templates')?.addEventListener('click', () => {
          openLiturgicalTemplatesModal();
        });
        document.getElementById('btn-empty-new-script')?.addEventListener('click', () => {
          openScriptEditorModal();
        });
      }
      return;
    }

    container.innerHTML = filtered.map(s => {
      const petitionsCount = Array.isArray(s.petitions) ? s.petitions.length : 0;
      const offeringsCount = Array.isArray(s.offertory?.offerings) ? s.offertory.offerings.length : 0;
      return `
        <div class="script-card-item" data-id="${s.id}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
            <h3 class="script-card-title">${escapeHtml(s.title)}</h3>
            <span class="moment-badge" style="background:rgba(245,158,11,0.15); color:#b45309;">${escapeHtml(s.type || 'Misa Escolar')}</span>
          </div>
          <div class="script-card-meta">
            ${s.date ? `<span>📅 ${escapeHtml(s.date)}</span>` : ''}
            ${s.course ? `<span>🎒 ${escapeHtml(s.course)}</span>` : ''}
            ${s.celebrant ? `<span>✝️ ${escapeHtml(s.celebrant)}</span>` : ''}
            <span>🙌 ${petitionsCount} peticiones</span>
            <span>🍞 ${offeringsCount} ofrendas</span>
          </div>
          ${s.theme ? `<p class="script-card-theme">«${escapeHtml(s.theme)}»</p>` : ''}
          <div class="script-card-actions">
            <button class="btn btn-sm btn-secondary btn-edit-script" data-id="${s.id}">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
              <span>Ver / Editar</span>
            </button>
            <button class="btn btn-sm btn-primary btn-print-script" data-id="${s.id}" title="Imprimir guión para lectores y sacerdote">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>
              <span>Imprimir</span>
            </button>
            <button class="btn btn-sm btn-ghost btn-copy-script" data-id="${s.id}" title="Copiar guión completo">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
              <span>Copiar</span>
            </button>
            <button class="btn btn-sm btn-ghost btn-delete-script text-danger" data-id="${s.id}" title="Eliminar guión">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Eventos de botones en tarjetas
    container.querySelectorAll('.btn-edit-script').forEach(btn => {
      btn.addEventListener('click', () => {
        const script = (state.liturgicalScripts || []).find(s => s.id === btn.dataset.id);
        if (script) openScriptEditorModal(script);
      });
    });

    container.querySelectorAll('.btn-print-script').forEach(btn => {
      btn.addEventListener('click', () => {
        const script = (state.liturgicalScripts || []).find(s => s.id === btn.dataset.id);
        if (script) printLiturgicalScript(script);
      });
    });

    container.querySelectorAll('.btn-copy-script').forEach(btn => {
      btn.addEventListener('click', () => {
        const script = (state.liturgicalScripts || []).find(s => s.id === btn.dataset.id);
        if (script) copyLiturgicalScript(script);
      });
    });

    container.querySelectorAll('.btn-delete-script').forEach(btn => {
      btn.addEventListener('click', () => {
        openConfirmModal({
          title: 'Eliminar Guión Litúrgico',
          message: '¿Estás seguro de que deseas eliminar este guión de celebración? Esta acción no se puede deshacer.',
          confirmText: 'Eliminar',
          confirmBtnClass: 'btn-danger',
          onConfirm: () => {
            state.liturgicalScripts = (state.liturgicalScripts || []).filter(s => s.id !== btn.dataset.id);
            persistData();
            renderLiturgicalScriptsView();
            showToast('Guión eliminado correctamente', 'info');
          }
        });
      });
    });
  }

  // Filtrado de guiones litúrgicos
  document.querySelectorAll('#script-filter-tabs .filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#script-filter-tabs .filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeScriptFilter = tab.dataset.filter;
      renderLiturgicalScriptsView();
    });
  });

  document.getElementById('scripts-search-input')?.addEventListener('input', () => {
    renderLiturgicalScriptsView();
  });

  // Modal de edición de guión
  function openScriptEditorModal(script = null) {
    const modal = document.getElementById('script-editor-modal');
    if (!modal) return;

    const isEdit = Boolean(script && script.id && !script.id.startsWith('template-'));
    document.getElementById('script-edit-id').value = isEdit ? script.id : '';
    document.getElementById('script-modal-title').textContent = isEdit 
      ? 'Editar Guión Litúrgico' 
      : (script?.title ? `Nuevo Guión: ${script.title}` : 'Nuevo Guión Litúrgico');

    document.getElementById('script-input-title').value = script?.title || '';
    document.getElementById('script-input-type').value = script?.type || 'Misa Escolar';
    document.getElementById('script-input-date').value = script?.date || new Date().toISOString().split('T')[0];
    document.getElementById('script-input-course').value = script?.course || '';
    document.getElementById('script-input-celebrant').value = script?.celebrant || '';
    document.getElementById('script-input-theme').value = script?.theme || '';

    // Ritos iniciales
    document.getElementById('script-input-entrance-com').value = script?.initialRites?.entranceCommentary || '';
    document.getElementById('script-input-entrance-song').value = script?.initialRites?.entranceSong || '';
    document.getElementById('script-input-penitential').value = script?.initialRites?.penitentialAct || '';

    // Palabra
    document.getElementById('script-input-word-com').value = script?.wordLiturgy?.wordCommentary || '';
    document.getElementById('script-input-first-reading').value = script?.wordLiturgy?.firstReading || '';
    document.getElementById('script-input-psalm').value = script?.wordLiturgy?.psalm || '';
    document.getElementById('script-input-gospel').value = script?.wordLiturgy?.gospel || '';

    // Peticiones
    renderScriptPetitionsEditor(script?.petitions || []);

    // Ofrendas
    document.getElementById('script-input-offertory-com').value = script?.offertory?.offertoryCommentary || '';
    document.getElementById('script-input-offertory-song').value = script?.offertory?.offertorySong || '';
    renderScriptOfferingsEditor(script?.offertory?.offerings || []);

    // Comunión y Envío
    document.getElementById('script-input-communion-com').value = script?.communion?.communionCommentary || '';
    document.getElementById('script-input-communion-song').value = script?.communion?.communionSong || '';
    document.getElementById('script-input-thanksgiving').value = script?.concludingRites?.thanksgivingPrayer || '';
    document.getElementById('script-input-recessional-song').value = script?.concludingRites?.recessionalSong || '';

    modal.style.display = 'flex';
  }

  function renderScriptPetitionsEditor(petitions = []) {
    const container = document.getElementById('script-petitions-container');
    if (!container) return;

    if (petitions.length === 0) {
      petitions = [
        { intention: 'Por la Iglesia y por el Papa Francisco.', response: 'Te lo pedimos, Señor.' },
        { intention: 'Por nuestra comunidad escolar, profesores y estudiantes.', response: 'Te lo pedimos, Señor.' }
      ];
    }

    container.innerHTML = petitions.map((p, idx) => `
      <div class="petition-item-row" data-index="${idx}">
        <input type="text" class="petition-intent-input form-control" style="flex:2;" value="${escapeHtml(p.intention || '')}" placeholder="Intención...">
        <input type="text" class="petition-resp-input form-control" style="flex:1;" value="${escapeHtml(p.response || 'Te lo pedimos, Señor.')}" placeholder="Respuesta...">
        <button type="button" class="btn btn-icon btn-sm text-danger btn-remove-pet">&times;</button>
      </div>
    `).join('');

    container.querySelectorAll('.btn-remove-pet').forEach(btn => {
      btn.addEventListener('click', (e) => {
        btn.closest('.petition-item-row').remove();
      });
    });
  }

  document.getElementById('script-btn-add-petition')?.addEventListener('click', () => {
    const container = document.getElementById('script-petitions-container');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'petition-item-row';
    div.innerHTML = `
      <input type="text" class="petition-intent-input form-control" style="flex:2;" placeholder="Intención...">
      <input type="text" class="petition-resp-input form-control" style="flex:1;" value="Te lo pedimos, Señor." placeholder="Respuesta...">
      <button type="button" class="btn btn-icon btn-sm text-danger btn-remove-pet">&times;</button>
    `;
    div.querySelector('.btn-remove-pet').addEventListener('click', () => div.remove());
    container.appendChild(div);
  });

  function renderScriptOfferingsEditor(offerings = []) {
    const container = document.getElementById('script-offerings-container');
    if (!container) return;

    if (offerings.length === 0) {
      offerings = [
        { item: 'Pan y Vino', meaning: 'Cuerpo y Sangre de Cristo.' },
        { item: 'Cuadernos y Libros', meaning: 'El esfuerzo de nuestro estudio diario.' }
      ];
    }

    container.innerHTML = offerings.map((o, idx) => `
      <div class="offering-item-row" data-index="${idx}">
        <input type="text" class="offering-item-input form-control" style="flex:1;" value="${escapeHtml(o.item || '')}" placeholder="Signo u ofrenda...">
        <input type="text" class="offering-mean-input form-control" style="flex:2;" value="${escapeHtml(o.meaning || '')}" placeholder="Significado escolar/pastoral...">
        <button type="button" class="btn btn-icon btn-sm text-danger btn-remove-off">&times;</button>
      </div>
    `).join('');

    container.querySelectorAll('.btn-remove-off').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.offering-item-row').remove();
      });
    });
  }

  document.getElementById('script-btn-add-offering')?.addEventListener('click', () => {
    const container = document.getElementById('script-offerings-container');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'offering-item-row';
    div.innerHTML = `
      <input type="text" class="offering-item-input form-control" style="flex:1;" placeholder="Signo u ofrenda...">
      <input type="text" class="offering-mean-input form-control" style="flex:2;" placeholder="Significado escolar/pastoral...">
      <button type="button" class="btn btn-icon btn-sm text-danger btn-remove-off">&times;</button>
    `;
    div.querySelector('.btn-remove-off').addEventListener('click', () => div.remove());
    container.appendChild(div);
  });

  // Cargar plantilla dentro del editor desde el catálogo independiente
  document.querySelectorAll('.btn-load-tmpl').forEach(btn => {
    btn.addEventListener('click', () => {
      const tmplId = btn.dataset.templateId;
      const tmpl = liturgicalTemplatesCatalog.find(t => t.id === tmplId);
      if (tmpl) {
        document.getElementById('script-input-title').value = tmpl.title;
        document.getElementById('script-input-type').value = tmpl.type;
        document.getElementById('script-input-theme').value = tmpl.theme || '';
        document.getElementById('script-input-entrance-com').value = tmpl.initialRites?.entranceCommentary || '';
        document.getElementById('script-input-entrance-song').value = tmpl.initialRites?.entranceSong || '';
        document.getElementById('script-input-penitential').value = tmpl.initialRites?.penitentialAct || '';
        document.getElementById('script-input-word-com').value = tmpl.wordLiturgy?.wordCommentary || '';
        document.getElementById('script-input-first-reading').value = tmpl.wordLiturgy?.firstReading || '';
        document.getElementById('script-input-psalm').value = tmpl.wordLiturgy?.psalm || '';
        document.getElementById('script-input-gospel').value = tmpl.wordLiturgy?.gospel || '';
        renderScriptPetitionsEditor(tmpl.petitions || []);
        document.getElementById('script-input-offertory-com').value = tmpl.offertory?.offertoryCommentary || '';
        document.getElementById('script-input-offertory-song').value = tmpl.offertory?.offertorySong || '';
        renderScriptOfferingsEditor(tmpl.offertory?.offerings || []);
        document.getElementById('script-input-communion-com').value = tmpl.communion?.communionCommentary || '';
        document.getElementById('script-input-communion-song').value = tmpl.communion?.communionSong || '';
        document.getElementById('script-input-thanksgiving').value = tmpl.concludingRites?.thanksgivingPrayer || '';
        document.getElementById('script-input-recessional-song').value = tmpl.concludingRites?.recessionalSong || '';
        showToast('Plantilla cargada en el editor', 'info');
      }
    });
  });

  // Guardar Guión
  document.getElementById('script-editor-save-btn')?.addEventListener('click', () => {
    const title = document.getElementById('script-input-title').value.trim();
    if (!title) {
      showToast('Por favor ingresa un título para la celebración', 'warning');
      return;
    }

    const id = document.getElementById('script-edit-id').value || `script-${Date.now()}`;

    // Recoger peticiones
    const petitions = [];
    document.querySelectorAll('#script-petitions-container .petition-item-row').forEach(row => {
      const intention = row.querySelector('.petition-intent-input')?.value.trim();
      const response = row.querySelector('.petition-resp-input')?.value.trim();
      if (intention) petitions.push({ intention, response: response || 'Te lo pedimos, Señor.' });
    });

    // Recoger ofrendas
    const offerings = [];
    document.querySelectorAll('#script-offerings-container .offering-item-row').forEach(row => {
      const item = row.querySelector('.offering-item-input')?.value.trim();
      const meaning = row.querySelector('.offering-mean-input')?.value.trim();
      if (item) offerings.push({ item, meaning });
    });

    const scriptData = {
      id,
      title,
      type: document.getElementById('script-input-type').value,
      date: document.getElementById('script-input-date').value,
      course: document.getElementById('script-input-course').value.trim(),
      celebrant: document.getElementById('script-input-celebrant').value.trim(),
      theme: document.getElementById('script-input-theme').value.trim(),
      initialRites: {
        entranceCommentary: document.getElementById('script-input-entrance-com').value.trim(),
        entranceSong: document.getElementById('script-input-entrance-song').value.trim(),
        penitentialAct: document.getElementById('script-input-penitential').value.trim()
      },
      wordLiturgy: {
        wordCommentary: document.getElementById('script-input-word-com').value.trim(),
        firstReading: document.getElementById('script-input-first-reading').value.trim(),
        psalm: document.getElementById('script-input-psalm').value.trim(),
        gospel: document.getElementById('script-input-gospel').value.trim()
      },
      petitions,
      offertory: {
        offertoryCommentary: document.getElementById('script-input-offertory-com').value.trim(),
        offerings,
        offertorySong: document.getElementById('script-input-offertory-song').value.trim()
      },
      communion: {
        communionCommentary: document.getElementById('script-input-communion-com').value.trim(),
        communionSong: document.getElementById('script-input-communion-song').value.trim()
      },
      concludingRites: {
        thanksgivingPrayer: document.getElementById('script-input-thanksgiving').value.trim(),
        recessionalSong: document.getElementById('script-input-recessional-song').value.trim()
      }
    };

    if (!Array.isArray(state.liturgicalScripts)) state.liturgicalScripts = [];
    const idx = state.liturgicalScripts.findIndex(s => s.id === id);
    if (idx >= 0) {
      state.liturgicalScripts[idx] = scriptData;
    } else {
      state.liturgicalScripts.unshift(scriptData);
    }

    persistData();
    renderLiturgicalScriptsView();
    document.getElementById('script-editor-modal').style.display = 'none';
    showToast('Guión litúrgico guardado con éxito', 'success');
  });

  document.getElementById('script-editor-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('script-editor-modal').style.display = 'none';
  });

  document.getElementById('script-editor-close-btn')?.addEventListener('click', () => {
    document.getElementById('script-editor-modal').style.display = 'none';
  });

  document.getElementById('btn-new-script')?.addEventListener('click', () => {
    openScriptEditorModal();
  });

  // ========================================================
  // MODAL: CATÁLOGO INDEPENDIENTE DE PLANTILLAS LITÚRGICAS
  // ========================================================

  async function openLiturgicalTemplatesModal() {
    const modal = document.getElementById('liturgical-templates-modal');
    const container = document.getElementById('liturgical-templates-container');
    if (!modal || !container) return;

    if (liturgicalTemplatesCatalog.length === 0 && window.pastoral?.liturgicalTemplates?.list) {
      try {
        const res = await window.pastoral.liturgicalTemplates.list();
        if (res?.success && Array.isArray(res.templates) && res.templates.length > 0) {
          liturgicalTemplatesCatalog = res.templates;
        }
      } catch (err) {
        console.warn('Error al cargar catálogo de plantillas litúrgicas:', err);
      }
    }

    modal.style.display = 'flex';
    container.innerHTML = liturgicalTemplatesCatalog.map((t, idx) => {
      const petitionsCount = Array.isArray(t.petitions) ? t.petitions.length : 0;
      const offeringsCount = Array.isArray(t.offertory?.offerings) ? t.offertory.offerings.length : 0;
      return `
        <div class="template-preset-card liturgical-preset-card" data-template-idx="${idx}">
          <div class="template-preset-header">
            <div>
              <h4 class="template-preset-title">${escapeHtml(t.title)}</h4>
              <p class="template-preset-desc">${escapeHtml(t.theme || '')}</p>
            </div>
            <span class="legend-chip cat-misa" style="white-space:nowrap; font-size:0.75rem;">${escapeHtml(t.type || 'Misa')}</span>
          </div>
          <div class="template-preset-meta" style="flex-wrap:wrap; gap:8px;">
            <span>🙌 ${petitionsCount} peticiones</span>
            &bull;
            <span>🍞 ${offeringsCount} ofrendas</span>
            &bull;
            <span>🎵 ${escapeHtml(t.initialRites?.entranceSong || 'Canto')}</span>
          </div>
          <button type="button" class="btn btn-sm btn-primary" style="align-self:flex-start; margin-top:4px;">
            Usar esta Plantilla
          </button>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.liturgical-preset-card').forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.templateIdx);
        const tmpl = liturgicalTemplatesCatalog[idx];
        if (tmpl) {
          useLiturgicalTemplate(tmpl);
        }
      });
    });

    const closeHandler = () => {
      modal.style.display = 'none';
    };

    document.getElementById('liturgical-templates-close-btn').onclick = closeHandler;
    document.getElementById('liturgical-templates-cancel-btn').onclick = closeHandler;
  }

  function useLiturgicalTemplate(tmpl) {
    const modal = document.getElementById('liturgical-templates-modal');
    if (modal) modal.style.display = 'none';

    // Generar nuevo guión independiente basado en la plantilla, sin guardarlo aún en state.liturgicalScripts
    const cleanTemplateData = {
      id: '', // Se asignará script-${Date.now()} cuando el usuario pulse 'Guardar Guión'
      title: tmpl.title,
      type: tmpl.type || 'Misa Escolar',
      date: new Date().toISOString().split('T')[0],
      course: '',
      celebrant: '',
      theme: tmpl.theme || '',
      initialRites: JSON.parse(JSON.stringify(tmpl.initialRites || {})),
      wordLiturgy: JSON.parse(JSON.stringify(tmpl.wordLiturgy || {})),
      petitions: JSON.parse(JSON.stringify(tmpl.petitions || [])),
      offertory: JSON.parse(JSON.stringify(tmpl.offertory || {})),
      communion: JSON.parse(JSON.stringify(tmpl.communion || {})),
      concludingRites: JSON.parse(JSON.stringify(tmpl.concludingRites || {}))
    };

    openScriptEditorModal(cleanTemplateData);
    showToast(`Plantilla "${tmpl.title}" cargada en el editor`, 'info');
  }

  document.getElementById('btn-liturgical-templates')?.addEventListener('click', () => {
    openLiturgicalTemplatesModal();
  });

  document.getElementById('btn-editor-open-templates')?.addEventListener('click', () => {
    openLiturgicalTemplatesModal();
  });

  // Botón Crear Guión con Asistente IA
  document.getElementById('btn-ai-create-script')?.addEventListener('click', () => {
    switchView('ai-chat');
    const textarea = document.getElementById('chat-textarea');
    if (textarea) {
      textarea.value = `Hola, necesito que prepares un guión litúrgico completo para una Misa escolar católica en nuestro colegio. 
Tema/Ocasión: (ej: Inicio de clases / Primer Viernes / Graduación)
Curso destinatario: (ej: Todo el colegio / 8° Básico)
Por favor incluye: Monición de entrada, sugerencia de lecturas y Evangelio, 5 peticiones escolares, monición de ofrendas con signos escolares y acción de gracias.`;
      textarea.focus();
    }
  });

  // Imprimir Guión Litúrgico con formato limpio
  function printLiturgicalScript(s) {
    const printArea = document.getElementById('print-area');
    if (!printArea || !s) return;

    const schoolName = state.settings.schoolName || 'Colegio Católico';

    printArea.innerHTML = `
      <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 800px; margin: 0 auto; padding: 30px; color: #111; line-height: 1.6;">
        <div style="text-align: center; border-bottom: 2px solid #991b1b; padding-bottom: 14px; margin-bottom: 24px;">
          <h4 style="margin: 0; color: #991b1b; text-transform: uppercase; font-size: 0.95rem; letter-spacing: 0.1em;">${escapeHtml(schoolName)} • Pastoral Litúrgica</h4>
          <h1 style="margin: 10px 0 6px 0; font-size: 1.85rem; color: #111;">${escapeHtml(s.title)}</h1>
          <p style="margin: 0; font-size: 0.95rem; color: #555; font-style: italic;">
            ${s.date ? `Fecha: ${escapeHtml(s.date)} • ` : ''}
            ${s.course ? `Curso: ${escapeHtml(s.course)} • ` : ''}
            ${s.celebrant ? `Celebrante: ${escapeHtml(s.celebrant)}` : ''}
          </p>
          ${s.theme ? `<p style="margin: 6px 0 0 0; font-weight: bold; color: #991b1b;">«${escapeHtml(s.theme)}»</p>` : ''}
        </div>

        <!-- 1. RITOS INICIALES -->
        <h3 style="color: #991b1b; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; font-size: 1.15rem; margin-top: 24px;">I. RITOS INICIALES</h3>
        ${s.initialRites?.entranceCommentary ? `
          <p><em style="color: #991b1b;">Monición de Entrada (Monitor):</em><br>${escapeHtml(s.initialRites.entranceCommentary)}</p>
        ` : ''}
        ${s.initialRites?.entranceSong ? `<p><em style="color: #991b1b;">Canto de Entrada:</em> <strong>${escapeHtml(s.initialRites.entranceSong)}</strong></p>` : ''}
        ${s.initialRites?.penitentialAct ? `
          <p><em style="color: #991b1b;">Acto Penitencial:</em><br>${escapeHtml(s.initialRites.penitentialAct).replace(/\n/g, '<br>')}</p>
        ` : ''}

        <!-- 2. LITURGIA DE LA PALABRA -->
        <h3 style="color: #991b1b; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; font-size: 1.15rem; margin-top: 24px;">II. LITURGIA DE LA PALABRA</h3>
        ${s.wordLiturgy?.wordCommentary ? `<p><em style="color: #991b1b;">Monición a las Lecturas:</em><br>${escapeHtml(s.wordLiturgy.wordCommentary)}</p>` : ''}
        ${s.wordLiturgy?.firstReading ? `<p><em style="color: #991b1b;">Primera Lectura:</em><br>${escapeHtml(s.wordLiturgy.firstReading).replace(/\n/g, '<br>')}</p>` : ''}
        ${s.wordLiturgy?.psalm ? `<p><em style="color: #991b1b;">Salmo Responsorial:</em><br>${escapeHtml(s.wordLiturgy.psalm).replace(/\n/g, '<br>')}</p>` : ''}
        ${s.wordLiturgy?.gospel ? `<p><em style="color: #991b1b;">Santo Evangelio:</em><br>${escapeHtml(s.wordLiturgy.gospel).replace(/\n/g, '<br>')}</p>` : ''}

        <!-- 3. ORACIÓN UNIVERSAL -->
        <h3 style="color: #991b1b; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; font-size: 1.15rem; margin-top: 24px;">III. ORACIÓN UNIVERSAL (PETICIONES)</h3>
        ${Array.isArray(s.petitions) && s.petitions.length > 0 ? `
          <ol style="padding-left: 20px;">
            ${s.petitions.map(p => `
              <li style="margin-bottom: 8px;">
                ${escapeHtml(p.intention)} <br>
                <strong style="color: #991b1b;">R: ${escapeHtml(p.response || 'Te lo pedimos, Señor.')}</strong>
              </li>
            `).join('')}
          </ol>
        ` : '<p><em>No hay peticiones registradas.</em></p>'}

        <!-- 4. LITURGIA EUCARÍSTICA / OFRENDAS -->
        <h3 style="color: #991b1b; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; font-size: 1.15rem; margin-top: 24px;">IV. PRESENTACIÓN DE DONES Y OFRENDAS</h3>
        ${s.offertory?.offertoryCommentary ? `<p><em style="color: #991b1b;">Monición de Ofrendas:</em><br>${escapeHtml(s.offertory.offertoryCommentary)}</p>` : ''}
        ${Array.isArray(s.offertory?.offerings) && s.offertory.offerings.length > 0 ? `
          <ul>
            ${s.offertory.offerings.map(o => `
              <li style="margin-bottom: 6px;">
                <strong>${escapeHtml(o.item)}:</strong> ${escapeHtml(o.meaning)}
              </li>
            `).join('')}
          </ul>
        ` : ''}
        ${s.offertory?.offertorySong ? `<p><em style="color: #991b1b;">Canto de Ofertorio:</em> <strong>${escapeHtml(s.offertory.offertorySong)}</strong></p>` : ''}

        <!-- 5. COMUNIÓN Y CONCLUSIÓN -->
        <h3 style="color: #991b1b; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; font-size: 1.15rem; margin-top: 24px;">V. RITO DE COMUNIÓN Y ENVÍO</h3>
        ${s.communion?.communionCommentary ? `<p><em style="color: #991b1b;">Monición de Comunión:</em><br>${escapeHtml(s.communion.communionCommentary)}</p>` : ''}
        ${s.communion?.communionSong ? `<p><em style="color: #991b1b;">Canto de Comunión:</em> <strong>${escapeHtml(s.communion.communionSong)}</strong></p>` : ''}
        ${s.concludingRites?.thanksgivingPrayer ? `<p><em style="color: #991b1b;">Acción de Gracias:</em><br>${escapeHtml(s.concludingRites.thanksgivingPrayer)}</p>` : ''}
        ${s.concludingRites?.recessionalSong ? `<p><em style="color: #991b1b;">Canto de Salida:</em> <strong>${escapeHtml(s.concludingRites.recessionalSong)}</strong></p>` : ''}
      </div>
    `;

    window.print();
  }

  // Copiar Guión al portapapeles
  function copyLiturgicalScript(s) {
    if (!s) return;
    const petitionsText = (s.petitions || []).map((p, i) => `${i + 1}. ${p.intention} (R: ${p.response})`).join('\n');
    const offeringsText = (s.offertory?.offerings || []).map(o => `• ${o.item}: ${o.meaning}`).join('\n');

    const txt = [
      `📜 GUIÓN LITÚRGICO: ${s.title} (${s.type})`,
      s.theme ? `Lema: «${s.theme}»` : '',
      s.course ? `Curso: ${s.course}` : '',
      `\nI. RITOS INICIALES`,
      s.initialRites?.entranceCommentary ? `Monición de Entrada: ${s.initialRites.entranceCommentary}` : '',
      s.initialRites?.entranceSong ? `Canto de Entrada: ${s.initialRites.entranceSong}` : '',
      `\nII. LITURGIA DE LA PALABRA`,
      s.wordLiturgy?.firstReading ? `Primera Lectura:\n${s.wordLiturgy.firstReading}` : '',
      s.wordLiturgy?.gospel ? `Evangelio:\n${s.wordLiturgy.gospel}` : '',
      `\nIII. PETICIONES:\n${petitionsText}`,
      `\nIV. PRESENTACIÓN DE OFRENDAS:\n${offeringsText}`,
      s.offertory?.offertorySong ? `Canto Ofertorio: ${s.offertory.offertorySong}` : '',
      `\nV. COMUNIÓN Y CONCLUSIÓN`,
      s.communion?.communionSong ? `Canto Comunión: ${s.communion.communionSong}` : '',
      s.concludingRites?.thanksgivingPrayer ? `Acción de Gracias:\n${s.concludingRites.thanksgivingPrayer}` : '',
      s.concludingRites?.recessionalSong ? `Canto Salida: ${s.concludingRites.recessionalSong}` : ''
    ].filter(Boolean).join('\n\n');

    navigator.clipboard.writeText(txt).then(() => {
      showToast('¡Guión litúrgico copiado al portapapeles!', 'success');
    });
  }

  // ========================================================
  // VISTA: CANCIONERO PASTORAL Y LITÚRGICO
  // ========================================================

  let currentSelectedSongId = null;
  let currentSongSemitones = 0;
  let showChordsInSong = true;
  let songNotation = 'latin'; // 'latin' (Do, Re, Mi) o 'anglo' (C, D, E)
  let songFontSize = 15; // px (12 a 24)
  let activeSongCategoryFilter = 'all';

  const CHROMATIC_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const CHROMATIC_FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

  const ANGLO_TO_LATIN = {
    'C': 'Do', 'D': 'Re', 'E': 'Mi', 'F': 'Fa', 'G': 'Sol', 'A': 'La', 'B': 'Si'
  };

  function formatChordNotationLocal(chord, notation = songNotation) {
    if (!chord) return '';
    if (notation === 'anglo') return chord;
    return chord.replace(/([A-G])([b#]?)/g, (m, note, acc) => {
      return (ANGLO_TO_LATIN[note] || note) + acc;
    });
  }

  function transposeSingleChord(chord, semitones) {
    if (!chord || semitones === 0) return chord;
    const match = chord.match(/^([A-G][b#]?)(.*)$/);
    if (!match) return chord;
    const root = match[1];
    const suffix = match[2] || '';
    let idx = CHROMATIC_SCALE.indexOf(root);
    if (idx === -1) idx = CHROMATIC_FLATS.indexOf(root);
    if (idx === -1) return chord;
    let newIdx = (idx + semitones) % 12;
    if (newIdx < 0) newIdx += 12;
    const useFlats = root.includes('b') || ['F', 'Bb', 'Eb', 'Ab'].includes(CHROMATIC_FLATS[newIdx]);
    const newRoot = useFlats ? CHROMATIC_FLATS[newIdx] : CHROMATIC_SCALE[newIdx];
    if (suffix.includes('/')) {
      const parts = suffix.split('/');
      return `${newRoot}${parts[0]}/${transposeSingleChord(parts[1], semitones)}`;
    }
    return `${newRoot}${suffix}`;
  }

  function transposeSongLyrics(text, semitones) {
    if (!text) return '';
    if (semitones === 0) return text;
    return text.replace(/\[([A-G][b#]?(?:m|maj|min|dim|aug|sus[24]?|[0-9]+|\/[A-G][b#]?)?)\]/g, (_, c) => `[${transposeSingleChord(c, semitones)}]`);
  }

  function stripSongChords(text) {
    if (!text) return '';
    return text.replace(/\[([A-G][b#]?(?:m|maj|min|dim|aug|sus[24]?|[0-9]+|\/[A-G][b#]?)?)\]/g, '').replace(/  +/g, ' ');
  }

  const SECTION_TAG_REGEX = /^\s*\[(CORO|ESTRIBILLO|ESTROFA\s*\d*|PUENTE|INTRO|FINAL|ESTROFA)\]\s*$/i;

  function parseChordLyricsLocal(lyricsText, semitones = 0, notation = songNotation) {
    if (!lyricsText) return { sections: [], chordsUsed: [] };
    const lines = lyricsText.split(/\r?\n/);
    const sections = [];
    const chordsUsedSet = new Set();
    let currentSection = { type: 'verse', label: '', lines: [] };

    lines.forEach(rawLine => {
      const trimmed = rawLine.trim();
      const secMatch = trimmed.match(SECTION_TAG_REGEX);
      if (secMatch) {
        if (currentSection.lines.length > 0 || currentSection.label) {
          sections.push(currentSection);
        }
        const label = secMatch[1].toUpperCase();
        const isChorus = label.includes('CORO') || label.includes('ESTRIBILLO');
        currentSection = { type: isChorus ? 'chorus' : 'verse', label, lines: [] };
        return;
      }

      if (!trimmed) {
        if (currentSection.lines.length > 0) {
          currentSection.lines.push({ type: 'empty' });
        }
        return;
      }

      // Auto-sanar acordes incrustados dentro de palabras (ej. sem[A7]brando -> [A7]sembrando)
      const normalizedLine = rawLine.replace(/([a-záéíóúñA-ZÁÉÍÓÚÑ]+)\[([A-G][b#]?[^\]]*)\]([a-záéíóúñA-ZÁÉÍÓÚÑ]+)/g, (_, p1, p2, p3) => '[' + p2 + ']' + p1 + p3);

      const tokens = [];
      const regex = /\[([A-G][b#]?(?:m|maj|min|dim|aug|sus[24]?|[0-9]+|\/[A-G][b#]?)?)\]/g;
      let lastIdx = 0;
      let currentChord = null;
      let match;

      function pushToken(chord, text) {
        let t = text;
        if (tokens.length === 0) {
          t = t.replace(/^\s+/, '');
        } else if (tokens[tokens.length - 1].text.endsWith(' ') && t.startsWith(' ')) {
          t = t.replace(/^\s+/, '');
        }
        tokens.push({ chord: chord || null, text: t || '\u00A0' });
      }

      regex.lastIndex = 0;
      while ((match = regex.exec(normalizedLine)) !== null) {
        const textBefore = normalizedLine.slice(lastIdx, match.index);
        if (textBefore.length > 0 || currentChord !== null) {
          const trans = currentChord ? transposeSingleChord(currentChord, semitones) : null;
          const displayChord = trans ? formatChordNotationLocal(trans, notation) : null;
          if (displayChord) chordsUsedSet.add(displayChord);
          pushToken(displayChord, textBefore);
        }
        currentChord = match[1];
        lastIdx = regex.lastIndex;
      }

      const remainingText = normalizedLine.slice(lastIdx);
      if (remainingText.length > 0 || currentChord !== null) {
        const trans = currentChord ? transposeSingleChord(currentChord, semitones) : null;
        const displayChord = trans ? formatChordNotationLocal(trans, notation) : null;
        if (displayChord) chordsUsedSet.add(displayChord);
        pushToken(displayChord, remainingText);
      }

      currentSection.lines.push({ type: 'line', tokens });
    });

    if (currentSection.lines.length > 0 || currentSection.label) {
      sections.push(currentSection);
    }

    return {
      sections,
      chordsUsed: Array.from(chordsUsedSet)
    };
  }

  function getCategorySlug(cat) {
    if (!cat) return 'entrada';
    const c = cat.toLowerCase();
    if (c.includes('entrada')) return 'entrada';
    if (c.includes('piedad')) return 'piedad';
    if (c.includes('gloria')) return 'gloria';
    if (c.includes('salmo') || c.includes('aclamaci')) return 'salmo';
    if (c.includes('ofertorio')) return 'ofertorio';
    if (c.includes('santo')) return 'santo';
    if (c.includes('paz') || c.includes('cordero')) return 'paz';
    if (c.includes('comuni')) return 'comunion';
    if (c.includes('salida')) return 'salida';
    if (c.includes('mariano')) return 'mariano';
    if (c.includes('alabanza')) return 'alabanza';
    return 'entrada';
  }

  function renderSongbookView() {
    const songs = state.songs || [];
    const listContainer = document.getElementById('songs-list-container');
    const searchInput = document.getElementById('songs-search-input');
    const query = (searchInput?.value || '').toLowerCase().trim();
    const countBadge = document.getElementById('sidebar-songs-count');
    const countAll = document.getElementById('count-songs-all');

    if (countBadge) countBadge.textContent = songs.length;
    if (countAll) countAll.textContent = songs.length;

    if (!listContainer) return;

    let filtered = songs.filter(s => {
      if (activeSongCategoryFilter !== 'all' && s.category !== activeSongCategoryFilter) return false;
      if (query) {
        const titleMatch = (s.title || '').toLowerCase().includes(query);
        const authorMatch = (s.author || '').toLowerCase().includes(query);
        const lyricsMatch = (s.lyricsWithChords || '').toLowerCase().includes(query);
        return titleMatch || authorMatch || lyricsMatch;
      }
      return true;
    });

    if (filtered.length === 0) {
      listContainer.innerHTML = '<div class="empty-state-card" style="padding:30px 10px;"><p>No se encontraron cantos con este criterio.</p></div>';
    } else {
      listContainer.innerHTML = filtered.map(s => {
        const isActive = s.id === currentSelectedSongId;
        const catSlug = getCategorySlug(s.category);
        const keyDisplay = formatChordNotationLocal(s.key || 'C', songNotation);

        return `
          <div class="song-card-item ${isActive ? 'active' : ''}" data-id="${s.id}">
            <div style="flex:1; min-width:0;">
              <div class="song-card-title">${escapeHtml(s.title)}</div>
              <div class="song-card-author">${escapeHtml(s.author || 'Tradicional Católico')}</div>
            </div>
            <div class="song-card-badges">
              <span class="moment-badge badge-${catSlug}">${escapeHtml(s.category || 'Misa')}</span>
              <span class="key-pill">${escapeHtml(keyDisplay)}</span>
            </div>
          </div>
        `;
      }).join('');

      listContainer.querySelectorAll('.song-card-item').forEach(item => {
        item.addEventListener('click', () => {
          const songId = item.dataset.id;
          currentSelectedSongId = songId;
          currentSongSemitones = 0;
          renderSongbookView();
        });
      });
    }

    // Si hay una canción seleccionada, renderizar su visor a la derecha
    const selectedSong = songs.find(s => s.id === currentSelectedSongId) || filtered[0];
    if (selectedSong) {
      currentSelectedSongId = selectedSong.id;
      renderSongViewer(selectedSong);
    }
  }

  function renderSongViewer(song) {
    const viewer = document.getElementById('song-viewer-container');
    if (!viewer || !song) return;

    // Calcular tono base y tono actual
    const baseKey = song.key || 'C';
    const currentKeyRaw = transposeSingleChord(baseKey, currentSongSemitones);
    const currentKeyDisplay = formatChordNotationLocal(currentKeyRaw, songNotation);
    const baseKeyDisplay = formatChordNotationLocal(baseKey, songNotation);

    // Parsear canción en bloques de estrofa/coro y fichas armónicas
    const parsed = parseChordLyricsLocal(song.lyricsWithChords || '', currentSongSemitones, songNotation);
    const catSlug = getCategorySlug(song.category);

    // Generar HTML de la letra
    let lyricsHtml = '';
    if (parsed.sections.length === 0) {
      lyricsHtml = '<div style="color:var(--text-muted); padding:20px;">Sin letra registrada.</div>';
    } else {
      lyricsHtml = parsed.sections.map(sec => {
        const isChorus = sec.type === 'chorus';
        const tagIcon = isChorus ? '🔔 ' : '';
        const tagHtml = sec.label ? `
          <div class="song-section-tag">
            <span class="section-tag-badge ${isChorus ? 'badge-chorus' : 'badge-verse'}">
              ${tagIcon}${escapeHtml(sec.label)}
            </span>
          </div>
        ` : '';

        const linesHtml = sec.lines.map(ln => {
          if (ln.type === 'empty') return '<div class="song-line-break"></div>';

          if (showChordsInSong) {
            return `
              <div class="song-line-row">
                ${ln.tokens.map(tok => `
                  <span class="chord-token">
                    <span class="chord-name">${tok.chord ? escapeHtml(tok.chord) : '&nbsp;'}</span>
                    <span class="lyric-syllable">${escapeHtml(tok.text)}</span>
                  </span>
                `).join('')}
              </div>
            `;
          } else {
            const cleanText = ln.tokens.map(tok => tok.text).join('');
            return `<div class="song-lyrics-line-clean">${escapeHtml(cleanText)}</div>`;
          }
        }).join('');

        return `
          <div class="song-section-block ${isChorus ? 'section-chorus' : 'section-verse'}">
            ${tagHtml}
            <div class="song-section-body">${linesHtml}</div>
          </div>
        `;
      }).join('');
    }

    // Tira de acordes utilizados
    const chordsPaletteHtml = parsed.chordsUsed.length > 0 ? `
      <div class="chord-palette-bar">
        <span class="chord-palette-title">🎸 Acordes en este tono (${currentKeyDisplay}):</span>
        <div class="chord-palette-chips">
          ${parsed.chordsUsed.map(c => `<span class="chord-palette-chip">${escapeHtml(c)}</span>`).join('')}
        </div>
      </div>
    ` : '';

    viewer.innerHTML = `
      <div class="song-viewer-header">
        <div>
          <h2 class="song-viewer-title">${escapeHtml(song.title)}</h2>
          <div class="song-viewer-meta">
            ${song.author ? `<span class="meta-chip">👤 ${escapeHtml(song.author)}</span>` : ''}
            <span class="moment-badge badge-${catSlug}">${escapeHtml(song.category || 'Misa')}</span>
            <span class="meta-chip">🎼 Tono base: <strong>${baseKeyDisplay}</strong></span>
            ${song.tempo ? `<span class="meta-chip">⏱️ ${escapeHtml(song.tempo)}</span>` : ''}
            ${song.timeSignature ? `<span class="meta-chip">🎵 Compás: ${escapeHtml(song.timeSignature)}</span>` : ''}
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-sm btn-secondary" id="btn-edit-active-song" title="Editar letra o acordes">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            <span>Editar</span>
          </button>
          <button class="btn btn-sm btn-primary" id="btn-print-active-song" title="Imprimir hoja de este canto">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>
            <span>Imprimir</span>
          </button>
          <button class="btn btn-sm btn-ghost" id="btn-copy-active-song" title="Copiar letra al portapapeles">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
          </button>
          <button class="btn btn-sm btn-ghost text-danger" id="btn-delete-active-song" title="Eliminar canto del catálogo">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      </div>

      <!-- Barra de controles y ajustes en vivo -->
      <div class="songbook-controls-bar">
        <!-- Grupo 1: Transposición -->
        <div class="control-cluster">
          <span class="control-label">Tono:</span>
          <button class="btn btn-sm btn-secondary" id="btn-transpose-down" title="Bajar medio tono">-1/2</button>
          <span class="chord-current-badge">${currentKeyDisplay} ${currentSongSemitones !== 0 ? `(${currentSongSemitones > 0 ? '+' : ''}${currentSongSemitones})` : ''}</span>
          <button class="btn btn-sm btn-secondary" id="btn-transpose-up" title="Subir medio tono">+1/2</button>
          ${currentSongSemitones !== 0 ? `<button class="btn btn-sm btn-ghost" id="btn-transpose-reset" title="Restaurar tono base">Restaurar</button>` : ''}
        </div>

        <!-- Grupo 2: Sistema de Notación -->
        <div class="control-cluster">
          <span class="control-label">Notación:</span>
          <div class="segmented-control" style="background:var(--bg-surface);">
            <button class="btn btn-sm ${songNotation === 'latin' ? 'btn-primary' : 'btn-ghost'}" id="btn-notation-latin" title="Do, Re, Mi, Fa, Sol, La, Si">Do-Re-Mi</button>
            <button class="btn btn-sm ${songNotation === 'anglo' ? 'btn-primary' : 'btn-ghost'}" id="btn-notation-anglo" title="C, D, E, F, G, A, B">C-D-E</button>
          </div>
        </div>

        <!-- Grupo 3: Modo de vista -->
        <div class="control-cluster">
          <div class="segmented-control" style="background:var(--bg-surface);">
            <button class="btn btn-sm ${showChordsInSong ? 'btn-primary' : 'btn-ghost'}" id="btn-view-with-chords" title="Ver con acordes sobre cada palabra">🎸 Con Acordes</button>
            <button class="btn btn-sm ${!showChordsInSong ? 'btn-primary' : 'btn-ghost'}" id="btn-view-lyrics-only" title="Ver solo la letra para cantar o proyectar">📄 Solo Letra</button>
          </div>
        </div>

        <!-- Grupo 4: Zoom de fuente -->
        <div class="control-cluster">
          <span class="control-label">Tamaño:</span>
          <button class="btn btn-sm btn-secondary" id="btn-zoom-out" title="Reducir tamaño de letra">A-</button>
          <button class="btn btn-sm btn-secondary" id="btn-zoom-in" title="Aumentar tamaño de letra">A+</button>
        </div>
      </div>

      <!-- Tira de acordes -->
      ${chordsPaletteHtml}

      <!-- Contenedor con la hoja del canto -->
      <div class="song-sheet-viewer" style="font-size: ${songFontSize}px;">
        ${lyricsHtml}
      </div>
    `;

    // Listeners interactivos del visor
    document.getElementById('btn-transpose-down')?.addEventListener('click', () => {
      currentSongSemitones--;
      renderSongViewer(song);
    });

    document.getElementById('btn-transpose-up')?.addEventListener('click', () => {
      currentSongSemitones++;
      renderSongViewer(song);
    });

    document.getElementById('btn-transpose-reset')?.addEventListener('click', () => {
      currentSongSemitones = 0;
      renderSongViewer(song);
    });

    document.getElementById('btn-notation-latin')?.addEventListener('click', () => {
      songNotation = 'latin';
      renderSongViewer(song);
    });

    document.getElementById('btn-notation-anglo')?.addEventListener('click', () => {
      songNotation = 'anglo';
      renderSongViewer(song);
    });

    document.getElementById('btn-view-with-chords')?.addEventListener('click', () => {
      showChordsInSong = true;
      renderSongViewer(song);
    });

    document.getElementById('btn-view-lyrics-only')?.addEventListener('click', () => {
      showChordsInSong = false;
      renderSongViewer(song);
    });

    document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
      if (songFontSize > 12) {
        songFontSize -= 1;
        const sheet = viewer.querySelector('.song-sheet-viewer');
        if (sheet) sheet.style.fontSize = `${songFontSize}px`;
      }
    });

    document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
      if (songFontSize < 24) {
        songFontSize += 1;
        const sheet = viewer.querySelector('.song-sheet-viewer');
        if (sheet) sheet.style.fontSize = `${songFontSize}px`;
      }
    });

    document.getElementById('btn-edit-active-song')?.addEventListener('click', () => {
      openSongEditorModal(song);
    });

    document.getElementById('btn-copy-active-song')?.addEventListener('click', () => {
      const cleanLyrics = stripSongChords(song.lyricsWithChords || '');
      const fullText = `${song.title}\n${song.author ? 'Autor: ' + song.author + '\n' : ''}Tono: ${currentKeyDisplay}\n\n${cleanLyrics}`;
      navigator.clipboard.writeText(fullText).then(() => {
        showToast('¡Letra copiada al portapapeles!', 'success');
      });
    });

    document.getElementById('btn-print-active-song')?.addEventListener('click', () => {
      printSongSheet(song, currentSongSemitones, showChordsInSong, songNotation);
    });

    document.getElementById('btn-delete-active-song')?.addEventListener('click', () => {
      openConfirmModal({
        title: 'Eliminar Canción',
        message: `¿Estás seguro de que deseas eliminar «${song.title}» del cancionero?`,
        confirmText: 'Eliminar',
        confirmBtnClass: 'btn-danger',
        onConfirm: () => {
          state.songs = (state.songs || []).filter(s => s.id !== song.id);
          persistData();
          currentSelectedSongId = null;
          renderSongbookView();
          showToast('Canción eliminada del cancionero', 'info');
        }
      });
    });
  }

  // Filtrado de cantos por categoría
  document.querySelectorAll('#song-filter-tabs .filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#song-filter-tabs .filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeSongCategoryFilter = tab.dataset.category;
      renderSongbookView();
    });
  });

  document.getElementById('songs-search-input')?.addEventListener('input', () => {
    renderSongbookView();
  });

  // Restaurar Catálogo Oficial de 25 cantos
  document.getElementById('btn-reset-default-songs')?.addEventListener('click', () => {
    openConfirmModal({
      title: 'Restaurar Catálogo Oficial',
      message: '¿Deseas actualizar el cancionero oficial con los 25 cantos corregidos con estructura de Coros, Estrofas y acordes sobre la letra? Tus cantos creados se conservarán.',
      confirmText: 'Restaurar',
      confirmBtnClass: 'btn-primary',
      onConfirm: async () => {
        const res = await window.pastoral.songs.resetDefaults();
        if (res.success && Array.isArray(res.songs)) {
          state.songs = res.songs;
          currentSelectedSongId = null;
          renderSongbookView();
          showToast('Cancionero actualizado con formato estructurado', 'success');
        } else {
          showToast('Error al restaurar: ' + (res.error || 'Desconocido'), 'error');
        }
      }
    });
  });

  // Editor de Canción
  function openSongEditorModal(song = null) {
    const modal = document.getElementById('song-editor-modal');
    if (!modal) return;

    document.getElementById('song-edit-id').value = song ? song.id : '';
    document.getElementById('song-modal-title').textContent = song ? 'Editar Canción' : 'Nueva Canción Pastoral';

    document.getElementById('song-input-title').value = song?.title || '';
    document.getElementById('song-input-author').value = song?.author || '';
    document.getElementById('song-input-category').value = song?.category || 'Entrada';
    document.getElementById('song-input-key').value = song?.key || 'C';
    document.getElementById('song-input-tempo').value = song?.tempo || '';
    document.getElementById('song-input-lyrics').value = song?.lyricsWithChords || '';

    modal.style.display = 'flex';
  }

  // Botones de inserción rápida de tags en el modal de canciones
  document.querySelectorAll('.btn-quick-insert-tag').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      const textarea = document.getElementById('song-input-lyrics');
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const val = textarea.value;
        textarea.value = val.substring(0, start) + tag + val.substring(end);
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + tag.length;
      }
    });
  });

  document.getElementById('btn-new-song')?.addEventListener('click', () => {
    openSongEditorModal();
  });

  document.getElementById('song-editor-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('song-editor-modal').style.display = 'none';
  });

  document.getElementById('song-editor-close-btn')?.addEventListener('click', () => {
    document.getElementById('song-editor-modal').style.display = 'none';
  });

  document.getElementById('song-editor-save-btn')?.addEventListener('click', () => {
    const title = document.getElementById('song-input-title').value.trim();
    if (!title) {
      showToast('Por favor escribe el título del canto', 'warning');
      return;
    }

    const lyrics = document.getElementById('song-input-lyrics').value.trim();
    if (!lyrics) {
      showToast('Por favor escribe la letra del canto', 'warning');
      return;
    }

    const id = document.getElementById('song-edit-id').value || `song-${Date.now()}`;
    const songData = {
      id,
      title,
      author: document.getElementById('song-input-author').value.trim(),
      category: document.getElementById('song-input-category').value,
      key: document.getElementById('song-input-key').value.trim() || 'C',
      tempo: document.getElementById('song-input-tempo').value.trim(),
      lyricsWithChords: lyrics
    };

    if (!Array.isArray(state.songs)) state.songs = [];
    const idx = state.songs.findIndex(s => s.id === id);
    if (idx >= 0) {
      state.songs[idx] = songData;
    } else {
      state.songs.unshift(songData);
    }

    persistData();
    currentSelectedSongId = id;
    currentSongSemitones = 0;
    renderSongbookView();
    document.getElementById('song-editor-modal').style.display = 'none';
    showToast(idx >= 0 ? 'Canción actualizada' : 'Canción agregada al cancionero', 'success');
  });

  // Imprimir Hoja de Canción Maquetada Limpia
  function printSongSheet(song, semitones = 0, withChords = true, notation = songNotation) {
    const printArea = document.getElementById('print-area');
    if (!printArea || !song) return;

    const schoolName = state.settings.schoolName || 'Colegio Católico';
    const parsed = parseChordLyricsLocal(song.lyricsWithChords || '', semitones, notation);
    const keyRaw = transposeSingleChord(song.key || 'C', semitones);
    const keyDisplay = formatChordNotationLocal(keyRaw, notation);

    let sheetContentHtml = '';
    parsed.sections.forEach(sec => {
      const isChorus = sec.type === 'chorus';
      const labelText = sec.label ? `[${escapeHtml(sec.label)}]` : '';

      const lines = sec.lines.map(ln => {
        if (ln.type === 'empty') return '<div style="height:12px;"></div>';

        if (withChords) {
          return `
            <div style="display:flex; flex-wrap:wrap; align-items:flex-end; margin-bottom:3px; line-height:1;">
              ${ln.tokens.map(tok => `
                <span style="display:inline-flex; flex-direction:column; vertical-align:bottom; min-width:max-content;">
                  <span style="font-family:'Consolas',monospace; font-weight:bold; font-size:0.85rem; color:#b45309; line-height:1.2; min-height:1.25em; white-space:pre;">${tok.chord ? escapeHtml(tok.chord) : '&nbsp;'}</span>
                  <span style="font-family:Arial,sans-serif; font-size:1.02rem; line-height:1.4; color:#111; white-space:pre;">${escapeHtml(tok.text)}</span>
                </span>
              `).join('')}
            </div>
          `;
        } else {
          const txt = ln.tokens.map(tok => tok.text).join('');
          return `<div style="font-family:Arial,sans-serif; font-size:1.05rem; line-height:1.6; color:#111; margin-bottom:4px; ${isChorus ? 'font-weight:600;' : ''}">${escapeHtml(txt)}</div>`;
        }
      }).join('');

      sheetContentHtml += `
        <div style="margin-bottom:18px; ${isChorus ? 'border-left:3px solid #b45309; padding-left:12px; background:#fffbeb;' : 'padding-left:4px;'}">
          ${labelText ? `<div style="font-size:0.8rem; font-weight:bold; color:#b45309; text-transform:uppercase; margin-bottom:6px;">${labelText}</div>` : ''}
          ${lines}
        </div>
      `;
    });

    printArea.innerHTML = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 24px; color: #111;">
        <div style="border-bottom: 2px solid #b45309; padding-bottom: 12px; margin-bottom: 20px; display:flex; justify-content:space-between; align-items:flex-end;">
          <div>
            <div style="font-size: 0.85rem; color: #b45309; font-weight: bold; text-transform: uppercase; margin-bottom: 4px;">
              ${escapeHtml(schoolName)} • Pastoral y Música Litúrgica
            </div>
            <h1 style="margin: 0; font-size: 1.8rem; color: #111;">${escapeHtml(song.title)}</h1>
            <p style="margin: 6px 0 0 0; color: #555; font-size: 0.92rem;">
              ${song.author ? `Autor: <strong>${escapeHtml(song.author)}</strong> • ` : ''}
              Momento: <strong>${escapeHtml(song.category || 'Misa')}</strong>
              ${withChords ? ` • Tono: <strong>${escapeHtml(keyDisplay)}</strong>` : ''}
              ${song.tempo ? ` • Tempo: ${escapeHtml(song.tempo)}` : ''}
            </p>
          </div>
          <div style="text-align:right;">
            <span style="font-size:0.8rem; padding:4px 8px; border:1px solid #b45309; border-radius:4px; font-weight:bold; color:#b45309;">
              ${withChords ? '🎸 Hojas para Coro / Músicos' : '📄 Hoja de Asamblea / Alumnos'}
            </span>
          </div>
        </div>

        <div style="margin-top: 20px;">
          ${sheetContentHtml}
        </div>
      </div>
    `;

    window.print();
  }

  // Modal: Armador de Lista de Misa (Repertorio)
  function openMassRepertoireModal() {
    const modal = document.getElementById('mass-repertoire-modal');
    if (!modal) return;

    const songs = state.songs || [];
    const categories = [
      { id: 'rep-select-entrada', cat: 'Entrada' },
      { id: 'rep-select-piedad', cat: 'Piedad' },
      { id: 'rep-select-gloria', cat: 'Gloria' },
      { id: 'rep-select-ofertorio', cat: 'Ofertorio' },
      { id: 'rep-select-santo', cat: 'Santo' },
      { id: 'rep-select-paz', cat: 'Paz/Cordero' },
      { id: 'rep-select-comunion', cat: 'Comunión' },
      { id: 'rep-select-salida', cat: 'Salida' }
    ];

    categories.forEach(({ id, cat }) => {
      const select = document.getElementById(id);
      if (!select) return;
      const catSongs = songs.filter(s => s.category === cat || cat === 'all');
      select.innerHTML = '<option value="">-- Ninguno seleccionado --</option>' + catSongs.map(s => `
        <option value="${s.id}">${escapeHtml(s.title)} (${escapeHtml(s.key || 'C')})</option>
      `).join('');
    });

    modal.style.display = 'flex';
  }

  document.getElementById('btn-open-mass-repertoire')?.addEventListener('click', () => {
    openMassRepertoireModal();
  });

  document.getElementById('repertoire-modal-close-btn')?.addEventListener('click', () => {
    document.getElementById('mass-repertoire-modal').style.display = 'none';
  });

  document.getElementById('repertoire-copy-btn')?.addEventListener('click', () => {
    const list = getSelectedRepertoireSongs();
    if (list.length === 0) {
      showToast('Selecciona al menos una canción', 'warning');
      return;
    }
    const txt = '🎵 LISTA DE CANTOS PARA LA MISA:\n\n' + list.map(item => `• ${item.moment}: ${item.song.title} (${item.song.key || 'C'})`).join('\n');
    navigator.clipboard.writeText(txt).then(() => {
      showToast('¡Lista de misa copiada al portapapeles!', 'success');
    });
  });

  document.getElementById('repertoire-print-btn')?.addEventListener('click', () => {
    const list = getSelectedRepertoireSongs();
    if (list.length === 0) {
      showToast('Selecciona al menos una canción', 'warning');
      return;
    }

    const printArea = document.getElementById('print-area');
    if (!printArea) return;
    const schoolName = state.settings.schoolName || 'Colegio Católico';

    printArea.innerHTML = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 30px; color: #111;">
        <div style="border-bottom: 2px solid #b45309; padding-bottom: 12px; margin-bottom: 24px; text-align: center;">
          <h3 style="margin: 0; color: #b45309; text-transform: uppercase;">${escapeHtml(schoolName)} • Coro y Asamblea</h3>
          <h1 style="margin: 6px 0; font-size: 1.8rem;">Cantos para la Santa Misa</h1>
        </div>

        ${list.map(item => `
          <div style="margin-bottom: 24px; page-break-inside: avoid;">
            <div style="background: #f1f5f9; padding: 6px 12px; font-weight: bold; border-left: 4px solid #b45309; margin-bottom: 8px;">
              ${escapeHtml(item.moment)}: ${escapeHtml(item.song.title)} (Tono: ${escapeHtml(item.song.key || 'C')})
            </div>
            <pre style="font-family: Arial, sans-serif; font-size: 0.95rem; line-height: 1.5; white-space: pre-wrap; margin: 0; padding-left: 12px;">${escapeHtml(stripSongChords(item.song.lyricsWithChords || ''))}</pre>
          </div>
        `).join('')}
      </div>
    `;

    window.print();
  });

  function getSelectedRepertoireSongs() {
    const songs = state.songs || [];
    const fields = [
      { id: 'rep-select-entrada', moment: 'Entrada' },
      { id: 'rep-select-piedad', moment: 'Piedad' },
      { id: 'rep-select-gloria', moment: 'Gloria' },
      { id: 'rep-select-ofertorio', moment: 'Ofertorio' },
      { id: 'rep-select-santo', moment: 'Santo' },
      { id: 'rep-select-paz', moment: 'Paz' },
      { id: 'rep-select-comunion', moment: 'Comunión' },
      { id: 'rep-select-salida', moment: 'Salida' }
    ];

    const result = [];
    fields.forEach(({ id, moment }) => {
      const select = document.getElementById(id);
      if (select && select.value) {
        const song = songs.find(s => s.id === select.value);
        if (song) result.push({ moment, song });
      }
    });
    return result;
  }

  // ========================================================
  // VISTA 6: ASISTENTE DE IA
  // ========================================================

  function renderAiChatView() {
    const hasKey = !!(state.settings.cloud && state.settings.cloud.apiKey);
    const setupCard = document.getElementById('ai-setup-container');
    const chatInterface = document.getElementById('ai-chat-container');
    const activeModelLabel = document.getElementById('chat-active-model');
    const providerBadge = document.querySelector('.model-provider-badge');

    if (!hasKey) {
      if (setupCard) setupCard.style.display = 'block';
      if (chatInterface) chatInterface.style.display = 'none';
      return;
    }

    if (setupCard) setupCard.style.display = 'none';
    if (chatInterface) chatInterface.style.display = 'flex';

    const provider = state.settings.cloud?.provider || 'gemini';
    const isGemini = provider === 'gemini';

    if (activeModelLabel) {
      activeModelLabel.textContent = state.settings.cloud.model || (isGemini ? 'gemini-flash-latest' : 'google/gemma-4-31b-it:free');
    }
    if (providerBadge) {
      providerBadge.textContent = isGemini ? 'Google Gemini Oficial' : 'OpenRouter Cloud';
    }

    renderChatHistory();
  }

  function renderChatHistory() {
    const scrollArea = document.getElementById('chat-messages-area');
    if (!scrollArea) return;

    if (!state.chat || state.chat.length === 0) {
      scrollArea.innerHTML = `
        <div style="text-align: center; margin: auto; max-width: 500px; color: var(--text-secondary);">
          <div style="font-size: 2.5rem; margin-bottom: 12px;">✝️</div>
          <h3 style="color: var(--text-primary); margin-bottom: 8px;">¡Paz y bien! Soy tu Asistente Pastoral</h3>
          <p style="font-size: 0.9rem; line-height: 1.5;">
            Puedo ayudarte a preparar oraciones solemnes, redactar esquemas litúrgicos, organizar dinámicas juveniles,
            analizar documentos o registrar notas, eventos y tareas directamente en tu calendario.
          </p>
        </div>
      `;
      return;
    }

    scrollArea.innerHTML = state.chat.map((m, idx) => {
      const isUser = m.role === 'user';
      let contentHtml = '';

      // Si el contenido contiene imágenes
      if (Array.isArray(m.content)) {
        let textPart = '';
        let imgsHtml = '';
        m.content.forEach(part => {
          if (part.type === 'text') textPart += part.text;
          if (part.type === 'image_url') {
            imgsHtml += `<img src="${part.image_url.url}" style="max-height:140px; border-radius:6px; margin-top:6px; display:block;">`;
          }
        });
        contentHtml = renderMarkdown(textPart) + imgsHtml;
      } else {
        contentHtml = renderMarkdown(m.content || '');
      }

      const actionsHtml = !isUser ? `
        <div class="chat-msg-actions">
          <button type="button" class="chat-copy-msg-btn" data-msg-idx="${idx}" title="Copiar mensaje de la IA al portapapeles">
            <svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:middle; margin-right:4px;" fill="currentColor">
              <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
            </svg>
            <span>Copiar</span>
          </button>
        </div>
      ` : '';

      return `
        <div class="chat-msg ${isUser ? 'user' : 'assistant'}">
          <div class="chat-msg-avatar">${isUser ? 'TÚ' : 'OP'}</div>
          <div class="chat-msg-bubble">
            <div class="chat-msg-content">${contentHtml}</div>
            ${actionsHtml}
          </div>
        </div>
      `;
    }).join('');

    scrollChatToBottom();
  }

  function scrollChatToBottom() {
    const scrollArea = document.getElementById('chat-messages-area');
    if (scrollArea) {
      scrollArea.scrollTop = scrollArea.scrollHeight;
    }
  }

  // Delegación de clics en el área de mensajes del chat (enlaces y botón de copiar mensaje)
  document.getElementById('chat-messages-area')?.addEventListener('click', (e) => {
    // Abrir enlaces externos en el navegador predeterminado
    const link = e.target.closest('a');
    if (link && link.href && !link.href.startsWith('javascript:')) {
      e.preventDefault();
      window.pastoral.openExternal(link.href);
      return;
    }

    // Copiar mensaje completo de la IA al portapapeles
    const copyBtn = e.target.closest('.chat-copy-msg-btn');
    if (copyBtn) {
      const idx = parseInt(copyBtn.dataset.msgIdx, 10);
      let textToCopy = '';
      if (!isNaN(idx) && state.chat[idx]) {
        const m = state.chat[idx];
        if (typeof m.content === 'string') {
          textToCopy = m.content;
        } else if (Array.isArray(m.content)) {
          textToCopy = m.content
            .filter(part => part.type === 'text')
            .map(part => part.text)
            .join('\n');
        }
      }

      if (!textToCopy) {
        const bubble = copyBtn.closest('.chat-msg-bubble');
        const contentElem = bubble?.querySelector('.chat-msg-content') || bubble;
        textToCopy = contentElem?.innerText || '';
      }

      if (textToCopy) {
        navigator.clipboard.writeText(textToCopy).then(() => {
          const origHtml = copyBtn.innerHTML;
          copyBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:middle; margin-right:4px;" fill="currentColor">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
            <span>¡Copiado!</span>
          `;
          copyBtn.classList.add('copied');
          showToast('Mensaje de la IA copiado al portapapeles', 'info');
          setTimeout(() => {
            copyBtn.innerHTML = origHtml;
            copyBtn.classList.remove('copied');
          }, 2000);
        }).catch(() => {
          showToast('Error al copiar al portapapeles', 'danger');
        });
      }
      return;
    }
  });

  // Envío de mensaje en el chat
  const chatTextarea = document.getElementById('chat-textarea');
  const chatSendBtn = document.getElementById('chat-btn-send');
  const chatStopBtn = document.getElementById('chat-btn-stop');
  const chatImageInput = document.getElementById('chat-image-input');
  const chatImagePreviews = document.getElementById('chat-image-previews');

  if (chatTextarea) {
    chatTextarea.addEventListener('input', () => {
      chatTextarea.style.height = 'auto';
      chatTextarea.style.height = Math.min(chatTextarea.scrollHeight, 140) + 'px';
    });

    chatTextarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Soporte para pegar imágenes directamente (Ctrl+V)
    chatTextarea.addEventListener('paste', (e) => {
      const items = (e.clipboardData || e.originalEvent.clipboardData).items;
      for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) addImageToChatAttachments(file);
        }
      }
    });
  }

  if (chatSendBtn) {
    chatSendBtn.addEventListener('click', () => sendMessage());
  }

  if (chatStopBtn) {
    chatStopBtn.addEventListener('click', async () => {
      await window.pastoral.ai.cancelChat();
      chatStopBtn.style.display = 'none';
      isGeneratingChat = false;
      showToast('Generación detenida', 'info');
    });
  }

  if (chatImageInput) {
    chatImageInput.addEventListener('change', (e) => {
      if (e.target.files) {
        Array.from(e.target.files).forEach(f => addImageToChatAttachments(f));
        chatImageInput.value = '';
      }
    });
  }

  function addImageToChatAttachments(file) {
    if (currentChatImages.length >= 4) {
      showToast('Puedes adjuntar un máximo de 4 imágenes por mensaje.', 'warning');
      return;
    }

    resizeImageToDataUrl(file, 1536, (dataUrl) => {
      currentChatImages.push(dataUrl);
      renderChatAttachmentPreviews();
    });
  }

  function renderChatAttachmentPreviews() {
    if (!chatImagePreviews) return;

    if (currentChatImages.length === 0) {
      chatImagePreviews.style.display = 'none';
      chatImagePreviews.innerHTML = '';
      return;
    }

    chatImagePreviews.style.display = 'flex';
    chatImagePreviews.innerHTML = currentChatImages.map((src, idx) => `
      <div class="preview-thumb-box">
        <img src="${src}">
        <button class="preview-thumb-remove" data-img-idx="${idx}">&times;</button>
      </div>
    `).join('');

    chatImagePreviews.querySelectorAll('.preview-thumb-remove').forEach(b => {
      b.addEventListener('click', () => {
        const idx = parseInt(b.dataset.imgIdx, 10);
        currentChatImages.splice(idx, 1);
        renderChatAttachmentPreviews();
      });
    });
  }

  async function sendMessage() {
    const text = chatTextarea ? chatTextarea.value.trim() : '';
    if (!text && currentChatImages.length === 0) return;
    if (isGeneratingChat) return;

    const apiKey = state.settings.cloud?.apiKey;
    const provider = state.settings.cloud?.provider || 'gemini';
    const model = state.settings.cloud?.model || (provider === 'gemini' ? 'gemini-flash-latest' : 'google/gemma-4-31b-it:free');

    if (!apiKey) {
      showToast('Configura tu clave de API para usar el asistente.', 'warning');
      return;
    }

    // Estructurar contenido del usuario
    let userMsgContent;
    if (currentChatImages.length > 0) {
      userMsgContent = [];
      if (text) userMsgContent.push({ type: 'text', text });
      currentChatImages.forEach(url => {
        userMsgContent.push({ type: 'image_url', image_url: { url } });
      });
    } else {
      userMsgContent = text;
    }

    // Agregar a estado y renderizar mensaje del usuario
    const userMsg = { role: 'user', content: userMsgContent };
    state.chat.push(userMsg);

    chatTextarea.value = '';
    currentChatImages = [];
    renderChatAttachmentPreviews();

    renderChatHistory();

    // Crear burbuja de asistente para streaming
    const scrollArea = document.getElementById('chat-messages-area');
    const assistantBubbleWrapper = document.createElement('div');
    assistantBubbleWrapper.className = 'chat-msg assistant';
    assistantBubbleWrapper.innerHTML = `
      <div class="chat-msg-avatar">OP</div>
      <div class="chat-msg-bubble">
        <div class="chat-msg-status" id="stream-status-box">
          <span class="pulse-dot"></span>
          <span id="stream-status-text">Pensando...</span>
        </div>
        <div id="stream-content-box" class="chat-msg-content"></div>
      </div>
    `;
    scrollArea.appendChild(assistantBubbleWrapper);
    scrollChatToBottom();

    const streamStatusBox = assistantBubbleWrapper.querySelector('#stream-status-box');
    const streamStatusText = assistantBubbleWrapper.querySelector('#stream-status-text');
    const streamContentBox = assistantBubbleWrapper.querySelector('#stream-content-box');

    isGeneratingChat = true;
    chatStopBtn.style.display = 'inline-flex';

    let accumulatedText = '';

    // Suscribir eventos de streaming
    const removeChunkListener = window.pastoral.ai.onStreamChunk((chunk) => {
      accumulatedText += chunk;
      streamContentBox.innerHTML = renderMarkdown(accumulatedText);
      scrollChatToBottom();
    });

    const removeStatusListener = window.pastoral.ai.onStreamStatus((status) => {
      if (streamStatusBox && streamStatusText) {
        streamStatusBox.style.display = 'flex';
        let msg = 'Pensando...';
        if (typeof status === 'string' && status.trim()) {
          msg = status.trim();
        } else if (typeof status === 'object' && status !== null) {
          msg = status.text || status.status || status.message || 'Pensando...';
        }
        streamStatusText.textContent = msg;
      }
    });

    // Preparar contexto pastoral para el prompt de sistema
    const litInfo = LiturgicalCalendar.getLiturgicalInfo(new Date());
    const gospelSummary = state.dailyReadings?.gospel?.title 
      ? `${cleanScriptureText(state.dailyReadings.gospel.title)} - ${cleanScriptureText(state.dailyReadings.gospel.shortText || '')}`
      : '';
    const saintSummary = state.saintOfTheDay?.name 
      ? `${state.saintOfTheDay.name} (${state.saintOfTheDay.feastDate || ''})`
      : '';

    const appContext = {
      todayStr: new Date().toISOString().split('T')[0],
      liturgicalSeason: litInfo.season,
      liturgicalColor: litInfo.color,
      upcomingFeast: litInfo.upcoming ? `${litInfo.upcoming.name} (en ${litInfo.upcoming.daysLeft} días)` : '',
      verseOfTheDay: litInfo.verse ? `${litInfo.verse.text} (${litInfo.verse.ref})` : '',
      schoolName: state.settings.schoolName || 'Colegio Católico',
      pastorName: state.settings.pastorName || 'Agente Pastoral',
      stats: {
        notesCount: (state.notes || []).length,
        eventsCount: (state.events || []).length,
        pendingTasksCount: (state.tasks || []).filter(t => !t.done).length,
        groupsCount: (state.groups || []).length,
        personsCount: (state.persons || []).length,
        songsCount: (state.songs || []).length,
        scriptsCount: (state.liturgicalScripts || []).length
      },
      upcomingEvents: (state.events || []).slice(0, 10),
      pendingTasks: (state.tasks || []).filter(t => !t.done).slice(0, 10),
      notesList: (state.notes || []).slice(0, 25).map(n => ({ id: n.id, title: n.title, tags: n.tags })),
      eventsList: (state.events || []).slice(0, 30).map(e => ({
        id: e.id,
        title: e.title,
        date: e.date,
        time: e.time,
        category: e.category,
        location: e.location,
        scriptId: e.scriptId || null,
        attendees: e.attendees || '',
        checklistSummary: Array.isArray(e.checklist) ? `${e.checklist.filter(c => c.done).length}/${e.checklist.length} listos (${e.checklist.map(c => (c.done ? '✓ ' : '□ ') + c.text).join('; ')})` : 'Sin checklist'
      })),
      tasksList: (state.tasks || []).slice(0, 30).map(t => ({ id: t.id, title: t.title, due: t.due, priority: t.priority, done: t.done })),
      groupsList: (state.groups || []).map(g => ({ id: g.id, name: g.name, leader: g.leader })),
      personsList: (state.persons || []).map(p => ({ id: p.id, name: p.name, role: p.role, group: p.group })),
      scriptsList: (state.liturgicalScripts || []).slice(0, 25).map(s => ({
        id: s.id,
        title: s.title,
        type: s.type,
        date: s.date,
        course: s.course,
        celebrant: s.celebrant
      })),
      songsList: (state.songs || []).slice(0, 40).map(s => ({
        id: s.id,
        title: s.title,
        category: s.category,
        key: s.key,
        author: s.author
      })),
      todayGospel: gospelSummary,
      todaySaint: saintSummary,
      schoolTemplates: schoolEventTemplates.map(t => `${t.title} (${t.category})`),
      liturgicalTemplates: liturgicalTemplatesCatalog.map(t => `${t.title} (${t.type})`)
    };

    try {
      const res = await window.pastoral.ai.startChat({
        provider,
        apiKey,
        model,
        messages: state.chat,
        appContext
      });

      removeChunkListener();
      removeStatusListener();

      isGeneratingChat = false;
      chatStopBtn.style.display = 'none';

      if (res.success && res.response) {
        state.chat.push(res.response);
        persistData();
      } else if (res.aborted) {
        if (accumulatedText) {
          state.chat.push({ role: 'assistant', content: accumulatedText + ' *(Generación detenida)*' });
          persistData();
        }
      } else {
        streamContentBox.innerHTML = `<span style="color:var(--danger);">⚠️ Error: ${escapeHtml(res.error || 'Fallo desconocido')}</span>`;
      }

      if (streamStatusBox) streamStatusBox.style.display = 'none';
      renderChatHistory();
      if (chatTextarea) setTimeout(() => chatTextarea.focus(), 50);

    } catch (err) {
      removeChunkListener();
      removeStatusListener();
      isGeneratingChat = false;
      chatStopBtn.style.display = 'none';
      if (streamStatusBox) streamStatusBox.style.display = 'none';
      streamContentBox.innerHTML = `<span style="color:var(--danger);">⚠️ Error de comunicación: ${escapeHtml(err.message)}</span>`;
      if (chatTextarea) setTimeout(() => chatTextarea.focus(), 50);
    }
  }

  // Píldoras de sugerencias rápidas en el chat
  document.querySelectorAll('#chat-suggestions-bar .quick-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const msg = pill.dataset.msg;
      chatTextarea.value = msg;
      sendMessage();
    });
  });

  // Botón Rehacer
  document.getElementById('chat-btn-redo')?.addEventListener('click', () => {
    if (state.chat.length === 0) return;
    // Si el último mensaje es del asistente, removerlo y reenviar el último del usuario
    if (state.chat[state.chat.length - 1].role === 'assistant') {
      state.chat.pop();
    }
    if (state.chat.length > 0 && state.chat[state.chat.length - 1].role === 'user') {
      const lastUserMsg = state.chat.pop();
      if (typeof lastUserMsg.content === 'string') {
        chatTextarea.value = lastUserMsg.content;
      }
      sendMessage();
    }
  });

  // Botón Limpiar Chat
  document.getElementById('chat-btn-clear')?.addEventListener('click', () => {
    openConfirmModal({
      title: 'Limpiar Conversación',
      message: '¿Deseas vaciar toda la conversación del chat? Se borrará el historial de mensajes de esta sesión.',
      confirmText: 'Limpiar Chat',
      confirmBtnClass: 'btn-danger',
      onConfirm: async () => {
        if (isGeneratingChat) {
          try {
            await window.pastoral.ai.cancelChat();
          } catch (_) {}
        }
        isGeneratingChat = false;
        state.chat = [];
        persistData();
        renderChatHistory();
        if (chatStopBtn) chatStopBtn.style.display = 'none';
        currentChatImages = [];
        renderChatAttachmentPreviews();
        if (chatTextarea) {
          chatTextarea.value = '';
          chatTextarea.disabled = false;
          setTimeout(() => chatTextarea.focus(), 60);
        }
        showToast('Conversación limpiada', 'info');
      }
    });
  });

  // Conmutador de Proveedor en la tarjeta de setup inicial
  document.querySelectorAll('input[name="setup-provider"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const prov = radio.value;
      const keyLabel = document.getElementById('setup-key-label');
      const keyHint = document.getElementById('setup-key-hint');
      const modelInput = document.getElementById('setup-model');
      const cardGemini = document.getElementById('provider-card-gemini');
      const cardOpenRouter = document.getElementById('provider-card-openrouter');

      if (prov === 'gemini') {
        cardGemini.classList.add('active');
        cardOpenRouter.classList.remove('active');
        keyLabel.textContent = 'Clave de API de Google AI Studio:';
        keyHint.innerHTML = 'Obtén tu clave de API gratuita en <a href="#" id="link-get-gemini-key">aistudio.google.com</a>.';
        modelInput.value = 'gemini-flash-latest';
        attachGeminiLinkListeners();
      } else {
        cardOpenRouter.classList.add('active');
        cardGemini.classList.remove('active');
        keyLabel.textContent = 'Clave de API de OpenRouter:';
        keyHint.innerHTML = 'Obtén tu clave en <a href="#" id="link-openrouter">openrouter.ai</a>.';
        modelInput.value = 'google/gemma-4-31b-it:free';
        attachOpenRouterLinkListeners();
      }
    });
  });

  // Autodetección de proveedor al pegar la clave en setup
  document.getElementById('setup-api-key')?.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (val.startsWith('AQ.') || val.startsWith('AIza')) {
      const radio = document.querySelector('input[name="setup-provider"][value="gemini"]');
      if (radio && !radio.checked) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change'));
      }
    } else if (val.startsWith('sk-or-')) {
      const radio = document.querySelector('input[name="setup-provider"][value="openrouter"]');
      if (radio && !radio.checked) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change'));
      }
    }
  });

  function attachGeminiLinkListeners() {
    document.getElementById('link-get-gemini-key')?.addEventListener('click', (e) => {
      e.preventDefault();
      window.pastoral.openExternal('https://aistudio.google.com/app/apikey');
    });
    document.getElementById('link-get-gemini-key-settings')?.addEventListener('click', (e) => {
      e.preventDefault();
      window.pastoral.openExternal('https://aistudio.google.com/app/apikey');
    });
  }

  function attachOpenRouterLinkListeners() {
    document.getElementById('link-openrouter')?.addEventListener('click', (e) => {
      e.preventDefault();
      window.pastoral.openExternal('https://openrouter.ai/keys');
    });
  }

  attachGeminiLinkListeners();
  attachOpenRouterLinkListeners();

  // Activación de Asistente IA desde la tarjeta inicial
  document.getElementById('btn-save-ai-setup')?.addEventListener('click', () => {
    const key = document.getElementById('setup-api-key').value.trim();
    const model = document.getElementById('setup-model').value.trim();
    const selectedProvider = document.querySelector('input[name="setup-provider"]:checked')?.value || 'gemini';

    if (!key) {
      showToast('Ingresa una Clave de API válida.', 'warning');
      return;
    }

    state.settings.cloud.provider = selectedProvider;
    state.settings.cloud.apiKey = key;
    state.settings.cloud.model = model || (selectedProvider === 'gemini' ? 'gemini-flash-latest' : 'google/gemma-4-31b-it:free');

    persistData();
    updateAiStatusIndicator();
    renderAiChatView();
    showToast(`Asistente activado con ${selectedProvider === 'gemini' ? 'Google Gemini' : 'OpenRouter'}`, 'success');
  });

  document.getElementById('btn-test-connection-setup')?.addEventListener('click', async () => {
    const key = document.getElementById('setup-api-key').value.trim();
    const model = document.getElementById('setup-model').value.trim();
    const selectedProvider = document.querySelector('input[name="setup-provider"]:checked')?.value || 'gemini';
    const statusElem = document.getElementById('setup-conn-status');

    if (!key) {
      showToast('Ingresa primero la Clave de API para probar.', 'warning');
      return;
    }

    statusElem.textContent = `Verificando conexión con ${selectedProvider === 'gemini' ? 'Google Gemini' : 'OpenRouter'}...`;
    statusElem.style.color = 'var(--text-secondary)';

    const res = await window.pastoral.ai.testConnection({ provider: selectedProvider, apiKey: key, model });
    if (res.ok) {
      statusElem.textContent = '✅ ' + (res.reply || 'Conexión exitosa');
      statusElem.style.color = 'var(--success)';
    } else {
      statusElem.textContent = '❌ ' + (res.error || 'Error de conexión');
      statusElem.style.color = 'var(--danger)';
    }
  });

  // Selector de Modelos (Gemini u OpenRouter)
  document.getElementById('btn-browse-models-setup')?.addEventListener('click', () => {
    const selectedProvider = document.querySelector('input[name="setup-provider"]:checked')?.value || 'gemini';
    openModelsBrowser('setup-model', selectedProvider);
  });

  document.getElementById('btn-browse-models-settings')?.addEventListener('click', () => {
    const selectedProvider = document.querySelector('input[name="settings-ai-provider"]:checked')?.value || state.settings.cloud?.provider || 'gemini';
    openModelsBrowser('settings-cloud-model', selectedProvider);
  });

  async function openModelsBrowser(targetInputId, provider = 'gemini') {
    const modal = document.getElementById('models-browser-modal');
    const container = document.getElementById('models-list-container');
    const filterInput = document.getElementById('models-filter-input');
    const apiKey = state.settings.cloud?.apiKey || document.getElementById('setup-api-key')?.value.trim();

    if (!apiKey) {
      showToast('Ingresa primero una Clave de API para consultar modelos.', 'warning');
      return;
    }

    modal.style.display = 'flex';
    filterInput.value = '';

    container.innerHTML = `<div class="text-center py-4">Consultando modelos en ${provider === 'gemini' ? 'Google Gemini' : 'OpenRouter'}...</div>`;
    try {
      const res = await window.pastoral.ai.getModels({ provider, apiKey });
      if (res.success && Array.isArray(res.models)) {
        availableModelsCache = res.models;
        renderModelsList(availableModelsCache, targetInputId);
      } else {
        container.innerHTML = `<div class="text-center py-4 text-danger">Error: ${escapeHtml(res.error || 'No se obtuvieron modelos')}</div>`;
      }
    } catch (e) {
      container.innerHTML = `<div class="text-center py-4 text-danger">Error: ${escapeHtml(e.message)}</div>`;
    }

    filterInput.oninput = () => {
      const q = filterInput.value.toLowerCase().trim();
      const filtered = availableModelsCache.filter(m =>
        m.id.toLowerCase().includes(q) || (m.name && m.name.toLowerCase().includes(q))
      );
      renderModelsList(filtered, targetInputId);
    };
  }

  function renderModelsList(models, targetInputId) {
    const container = document.getElementById('models-list-container');
    if (!container) return;

    if (models.length === 0) {
      container.innerHTML = '<div class="text-center py-4">No se encontraron modelos coincidentes</div>';
      return;
    }

    container.innerHTML = models.slice(0, 80).map(m => `
      <div class="model-item-row" data-model-id="${m.id}">
        <div>
          <div class="model-item-id">${escapeHtml(m.id)}</div>
          ${m.description ? `<div class="model-item-desc">${escapeHtml(m.description.slice(0, 100))}...</div>` : ''}
        </div>
        <button class="btn btn-sm btn-secondary select-model-btn">Elegir</button>
      </div>
    `).join('');

    container.querySelectorAll('.model-item-row').forEach(row => {
      row.addEventListener('click', () => {
        const mId = row.dataset.modelId;
        const targetInput = document.getElementById(targetInputId);
        if (targetInput) targetInput.value = mId;
        document.getElementById('models-browser-modal').style.display = 'none';
        showToast(`Modelo seleccionado: ${mId}`, 'success');
      });
    });
  }

  document.getElementById('models-browser-close-btn')?.addEventListener('click', () => {
    document.getElementById('models-browser-modal').style.display = 'none';
  });
  document.getElementById('models-browser-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('models-browser-modal').style.display = 'none';
  });

  // Manejo de datos creados, modificados o eliminados por Function Calling (tools de IA)
  function handleAiDataUpdated(info) {
    const labels = {
      note: { created: 'Nota creada', updated: 'Nota modificada', deleted: 'Nota eliminada' },
      event: { created: 'Evento agendado', updated: 'Evento modificado', deleted: 'Evento cancelado/eliminado' },
      task: { created: 'Tarea creada', updated: 'Tarea actualizada', deleted: 'Tarea eliminada' },
      group: { created: 'Grupo registrado', updated: 'Grupo modificado', deleted: 'Grupo eliminado' },
      person: { created: 'Persona añadida', updated: 'Ficha actualizada', deleted: 'Persona eliminada' },
      song: { created: 'Canto añadido al cancionero', updated: 'Canto actualizado', deleted: 'Canto eliminado' },
      liturgicalScript: { created: 'Guión litúrgico creado', updated: 'Guión litúrgico actualizado', deleted: 'Guión litúrgico eliminado' }
    };
    const actionKey = info.action || 'created';
    const actionMsg = labels[info.type]?.[actionKey] || 'Datos actualizados';
    showToast(`🤖 Asistente: ${actionMsg} automáticamente`, 'success');

    // Refrescar datos en memoria recargándolos
    window.pastoral.getData().then(freshData => {
      if (freshData) {
        state = { ...state, ...freshData };
        renderDashboard();
        updateTasksBadge();
        if (currentView === 'notes') renderNotes();
        if (currentView === 'events') renderCalendar();
        if (currentView === 'tasks') renderTasks();
        if (currentView === 'community') renderCommunity();
        if (currentView === 'liturgical-scripts') renderLiturgicalScriptsView();
        if (currentView === 'songbook') renderSongbookView();
      }
    });
  }

  // ========================================================
  // VISTA 7: AJUSTES
  // ========================================================

  function renderSettingsView() {
    const pastorInput = document.getElementById('settings-pastor-name');
    const schoolInput = document.getElementById('settings-school-name');
    const welcomeCb = document.getElementById('settings-show-welcome');
    const notifCb = document.getElementById('settings-notifications');
    const cloudKeyInput = document.getElementById('settings-cloud-key');
    const cloudModelInput = document.getElementById('settings-cloud-model');

    if (pastorInput) pastorInput.value = state.settings.pastorName || '';
    if (schoolInput) schoolInput.value = state.settings.schoolName || '';
    if (welcomeCb) welcomeCb.checked = state.settings.showWelcome !== false;
    if (notifCb) notifCb.checked = state.settings.notifications !== false;
    if (cloudKeyInput) cloudKeyInput.value = state.settings.cloud?.apiKey || '';

    // Proveedor activo
    const provider = state.settings.cloud?.provider || 'gemini';
    const radio = document.querySelector(`input[name="settings-ai-provider"][value="${provider}"]`);
    if (radio) radio.checked = true;
    updateSettingsProviderUI(provider);

    if (cloudModelInput) {
      cloudModelInput.value = state.settings.cloud?.model || (provider === 'gemini' ? 'gemini-flash-latest' : 'google/gemma-4-31b-it:free');
    }

    updateSettingsAppearanceUI();
    renderBackupsList();
  }

  function updateSettingsProviderUI(provider) {
    const keyLabel = document.getElementById('settings-key-label');
    const keyHint = document.getElementById('settings-key-hint');
    const modelInput = document.getElementById('settings-cloud-model');
    const cardGemini = document.getElementById('settings-provider-gemini');
    const cardOpenRouter = document.getElementById('settings-provider-openrouter');

    if (provider === 'gemini') {
      cardGemini?.classList.add('active');
      cardOpenRouter?.classList.remove('active');
      if (keyLabel) keyLabel.textContent = 'Clave de API de Google AI Studio:';
      if (keyHint) keyHint.innerHTML = 'Consigue tu clave gratuita en <a href="#" id="link-get-gemini-key-settings">aistudio.google.com</a>.';
      if (modelInput && (!modelInput.value || modelInput.value.includes('gemma') || modelInput.value.includes('gemini-2') || modelInput.value.includes('gemini-1'))) {
        modelInput.value = 'gemini-flash-latest';
      }
      attachGeminiLinkListeners();
    } else {
      cardOpenRouter?.classList.add('active');
      cardGemini?.classList.remove('active');
      if (keyLabel) keyLabel.textContent = 'Clave de API de OpenRouter:';
      if (keyHint) keyHint.innerHTML = 'Obtén tu clave en <a href="#" id="link-openrouter">openrouter.ai</a>.';
      if (modelInput && (!modelInput.value || modelInput.value.includes('gemini'))) {
        modelInput.value = 'google/gemma-4-31b-it:free';
      }
      attachOpenRouterLinkListeners();
    }
  }

  // Radio listener en ajustes
  document.querySelectorAll('input[name="settings-ai-provider"]').forEach(r => {
    r.addEventListener('change', () => {
      updateSettingsProviderUI(r.value);
    });
  });

  // Autodetección de proveedor al pegar clave en Ajustes
  document.getElementById('settings-cloud-key')?.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (val.startsWith('AQ.') || val.startsWith('AIza')) {
      const radio = document.querySelector('input[name="settings-ai-provider"][value="gemini"]');
      if (radio && !radio.checked) {
        radio.checked = true;
        updateSettingsProviderUI('gemini');
      }
    } else if (val.startsWith('sk-or-')) {
      const radio = document.querySelector('input[name="settings-ai-provider"][value="openrouter"]');
      if (radio && !radio.checked) {
        radio.checked = true;
        updateSettingsProviderUI('openrouter');
      }
    }
  });

  // ========================================================
  // LISTENERS DE APARIENCIA Y PALETAS DE COLOR
  // ========================================================

  // Segmented de Modo de Sistema (Claro Pastel / Oscuro Fuerte)
  document.querySelectorAll('#settings-theme-mode-segmented .theme-mode-choice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.themeMode;
      applyTheme(mode);
      persistData();
      showToast(mode === 'dark' ? 'Modo Oscuro activado (Colores Fuertes y Vibrantes)' : 'Modo Claro activado (Colores Frescos y Pasteles)', 'info');
    });
  });

  // Selector de Color Personalizado (Live Preview en 'input', Guardado en 'change')
  document.getElementById('settings-custom-color-input')?.addEventListener('input', (e) => {
    const hex = e.target.value;
    const hexLabel = document.getElementById('custom-color-hex-label');
    if (hexLabel) hexLabel.textContent = hex.toUpperCase();
    applyColorPalette('custom', hex, state.settings.backgroundStyle);
  });

  document.getElementById('settings-custom-color-input')?.addEventListener('change', () => {
    persistData();
    showToast('Color personalizado guardado', 'success');
  });

  document.getElementById('btn-activate-custom-color')?.addEventListener('click', () => {
    const input = document.getElementById('settings-custom-color-input');
    const hex = input ? input.value : '#d97706';
    applyColorPalette('custom', hex, state.settings.backgroundStyle);
    persistData();
    showToast('Color personalizado activado para toda la aplicación', 'success');
  });

  // Selector de estilo de fondo (Pastel Armonizado vs Neutro Minimalista)
  document.querySelectorAll('#settings-bg-style-control .segmented-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const bgStyle = btn.dataset.bgStyle;
      applyColorPalette(state.settings.colorPalette, state.settings.customColor, bgStyle);
      persistData();
      showToast(bgStyle === 'tinted' ? 'Atmósfera pastel / profunda activada' : 'Fondo neutro minimalista activado', 'info');
    });
  });

  // Botón Restablecer Colores Predeterminados
  document.getElementById('btn-reset-default-colors')?.addEventListener('click', () => {
    applyColorPalette('amber', '#d97706', 'tinted');
    persistData();
    showToast('Colores restablecidos a los valores por defecto (Ámbar Dominicano)', 'info');
  });

  // Botón Paleta en Sidebar: Ir a la sección de apariencia en Ajustes
  document.getElementById('sidebar-palette-btn')?.addEventListener('click', () => {
    switchView('settings');
    const card = document.getElementById('settings-card-appearance');
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      card.style.outline = '2px solid var(--primary)';
      setTimeout(() => { card.style.outline = 'none'; }, 1500);
    }
  });



  async function renderBackupsList() {
    const tbody = document.getElementById('backups-table-body');
    if (!tbody) return;

    try {
      const res = await window.pastoral.backups.list();
      if (res.success && Array.isArray(res.backups)) {
        if (res.backups.length === 0) {
          tbody.innerHTML = '<tr><td colspan="3" class="text-center py-3">No hay copias de seguridad aún</td></tr>';
          return;
        }

        tbody.innerHTML = res.backups.map(b => {
          const date = new Date(b.createdAt).toLocaleString('es-ES');
          const sizeKb = (b.sizeBytes / 1024).toFixed(1) + ' KB';
          return `
            <tr>
              <td><strong>${escapeHtml(b.filename)}</strong><br><small style="color:var(--text-muted);">${date}</small></td>
              <td>${sizeKb}</td>
              <td class="text-right">
                <button class="btn btn-sm btn-secondary restore-bk-btn" data-file="${escapeHtml(b.filename)}">Restaurar</button>
                <button class="btn btn-sm btn-ghost delete-bk-btn" data-file="${escapeHtml(b.filename)}" style="color:var(--danger);">&times;</button>
              </td>
            </tr>
          `;
        }).join('');

        tbody.querySelectorAll('.restore-bk-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const filename = btn.dataset.file;
            openConfirmModal({
              title: 'Restaurar Copia de Seguridad',
              message: `¿Estás seguro de restaurar la copia "${filename}"? Se creará una copia preventiva antes.`,
              confirmText: 'Restaurar',
              confirmBtnClass: 'btn-primary',
              onConfirm: async () => {
                const r = await window.pastoral.backups.restore(filename);
                if (r.success) {
                  const fresh = await window.pastoral.getData();
                  state = { ...state, ...fresh };
                  renderDashboard();
                  showToast('Copia de seguridad restaurada con éxito', 'success');
                } else {
                  showToast('Error restaurando: ' + r.error, 'error');
                }
              }
            });
          });
        });

        tbody.querySelectorAll('.delete-bk-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const filename = btn.dataset.file;
            openConfirmModal({
              title: 'Eliminar Copia de Seguridad',
              message: `¿Eliminar copia de seguridad "${filename}"?`,
              confirmText: 'Eliminar',
              confirmBtnClass: 'btn-danger',
              onConfirm: async () => {
                await window.pastoral.backups.delete(filename);
                renderBackupsList();
                showToast('Copia eliminada', 'info');
              }
            });
          });
        });

      } else {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center text-danger">Error: ${res.error}</td></tr>`;
      }
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="3" class="text-center text-danger">Fallo al leer copias: ${e.message}</td></tr>`;
    }
  }

  // Guardar Ajustes
  document.getElementById('btn-save-all-settings')?.addEventListener('click', () => {
    state.settings.pastorName = document.getElementById('settings-pastor-name').value.trim();
    state.settings.schoolName = document.getElementById('settings-school-name').value.trim();
    state.settings.showWelcome = document.getElementById('settings-show-welcome').checked;
    state.settings.notifications = document.getElementById('settings-notifications').checked;
    state.settings.cloud.apiKey = document.getElementById('settings-cloud-key').value.trim();
    
    const selectedProvider = document.querySelector('input[name="settings-ai-provider"]:checked')?.value || 'gemini';
    state.settings.cloud.provider = selectedProvider;
    state.settings.cloud.model = document.getElementById('settings-cloud-model').value.trim() || (selectedProvider === 'gemini' ? 'gemini-flash-latest' : 'google/gemma-4-31b-it:free');

    persistData();
    updateHeaderIdentity();
    updateAiStatusIndicator();
    renderDashboard();
    showToast('Ajustes guardados correctamente', 'success');
  });

  // Mostrar / Ocultar API Key
  const toggleKeyBtn = document.getElementById('btn-toggle-key-visibility');
  const cloudKeyInput = document.getElementById('settings-cloud-key');
  if (toggleKeyBtn && cloudKeyInput) {
    toggleKeyBtn.addEventListener('click', () => {
      if (cloudKeyInput.type === 'password') {
        cloudKeyInput.type = 'text';
        toggleKeyBtn.textContent = 'Ocultar';
      } else {
        cloudKeyInput.type = 'password';
        toggleKeyBtn.textContent = 'Mostrar';
      }
    });
  }

  // Probar conexión desde ajustes
  document.getElementById('btn-test-connection-settings')?.addEventListener('click', async () => {
    const key = document.getElementById('settings-cloud-key').value.trim();
    const model = document.getElementById('settings-cloud-model').value.trim();
    const selectedProvider = document.querySelector('input[name="settings-ai-provider"]:checked')?.value || state.settings.cloud?.provider || 'gemini';
    const statusElem = document.getElementById('settings-conn-status');

    if (!key) {
      showToast('Ingresa una clave de API para probar.', 'warning');
      return;
    }

    statusElem.textContent = `Probando conexión con ${selectedProvider === 'gemini' ? 'Google Gemini' : 'OpenRouter'}...`;
    statusElem.style.color = 'var(--text-secondary)';

    const res = await window.pastoral.ai.testConnection({ provider: selectedProvider, apiKey: key, model });
    if (res.ok) {
      statusElem.textContent = '✅ ' + (res.reply || 'Conexión verificada');
      statusElem.style.color = 'var(--success)';
    } else {
      statusElem.textContent = '❌ ' + (res.error || 'Error al conectar');
      statusElem.style.color = 'var(--danger)';
    }
  });


  // Botones de backups
  document.getElementById('btn-create-backup-now')?.addEventListener('click', async () => {
    const res = await window.pastoral.backups.create();
    if (res.success) {
      renderBackupsList();
      showToast(`Copia creada: ${res.filename}`, 'success');
    } else {
      showToast('Error creando copia: ' + res.error, 'error');
    }
  });

  document.getElementById('btn-export-backup-file')?.addEventListener('click', async () => {
    const res = await window.pastoral.backups.export();
    if (res.success) {
      showToast('Respaldo exportado exitosamente', 'success');
    } else if (!res.canceled) {
      showToast('Error exportando: ' + res.error, 'error');
    }
  });

  document.getElementById('btn-import-backup-file')?.addEventListener('click', () => {
    openConfirmModal({
      title: 'Importar Archivo de Respaldo',
      message: 'Al importar un archivo de respaldo se fusionarán los datos actuales con los del archivo. ¿Deseas continuar?',
      confirmText: 'Importar',
      confirmBtnClass: 'btn-primary',
      onConfirm: async () => {
        const res = await window.pastoral.backups.import();
        if (res.success && res.data) {
          state = { ...state, ...res.data };
          renderDashboard();
          renderBackupsList();
          showToast('Respaldo importado correctamente', 'success');
        } else if (!res.canceled) {
          showToast('Error importando: ' + res.error, 'error');
        }
      }
    });
  });

  document.getElementById('btn-open-data-folder')?.addEventListener('click', async () => {
    await window.pastoral.openDataFolder();
  });

  // Borrar todos los datos y reiniciar
  document.getElementById('btn-wipe-data')?.addEventListener('click', () => {
    openGenericModal({
      title: '⚠️ Borrar Todos los Datos',
      bodyHtml: `
        <p style="color:var(--danger); font-weight:600; margin-bottom:10px;">Esta acción borrará todas las notas, eventos, tareas, grupos, personas y chats.</p>
        <p style="margin-bottom:8px; font-size:0.9rem;">Para confirmar el restablecimiento total, escribe <strong>BORRAR</strong> en el recuadro:</p>
        <input type="text" id="modal-wipe-input" placeholder="Escribe BORRAR aquí" style="width:100%; padding:8px 12px; border:1px solid var(--border-color); border-radius:var(--radius-md); background:var(--bg-surface-alt); color:var(--text-primary);" autocomplete="off">
      `,
      onSave: () => {
        const val = document.getElementById('modal-wipe-input')?.value.trim();
        if (val !== 'BORRAR') {
          showToast('Debes escribir BORRAR exactamente para confirmar.', 'warning');
          return false;
        }
        state.notes = [];
        state.events = [];
        state.tasks = [];
        state.groups = [];
        state.persons = [];
        state.chat = [];
        persistData();
        renderDashboard();
        renderAiChatView();
        updateTasksBadge();
        showToast('Todos los datos han sido restablecidos.', 'info');
        return true;
      }
    });
  });

  // Toggle de Tema en Sidebar
  document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
    const nextTheme = state.settings.theme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    persistData();
    showToast(nextTheme === 'dark' ? 'Modo Oscuro activado (Colores Fuertes y Vibrantes)' : 'Modo Claro activado (Colores Frescos y Pasteles)', 'info');
  });

  // ========================================================
  // BUSCADOR GLOBAL RÁPIDO (CTRL+K)
  // ========================================================

  const omnisearchModal = document.getElementById('omnisearch-modal');
  const omnisearchInput = document.getElementById('omnisearch-input');
  const omnisearchResults = document.getElementById('omnisearch-results-list');
  const quickSearchBtn = document.getElementById('quick-search-btn');

  function openOmnisearch() {
    omnisearchModal.style.display = 'flex';
    omnisearchInput.value = '';
    omnisearchIndex = 0;
    omnisearchResults.innerHTML = '<div class="omnisearch-empty">Escribe algo para buscar en todo el sistema...</div>';
    omnisearchInput.focus();
  }

  function closeOmnisearch() {
    omnisearchModal.style.display = 'none';
  }

  quickSearchBtn?.addEventListener('click', openOmnisearch);

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (omnisearchModal.style.display === 'flex') {
        closeOmnisearch();
      } else {
        openOmnisearch();
      }
    } else if (e.key === 'Escape' && omnisearchModal.style.display === 'flex') {
      closeOmnisearch();
    }
  });

  omnisearchModal?.addEventListener('click', (e) => {
    if (e.target === omnisearchModal) closeOmnisearch();
  });

  omnisearchInput?.addEventListener('input', () => {
    const query = omnisearchInput.value.toLowerCase().trim();
    if (!query) {
      omnisearchResults.innerHTML = '<div class="omnisearch-empty">Escribe algo para buscar en todo el sistema...</div>';
      omnisearchFilteredResults = [];
      return;
    }

    const results = [];

    // Buscar en notas
    (state.notes || []).forEach(n => {
      if ((n.title || '').toLowerCase().includes(query) || (n.body || '').toLowerCase().includes(query)) {
        results.push({ type: 'Nota', title: n.title, id: n.id, view: 'notes', action: () => openNoteViewerModal(n) });
      }
    });

    // Buscar en eventos
    (state.events || []).forEach(e => {
      if ((e.title || '').toLowerCase().includes(query) || (e.description || '').toLowerCase().includes(query)) {
        results.push({ type: 'Evento', title: `${e.date} - ${e.title}`, id: e.id, view: 'events', action: () => openEventEditorModal(e) });
      }
    });

    // Buscar en tareas
    (state.tasks || []).forEach(t => {
      if ((t.title || '').toLowerCase().includes(query) || (t.notes || '').toLowerCase().includes(query)) {
        results.push({ type: 'Tarea', title: t.title, id: t.id, view: 'tasks', action: () => openTaskEditorModal(t) });
      }
    });

    // Buscar en comunidad (grupos y personas)
    (state.groups || []).forEach(g => {
      if ((g.name || '').toLowerCase().includes(query)) {
        results.push({ type: 'Grupo', title: g.name, id: g.id, view: 'community', action: () => openGroupEditorModal(g) });
      }
    });

    (state.persons || []).forEach(p => {
      if ((p.name || '').toLowerCase().includes(query) || (p.role || '').toLowerCase().includes(query)) {
        results.push({ type: 'Persona', title: `${p.name} (${p.role || 'Comunidad'})`, id: p.id, view: 'community', action: () => openPersonEditorModal(p) });
      }
    });

    // Buscar en cantos del cancionero
    (state.songs || []).forEach(s => {
      if ((s.title || '').toLowerCase().includes(query) || (s.author || '').toLowerCase().includes(query) || (s.lyricsWithChords || '').toLowerCase().includes(query)) {
        results.push({
          type: 'Canto',
          title: `🎵 ${s.title} (${s.category || 'Misa'})`,
          id: s.id,
          view: 'songbook',
          action: () => {
            currentSelectedSongId = s.id;
            currentSongSemitones = 0;
            renderSongbookView();
          }
        });
      }
    });

    // Buscar en guiones litúrgicos
    (state.liturgicalScripts || []).forEach(sc => {
      if ((sc.title || '').toLowerCase().includes(query) || (sc.theme || '').toLowerCase().includes(query) || (sc.type || '').toLowerCase().includes(query)) {
        results.push({
          type: 'Guión',
          title: `📜 ${sc.title} (${sc.type || 'Misa'})`,
          id: sc.id,
          view: 'liturgical-scripts',
          action: () => openScriptEditorModal(sc)
        });
      }
    });

    omnisearchFilteredResults = results;
    omnisearchIndex = 0;

    if (results.length === 0) {
      omnisearchResults.innerHTML = '<div class="omnisearch-empty">No se encontraron resultados</div>';
      return;
    }

    renderOmnisearchItems();
  });

  function renderOmnisearchItems() {
    omnisearchResults.innerHTML = omnisearchFilteredResults.map((item, idx) => `
      <div class="omnisearch-item ${idx === omnisearchIndex ? 'active' : ''}" data-idx="${idx}">
        <span class="omnisearch-item-type">${item.type}</span>
        <span class="omnisearch-item-title">${escapeHtml(item.title)}</span>
      </div>
    `).join('');

    omnisearchResults.querySelectorAll('.omnisearch-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx, 10);
        executeOmnisearchItem(idx);
      });
    });
  }

  function executeOmnisearchItem(idx) {
    const item = omnisearchFilteredResults[idx];
    if (!item) return;
    closeOmnisearch();
    switchView(item.view);
    if (typeof item.action === 'function') {
      item.action();
    }
  }

  // Navegación con teclado en omnisearch
  omnisearchInput?.addEventListener('keydown', (e) => {
    if (omnisearchFilteredResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      omnisearchIndex = (omnisearchIndex + 1) % omnisearchFilteredResults.length;
      renderOmnisearchItems();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      omnisearchIndex = (omnisearchIndex - 1 + omnisearchFilteredResults.length) % omnisearchFilteredResults.length;
      renderOmnisearchItems();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      executeOmnisearchItem(omnisearchIndex);
    }
  });

  // ========================================================
  // PANTALLA DE BIENVENIDA LITÚRGICA
  // ========================================================

  function showWelcomeModal() {
    const modal = document.getElementById('welcome-modal');
    if (!modal) return;

    const litInfo = LiturgicalCalendar.getLiturgicalInfo(new Date());

    document.getElementById('welcome-school-subtitle').textContent = state.settings.schoolName || 'Organizador Pastoral';
    document.getElementById('welcome-season-label').textContent = litInfo.season;
    document.getElementById('welcome-celebration-label').textContent = litInfo.celebration;
    document.getElementById('welcome-color-label').textContent = `Color Litúrgico: ${litInfo.color}`;

    const litBox = document.getElementById('welcome-liturgical-box');
    if (litBox) litBox.style.borderLeftColor = litInfo.colorHex;

    if (litInfo.verse) {
      document.getElementById('welcome-verse-text').textContent = `"${litInfo.verse.text}"`;
      document.getElementById('welcome-verse-ref').textContent = litInfo.verse.ref;
    }

    modal.style.display = 'flex';

    document.getElementById('welcome-continue-btn').onclick = () => {
      modal.style.display = 'none';
    };
  }

  // ========================================================
  // NOTIFICACIONES DE ESCRITORIO
  // ========================================================

  function checkTodayNotifications() {
    if (state.settings.notifications === false) return;

    const todayStr = new Date().toISOString().split('T')[0];

    // Avisar si hay eventos hoy
    const todayEvents = (state.events || []).filter(e => e.date === todayStr);
    if (todayEvents.length > 0) {
      window.pastoral.notify({
        title: 'Eventos para Hoy en Pastoral',
        body: `Tienes ${todayEvents.length} evento(s) programado(s) para hoy: ${todayEvents.map(e => e.title).join(', ')}`
      });
    }

    // Avisar si hay tareas vencidas o para hoy
    const urgentTasks = (state.tasks || []).filter(t => !t.done && t.due && t.due <= todayStr);
    if (urgentTasks.length > 0) {
      setTimeout(() => {
        window.pastoral.notify({
          title: 'Tareas Pendientes Urgentes',
          body: `Hay ${urgentTasks.length} tarea(s) pendiente(s) que vencen hoy o están retrasadas.`
        });
      }, 3000);
    }
  }

  // ========================================================
  // MODAL GENÉRICO REUTILIZABLE Y DIÁLOGOS DE CONFIRMACIÓN
  // ========================================================

  const genericModal = document.getElementById('generic-modal');
  const genericModalTitle = document.getElementById('modal-title');
  const genericModalBody = document.getElementById('modal-body');
  const genericModalSaveBtn = document.getElementById('modal-save-btn');
  const genericModalCancelBtn = document.getElementById('modal-cancel-btn');
  const genericModalCloseBtn = document.getElementById('modal-close-btn');

  function openGenericModal({ title, bodyHtml, onSave }) {
    if (!genericModal) return;
    genericModalTitle.textContent = title;
    genericModalBody.innerHTML = bodyHtml;
    genericModalSaveBtn.textContent = 'Guardar';
    genericModalSaveBtn.className = 'btn btn-primary';
    genericModal.style.display = 'flex';

    const saveHandler = () => {
      if (typeof onSave === 'function') {
        const canClose = onSave();
        if (canClose !== false) {
          closeGenericModal();
        }
      }
    };

    genericModalSaveBtn.onclick = saveHandler;
    genericModalCancelBtn.onclick = closeGenericModal;
    genericModalCloseBtn.onclick = closeGenericModal;
  }

  function openConfirmModal({ title = 'Confirmar acción', message, confirmText = 'Aceptar', confirmBtnClass = 'btn-danger', onConfirm }) {
    if (!genericModal) return;
    genericModalTitle.textContent = title;
    genericModalBody.innerHTML = `<p style="font-size:0.95rem; line-height:1.6; color:var(--text-primary); margin:12px 0;">${escapeHtml(message)}</p>`;
    genericModalSaveBtn.textContent = confirmText;
    genericModalSaveBtn.className = `btn ${confirmBtnClass}`;
    genericModal.style.display = 'flex';

    const confirmHandler = () => {
      closeGenericModal();
      if (typeof onConfirm === 'function') onConfirm();
    };

    genericModalSaveBtn.onclick = confirmHandler;
    genericModalCancelBtn.onclick = closeGenericModal;
    genericModalCloseBtn.onclick = closeGenericModal;
  }

  function closeGenericModal() {
    if (!genericModal) return;
    genericModal.style.display = 'none';
    genericModalSaveBtn.onclick = null;
    genericModalCancelBtn.onclick = null;
    genericModalCloseBtn.onclick = null;
    genericModalSaveBtn.style.display = '';
    genericModalCancelBtn.textContent = 'Cancelar';
    genericModalSaveBtn.textContent = 'Guardar';
    genericModalSaveBtn.className = 'btn btn-primary';
    if (currentView === 'ai-chat') {
      const textarea = document.getElementById('chat-textarea');
      if (textarea) setTimeout(() => textarea.focus(), 60);
    }
  }

  genericModal?.addEventListener('click', (e) => {
    if (e.target === genericModal) closeGenericModal();
  });

  // ========================================================
  // SISTEMA DE TOASTS
  // ========================================================

  function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    else if (type === 'error') icon = '❌';
    else if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ========================================================
  // UTILIDADES GENERALES
  // ========================================================

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeCsv(str) {
    if (!str) return '';
    return String(str).replace(/"/g, '""');
  }

  function formatDateYMD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function parseYMD(str) {
    const parts = str.split('-');
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }

  function downloadBlob(content, filename, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Redimensiona una imagen a un tamaño máximo manteniendo la relación de aspecto
   * y la convierte a DataURL para visión con IA
   */
  function resizeImageToDataUrl(file, maxDimension, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        callback(dataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  /**
   * Renderizador seguro de Markdown en HTML (delega al motor avanzado de markdown.js)
   */
  function renderMarkdown(md) {
    if (!md) return '';
    if (typeof MarkdownRenderer !== 'undefined' && MarkdownRenderer.render) {
      return MarkdownRenderer.render(md);
    }
    return escapeHtml(md);
  }

  // ========================================================
  // CONTROLADOR DE SINCRONIZACIÓN EN LA NUBE & GOOGLE AUTH
  // ========================================================

  function renderCurrentView() {
    switch (currentView) {
      case 'dashboard': renderDashboard(); break;
      case 'notes': renderNotes(); break;
      case 'events': renderCalendar(); break;
      case 'tasks': renderTasks(); break;
      case 'community': renderCommunity(); break;
      case 'liturgical-scripts': renderLiturgicalScriptsView(); break;
      case 'songbook': renderSongbookView(); break;
      case 'ai-chat': renderAiChatView(); break;
      case 'settings': renderSettingsView(); break;
    }
  }

  function updateCloudSyncUI(status, user, lastError) {
    const isConnected = !!user;

    const statusTexts = {
      synced: 'Sincronizado',
      syncing: 'Sincronizando...',
      offline: 'Modo sin conexión',
      disconnected: 'Modo local',
      error: 'Error de permisos'
    };

    const statusBadges = {
      synced: '🟢 En línea y Sincronizado',
      syncing: '🔵 Sincronizando datos...',
      offline: '🟡 Sin conexión (guardando local)',
      disconnected: '⚪ Modo local (sin cuenta)',
      error: '🔴 Error en Firebase'
    };

    const statusClass = `dot-${status}`;

    // 1. Sidebar Widget
    const sidebarDot = document.getElementById('sidebar-cloud-dot');
    if (sidebarDot) {
      sidebarDot.className = `cloud-status-indicator-dot ${statusClass}`;
    }
    const sidebarName = document.getElementById('sidebar-cloud-name');
    if (sidebarName) {
      sidebarName.textContent = isConnected ? (user.displayName || user.email.split('@')[0]) : 'Modo Local';
    }
    const sidebarStatus = document.getElementById('sidebar-cloud-status');
    if (sidebarStatus) {
      sidebarStatus.textContent = isConnected ? (statusTexts[status] || 'Conectado') : 'Toca para conectar';
    }
    const sidebarAvatar = document.getElementById('sidebar-cloud-avatar');
    const sidebarPlaceholder = document.getElementById('sidebar-cloud-placeholder');
    if (sidebarAvatar && sidebarPlaceholder) {
      if (isConnected && user.photoURL) {
        sidebarAvatar.src = user.photoURL;
        sidebarAvatar.style.display = 'block';
        sidebarPlaceholder.style.display = 'none';
      } else {
        sidebarAvatar.style.display = 'none';
        sidebarPlaceholder.style.display = 'flex';
      }
    }

    // 2. Ajustes
    const settingsBadge = document.getElementById('settings-sync-badge');
    if (settingsBadge) {
      settingsBadge.textContent = statusBadges[status] || statusBadges.disconnected;
      settingsBadge.className = `sync-status-badge ${status}`;
    }
    const settingsName = document.getElementById('settings-cloud-user-name');
    if (settingsName) {
      settingsName.textContent = isConnected ? (user.displayName || 'Usuario de Google') : 'Modo Local (Sin Cuenta)';
    }
    const settingsEmail = document.getElementById('settings-cloud-user-email');
    if (settingsEmail) {
      if (status === 'error' && lastError) {
        settingsEmail.textContent = '⚠️ ' + lastError;
        settingsEmail.style.color = 'var(--danger)';
      } else {
        settingsEmail.textContent = isConnected ? user.email : 'Inicia sesión con Google para sincronizar tus dispositivos';
        settingsEmail.style.color = '';
      }
    }
    const settingsAvatar = document.getElementById('settings-cloud-avatar');
    const settingsPlaceholder = document.getElementById('settings-cloud-avatar-placeholder');
    if (settingsAvatar && settingsPlaceholder) {
      if (isConnected && user.photoURL) {
        settingsAvatar.src = user.photoURL;
        settingsAvatar.style.display = 'block';
        settingsPlaceholder.style.display = 'none';
      } else {
        settingsAvatar.style.display = 'none';
        settingsPlaceholder.style.display = 'flex';
      }
    }

    const btnGoogleLogin = document.getElementById('btn-google-login');
    const btnForceSync = document.getElementById('btn-force-cloud-sync');
    const btnGoogleLogout = document.getElementById('btn-google-logout');

    if (btnGoogleLogin) btnGoogleLogin.style.display = isConnected ? 'none' : 'inline-flex';
    if (btnForceSync) btnForceSync.style.display = isConnected ? 'inline-flex' : 'none';
    if (btnGoogleLogout) btnGoogleLogout.style.display = isConnected ? 'inline-flex' : 'none';

    // 3. Modal
    const modalBadge = document.getElementById('modal-sync-badge');
    if (modalBadge) {
      modalBadge.textContent = statusBadges[status] || statusBadges.disconnected;
      modalBadge.className = `sync-status-badge ${status}`;
    }
    const modalName = document.getElementById('modal-cloud-user-name');
    if (modalName) {
      modalName.textContent = isConnected ? (user.displayName || 'Usuario de Google') : 'Modo Local';
    }
    const modalEmail = document.getElementById('modal-cloud-user-email');
    if (modalEmail) {
      if (status === 'error' && lastError) {
        modalEmail.textContent = '⚠️ ' + lastError;
        modalEmail.style.color = 'var(--danger)';
      } else {
        modalEmail.textContent = isConnected ? user.email : 'Sin cuenta conectada';
        modalEmail.style.color = '';
      }
    }
    const modalAvatar = document.getElementById('modal-cloud-avatar');
    const modalPlaceholder = document.getElementById('modal-cloud-avatar-placeholder');
    if (modalAvatar && modalPlaceholder) {
      if (isConnected && user.photoURL) {
        modalAvatar.src = user.photoURL;
        modalAvatar.style.display = 'block';
        modalPlaceholder.style.display = 'none';
      } else {
        modalAvatar.style.display = 'none';
        modalPlaceholder.style.display = 'flex';
      }
    }

    const modalUnconnected = document.getElementById('modal-cloud-unconnected-actions');
    const modalConnected = document.getElementById('modal-cloud-connected-actions');
    if (modalUnconnected) modalUnconnected.style.display = isConnected ? 'none' : 'block';
    if (modalConnected) modalConnected.style.display = isConnected ? 'block' : 'none';

    const modalRulesHelp = document.getElementById('modal-cloud-rules-help');
    if (modalRulesHelp) modalRulesHelp.style.display = (status === 'error') ? 'block' : 'none';
  }

  function setupCloudSync() {
    if (!window.pastoralFirebase) return;

    const modal = document.getElementById('cloud-sync-modal');
    const openModal = () => { if (modal) modal.style.display = 'flex'; };
    const closeModal = () => { if (modal) modal.style.display = 'none'; };

    document.getElementById('sidebar-cloud-widget')?.addEventListener('click', openModal);
    document.getElementById('cloud-sync-modal-close-btn')?.addEventListener('click', closeModal);
    document.getElementById('cloud-sync-modal-ok-btn')?.addEventListener('click', closeModal);
    document.getElementById('modal-link-to-settings')?.addEventListener('click', (e) => {
      e.preventDefault();
      closeModal();
      switchView('settings');
      const details = document.getElementById('firebase-config-details');
      if (details) details.open = true;
      document.getElementById('card-cloud-sync-settings')?.scrollIntoView({ behavior: 'smooth' });
    });

    const handleGoogleLogin = async () => {
      try {
        showToast('Abriendo inicio de sesión con Google...', 'info');
        await window.pastoralFirebase.signInWithGoogle();
        showToast('¡Sesión con Google iniciada!', 'success');
        closeModal();
      } catch (err) {
        console.warn('Error en Google Sign-In:', err);
        showToast('Aviso: ' + (err.message || 'No se pudo iniciar sesión con Google'), 'warning');
      }
    };

    document.getElementById('btn-google-login')?.addEventListener('click', handleGoogleLogin);
    document.getElementById('modal-btn-google-login')?.addEventListener('click', handleGoogleLogin);

    const handleGoogleLogout = async () => {
      try {
        await window.pastoralFirebase.signOut();
        showToast('Sesión cerrada. Los datos se mantendrán en este dispositivo en modo local.', 'info');
      } catch (err) {
        showToast('Error al cerrar sesión: ' + err.message, 'error');
      }
    };

    document.getElementById('btn-google-logout')?.addEventListener('click', handleGoogleLogout);
    document.getElementById('modal-btn-logout')?.addEventListener('click', handleGoogleLogout);

    const handleForceSync = async () => {
      showToast('Sincronizando datos con la nube...', 'info');
      const ok = await window.pastoralFirebase.pushState(state, true);
      if (ok) {
        showToast('¡Datos sincronizados exitosamente con la nube! ☁️✅', 'success');
      } else if (window.pastoralFirebase.lastError) {
        showToast(window.pastoralFirebase.lastError, 'error');
      }
    };

    document.getElementById('btn-force-cloud-sync')?.addEventListener('click', handleForceSync);
    document.getElementById('modal-btn-force-sync')?.addEventListener('click', handleForceSync);

    const configTextarea = document.getElementById('settings-firebase-config-json');
    const existingConfig = window.pastoralFirebase.getConfig();
    if (configTextarea && existingConfig) {
      configTextarea.value = JSON.stringify(existingConfig, null, 2);
    }

    document.getElementById('btn-save-firebase-config')?.addEventListener('click', async () => {
      const rawVal = configTextarea?.value.trim() || '';
      const statusMsg = document.getElementById('firebase-config-status-msg');
      if (!rawVal) {
        showToast('Pega el objeto JSON de configuración de Firebase.', 'warning');
        return;
      }
      try {
        let configObj;
        if (rawVal.includes('{')) {
          const jsonMatch = rawVal.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const sanitized = jsonMatch[0]
              .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":')
              .replace(/'/g, '"')
              .replace(/,\s*}/g, '}');
            try {
              configObj = JSON.parse(sanitized);
            } catch (_) {
              configObj = (new Function(`return ${jsonMatch[0]}`))();
            }
          }
        }
        if (!configObj || !configObj.apiKey) {
          throw new Error('No se detectó un apiKey válido en la configuración.');
        }
        await window.pastoralFirebase.saveConfig(configObj);
        showToast('Configuración de Firebase guardada e iniciada con éxito.', 'success');
        if (statusMsg) {
          statusMsg.textContent = '✅ Conectado a Firebase';
          statusMsg.style.color = 'var(--success)';
        }
      } catch (err) {
        console.error('Error guardando configuración Firebase:', err);
        showToast('Error en configuración: ' + err.message, 'error');
        if (statusMsg) {
          statusMsg.textContent = '❌ ' + err.message;
          statusMsg.style.color = 'var(--danger)';
        }
      }
    });

    document.getElementById('btn-clear-firebase-config')?.addEventListener('click', async () => {
      if (confirm('¿Deseas desvincular el proyecto de Firebase? La app continuará en modo local.')) {
        await window.pastoralFirebase.removeConfig();
        if (configTextarea) configTextarea.value = '';
        showToast('Configuración de Firebase desvinculada', 'info');
      }
    });

    window.pastoralFirebase.onStatusChange((status, user, lastError) => {
      updateCloudSyncUI(status, user, lastError);
    });

    window.pastoralFirebase.onDataUpdate((remoteState) => {
      console.log('[Cloud Sync] Recibida actualización remota desde otro dispositivo.');
      const merged = window.pastoralFirebase.mergeStates(state, remoteState);
      state = { ...state, ...merged };
      window.pastoral.saveData(state);
      renderCurrentView();
      updateTasksBadge();
      showToast('Datos sincronizados desde tu otro dispositivo 📲💻', 'success');
    });

    window.pastoralFirebase.initialize();
  }

  setupCloudSync();

  // Arrancar la aplicación
  await initApp();
});
