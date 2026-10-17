# Organizador Pastoral ✝️

> Organizador de escritorio para la pastoral de un colegio católico (espiritualidad dominicana), con soporte oficial para **Google Gemini**, **Login con Google** y **OpenRouter**.

**Desarrollado por:** Manuel Guia  
**Versión:** 2.1.0  
**Licencia:** MIT  

---

## 🌟 Novedades: Login con Google y Google Gemini Oficial

### 🔑 1. Login con Google (Google Sign-In / OAuth 2.0 Desktop)
- Flujo oficial recomendado por Google para aplicaciones de escritorio: **OAuth 2.0 Loopback con PKCE**.
- Permite iniciar sesión con cuentas institucionales de **Google Workspace for Education** del colegio o cuentas Gmail personales.
- Sincroniza automáticamente el nombre, correo institucional y fotografía/avatar en el sidebar y en el panel de bienvenida.
- Configuración flexible: admite el Client ID predeterminado o un Client ID propio registrado en Google Cloud Console por el colegio.
- Opción de cerrar sesión de Google en cualquier momento desde los Ajustes.

### 🤖 2. Chatbot de Google Gemini Oficial
- Integración nativa directa con la API oficial de **Google AI Studio** (`generativelanguage.googleapis.com`).
- **Modelos de última generación:**
  - `gemini-flash-latest` / `gemini-3.8-flash` (por defecto, ultrarrápido y potente con visión)
  - `gemini-3.1-flash-lite`
  - `gemini-pro-latest`
- **Streaming SSE oficial** de Google con indicador de estado en tiempo real.
- **Visión por computadora nativa:** analiza fotos de afiches, pizarrones o listas y las convierte en notas estructuradas.
- **Function Calling nativo:** el modelo de Gemini puede registrar directamente notas, eventos de calendario, tareas, grupos comunitarios y fichas de personas.
- **Selector de Proveedor Dual:** elige fácilmente entre **Google Gemini Oficial** (con clave gratuita de Google AI Studio) o **OpenRouter Cloud** (con modelos Gemma, Claude o Llama).

---

## 📋 Características Generales de la Aplicación

### 1. Panel de Inicio (Dashboard Pastoral)
- **Banner litúrgico dinámico:** Tiempo litúrgico actual (Adviento, Navidad, Cuaresma, Triduo Pascual, Pascua, Tiempo Ordinario), color litúrgico y cálculo automático de la próxima gran solemnidad.
- **Saludo contextual:** Según la hora del día (mañana, tarde, noche) personalizado con el nombre del agente pastoral o del perfil de Google.
- **Versículo del día:** Citas bíblicas y pensamientos de la espiritualidad dominicana (*Santo Domingo de Guzmán, Santo Tomás de Aquino, Santa Catalina de Siena, San Martín de Porres*).
- **Métricas e indicadores en tiempo real:** Conteo de notas, eventos próximos, tareas pendientes y directorio de comunidad.
- **Guía del Asistente IA:** Píldoras clicables para redactar oraciones, organizar retiros, agendar misas o resumir la semana escolar.

### 2. Ideas y Notas
- CRUD completo en tarjetas interactivas.
- **Plantillas pastorales predefinidas:**
  - *Reunión de Pastoral:* Oración inicial, lectura evangélica, temas y acuerdos.
  - *Ficha de Acompañamiento Personal:* Datos del estudiante, inquietudes, compromisos y próximo encuentro.
  - *Acta de Consejo Escolar:* Orden del día, deliberaciones y firmas.
  - *Planificación de Retiro Espiritual:* Lema, cronograma hora por hora, momentos de adoración y clausura.
- **Desde imagen (Visión IA):** Sube o arrastra una foto (afiche, documento, pizarra o acta manuscrita) y la IA extraerá y estructurará la nota automáticamente con Gemini o OpenRouter.
- Búsqueda en vivo y filtrado dinámico por etiquetas temáticas.
- Exportación a PDF y a archivo CSV (con codificación UTF-8).

