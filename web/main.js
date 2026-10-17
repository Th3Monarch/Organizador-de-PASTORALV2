/**
 * web/main.js - Experiencia 3D Interactiva con Three.js y Lógica de Simulación
 * Organizador de Pastoral 2.0 - Desarrollado por Manuel Guia
 */

document.addEventListener('DOMContentLoaded', () => {
  initThreeJSScene();
  initMockupTabs();
  initSongTransposerDemo();
  initPrayerGeneratorDemo();
  initPaletteSwitcher();
  initThemeToggle();
  initMobileMenu();
});

// ========================================================
// 1. ESCENA 3D CON THREE.JS (WebGL Canvas)
// ========================================================

let scene, camera, renderer;
let centralGroup, particlesMesh;
let primaryPointLight, secondaryPointLight, ambientLight;
let currentModelType = 'cross';
let activeColorHex = '#f59e0b';
let isDragging = false;
let prevMousePos = { x: 0, y: 0 };
let rotationVelocity = { x: 0.003, y: 0.006 };

function initThreeJSScene() {
  const container = document.getElementById('webgl-container');
  if (!container || typeof THREE === 'undefined') return;

  // 1. Escena y Niebla Atmosférica
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x090d16, 0.0016);

  // 2. Cámara
  camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 0, 36);

  // 3. Renderer
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  container.appendChild(renderer.domElement);

  // 4. Luces Dinámicas
  ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  primaryPointLight = new THREE.PointLight(new THREE.Color(activeColorHex), 3.5, 90);
  primaryPointLight.position.set(16, 18, 22);
  scene.add(primaryPointLight);

  secondaryPointLight = new THREE.PointLight(0x38bdf8, 2.0, 80);
  secondaryPointLight.position.set(-18, -14, 18);
  scene.add(secondaryPointLight);

  // 5. Grupo Central del Modelo
  centralGroup = new THREE.Group();
  scene.add(centralGroup);

  build3DModel(currentModelType);

  // 6. Campo de Partículas Estelares (1,200 estrellas)
  initParticlesField();

  // 7. Eventos de Ratón (Arrastrar para rotar & Parallax)
  initMouseInteractions(container);

  // 8. Bucle de Animación
  let clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const elapsedTime = clock.getElapsedTime();

    // Rotación suave del modelo
    if (!isDragging) {
      centralGroup.rotation.y += rotationVelocity.y;
      centralGroup.rotation.x += rotationVelocity.x * 0.5;
      // Damping gradual
      rotationVelocity.x *= 0.98;
      rotationVelocity.y = rotationVelocity.y * 0.98 + 0.004 * 0.02;
    }

    // Ondulación y movimiento de anillos orbitales si existen
    const ring1 = centralGroup.getObjectByName('orbitRing1');
    const ring2 = centralGroup.getObjectByName('orbitRing2');
    if (ring1) ring1.rotation.z += 0.012;
    if (ring2) ring2.rotation.y += 0.008;

    // Levitar suavemente arriba y abajo
    centralGroup.position.y = Math.sin(elapsedTime * 1.5) * 0.8;

    // Rotación del campo de partículas estelares
    if (particlesMesh) {
      particlesMesh.rotation.y = elapsedTime * 0.02;
      particlesMesh.rotation.x = Math.sin(elapsedTime * 0.01) * 0.05;
    }

    renderer.render(scene, camera);
  }

  animate();

  // 9. Redimensionado de Ventana
  window.addEventListener('resize', onWindowResize);
}

