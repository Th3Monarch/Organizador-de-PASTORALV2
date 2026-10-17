/**
 * saint-manager.js
 * Módulo para obtener el Santo del Día y su historia (Estilo ePrex / Liturgia de las Horas).
 * 
 * Características:
 * 1. Conexión directa a fuentes litúrgicas en español (Evangelizo / Martirologio Romano).
 * 2. Diccionario de respaldo offline completo con espiritualidad católica y dominicana.
 * 3. Enriquecimiento opcional mediante IA (Gemini / OpenRouter) si se desea.
 * 4. Caché de 24 horas: no vuelve a consultar si no han pasado las 24h o no ha cambiado el día.
 * 
 * Autor: Manuel Guia
 */

const https = require('https');
const http = require('http');

// Diccionario offline con santos destacados y reseñas históricas profundas
const OFFLINE_SAINTS = {
  // Octubre
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
  // Noviembre
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
  // Santos Dominicanos y de devoción
  '01-28': {
    name: 'Santo Tomás de Aquino',
    title: 'Presbítero y Doctor de la Iglesia (O.P.)',
    martirology: 'Memoria de santo Tomás de Aquino, fraile dominico, el "Doctor Angélico", cuya sabiduría teológica y filosófica ilumina permanentemente el magisterio de la Iglesia.',
    history: 'Nacido en Roccasecca (Italia), vistió el hábito dominico contra la voluntad familiar. Estudió bajo San Alberto Magno y enseñó en las mayores universidades de Europa. Escribió la colosal "Summa Theologiae" y hermosísimos himnos eucarísticos ("Pange Lingua", "Adoro Te Devote"). Ante el crucifijo en Nápoles, Cristo le dijo: "Bien has escrito de mí, Tomás; ¿qué deseas a cambio?". A lo que él respondió: "Nada más que a Ti, Señor".',
    quote: 'La gracia no destruye la naturaleza, sino que la perfecciona.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/St-thomas-aquinas.jpg/330px-St-thomas-aquinas.jpg'
  },
  '04-29': {
    name: 'Santa Catalina de Siena',
    title: 'Virgen y Doctora de la Iglesia, Patrona de Europa (O.P.)',
    martirology: 'Fiesta de santa Catalina de Siena, terciaria dominica, virgen y doctora de la Iglesia, incansable defensora de la paz, la verdad y la reforma de la Iglesia.',
    history: 'Desde temprana edad consagró su virginidad a Cristo e ingresó a las Hermanas de la Penitencia de Santo Domingo (Mantellate). Cuidó a los apestados de la peste negra, reconcilió familias enemistadas y con humilde audacia evangélica instó al Papa Gregorio XI a regresar de Aviñón a Roma. Su "Diálogo de la Divina Providencia" es cumbre de la espiritualidad.',
    quote: '¡Si son lo que deben ser, prenderán fuego al mundo entero!',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Saint_Catherine_of_Siena_by_Baldassare_Franceschini.jpg/330px-Saint_Catherine_of_Siena_by_Baldassare_Franceschini.jpg'
  },
  '08-08': {
    name: 'Santo Domingo de Guzmán',
    title: 'Fundador de la Orden de Predicadores (O.P.)',
    martirology: 'Solemnidad de santo Domingo de Guzmán, presbítero, que fundó la Orden de Predicadores para la defensa de la verdad y la proclamación de la Palabra de Dios mediante el estudio, la oración y la pobreza.',
    history: 'Nacido en Caleruega (España), Domingo fue conmovido por la ignorancia religiosa y las herejías de su tiempo. Fundó frailes que viviesen en pobreza apostólica, consagrados al estudio contemplativo y a la predicación itinerante: "Contemplar y dar a los demás de lo contemplado". Hombre de oración constante, sólo hablaba con Dios o de Dios.',
    quote: 'Hablar con Dios o de Dios.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Saint_Dominic_by_Fra_Angelico.jpg/330px-Saint_Dominic_by_Fra_Angelico.jpg'
  },
  '08-23': {
    name: 'Santa Rosa de Lima',
    title: 'Virgen (O.P.), Patrona de América y las Filipinas',
    martirology: 'Fiesta de santa Rosa de Lima (Isabel Flores de Oliva), primera flor de santidad de América Latina, terciaria dominica consagrada a la penitencia y la caridad fraterna.',
    history: 'Nacida en Lima, se consagró a Cristo imitando a Santa Catalina de Siena. En el huerto de su casa construyó una pequeña ermita para la oración solitaria y el trabajo manual, a la vez que atendía con amor desbordante a los enfermos, indígenas y esclavos de la ciudad.',
    quote: 'Aparte de la cruz no hay otra escala por la que podamos subir al cielo.',
    imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Angelino_Medoro_-_Santa_Rosa_de_Lima.jpg/330px-Angelino_Medoro_-_Santa_Rosa_de_Lima.jpg'
  }
};