### 3. Calendario Litúrgico y Pastoral
- **Cálculo perpetuo de Pascua:** Algoritmo nativo de *Meeus/Butcher* sin librerías externas.
- Vista mensual interactiva con indicadores de color litúrgico y categorías:
  - `Misa`, `Retiro`, `Reunión`, `Campaña`, `Formación`, `Convivencia`, `Otro`.
- Repetición periódica: eventos semanales y mensuales con fecha límite opcional.
- Exportación en formato universal **iCalendar (.ics)** para sincronizar con Google Calendar, Apple Calendar y Microsoft Outlook.
- Generación de reportes en PDF y opción de impresión directa.

### 4. Tareas Pastorales
- Checklist con filtros: *Todas*, *Pendientes* y *Completadas*.
- Prioridades visuales (*Alta*, *Media*, *Baja*).
- Fechas límite con alertas en rojo para compromisos vencidos.
- Búsqueda rápida por título y notas.

### 5. Comunidad Escolar
- Subvistas separadas para **Grupos Pastorales** y **Directorio de Personas**.
- Registro de coordinadores, misiones, roles, teléfonos y notas de acompañamiento.
- Exportación directa a PDF y tablas CSV.

### 6. Ajustes, Seguridad y Respaldos
- Gestión de sesión con Google y personalización institucional.
- Almacenamiento 100% local en `userData/pastoral-data.json` con guardado atómico (.tmp -> renombrado).
- **Copias de seguridad diarias automáticas:** En `userData/backups/pastoral-<fecha>.json` (rotación de las últimas 30 copias).
- Herramientas para crear respaldo manual, restaurar (creando copia preventiva), exportar e importar archivos `.json`.
- Notificaciones nativas de escritorio.
- **Buscador global omnipotente (`Ctrl + K` / `Cmd + K`):** Indexa notas, eventos, tareas y personas con navegación por teclado (↑, ↓, Enter, Esc).

### 7. Landing Page 3D Interactiva (Web)
- Ubicada en la carpeta `web/` lista para desplegar en **Vercel** o **GitHub Pages** con 1 solo clic.
- **Three.js WebGL 3D:** Reliquia interactiva tridimensional (Cruz Dominicana, Estrella Veritas y Códice Bíblico 3D) con física de arrastre, iluminación dinámica y campo estelar de 1.200 partículas.
- **Simulador de Software en Vivo:** Pestañas interactivas para probar el Evangelio del día con IA, el Cantoral con transportador de acordes en tiempo real, los guiones litúrgicos, el calendario perpetuo y el gestor de tareas.
- **Selector de Paleta en Tiempo Real:** 7 temas de color litúrgicos que alteran la iluminación 3D y la página web al instante.
- **Configuración de Vercel incluida:** `vercel.json` tanto en la raíz como en `web/` para despliegue sin configuración previa.

---

## 🛠️ Stack Tecnológico

- **Framework:** Electron v33
- **Proceso Principal:** Node.js (CommonJS, `http`, `https`, `crypto`, `fs`, `path`)
- **Proceso Renderer:** HTML5, CSS3 moderno con variables CSS, JavaScript Vanilla (sin frameworks ni transpiladores)
- **Seguridad:**
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - `sandbox: false`
  - CSP: `default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self';`
  - Preload seguro mediante `contextBridge` exponiendo `window.pastoral`.
- **Cero dependencias npm de runtime** (solo `electron` y `electron-builder` en devDependencies).

---

## 🚀 Instalación y Uso

### 1. Requisitos Previos
- Node.js versión 18 o superior (probado en Node.js v24).
- npm (incluido con Node.js).

### 2. Ejecución en Modo Desarrollo
```bash
npm start
```

### 3. Generación de Instaladores para Windows
Para construir los ejecutables en la carpeta `dist/`:
```bash
# Genera instalador NSIS (.exe) y versión Portable (.exe) x64:
npm run dist
```

---

*“Contemplari et contemplata aliis tradere”*  
**Organizador Pastoral** — Diseñado con dedicación para la educación y misión católica.
