/**
 * song-data.js
 * Cancionero Pastoral y Litúrgico Católico para el Organizador Pastoral.
 * Catálogo estructurado con acordes cifrados, transpositor y analizador armónico.
 * 
 * Autor: Manuel Guia
 */

const CHROMATIC_SCALE_SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const CHROMATIC_SCALE_FLATS  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const ANGLO_TO_LATIN = {
  'C': 'Do',
  'D': 'Re',
  'E': 'Mi',
  'F': 'Fa',
  'G': 'Sol',
  'A': 'La',
  'B': 'Si'
};

const LATIN_TO_ANGLO = {
  'Do': 'C',
  'Re': 'D',
  'Mi': 'E',
  'Fa': 'F',
  'Sol': 'G',
  'La': 'A',
  'Si': 'B'
};

const CHORD_REGEX = /\[([A-G][b#]?(?:m|maj|min|dim|aug|sus[24]?|[0-9]+|\/[A-G][b#]?)?)\]/g;
const SECTION_REGEX = /^\s*\[(CORO|ESTRIBILLO|ESTROFA\s*\d*|PUENTE|INTRO|FINAL|ESTROFA)\]\s*$/i;

/**
 * Transpone un acorde individual un número de semitonos (positivo o negativo)
 */
function transposeChord(chord, semitones) {
  if (!chord || semitones === 0) return chord;
  const match = chord.match(/^([A-G][b#]?)(.*)$/);
  if (!match) return chord;

  const root = match[1];
  const suffix = match[2] || '';

  let idx = CHROMATIC_SCALE_SHARPS.indexOf(root);
  if (idx === -1) idx = CHROMATIC_SCALE_FLATS.indexOf(root);
  if (idx === -1) return chord;

  let newIdx = (idx + semitones) % 12;
  if (newIdx < 0) newIdx += 12;

  // Si tiene bemoles originalmente o el acorde resultante suele usar bemoles
  const useFlats = root.includes('b') || ['F', 'Bb', 'Eb', 'Ab'].includes(CHROMATIC_SCALE_FLATS[newIdx]);
  const newRoot = useFlats ? CHROMATIC_FLATS[newIdx] : CHROMATIC_SCALE_SHARPS[newIdx];

  // Si tiene un bajo invertido (ej. D/F#)
  if (suffix.includes('/')) {
    const parts = suffix.split('/');
    const rest = parts[0];
    const bass = transposeChord(parts[1], semitones);
    return `${newRoot}${rest}/${bass}`;
  }

  return `${newRoot}${suffix}`;
}

/**
 * Convierte un acorde cifrado a notación latina (Do, Re, Mi...) o americana (C, D, E...)
 */
function formatChordNotation(chord, notation = 'latin') {
  if (!chord) return '';
  if (notation === 'anglo') return chord;
  return chord.replace(/([A-G])([b#]?)/g, (m, note, acc) => {
    return (ANGLO_TO_LATIN[note] || note) + acc;
  });
}

/**
 * Transpone todo un texto con acordes en formato [Acorde]
 */
function transposeText(text, semitones) {
  if (!text || semitones === 0) return text;
  return text.replace(CHORD_REGEX, (_, chord) => `[${transposeChord(chord, semitones)}]`);
}

/**
 * Elimina los acordes y encabezados de sección para dejar solo la letra limpia
 */
function stripChords(text) {
  if (!text) return '';
  return text.replace(CHORD_REGEX, '').replace(/  +/g, ' ');
}

/**
 * Analizador semántico y visual de canciones para el visor de atril
 * Divide el texto en bloques de secciones (Coro, Estrofas) y líneas tokenizadas
 * con acordes colocados verticalmente sobre cada sílaba.
 */
function parseChordLyrics(lyricsText, semitones = 0, notation = 'latin') {
  if (!lyricsText) return { sections: [], chordsUsed: [] };
  const lines = lyricsText.split(/\r?\n/);
  const sections = [];
  const chordsUsedSet = new Set();
  let currentSection = { type: 'verse', label: '', lines: [] };

  lines.forEach(rawLine => {
    const trimmed = rawLine.trim();
    const secMatch = trimmed.match(SECTION_REGEX);
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

    // Tokenizar la línea en partes (acorde, texto)
    const tokens = [];
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

    CHORD_REGEX.lastIndex = 0;
    while ((match = CHORD_REGEX.exec(normalizedLine)) !== null) {
      const textBefore = normalizedLine.slice(lastIdx, match.index);
      if (textBefore.length > 0 || currentChord !== null) {
        const chordTrans = currentChord ? transposeChord(currentChord, semitones) : null;
        const chordDisplay = chordTrans ? formatChordNotation(chordTrans, notation) : null;
        if (chordDisplay) chordsUsedSet.add(chordDisplay);
        pushToken(chordDisplay, textBefore);
      }
      currentChord = match[1];
      lastIdx = CHORD_REGEX.lastIndex;
    }

    const remainingText = normalizedLine.slice(lastIdx);
    if (remainingText.length > 0 || currentChord !== null) {
      const chordTrans = currentChord ? transposeChord(currentChord, semitones) : null;
      const chordDisplay = chordTrans ? formatChordNotation(chordTrans, notation) : null;
      if (chordDisplay) chordsUsedSet.add(chordDisplay);
      pushToken(chordDisplay, remainingText);
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

// Cancionero Litúrgico y Escolar Oficial Estructurado
const DEFAULT_SONGS = [
  // ==========================================
  // --- ENTRADA ---
  // ==========================================
  {
    id: 'song-1',
    title: 'Vienen con Alegría',
    author: 'Cesáreo Gabaráin',
    category: 'Entrada',
    key: 'D',
    tempo: 'Alegre / Marcha',
    timeSignature: '2/4',
    season: 'Tiempo Ordinario',
    lyricsWithChords: `[CORO]
[D] Vienen con alegría, Señor,
cantando vienen con [A7]alegría, Señor,
los que caminan por la [D] vida, Señor,
[A7]sembrando tu paz y [D]amor.

[ESTROFA 1]
[D] Vienen trayendo la esperanza
a un mundo cargado de [A7]ansiedad,
a un mundo que busca y que no [D] alcanza
[A7]caminos de amor y de [D]amistad.

[CORO]
[D] Vienen con alegría, Señor,
cantando vienen con [A7]alegría, Señor,
los que caminan por la [D] vida, Señor,
[A7]sembrando tu paz y [D]amor.

[ESTROFA 2]
[D] Vienen trayendo entre sus manos
esfuerzos de hermanos por la [A7] paz,
deseos de un mundo más [D]humano
que [A7] nacen del bien y la [D]verdad.`
  },
  {
    id: 'song-2',
    title: 'Juntos como Hermanos',
    author: 'Cesáreo Gabaráin',
    category: 'Entrada',
    key: 'C',
    tempo: 'Caminata alegre',
    timeSignature: '4/4',
    season: 'Todo el año',
    lyricsWithChords: `[CORO]
[C] Juntos como [G]hermanos,
[Am] miembros de una [F]Iglesia,
[C] vamos [G]caminando
al [C]encuentro [G] del [C]Señor.

[ESTROFA 1]
[C] Un largo [G]caminar,
por el [Am]desierto bajo el [Em] sol,
[F] no podemos [C]avanzar
sin la [Dm]ayuda [G] del [C]Señor.

[CORO]
[C] Juntos como [G]hermanos,
[Am] miembros de una [F]Iglesia,
[C] vamos [G]caminando
al [C]encuentro [G] del [C]Señor.

[ESTROFA 2]
[C] Unidos al [G]rezar,
unidos [Am] en una [Em]canción,
[F] viviremos [C] nuestra fe
con la [Dm]ayuda [G] del [C]Señor.`
  },
  {
    id: 'song-3',
    title: 'Hacia Ti, Morada Santa',
    author: 'Kiko Argüello',
    category: 'Entrada',
    key: 'Dm',
    tempo: 'Solemnidad bíblica',
    timeSignature: '4/4',
    season: 'Adviento y Cuaresma',
    lyricsWithChords: `[CORO]
[Dm] Hacia Ti, morada [A7] santa,
hacia Ti, tierra del [Dm]Salvador,
peregrinos, [Gm]caminantes,
vamos [A7]hacia [Dm] Ti.

[ESTROFA 1]
[Dm] Venimos a tu [Gm] mesa,
sellaremos tu [C] pacto,
comeremos tu [F] carne,
tu [Gm] sangre nos [A7]limpiará.

[CORO]
[Dm] Hacia Ti, morada [A7] santa,
hacia Ti, tierra del [Dm]Salvador,
peregrinos, [Gm]caminantes,
vamos [A7]hacia [Dm] Ti.

[ESTROFA 2]
[Dm] Reinaremos [Gm]contigo
en tu morada [C] santa,
beberemos tu [F] vino,
tu [Gm]alegría nos [A7]salvará.`
  },

  // ==========================================
  // --- PIEDAD / PERDÓN ---
  // ==========================================
  {
    id: 'song-4',
    title: 'Señor, Ten Piedad (Tradicional)',
    author: 'Litúrgico',
    category: 'Piedad',
    key: 'Am',
    tempo: 'Suave y contemplativo',
    timeSignature: '3/4',
    season: 'Todo el año',
    lyricsWithChords: `[ESTROFA 1]
[Am] Señor, ten [Dm]piedad de [Am]nosotros.
[Am] Señor, ten [Dm]piedad de [Am]nosotros.

[ESTROFA 2]
[C] Cristo, ten [G]piedad de [Am]nosotros.
[C] Cristo, ten [G]piedad de [Am]nosotros.

[ESTROFA 3]
[Am] Señor, ten [Dm]piedad de [Am]nosotros.
[Am] Señor, ten [Dm]piedad de [Am]nosotros.`
  },
  {
    id: 'song-5',
    title: 'Hoy Perdóname',
    author: 'Bernardo Velado',
    category: 'Piedad',
    key: 'G',
    tempo: 'Oración profunda',
    timeSignature: '4/4',
    season: 'Cuaresma y Penitencial',
    lyricsWithChords: `[CORO]
[G] Hoy perdóname, [C] hoy por [D] siempre,
[G] sin mirar la [C]mentira, lo [D]vacío de nuestras [G] vidas,
nuestra falta de [C]amor y [D]caridad.

[ESTROFA 1]
[G] Hoy perdóname, [C] hoy por [D] siempre,
[G] aún sabiendo que he [C]caído,
que de [D] Ti siempre me [G]olvido,
te [C]imploro tu [D]perdón, [G]Señor.`
  },

  // ==========================================
  // --- GLORIA ---
  // ==========================================
  {
    id: 'song-6',
    title: 'Gloria a Dios en el Cielo (Giombini)',
    author: 'Marcello Giombini',
    category: 'Gloria',
    key: 'C',
    tempo: 'Jubiloso / Rítmico',
    timeSignature: '4/4',
    season: 'Tiempo Ordinario y Fiestas',
    lyricsWithChords: `[CORO]
[C] Gloria, gloria a [G] Dios en el cielo,
y en la [F] tierra a los [G] hombres paz.
[C] Gloria, gloria a [G] Dios en el cielo,
y en la [F] tierra a los [G] hombres paz.

[ESTROFA 1]
[C] Te alabamos, te [G]bendecimos,
te [F]adoramos, te [C]glorificamos.
Te damos [F] gracias por tu [C]inmensa gloria,
Señor [G] Dios, Rey [C]celestial.

[CORO]
[C] Gloria, gloria a [G] Dios en el cielo,
y en la [F] tierra a los [G] hombres paz.`
  },

  // ==========================================
  // --- SALMO Y ACLAMACIÓN ---
  // ==========================================
  {
    id: 'song-7',
    title: 'Tu Palabra me da Vida',
    author: 'Juan Antonio Espinosa',
    category: 'Salmo/Aclamación',
    key: 'D',
    tempo: 'Alegre / Marcha',
    timeSignature: '2/4',
    season: 'Todo el año',
    lyricsWithChords: `[CORO]
[D] Tu Palabra me da [A7] vida,
confío en Ti, [D]Señor.
Tu Palabra es [A7]eterna,
en ella [D]esperaré.

[ESTROFA 1]
[D] Dichoso el que con vida [A7]intachable
camina en la ley del [D]Señor.
Dichoso el que guardando sus [A7]preceptos
lo busca de todo [D]corazón.

[CORO]
[D] Tu Palabra me da [A7] vida,
confío en Ti, [D]Señor.
Tu Palabra es [A7]eterna,
en ella [D]esperaré.`
  },
  {
    id: 'song-8',
    title: 'Aleluya, la Diestra del Señor',
    author: 'Litúrgico',
    category: 'Salmo/Aclamación',
    key: 'G',
    tempo: 'Festivo',
    timeSignature: '4/4',
    season: 'Pascua y Fiestas',
    lyricsWithChords: `[CORO]
[G] Aleluya, [C]aleluya,
[D]aleluya, [G]aleluya.
[G] Aleluya, [C]aleluya,
[D]aleluya, [G]aleluya.

[ESTROFA 1]
[G] La diestra del Señor hizo [C]prodigios,
la [D] diestra del Señor nos ha [G]salvado.

[CORO]
[G] Aleluya, [C]aleluya,
[D]aleluya, [G]aleluya.`
  },

  // ==========================================
  // --- OFERTORIO ---
  // ==========================================
  {
    id: 'song-9',
    title: 'Saber que Vendrás',
    author: 'Bob Dylan / Adapt. Litúrgica',
    category: 'Ofertorio',
    key: 'D',
    tempo: 'Tranquilo y confiado',
    timeSignature: '4/4',
    season: 'Todo el año',
    lyricsWithChords: `[ESTROFA 1]
[D] En este mundo que [A] Cristo nos da
[G] hacemos la [D]ofrenda del pan,
el pan de nuestro [A]trabajo sin fin
y el [G] vino de nuestro [A7]cantar.

[ESTROFA 2]
[D] Traigo ante Ti nuestra [A] justa inquietud:
[G] amar la [D]justicia y la paz.

[CORO]
[D] Saber que [G]vendrás, saber que [A]estarás
[G]partiendo a los [A] pobres tu [D] pan.
[D] Saber que [G]vendrás, saber que [A]estarás
[G]partiendo a los [A] pobres tu [D] pan.`
  },
  {
    id: 'song-10',
    title: 'Una Espiga Dorada por el Sol',
    author: 'Cesáreo Gabaráin',
    category: 'Ofertorio',
    key: 'G',
    tempo: 'Cálido y comunitario',
    timeSignature: '4/4',
    season: 'Todo el año',
    lyricsWithChords: `[ESTROFA 1]
[G] Una espiga [D]dorada por el [G] sol,
el racimo que [C] corta el [D]viñador,
[C] se convierten [G]ahora en pan y [Em] vino de [Am]amor,
en el [D] Cuerpo y la Sangre del [G]Señor.

[ESTROFA 2]
[G] Compartimos la [D] misma [G]comunión,
somos trigo del [C] mismo [D]sembrador,
[C] un molino, la [G] vida, nos [Em]tritura con [Am]dolor,
Dios nos [D] hace eucaristía en el [G]amor.

[ESTROFA 3]
[G] Como granos que [D] han hecho el mismo [G] pan,
como notas que [C] tejen un [D]cantar,
[C] como gotas de [G]agua que se [Em] funden en el [Am] mar,
los [D]cristianos un cuerpo [G]formarán.`
  },
  {
    id: 'song-11',
    title: 'Esto que te Doy',
    author: 'Eduardo Ortiz Tirado',
    category: 'Ofertorio',
    key: 'C',
    tempo: 'Oferta humilde',
    timeSignature: '4/4',
    season: 'Todo el año',
    lyricsWithChords: `[ESTROFA 1]
[C] Esto que te doy, es [Em] vino y pan, Señor.
[F] Esto que te doy, es [G] mi trabajo.
[F] Es mi corazón, [G] y mi voluntad,
[Em] es mi amor, mi [Am] fe, mi vida.

[CORO]
Toma [F] esto que te doy, [G]
hazlo [C] Tuyo, [Am]Señor,
toma [F] mi pequeñez y [G] hazla de tu [C]amor.`
  },

  // ==========================================
  // --- SANTO ---
  // ==========================================
  {
    id: 'song-12',
    title: 'Santo es el Señor mi Dios',
    author: 'Litúrgico Popular',
    category: 'Santo',
    key: 'Am',
    tempo: 'Rítmico con palmas',
    timeSignature: '4/4',
    season: 'Todo el año',
    lyricsWithChords: `[CORO]
[Am] Santo es el Señor mi [E7] Dios,
digno de alabanza, a Él el poder,
el honor y la [Am] gloria.
[Am] Santo es el Señor mi [E7] Dios,
digno de alabanza, a Él el poder,
el honor y la [Am] gloria.

[ESTROFA 1]
[Am] Hosanna, [A7] hosanna,
[Dm]hosanna, oh Señor.
[Am] Bendito el que viene [E7] en nombre del [Am]Señor.`
  },
  {
    id: 'song-13',
    title: 'Santo Zaireño (Ha-shem)',
    author: 'Tradicional Africano',
    category: 'Santo',
    key: 'C',
    tempo: 'Festivo / Danza',
    timeSignature: '4/4',
    season: 'Fiestas y Jóvenes',
    lyricsWithChords: `[CORO]
[C] Santo, santo, [F] [C]hosanna.
[C] Santo, santo, [F] [C]hosanna.

[ESTROFA 1]
[F] Hosanna he, [C] hosanna ha,
[G]bendito el que viene en el nombre del [C]Señor.
[F] Hosanna he, [C] hosanna ha,
[G]bendito el que viene en el nombre del [C]Señor.`
  },

  // ==========================================
  // --- PAZ Y CORDERO ---
  // ==========================================
  {
    id: 'song-14',
    title: 'Cordero de Dios (Paz)',
    author: 'Litúrgico',
    category: 'Paz/Cordero',
    key: 'G',
    tempo: 'Sereno',
    timeSignature: '3/4',
    season: 'Todo el año',
    lyricsWithChords: `[ESTROFA 1]
[G] Cordero de [Em] Dios,
que [C] quitas el pecado del [D] mundo,
ten [G]piedad de [Em]nosotros,
ten [C]piedad de [D]nosotros.

[CORO]
[G] Cordero de [Em] Dios,
que [C] quitas el pecado del [D] mundo,
danos la [C] paz, [D] danos la [G] paz.`
  },

  // ==========================================
  // --- COMUNIÓN ---
  // ==========================================
  {
    id: 'song-15',
    title: 'Pescador de Hombres',
    author: 'Cesáreo Gabaráin',
    category: 'Comunión',
    key: 'C',
    tempo: 'Contemplativo y pastoral',
    timeSignature: '3/4',
    season: 'Vocacional y Ordinario',
    lyricsWithChords: `[ESTROFA 1]
[C] Tú has venido a la [G] orilla,
[Am] no has buscado ni a [F] sabios ni a [G] ricos,
[C] tan sólo [G] quieres que [C] yo te [F] siga. [G]

[CORO]
[C] Señor, me has [G]mirado a los [Am] ojos,
[F]sonriendo has [Dm]dicho mi [G] nombre.
[C] En la arena he [G]dejado mi [Am] barca,
junto a [F] Ti [G]buscaré otro [C] mar.

[ESTROFA 2]
[C] Tú sabes bien lo que [G] tengo,
en mi [Am] barca no hay [F] oro ni [G]espadas,
[C] tan sólo [G] redes y [C] mi [F]trabajo. [G]

[ESTROFA 3]
[C] Tú necesitas mis [G] manos,
mi [Am]cansancio que a [F] otros [G]descanse,
[C] amor que [G] quiera [C]seguir [F]amando. [G]`
  },
  {
    id: 'song-16',
    title: 'Alma Misionera',
    author: 'Cesáreo Gabaráin',
    category: 'Comunión',
    key: 'G',
    tempo: 'Ardor apostólico y juvenil',
    timeSignature: '4/4',
    season: 'Envío y Vocacional',
    lyricsWithChords: `[ESTROFA 1]
[G] Señor, toma mi [D] vida nueva
[Em] antes de que la [C]espera
[G]desgaste años en [D] mí.
[G] Estoy dispuesto a lo [D] que quieras,
[Em] no importa lo que [C] sea,
Tú [G] llámame a [D]servir.

[CORO]
[G] Llévame donde los [D] hombres
[Em]necesiten tus [C]palabras,
[G]necesiten mis ganas de [D]vivir;
donde [G] falte la [D]esperanza,
donde [Em] todo sea [C] triste
[G]simplemente por [D] no saber de [G] Ti.

[ESTROFA 2]
[G] Te doy mi corazón [D]sincero
para [Em]gritar sin miedo tu [C]grandeza, Señor.
[G] Tendré mis manos que no se [D] cansen,
mi canto [Em] que no cese de [C]alabarte,
Tú [G] guíame en mi [D]vida.`
  },
  {
    id: 'song-17',
    title: 'Tan Cerca de Mí',
    author: 'Cesáreo Gabaráin',
    category: 'Comunión',
    key: 'D',
    tempo: 'Intimidad eucarística',
    timeSignature: '4/4',
    season: 'Comunión',
    lyricsWithChords: `[CORO]
[D] Tan cerca de [A] mí,
[G] tan cerca de [D] mí,
que hasta lo puedo [A7]tocar,
Jesús está [D]aquí.

[ESTROFA 1]
[D] Le hablaré sin [A]temor al [D]oído,
le [G]contaré las cosas que hay en [A] mí,
y que [D] sólo a Él le [G]interesan;
Él es [D] más que un [A7] amigo para [D] mí.

[CORO]
[D] Tan cerca de [A] mí,
[G] tan cerca de [D] mí,
que hasta lo puedo [A7]tocar,
Jesús está [D]aquí.

[ESTROFA 2]
[D] Míralo a tu [A] lado por la [D] calle,
[G]caminando entre la [A]multitud;
muchos [D] ciegos van sin [G]poderlo ver,
llenos [D] de una [A7]ceguera [D]espiritual.`
  },
  {
    id: 'song-18',
    title: 'Nadie te Ama como Yo',
    author: 'Martín Valverde',
    category: 'Comunión',
    key: 'C',
    tempo: 'Oración de entrega',
    timeSignature: '4/4',
    season: 'Cuaresma y Retiros',
    lyricsWithChords: `[ESTROFA 1]
[C] Cuánto he [G]esperado este [Am]momento,
cuánto he [F]esperado que estuvieras [G]aquí.
[C] Cuánto he [G]esperado que me [Am]hablaras,
cuánto he [F]esperado que vinieras a [G] mí.

[CORO]
Pues [C] nadie te ama como [G] Yo,
pues [Am] nadie te ama como [Em] Yo.
Mira la [F] cruz, esa es mi más grande [G] prueba;
nadie te [C] ama como [G] Yo.

[ESTROFA 2]
[C] Yo sé bien lo que me [G] dices,
aunque a [Am] veces no me [Em] hablas;
Yo sé [F] bien lo que en ti [C] sientes,
aunque [Dm] nunca lo [G]compartas.`
  },
  {
    id: 'song-19',
    title: 'Cara a Cara',
    author: 'Marcos Vidal',
    category: 'Comunión',
    key: 'C',
    tempo: 'Mística y adoración profunda',
    timeSignature: '4/4',
    season: 'Adoración',
    lyricsWithChords: `[ESTROFA 1]
[C] Solamente una [G]palabra,
[Am] solamente una [Em]oración,
cuando [F] llegue a tu [C]presencia,
oh [Dm] Señor. [G]

[CORO]
[C] Déjame llorar [G]pegado a tus pies,
déjame [Am] besar las heridas de tus [Em] manos,
hazme un [F]espacio a tu [C] lado,
y [Dm] quédate [G]conmigo para [C]siempre.

[ESTROFA 2]
[C] No me importa en qué [G]lugar de la mesa me [Am] pongas,
solamente [F]estar cerca de [G] Ti,
contemplar tu [C] rostro y cantar tu [G]amor.`
  },

  // ==========================================
  // --- SALIDA Y MARIANOS ---
  // ==========================================
  {
    id: 'song-20',
    title: 'Santa María del Camino',
    author: 'Juan Antonio Espinosa',
    category: 'Salida',
    key: 'C',
    tempo: 'Caminata alegre',
    timeSignature: '4/4',
    season: 'Mariano / Envío',
    lyricsWithChords: `[ESTROFA 1]
[C] Mientras recorres la [F] vida,
[C] tú nunca [G] solo [C]estás;
[F] contigo por el [C]camino,
[G] Santa María [C] va.

[CORO]
[F] Ven con nosotros al [C]caminar,
[G] Santa María, [C] ven.
[F] Ven con nosotros al [C]caminar,
[G] Santa María, [C] ven.

[ESTROFA 2]
[C] Aunque te digan [F]algunos
[C] que nada [G] puede [C]cambiar,
[F] lucha por un mundo [C] nuevo,
[G] lucha por la [C]verdad.`
  },
  {
    id: 'song-21',
    title: 'Junto a Ti, María',
    author: 'Kairoi',
    category: 'Mariano',
    key: 'D',
    tempo: 'Tierno y confiado',
    timeSignature: '4/4',
    season: 'Mes de María',
    lyricsWithChords: `[ESTROFA 1]
[D] Junto a Ti, [A]María,
como un [Bm] niño quiero [F#m]estar,
[G] tómame en tus [D] brazos,
guíame [Em] en mi [A7]caminar.

[ESTROFA 2]
[D] Quiero que me [A]eduques,
que me [Bm]enseñes a [F#m]rezar,
[G] hazme [D]transparente,
lléname [A7] de [D] paz.

[CORO]
Madre, [Bm] Madre, [G] Madre, [D] Madre.
Madre, [Bm] Madre, [G] Madre, [D] Madre.`
  },
  {
    id: 'song-22',
    title: 'Id y Enseñad (Sois la Semilla)',
    author: 'Cesáreo Gabaráin',
    category: 'Salida',
    key: 'D',
    tempo: 'Misión y envío escolar',
    timeSignature: '4/4',
    season: 'Fin de Misa / Misiones',
    lyricsWithChords: `[ESTROFA 1]
[D] Sois la semilla que ha de [A]crecer,
sois la [Bm]estrella que ha de [F#m]brillar,
[G] sois [D]levadura, sois buena [Em] nueva
que enciende el [A7] mundo.

[CORO]
[D] Id, amigos, [A] por el mundo,
[Bm]anunciando el [F#m]amor,
[G] mensajeros [D] de la vida,
de la [A7] paz y el [D]perdón.

[ESTROFA 2]
[D] Sois una llama que ha de [A]encender
[Bm]resplandores de fe y [F#m]caridad,
[G] sois los [D]pastores que han de [Em]guiar
al mundo por [A7] sendas de paz.`
  },
  {
    id: 'song-23',
    title: 'Al Pecho Llevo una Cruz',
    author: 'Tradicional Juvenil Católico',
    category: 'Salida',
    key: 'G',
    tempo: 'Rítmico con entusiasmo juvenil',
    timeSignature: '4/4',
    season: 'Pastoral Juvenil',
    lyricsWithChords: `[CORO]
[G] Al pecho llevo una [D] cruz
y en mi corazón lo que dice [G]Jesús.
[G] Al pecho llevo una [D] cruz
y en mi corazón lo que dice [G]Jesús.

[ESTROFA 1]
[G] Yo sé que soy todavía muy [D] joven,
pero tengo en el alma una gran [G]ilusión:
anunciar a todos que Cristo está [C] vivo,
que es [D] el Salvador y nos da [G]salvación.`
  },

  // ==========================================
  // --- ALABANZA Y ADORACIÓN ---
  // ==========================================
  {
    id: 'song-24',
    title: 'Rendid a Yahvé',
    author: 'Kiko Argüello / Salmo 29',
    category: 'Alabanza',
    key: 'Am',
    tempo: 'Fuerte y vibrante',
    timeSignature: '4/4',
    season: 'Oración / Vigilia',
    lyricsWithChords: `[ESTROFA 1]
[Am] Rendid a Yahvé, santos del Señor,
gloria y poder al que hace la [E7]creación.
Rendid honor al glorioso nombre del [Am]Señor,
y adoradle en su santo [E7]esplendor.

[ESTROFA 2]
[Am] Sobre los mares resuena la voz de Dios,
glorioso es Dios, su trueno hace [E7]temblar.
La voz de Dios desgaja los cedros del [Am]Líbano,
la voz de Dios lanza llamas de [E7] fuego.`
  },
  {
    id: 'song-25',
    title: 'Yo Tengo un Amigo que me Ama',
    author: 'Tradicional Infantil / Pastoral',
    category: 'Alabanza',
    key: 'D',
    tempo: 'Alegre / Dinámica escolar',
    timeSignature: '2/4',
    season: 'Primaria / Pastoral Infantil',
    lyricsWithChords: `[ESTROFA 1]
[D] Yo tengo un amigo que me ama,
me [A7] ama, me [D] ama.
Yo tengo un amigo que me ama,
su [A7] nombre es [D]Jesús.

[CORO]
Que me [G] ama, que me [D] ama,
que me [A7] ama con su tierno [D]amor.
Que me [G] ama, que me [D] ama,
su [A7] nombre es [D]Jesús.`
  }
];

module.exports = {
  DEFAULT_SONGS,
  transposeChord,
  transposeText,
  stripChords,
  formatChordNotation,
  parseChordLyrics,
  ANGLO_TO_LATIN,
  LATIN_TO_ANGLO
};