/**
 * Descarga una imagen de forma segura y la convierte en Data URL Base64.
 * Esto garantiza:
 * 1. Funcionamiento 100% offline tras la descarga inicial diaria.
 * 2. Inmunidad a bloqueos HTTP 429 de Wikimedia por hotlinking directo desde Chromium.
 * 3. Compatibilidad total sin restricciones de CORS ni CSP en Electron.
 */
function downloadImageAsDataUrl(imageUrl, redirectCount = 0) {
  return new Promise((resolve) => {
    if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('http') || redirectCount > 4) {
      return resolve(null);
    }
    const client = imageUrl.startsWith('https:') ? https : http;
    const req = client.get(imageUrl, {
      headers: {
        'User-Agent': 'OrganizadorPastoral/2.0 (contact: pastoral-app@colegio.edu; Catholic school pastoral assistant)',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      },
      timeout: 10000
    }, (res) => {
      // Seguir redirecciones HTTP (301, 302, 307, 308)
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        let newUrl = res.headers.location;
        if (newUrl.startsWith('/')) {
          try {
            const parsed = new URL(imageUrl);
            newUrl = `${parsed.protocol}//${parsed.host}${newUrl}`;
          } catch (_) {}
        }
        res.resume();
        return downloadImageAsDataUrl(newUrl, redirectCount + 1).then(resolve);
      }

      if (res.statusCode !== 200) {
        res.resume();
        return resolve(null);
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks);
          if (buffer.length < 50) return resolve(null);
          const contentType = res.headers['content-type'] || 'image/jpeg';
          const dataUrl = `data:${contentType};base64,${buffer.toString('base64')}`;
          resolve(dataUrl);
        } catch (_) {
          resolve(null);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });

    req.on('error', () => {
      resolve(null);
    });
  });
}

/**
 * Consulta la API de Wikipedia / Wikimedia Commons para obtener imagen de arte sacro del santo
 */
async function fetchSaintImage(saintName) {
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
      const url = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'OrganizadorPastoral/2.0 (contact: pastoral-app@colegio.edu; Catholic school pastoral assistant)' }
      });
      if (res.ok) {
        const data = await res.json();
        const img = data.thumbnail?.source || data.originalimage?.source;
        if (img) return img;
      }
    } catch (_) {}
  }
  return null;
}

/**
 * Tabla completa de entidades HTML nombradas frecuentes en textos en español
 */
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
  'copy': '©', 'reg': '®', 'deg': '°',
  'cent': '¢', 'pound': '£', 'euro': '€',
  'times': '×', 'divide': '÷',
  'amp': '&'
};

/**
 * Decodifica rigurosamente entidades HTML decimales, hexadecimales y nombradas (&iquest;, &aacute;, etc.)
 */
function decodeHtmlEntities(str) {
  if (!str) return '';
  let s = String(str);

  // 1. Entidades numéricas decimales (&#191;) y hexadecimales (&#xbf;)
  s = s.replace(/&#([0-9]{1,7});/g, (_, code) => {
    try { return String.fromCharCode(parseInt(code, 10)); } catch (_) { return ''; }
  });
  s = s.replace(/&#x([0-9a-fA-F]{1,6});/g, (_, hex) => {
    try { return String.fromCharCode(parseInt(hex, 16)); } catch (_) { return ''; }
  });

  // 2. Entidades nombradas (&iquest;, &ntilde;, etc.)
  s = s.replace(/&([a-zA-Z]+);/g, (match, entity) => {
    return HTML_ENTITIES_MAP[entity] !== undefined ? HTML_ENTITIES_MAP[entity] : match;
  });

  // 3. Limpieza de entidades pegadas o mal formadas
  s = s.replace(/&iquest;?/gi, '¿')
       .replace(/&iexcl;?/gi, '¡')
       .replace(/&nbsp;?/gi, ' ')
       .replace(/&laquo;?/gi, '«')
       .replace(/&raquo;?/gi, '»')
       .replace(/&amp;/gi, '&');

  return s;
}

/**
 * Limpia el HTML a texto con saltos de párrafo preservados y entidades decodificadas
 */
