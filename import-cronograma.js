/**
 * import-cronograma.js - Importador directo del Cronograma de Actividades (I Momento Pedagógico 2026-2027)
 * Colegio Nuestra Señora de Fátima
 */
const fs = require('fs');
const path = require('path');

// Obtener ruta de pastoral-data.json según el sistema operativo
let userDataPath = '';
if (process.platform === 'win32') {
  userDataPath = path.join(process.env.APPDATA || '', 'organizador-pastoral');
} else if (process.platform === 'darwin') {
  userDataPath = path.join(process.env.HOME || '', 'Library', 'Application Support', 'organizador-pastoral');
} else {
  userDataPath = path.join(process.env.HOME || '', '.config', 'organizador-pastoral');
}

const dataFile = path.join(userDataPath, 'pastoral-data.json');

if (!fs.existsSync(dataFile)) {
  console.error('No se encontró el archivo de base de datos en:', dataFile);
  console.log('Abre la aplicación al menos una vez para inicializarla.');
  process.exit(1);
}

const current = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

const eventsToImport = [
  // Septiembre 2026
  { title: 'Inicio del Año Escolar - Incorporación del Personal y Consejo Técnico', date: '2026-09-14', category: 'Reunión', location: 'Plantel', description: 'Incorporación personal docente, administrativo y obrero. Inscripciones y Consejo Técnico.' },
  { title: 'I Consejo General de Docentes', date: '2026-09-15', category: 'Reunión', location: 'Plantel', description: 'Responsable: Sor Senaida Molina.' },
  { title: 'Inicio del Año Escolar Primaria y Media General (Bienvenida)', date: '2026-09-16', category: 'Otro', location: 'Plantel', description: 'Bienvenida a los estudiantes y entrega de horarios académicos.' },
  { title: 'Presentación Propuesta Pastoral: Actuar con la Mente, Cuidar la Mente', date: '2026-09-17', category: 'Formación', location: 'Plantel', description: 'Presentación de propuesta pastoral y encuentro con el personal administrativo.' },
  { title: 'Reunión de Mini Comunidades de Padres (Inicial y Primaria)', date: '2026-09-18', category: 'Reunión', location: 'Plantel', description: 'Elección de vocero de curso para Educación Inicial y Primaria.' },
  { title: 'Inicio de Actividades Diagnósticas y Proyecto de Aprendizaje', date: '2026-09-21', category: 'Otro', location: 'Aulas', description: 'Aplicación de evaluaciones diagnósticas en todos los niveles hasta el 29 de sep.' },
  { title: 'Reunión de Mini Comunidades de Padres (Media General)', date: '2026-09-22', category: 'Reunión', location: 'Plantel', description: 'Elección de vocero de curso para Media General (22 al 24 de sep).' },
  { title: 'Carnetización Educación Inicial y Primaria', date: '2026-09-28', category: 'Otro', location: 'Plantel', description: 'Jornada de carnetización escolar.' },
  { title: 'Misa con Primaria e Inicial', date: '2026-09-30', time: '08:30', category: 'Misa', location: 'Cancha / Capilla', description: 'Responsables: Prof. Yelivan y Prof. Fabiola.' },
  { title: 'Formación para todo el Personal del Plantel (Sin actividades académicas)', date: '2026-09-30', category: 'Formación', location: 'Plantel', description: 'Entrega de evaluación diagnóstica, celebración día de la secretaria y cumpleaños.' },

  // Octubre 2026
  { title: 'Misa con Media General', date: '2026-10-01', time: '08:30', category: 'Misa', location: 'Cancha / Capilla', description: 'Responsables: Prof. Rosa Zaa y Prof. Yanitza. Acto cívico día de la no violencia.' },
  { title: 'Formación Plan Congregacional (Sin actividades académicas)', date: '2026-10-02', category: 'Formación', location: 'Plantel', description: 'Fecha límite de carga de planificación y proyectos en plataforma SAE.' },
  { title: 'Mes de las Misiones: Inicial trabaja la Biblia en los Buenos Días', date: '2026-10-05', category: 'Formación', location: 'Aulas', description: 'Reunión con voceros estudiantiles.' },
  { title: 'Celebración Eucarística Nuestra Señora del Rosario', date: '2026-10-07', category: 'Misa', location: 'Cancha', description: 'En acción de gracias por el nuevo año escolar. Todos en la cancha.' },
  { title: 'Consejo Técnico y Propuestas Vocería Estudiantil', date: '2026-10-08', category: 'Reunión', location: 'Plantel', description: '3er grado trabaja a Santa Teresita del Niño Jesús.' },
  { title: 'Día de la Resistencia Indígena', date: '2026-10-12', category: 'Otro', location: '', description: 'Feriado nacional.' },
  { title: 'Animación Misionera del DOMUND', date: '2026-10-14', category: 'Campaña', location: 'Plantel', description: 'Animación misionera para toda la comunidad educativa.' },
  { title: 'Adoración al Santísimo por grados en la Capilla', date: '2026-10-15', category: 'Otro', location: 'Capilla', description: 'Cada docente es responsable de su grupo.' },
  { title: 'Misa con Media General y Llegada de la Virgen del Rosario', date: '2026-10-16', time: '08:30', category: 'Misa', location: 'Plantel', description: 'Censo comunidades de participantes de Antorcha.' },
  { title: 'Jornada de un Millón de Niños Rezando el Rosario', date: '2026-10-19', category: 'Campaña', location: 'Plantel', description: '4to año trabaja Los Santos Dominicos.' },
  { title: 'Elecciones del Centro de Estudiantes y Despedida de la Virgen', date: '2026-10-20', category: 'Otro', location: 'Plantel', description: 'Despedida de la Virgen del Rosario con Media General.' },
  { title: 'Debate Mariano (5to y 6to grado con Colegio Sagrado Corazón)', date: '2026-10-21', category: 'Formación', location: 'Plantel', description: 'Responsables: Docentes de grado y Prof. Franklin. Conteo de votos de estudiantes dominicos.' },
  { title: 'Misa con Media General', date: '2026-10-22', time: '08:30', category: 'Misa', location: 'Plantel', description: 'Responsable: Prof. Astrid. Obra de teatro Carta de Jamaica (Prof. Yajaira).' },
  { title: 'Grupos Misioneros', date: '2026-10-23', category: 'Reunión', location: 'Plantel', description: 'Responsables: Sor Blanca y Prof. María Herminia.' },
  { title: 'Debate Bíblico Media General con Colegio Santa Rosa de Lima', date: '2026-10-26', category: 'Formación', location: 'Plantel', description: 'Charlas de misión MJD y juramentación del Centro de Estudiantes Dominicos.' },
  { title: 'Jornada de Formación Docente (Sin actividades académicas)', date: '2026-10-27', category: 'Formación', location: 'Plantel', description: 'Formación para el personal docente.' },
  { title: 'Adoración al Santísimo y Charlas de Misión con la PJ', date: '2026-10-28', category: 'Otro', location: 'Capilla', description: 'Charlas de misión pastoral juvenil y adoración.' },
  { title: 'Colecta DOMUND ($1 por ropa particular)', date: '2026-10-29', category: 'Campaña', location: 'Plantel', description: 'Actividad para colectar fondos DOMUND. Muestra de baile grupo de danza.' },

  // Noviembre 2026
  { title: 'Misa de Fieles Difuntos con Primaria e Inicial', date: '2026-11-02', time: '08:30', category: 'Misa', location: 'Cancha / Capilla', description: 'Responsables: Prof. Yainireth y Prof. Neida.' },
  { title: 'Eucaristía de Todos los Santos y San Martín de Porres', date: '2026-11-03', category: 'Misa', location: 'Cancha', description: 'Bendición de altares por espacio. Todos en la cancha.' },
  { title: 'Adoración al Santísimo (Oración por las familias)', date: '2026-11-04', category: 'Otro', location: 'Capilla', description: 'Adoración por grados en la capilla.' },
  { title: 'Actividad Dominicana SANTOS DOMINICOS (Dominican Way)', date: '2026-11-05', category: 'Formación', location: 'Plantel', description: 'Celebración y vivencia de la espiritualidad dominicana.' },
  { title: 'Presentación del Proyecto Pastoral de Navidad', date: '2026-11-06', category: 'Reunión', location: 'Plantel', description: 'Muestra de baile grupo de danza Primaria (Prof. Yajaira y Rafael).' },
  { title: 'Consejo Técnico', date: '2026-11-09', category: 'Reunión', location: 'Plantel', description: 'Semana del abrazo en familia y preparación de actividades Madre Georgina.' },
  { title: 'Oración con Jesús Sacramentado - Nacimiento Madre Georgina', date: '2026-11-16', time: '07:00', category: 'Otro', location: 'Capilla / Patio', description: 'Celebración comunitaria y torta de Madre Georgina.' },
  { title: 'Eucaristía Acción de Gracias Madre Georgina (Primaria e Inicial)', date: '2026-11-17', category: 'Misa', location: 'Cancha', description: 'Acción de gracias por la vida y carisma de Madre Georgina.' },
  { title: 'Eucaristía Día de la Chinita (Media General)', date: '2026-11-18', category: 'Misa', location: 'Cancha', description: 'Encargados: 1er año, Prof. Francis Mezones y Prof. Peggy. Día de la alimentación.' },
  { title: 'Gaitazo y Cierre del Mes del Abrazo en Familia', date: '2026-11-20', category: 'Convivencia', location: 'Cancha', description: 'Resp. Prof. Yajaira Mujica y picnic familiar con Prof. Franklin.' },
  { title: 'Apertura de Adviento por aulas y Ambientación Navideña', date: '2026-11-23', category: 'Otro', location: 'Aulas', description: 'Elaboración de coronas de adviento e inicio de proyecto navideño.' },
  { title: 'Retiro Espiritual del Personal (Día 1)', date: '2026-11-27', category: 'Retiro', location: 'Plantel', description: 'Retiro anual del personal en las instalaciones del colegio.' },
  { title: 'Retiro Espiritual del Personal (Día 2)', date: '2026-11-28', category: 'Retiro', location: 'Plantel', description: 'Continuación del retiro anual del personal.' },

  // Diciembre 2026
  { title: 'Inicio de Novena de Aguinaldos y Compartir', date: '2026-12-01', category: 'Misa', location: 'Capilla / Cancha', description: 'Novena por grupos con padres invitados. Chocolate y torta al terminar (Inicia 5to año).' },
  { title: 'Consejo Técnico y Ajustes de Calificaciones', date: '2026-12-07', category: 'Reunión', location: 'Plantel', description: 'Revisión y ajustes de notas del I Momento.' },
  { title: 'Eucaristía Inmaculada Concepción de María', date: '2026-12-08', category: 'Misa', location: 'Cancha', description: 'Responsables: 4to y 5to año.' },
  { title: 'Adoración al Santísimo Primaria', date: '2026-12-09', category: 'Otro', location: 'Capilla', description: 'Adoración de Adviento con los niños de primaria.' },
  { title: 'Adoración al Santísimo Media General y Parrandón Navideño', date: '2026-12-10', category: 'Convivencia', location: 'Plantel', description: 'Adoración eucarística y parrandón navideño con bachillerato.' },
  { title: 'Adviento: Rezo de la Corona con Padres', date: '2026-12-11', category: 'Otro', location: 'Aulas', description: 'Oración antes de la entrega formal de boletas.' },
  { title: 'Jornada de Formación para todo el Personal', date: '2026-12-14', category: 'Formación', location: 'Plantel', description: 'Cierre formativo del I Momento Pedagógico.' },
  { title: 'Celebración de Navidad para todo el Personal', date: '2026-12-16', category: 'Convivencia', location: 'Plantel', description: 'Almuerzo y compartir fraterno navideño.' }
];

if (!Array.isArray(current.events)) current.events = [];

let added = 0;
for (const ev of eventsToImport) {
  const exists = current.events.some(e => e.date === ev.date && e.title.toLowerCase().trim() === ev.title.toLowerCase().trim());
  if (!exists) {
    current.events.push({
      id: 'ev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      title: ev.title,
      date: ev.date,
      time: ev.time || '',
      location: ev.location || '',
      category: ev.category || 'Otro',
      repeat: 'none',
      repeatUntil: '',
      description: ev.description || '',
      attendees: '',
      scriptId: null,
      checklist: []
    });
    added++;
  }
}

fs.writeFileSync(dataFile, JSON.stringify(current, null, 2), 'utf8');
console.log('--- RESULTADO ---');
console.log('✅ Eventos nuevos incorporados:', added);
console.log('📅 Total de eventos en el calendario:', current.events.length);