/** Construye los diferentes modelos 3D según el modo */
function build3DModel(type) {
  // Limpiar geometrías previas
  while (centralGroup.children.length > 0) {
    const obj = centralGroup.children[0];
    centralGroup.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
      else obj.material.dispose();
    }
  }

  const primaryColor = new THREE.Color(activeColorHex);

  const goldMat = new THREE.MeshStandardMaterial({
    color: primaryColor,
    metalness: 0.85,
    roughness: 0.22,
    emissive: primaryColor,
    emissiveIntensity: 0.15
  });

  const coreWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.95,
    roughness: 0.1,
    emissive: 0xffffff,
    emissiveIntensity: 0.35
  });

  const ringMat = new THREE.MeshBasicMaterial({
    color: primaryColor,
    transparent: true,
    opacity: 0.45,
    wireframe: true
  });

  if (type === 'cross') {
    // ✝️ MODELO: CRUZ DOMINICANA ESTILIZADA
    // Brazo Vertical
    const vertGeo = new THREE.BoxGeometry(2.2, 16, 2.2);
    const vertMesh = new THREE.Mesh(vertGeo, goldMat);
    centralGroup.add(vertMesh);

    // Brazo Horizontal
    const horizGeo = new THREE.BoxGeometry(11.5, 2.2, 2.2);
    const horizMesh = new THREE.Mesh(horizGeo, goldMat);
    horizMesh.position.y = 3.2;
    centralGroup.add(horizMesh);

    // Núcleo Octaédrico de Luz en la intersección
    const coreGeo = new THREE.OctahedronGeometry(2.6, 0);
    const coreMesh = new THREE.Mesh(coreGeo, coreWhiteMat);
    coreMesh.position.y = 3.2;
    centralGroup.add(coreMesh);

    // Anillo Orbital 1 (Gimbal Exterior)
    const ring1Geo = new THREE.TorusGeometry(9.5, 0.09, 16, 80);
    const ring1 = new THREE.Mesh(ring1Geo, ringMat);
    ring1.name = 'orbitRing1';
    ring1.position.y = 3.2;
    ring1.rotation.x = Math.PI / 3;
    centralGroup.add(ring1);

    // Anillo Orbital 2 (Gimbal Interior)
    const ring2Geo = new THREE.TorusGeometry(7.2, 0.07, 16, 70);
    const ring2 = new THREE.Mesh(ring2Geo, ringMat);
    ring2.name = 'orbitRing2';
    ring2.position.y = 3.2;
    ring2.rotation.y = Math.PI / 4;
    centralGroup.add(ring2);

    // Pequeñas esferas satélites orbitando
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const satGeo = new THREE.SphereGeometry(0.5, 16, 16);
      const satMesh = new THREE.Mesh(satGeo, coreWhiteMat);
      satMesh.position.set(Math.cos(angle) * 9.5, 3.2, Math.sin(angle) * 9.5);
      ring1.add(satMesh);
    }

  } else if (type === 'star') {
    // ⭐ MODELO: ESTRELLA VERITAS DOMINICANA (8 Puntas)
    const starGeo = new THREE.IcosahedronGeometry(6.5, 0);
    const starMesh = new THREE.Mesh(starGeo, goldMat);
    centralGroup.add(starMesh);

    const innerCoreGeo = new THREE.OctahedronGeometry(3.5, 0);
    const innerMesh = new THREE.Mesh(innerCoreGeo, coreWhiteMat);
    centralGroup.add(innerMesh);

    const ringGeo = new THREE.TorusGeometry(10.5, 0.12, 16, 100);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.name = 'orbitRing1';
    ring.rotation.x = Math.PI / 2.5;
    centralGroup.add(ring);

  } else if (type === 'codex') {
    // 📖 MODELO: CÓDICE LITÚRGICO BÍBLICO 3D
    const bookGroup = new THREE.Group();

    // Cubierta del Libro (Cuero y Oro)
    const coverGeo = new THREE.BoxGeometry(9, 12, 2.8);
    const coverMesh = new THREE.Mesh(coverGeo, goldMat);
    bookGroup.add(coverMesh);

    // Bloque de Páginas Interiores (Blanco Marfil)
    const pagesGeo = new THREE.BoxGeometry(8.2, 11.2, 2.4);
    const pagesMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.6 });
    const pagesMesh = new THREE.Mesh(pagesGeo, pagesMat);
    pagesMesh.position.x = 0.5;
    bookGroup.add(pagesMesh);

    // Cruz grabada en la portada
    const crossVGeo = new THREE.BoxGeometry(0.8, 6, 0.4);
    const crossVMesh = new THREE.Mesh(crossVGeo, coreWhiteMat);
    crossVMesh.position.set(0.5, 0, 1.5);
    bookGroup.add(crossVMesh);

    const crossHGeo = new THREE.BoxGeometry(4, 0.8, 0.4);
    const crossHMesh = new THREE.Mesh(crossHGeo, coreWhiteMat);
    crossHMesh.position.set(0.5, 1.2, 1.5);
    bookGroup.add(crossHMesh);

    bookGroup.rotation.y = -Math.PI / 6;
    bookGroup.rotation.x = Math.PI / 10;
    centralGroup.add(bookGroup);
  }
}

