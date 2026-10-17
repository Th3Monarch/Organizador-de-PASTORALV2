/**
 * reading-manager.js
 * Módulo para obtener las Lecturas y el Evangelio del Día (Evangelizo / Misal Romano)
 * y generar la Oración de la Mañana adaptada a la comunidad escolar.
 * 
 * Autor: Manuel Guia
 */

const https = require('https');
const http = require('http');

// Tabla de entidades HTML para decodificación limpia
const HTML_ENTITIES_MAP = {
  'iquest': '¿', 'iexcl': '¡',
  'aacute': 'á', 'eacute': 'é', 'iacute': 'í', 'oacute': 'ó', 'uacute': 'ú',
  'Aacute': 'Á', 'Eacute': 'É', 'Iacute': 'Í', 'Oacute': 'Ó', 'Uacute': 'Ú',
  'ntilde': 'ñ', 'Ntilde': 'Ñ',
  'uuml': 'ü', 'Uuml': 'Ü',
  'laquo': '«', 'raquo': '»',
  'ldquo': '“', 'rdquo': '”',
  'lsquo': '‘', 'rsquo': '’',
  'ndash': '–', 'mdash': '—',
  'hellip': '…', 'bull': '•', 'middot': '·',
  'quot': '"', 'apos': "'",
  'lt': '<', 'gt': '>',
  'nbsp': ' ',
  'ordm': 'º', 'orda': 'ª',
  'amp': '&'
};

function decodeHtmlEntities(str) {
  if (!str) return '';
  let s = String(str);
  s = s.replace(/&#([0-9]{1,7});/g, (_, code) => {
    try { return String.fromCharCode(parseInt(code, 10)); } catch (_) { return ''; }
  });
  s = s.replace(/&#x([0-9a-fA-F]{1,6});/g, (_, hex) => {
    try { return String.fromCharCode(parseInt(hex, 16)); } catch (_) { return ''; }
  });
  s = s.replace(/&([a-zA-Z]+);/g, (match, entity) => {
    return HTML_ENTITIES_MAP[entity] !== undefined ? HTML_ENTITIES_MAP[entity] : match;
  });
  return s.replace(/&iquest;?/gi, '¿')
          .replace(/&iexcl;?/gi, '¡')
          .replace(/&nbsp;?/gi, ' ')
          .replace(/&laquo;?/gi, '«')
          .replace(/&raquo;?/gi, '»')
          .replace(/&amp;/gi, '&');
}

function stripPromotionalFooters(text) {
  if (!text) return '';
  return text
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

function cleanHtmlToText(html) {
  if (!html) return '';
  const decoded = decodeHtmlEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<\/(p|div|tr|h[1-6])>/gi, '\n\n')
      .replace(/<\/td>/gi, ' ')
      .replace(/<[^>]+>/g, '')
  )
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n\n');

  return stripPromotionalFooters(decoded);
}

// Respaldo de Evangelios y oraciones escolares para cuando no hay internet
const OFFLINE_GOSPEL_BACKUPS = [
  {
    title: 'Evangelio según San Mateo 5, 1-12 (Las Bienaventuranzas)',
    text: 'Al ver a la multitud, Jesús subió a la montaña, se sentó, y sus discípulos se acercaron a él. Entonces tomó la palabra y comenzó a enseñarles, diciendo:\n«Felices los que tienen alma de pobres, porque a ellos les pertenece el Reino de los Cielos.\nFelices los pacientes, porque recibirán la tierra en herencia.\nFelices los que tienen hambre y sed de justicia, porque serán saciados.\nFelices los misericordiosos, porque obtendrán misericordia.\nFelices los limpios de corazón, porque verán a Dios.\nFelices los que trabajan por la paz, porque serán llamados hijos de Dios.\nAlégrense y regocíjense, porque ustedes tendrán una gran recompensa en el cielo».',
    shortText: 'Felices los limpios de corazón, porque verán a Dios. Felices los que trabajan por la paz, porque serán llamados hijos de Dios.'
  },
  {
    title: 'Evangelio según San Juan 15, 9-17 (Permanezcan en mi amor)',
    text: 'Como el Padre me amó, también yo los he amado a ustedes. Permanezcan en mi amor.\nSi cumplen mis mandamientos, permanecerán en mi amor, como yo he cumplido los mandamientos de mi Padre y permanezco en su amor.\nLes he dicho esto para que mi gozo sea el de ustedes, y ese gozo sea perfecto.\nEste es mi mandamiento: Ámense los unos a los otros, como yo los he amado.\nNo hay amor más grande que dar la vida por los amigos. Ustedes son mis amigos si hacen lo que yo les mando.',
    shortText: 'Este es mi mandamiento: Ámense los unos a los otros, como yo los he amado. No hay amor más grande que dar la vida por los amigos.'
  },
  {
    title: 'Evangelio según San Lucas 10, 25-37 (El Buen Samaritano)',
    text: 'Un doctor de la Ley se levantó y le preguntó para ponerlo a prueba: «Maestro, ¿qué debo hacer para heredar la vida eterna?». Jesús le dijo: «¿Qué está escrito en la Ley? ¿Cómo lees?». Él respondió: «Amarás al Señor tu Dios con todo tu corazón, con toda tu alma, con todas tus fuerzas y con toda tu mente; y a tu prójimo como a ti mismo».\nJesús le dijo: «Has respondido exactamente; haz esto y vivirás». Pero él, queriendo justificar su pregunta, dijo a Jesús: «¿Y quién es mi prójimo?». Jesús le narró la parábola del buen samaritano y concluyó: «Ve y haz tú lo mismo».',
    shortText: 'Amarás al Señor tu Dios con todo tu corazón y a tu prójimo como a ti mismo. Ve y haz tú lo mismo.'
  },
  {
    title: 'Evangelio según San Mateo 25, 31-40 (Tuve hambre y me diste de comer)',
    text: '«Porque tuve hambre, y ustedes me dieron de comer; tuve sed, y me dieron de beber; fui forastero, y me recibieron; estaba desnudo, y me vistieron; enfermo, y me visitaron; en la cárcel, y vinieron a verme».\nEntonces los justos le responderán: «Señor, ¿cuándo te vimos con hambre, y te dimos de comer; o con sed, y te dimos de beber?».\nY el Rey les responderá: «Les aseguro que cada vez que lo hicieron con el más pequeño de mis hermanos, lo hicieron conmigo».',
    shortText: 'Les aseguro que cada vez que lo hicieron con el más pequeño de mis hermanos, lo hicieron conmigo.'
  }
];

