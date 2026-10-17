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

  class PastoralFirebaseService {
    constructor() {
      this.app = null;
      this.auth = null;
      this.db = null;
      this.currentUser = null;
      this.unsubscribeSnapshot = null;
      this.syncStatus = 'disconnected'; // 'disconnected' | 'synced' | 'syncing' | 'offline'
      this.statusListeners = new Set();
      this.dataUpdateListeners = new Set();
      this.saveTimeout = null;
      this.isInitialized = false;
      this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

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
     * Obtiene la configuración de Firebase almacenada
     */
    getConfig() {
      try {
        const raw = localStorage.getItem(FIREBASE_CONFIG_KEY);
        if (raw) return JSON.parse(raw);
      } catch (_) {}
      return null;
    }

    /**
     * Guarda la configuración de Firebase y reinicia el servicio
     */
    async saveConfig(config) {
      if (!config || !config.apiKey || !config.projectId) {
        throw new Error('La configuración debe incluir al menos apiKey y projectId.');
      }
      localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config));
      return this.initialize();
    }

    /**
     * Elimina la configuración de Firebase
     */
    async removeConfig() {
      await this.signOut();
      localStorage.removeItem(FIREBASE_CONFIG_KEY);
      this.app = null;
      this.auth = null;
      this.db = null;
      this.isInitialized = false;
      this._updateStatus('disconnected');
    }

    /**
     * Inicializa Firebase y activa la persistencia offline de Firestore
     */
    async initialize() {
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

        if (hasPendingWrites) {
          this._updateStatus('syncing');
        } else if (!this.isOnline) {
          this._updateStatus('offline');
        } else {
          this._updateStatus('synced');
        }

        if (docSnapshot.exists) {
          const remoteData = docSnapshot.data();
          if (remoteData && remoteData.state) {
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
              if (localState) this.pushState(localState);
            });
          }
        }
      }, (error) => {
        console.warn('[Firebase Sync] Error en listener de Firestore:', error);
        if (!this.isOnline) {
          this._updateStatus('offline');
        }
      });
    }

    /**
     * Sube el estado actual a la nube con debouncing automático
     */
    pushState(state) {
      if (!this.db || !this.currentUser) return;

      // Debounce de 1.2 segundos para agrupar escrituras rápidas
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout);
      }

      this._updateStatus(this.isOnline ? 'syncing' : 'offline');

      this.saveTimeout = setTimeout(async () => {
        try {
          const docRef = this.db.collection('users').doc(this.currentUser.uid).collection('pastoralData').doc('mainState');

          // Limpiar datos que no requieren sincronizarse (ej: objetos no serializables)
          const stateToSync = {
            notes: state.notes || [],
            events: state.events || [],
            tasks: state.tasks || [],
            groups: state.groups || [],
            people: state.people || state.persons || [],
            songs: state.songs || [],
            liturgicalScripts: state.liturgicalScripts || [],
            settings: state.settings || {},
            customSongs: state.customSongs || [],
            customTemplates: state.customTemplates || []
          };

          await docRef.set({
            state: stateToSync,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastDevice: navigator.userAgent.slice(0, 80),
            version: '2.5.3'
          }, { merge: true });

          if (this.isOnline) {
            this._updateStatus('synced');
          } else {
            this._updateStatus('offline');
          }
        } catch (err) {
          console.error('[Firebase Sync] Error guardando en Firestore:', err);
          this._updateStatus(this.isOnline ? 'synced' : 'offline');
        }
      }, 1200);
    }

    /**
     * Fusión inteligente entre datos remotos de la nube y locales
     */
    mergeStates(localState, remoteState) {
      if (!remoteState) return localState;
      if (!localState) return remoteState;

      const mergeById = (localArr = [], remoteArr = []) => {
        const map = new Map();
        // Cargar remotos primero
        remoteArr.forEach(item => {
          if (item && item.id) map.set(item.id, item);
        });
        // Fusión con locales considerando updatedAt
        localArr.forEach(localItem => {
          if (!localItem || !localItem.id) return;
          const remoteItem = map.get(localItem.id);
          if (!remoteItem) {
            map.set(localItem.id, localItem);
          } else {
            const localDate = new Date(localItem.updatedAt || localItem.date || 0).getTime();
            const remoteDate = new Date(remoteItem.updatedAt || remoteItem.date || 0).getTime();
            if (localDate >= remoteDate) {
              map.set(localItem.id, localItem);
            }
          }
        });
        return Array.from(map.values());
      };

      return {
        ...localState,
        notes: mergeById(localState.notes, remoteState.notes),
        events: mergeById(localState.events, remoteState.events),
        tasks: mergeById(localState.tasks, remoteState.tasks),
        groups: mergeById(localState.groups, remoteState.groups),
        people: mergeById(localState.people || localState.persons, remoteState.people || remoteState.persons),
        songs: mergeById(localState.songs, remoteState.songs),
        liturgicalScripts: mergeById(localState.liturgicalScripts, remoteState.liturgicalScripts),
        settings: {
          ...(remoteState.settings || {}),
          ...(localState.settings || {})
        }
      };
    }

    _updateStatus(status) {
      this.syncStatus = status;
      this.statusListeners.forEach(fn => {
        try { fn(status, this.currentUser); } catch (_) {}
      });
    }

    _notifyDataUpdate(remoteState, remoteUpdatedAt) {
      this.dataUpdateListeners.forEach(fn => {
        try { fn(remoteState, remoteUpdatedAt); } catch (_) {}
      });
    }

    onStatusChange(callback) {
      this.statusListeners.add(callback);
      callback(this.syncStatus, this.currentUser);
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
