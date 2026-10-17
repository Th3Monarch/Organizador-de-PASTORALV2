# Landing Page Web 3D — Organizador de Pastoral 2.0 ✝️

Página web informativa 3D oficial para el **Organizador de Pastoral 2.0**, diseñada con **HTML5, CSS3 moderno, JavaScript Vanilla y Three.js (WebGL)**, lista para desplegar en **Vercel** y **GitHub Pages**.

**Autor:** Manuel Guia  
**Licencia:** MIT  

---

## 🚀 Despliegue en Vercel (Recomendado)

### Opción A: Despliegue automático desde GitHub (1 Clic)
1. Sube este repositorio a tu cuenta de **GitHub**.
2. Ve a [vercel.com](https://vercel.com/) e inicia sesión con tu cuenta de GitHub.
3. Haz clic en **"Add New..."** > **"Project"**.
4. Selecciona el repositorio `Organizador de Pastoral 2.0V`.
5. En la configuración del proyecto:
   - **Root Directory:** déjalo por defecto (el archivo `vercel.json` en la raíz ya redirige automáticamente a `web/`) o escribe `web`.
   - **Framework Preset:** `Other`.
6. Haz clic en **"Deploy"**. En 15 segundos tu página 3D estará en línea con HTTPS y CDN global.

### Opción B: Despliegue con Vercel CLI
Desde la terminal en esta carpeta:
```bash
npm i -g vercel
vercel
```

---

## 🌟 Características de la Web

- ✝️ **Experiencia 3D Interactiva con Three.js:** Cruz Dominicana, Códice Litúrgico y Estrella Veritas con física de arrastre, órbita y 1.200 partículas estelares.
- 🎨 **Selector de Paleta de Color en Vivo:** 7 paletas litúrgicas (Ámbar, Azul Mariano, Rojo Pentecostés, Verde Esperanza, Morado Cuaresmal, etc.) que alteran en tiempo real la iluminación 3D y el diseño web.
- ☀️/🌙 **Modo Claro (Pastel) y Modo Oscuro (Vibrante):** Alternador de tema en vivo.
- 📱 **Simulador Interactivo de la Aplicación (Mockup Frame):**
  - Demostración del Evangelio del día con generador de oraciones por IA.
  - Cantoral con transportador de acordes interactivo (+1 / -1 semitonos).
  - Guiones litúrgicos de misa con lectura y peticiones.
  - Calendario litúrgico y cálculo astronómico perpetuo de la Pascua (Meeus/Butcher).
  - Gestor de tareas con filtros de prioridad.
  - Editor y previsualizador de Markdown.
- 💎 **Diseño Glassmorphic & 100% Responsivo:** Compatible con pantallas de escritorio, tablets y teléfonos móviles.
- ⚡ **Cero Dependencias de Compilación:** No requiere Webpack, Vite ni Node.js en producción; corre nativamente en cualquier navegador.
