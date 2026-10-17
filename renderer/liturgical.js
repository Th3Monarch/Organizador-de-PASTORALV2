/**
 * liturgical.js - Calendario litúrgico católico nativo para Organizador Pastoral
 * Implementa el algoritmo de Meeus/Butcher para el cálculo exacto de la Pascua
 * y determina tiempos litúrgicos, colores, solemnidades y fiestas fijas (con énfasis dominicano).
 */

const LiturgicalCalendar = (() => {
  // Versículos y citas de espiritualidad dominicana y bíblica
  const VERSES = [
    { text: "Conocerán la verdad, y la verdad los hará libres.", ref: "Juan 8, 32" },
    { text: "Contemplar y dar a los demás los frutos de lo contemplado.", ref: "Santo Tomás de Aquino, O.P." },
    { text: "Si son lo que deben ser, prenderán fuego al mundo entero.", ref: "Santa Catalina de Siena, O.P." },
    { text: "No amen sólo de palabra ni de labios para afuera, sino de verdad y con obras.", ref: "1 Juan 3, 18" },
    { text: "El Señor es mi pastor, nada me faltará.", ref: "Salmo 23, 1" },
    { text: "Vayan por todo el mundo y proclamen el Evangelio a toda criatura.", ref: "Marcos 16, 15" },
    { text: "Hablar sólo con Dios o de Dios.", ref: "Regla de Santo Domingo de Guzmán" },
    { text: "Donde no hay amor, pon amor y sacarás amor.", ref: "San Juan de la Cruz" },
    { text: "Hagan todo lo que Él les diga.", ref: "Juan 2, 5" },
    { text: "El que permanece en mí y yo en él, ése da mucho fruto.", ref: "Juan 15, 5" },
    { text: "La caridad es paciente, es servicial; todo lo disculpa, todo lo espera.", ref: "1 Corintios 13, 4.7" },
    { text: "Dichosos los que trabajan por la paz, porque serán llamados hijos de Dios.", ref: "Mateo 5, 9" },
    { text: "La compasión de Martín abarcaba a todas las criaturas de Dios.", ref: "San Martín de Porres, O.P." },
    { text: "Que la paz de Cristo reine en sus corazones.", ref: "Colosenses 3, 15" }
  ];

  // Fiestas fijas principales (mes es 1..12, día 1..31)
  const FIXED_FEASTS = [
    { month: 1, day: 1, name: "Santa María, Madre de Dios", color: "Blanco", rank: "Solemnidad" },
    { month: 1, day: 6, name: "Epifanía del Señor", color: "Blanco", rank: "Solemnidad" },
    { month: 1, day: 28, name: "Santo Tomás de Aquino, presbítero y doctor (O.P.)", color: "Blanco", rank: "Memoria" },
    { month: 2, day: 2, name: "Presentación del Señor en el Templo", color: "Blanco", rank: "Fiesta" },
    { month: 3, day: 19, name: "San José, Esposo de la Virgen María", color: "Blanco", rank: "Solemnidad" },
    { month: 3, day: 25, name: "La Anunciación del Señor", color: "Blanco", rank: "Solemnidad" },
    { month: 4, day: 29, name: "Santa Catalina de Siena, virgen y doctora (O.P.)", color: "Blanco", rank: "Fiesta" },
    { month: 5, day: 1, name: "San José Obrero", color: "Blanco", rank: "Memoria" },
    { month: 5, day: 13, name: "Nuestra Señora de Fátima", color: "Blanco", rank: "Memoria" },
    { month: 5, day: 31, name: "Visitación de la Santísima Virgen María", color: "Blanco", rank: "Fiesta" },
    { month: 6, day: 24, name: "Natividad de San Juan Bautista", color: "Blanco", rank: "Solemnidad" },
    { month: 6, day: 29, name: "San Pedro y San Pablo, Apóstoles", color: "Rojo", rank: "Solemnidad" },
    { month: 8, day: 6, name: "Transfiguración del Señor", color: "Blanco", rank: "Fiesta" },
    { month: 8, day: 8, name: "Santo Domingo de Guzmán, Fundador (O.P.)", color: "Blanco", rank: "Solemnidad" },
    { month: 8, day: 15, name: "Asunción de la Santísima Virgen María", color: "Blanco", rank: "Solemnidad" },
    { month: 8, day: 22, name: "Santa María Reina", color: "Blanco", rank: "Memoria" },
    { month: 8, day: 23, name: "Santa Rosa de Lima, virgen (O.P.)", color: "Blanco", rank: "Fiesta" },
    { month: 8, day: 30, name: "Santa Rosa de Lima (Fiesta en América Latina)", color: "Blanco", rank: "Solemnidad" },
    { month: 9, day: 8, name: "Natividad de la Santísima Virgen María", color: "Blanco", rank: "Fiesta" },
    { month: 9, day: 14, name: "Exaltación de la Santa Cruz", color: "Rojo", rank: "Fiesta" },
    { month: 10, day: 7, name: "Nuestra Señora del Rosario", color: "Blanco", rank: "Memoria" },
    { month: 11, day: 1, name: "Todos los Santos", color: "Blanco", rank: "Solemnidad" },
    { month: 11, day: 2, name: "Conmemoración de todos los Fieles Difuntos", color: "Morado", rank: "Conmemoración" },
    { month: 11, day: 3, name: "San Martín de Porres, religioso (O.P.)", color: "Blanco", rank: "Fiesta" },
    { month: 12, day: 8, name: "Inmaculada Concepción de la Virgen María", color: "Blanco", rank: "Solemnidad" },
    { month: 12, day: 12, name: "Nuestra Señora de Guadalupe, Patrona de América", color: "Blanco", rank: "Solemnidad" },
    { month: 12, day: 25, name: "Natividad del Señor (Navidad)", color: "Blanco", rank: "Solemnidad" },
    { month: 12, day: 27, name: "San Juan, Apóstol y Evangelista", color: "Blanco", rank: "Fiesta" },
    { month: 12, day: 28, name: "Santos Inocentes, Mártires", color: "Rojo", rank: "Fiesta" }
  ];

  /**
   * Algoritmo Meeus/Butcher para calcular Domingo de Pascua de cualquier año
   */
  function calculateEaster(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = marzo, 4 = abril
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  function stripTime(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function isSameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  }

  /**
   * Calcula el 1er Domingo de Adviento para un año
   * (4 domingos antes de Navidad)
   */
  function getFirstSundayOfAdvent(year) {
    const christmas = new Date(year, 11, 25);
    const dayOfWeek = christmas.getDay(); // 0 = Domingo
    // Si Navidad es domingo, el 4to domingo de adviento es el 18 de dic
    // Si no, retroceder hasta el domingo anterior
    const daysToFourthSunday = dayOfWeek === 0 ? 7 : dayOfWeek;
    const fourthSunday = new Date(year, 11, 25 - daysToFourthSunday);
    return new Date(fourthSunday.getTime() - 21 * 24 * 60 * 60 * 1000);
  }

  /**
   * Obtiene la fiesta del Bautismo del Señor para el ciclo de Navidad que termina en enero
   */
  function getBaptismOfTheLord(year) {
    // La Epifanía suele ser el 6 de enero o el domingo entre 2 y 8 de enero
    const epiphany = new Date(year, 0, 6);
    const dayOfWeek = epiphany.getDay();
    // Domingo siguiente a la Epifanía
    const daysToAdd = dayOfWeek === 0 ? 7 : (7 - dayOfWeek);
    return new Date(year, 0, 6 + daysToAdd);
  }

  /**
   * Obtiene el versículo del día (rotación determinista según día del año)
   */
  function getVerseOfTheDay(targetDate = new Date()) {
    const start = new Date(targetDate.getFullYear(), 0, 0);
    const diff = targetDate - start;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    const index = Math.abs(dayOfYear) % VERSES.length;
    return VERSES[index];
  }

  /**
   * Calcula las fechas móviles clave para un año litúrgico
   */
  function getMovableFeasts(year) {
    const easter = calculateEaster(year);
    const ashWednesday = addDays(easter, -46);
    const palmSunday = addDays(easter, -7);
    const holyThursday = addDays(easter, -3);
    const goodFriday = addDays(easter, -2);
    const holySaturday = addDays(easter, -1);
    const divineMercy = addDays(easter, 7);
    const ascension = addDays(easter, 42); // domingo de ascensión
    const pentecost = addDays(easter, 49);
    const trinity = addDays(easter, 56);
    const corpusChristi = addDays(easter, 63);
    const sacredHeart = addDays(easter, 68);

    const firstAdvent = getFirstSundayOfAdvent(year);
    const baptismOfLord = getBaptismOfTheLord(year);

    // Cristo Rey: Domingo anterior al 1er domingo de Adviento
    const christTheKing = addDays(firstAdvent, -7);

    return {
      easter,
      ashWednesday,
      palmSunday,
      holyThursday,
      goodFriday,
      holySaturday,
      divineMercy,
      ascension,
      pentecost,
      trinity,
      corpusChristi,
      sacredHeart,
      firstAdvent,
      christTheKing,
      baptismOfLord
    };
  }

  /**
   * Determina el tiempo litúrgico, color y solemnidad para cualquier fecha dada.
   */
  function getLiturgicalInfo(date = new Date()) {
    const current = stripTime(date);
    const year = current.getFullYear();
    const mov = getMovableFeasts(year);

    // Comprobar fiesta fija de hoy
    const fixedToday = FIXED_FEASTS.find(
      f => f.month === (current.getMonth() + 1) && f.day === current.getDate()
    );

    let season = "Tiempo Ordinario";
    let color = "Verde";
    let colorHex = "#16a34a"; // verde esmeralda litúrgico
    let description = "Tiempo de crecimiento espiritual y escucha de la Palabra";
    let celebration = fixedToday ? fixedToday.name : "";

    // Evaluar épocas en orden cronológico del año civil:
    // 1. Enero: Desde 1 de enero hasta Bautismo del Señor -> Tiempo de Navidad
    const jan1 = new Date(year, 0, 1);
    const dec25 = new Date(year, 11, 25);
    const dec31 = new Date(year, 11, 31);

    if (current >= jan1 && current <= mov.baptismOfLord) {
      season = "Tiempo de Navidad";
      color = "Blanco";
      colorHex = "#eab308"; // dorado/blanco marfil
      description = "Misterio de la Encarnación y manifestación del Salvador";
      if (!celebration) {
        if (isSameDay(current, mov.baptismOfLord)) {
          celebration = "El Bautismo del Señor (Cierre del Tiempo de Navidad)";
        } else {
          celebration = "Feria del Tiempo de Navidad";
        }
      }
    }
    // 2. Tiempo Ordinario (primera parte)
    else if (current > mov.baptismOfLord && current < mov.ashWednesday) {
      season = "Tiempo Ordinario";
      color = "Verde";
      colorHex = "#16a34a";
      description = "Seguimiento diario de Jesús en su vida pública";
      if (!celebration) celebration = "Feria del Tiempo Ordinario";
    }
    // 3. Cuaresma: Desde Miércoles de Ceniza hasta antes del Jueves Santo
    else if (current >= mov.ashWednesday && current < mov.holyThursday) {
      season = "Cuaresma";
      color = "Morado";
      colorHex = "#7c3aed"; // morado penitencial
      description = "Tiempo de conversión, oración, ayuno y caridad hacia la Pascua";
      if (!celebration) {
        if (isSameDay(current, mov.ashWednesday)) {
          celebration = "Miércoles de Ceniza";
        } else if (isSameDay(current, mov.palmSunday)) {
          celebration = "Domingo de Ramos en la Pasión del Señor";
          color = "Rojo";
          colorHex = "#dc2626";
        } else {
          celebration = "Feria de Cuaresma";
        }
      }
    }
    // 4. Triduo Pascual: Jueves Santo, Viernes Santo, Sábado Santo
    else if (current >= mov.holyThursday && current < mov.easter) {
      season = "Triduo Pascual";
      if (isSameDay(current, mov.holyThursday)) {
        celebration = "Jueves Santo de la Cena del Señor";
        color = "Blanco";
        colorHex = "#eab308";
      } else if (isSameDay(current, mov.goodFriday)) {
        celebration = "Viernes Santo en la Pasión del Señor";
        color = "Rojo";
        colorHex = "#dc2626";
      } else if (isSameDay(current, mov.holySaturday)) {
        celebration = "Sábado Santo - Solemne Vigilia Pascual";
        color = "Blanco";
        colorHex = "#eab308";
      }
      description = "Centro del año cristiano: Pasión, Muerte y Resurrección de Cristo";
    }
    // 5. Tiempo Pascual: Desde Domingo de Resurrección hasta Pentecostés
    else if (current >= mov.easter && current <= mov.pentecost) {
      season = "Tiempo de Pascua";
      color = "Blanco";
      colorHex = "#eab308";
      description = "Cincuenta días de gozo celebrando la Resurrección del Señor";
      if (!celebration) {
        if (isSameDay(current, mov.easter)) {
          celebration = "¡Domingo de Pascua de la Resurrección del Señor!";
        } else if (isSameDay(current, mov.divineMercy)) {
          celebration = "Domingo de la Divina Misericordia";
        } else if (isSameDay(current, mov.ascension)) {
          celebration = "Solemnidad de la Ascensión del Señor";
        } else if (isSameDay(current, mov.pentecost)) {
          celebration = "Solemnidad de Pentecostés";
          color = "Rojo";
          colorHex = "#dc2626";
        } else {
          celebration = "Feria de Pascua";
        }
      }
    }
    // 6. Tiempo Ordinario (segunda parte): Desde después de Pentecostés hasta antes de Adviento
    else if (current > mov.pentecost && current < mov.firstAdvent) {
      season = "Tiempo Ordinario";
      color = "Verde";
      colorHex = "#16a34a";
      description = "Tiempo de dar testimonio, servicio y esperanza en el Reino";

      if (!celebration) {
        if (isSameDay(current, mov.trinity)) {
          celebration = "Solemnidad de la Santísima Trinidad";
          color = "Blanco";
          colorHex = "#eab308";
        } else if (isSameDay(current, mov.corpusChristi)) {
          celebration = "Solemnidad del Santísimo Cuerpo y Sangre de Cristo (Corpus Christi)";
          color = "Blanco";
          colorHex = "#eab308";
        } else if (isSameDay(current, mov.sacredHeart)) {
          celebration = "Solemnidad del Sagrado Corazón de Jesús";
          color = "Blanco";
          colorHex = "#eab308";
        } else if (isSameDay(current, mov.christTheKing)) {
          celebration = "Solemnidad de Jesucristo, Rey del Universo";
          color = "Blanco";
          colorHex = "#eab308";
        } else {
          celebration = "Feria del Tiempo Ordinario";
        }
      }
    }
    // 7. Adviento: Desde 1er Domingo de Adviento hasta 24 de Diciembre
    else if (current >= mov.firstAdvent && current < dec25) {
      season = "Tiempo de Adviento";
      color = "Morado";
      colorHex = "#7c3aed";
      description = "Tiempo de alegre espera y preparación para la venida de Cristo";
      if (!celebration) celebration = "Feria de Adviento";
    }
    // 8. Navidad (25 al 31 de Diciembre)
    else if (current >= dec25 && current <= dec31) {
      season = "Tiempo de Navidad";
      color = "Blanco";
      colorHex = "#eab308";
      description = "Gozo por el nacimiento de nuestro Salvador";
      if (!celebration) {
        if (isSameDay(current, dec25)) {
          celebration = "Natividad del Señor (Navidad)";
        } else {
          celebration = "Octava de Navidad";
        }
      }
    }

    // Si hay una fiesta fija hoy, prevalece su color litúrgico especial
    if (fixedToday) {
      celebration = fixedToday.name;
      color = fixedToday.color;
      if (color === "Blanco") colorHex = "#eab308";
      else if (color === "Rojo") colorHex = "#dc2626";
      else if (color === "Morado") colorHex = "#7c3aed";
      else if (color === "Verde") colorHex = "#16a34a";
    }

    // Buscar próxima celebración en los siguientes 30 días
    const upcoming = findNextCelebration(current, year, mov);

    return {
      season,
      color,
      colorHex,
      description,
      celebration,
      upcoming,
      verse: getVerseOfTheDay(current)
    };
  }

  function findNextCelebration(fromDate, currentYear, mov) {
    const list = [];

    // Fiestas móviles
    const movFeasts = [
      { name: "Miércoles de Ceniza", date: mov.ashWednesday, color: "Morado" },
      { name: "Domingo de Ramos", date: mov.palmSunday, color: "Rojo" },
      { name: "Jueves Santo", date: mov.holyThursday, color: "Blanco" },
      { name: "Viernes Santo", date: mov.goodFriday, color: "Rojo" },
      { name: "Pascua de Resurrección", date: mov.easter, color: "Blanco" },
      { name: "Domingo de la Divina Misericordia", date: mov.divineMercy, color: "Blanco" },
      { name: "Ascensión del Señor", date: mov.ascension, color: "Blanco" },
      { name: "Pentecostés", date: mov.pentecost, color: "Rojo" },
      { name: "Santísima Trinidad", date: mov.trinity, color: "Blanco" },
      { name: "Corpus Christi", date: mov.corpusChristi, color: "Blanco" },
      { name: "Sagrado Corazón de Jesús", date: mov.sacredHeart, color: "Blanco" },
      { name: "Jesucristo Rey del Universo", date: mov.christTheKing, color: "Blanco" },
      { name: "1er Domingo de Adviento", date: mov.firstAdvent, color: "Morado" }
    ];

    movFeasts.forEach(item => {
      if (item.date > fromDate) {
        list.push({ ...item, daysLeft: Math.round((item.date - fromDate) / (1000 * 60 * 60 * 24)) });
      }
    });

    // Fiestas fijas
    FIXED_FEASTS.forEach(f => {
      const d = new Date(currentYear, f.month - 1, f.day);
      if (d > fromDate) {
        list.push({
          name: f.name,
          date: d,
          color: f.color,
          daysLeft: Math.round((d - fromDate) / (1000 * 60 * 60 * 24))
        });
      }
    });

    list.sort((a, b) => a.daysLeft - b.daysLeft);
    return list[0] || null;
  }

  return {
    getLiturgicalInfo,
    getVerseOfTheDay,
    calculateEaster,
    getMovableFeasts,
    FIXED_FEASTS
  };
})();

// Si estamos en entorno Node (para pruebas)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LiturgicalCalendar;
}
