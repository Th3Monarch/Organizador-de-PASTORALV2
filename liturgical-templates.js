/**
 * liturgical-templates.js
 * Plantillas litúrgicas predefinidas para celebraciones escolares católicas.
 * 
 * Autor: Manuel Guia
 */

const DEFAULT_LITURGICAL_TEMPLATES = [
  {
    id: 'template-inicio-ano',
    title: 'Misa de Inicio del Año Escolar',
    type: 'Misa Escolar',
    theme: 'Caminar juntos bajo la guía del Señor, cultivando sabiduría, fraternidad y fe.',
    initialRites: {
      entranceCommentary: 'Querida comunidad educativa: Nos reunimos hoy con inmensa alegría y esperanza para poner en las manos de Dios este nuevo año escolar. Iniciamos un tiempo de aprendizaje, crecimiento humano y fraternidad. Que el Señor bendiga a nuestros estudiantes, docentes, asistentes y familias para ser luz en medio de nuestro colegio.',
      entranceSong: 'Vienen con Alegría',
      penitentialAct: 'Señor Jesús, Tú que nos llamas a ser constructores de paz y fraternidad: Señor, ten piedad.\nCristo, Tú que nos invitas a buscar la verdad y la sabiduría: Cristo, ten piedad.\nSeñor Jesús, Tú que perdonas nuestras faltas y renuevas nuestro corazón: Señor, ten piedad.'
    },
    wordLiturgy: {
      wordCommentary: 'La Palabra de Dios es la brújula que orienta nuestra vida escolar. Escuchemos con atención abierta para que el mensaje del Evangelio guíe cada una de nuestras acciones este año.',
      firstReading: 'Lectura de la Carta de San Pablo a los Colosenses (3, 12-17): «Como elegidos de Dios, vístanse de profunda compasión, benevolencia, humildad, dulzura y paciencia... Y todo lo que hagan o digan, háganlo siempre en el nombre del Señor Jesús».',
      psalm: 'Salmo 22: «El Señor es mi pastor, nada me puede faltar».',
      gospel: 'Evangelio según San Mateo (5, 13-16): «Ustedes son la sal de la tierra... Ustedes son la luz del mundo. No se puede ocultar una ciudad situada en la cima de un monte».',
      homilyNotes: 'Resaltar la vocación escolar: cada sala de clases como un hogar de fe y respeto; brillar con las buenas obras.'
    },
    petitions: [
      { intention: 'Por la Santa Iglesia y por el Papa, para que sigan guiando al pueblo de Dios con amor y valentía evangélica.', response: 'Te lo pedimos, Señor.' },
      { intention: 'Por nuestro colegio, equipo directivo, profesores y asistentes: para que el Espíritu Santo nos colme de paciencia, vocación y sabiduría en la enseñanza.', response: 'Te lo pedimos, Señor.' },
      { intention: 'Por todos los estudiantes, especialmente quienes ingresan por primera vez a nuestro colegio: para que encuentren un ambiente acogedor, amigos leales y entusiasmo por aprender.', response: 'Te lo pedimos, Señor.' },
      { intention: 'Por las familias de nuestra comunidad escolar: para que en sus hogares reine el diálogo, la paz, la salud y el trabajo digno.', response: 'Te lo pedimos, Señor.' },
      { intention: 'Por los miembros de nuestra comunidad que sufren enfermedad o duelo: para que sientan la caricia consoladora de Cristo.', response: 'Te lo pedimos, Señor.' }
    ],
    offertory: {
      offertoryCommentary: 'Junto al pan y al vino, presentamos los signos que representan el esfuerzo, el estudio y los anhelos de nuestra comunidad escolar para este nuevo año.',
      offerings: [
        { item: 'Pan y Vino', meaning: 'Fruto de la tierra y del trabajo del hombre, que por la acción del Espíritu Santo se transformarán en el Cuerpo y la Sangre de Jesús, alimento de nuestra alma.' },
        { item: 'Libros y Cuadernos', meaning: 'Símbolo del esfuerzo intelectual, las horas de clase y el deseo sincero de cultivar el don de la inteligencia que Dios nos ha regalado.' },
        { item: 'Cirio Encendido', meaning: 'La luz de Cristo que ilumina nuestras aulas, alejando la oscuridad del egoísmo y guiando nuestra convivencia escolar.' },
        { item: 'Plantita o Flores', meaning: 'La vida que florece en la juventud de nuestros estudiantes y nuestro compromiso con el cuidado de la Creación de Dios.' }
      ],
      offertorySong: 'Saber que Vendrás'
    },
    communion: {
      communionCommentary: 'Jesús se nos entrega como Pan de Vida para darnos fuerza en el camino. Nos acercamos con reverencia, fe y agradecimiento a la Santa Comunión.',
      communionSong: 'Pescador de Hombres'
    },
    concludingRites: {
      thanksgivingPrayer: 'Señor Jesús, te damos gracias por este encuentro eucarístico con el que abrimos el año escolar. Te pedimos que permanezcas con nosotros en cada clase, en cada recreo y en cada desafío. Que María, nuestra Madre, nos cuide con su manto y nos enseñe a amar como Tú nos amaste. Amén.',
      recessionalSong: 'Santa María del Camino'
    }
  },
  {
    id: 'template-primer-viernes',
    title: 'Misa de Primer Viernes (Sagrado Corazón de Jesús)',
    type: 'Primer Viernes',
    theme: 'Acudir a la fuente del Corazón de Jesús para renovar el amor, la misericordia y la reparación.',
    initialRites: {
      entranceCommentary: 'Celebramos la devoción del Primer Viernes de mes, contemplando el Corazón abierto de Cristo que late con misericordia infinita por cada uno de nosotros. Venimos a presentarle nuestras fatigas y a recibir su descanso.',
      entranceSong: 'Juntos como Hermanos',
      penitentialAct: 'Señor Jesús, manso y humilde de corazón: Señor, ten piedad.\nCristo, fuente inagotable de perdón y compasión: Cristo, ten piedad.\nSeñor Jesús, que entregaste tu vida en la Cruz por amor: Señor, ten piedad.'
    },
    wordLiturgy: {
      wordCommentary: 'En su Palabra, el Señor nos revela el amor entrañable de Dios que busca a la oveja perdida y sana los corazones heridos.',
      firstReading: 'Lectura del libro del profeta Ezequiel (34, 11-16): «Yo mismo apacentaré a mis ovejas y yo las llevaré a descansar... Buscaré a la que estaba perdida, recogeré a la descarriada, vendaré a la herida y fortaleceré a la enferma».',
      psalm: 'Salmo 102: «El Señor es compasivo y misericordioso».',
      gospel: 'Evangelio según San Mateo (11, 28-30): «Vengan a mí todos los que están afligidos y agobiados, y yo los aliviaré. Tomen mi yugo y aprendan de mí, que soy manso y humilde de corazón».',
      homilyNotes: 'Aprender del Corazón de Cristo: no responder con violencia, tener compasión del compañero vulnerable.'
    },
    petitions: [
      { intention: 'Por la Iglesia, para que sea siempre el hospital de campaña donde todos encuentren el consuelo de Dios.', response: 'Sagrado Corazón de Jesús, en Ti confiamos.' },
      { intention: 'Por los gobernantes y líderes sociales, para que tengan un corazón sensible ante los pobres, los ancianos y los marginados.', response: 'Sagrado Corazón de Jesús, en Ti confiamos.' },
      { intention: 'Por nuestros estudiantes, para que crezcan con corazones generosos, libres de rencor y prontos a ayudar al prójimo.', response: 'Sagrado Corazón de Jesús, en Ti confiamos.' },
      { intention: 'Por los enfermos y afligidos de nuestras familias, para que encuentren salud y paz en el Corazón de Jesús.', response: 'Sagrado Corazón de Jesús, en Ti confiamos.' }
    ],
    offertory: {
      offertoryCommentary: 'Ofrecemos a Dios el pan, el vino y nuestro corazón humano con el deseo de que Jesús lo transforme en un corazón semejante al Suyo.',
      offerings: [
        { item: 'Pan y Vino', meaning: 'Cuerpo y Sangre de Cristo, alimento de vida eterna.' },
        { item: 'Corazón simbólico / Cartas de oración', meaning: 'Las oraciones, intenciones y peticiones escritas por los estudiantes durante la semana.' }
      ],
      offertorySong: 'Esto que te Doy'
    },
    communion: {
      communionCommentary: 'Cristo en la Eucaristía nos une íntimamente a su Corazón. Recibámoslo con reverencia y fe viva.',
      communionSong: 'Nadie te Ama como Yo'
    },
    concludingRites: {
      thanksgivingPrayer: '¡Oh Sagrado Corazón de Jesús! Te consagramos nuestra vida, nuestras familias y nuestro colegio. Haz que nuestros corazones latan al ritmo del Tuyo, viviendo en caridad, perdón y servicio constante. Amén.',
      recessionalSong: 'Id y Enseñad (Sois la Semilla)'
    }
  },
  {
    id: 'template-graduacion',
    title: 'Misa de Graduación y Envío Escolar',
    type: 'Graduación',
    theme: 'Acción de gracias por los años de colegio y envío misionero de la nueva generación al servicio del país.',
    initialRites: {
      entranceCommentary: 'Con el corazón lleno de gratitud y emoción, nos reunimos para celebrar la Eucaristía de acción de gracias y envío de nuestros estudiantes graduados. Agradecemos los años compartidos, las amistades forjadas y los valores sembrados en sus corazones.',
      entranceSong: 'Vienen con Alegría',
      penitentialAct: 'Tú que nos invitas a perdonar y sanar heridas del camino: Señor, ten piedad.\nTú que nos llamas a ser sal de la tierra y luz del mundo: Cristo, ten piedad.\nTú que eres el Camino, la Verdad y la Vida: Señor, ten piedad.'
    },
    wordLiturgy: {
      wordCommentary: 'Dios nos ha llamado a dar fruto abundante. Escuchemos su Palabra que nos alienta a no tener miedo y a emprender el vuelo hacia la vida adulta.',
      firstReading: 'Lectura del profeta Jeremías (29, 11-14): «Porque yo sé muy bien los proyectos que tengo sobre ustedes: proyectos de paz y no de aflicción, para darles un futuro y una esperanza».',
      psalm: 'Salmo 138: «Te doy gracias, Señor, de todo corazón».',
      gospel: 'Evangelio según San Juan (15, 12-17): «No son ustedes los que me eligieron a mí, sino yo el que los elegí a ustedes, y los destiné para que vayan y den fruto, y ese fruto permanezca».',
      homilyNotes: 'El colegio como raíz; el mundo como campo de misión; el verdadero éxito es servir y amar.'
    },
    petitions: [
      { intention: 'Por los graduados, para que mantengan firmes los valores cristianos y la honestidad en sus estudios superiores y trabajos.', response: 'Señor, escucha nuestra oración.' },
      { intention: 'Por sus padres y familias, en recompensa por sus sacrificios incondicionales a lo largo de todos estos años.', response: 'Señor, escucha nuestra oración.' },
      { intention: 'Por los profesores y educadores que marcaron positivamente sus vidas con su testimonio y sabiduría.', response: 'Señor, escucha nuestra oración.' },
      { intention: 'Por la sociedad, para que reciba a estos jóvenes como agentes de justicia, compasión y progreso solidario.', response: 'Señor, escucha nuestra oración.' }
    ],
    offertory: {
      offertoryCommentary: 'Presentamos al altar los signos de una etapa escolar que culmina y la esperanza de un futuro que Dios bendice.',
      offerings: [
        { item: 'Pan y Vino', meaning: 'El sacrificio supremo de Cristo que da sentido a todas nuestras búsquedas humanas.' },
        { item: 'Insignia / Corbata o Estola del Colegio', meaning: 'El sello de la formación valórica y la identidad pastoral que llevarán con orgullo dondequiera que vayan.' },
        { item: 'Fotografía de la Generación', meaning: 'Los rostros de los amigos, las alegrías compartidas, las risas y la historia común que nunca se olvidará.' }
      ],
      offertorySong: 'Saber que Vendrás'
    },
    communion: {
      communionCommentary: 'Jesús nos acompaña en cada encrucijada del camino. Tomemos la fuerza de su Eucaristía para ser testigos suyos.',
      communionSong: 'Alma Misionera'
    },
    concludingRites: {
      thanksgivingPrayer: 'Señor, gracias por los años vividos en este colegio. Te pedimos que nunca olvidemos a los más necesitados, que la verdad sea nuestra bandera y que el amor a Ti y a nuestros hermanos sea el motor de nuestro porvenir. Virgen María, cuídanos siempre en el camino. Amén.',
      recessionalSong: 'Al Pecho Llevo una Cruz'
    }
  },
  {
    id: 'template-misa-curso',
    title: 'Misa de Curso o Nivel',
    type: 'Misa de Curso',
    theme: 'Fraternidad, respeto mutuo y alegría de convivir como hermanos en la misma sala de clases.',
    initialRites: {
      entranceCommentary: 'Queridos estudiantes, profesor jefe y apoderados: Hoy celebramos la Eucaristía de nuestro curso. Nos reunimos en torno al altar como una familia para agradecer lo vivido, pedir perdón por las asperezas y renovar nuestro compromiso de cuidarnos mutuamente.',
      entranceSong: 'Juntos como Hermanos',
      penitentialAct: 'Señor Jesús, cuando no sabemos escuchar ni ser pacientes con nuestros compañeros: Señor, ten piedad.\nCristo Jesús, cuando nos dejamos llevar por el egoísmo o la indiferencia: Cristo, ten piedad.\nSeñor Jesús, que nos enseñas el valor del perdón y la reconciliación sincera: Señor, ten piedad.'
    },
    wordLiturgy: {
      wordCommentary: 'Jesús nos invita a vivir en el amor fraterno. Escuchemos su Palabra para que nuestras palabras y gestos reflejen su mensaje.',
      firstReading: 'Lectura de la Primera Carta de San Juan (4, 7-12): «Queridos hermanos, amémonos los unos a los otros, porque el amor viene de Dios todo el que ama ha nacido de Dios y conoce a Dios».',
      psalm: 'Salmo 132: «¡Qué bueno y qué agradable es que los hermanos vivan en concordia!».',
      gospel: 'Evangelio según San Lucas (10, 25-37): «Parábola del Buen Samaritano: ¿Quién de estos tres te parece que fue prójimo del que cayó en manos de los ladrones? "El que tuvo compasión de él". Jesús le dijo: "Ve y haz tú lo mismo"».',
      homilyNotes: 'Vivir el compañerismo real: no excluir a nadie, integrar al que está solo, apoyar al que le cuesta una asignatura.'
    },
    petitions: [
      { intention: 'Por todos los estudiantes de nuestro curso: para que seamos amigos leales, solidarios y respetuosos en la sala y en el recreo.', response: 'Jesús, amigo bueno, escúchanos.' },
      { intention: 'Por nuestro profesor jefe y por todos los docentes que nos enseñan día a día con entrega y paciencia.', response: 'Jesús, amigo bueno, escúchanos.' },
      { intention: 'Por nuestras familias y hogares: para que Dios los llene de paz, trabajo, bendición y amor.', response: 'Jesús, amigo bueno, escúchanos.' },
      { intention: 'Por los compañeros que están enfermos o pasando un momento difícil: para que sientan nuestro apoyo y cercanía.', response: 'Jesús, amigo bueno, escúchanos.' }
    ],
    offertory: {
      offertoryCommentary: 'Presentamos ante el Señor el pan y el vino, junto a signos que expresan nuestra vida escolar como curso.',
      offerings: [
        { item: 'Pan y Vino', meaning: 'Cuerpo y Sangre de Jesús que renuevan nuestra fe.' },
        { item: 'Libro de Clases / Cuaderno de Curso', meaning: 'Nuestros aprendizajes, trabajos compartidos y el deseo sincero de superación.' },
        { item: 'Símbolo del Curso (Lema o Foto Grupal)', meaning: 'La unidad que queremos construir día a día en nuestra sala de clases.' }
      ],
      offertorySong: 'Esto que te Doy'
    },
    communion: {
      communionCommentary: 'Al comulgar, Jesús nos hace un solo cuerpo. Que esta Eucaristía fortalezca nuestra amistad y respeto cristiano.',
      communionSong: 'Nadie te Ama como Yo'
    },
    concludingRites: {
      thanksgivingPrayer: 'Jesús, amigo nuestro, gracias por este momento de encuentro y oración de nuestro curso. Ayúdanos a ser constructores de paz en el colegio y a reflejar tu amor en nuestros hogares. Amén.',
      recessionalSong: 'Santa María del Camino'
    }
  },
  {
    id: 'template-fiesta-patronal',
    title: 'Misa Solemne de Fiesta Patronal (Santo Domingo de Guzmán)',
    type: 'Misa Escolar',
    theme: 'Contemplar y dar a los demás lo contemplado: búsqueda de la verdad, estudio y caridad pastoral.',
    initialRites: {
      entranceCommentary: 'Celebramos con júbilo la fiesta de nuestro Santo Patrono, Santo Domingo de Guzmán. Su vida entregada a la Verdad, la oración constante y la compasión por los que sufren es el modelo que inspira nuestro proyecto educativo.',
      entranceSong: 'Vienen con Alegría',
      penitentialAct: 'Tú que nos llamas a buscar la Verdad con humildad y pasión: Señor, ten piedad.\nTú que nos envías como discípulos misioneros de la Buena Noticia: Cristo, ten piedad.\nTú que eres Luz de los corazones y Fuente de toda sabiduría: Señor, ten piedad.'
    },
    wordLiturgy: {
      wordCommentary: 'La predicación de Santo Domingo nacía de la escucha atenta de la Palabra de Dios. Acojamos con fe el mensaje del Evangelio.',
      firstReading: 'Lectura de la Carta de San Pablo a Timoteo (4, 1-8): «Proclama la Palabra, insiste a tiempo y a destiempo... Sé sobrio en todo, soporta las dificultades, realiza tu trabajo de evangelizador».',
      psalm: 'Salmo 95: «Canten al Señor un cántico nuevo; anuncien su salvación día tras día».',
      gospel: 'Evangelio según San Lucas (10, 1-9): «El Señor designó a otros setenta y dos y los envió de dos en dos por delante... La cosecha es abundante, pero los obreros son pocos; pidan al dueño de la cosecha que mande obreros».',
      homilyNotes: 'Espiritualidad dominicana en el colegio: hablar con Dios en la oración y de Dios a través de las obras y el estudio.'
    },
    petitions: [
      { intention: 'Por la Orden de Predicadores y por la Iglesia: para que continúen proclamando el Evangelio de la Gracia en todo el mundo.', response: 'Te lo pedimos, Señor.' },
      { intention: 'Por nuestra comunidad escolar: para que Santo Domingo nos inspire en el estudio constante y en la caridad sincera.', response: 'Te lo pedimos, Señor.' },
      { intention: 'Por los jóvenes y niños de nuestro colegio: para que descubran su vocación de servicio a los más vulnerables.', response: 'Te lo pedimos, Señor.' },
      { intention: 'Por los profesores y familias: para que eduquen en la libertad, la verdad y la esperanza cristiana.', response: 'Te lo pedimos, Señor.' }
    ],
    offertory: {
      offertoryCommentary: 'Acercamos al altar los frutos de nuestra comunidad educativa dominicana.',
      offerings: [
        { item: 'Pan y Vino', meaning: 'El memorial de la Pascua de Cristo.' },
        { item: 'Libro de la Palabra y Rosario', meaning: 'Las dos armas espirituales de Santo Domingo: la Escritura y la contemplación mariana.' },
        { item: 'Antorcha Encendida', meaning: 'El lema dominico «Luz de la Iglesia»: nuestro compromiso de encender el mundo con la luz de la Verdad.' }
      ],
      offertorySong: 'Saber que Vendrás'
    },
    communion: {
      communionCommentary: 'Jesús Eucaristía, centro de la vida de los santos, nos alimenta para perseverar en la fe.',
      communionSong: 'Pescador de Hombres'
    },
    concludingRites: {
      thanksgivingPrayer: 'Dios omnipotente, te bendecimos por el testimonio de Santo Domingo de Guzmán. Concédenos caminar siempre iluminados por la Verdad, guiados por el estudio y encendidos en caridad fraterna. Por Jesucristo nuestro Señor. Amén.',
      recessionalSong: 'Id y Enseñad (Sois la Semilla)'
    }
  },
  {
    id: 'template-liturgia-palabra',
    title: 'Liturgia de la Palabra y Bendición Escolar',
    type: 'Liturgia de la Palabra',
    theme: 'La Palabra de Dios como lámpara para nuestros pasos y luz en nuestro sendero escolar.',
    initialRites: {
      entranceCommentary: 'Querida comunidad: Nos congregamos en el nombre del Señor para celebrar esta Liturgia de la Palabra. Aunque no celebramos la Eucaristía, Jesús está plenamente presente en medio de nosotros cuando escuchamos su Palabra y nos unimos en oración fraterna.',
      entranceSong: 'Juntos como Hermanos',
      penitentialAct: 'Reconociendo nuestras limitaciones y fallas, abrimos el corazón a la misericordia del Señor: Señor, ten piedad. Cristo, ten piedad. Señor, ten piedad.'
    },
    wordLiturgy: {
      wordCommentary: 'Abramos el corazón al mensaje que Dios nos dirige hoy para nuestra vida diaria.',
      firstReading: 'Lectura del libro del Deuteronomio (6, 4-9): «Escucha, Israel: El Señor es nuestro Dios... Amarás al Señor tu Dios con todo tu corazón, con toda tu alma y con todas tus fuerzas».',
      psalm: 'Salmo 118: «Tu Palabra es lámpara para mis pasos, luz en mi sendero».',
      gospel: 'Evangelio según San Mateo (7, 24-27): «El que escucha estas palabras mías y las pone en práctica es como un hombre prudente que edificó su casa sobre roca».',
      homilyNotes: 'Construir sobre roca: basar las decisiones de la juventud en valores sólidos que no se derrumban ante las modas o presiones.'
    },
    petitions: [
      { intention: 'Por la paz en nuestro colegio y en nuestras familias: para que desterremos toda forma de violencia o burla.', response: 'Padre bueno, escúchanos.' },
      { intention: 'Por los estudiantes con dificultades académicas o personales: para que encuentren en nosotros una mano amiga y solidaria.', response: 'Padre bueno, escúchanos.' },
      { intention: 'Por nuestro país y por quienes sufren injusticias o soledad.', response: 'Padre bueno, escúchanos.' }
    ],
    offertory: {
      offertoryCommentary: 'Presentamos un compromiso personal de fe y estudio ante el altar.',
      offerings: [
        { item: 'Biblia Abierta', meaning: 'La primacía de la Palabra de Dios en nuestra formación escolar.' },
        { item: 'Compromiso Solidario', meaning: 'Nuestra colecta de alimentos o campaña fraterna para los más necesitados.' }
      ],
      offertorySong: 'Esto que te Doy'
    },
    communion: {
      communionCommentary: 'Nos unimos en Comunión Espiritual con Cristo, rezando juntos la oración que el mismo Señor nos enseñó: Padre Nuestro...',
      communionSong: 'Nadie te Ama como Yo'
    },
    concludingRites: {
      thanksgivingPrayer: 'Señor Jesús, gracias por alimentarnos con tu Palabra de vida. Danos la gracia de ser testimonios tuyos en el patio, en la sala y en nuestras casas. Amén.',
      recessionalSong: 'Santa María del Camino'
    }
  }
];

module.exports = {
  DEFAULT_LITURGICAL_TEMPLATES
};