/** Crea el campo de partículas envolventes */
function initParticlesField() {
  const count = 1200;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  const baseCol = new THREE.Color(activeColorHex);

  for (let i = 0; i < count * 3; i += 3) {
    positions[i] = (Math.random() - 0.5) * 160;
    positions[i + 1] = (Math.random() - 0.5) * 160;
    positions[i + 2] = (Math.random() - 0.5) * 120;

    const mix = Math.random();
    if (mix > 0.6) {
      colors[i] = baseCol.r;
      colors[i + 1] = baseCol.g;
      colors[i + 2] = baseCol.b;
    } else {
      colors[i] = 0.95;
      colors[i + 1] = 0.95;
      colors[i + 2] = 0.98;
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.55,
    vertexColors: true,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending
  });

  particlesMesh = new THREE.Points(geometry, mat);
  scene.add(particlesMesh);
}

/** Interacciones del ratón (Arrastrar en 3D y Parallax sutil) */
function initMouseInteractions(container) {
  let targetCamX = 0;
  let targetCamY = 0;

  // Parallax suave al mover el ratón
  window.addEventListener('mousemove', (e) => {
    const normX = (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2);
    const normY = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);

    targetCamX = normX * 4;
    targetCamY = -normY * 3;

    camera.position.x += (targetCamX - camera.position.x) * 0.05;
    camera.position.y += (targetCamY - camera.position.y) * 0.05;
    camera.lookAt(0, 0, 0);

    // Mover luz primaria con el cursor
    primaryPointLight.position.x = 16 + normX * 10;
    primaryPointLight.position.y = 18 - normY * 10;
  });

  // Arrastrar libremente el objeto 3D con el ratón o pantalla táctil
  window.addEventListener('mousedown', (e) => {
    // Si hace clic en un botón interactivo, no activar drag del 3D
    if (e.target.closest('button, a, input, select, .mockup-window-header')) return;
    isDragging = true;
    prevMousePos = { x: e.clientX, y: e.clientY };
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - prevMousePos.x;
    const deltaY = e.clientY - prevMousePos.y;

    rotationVelocity.y = deltaX * 0.008;
    rotationVelocity.x = deltaY * 0.008;

    centralGroup.rotation.y += rotationVelocity.y;
    centralGroup.rotation.x += rotationVelocity.x;

    prevMousePos = { x: e.clientX, y: e.clientY };
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // Botones de cambio de modelo 3D
  document.querySelectorAll('.btn-3d-mode').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-3d-mode').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentModelType = btn.dataset.model;
      build3DModel(currentModelType);
    });
  });
}

function onWindowResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ========================================================
// 2. SIMULACIÓN DE PESTAÑAS DEL SOFTWARE (MOCKUP)
// ========================================================

function initMockupTabs() {
  const tabButtons = document.querySelectorAll('.mockup-tab-btn');
  const tabPanels = document.querySelectorAll('.mockup-tab-panel');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetId = `tab-${btn.dataset.tab}`;
      const panel = document.getElementById(targetId);
      if (panel) panel.classList.add('active');
    });
  });
}

// ========================================================
// 3. DEMO INTERACTIVA DEL TRANSPORTADOR DE ACORDES
// ========================================================

const NOTES_SCALE = ['Do', 'Do#', 'Re', 'Mib', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'Sib', 'Si'];
const SONG_CHORDS_BASE = [
  { original: 'Do', type: '' },
  { original: 'Sol', type: '' },
  { original: 'Lam', type: 'm' },
  { original: 'Fa', type: '' },
  { original: 'Rem', type: 'm' }
];

