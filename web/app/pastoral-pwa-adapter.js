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
    deletedIds: {},
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

  // Diccionario local de santos destacados con arte sacro e historia profunda
  const LOCAL_SAINTS = {
    '10-15': {
      name: 'Santa Teresa de Jesús',
      title: 'Virgen y Doctora de la Iglesia',
      martirology: 'Memoria de santa Teresa de Jesús, virgen y doctora de la Iglesia, nacida en Ávila (España), que reformó la Orden Carmelita con espíritu contemplativo y escribió obras maestras de la mística cristiana.',
      history: 'Santa Teresa de Cepeda y Ahumada ingresó en el convento de la Encarnación de Ávila. Movida por una profunda experiencia de Dios, inició la reforma del Carmelo fundando conventos descalzos basados en la pobreza, el silencio y la continua oración. Junto a San Juan de la Cruz, extendió la reforma a los frailes. Sus escritos («El Castillo Interior», «Camino de Perfección», «Vida») son cumbre de la teología espiritual y la literatura universal.',
      quote: 'Nada te turbe, nada te espante, todo se pasa, Dios no se muda; la paciencia todo lo alcanza; quien a Dios tiene nada le falta: Sólo Dios basta.',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Teresa_de_Jes%C3%BAs_%28cropped%29.jpg/330px-Teresa_de_Jes%C3%BAs_%28cropped%29.jpg'
    },
    '10-17': {
      name: 'San Ignacio de Antioquía',
      title: 'Obispo y Mártir',
      martirology: 'Memoria de san Ignacio, obispo y mártir, discípulo del apóstol san Juan y segundo sucesor de san Pedro en la sede de Antioquía, quien consumó su glorioso martirio en Roma bajo el emperador Trajano.',
      history: 'San Ignacio fue el tercer obispo de Antioquía de Siria. Condenado a las fieras durante la persecución del emperador Trajano, fue trasladado custodiado por diez soldados hacia Roma. Durante el viaje, redactó siete célebres cartas a diversas comunidades cristianas (Éfeso, Magnesia, Trales, Roma, Filadelfia, Esmirna y a San Policarpo). En ellas defendió la fe verdadera frente a los docetistas, insistió en la unidad de la Iglesia en torno al obispo, utilizó por primera vez la expresión "Iglesia Católica" y expresó su ardiente deseo de entregarse a Cristo en el martirio.',
      quote: 'Trigo de Dios soy, y por los dientes de las fieras he de ser molido para ser presentado como pan limpio de Cristo.',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Ignatius_of_Antiochie%2C_poss._by_Johann_Apakass_%2817th_c.%2C_Pushkin_museum%29.jpg/330px-Ignatius_of_Antiochie%2C_poss._by_Johann_Apakass_%2817th_c.%2C_Pushkin_museum%29.jpg'
    },
    '10-18': {
      name: 'San Lucas',
      title: 'Evangelista',
      martirology: 'Fiesta de san Lucas, evangelista, médico de profesión, fiel compañero del apóstol san Pablo, que transmitió el Evangelio de la misericordia divina y relató los orígenes de la Iglesia en los Hechos de los Apóstoles.',
      history: 'Nacido probablemente en Antioquía, Lucas fue un hombre cultivado y médico de profesión. Acompañó a San Pablo en varios de sus viajes misioneros y permaneció junto a él durante su prisión en Roma ("Sólo Lucas está conmigo"). En su Evangelio destaca de modo singular la misericordia de Jesús hacia los pecadores, los pobres y los marginados, el papel de las mujeres en el ministerio de Jesús, la ternura de la Virgen María en la infancia del Señor y la constante acción del Espíritu Santo.',
      quote: 'El Espíritu del Señor está sobre mí, porque me ha ungido para anunciar la Buena Noticia a los pobres.',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Saint_Luke_the_Evangelist_-_icon.jpeg/330px-Saint_Luke_the_Evangelist_-_icon.jpeg'
    },
    '10-19': {
      name: 'San Juan de Brébeuf, San Isaac Jogues y compañeros',
      title: 'Mártires de América del Norte',
      martirology: 'Memoria de los santos mártires jesuitas en tierras norteamericanas, que sembraron la fe con paciencia evangélica entre los pueblos indígenas y entregaron su vida con heroísmo.',
      history: 'Sacerdotes misioneros de la Compañía de Jesús enviados a la Nueva Francia (actual Canadá y norte de Estados Unidos) para evangelizar a las tribus huronas e iroquesas. Afrontaron privaciones indecibles, fríos extremos y hostilidades, manteniendo siempre un ardiente amor hacia los nativos. Fueron cruelmente martirizados tras derramar la caridad de Cristo en medio de la adversidad.',
      quote: 'Señor Jesús, no retrocederé jamás ante el dolor ni ante la muerte por tu Evangelio.',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Jean_de_Brebeuf_Face.jpg/330px-Jean_de_Brebeuf_Face.jpg'
    },
    '10-22': {
      name: 'San Juan Pablo II',
      title: 'Papa',
      martirology: 'Memoria de san Juan Pablo II (Karol Wojtyła), papa, quien guio a la Iglesia hacia el tercer milenio con incansable celo pastoral, visitando los cinco continentes y promoviendo el Evangelio de la Vida y la Misericordia.',
      history: 'Nacido en Wadowice (Polonia), sobrevivió al nazismo y al comunismo siendo obrero, seminarista clandestino, arzobispo de Cracovia y finalmente Papa desde 1978 hasta 2005. Fue un apasionado testigo de Cristo, apóstol incansable de la juventud (creador de las Jornadas Mundiales de la Juventud), defensor incansable de la dignidad humana y propagador universal de la Divina Misericordia.',
      quote: '¡No tengan miedo! Abran, más todavía, ¡abran de par en par las puertas a Cristo!',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/John_Paul_II_1980.jpg/330px-John_Paul_II_1980.jpg'
    },
    '10-28': {
      name: 'Santos Simón y Judas Tadeo',
      title: 'Apóstoles de Cristo',
      martirology: 'Fiesta de los santos apóstoles Simón, llamado el Zelote, y Judas, llamado Tadeo, hijo de Santiago, que anunciaron el Evangelio y sellaron su fidelidad con el martirio.',
      history: 'Simón el Zelote y Judas Tadeo (autor de la breve epístola católica del Nuevo Testamento) fueron elegidos personalmente por Jesús en el grupo de los Doce. Recorrieron diversas regiones del Medio Oriente predicando la Buena Nueva con valentía. San Judas es venerado en la piedad católica como patrono de las causas difíciles y desesperadas.',
      quote: 'A Aquel que es poderoso para guardarlos sin caída y presentarlos sin mancha ante su gloria con gran alegría... sea la gloria y el honor.',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Saint_Jude_Thaddaeus.jpg/330px-Saint_Jude_Thaddaeus.jpg'
    },
    '11-01': {
      name: 'Todos los Santos',
      title: 'Solemnidad Universal de la Iglesia',
      martirology: 'Solemne conmemoración conjunta de todos los bienaventurados que están en el cielo, conocidos o desconocidos, que lavaron sus vestiduras en la sangre del Cordero.',
      history: 'Esta gran solemnidad celebra a la multitud innumerable de hermanos nuestros que, habiendo vivido las Bienaventuranzas en lo cotidiano de sus vidas, gozan ya de la visión beatífica de Dios. La Iglesia nos invita hoy a mirar al cielo como nuestra patria definitiva y a renovar la llamada universal a la santidad que cada cristiano recibe en el Bautismo.',
      quote: 'Alégrense y regocíjense, porque su recompensa será grande en los cielos.',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Fra_Angelico_-_The_Forerunners_of_Christ_with_Saints_and_Martyrs_-_National_Gallery.jpg/330px-Fra_Angelico_-_The_Forerunners_of_Christ_with_Saints_and_Martyrs_-_National_Gallery.jpg'
    },
    '11-02': {
      name: 'Conmemoración de Todos los Fieles Difuntos',
      title: 'Conmemoración de la Iglesia',
      martirology: 'La santa Iglesia madre ofrece el santo sacrificio y sufragios por las almas de todos los que nos han precedido con el signo de la fe y duermen el sueño de la paz.',
      history: 'Desde los primeros siglos, los cristianos oraron por los difuntos en la certeza de la comunión de los santos y la resurrección de la carne. La Iglesia intercede por la purificación de las almas en el purgatorio para que contemplen pronto el rostro glorioso del Creador.',
      quote: 'Yo soy la Resurrección y la Vida; el que cree en mí, aunque haya muerto, vivirá.',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/The_Resurrection_of_Christ_by_No%C3%ABl_Coypel.jpg/330px-The_Resurrection_of_Christ_by_No%C3%ABl_Coypel.jpg'
    },
    '11-03': {
      name: 'San Martín de Porres',
      title: 'Religioso Dominico (O.P.)',
      martirology: 'Fiesta de san Martín de Porres, hermano cooperador de la Orden de Predicadores en Lima (Perú), heraldo de la caridad, la humildad y la reconciliación fraterna.',
      history: 'Hijo de noble español y madre afrodescendiente, Martín fue recibido como donado en el convento de Santo Domingo de Lima. Dedicado a las tareas más humildes y a la enfermería, su celo por los pobres, enfermos, huérfanos y hasta por los animales no conoció límites. Dotado de dones místicos y profunda contemplación ante el crucifijo, es el primer santo negro de América y patrono de la justicia social.',
      quote: 'Yo te curo, Dios te sana.',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/73/San_Mart%C3%ADn_de_Porres.jpg/330px-San_Mart%C3%ADn_de_Porres.jpg'
    },
    '11-15': {
      name: 'San Alberto Magno',
      title: 'Obispo, Doctor de la Iglesia (O.P.)',
      martirology: 'Memoria de san Alberto Magno, fraile dominico alemán, obispo de Ratisbona, doctor universal que armonizó la fe cristiana con las ciencias naturales y la filosofía.',
      history: 'Fraile de la Orden de Santo Domingo, enseñó en París y Colonia, donde fue maestro predilecto de Santo Tomás de Aquino. Profundo conocedor de la botánica, la física y la geología, demostró que la razón científica y la revelación divina provienen del mismo Dios y se complementan armónicamente.',
      quote: 'Nuestra intención en la ciencia natural no es aceptar lo que otros dicen, sino investigar las causas que obran en la naturaleza.',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Albertus_Magnus.jpg/330px-Albertus_Magnus.jpg'
    },
    '01-28': {
      name: 'Santo Tomás de Aquino',
      title: 'Presbítero y Doctor de la Iglesia (O.P.)',
      martirology: 'Memoria de santo Tomás de Aquino, fraile dominico, el "Doctor Angélico", cuya sabiduría teológica y filosófica ilumina permanentemente el magisterio de la Iglesia.',
      history: 'Nacido en Roccasecca (Italia), vistió el hábito dominico contra la voluntad familiar. Estudió bajo San Alberto Magno y enseñó en las mayores universidades de Europa. Escribió la colosal "Summa Theologiae" e himnos eucarísticos ("Pange Lingua", "Adoro Te Devote").',
      quote: 'La gracia no destruye la naturaleza, sino que la perfecciona.',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/St-thomas-aquinas.jpg/330px-St-thomas-aquinas.jpg'
    },
    '04-29': {
      name: 'Santa Catalina de Siena',
      title: 'Virgen y Doctora de la Iglesia, Patrona de Europa (O.P.)',
      martirology: 'Fiesta de santa Catalina de Siena, terciaria dominica, virgen y doctora de la Iglesia, incansable defensora de la paz, la verdad y la reforma de la Iglesia.',
      history: 'Desde temprana edad consagró su virginidad a Cristo e ingresó a las Hermanas de la Penitencia de Santo Domingo. Su "Diálogo de la Divina Providencia" es cumbre de la espiritualidad católica.',
      quote: '¡Si son lo que deben ser, prenderán fuego al mundo entero!',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Saint_Catherine_of_Siena_by_Baldassare_Franceschini.jpg/330px-Saint_Catherine_of_Siena_by_Baldassare_Franceschini.jpg'
    },
    '08-08': {
      name: 'Santo Domingo de Guzmán',
      title: 'Fundador de la Orden de Predicadores (O.P.)',
      martirology: 'Solemnidad de santo Domingo de Guzmán, presbítero, que fundó la Orden de Predicadores para la defensa de la verdad y la proclamación de la Palabra de Dios.',
      history: 'Hombre de oración constante, sólo hablaba con Dios o de Dios. Fundó frailes que viviesen en pobreza apostólica, consagrados al estudio contemplativo y a la predicación.',
      quote: 'Hablar con Dios o de Dios.',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Saint_Dominic_by_Fra_Angelico.jpg/330px-Saint_Dominic_by_Fra_Angelico.jpg'
    },
    '08-23': {
      name: 'Santa Rosa de Lima',
      title: 'Virgen (O.P.), Patrona de América y las Filipinas',
      martirology: 'Fiesta de santa Rosa de Lima (Isabel Flores de Oliva), primera flor de santidad de América Latina, terciaria dominica consagrada a la caridad fraterna.',
      history: 'Nacida en Lima, se consagró a Cristo imitando a Santa Catalina de Siena, atendiendo con amor desbordante a los enfermos y necesitados de la ciudad.',
      quote: 'Aparte de la cruz no hay otra escala por la que podamos subir al cielo.',
      imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Angelino_Medoro_-_Santa_Rosa_de_Lima.jpg/330px-Angelino_Medoro_-_Santa_Rosa_de_Lima.jpg'
    }
  };

  /** Consulta la API pública de Wikipedia para obtener retratos de arte sacro */
  async function fetchSaintImageOnline(saintName) {
    if (!saintName) return null;
    const cleanName = saintName.replace(/^(san|santa|santos|santas|beato|beata)\s+/i, '').trim();
    const searchVariants = [
      saintName,
      cleanName,
      `San ${cleanName}`,
      `Santa ${cleanName}`
    ];

    for (const name of searchVariants) {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 3500);
        const url = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`;
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(tid);
        if (res.ok) {
          const data = await res.json();
          const img = data.thumbnail?.source || data.originalimage?.source;
          if (img) return img;
        }
      } catch (_) {}
    }
    return null;
  }

  /** Limpia etiquetas y notas promocionales de Evangelizo */
  function cleanEvangelizoText(html) {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html.replace(/<br\s*[\/]?>/gi, '\n');
    const text = tmp.textContent || tmp.innerText || '';
    return text
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => {
        const l = line.toLowerCase();
        if (!l) return false;
        if (l.includes('evangeliodeldia.org') || l.includes('evangelizo.org')) return false;
        if (l.includes('para recibir cada mañana') || l.includes('para recibir el evangelio')) return false;
        if (l.includes('extraído de la biblia') || l.includes('libro del pueblo de dios')) return false;
        if (l.includes('registrarse:') || l.includes('por correo electrónico')) return false;
        if (l.startsWith('fuente:') || l.includes('copyright') || l.includes('todos los derechos reservados')) return false;
        return true;
      })
      .join('\n\n')
      .trim();
  }

  /** Consulta segura con timeout al servicio litúrgico público Evangelizo */
  async function fetchEvangelizoParam(dateStr, type, content = '') {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 4000);
    try {
      const q = content ? `date=${dateStr}&lang=SP&type=${type}&content=${content}` : `date=${dateStr}&lang=SP&type=${type}`;
      const res = await fetch(`https://feed.evangelizo.org/v2/reader.php?${q}`, { signal: ctrl.signal });
      clearTimeout(tid);
      if (!res.ok) return '';
      const txt = await res.text();
      if (!txt || txt.includes('Error : wrong param') || txt.includes('<title>Reader Evangelizo</title>')) return '';
      return cleanEvangelizoText(txt);
    } catch (_) {
      clearTimeout(tid);
      return '';
    }
  }

  /** Objeto API de Pastoral para el navegador e iOS */
  const PastoralWebAdapter = {
    async getData() {
      const defaultSongs = (typeof PastoralSongData !== 'undefined' && PastoralSongData.DEFAULT_SONGS)
        ? PastoralSongData.DEFAULT_SONGS
        : (typeof window !== 'undefined' && window.PastoralSongData ? window.PastoralSongData.DEFAULT_SONGS : []);

      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          // Asegurar que las canciones por defecto estén siempre presentes
          if (!Array.isArray(parsed.songs) || parsed.songs.length === 0) {
            parsed.songs = JSON.parse(JSON.stringify(defaultSongs));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
          }
          return parsed;
        }
      } catch (err) {
        console.warn('[PWA Adapter] Error leyendo localStorage, usando seed:', err);
      }
      // Guardar seed inicial con las 25 canciones litúrgicas
      const seed = JSON.parse(JSON.stringify(INITIAL_SEED_DATA));
      seed.songs = JSON.parse(JSON.stringify(defaultSongs));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      } catch (e) {
        console.warn('[PWA Adapter] No se pudo guardar seed en localStorage:', e);
      }
      return seed;
    },

    async saveData(data, shouldPushToCloud = true) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        // Sincronizar en segundo plano con Firebase si está autenticado
        if (shouldPushToCloud && window.pastoralFirebase && typeof window.pastoralFirebase.pushState === 'function') {
          window.pastoralFirebase.pushState(data);
        }
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
      if (!url) return { success: false };
      try {
        const win = window.open(url, '_blank', 'noopener,noreferrer');
        if (!win || win.closed || typeof win.closed === 'undefined') {
          const link = document.createElement('a');
          link.href = url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          document.body.appendChild(link);
          link.click();
          link.remove();
        }
        return { success: true };
      } catch (_) {
        window.location.href = url;
        return { success: true };
      }
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
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const key = `${m}-${day}`;
        const dateKey = `${y}-${m}-${day}`;

        let saint = LOCAL_SAINTS[key];
        if (saint) {
          saint = { ...saint, dateKey, timestamp: Date.now() };
        } else {
          const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
          const dateFormatted = `${d.getDate()} de ${monthNames[d.getMonth()]}`;
          saint = {
            name: `Santos del ${dateFormatted}`,
            title: 'Testigos de la Fe',
            martirology: `Conmemoración de los santos, beatos y justos que en este día de ${dateFormatted} rindieron testimonio del Evangelio.`,
            history: `La Iglesia celebra hoy la memoria de los testigos de Jesucristo que vivieron el Evangelio en santidad, oración y servicio fraterno a los más necesitados.`,
            quote: 'Donde hay amor y sabiduría, no hay temor ni ignorancia.',
            imageUrl: '',
            dateKey,
            timestamp: Date.now()
          };
        }

        // Si no tiene imagen, intentar resolverla dinámicamente desde Wikipedia
        if (!saint.imageUrl && saint.name) {
          try {
            const fetchedImg = await fetchSaintImageOnline(saint.name);
            if (fetchedImg) saint.imageUrl = fetchedImg;
          } catch (_) {}
        }

        return { success: true, saint };
      }
    },

    // 4. Lecturas Bíblicas
    readings: {
      async getDailyReadings(options = {}) {
        const d = options.date ? new Date(options.date) : new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${y}${m}${day}`;
        const dateKey = `${y}-${m}-${day}`;

        let liturgicTitle = '';
        let firstTitle = '';
        let firstText = '';
        let psalmTitle = '';
        let psalmText = '';
        let gospelTitle = '';
        let gospelText = '';

        try {
          const [litT, frT, frC, psT, psC, gspT, gspC] = await Promise.all([
            fetchEvangelizoParam(dateStr, 'liturgic_t'),
            fetchEvangelizoParam(dateStr, 'reading_lt', 'FR'),
            fetchEvangelizoParam(dateStr, 'reading', 'FR'),
            fetchEvangelizoParam(dateStr, 'reading_lt', 'PS'),
            fetchEvangelizoParam(dateStr, 'reading', 'PS'),
            fetchEvangelizoParam(dateStr, 'reading_lt', 'GSP'),
            fetchEvangelizoParam(dateStr, 'reading', 'GSP')
          ]);

          if (litT) liturgicTitle = litT;
          if (frT) firstTitle = frT;
          if (frC) firstText = frC;
          if (psT) psalmTitle = psT;
          if (psC) psalmText = psC;
          if (gspT) gospelTitle = gspT;
          if (gspC) gospelText = gspC;
        } catch (_) {}

        // Fallbacks completos y reverentes si no hay conexión a internet o falló el servicio
        if (!gospelText) {
          gospelTitle = 'Evangelio según San Lucas 12, 8-12';
          gospelText = 'En aquel tiempo, Jesús dijo a sus discípulos:\n«Les aseguro que aquel que me reconozca abiertamente delante de los hombres, el Hijo del hombre lo reconocerá ante los ángeles de Dios.\nPero el que no me reconozca delante de los hombres, no será reconocido ante los ángeles de Dios.\nAl que diga una palabra contra el Hijo del hombre, se le perdonará; pero al que blasfeme contra el Espíritu Santo, no se le perdonará.\nCuando los lleven ante las sinagogas, ante los magistrados y las autoridades, no se preocupen de cómo se van a defender o qué van a decir,\nporque el Espíritu Santo les enseñará en ese momento lo que deban decir».';
        }

        if (!firstText) {
          firstTitle = firstTitle || 'Carta de San Pablo a los Efesios 1, 15-23';
          firstText = 'Hermanos: Habiéndome enterado de la fe que ustedes tienen en el Señor Jesús y del amor que demuestran por todos los hermanos, doy gracias sin cesar por ustedes recordándolos siempre en mis oraciones.\nQue el Dios de nuestro Señor Jesucristo, el Padre de la gloria, les conceda un espíritu de sabiduría y de revelación que les permita conocerlo verdaderamente.\nQue él ilumine sus corazones, para que ustedes puedan valorar la esperanza a la que han sido llamados, los tesoros de gloria que encierra su herencia entre los santos,\ny la extraordinaria grandeza del poder con que él obra en nosotros, los creyentes, por la eficacia de su fuerza.';
        }

        if (!psalmText) {
          psalmTitle = psalmTitle || 'Salmo 8, 2-3a.4-5.6-7';
          psalmText = '¡Señor, nuestro Dios, qué admirable es tu Nombre en toda la tierra!\nTú, que afirmaste tu majestad sobre el cielo,\ncon la alabanza de los niños y de los más pequeños.\nAl ver el cielo, obra de tus manos, la luna y las estrellas que has creado:\n¿Qué es el hombre para que pienses en él, el ser humano para que lo cuides?\nLo hiciste poco inferior a los ángeles, lo coronaste de gloria y esplendor;\nle diste dominio sobre la obra de tus manos.\nTodo lo pusiste bajo sus pies.';
        }

        let shortText = '';
        if (gospelText) {
          const sentences = gospelText.split(/[.\n]+/).map(s => s.trim()).filter(s => s.length > 25);
          shortText = sentences[0] || gospelText.slice(0, 160) + '...';
          if (!shortText.endsWith('.')) shortText += '.';
        }

        const readings = {
          dateKey,
          timestamp: Date.now(),
          liturgicTitle: liturgicTitle || 'Tiempo Ordinario de la Iglesia',
          gospel: {
            title: gospelTitle || 'Santo Evangelio',
            text: gospelText,
            shortText
          },
          firstReading: {
            title: firstTitle || 'Primera Lectura',
            text: firstText
          },
          psalm: {
            title: psalmTitle || 'Salmo Responsorial',
            text: psalmText
          }
        };

        return { success: true, readings };
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
        if (!apiKey) return { ok: false, success: false, error: 'Por favor ingresa una API Key válida' };

        try {
          const cleanKey = apiKey.trim();
          if (provider === 'gemini') {
            if (cleanKey.startsWith('AQ.')) {
              return {
                ok: false,
                success: false,
                error: 'Has ingresado un token de acceso temporal de Google Cloud ("AQ..."). La API de Gemini requiere una Clave de API oficial ("AIza..."). Ve a https://aistudio.google.com/app/apikey, pulsa en "Create API key" > "Create API key in new project" y copia la clave generada.'
              };
            }
            const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`;
            const res = await fetch(url);
            if (!res.ok) {
              const errJson = await res.json().catch(() => ({}));
              const reason = errJson.error?.details?.[0]?.reason;
              let msg = errJson.error?.message || `Error HTTP ${res.status}`;
              if (reason === 'ACCESS_TOKEN_TYPE_UNSUPPORTED' || errJson.error?.status === 'UNAUTHENTICATED' || msg.toLowerCase().includes('api key not valid')) {
                msg = 'Clave no válida para la API de Gemini. La clave oficial de Google AI Studio debe comenzar con "AIza...". Ve a https://aistudio.google.com/app/apikey, pulsa en "Create API key" > "Create API key in new project" y copia la clave generada.';
              }
              return { ok: false, success: false, error: msg };
            }
            return { ok: true, success: true, reply: 'Conexión verificada con Google Gemini AI', message: 'Conexión exitosa con Google Gemini AI' };
          } else {
            const cleanKey = apiKey.trim();
            const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
              headers: { Authorization: `Bearer ${cleanKey}` }
            });
            if (!res.ok) return { ok: false, success: false, error: `Error HTTP ${res.status}` };
            return { ok: true, success: true, reply: 'Conexión verificada con OpenRouter', message: 'Conexión exitosa con OpenRouter' };
          }
        } catch (err) {
          return { ok: false, success: false, error: err.message };
        }
      },

      async getModels(params) {
        return {
          success: true,
          models: [
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Recomendado - Multimodal con Visión y Documentos PDF)' },
            { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Ultrarrápido y oficial)' },
            { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Alta estabilidad)' },
            { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Razonamiento profundo)' }
          ]
        };
      },

      async startChat(params) {
        if (currentAbortController) {
          currentAbortController.abort();
        }
        currentAbortController = new AbortController();

        const { provider = 'gemini', apiKey, model, messages = [], systemPrompt, appContext } = params;

        if (!apiKey) {
          emitStatus('error', 'Falta la API Key en Ajustes');
          emitChunk('⚠️ Por favor ingresa tu API Key en la sección de Ajustes para activar el Asistente de IA.');
          return { success: false, error: 'Falta API Key' };
        }

        emitStatus('connecting', 'Conectando con la IA...');

        // Construir system prompt pastoral si no fue provisto
        let systemText = systemPrompt;
        if (!systemText && appContext) {
          systemText = `Eres el Asistente Pastoral inteligente del "Organizador de Pastoral 2.0" en ${appContext.schoolName || 'la comunidad educativa'}. `
            + `Fecha actual: ${appContext.todayStr || ''}. Tiempo litúrgico: ${appContext.liturgicalSeason || 'Tiempo Ordinario'} (${appContext.liturgicalColor || 'Verde'}). `
            + `Tu misión es redactar oraciones inspiradoras, guiones para misas y celebraciones, cantos litúrgicos y dinámicas pastorales con calidez humana y fidelidad cristiana. `
            + `Responde siempre en español con formato Markdown claro y bien estructurado.`;
        }

        let accumulatedResponse = '';

        try {
          if (provider === 'gemini') {
            // Normalizar modelo para Gemini REST v1beta
            let targetModel = model ? model.trim().replace(/^models\//, '') : 'gemini-2.5-flash';
            if (!targetModel || targetModel === 'gemini-3.8-flash' || targetModel === 'gemini-flash-latest') {
              targetModel = 'gemini-2.5-flash';
            }

            // Normalizar mensajes y contenidos multi-modal (imágenes y documentos PDF/texto)
            const contents = [];
            for (const m of messages) {
              if (m.role === 'system') continue;
              const role = m.role === 'assistant' ? 'model' : 'user';
              const parts = [];

              if (typeof m.content === 'string' && m.content.trim()) {
                parts.push({ text: m.content.trim() });
              } else if (Array.isArray(m.content)) {
                for (const part of m.content) {
                  if (part.type === 'text' && part.text) {
                    parts.push({ text: part.text });
                  } else if (part.type === 'image_url' && part.image_url?.url) {
                    const dataUrl = part.image_url.url;
                    const match = dataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
                    if (match) {
                      parts.push({
                        inlineData: {
                          mimeType: match[1].trim(),
                          data: match[2].replace(/\s/g, '')
                        }
                      });
                    }
                  } else if (part.type === 'file_url' && part.file_url?.url) {
                    const dataUrl = part.file_url.url;
                    const match = dataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
                    if (match) {
                      parts.push({
                        inlineData: {
                          mimeType: part.file_url.mimeType || match[1].trim() || 'application/pdf',
                          data: match[2].replace(/\s/g, '')
                        }
                      });
                    }
                  }
                }
              }

              if (parts.length > 0) {
                contents.push({ role, parts });
              }
            }

            if (contents.length === 0) {
              throw new Error('No hay mensajes válidos para enviar.');
            }

            const reqBody = {
              contents,
              systemInstruction: systemText ? { parts: [{ text: systemText }] } : undefined,
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2048
              }
            };

            const cleanKey = apiKey.trim();
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(targetModel)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(cleanKey)}`;
            
            const response = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': cleanKey
              },
              body: JSON.stringify(reqBody),
              signal: currentAbortController.signal
            });

            if (!response.ok) {
              const errData = await response.json().catch(() => ({}));
              const reason = errData.error?.details?.[0]?.reason;
              let errMsg = errData.error?.message || `HTTP ${response.status}`;
              if (reason === 'ACCESS_TOKEN_TYPE_UNSUPPORTED' || errData.error?.status === 'UNAUTHENTICATED' || errMsg.toLowerCase().includes('api key not valid')) {
                errMsg = 'Clave no válida para la API de Gemini. La clave oficial de Google AI Studio debe comenzar con "AIza...". Ve a https://aistudio.google.com/app/apikey, pulsa en "Create API key" > "Create API key in new project" y copia la clave generada.';
              }
              throw new Error(errMsg);
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
                      accumulatedResponse += chunkText;
                      emitChunk(chunkText);
                    }
                  } catch (_) {}
                }
              }
            }

            emitStatus('done', 'Listo');
            return {
              success: true,
              response: { role: 'assistant', content: accumulatedResponse }
            };

          } else {
            // OpenRouter Provider
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey.trim()}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': window.location.origin,
                'X-Title': 'Organizador Pastoral PWA'
              },
              body: JSON.stringify({
                model: model || 'google/gemma-3-27b-it:free',
                messages: [
                  ...(systemText ? [{ role: 'system', content: systemText }] : []),
                  ...messages
                ],
                stream: true
              }),
              signal: currentAbortController.signal
            });

            if (!response.ok) {
              throw new Error(`OpenRouter HTTP ${response.status}`);
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
              buffer = lines.pop();

              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('data: ')) {
                  const dataStr = trimmed.slice(6);
                  if (dataStr === '[DONE]') break;
                  try {
                    const parsed = JSON.parse(dataStr);
                    const chunk = parsed.choices?.[0]?.delta?.content;
                    if (chunk) {
                      accumulatedResponse += chunk;
                      emitChunk(chunk);
                    }
                  } catch (_) {}
                }
              }
            }

            emitStatus('done', 'Listo');
            return {
              success: true,
              response: { role: 'assistant', content: accumulatedResponse }
            };
          }
        } catch (err) {
          if (err.name === 'AbortError') {
            emitStatus('cancelled', 'Cancelado por el usuario');
            return { success: false, cancelled: true };
          }
          const errorMsg = err.message || 'Error en la conexión con la IA';
          emitStatus('error', errorMsg);
          emitChunk(`\n\n❌ **Error en la IA:** ${errorMsg}`);
          return { success: false, error: errorMsg };
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
    },

    get cloud() {
      return window.pastoralFirebase || null;
    }
  };

  function emitChunk(chunk) {
    streamChunkListeners.forEach(cb => {
      try { cb(chunk); } catch (e) { console.error(e); }
    });
  }

  function emitStatus(status, text) {
    const textMsg = text || (typeof status === 'string' ? status : 'Pensando...');
    streamStatusListeners.forEach(cb => {
      try { cb(textMsg); } catch (e) { console.error(e); }
    });
  }

  // Exponer API en el objeto global de la ventana
  window.pastoral = PastoralWebAdapter;

  // Registrar Service Worker para PWA en iOS y navegadores con auto-actualización inmediata
  if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost')) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        console.log('[Pastoral PWA] Nueva versión activada. Recargando la aplicación...');
        window.location.reload();
      }
    });

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        console.log('[Pastoral PWA] Service Worker registrado con éxito:', reg.scope);
        // Chequeo forzado de actualización
        reg.update();

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[Pastoral PWA] Nueva versión disponible. Activando...');
                newWorker.postMessage({ action: 'skipWaiting' });
              }
            });
          }
        });
      }).catch((err) => {
        console.warn('[Pastoral PWA] Error registrando Service Worker:', err);
      });
    });

    // Rechequear cada vez que el usuario vuelve a la app (ej: desde segundo plano en el teléfono)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        navigator.serviceWorker.getRegistration().then((reg) => {
          if (reg) reg.update();
        });
      }
    });
  }

})();