function cleanHtmlToParagraphs(html) {
  if (!html) return '';
  return decodeHtmlEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<\/(p|div|tr|h[1-6])>/gi, '\n\n')
      .replace(/<\/td>/gi, ' ')
      .replace(/<[^>]+>/g, '')
  )
    .split('\n')
    .map(line => decodeHtmlEntities(line.trim()))
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Abreviador inteligente para convertir extensas hagiografías antiguas en una
 * reseña pastoral clara, inspiradora y concisa de 2 o 3 párrafos (estilo ePrex).
 */
function abbreviateHistory(paragraphs, saintName = '') {
  if (!paragraphs || paragraphs.length === 0) return '';

  const cleaned = paragraphs
    .map(p => decodeHtmlEntities(p).trim())
    .filter(p => {
      const lower = p.toLowerCase();
      // Omitir referencias a fuentes y derechos
      if (lower.startsWith('fuente:') || lower.includes('©') || lower.includes('evangelizo.org') || lower.includes('vidas de los santos')) return false;
      // Omitir debates de crítica textual moderna y manuscritos
      if (lower.includes('vossiana') || lower.includes('curetoniana') || lower.includes('arzobispo ussher') || lower.includes('ediciones críticas')) return false;
      if (lower.includes('no es este lugar para discutir') || lower.includes('disputa está prácticamente terminada')) return false;
      // Omitir líneas de diálogo teatral cortas ("Trajano: ...", "Ignacio: ...")
      if (/^[A-ZÁÉÍÓÚÑa-záéíóúñ]+:\s+/.test(p) && p.length < 180) return false;
      return p.length > 30;
    });

  if (cleaned.length === 0) return '';

  // Seleccionar los 2 o 3 párrafos narrativos más importantes (aprox. 700-900 caracteres)
  const selected = [];
  let currentLen = 0;
  const MAX_TOTAL_CHARS = 900;

  for (const p of cleaned) {
    const cleanP = p.replace(/^[A-ZÁÉÍÓÚÑa-záéíóúñ]+:\s+/, '').trim();
    if (cleanP) {
      selected.push(cleanP);
      currentLen += cleanP.length;
      if (selected.length >= 3 || currentLen >= MAX_TOTAL_CHARS) break;
    }
  }

  let result = selected.join('\n\n');

  if (result.length > 1000) {
    const cutoff = result.lastIndexOf('.', 950);
    if (cutoff > 400) {
      result = result.slice(0, cutoff + 1);
    }
  }

  return decodeHtmlEntities(result);
}

/**
 * Consulta el santoral de hoy en Evangelizo
 */