let transposeShift = 0;

function initSongTransposerDemo() {
  const btnUp = document.getElementById('btn-demo-transpose-up');
  const btnDown = document.getElementById('btn-demo-transpose-down');
  const keyLabel = document.getElementById('demo-current-key');

  if (!btnUp || !btnDown || !keyLabel) return;

  function updateChords() {
    const baseIndex = 0; // 'Do'
    const newIndex = (baseIndex + transposeShift + 24) % 12;
    keyLabel.textContent = `${NOTES_SCALE[newIndex]} Mayor`;

    document.querySelectorAll('#demo-chord-sheet .chord').forEach(chordEl => {
      const baseNote = chordEl.dataset.chord;
      let noteRoot = 'C';
      let suffix = '';

      if (baseNote === 'C') { noteRoot = 'Do'; }
      else if (baseNote === 'G') { noteRoot = 'Sol'; }
      else if (baseNote === 'Am') { noteRoot = 'La'; suffix = 'm'; }
      else if (baseNote === 'F') { noteRoot = 'Fa'; }
      else if (baseNote === 'Dm') { noteRoot = 'Re'; suffix = 'm'; }

      const idx = NOTES_SCALE.indexOf(noteRoot);
      if (idx !== -1) {
        const shiftedIdx = (idx + transposeShift + 24) % 12;
        chordEl.textContent = NOTES_SCALE[shiftedIdx] + suffix;
        chordEl.style.transform = 'scale(1.15)';
        setTimeout(() => { chordEl.style.transform = 'scale(1)'; }, 150);
      }
    });
  }

  btnUp.addEventListener('click', () => {
    transposeShift++;
    updateChords();
  });

  btnDown.addEventListener('click', () => {
    transposeShift--;
    updateChords();
  });
}

// ========================================================
// 4. DEMO INTERACTIVA DE GENERACIÓN DE ORACIÓN CON IA
// ========================================================

const SAMPLE_PRAYERS = [
  "Señor Jesús, Luz y Verdad del mundo: al comenzar esta jornada escolar, concédenos la valentía de ser tus testigos ante nuestros alumnos y familias. Que la gracia del Espíritu Santo ilumine nuestras palabras para enseñar con sabiduría y guiar con caridad. Por la intercesión de Santo Domingo de Guzmán, Amén.",
  "Padre Bueno y Creador: ponemos en tus manos a cada uno de nuestros niños y jóvenes. Inspira en nuestros profesores la paciencia de Jesús Maestro, para que no solo transmitan conocimientos, sino que siembren esperanza y santidad en cada aula. Por Cristo nuestro Señor. Amén.",
  "Espíritu Santo Consolador: sopla con fuerza sobre nuestro consejo pastoral. Concédenos el don del discernimiento para escuchar las necesidades de los más necesitados y organizar actividades que unan a nuestras familias en la fe y la fraternidad dominicana. Amén."
];

let prayerIndex = 0;

function initPrayerGeneratorDemo() {
  const btn = document.getElementById('btn-demo-generate-prayer');
  const prayerText = document.getElementById('demo-prayer-text');
  if (!btn || !prayerText) return;

  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳ Generando con Gemini...</span>';
    prayerText.style.opacity = '0.3';

    setTimeout(() => {
      prayerIndex = (prayerIndex + 1) % SAMPLE_PRAYERS.length;
      prayerText.textContent = `"${SAMPLE_PRAYERS[prayerIndex]}"`;
      prayerText.style.opacity = '1';
      btn.disabled = false;
      btn.innerHTML = '<span>⚡ Regenerar Oración</span>';
    }, 600);
  });
}

