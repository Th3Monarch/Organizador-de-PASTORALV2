/**
 * cloud-manager.js
 * Cliente de IA integral para Organizador Pastoral.
 * Soporta de forma nativa:
 * 1. Google Gemini Oficial (API de Google AI Studio con streaming SSE y Function Calling nativo).
 * 2. OpenRouter / OpenAI-compatible (/chat/completions).
 * Sin librerías externas de runtime.
 * Autor: Manuel Guia
 */

const { URL } = require('url');

// Definición de herramientas compatibles con formato OpenAPI / JSON Schema
const TOOLS_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'create_note',
      description: 'Crea una nueva nota o idea pastoral en el Organizador. Si falta información fundamental, pídela antes.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Título de la nota o idea.' },
          body: { type: 'string', description: 'Contenido completo en texto o Markdown.' },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Etiquetas temáticas (ej: "Catequesis", "Retiro", "Reunión", "Liturgia").'
          }
        },
        required: ['title', 'body']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_note',
      description: 'Edita o actualiza una nota pastoral existente. Se puede buscar por "id" o por "search_title".',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID de la nota si se conoce.' },
          search_title: { type: 'string', description: 'Título o fragmento del título de la nota para buscarla si no se tiene el ID.' },
          title: { type: 'string', description: 'Nuevo título para la nota.' },
          body: { type: 'string', description: 'Nuevo contenido completo de la nota en texto o Markdown.' },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Nuevas etiquetas temáticas.'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_note',
      description: 'Elimina permanentemente una nota pastoral del Organizador. Se puede identificar por "id" o por "search_title".',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID de la nota a eliminar.' },
          search_title: { type: 'string', description: 'Título o fragmento del título de la nota a eliminar.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_event',
      description: 'Registra un evento en el calendario pastoral. La fecha (YYYY-MM-DD) es imprescindible. Si no la tienes, pídela.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Nombre o título del evento.' },
          date: { type: 'string', description: 'Fecha del evento en formato YYYY-MM-DD.' },
          time: { type: 'string', description: 'Hora en formato HH:MM (ej: "18:00"). Opcional.' },
          location: { type: 'string', description: 'Lugar del evento (ej: "Capilla escolar", "Auditorio"). Opcional.' },
          category: {
            type: 'string',
            enum: ['Misa', 'Retiro', 'Reunión', 'Campaña', 'Formación', 'Convivencia', 'Otro'],
            description: 'Categoría pastoral o litúrgica.'
          },
          description: { type: 'string', description: 'Detalles y notas adicionales del evento.' },
          repeat: {
            type: 'string',
            enum: ['none', 'weekly', 'monthly'],
            description: 'Frecuencia de repetición. Por defecto "none".'
          },
          repeatUntil: { type: 'string', description: 'Fecha fin de repetición en formato YYYY-MM-DD si aplica.' },
          attendees: { type: 'string', description: 'Destinatarios o participantes convocados.' },
          scriptId: { type: 'string', description: 'ID de un guión litúrgico existente para vincularlo a este evento (opcional).' },
          checklist: {
            type: 'array',
            items: { type: 'string' },
            description: 'Lista de tareas y preparativos pastorales para este evento (ej: ["Reservar capilla", "Asignar lectores", "Preparar ofrendas"]).'
          }
        },
        required: ['title', 'date', 'category']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_event',
      description: 'Edita o reprograma un evento en el calendario pastoral. Se puede buscar por "id" o por "search_title".',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID del evento si se conoce.' },
          search_title: { type: 'string', description: 'Título o fecha para buscar el evento si no se tiene el ID.' },
          title: { type: 'string', description: 'Nuevo título del evento.' },
          date: { type: 'string', description: 'Nueva fecha en formato YYYY-MM-DD.' },
          time: { type: 'string', description: 'Nueva hora en formato HH:MM.' },
          location: { type: 'string', description: 'Nuevo lugar o ubicación.' },
          category: {
            type: 'string',
            enum: ['Misa', 'Retiro', 'Reunión', 'Campaña', 'Formación', 'Convivencia', 'Otro'],
            description: 'Nueva categoría pastoral o litúrgica.'
          },
          description: { type: 'string', description: 'Nuevos detalles o notas del evento.' },
          repeat: {
            type: 'string',
            enum: ['none', 'weekly', 'monthly'],
            description: 'Frecuencia de repetición.'
          },
          repeatUntil: { type: 'string', description: 'Nueva fecha fin de repetición (YYYY-MM-DD).' },
          attendees: { type: 'string', description: 'Nuevos participantes convocados.' },
          scriptId: { type: 'string', description: 'ID del guión litúrgico a vincular, o "" para desvincular.' },
          checklist: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string', description: 'Descripción de la tarea o preparativo.' },
                done: { type: 'boolean', description: 'Estado completado o pendiente.' }
              },
              required: ['text']
            },
            description: 'Lista actualizada de tareas de preparación pastoral.'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'toggle_event_checklist_item',
      description: 'Marca como completada o pendiente una tarea preparatoria dentro del checklist de un evento pastoral.',
      parameters: {
        type: 'object',
        properties: {
          eventId: { type: 'string', description: 'ID del evento si se conoce.' },
          search_event: { type: 'string', description: 'Título del evento para buscarlo si no se tiene el ID.' },
          task_text: { type: 'string', description: 'Texto o fragmento del nombre de la tarea a marcar.' },
          done: { type: 'boolean', description: 'true para marcar como lista/completada, false para dejarla pendiente.' }
        },
        required: ['done']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_event_announcement',
      description: 'Redacta la convocatoria o circular oficial de un evento para apoderados, aviso interno de profesores o mensaje de WhatsApp.',
      parameters: {
        type: 'object',
        properties: {
          eventId: { type: 'string', description: 'ID del evento si se conoce.' },
          search_event: { type: 'string', description: 'Título o fecha del evento para buscarlo.' },
          target: {
            type: 'string',
            enum: ['apoderados', 'profesores', 'whatsapp'],
            description: 'Tipo de convocatoria: "apoderados" (circular formal escolar), "profesores" (aviso/memorándum de coordinación) o "whatsapp" (mensaje ágil con viñetas y emojis).'
          }
        },
        required: ['target']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_event',
      description: 'Elimina o cancela un evento del calendario pastoral. Se puede identificar por "id" o por "search_title".',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID del evento a eliminar.' },
          search_title: { type: 'string', description: 'Título o fecha del evento a eliminar si no se tiene el ID.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Crea una tarea pendiente en la lista de deberes de pastoral.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Descripción concreta de la tarea.' },
          due: { type: 'string', description: 'Fecha límite en formato YYYY-MM-DD (opcional).' },
          priority: {
            type: 'string',
            enum: ['baja', 'media', 'alta'],
            description: 'Prioridad de la tarea. Por defecto "media".'
          },
          notes: { type: 'string', description: 'Notas explicativas o pasos a seguir (opcional).' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_task',
      description: 'Edita una tarea: cambiar título, fecha, prioridad, notas o marcarla como completada/pendiente con "done".',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID de la tarea si se conoce.' },
          search_title: { type: 'string', description: 'Título o fragmento del título de la tarea a buscar.' },
          title: { type: 'string', description: 'Nuevo título o descripción de la tarea.' },
          due: { type: 'string', description: 'Nueva fecha límite en formato YYYY-MM-DD.' },
          priority: {
            type: 'string',
            enum: ['baja', 'media', 'alta'],
            description: 'Nueva prioridad de la tarea.'
          },
          notes: { type: 'string', description: 'Nuevas notas o instrucciones.' },
          done: { type: 'boolean', description: 'true para marcar como completada/realizada, false para dejarla pendiente.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_task',
      description: 'Elimina permanentemente una tarea de la lista de pendientes. Se puede identificar por "id" o por "search_title".',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID de la tarea a eliminar.' },
          search_title: { type: 'string', description: 'Título o fragmento del título de la tarea a eliminar.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_group',
      description: 'Registra un nuevo grupo pastoral o apostolado en la comunidad.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nombre del grupo (ej: "Grupo Juvenil Veritas", "Coro Santo Domingo").' },
          leader: { type: 'string', description: 'Nombre del coordinador o responsable.' },
          description: { type: 'string', description: 'Propósito y misión del grupo.' },
          members: { type: 'string', description: 'Integrantes iniciales o conteo (opcional).' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_group',
      description: 'Edita los datos de un grupo pastoral existente. Se puede buscar por "id" o por "search_name".',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID del grupo si se conoce.' },
          search_name: { type: 'string', description: 'Nombre o fragmento del nombre del grupo para buscarlo.' },
          name: { type: 'string', description: 'Nuevo nombre del grupo.' },
          leader: { type: 'string', description: 'Nuevo coordinador o responsable.' },
          description: { type: 'string', description: 'Nueva descripción o misión.' },
          members: { type: 'string', description: 'Nuevos integrantes o conteo.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_group',
      description: 'Elimina un grupo pastoral de la comunidad. Se puede identificar por "id" o por "search_name".',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID del grupo a eliminar.' },
          search_name: { type: 'string', description: 'Nombre del grupo a eliminar si no se tiene el ID.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_person',
      description: 'Registra a una persona en el directorio de la comunidad pastoral.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nombre y apellido de la persona.' },
          role: { type: 'string', description: 'Rol pastoral (ej: "Catequista", "Profesor de Religión", "Acólito").' },
          group: { type: 'string', description: 'Grupo al que pertenece.' },
          contact: { type: 'string', description: 'Teléfono o correo electrónico.' },
          notes: { type: 'string', description: 'Observaciones pastorales.' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_person',
      description: 'Actualiza los datos o ficha de una persona de la comunidad. Se puede buscar por "id" o por "search_name".',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID de la persona si se conoce.' },
          search_name: { type: 'string', description: 'Nombre o apellido de la persona para buscarla.' },
          name: { type: 'string', description: 'Nuevo nombre completo.' },
          role: { type: 'string', description: 'Nuevo rol pastoral (ej: Catequista, Acólito).' },
          group: { type: 'string', description: 'Nuevo grupo al que pertenece.' },
          contact: { type: 'string', description: 'Nuevo teléfono o correo.' },
          notes: { type: 'string', description: 'Nuevas notas pastorales.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_person',
      description: 'Elimina a una persona del directorio de la comunidad. Se puede identificar por "id" o por "search_name".',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID de la persona a eliminar.' },
          search_name: { type: 'string', description: 'Nombre de la persona a eliminar si no se tiene el ID.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_song',
      description: 'Agrega un canto o himno al cancionero pastoral y litúrgico con acordes entre corchetes (ej: [Do] o [C]).',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Título del canto (ej: Pescador de Hombres).' },
          category: {
            type: 'string',
            description: 'Momento litúrgico o categoría (Entrada, Piedad, Gloria, Salmo, Aleluya, Ofertorio, Santo, Paz, Comunión, Salida, Mariano, Adoración, Juventud).'
          },
          key: { type: 'string', description: 'Tono musical base del canto (ej: C, D, G, Em, etc.).' },
          lyrics: { type: 'string', description: 'Letra completa con acordes intercalados en corchetes ej: [C] Tú has venido a la [G] orilla...' },
          author: { type: 'string', description: 'Autor o compositor del canto.' },
          tempo: { type: 'string', description: 'Tempo o carácter del canto (ej: Alegre, Meditativo, Marcha).' }
        },
        required: ['title', 'lyrics']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_liturgical_script',
      description: 'Genera y guarda un guión litúrgico completo para una celebración escolar, misa de curso, inicio de año o graduación.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Título de la celebración (ej: Misa de Inicio de Año Escolar 2026).' },
          type: { type: 'string', description: 'Tipo de celebración (ej: Inicio de Año, Primer Viernes, Graduación, Misa de Curso, Oración / Vigilia).' },
          date: { type: 'string', description: 'Fecha de la misa (YYYY-MM-DD).' },
          course: { type: 'string', description: 'Curso o comunidad escolar destinataria (ej: 4° Medio, Toda la Comunidad).' },
          celebrant: { type: 'string', description: 'Sacerdote celebrante o capellán.' },
          theme: { type: 'string', description: 'Lema o eje pastoral de la misa.' },
          entranceCommentary: { type: 'string', description: 'Monición de entrada para el monitor/lector.' },
          entranceSong: { type: 'string', description: 'Canto de entrada sugerido.' },
          penitentialAct: { type: 'string', description: 'Acto penitencial (fórmulas del Señor ten piedad).' },
          wordCommentary: { type: 'string', description: 'Monición a la liturgia de la Palabra.' },
          firstReading: { type: 'string', description: 'Cita bíblica y texto de la primera lectura.' },
          psalm: { type: 'string', description: 'Salmo responsorial con antífona y estrofas.' },
          gospel: { type: 'string', description: 'Cita bíblica y texto del Santo Evangelio.' },
          petitions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                intention: { type: 'string', description: 'Texto de la petición u oración universal.' },
                response: { type: 'string', description: 'Respuesta de la asamblea (ej: Te lo pedimos, Señor).' }
              },
              required: ['intention']
            },
            description: 'Lista de 4 a 6 peticiones de la oración de los fieles.'
          },
          offertoryCommentary: { type: 'string', description: 'Monición para la presentación de los dones y signos.' },
          offerings: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                item: { type: 'string', description: 'Signo u ofrenda (ej: Pan y Vino, Mochilas y Cuadernos, Cirio).' },
                meaning: { type: 'string', description: 'Significado espiritual y escolar de este signo.' }
              },
              required: ['item', 'meaning']
            },
            description: 'Lista de ofrendas escolares simbólicas con su significado.'
          },
          offertorySong: { type: 'string', description: 'Canto de ofertorio sugerido.' },
          communionCommentary: { type: 'string', description: 'Monición para el momento de la Comunión.' },
          communionSong: { type: 'string', description: 'Canto de comunión sugerido.' },
          thanksgivingPrayer: { type: 'string', description: 'Oración de acción de gracias o reflexión post-comunión.' },
          recessionalSong: { type: 'string', description: 'Canto final de salida y envío misionero.' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_song',
      description: 'Edita o corrige un canto existente en el cancionero pastoral (título, autor, categoría, tono o acordes).',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID del canto si se conoce.' },
          search_title: { type: 'string', description: 'Título o fragmento del canto a buscar si no se tiene el ID.' },
          title: { type: 'string', description: 'Nuevo título del canto.' },
          author: { type: 'string', description: 'Nuevo autor o compositor.' },
          category: { type: 'string', description: 'Momento litúrgico (Entrada, Piedad, Gloria, Salmo, Ofertorio, Santo, Paz, Comunión, Salida, Mariano, etc.).' },
          key: { type: 'string', description: 'Nuevo tono base (ej: C, D, G, Em).' },
          tempo: { type: 'string', description: 'Nuevo tempo (Alegre, Meditativo, Marcha, etc.).' },
          lyrics: { type: 'string', description: 'Nueva letra con acordes intercalados en corchetes ej: [Do] o [C].' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_song',
      description: 'Elimina un canto del cancionero pastoral. Se puede identificar por ID o título.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID del canto a eliminar.' },
          search_title: { type: 'string', description: 'Título del canto a eliminar.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_liturgical_script',
      description: 'Edita o actualiza un guión litúrgico existente (título, lecturas, ofrendas, oraciones o cantos).',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID del guión si se conoce.' },
          search_title: { type: 'string', description: 'Título o celebración a buscar si no se tiene el ID.' },
          title: { type: 'string', description: 'Nuevo título del guión.' },
          type: { type: 'string', description: 'Tipo de celebración (Misa Escolar, Primer Viernes, Graduación, etc.).' },
          date: { type: 'string', description: 'Fecha de la celebración (YYYY-MM-DD).' },
          course: { type: 'string', description: 'Curso o destinatarios.' },
          celebrant: { type: 'string', description: 'Sacerdote celebrante.' },
          theme: { type: 'string', description: 'Lema o eje pastoral.' },
          entranceCommentary: { type: 'string', description: 'Monición de entrada.' },
          entranceSong: { type: 'string', description: 'Canto de entrada.' },
          penitentialAct: { type: 'string', description: 'Acto penitencial.' },
          wordCommentary: { type: 'string', description: 'Monición a la palabra.' },
          firstReading: { type: 'string', description: 'Primera lectura.' },
          psalm: { type: 'string', description: 'Salmo responsorial.' },
          gospel: { type: 'string', description: 'Evangelio del día.' },
          offertoryCommentary: { type: 'string', description: 'Monición de ofrendas.' },
          offertorySong: { type: 'string', description: 'Canto de ofertorio.' },
          communionCommentary: { type: 'string', description: 'Monición de comunión.' },
          communionSong: { type: 'string', description: 'Canto de comunión.' },
          thanksgivingPrayer: { type: 'string', description: 'Acción de gracias.' },
          recessionalSong: { type: 'string', description: 'Canto de salida / envío.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_liturgical_script',
      description: 'Elimina un guión litúrgico guardado. Se puede identificar por ID o título.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID del guión a eliminar.' },
          search_title: { type: 'string', description: 'Título del guión a eliminar.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_daily_gospel_and_saint',
      description: 'Obtiene las lecturas bíblicas completas de la misa de hoy, el Santo Evangelio y la biografía del Santo del día.',
      parameters: {
        type: 'object',
        properties: {
          includeReadings: { type: 'boolean', description: 'true para incluir 1ra lectura, salmo y evangelio.' },
          includeSaint: { type: 'boolean', description: 'true para incluir la vida del Santo del día.' }
        }
      }
    }
  }
];

// Adaptador de Tools al formato oficial de Google Gemini (functionDeclarations)
const GEMINI_FUNCTION_DECLARATIONS = TOOLS_DEFINITIONS.map(t => ({
  name: t.function.name,
  description: t.function.description,
  parameters: t.function.parameters
}));

class CloudManager {
  constructor() {
    this.openRouterBaseUrl = 'https://openrouter.ai/api/v1';
    this.geminiBaseUrl = 'https://generativelanguage.googleapis.com/v1beta';
    this.defaultGeminiModel = 'gemini-3.8-flash';
    this.defaultOpenRouterModel = 'google/gemma-4-31b-it:free';
  }

  /**
   * Normaliza modelos de Gemini antiguos o no disponibles a la versión activa recomendada.
   */
  normalizeGeminiModel(model) {
    if (!model || typeof model !== 'string') return this.defaultGeminiModel;
    const clean = model.trim().replace(/^models\//, '');
    const deprecated = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-1.5-pro', 'gemini-flash-latest'];
    if (deprecated.includes(clean) || clean.includes('gemma') || clean.includes('nemotron') || clean.includes('llama') || clean.includes('2.5') || clean.includes('1.5') || clean.includes('2.0')) {
      return this.defaultGeminiModel;
    }
    return clean;
  }

  /**
   * Genera el prompt de sistema enriquecido con el carisma dominicano y contexto en tiempo real.
   */
  buildSystemPrompt(appContext = {}) {
    const {
      todayStr = new Date().toISOString().split('T')[0],
      liturgicalSeason = 'Tiempo Ordinario',
      liturgicalColor = 'Verde',
      upcomingFeast = '',
      verseOfTheDay = '',
      schoolName = 'Colegio Católico',
      pastorName = 'Agente Pastoral',
      stats = {},
      upcomingEvents = [],
      pendingTasks = [],
      notesList = [],
      eventsList = [],
      tasksList = [],
      groupsList = [],
      personsList = [],
      scriptsList = [],
      songsList = [],
      todayGospel = '',
      todaySaint = '',
      schoolTemplates = []
    } = appContext;

    return `Eres el Asistente Pastoral inteligente de "${schoolName}", diseñado para apoyar la labor evangelizadora, organizativa, litúrgica y espiritual de la comunidad educativa, con un carisma católico arraigado en la espiritualidad dominicana (Orden de Predicadores: Santo Domingo de Guzmán, Santo Tomás de Aquino, Santa Catalina de Siena, San Martín de Porres). Tu lema es "Veritas" (La Verdad) y "Contemplari et contemplata aliis tradere" (Contemplar y dar a los demás los frutos de lo contemplado).

REGLAS DE IDENTIDAD Y ESTILO:
1. Eres un ASISTENTE INTELIGENTE de software, NO una persona física humana. Nunca te hagas pasar por el usuario ni adoptes su nombre (${pastorName}).
2. Comunícate en español con un tono cálido, fraterno, respetuoso, pastoral, humilde y sumamente práctico y eficiente.
3. Utiliza Markdown enriquecido (negritas, listas ordenadas, viñetas, títulos claros, tablas y bloques cuando sea oportuno).
4. REGLA ESPECIAL DE ORACIONES: Si el usuario te solicita una oración, bendición, guion litúrgico, plegaria universal o reflexión espiritual, NUNCA respondas con preguntas ni pidas más detalles innecesarios. Escribe de inmediato el texto completo y hermoso de la oración, estructurado con invocación, peticiones y conclusión formal.
5. INTERPRETACIÓN DE IMÁGENES: Puedes ver y analizar imágenes adjuntas. Extrae el texto relevante, resume o conviértelo en notas estructuradas o eventos según se solicite.
6. GESTIÓN INTEGRAL DE DATOS (CREAR, EDITAR Y ELIMINAR CON TOOLS):
   Tienes acceso y autorización completa para CREAR (\`create_*\`), EDITAR/MODIFICAR (\`edit_*\`) y ELIMINAR (\`delete_*\`) notas, eventos, tareas, grupos, personas, cantos y guiones litúrgicos mediante las herramientas disponibles.
   - EVENTOS Y CALENDARIO PASTORAL:
     * Puedes registrar eventos con \`create_event\` incluyendo checklist de preparativos (\`checklist\`) y vinculación a un guión litúrgico (\`scriptId\`).
     * Puedes modificar fechas, horarios, lugar o checklist con \`edit_event\`.
     * Puedes marcar tareas del checklist de un evento como completadas o pendientes con \`toggle_event_checklist_item\`.
     * Puedes redactar convocatorias y circulares escolares con \`generate_event_announcement\` para "apoderados", "profesores" o "whatsapp".
   - CANCIONERO LITÚRGICO:
     * Puedes crear nuevos cantos con \`create_song\`, asegurando acordes cifrados entre corchetes (ej: [Do] o [C]).
     * Puedes editar letras, tonos o momentos de cantos existentes con \`edit_song\`.
     * Puedes eliminar cantos obsoletos o duplicados con \`delete_song\`.
   - GUIONES LITÚRGICOS ESCOLARES:
     * Puedes redactar y guardar guiones completos con moniciones, lecturas, peticiones y ofrendas escolares con \`create_liturgical_script\`.
     * Puedes actualizar guiones existentes con \`edit_liturgical_script\` o eliminarlos con \`delete_liturgical_script\`.
   - LECTURAS Y SANTORAL DEL DÍA:
     * Tienes acceso a las lecturas bíblicas y la biografía del Santo del día a través de \`get_daily_gospel_and_saint\`.
   - Modificaciones y Eliminaciones Generales:
     * Para identificar elementos, utiliza preferentemente el \`id\` (si está presente en el contexto) o el parámetro de búsqueda por nombre/título.
     * Si para crear un evento falta la fecha, debes preguntarla antes de invocar \`create_event\`.
     * Siempre confirma al usuario con amabilidad y claridad la acción realizada.

CONTEXTO ACTUAL DE LA APLICACIÓN:
- Fecha de hoy: ${todayStr}
- Tiempo litúrgico actual: ${liturgicalSeason} (Color litúrgico: ${liturgicalColor})
- Próxima fiesta o solemnidad: ${upcomingFeast || 'Ninguna registrada inmediatamente'}
- Versículo del día: "${verseOfTheDay}"
- Santo de hoy: ${todaySaint || 'Consultar con get_daily_gospel_and_saint'}
- Evangelio del día: ${todayGospel || 'Consultar con get_daily_gospel_and_saint'}
- Colegio: ${schoolName}
- Encargado: ${pastorName}
- Resumen estadístico:
  * Notas registradas: ${stats.notesCount || 0}
  * Eventos programados: ${stats.eventsCount || 0}
  * Tareas pendientes: ${stats.pendingTasksCount || 0}
  * Grupos comunitarios: ${stats.groupsCount || 0}
  * Directorio de personas: ${stats.personsCount || 0}
  * Cantos en el Cancionero: ${stats.songsCount || 0}
  * Guiones litúrgicos guardados: ${stats.scriptsCount || 0}

- PLANTILLAS ESCOLARES DISPONIBLES:
${schoolTemplates.length ? schoolTemplates.map(st => `  * ${st}`).join('\n') : '  * Misa Inicio de Año, Primer Viernes, Vía Crucis, Mes de María, Retiro de Curso, Graduación, Campaña Solidaria, Jornada Pastoral.'}

- EVENTOS EN CALENDARIO (con preparativos y guiones vinculados):
${eventsList.length ? eventsList.map(e => `  * [ID: ${e.id}] [${e.date}${e.time ? ' ' + e.time : ''}] "${e.title}" (${e.category}) en ${e.location || 'Sin lugar registrado'}${e.scriptId ? ' [Guión Vinculado: ' + e.scriptId + ']' : ''}${e.checklistSummary ? ' [' + e.checklistSummary + ']' : ''}`).join('\n') : '  * Ningún evento programado.'}

- GUIONES LITÚRGICOS REGISTRADOS:
${scriptsList.length ? scriptsList.map(s => `  * [ID: ${s.id}] "${s.title}" (${s.type || 'Misa Escolar'}) [Curso: ${s.course || 'Comunidad'}, Celebrante: ${s.celebrant || 'Por definir'}]`).join('\n') : '  * Ningún guión registrado.'}

- CANTOS EN EL CANCIONERO:
${songsList.length ? songsList.map(sg => `  * [ID: ${sg.id}] "${sg.title}" (${sg.category || 'General'}, Tono: ${sg.key || 'C'}${sg.author ? ', ' + sg.author : ''})`).join('\n') : '  * Cancionero sin cantos registrados.'}

- TAREAS PASTORALES:
${tasksList.length ? tasksList.map(t => `  * [ID: ${t.id}] [${t.done ? 'COMPLETADA' : 'PENDIENTE'}] [Prioridad: ${t.priority}] "${t.title}"${t.due ? ' (Vence: ' + t.due + ')' : ''}`).join('\n') : '  * Sin tareas registradas.'}

- NOTAS REGISTRADAS EN LA APP:
${notesList.length ? notesList.map(n => `  * [ID: ${n.id}] "${n.title}" (Etiquetas: ${(n.tags || []).join(', ') || 'sin etiquetas'})`).join('\n') : '  * Ninguna nota registrada.'}

- GRUPOS PASTORALES:
${groupsList.length ? groupsList.map(g => `  * [ID: ${g.id}] "${g.name}" (Coordinador: ${g.leader || 'Sin asignar'})`).join('\n') : '  * Ningún grupo registrado.'}

- DIRECTORIO DE PERSONAS:
${personsList.length ? personsList.map(p => `  * [ID: ${p.id}] "${p.name}" (Rol: ${p.role || 'Sin rol'}, Grupo: ${p.group || 'Sin grupo'})`).join('\n') : '  * Sin personas registradas.'}`;
  }

  /**
   * Prueba de conexión: soporta Google Gemini y OpenRouter.
   */
  async testConnection({ provider = 'openrouter', apiKey, model }) {
    if (provider === 'gemini') {
      const targetModel = this.normalizeGeminiModel(model);
      const url = `${this.geminiBaseUrl}/models/${targetModel}:generateContent?key=${apiKey}`;
      const payload = {
        contents: [
          { role: 'user', parts: [{ text: 'Di exactamente: "Conexión exitosa con Google Gemini"' }] }
        ]
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Error Gemini (${res.status}): ${this.extractErrorMessage(errText)}`);
      }

      const data = await res.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Conexión verificada con Gemini.';
      return { ok: true, reply };
    }

    // Proveedor OpenRouter / OpenAI
    const url = `${this.openRouterBaseUrl}/chat/completions`;
    const targetModel = model || this.defaultOpenRouterModel;
    const payload = {
      model: targetModel,
      messages: [{ role: 'user', content: 'Di "Conexión exitosa con OpenRouter" en una sola frase breve.' }],
      max_tokens: 30
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/pastoral-organizer',
        'X-Title': 'Organizador Pastoral Desktop'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Error OpenRouter (${res.status}): ${this.extractErrorMessage(errText)}`);
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || 'Conexión verificada.';
    return { ok: true, reply };
  }

  /**
   * Obtiene modelos disponibles según el proveedor configurado.
   */
  async getAvailableModels({ provider = 'openrouter', apiKey }) {
    if (provider === 'gemini') {
      const url = `${this.geminiBaseUrl}/models?key=${apiKey}`;
      const res = await fetch(url, {
        headers: { 'x-goog-api-key': apiKey }
      });
      if (!res.ok) {
        throw new Error(`Error al listar modelos Gemini (${res.status})`);
      }
      const data = await res.json();
      const models = Array.isArray(data.models) ? data.models : [];
      return models
        .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
        .map(m => {
          const id = m.name.replace(/^models\//, '');
          return {
            id,
            name: m.displayName || id,
            description: m.description || '',
            context_length: m.inputTokenLimit || 0
          };
        });
    }

    // OpenRouter
    const url = `${this.openRouterBaseUrl}/models`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (!res.ok) {
      throw new Error(`Error obteniendo modelos OpenRouter (${res.status})`);
    }
    const data = await res.json();
    const list = Array.isArray(data.data) ? data.data : [];
    return list.map(m => ({
      id: m.id,
      name: m.name || m.id,
      context_length: m.context_length || 0,
      description: m.description || ''
    }));
  }

  /**
   * Analiza una imagen usando visión artificial para crear una nota estructurada.
   */
  async analyzeImageForNote({ provider = 'openrouter', apiKey, model, imageDataUrl, instructions = '' }) {
    const promptText = `Analiza con cuidado la imagen adjunta (que puede ser un afiche, documento, apuntes de reunión, foto de pizarra, horario o lista pastoral).
Extrae la información relevante y genera una nota estructurada en formato JSON estricto con los siguientes campos:
{
  "title": "Título conciso y representativo",
  "body": "Contenido completo en Markdown, transcribiendo o resumiendo fielmente lo visto (fechas, acuerdos, nombres, detalles)",
  "tags": ["etiqueta1", "etiqueta2"]
}
${instructions ? `Instrucciones adicionales del usuario: ${instructions}` : ''}
Responde ÚNICAMENTE con el bloque JSON válido, sin explicaciones antes ni después.`;

    let rawContent = '';

    if (provider === 'gemini') {
      const targetModel = this.normalizeGeminiModel(model);
      const { mimeType, base64Data } = this.parseDataUrl(imageDataUrl);

      const url = `${this.geminiBaseUrl}/models/${targetModel}:generateContent?key=${apiKey}`;
      const payload = {
        contents: [
          {
            role: 'user',
            parts: [
              { text: promptText },
              { inlineData: { mimeType, data: base64Data } }
            ]
          }
        ]
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Error Gemini Vision (${res.status}): ${this.extractErrorMessage(errText)}`);
      }

      const data = await res.json();
      rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      // OpenRouter / OpenAI Vision
      const targetModel = model || this.defaultOpenRouterModel;
      const url = `${this.openRouterBaseUrl}/chat/completions`;
      const payload = {
        model: targetModel,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: promptText },
              { type: 'image_url', image_url: { url: imageDataUrl } }
            ]
          }
        ]
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://github.com/pastoral-organizer',
          'X-Title': 'Organizador Pastoral Desktop'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Error OpenRouter Vision (${res.status}): ${this.extractErrorMessage(errText)}`);
      }

      const data = await res.json();
      rawContent = data.choices?.[0]?.message?.content || '';
    }

    return this.parseNoteJson(rawContent);
  }

  /**
   * Genera texto directo sin herramientas ni streaming (útil para resúmenes o enriquecimiento hagiográfico).
   */
  async generateDirectText({ provider = 'gemini', apiKey, model, prompt }) {
    if (!apiKey) return '';
    try {
      if (provider === 'gemini') {
        const targetModel = this.normalizeGeminiModel(model);
        const url = `${this.geminiBaseUrl}/models/${targetModel}:generateContent?key=${apiKey}`;
        const payload = {
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }]
            }
          ]
        };
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify(payload)
        });
        if (!res.ok) return '';
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } else {
        const targetModel = model || this.defaultOpenRouterModel;
        const url = `${this.openRouterBaseUrl}/chat/completions`;
        const payload = {
          model: targetModel,
          messages: [{ role: 'user', content: prompt }]
        };
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://github.com/pastoral-organizer',
            'X-Title': 'Organizador Pastoral Desktop'
          },
          body: JSON.stringify(payload)
        });
        if (!res.ok) return '';
        const data = await res.json();
        return data.choices?.[0]?.message?.content || '';
      }
    } catch (e) {
      console.warn('[cloudManager] Error en generateDirectText:', e.message);
      return '';
    }
  }

  /**
   * Genera una respuesta de texto estructurada o chat directo sin herramientas ni streaming
   * (utilizado para oraciones de la mañana y reflexiones del día).
   */
  async generateChatResponse({ messages = [], cloudSettings = null, temperature = 0.7 }) {
    if (!cloudSettings || !cloudSettings.apiKey) return { content: '' };
    const prompt = (messages || []).map(m => m.content).join('\n\n');
    const content = await this.generateDirectText({
      provider: cloudSettings.provider || 'gemini',
      apiKey: cloudSettings.apiKey,
      model: cloudSettings.model || 'gemini-flash-latest',
      prompt
    });
    return { content };
  }

  /**
   * Ejecuta el chat interactivo con streaming SSE y bucle de Function Calling
   * según el proveedor (Google Gemini Oficial u OpenRouter).
   */
  async streamChat(options) {
    const { provider = 'openrouter' } = options;
    if (provider === 'gemini') {
      return this.streamChatGemini(options);
    }
    return this.streamChatOpenRouter(options);
  }

  /**
   * Implementación de streaming y function calling para Google Gemini Oficial.
   */
  async streamChatGemini({ apiKey, model, messages, appContext, signal, onChunk, onStatus, onToolExecute }) {
    if (!apiKey) throw new Error('No se ha configurado la Clave de API de Google AI Studio.');

    const targetModel = this.normalizeGeminiModel(model);
    const systemPrompt = this.buildSystemPrompt(appContext);
    const endpoint = `${this.geminiBaseUrl}/models/${targetModel}:streamGenerateContent?key=${apiKey}&alt=sse`;

    // Convertir historial a formato Gemini contents
    const contents = [];
    for (const msg of messages) {
      if (msg.role === 'system') continue;
      const role = msg.role === 'assistant' ? 'model' : 'user';
      const parts = [];

      if (typeof msg.content === 'string') {
        parts.push({ text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const item of msg.content) {
          if (item.type === 'text') parts.push({ text: item.text });
          if (item.type === 'image_url' && item.image_url?.url) {
            const { mimeType, base64Data } = this.parseDataUrl(item.image_url.url);
            parts.push({ inlineData: { mimeType, data: base64Data } });
          }
        }
      }

      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }

    const MAX_TOOL_STEPS = 6;
    let stepCount = 0;

    while (stepCount < MAX_TOOL_STEPS) {
      stepCount++;
      if (signal?.aborted) throw new Error('Operación cancelada por el usuario.');

      onStatus?.(stepCount === 1 ? 'Gemini está pensando...' : 'Gemini procesando acciones...');

      const payload = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        tools: [{ functionDeclarations: GEMINI_FUNCTION_DECLARATIONS }]
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(payload),
        signal
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Error de Google Gemini (${res.status}): ${this.extractErrorMessage(errText)}`);
      }

      // Procesar SSE stream de Gemini
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulatedText = '';
      const toolCalls = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const jsonStr = trimmed.slice(6);
          try {
            const parsed = JSON.parse(jsonStr);
            const candidate = parsed.candidates?.[0];
            const parts = candidate?.content?.parts;
            if (Array.isArray(parts)) {
              for (const p of parts) {
                if (p.text) {
                  accumulatedText += p.text;
                  onChunk?.(p.text);
                }
                if (p.functionCall) {
                  toolCalls.push(p.functionCall);
                }
              }
            }
          } catch (_) {}
        }
      }

      // Si no hubo llamadas a herramientas, la respuesta terminó
      if (toolCalls.length === 0) {
        return { role: 'assistant', content: accumulatedText };
      }

      // Hay tool calls: agregar respuesta del modelo
      contents.push({
        role: 'model',
        parts: toolCalls.map(tc => ({ functionCall: tc }))
      });

      // Ejecutar cada función y añadir la functionResponse
      for (const tc of toolCalls) {
        const fnName = tc.name;
        const fnArgs = tc.args || {};

        onStatus?.(`Ejecutando acción: ${this.formatToolActionName(fnName)}...`);

        let resultData = {};
        try {
          if (typeof onToolExecute === 'function') {
            const r = await onToolExecute(fnName, fnArgs);
            resultData = { result: typeof r === 'string' ? r : JSON.stringify(r) };
          } else {
            resultData = { result: `Acción ${fnName} completada.` };
          }
        } catch (e) {
          resultData = { error: e.message };
        }

        contents.push({
          role: 'function',
          parts: [{
            functionResponse: {
              name: fnName,
              response: resultData
            }
          }]
        });
      }
    }

    return { role: 'assistant', content: 'He completado las acciones solicitadas.' };
  }

  /**
   * Implementación de streaming y function calling para OpenRouter / OpenAI.
   */
  async streamChatOpenRouter({ apiKey, model, baseUrl, messages, appContext, signal, onChunk, onStatus, onToolExecute }) {
    if (!apiKey) throw new Error('No se ha configurado la Clave de API de OpenRouter.');

    const endpoint = (baseUrl || this.openRouterBaseUrl).replace(/\/$/, '') + '/chat/completions';
    const targetModel = model || this.defaultOpenRouterModel;
    const systemPrompt = this.buildSystemPrompt(appContext);
    const conversation = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    const MAX_TOOL_STEPS = 6;
    let stepCount = 0;

    while (stepCount < MAX_TOOL_STEPS) {
      stepCount++;
      if (signal?.aborted) throw new Error('Operación cancelada por el usuario.');

      onStatus?.(stepCount === 1 ? 'Pensando...' : 'Procesando resultado...');

      const payload = {
        model: targetModel,
        messages: conversation,
        tools: TOOLS_DEFINITIONS,
        tool_choice: 'auto',
        stream: true
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://github.com/pastoral-organizer',
          'X-Title': 'Organizador Pastoral Desktop'
        },
        body: JSON.stringify(payload),
        signal
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Error OpenRouter (${res.status}): ${this.extractErrorMessage(errText)}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulatedText = '';
      const toolCallsMap = new Map();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]' || !trimmed.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            const delta = parsed.choices?.[0]?.delta;
            if (!delta) continue;

            if (delta.content) {
              accumulatedText += delta.content;
              onChunk?.(delta.content);
            }

            if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!toolCallsMap.has(idx)) {
                  toolCallsMap.set(idx, {
                    id: tc.id || `call_${Date.now()}_${idx}`,
                    name: tc.function?.name || '',
                    arguments: ''
                  });
                }
                const existing = toolCallsMap.get(idx);
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.name += tc.function.name;
                if (tc.function?.arguments) existing.arguments += tc.function.arguments;
              }
            }
          } catch (_) {}
        }
      }

      if (toolCallsMap.size === 0) {
        return { role: 'assistant', content: accumulatedText };
      }

      const toolCallsArray = Array.from(toolCallsMap.values()).map(tc => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments }
      }));

      conversation.push({
        role: 'assistant',
        content: accumulatedText || null,
        tool_calls: toolCallsArray
      });

      for (const tc of toolCallsArray) {
        const fnName = tc.function.name;
        let fnArgs = {};
        try { fnArgs = JSON.parse(tc.function.arguments); } catch (e) { fnArgs = {}; }

        onStatus?.(`Ejecutando: ${this.formatToolActionName(fnName)}...`);

        let resultMessage = '';
        try {
          if (typeof onToolExecute === 'function') {
            const r = await onToolExecute(fnName, fnArgs);
            resultMessage = typeof r === 'string' ? r : JSON.stringify(r);
          } else {
            resultMessage = JSON.stringify({ success: true });
          }
        } catch (execErr) {
          resultMessage = JSON.stringify({ success: false, error: execErr.message });
        }

        conversation.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: fnName,
          content: resultMessage
        });
      }
    }

    return { role: 'assistant', content: 'Acciones finalizadas con éxito.' };
  }

  // Utilidades de apoyo
  parseDataUrl(dataUrl) {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return { mimeType: match[1], base64Data: match[2] };
    }
    return { mimeType: 'image/jpeg', base64Data: dataUrl };
  }

  parseNoteJson(rawContent) {
    let cleaned = rawContent.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    try {
      const parsed = JSON.parse(cleaned);
      return {
        title: parsed.title || 'Nota desde imagen',
        body: parsed.body || rawContent,
        tags: Array.isArray(parsed.tags) ? parsed.tags : ['Desde imagen']
      };
    } catch (_) {
      return {
        title: 'Nota desde imagen',
        body: rawContent,
        tags: ['Desde imagen']
      };
    }
  }

  extractErrorMessage(errText) {
    try {
      const parsed = JSON.parse(errText);
      if (parsed.error && parsed.error.message) return parsed.error.message;
      if (parsed.message) return parsed.message;
    } catch (_) {}
    return errText ? errText.slice(0, 160) : 'Error desconocido';
  }

  formatToolActionName(name) {
    const map = {
      create_note: 'Crear nota pastoral',
      edit_note: 'Modificar nota pastoral',
      delete_note: 'Eliminar nota pastoral',
      create_event: 'Registrar evento en calendario',
      edit_event: 'Modificar evento del calendario',
      delete_event: 'Eliminar evento del calendario',
      create_task: 'Crear tarea',
      edit_task: 'Actualizar tarea',
      delete_task: 'Eliminar tarea',
      create_group: 'Registrar grupo comunitario',
      edit_group: 'Modificar grupo comunitario',
      delete_group: 'Eliminar grupo comunitario',
      create_person: 'Añadir persona al directorio',
      edit_person: 'Actualizar ficha de persona',
      delete_person: 'Eliminar persona del directorio',
      create_song: 'Añadir canto al cancionero',
      create_liturgical_script: 'Crear guión litúrgico'
    };
    return map[name] || name;
  }
}

module.exports = new CloudManager();