/**
 * Consulta un endpoint de Evangelizo con timeout de 8 segundos
 */
async function fetchEvangelizoText(params) {
  const url = `https://feed.evangelizo.org/v2/reader.php?${params}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.includes('Error : wrong param') || text.includes('<title>Reader Evangelizo</title>')) {
      return null;
    }
    return text.trim();
  } catch (_) {
    clearTimeout(timeoutId);
    return null;
  }
}

/**
 * Obtiene las lecturas y el Evangelio del día con caché de 24 horas
 */
async function getDailyReadings({ targetDate = new Date(), force = false, currentCache = null } = {}) {
  const y = targetDate.getFullYear();
  const m = String(targetDate.getMonth() + 1).padStart(2, '0');
  const d = String(targetDate.getDate()).padStart(2, '0');
  const dateKey = `${y}-${m}-${d}`;
  const dateStr = `${y}${m}${d}`;
  const now = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  // Validación de caché de 24 horas
  if (!force && currentCache && currentCache.dateKey === dateKey && currentCache.gospel?.text) {
    const age = now - (currentCache.timestamp || 0);
    if (age >= 0 && age < ONE_DAY_MS) {
      return { readings: currentCache, cached: true };
    }
  }

  console.log(`[ReadingManager] Obteniendo lecturas y Evangelio para ${dateKey}...`);

  let liturgicTitle = null;
  let gospelTitle = null;
  let gospelText = null;
  let firstReadingTitle = null;
  let firstReadingText = null;
  let psalmTitle = null;
  let psalmText = null;

  try {
    // 1. Título litúrgico
    const rawLit = await fetchEvangelizoText(`date=${dateStr}&lang=SP&type=liturgic_t`);
    if (rawLit) liturgicTitle = cleanHtmlToText(rawLit);

    // 2. Evangelio
    const [rawGspLt, rawGsp] = await Promise.all([
      fetchEvangelizoText(`date=${dateStr}&lang=SP&type=reading_lt&content=GSP`),
      fetchEvangelizoText(`date=${dateStr}&lang=SP&type=reading&content=GSP`)
    ]);

    if (rawGspLt) gospelTitle = cleanHtmlToText(rawGspLt);
    if (rawGsp) gospelText = cleanHtmlToText(rawGsp);

    // 3. Primera lectura y Salmo
    const [rawFrLt, rawFr, rawPsLt, rawPs] = await Promise.all([
      fetchEvangelizoText(`date=${dateStr}&lang=SP&type=reading_lt&content=FR`),
      fetchEvangelizoText(`date=${dateStr}&lang=SP&type=reading&content=FR`),
      fetchEvangelizoText(`date=${dateStr}&lang=SP&type=reading_lt&content=PS`),
      fetchEvangelizoText(`date=${dateStr}&lang=SP&type=reading&content=PS`)
    ]);

    if (rawFrLt) firstReadingTitle = cleanHtmlToText(rawFrLt);
    if (rawFr) firstReadingText = cleanHtmlToText(rawFr);
    if (rawPsLt) psalmTitle = cleanHtmlToText(rawPsLt);
    if (rawPs) psalmText = cleanHtmlToText(rawPs);

  } catch (err) {
    console.warn('[ReadingManager] Error consultando servicio litúrgico:', err);
  }

  // Si falló la conexión al Evangelio, usar respaldo offline
  if (!gospelText) {
    const dayIndex = targetDate.getDate() % OFFLINE_GOSPEL_BACKUPS.length;
    const backup = OFFLINE_GOSPEL_BACKUPS[dayIndex];
    gospelTitle = backup.title;
    gospelText = backup.text;
  }

  // Extraer versículo o frase clave corta del Evangelio
  let shortText = '';
  if (gospelText) {
    const sentences = gospelText.split(/[.\n]+/).map(s => s.trim()).filter(s => s.length > 25);
    shortText = sentences[0] || gospelText.slice(0, 160) + '...';
    if (!shortText.endsWith('.')) shortText += '.';
  }

  const readings = {
    dateKey,
    timestamp: now,
    liturgicTitle: liturgicTitle || 'Tiempo Ordinario de la Iglesia',
    gospel: {
      title: gospelTitle || 'Evangelio del Día',
      text: gospelText,
      shortText
    },
    firstReading: {
      title: firstReadingTitle || 'Primera Lectura',
      text: firstReadingText || ''
    },
    psalm: {
      title: psalmTitle || 'Salmo Responsorial',
      text: psalmText || ''
    }
  };

  return { readings, cached: false };
}

/**
 * Plantillas pastorales offline de oración matutina escolar
 */
function getOfflineMorningPrayer({ audience, gospel, schoolName, pastorName }) {
  const colegios = schoolName || 'nuestro colegio';
  const gTitle = gospel?.title || 'la Palabra de Dios';
  const gVerse = gospel?.shortText || '';

  if (audience === 'infantil') {
    return {
      title: `Oración de la Mañana con Jesús (${gTitle})`,
      signOfCross: 'En el nombre del Padre, y del Hijo y del Espíritu Santo. Amén.',
      gospelEcho: `Jesús hoy nos dice con alegría en el Evangelio: «${gVerse}»`,
      reflection: `Buenos días, Señor Jesús. Hoy empezamos un nuevo día en ${colegios}. Te damos gracias por nuestros amigos, por los profesores que nos enseñan y por nuestra familia que nos cuida con amor. Ayúdanos a compartir los útiles, a jugar sin pelear y a sonreír a quien esté triste.`,
      petitions: [
        'Por los niños enfermos o que están pasando momentos difíciles, para que Jesús los abrace y consuele.',
        'Por nuestro colegio, para que sea siempre un lugar de amistad, estudio y alegría.'
      ],
      closing: 'Padre Nuestro que estás en el cielo... Sagrado Corazón de Jesús, en Ti confío. Amén.',
      source: 'Plantilla Pastoral Escolar - Nivel Infantil/Básica'
    };
  }

  if (audience === 'docentes') {
    return {
      title: `Oración Docente y Vocacional ante el Evangelio (${gTitle})`,
      signOfCross: 'En el nombre del Padre, y del Hijo y del Espíritu Santo. Amén.',
      gospelEcho: `La Palabra de hoy nos interpela: «${gVerse}»`,
      reflection: `Señor Jesús, Maestro de maestros: al comenzar esta jornada educativa en ${colegios}, ponemos en tus manos nuestras palabras, nuestra paciencia y nuestra mirada pedagógica. Danos sabiduría para descubrir en cada estudiante un hijo amado de Dios, y haz que nuestro testimonio transmita esperanza, verdad y cercanía evangélica.`,
      petitions: [
        'Por nuestra comunidad educativa: directivos, docentes, asistentes y familias, para trabajar en armonía y fraternidad.',
        'Por los estudiantes que enfrentan problemas familiares, soledad o dificultades académicas, para ser instrumentos de tu paz.'
      ],
      closing: 'Santa María, Reina de los Educadores y Madre nuestra, ruega por nosotros. Amén.',
      source: 'Plantilla Pastoral Escolar - Docentes y Educadores'
    };
  }

  if (audience === 'familias') {
    return {
      title: `Oración para la Familia y el Hogar (${gTitle})`,
      signOfCross: 'En el nombre del Padre, y del Hijo y del Espíritu Santo. Amén.',
      gospelEcho: `Escuchamos en el Evangelio de hoy: «${gVerse}»`,
      reflection: `Buen Dios, bendice nuestro hogar y la comunidad de ${colegios}. Te entregamos las alegrías y las preocupaciones de nuestras familias. Que en nuestras casas reine el diálogo, el perdón sincero y el agradecimiento por el pan de cada día y por la educación de nuestros hijos.`,
      petitions: [
        'Por la salud y el trabajo en cada familia de nuestro colegio.',
        'Por los jóvenes y niños, para que crezcan en valores, fe y solidaridad.'
      ],
      closing: 'San José y la Sagrada Familia de Nazaret, custodien nuestros hogares. Amén.',
      source: 'Plantilla Pastoral Escolar - Familias y Apoderados'
    };
  }

  // Juvenil / Media (por defecto)
  return {
    title: `Oración Juvenil de la Mañana: ${gTitle}`,
    signOfCross: 'En el nombre del Padre, y del Hijo y del Espíritu Santo. Amén.',
    gospelEcho: `Mensaje de Cristo hoy: «${gVerse}»`,
    reflection: `Señor Jesús, te entregamos este nuevo día en ${colegios}. En medio del estudio, las evaluaciones y la rutina, queremos detenernos un momento y poner nuestro corazón en Ti. Enséñanos a no ser indiferentes ante las necesidades de nuestros compañeros, a defender la verdad con valentía y a descubrir nuestra vocación como jóvenes que construyen un mundo más justo y fraterno.`,
    petitions: [
      'Por nuestros compañeros de curso, especialmente por quienes están desanimados o enfrentan desafíos personales.',
      'Por la paz en el mundo, por los jóvenes sin oportunidades y por nuestra Iglesia.'
    ],
    closing: 'Gloria al Padre, y al Hijo, y al Espíritu Santo. Como era en el principio, ahora y siempre, por los siglos de los siglos. Amén.',
    source: 'Plantilla Pastoral Escolar - Jóvenes y Enseñanza Media'
  };
}

/**
 * Genera una oración de la mañana escolar utilizando IA (Gemini/OpenRouter) o plantillas
 */
async function generateMorningPrayer({ audience = 'juvenil', gospel, schoolName = 'Colegio Católico', pastorName = 'Agente Pastoral', cloudSettings = null, cloudManager = null } = {}) {
  // Si hay IA configurada, generar dinámicamente con el Evangelio de hoy
  if (cloudSettings && cloudSettings.apiKey && cloudManager && gospel && gospel.text) {
    try {
      const prompt = `Eres un asesor pastoral de excelencia en un colegio católico.
Redacta una "Oración de la Mañana" escolar breve (duración de lectura de 1 a 2 minutos máximo) para iniciar las clases hoy.

Datos de contexto:
- Colegio: "${schoolName}"
- Destinatarios / Audiencia: "${audience.toUpperCase()}" (adapta el lenguaje y pedagogía: infantil = sencillo y tierno; juvenil = desafiante y profundo; docentes = vocacional y pedagógico; familias = unión y gratitud).
- Evangelio del día: "${gospel.title}"
- Texto del Evangelio: "${gospel.text.slice(0, 1000)}"

Estructura requerida (responde exclusivamente en formato JSON válido sin markdown adicional):
{
  "title": "Título sugerente de la oración",
  "signOfCross": "En el nombre del Padre...",
  "gospelEcho": "Frase breve o versículo clave del Evangelio adaptado a la jornada escolar",
  "reflection": "Meditación y reflexión pastoral de 1 o 2 párrafos que conecte el Evangelio con la vida en el colegio",
  "petitions": ["Petición 1 para la comunidad", "Petición 2 por los estudiantes o el mundo"],
  "closing": "Invocación final y Amén",
  "source": "Generada con IA Asistente Pastoral"
}`;

      let rawContent = '';
      if (typeof cloudManager.generateDirectText === 'function') {
        rawContent = await cloudManager.generateDirectText({
          provider: cloudSettings.provider || 'gemini',
          apiKey: cloudSettings.apiKey,
          model: cloudSettings.model || 'gemini-flash-latest',
          prompt
        });
      } else if (typeof cloudManager.generateChatResponse === 'function') {
        const aiResponse = await cloudManager.generateChatResponse({
          messages: [{ role: 'user', content: prompt }],
          cloudSettings,
          temperature: 0.7
        });
        rawContent = aiResponse?.content || '';
      }

      if (rawContent) {
        // Extraer bloque JSON
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.title && parsed.reflection) {
            return parsed;
          }
        }
      }
    } catch (err) {
      console.warn('[ReadingManager] Error generando oración con IA, usando plantilla:', err);
    }
  }

  // Respaldo inmediato mediante plantillas pastorales escolares
  return getOfflineMorningPrayer({ audience, gospel, schoolName, pastorName });
}

module.exports = {
  getDailyReadings,
  generateMorningPrayer,
  decodeHtmlEntities
};