async function fetchFromEvangelizo(targetDate = new Date()) {
  const y = targetDate.getFullYear();
  const m = String(targetDate.getMonth() + 1).padStart(2, '0');
  const d = String(targetDate.getDate()).padStart(2, '0');
  const dateStr = `${y}${m}${d}`;

  const listUrl = `https://feed.evangelizo.org/v2/reader.php?date=${dateStr}&lang=SP&type=saint`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

  try {
    const res = await fetch(listUrl, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const listHtml = await res.text();

    // Buscar primer enlace al santo principal
    const match = listHtml.match(/<a\s+href="([^"]+display_saint\.php[^"]*id=([^"&]+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!match) return null;

    const rawUrl = match[1].replace(/&amp;/g, '&');
    const fullUrl = rawUrl.startsWith('http') ? rawUrl : `https://feed.evangelizo.org${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
    const rawSaintName = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, '').trim());

    // Obtener la página de detalle
    const detailRes = await fetch(fullUrl, { signal: controller.signal });
    if (!detailRes.ok) throw new Error(`Detail HTTP error ${detailRes.status}`);
    const detailHtml = await detailRes.text();

    clearTimeout(timeoutId);

    // Extraer texto
    const cleanedText = cleanHtmlToParagraphs(detailHtml);
    const paragraphs = cleanedText.split('\n\n').filter(p => {
      const lower = p.toLowerCase();
      return !lower.includes('evangelizo') &&
             !lower.includes('vidas de los santos') &&
             !lower.includes('todos los derechos') &&
             p.length > 5;
    });

    if (paragraphs.length === 0) return null;

    // Detectar título y subtítulo
    const saintName = decodeHtmlEntities(rawSaintName || paragraphs[0]);
    let title = 'Santo del Día';
    let martirology = '';
    let history = '';

    // En las páginas de Evangelizo:
    // Párrafo 1 o 2 suele ser el nombre o el rango ("obispo y mártir")
    // Luego viene la "Memoria de san..." (martirologio)
    // Luego la biografía histórica completa
    const martirologyIndex = paragraphs.findIndex(p => p.startsWith('Memoria') || p.startsWith('Fiesta') || p.startsWith('Solemnidad') || p.startsWith('Conmemoración'));

    if (martirologyIndex !== -1) {
      martirology = decodeHtmlEntities(paragraphs[martirologyIndex]);
      if (martirologyIndex > 0) {
        title = decodeHtmlEntities(paragraphs[martirologyIndex - 1].replace(saintName, '').replace(/,/g, '').trim()) || title;
      }
      history = abbreviateHistory(paragraphs.slice(martirologyIndex + 1), saintName);
    } else {
      martirology = decodeHtmlEntities(paragraphs[0]);
      history = abbreviateHistory(paragraphs.slice(1), saintName);
    }

    if (!history) {
      history = martirology;
    }

    // Extraer imagen si la página de Evangelizo contiene una
    const imgMatch = detailHtml.match(/<img[^>]+src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp))["']/i);
    let imageUrl = imgMatch ? imgMatch[1] : null;

    if (!imageUrl) {
      imageUrl = await fetchSaintImage(saintName);
    }

    return {
      name: saintName,
      title: title || 'Santo de la Iglesia Católica',
      martirology: martirology || '',
      history: history || martirology,
      imageUrl: imageUrl || null,
      source: 'evangelizo'
    };
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn('[SaintManager] Error consultando Evangelizo online:', err.message);
    return null;
  }
}

/**
 * Obtiene el santo del diccionario offline o genera una ficha litúrgica digna
 */
function getOfflineSaint(targetDate = new Date()) {
  const m = String(targetDate.getMonth() + 1).padStart(2, '0');
  const d = String(targetDate.getDate()).padStart(2, '0');
  const key = `${m}-${d}`;

  if (OFFLINE_SAINTS[key]) {
    return {
      ...OFFLINE_SAINTS[key],
      source: 'offline'
    };
  }

  // Si no está en el diccionario específico, generar una entrada hagiográfica bella según la fecha
  const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const dateFormatted = `${targetDate.getDate()} de ${monthNames[targetDate.getMonth()]}`;

  return {
    name: `Santoral del ${dateFormatted}`,
    title: 'Testigos del Evangelio',
    martirology: `Conmemoración de los santos, beatos y justos que en este día de ${dateFormatted} rindieron testimonio de fidelidad a Jesucristo en el mundo entero.`,
    history: `A lo largo de los siglos, innumerables hombres y mujeres han encarnado el Evangelio en sus familias, escuelas, monasterios y ciudades. La Iglesia celebra en este día a todos los santos y mártires anónimos que, perseverando en la caridad fraterna y la oración constante, fueron sembradores de esperanza y verdad para las futuras generaciones.`,
    quote: 'Sean santos, porque Yo, el Señor su Dios, soy santo. (Levítico 19, 2)',
    source: 'offline'
  };
}

/**
 * Genera o enriquece la reseña histórica con la IA configurada (Gemini u OpenRouter)
 * si el usuario tiene API Key y lo solicita o como refuerzo devocional.
 */
async function enrichWithAi({ name, targetDate, cloudSettings, cloudManager }) {
  if (!cloudSettings || !cloudSettings.apiKey || !cloudManager) return null;

  const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const dateStr = `${targetDate.getDate()} de ${monthNames[targetDate.getMonth()]}`;

  const prompt = `Actúa como hagiógrafo católico para la aplicación litúrgica pastoral.
Escribe una reseña devocional e histórica del Santo del Día para hoy (${name || 'Santo principal de la fecha'}, fecha: ${dateStr}) al estilo de la app ePrex / Liturgia de las Horas.
Debe ser fiel a la tradición católica y al Martirologio Romano.

Devuelve EXCLUSIVAMENTE un objeto JSON válido con esta estructura:
{
  "name": "Nombre oficial del santo o santa",
  "title": "Epíteto o título canónico (ej: Obispo y Mártir, Virgen y Doctora, etc.)",
  "martirology": "Breve párrafo oficial al estilo del Martirologio Romano",
  "history": "Reseña histórica biográfica profunda de 2 a 3 párrafos, narrando su vida, ministerio, virtudes y legado pastoral",
  "quote": "Frase célebre o enseñanza espiritual representativa"
}`;

  try {
    const rawResponse = await cloudManager.generateDirectText({
      provider: cloudSettings.provider || 'gemini',
      apiKey: cloudSettings.apiKey,
      model: cloudSettings.model || 'gemini-flash-latest',
      prompt
    });

    if (!rawResponse) return null;
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.name && parsed.history) {
      return {
        ...parsed,
        source: 'ai'
      };
    }
  } catch (e) {
    console.warn('[SaintManager] No se pudo enriquecer con IA:', e.message);
  }
  return null;
}

/**
 * Obtiene el Santo del Día y su historia, aplicando la lógica de caché de 24 horas.
 * 
 * @param {Object} options
 * @param {boolean} options.force - Si es true, ignora la caché y re-consulta.
 * @param {Object} options.currentCache - El objeto saintOfTheDay actualmente en memoria/disco.
 * @param {Object} options.cloudSettings - Configuración de IA (si existe).
 * @param {Object} options.cloudManager - Instancia de cloudManager.
 * @returns {Promise<{saint: Object, cached: boolean}>}
 */
async function getSaintOfTheDay({ force = false, currentCache = null, cloudSettings = null, cloudManager = null, targetDate = new Date() } = {}) {
  const y = targetDate.getFullYear();
  const m = String(targetDate.getMonth() + 1).padStart(2, '0');
  const d = String(targetDate.getDate()).padStart(2, '0');
  const todayKey = `${y}-${m}-${d}`;
  const monthDayKey = `${m}-${d}`;
  const now = Date.now();

  // Si la caché actual en disco carece de imagen base64, contiene entidades sin interpretar (como &iquest;)
  // o es una hagiografía antigua kilométrica (> 1800 caracteres), forzar su actualización abreviada
  const needsRefresh = currentCache && (
    (currentCache.imageUrl === undefined) ||
    (currentCache.imageUrl && currentCache.imageUrl.startsWith('http')) ||
    (currentCache.history && (currentCache.history.includes('&iquest;') || currentCache.history.includes('&laquo;') || currentCache.history.length > 1800)) ||
    (currentCache.martirology && currentCache.martirology.includes('&iquest;'))
  );

  // Verificar si la caché de 24 horas es válida
  if (!force && !needsRefresh && currentCache && currentCache.dateKey === todayKey && currentCache.history) {
    const ageMs = now - (currentCache.timestamp || 0);
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    if (ageMs >= 0 && ageMs < ONE_DAY_MS) {
      // Caché fresca y limpia dentro de las 24 horas
      return { saint: currentCache, cached: true };
    }
  }

  console.log(`[SaintManager] Obteniendo santo del día abreviado para ${todayKey}...`);

  let saintData = null;

  // 1. Si la fecha está en nuestro santoral curado offline, usarlo preferentemente porque está perfectamente abreviado y revisado
  if (OFFLINE_SAINTS[monthDayKey]) {
    saintData = getOfflineSaint(targetDate);
  }

  // 2. Si no está en el santoral curado, consultar Evangelizo online y abreviar
  if (!saintData) {
    saintData = await fetchFromEvangelizo(targetDate);
  }

  // 3. Si falló, usar respaldo general offline
  if (!saintData || !saintData.history) {
    saintData = getOfflineSaint(targetDate);
  }

  // 4. Si la reseña es corta y hay IA configurada, enriquecer con IA
  if (saintData && saintData.history.length < 150 && cloudSettings && cloudSettings.apiKey && cloudManager) {
    const aiEnriched = await enrichWithAi({
      name: saintData.name,
      targetDate,
      cloudSettings,
      cloudManager
    });
    if (aiEnriched) {
      saintData = { ...saintData, ...aiEnriched };
    }
  }

  // 5. Asegurar imagen del santo mediante Wikipedia / Wikimedia Commons si no la tiene
  if (!saintData.imageUrl) {
    saintData.imageUrl = await fetchSaintImage(saintData.name);
  }

  // 6. Descargar y convertir la imagen a Data URL Base64 para guardarla offline y evitar bloqueos de red en el navegador
  if (saintData.imageUrl && saintData.imageUrl.startsWith('http')) {
    const dataUrl = await downloadImageAsDataUrl(saintData.imageUrl);
    if (dataUrl) {
      saintData.imageUrl = dataUrl;
    }
  }

  // Decodificación y limpieza exhaustiva de entidades en todos los campos
  saintData.name = decodeHtmlEntities(saintData.name);
  saintData.title = decodeHtmlEntities(saintData.title);
  saintData.martirology = decodeHtmlEntities(saintData.martirology);
  saintData.history = decodeHtmlEntities(saintData.history);
  if (saintData.quote) saintData.quote = decodeHtmlEntities(saintData.quote);

  // Agregar metadatos de caché de 24 horas
  const finalSaint = {
    ...saintData,
    dateKey: todayKey,
    timestamp: now
  };

  return { saint: finalSaint, cached: false };
}

module.exports = {
  getSaintOfTheDay,
  fetchFromEvangelizo,
  getOfflineSaint,
  OFFLINE_SAINTS
};