/** Permite que los chips de sugerencia cambien el demo de la IA */
window.setDemoPrompt = function(type) {
  const userBubble = document.querySelector('.chat-bubble.bubble-user');
  const assistantBubble = document.querySelector('.chat-bubble.bubble-assistant');
  if (!userBubble || !assistantBubble) return;

  if (type === 'guion') {
    userBubble.textContent = '"Genera las preces y monición de entrada para la Misa de Confirmación con el Obispo."';
    assistantBubble.innerHTML = `
      <p><strong>Monición de Entrada:</strong> Hermanos, hoy nuestra comunidad se viste de fiesta. El Espíritu Santo descenderá sobre estos jóvenes con la plenitud de sus siete dones...</p>
      <p><strong>Oración de los Fieles:</strong> Por el Santo Padre y nuestro Obispo, para que continúen guiando a la Iglesia con fidelidad y valentía apostólica. <em>Roguemos al Señor.</em></p>
    `;
  } else if (type === 'retiro') {
    userBubble.textContent = '"Diseña un cronograma para un Retiro de Jóvenes de 4° Medio enfocado en Proyecto de Vida."';
    assistantBubble.innerHTML = `
      <p><strong>Cronograma sugerido: "Caminantes en la Verdad"</strong></p>
      <p>• <strong>09:00:</strong> Acogida, dinámicas de confianza y oración inicial.<br>
      • <strong>10:30:</strong> Taller personal: "¿Quién soy y hacia dónde Dios me llama?"<br>
      • <strong>12:00:</strong> Adoración al Santísimo Sacramento con confesiones.<br>
      • <strong>15:00:</strong> Compartir fraterno y Misa de clausura con los padres.</p>
    `;
  } else if (type === 'homilia') {
    userBubble.textContent = '"Dinámica pastoral sobre la parábola del Sembrador para alumnos de 7° básico."';
    assistantBubble.innerHTML = `
      <p><strong>Dinámica: "Los Cuatro Tipos de Tierra"</strong></p>
      <p>Se divide el curso en cuatro estaciones prácticas: Tierra del Camino (distracciones del celular), Pedregal (entusiasmo sin raíces), Espinos (presión social) y Buena Tierra (escucha activa y solidaridad). Cada grupo elabora un compromiso para regar su propia tierra.</p>
    `;
  }
};

// ========================================================
// 5. SELECTOR DE PALETA DE COLOR DINÁMICO EN LA WEB
// ========================================================

function initPaletteSwitcher() {
  const dotButtons = document.querySelectorAll('.palette-dot-btn');

  dotButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      dotButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const hex = btn.dataset.color;
      activeColorHex = hex;

      // Actualizar variables CSS de la página
      document.documentElement.style.setProperty('--primary', hex);
      document.documentElement.style.setProperty('--primary-glow', `${hex}55`);

      // Actualizar luces y materiales 3D en Three.js
      if (primaryPointLight) {
        primaryPointLight.color.set(hex);
      }
      build3DModel(currentModelType);
    });
  });
}

// ========================================================
// 6. TOGGLE DE MODO CLARO / OSCURO EN LA WEB
// ========================================================

function initThemeToggle() {
  const toggleBtn = document.getElementById('web-theme-toggle');
  if (!toggleBtn) return;

  const iconSpan = toggleBtn.querySelector('.theme-toggle-icon');

  toggleBtn.addEventListener('click', () => {
    const isDark = document.body.classList.contains('theme-dark');
    if (isDark) {
      document.body.classList.remove('theme-dark');
      document.body.classList.add('theme-light');
      iconSpan.textContent = '🌙';
      if (scene) scene.fog.color.set(0xf8fafc);
      if (ambientLight) ambientLight.intensity = 0.9;
    } else {
      document.body.classList.remove('theme-light');
      document.body.classList.add('theme-dark');
      iconSpan.textContent = '☀️';
      if (scene) scene.fog.color.set(0x090d16);
      if (ambientLight) ambientLight.intensity = 0.6;
    }
  });
}

// ========================================================
// 7. MENÚ MÓVIL HAMBURGUESA
// ========================================================

function initMobileMenu() {
  const toggleBtn = document.getElementById('mobile-menu-toggle');
  const navLinks = document.getElementById('nav-links');
  if (!toggleBtn || !navLinks) return;

  toggleBtn.addEventListener('click', () => {
    navLinks.classList.toggle('mobile-open');
  });

  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('mobile-open');
    });
  });
}
