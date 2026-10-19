/**
 * pastoral-firebase.js
 * Módulo de Sincronización en la Nube con Google Auth y Firestore Offline-First
 * Organizador de Pastoral 2.0
 * 
 * Capacidades:
 * 1. Autenticación con Google (Popup y Redirección para móviles/PWA).
 * 2. Persistencia Offline Nativa en IndexedDB con Firestore.
 * 3. Sincronización bidireccional en tiempo real entre Teléfono y Escritorio.
 * 4. Fusión inteligente de colecciones (Notas, Eventos, Tareas, Canciones, Guiones).
 * 5. Detección automática de conectividad (Online / Offline / Sincronizando).
 * 
 * Autor: Manuel Guia
 */

(function () {
  'use strict';

  const FIREBASE_CONFIG_KEY = 'pastoral_firebase_config_v2';
  const PENDING_SYNC_KEY = 'pastoral_has_pending_cloud_sync';

  // Configuración oficial predeterminada de la app (integrada de fábrica para todos los usuarios)
  const DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyCWH_pOaccH6hMxxP2AD_LlSul-zc2YtHo",
    authDomain: "pastoral-app-213cf.firebaseapp.com",
    projectId: "pastoral-app-213cf",
    storageBucket: "pastoral-app-213cf.firebasestorage.app",
    messagingSenderId: "543175185258",
    appId: "1:543175185258:web:f8fee35fa81c58bc060b13",
    measurementId: "G-VQMHLRSXWF"
  };

  class PastoralFirebaseService {
    constructor() {
      this.app = null;
      this.auth = null;
      this.db = null;
      this.currentUser = null;
      this.unsubscribeSnapshot = null;
      this.syncStatus = 'disconnected'; // 'disconnected' | 'synced' | 'syncing' | 'offline' | 'error'
      this.lastError = null;
      this.statusListeners = new Set();
      this.dataUpdateListeners = new Set();
      this.saveTimeout = null;
      this.isInitialized = false;
      this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      this.clientId = 'client_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
      this._syncingTimeout = null;

      this._initNetworkListeners();
    }

    _initNetworkListeners() {
      if (typeof window === 'undefined') return;

      window.addEventListener('online', () => {
        this.isOnline = true;
        console.log('[Firebase Sync] Conexión a Internet restablecida.');
        if (this.currentUser) {
          this._updateStatus('syncing');
          // Forzar reconexión de Firestore si estaba offline
          if (this.db) {
            this.db.enableNetwork().catch(() => {});
          }
        } else {
          this._updateStatus('disconnected');
        }
      });

      window.addEventListener('offline', () => {
        this.isOnline = false;
        console.log('[Firebase Sync] Dispositivo sin conexión a Internet (Modo Offline).');
        if (this.currentUser) {
          this._updateStatus('offline');
        }
      });
    }

    /**
     * Obtiene la configuración de Firebase almacenada (o la predeterminada del sistema)
     */
    getConfig() {
      try {
        const raw = localStorage.getItem(FIREBASE_CONFIG_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object' && parsed.apiKey && (parsed.projectId || parsed.authDomain)) {
            return parsed;
          }
        }
      } catch (_) {}
      return DEFAULT_FIREBASE_CONFIG;
    }

    /**
     * Guarda la configuración de Firebase y reinicia el servicio
     */
    async saveConfig(config) {
      if (!config || !config.apiKey || (!config.projectId && !config.authDomain)) {
        throw new Error('La configuración debe incluir al menos apiKey y projectId.');
      }
      localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config));
      return this.initialize();
    }

    /**
     * Elimina la configuración personalizada de Firebase y restaura la oficial por defecto
     */
    async removeConfig() {
      await this.signOut();
      localStorage.removeItem(FIREBASE_CONFIG_KEY);
      this.app = null;
      this.auth = null;
      this.db = null;
      this.isInitialized = false;
      this._updateStatus('disconnected');
      return this.initialize();
    }

    /**
     * Inicializa Firebase y activa la persistencia offline de Firestore
     */
    async initialize() {
      if (typeof firebase === 'undefined') {
        // En conexiones móviles, dar margen para que los scripts terminen de cargar
        for (let i = 0; i < 15; i++) {
          await new Promise(r => setTimeout(r, 150));
          if (typeof firebase !== 'undefined') break;
        }
      }

      if (typeof firebase === 'undefined') {
        console.warn('[Firebase Sync] El SDK de Firebase no está cargado en el documento.');
        this._updateStatus('disconnected');
        return false;
      }

      const config = this.getConfig();
      if (!config || !config.apiKey) {
        this._updateStatus('disconnected');
        return false;
      }

      try {
        // Inicializar o reutilizar app de Firebase
        if (!firebase.apps.length) {
          this.app = firebase.initializeApp(config);
        } else {
          this.app = firebase.app();
        }

        this.auth = firebase.auth();
        this.db = firebase.firestore();

        // Activar persistencia Offline con soporte multi-pestaña
        try {
          await this.db.enablePersistence({ synchronizeTabs: true });
          console.log('[Firebase Sync] Persistencia Offline en IndexedDB activada con éxito.');
        } catch (err) {
          if (err.code === 'failed-precondition') {
            console.warn('[Firebase Sync] Persistencia activa en otra pestaña.');
          } else if (err.code === 'unimplemented') {
            console.warn('[Firebase Sync] Este navegador no soporta persistencia IndexedDB.');
          }
        }

        // Suscribirse a cambios en la autenticación de Google
        this.auth.onAuthStateChanged(async (user) => {
          if (user) {
            this.currentUser = {
              uid: user.uid,
              displayName: user.displayName || 'Agente Pastoral',
              email: user.email || '',
              photoURL: user.photoURL || ''
            };
            console.log('[Firebase Sync] Usuario autenticado:', this.currentUser.email);
            this._updateStatus(this.isOnline ? 'synced' : 'offline');
            this._startRealtimeSync();
          } else {
            this.currentUser = null;
            if (this.unsubscribeSnapshot) {
              this.unsubscribeSnapshot();
              this.unsubscribeSnapshot = null;
            }
            this._updateStatus('disconnected');
          }
        });

        // Manejar resultado de redirección (móviles / PWA standalone)
        try {
          const redirectResult = await this.auth.getRedirectResult();
          if (redirectResult && redirectResult.user) {
            console.log('[Firebase Sync] Redirección de autenticación completada con éxito.');
          }
        } catch (redirErr) {
          console.warn('[Firebase Sync] Error en getRedirectResult:', redirErr);
        }

        this.isInitialized = true;
        return true;
      } catch (err) {
        console.error('[Firebase Sync] Error inicializando Firebase:', err);
        this._updateStatus('disconnected');
        return false;
      }
    }

    /**
     * Iniciar sesión con Google
     */
    async signInWithGoogle() {
      if (!this.auth) {
        const initialized = await this.initialize();
        if (!initialized) {
          throw new Error('Primero debes configurar tus credenciales de Firebase en Ajustes.');
        }
      }

      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');
      provider.setCustomParameters({ prompt: 'select_account' });

      try {
        // En navegadores modernos intenta primero popup
        const result = await this.auth.signInWithPopup(provider);
        return result.user;
      } catch (err) {
        console.warn('[Firebase Sync] Popup bloqueado o fallido, intentando con Redirección:', err.code);
        // Fallback para iOS / Android PWA cuando el popup es bloqueado por el sistema
        if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user' || /iPad|iPhone|iPod|Android/.test(navigator.userAgent)) {
          await this.auth.signInWithRedirect(provider);
        } else {
          throw err;
        }
      }
    }

    /**
     * Cerrar sesión
     */
    async signOut() {
      if (this.unsubscribeSnapshot) {
        this.unsubscribeSnapshot();
        this.unsubscribeSnapshot = null;
      }
      if (this.auth) {
        await this.auth.signOut();
      }
      this.currentUser = null;
      this._updateStatus('disconnected');
    }

    /**
     * Inicia el listener en tiempo real con Firestore
     */
    _startRealtimeSync() {
      if (!this.db || !this.currentUser) return;

      if (this.unsubscribeSnapshot) {
        this.unsubscribeSnapshot();
      }

      const docRef = this.db.collection('users').doc(this.currentUser.uid).collection('pastoralData').doc('mainState');

      this.unsubscribeSnapshot = docRef.onSnapshot({ includeMetadataChanges: true }, (docSnapshot) => {
        const hasPendingWrites = docSnapshot.metadata.hasPendingWrites;
        const fromCache = docSnapshot.metadata.fromCache;

        this.lastError = null;
        if (hasPendingWrites) {
          this._updateStatus('syncing');
          if (this._syncingTimeout) clearTimeout(this._syncingTimeout);
          this._syncingTimeout = setTimeout(() => {
            if (this.syncStatus === 'syncing' && this.isOnline) {
              this._updateStatus('synced');
            }
          }, 4000);
        } else if (!this.isOnline) {
          if (this._syncingTimeout) clearTimeout(this._syncingTimeout);
          this._updateStatus('offline');
        } else {
          if (this._syncingTimeout) clearTimeout(this._syncingTimeout);
          this._updateStatus('synced');
        }

        if (docSnapshot.exists) {
          const remoteData = docSnapshot.data();
          if (remoteData && remoteData.state) {
            // Si la actualización proviene de esta misma sesión, no re-procesar para evitar bucles
            if (remoteData.writerClientId && remoteData.writerClientId === this.clientId) {
              return;
            }
            // Notificar a la app para fusionar cambios si vinieron de otro dispositivo
            if (!hasPendingWrites) {
              this._notifyDataUpdate(remoteData.state, remoteData.updatedAt);
            }
          }
        } else {
          // El documento aún no existe en la nube, subir el estado local actual
          console.log('[Firebase Sync] Creando documento inicial en la nube para el usuario...');
          if (window.pastoral && typeof window.pastoral.getData === 'function') {
            window.pastoral.getData().then(localState => {
              if (localState) this.pushState(localState, true);
            });
          }
        }
      }, (error) => {
        console.warn('[Firebase Sync] Error en listener de Firestore:', error);
        if (error && error.code === 'permission-denied') {
          this.lastError = 'Permiso denegado: debes configurar las Reglas de Firestore en Firebase Console.';
          this._updateStatus('error');
          if (typeof window.showToast === 'function') {
            window.showToast('⚠️ Permiso denegado en Firebase. Revisa las Reglas de Firestore en la consola.', 'error');
          }
        } else if (!this.isOnline) {
          this._updateStatus('offline');
        } else {
          this.lastError = error ? (error.message || error.code) : 'Error de sincronización';
          this._updateStatus('error');
        }
      });
    }

    /**
     * Sube el estado actual a la nube con debouncing automático o inmediato
     */
    pushState(state, immediate = false) {
      if (!this.db || !this.currentUser) return Promise.resolve(false);

      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = null;
      }

      this._updateStatus(this.isOnline ? 'syncing' : 'offline');

      const sanitizeForFirestore = (obj) => {
        if (obj === null || obj === undefined) return null;
        if (typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
        const clean = {};
        for (const key of Object.keys(obj)) {
          const val = obj[key];
          if (val !== undefined && typeof val !== 'function') {
            clean[key] = sanitizeForFirestore(val);
          }
        }
        return clean;
      };

      const doPush = async () => {
        try {
          const docRef = this.db.collection('users').doc(this.currentUser.uid).collection('pastoralData').doc('mainState');

          const stateToSync = sanitizeForFirestore({
            deletedIds: state.deletedIds || {},
            notes: state.notes || [],
            events: state.events || [],
            tasks: state.tasks || [],
            groups: state.groups || [],
            persons: state.persons || state.people || [],
            people: state.persons || state.people || [],
            songs: state.songs || [],
            liturgicalScripts: state.liturgicalScripts || [],
            settings: state.settings || {},
            customSongs: state.customSongs || [],
            customTemplates: state.customTemplates || []
          });

          await docRef.set({
            state: stateToSync,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            writerClientId: this.clientId,
            lastDevice: navigator.userAgent.slice(0, 80),
            version: '2.5.9'
          }, { merge: true });

          this.lastError = null;
          if (this.isOnline) {
            this._updateStatus('synced');
          } else {
            this._updateStatus('offline');
          }
          return true;
        } catch (err) {
          console.error('[Firebase Sync] Error guardando en Firestore:', err);
          if (err && err.code === 'permission-denied') {
            this.lastError = 'Permiso denegado: debes configurar las Reglas de Firestore en Firebase Console.';
            this._updateStatus('error');
            if (typeof window.showToast === 'function') {
              window.showToast('⚠️ Error de permisos en Firebase. Revisa las Reglas de Firestore en la consola.', 'error');
            }
          } else {
            this.lastError = err ? (err.message || err.code) : 'Error al guardar';
            this._updateStatus(this.isOnline ? 'synced' : 'offline');
          }
          return false;
        }
      };

      if (immediate) {
        return doPush();
      } else {
        return new Promise((resolve) => {
          this.saveTimeout = setTimeout(async () => {
            const ok = await doPush();
            resolve(ok);
          }, 1000);
        });
      }
    }

    /**
     * Fusión inteligente entre datos remotos de la nube y locales
     */
    mergeStates(localState, remoteState) {
      if (!remoteState) return localState;
      if (!localState) return remoteState;

      const getTimestamp = (item) => {
        if (!item) return 0;
        const val = item.updatedAt || item.createdAt || item.date;
        if (!val) return 0;
        const t = new Date(val).getTime();
        return isNaN(t) ? 0 : t;
      };

      // Fusión de tumbas de borrado (Tombstones) para evitar resurrección de elementos eliminados
      const allDeleted = {
        ...(localState.deletedIds || {}),
        ...(remoteState.deletedIds || {})
      };

      const mergeById = (localArr = [], remoteArr = []) => {
        const map = new Map();
        // Cargar remotos primero (excluyendo cualquier ítem eliminado)
        (Array.isArray(remoteArr) ? remoteArr : []).forEach(item => {
          if (item && item.id && !allDeleted[String(item.id)]) {
            map.set(String(item.id), item);
          }
        });
        // Fusión con locales considerando el timestamp más reciente (excluyendo eliminados)
        (Array.isArray(localArr) ? localArr : []).forEach(localItem => {
          if (!localItem || !localItem.id || allDeleted[String(localItem.id)]) return;
          const remoteItem = map.get(String(localItem.id));
          if (!remoteItem) {
            map.set(String(localItem.id), localItem);
          } else {
            const localDate = getTimestamp(localItem);
            const remoteDate = getTimestamp(remoteItem);
            if (localDate >= remoteDate) {
              map.set(String(localItem.id), localItem);
            }
          }
        });
        return Array.from(map.values());
      };

      return {
        ...localState,
        deletedIds: allDeleted,
        notes: mergeById(localState.notes, remoteState.notes),
        events: mergeById(localState.events, remoteState.events),
        tasks: mergeById(localState.tasks, remoteState.tasks),
        groups: mergeById(localState.groups, remoteState.groups),
        persons: mergeById(localState.persons || localState.people, remoteState.persons || remoteState.people),
        people: mergeById(localState.persons || localState.people, remoteState.persons || remoteState.people),
        songs: mergeById(localState.songs, remoteState.songs),
        liturgicalScripts: mergeById(localState.liturgicalScripts, remoteState.liturgicalScripts),
        customSongs: mergeById(localState.customSongs, remoteState.customSongs),
        customTemplates: mergeById(localState.customTemplates, remoteState.customTemplates),
        settings: {
          ...(remoteState.settings || {}),
          ...(localState.settings || {})
        }
      };
    }

    _updateStatus(status) {
      this.syncStatus = status;
      this.statusListeners.forEach(fn => {
        try { fn(status, this.currentUser, this.lastError); } catch (_) {}
      });
    }

    _notifyDataUpdate(remoteState, remoteUpdatedAt) {
      this.dataUpdateListeners.forEach(fn => {
        try { fn(remoteState, remoteUpdatedAt); } catch (_) {}
      });
    }

    onStatusChange(callback) {
      this.statusListeners.add(callback);
      callback(this.syncStatus, this.currentUser, this.lastError);
      return () => this.statusListeners.delete(callback);
    }

    onDataUpdate(callback) {
      this.dataUpdateListeners.add(callback);
      return () => this.dataUpdateListeners.delete(callback);
    }
  }

  // Exportar al objeto global
  window.pastoralFirebase = new PastoralFirebaseService();

})();
