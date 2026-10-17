/**
 * markdown.js
 * Renderizador de Markdown completo, seguro y nativo para Organizador Pastoral.
 * Especializado en procesar las respuestas estructuradas de Google Gemini y OpenRouter:
 * - Encabezados jerárquicos (# a ######)
 * - Listas ordenadas, viñetas, checklists (- [ ] y - [x]) y anidadas
 * - Tablas completas con alineación de columnas (:---, :---:, ---:)
 * - Bloques de código pre/code con detección de lenguaje y botón "Copiar"
 * - Bloques de reflexión/pensamiento (<thought> o :::thought)
 * - Citas litúrgicas y bíblicas en bloque (> ...)
 * - Formato en línea: **negritas**, *cursivas*, ***ambas***, ~~tachado~~, `código`
 * - Enlaces seguros y autolinks
 * Sin dependencias npm de runtime.
 * Autor: Manuel Guia
 */

(function (global) {
  'use strict';

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const MarkdownRenderer = {
    /**
     * Renderiza texto Markdown a HTML seguro y estructurado.
     * @param {string} md Texto Markdown
     * @param {Object} [options] Opciones opcionales { interactiveCheckboxes: boolean }
     */
    render(md, options = {}) {
      if (!md || typeof md !== 'string') return '';

      const opts = Object.assign({ interactiveCheckboxes: false, _taskCounter: 0 }, options);

      // Normalizar saltos de línea
      let text = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

      // 1. Extraer bloques de reflexión interna (<thought>...</thought> o <think>...</think>)
      text = text.replace(/<(?:thought|think)>([\s\S]*?)(?:<\/(?:thought|think)>|$)/gi, (match, thought) => {
        return `\n\n:::thought\n${thought.trim()}\n:::\n\n`;
      });

      // 2. Extraer bloques de código cercados ```lang ... ```
      const codeBlocks = [];
      text = text.replace(/```([a-zA-Z0-9_\-\.\+]*)\n?([\s\S]*?)(?:```|$)/g, (match, lang, code) => {
        const idx = codeBlocks.length;
        const cleanLang = (lang || '').trim() || 'text';
        codeBlocks.push({ lang: cleanLang, code: escapeHtml(code.trimEnd()) });
        return `\n\x1ACODEBLOCK${idx}\x1A\n`;
      });

      // 3. Extraer código inline `...`
      const inlineCodes = [];
      text = text.replace(/`([^`\n]+)`/g, (match, code) => {
        const idx = inlineCodes.length;
        inlineCodes.push(escapeHtml(code));
        return `\x1AINLINECODE${idx}\x1A`;
      });

      // 4. Procesar bloques línea por línea
      const lines = text.split('\n');
      const out = [];
      let i = 0;

      while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        // Línea vacía
        if (!trimmed) {
          i++;
          continue;
        }

        // Placeholder de bloque de código
        const codeMatch = trimmed.match(/^\x1ACODEBLOCK(\d+)\x1A$/);
        if (codeMatch) {
          const block = codeBlocks[parseInt(codeMatch[1], 10)];
          if (block) {
            out.push(
              `<div class="code-block-wrapper">` +
                `<div class="code-block-header">` +
                  `<span class="code-block-lang">${escapeHtml(block.lang)}</span>` +
                  `<button type="button" class="code-copy-btn" title="Copiar código al portapapeles">` +
                    `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:middle; margin-right:4px;"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" fill="currentColor"/></svg>` +
                    `Copiar` +
                  `</button>` +
                `</div>` +
                `<pre><code class="language-${escapeHtml(block.lang)}">${block.code}</code></pre>` +
              `</div>`
            );
          }
          i++;
          continue;
        }

        // Bloque de pensamiento :::thought ... :::
        if (trimmed === ':::thought') {
          i++;
          const thoughtLines = [];
          while (i < lines.length && lines[i].trim() !== ':::') {
            thoughtLines.push(lines[i]);
            i++;
          }
          if (i < lines.length && lines[i].trim() === ':::') i++;
          out.push(
            `<details class="ai-thought-details">` +
              `<summary class="ai-thought-summary"><span>💭 Proceso de reflexión interna</span></summary>` +
              `<div class="ai-thought-content">${this.render(thoughtLines.join('\n'))}</div>` +
            `</details>`
          );
          continue;
        }

        // Regla horizontal --- o *** o ___
        if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
          out.push('<hr class="chat-hr">');
          i++;
          continue;
        }

        // Encabezados (# a ######)
        const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const hText = this.parseInline(headingMatch[2].trim());
          out.push(`<h${level} class="chat-heading chat-h${level}">${hText}</h${level}>`);
          i++;
          continue;
        }

        // Citas en bloque litúrgicas o bíblicas (> ...)
        if (/^>\s?/.test(trimmed)) {
          const quoteLines = [];
          while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
            quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
            i++;
          }
          const quoteInner = this.render(quoteLines.join('\n'));
          out.push(`<blockquote class="chat-blockquote">${quoteInner}</blockquote>`);
          continue;
        }

        // Tablas Markdown (| Header 1 | Header 2 |)
        if (trimmed.startsWith('|') && i + 1 < lines.length) {
          const nextTrimmed = lines[i + 1].trim();
          if (nextTrimmed.startsWith('|') && /\|?\s*:?-+:?\s*\|?/.test(nextTrimmed)) {
            const tableRows = [];
            while (i < lines.length && lines[i].trim().startsWith('|')) {
              let r = lines[i].trim();
              if (!r.endsWith('|')) r += ' |';
              tableRows.push(r);
              i++;
            }
            out.push(this.renderTable(tableRows));
            continue;
          }
        }

        // Listas (ordenadas, desordenadas y checklists con soporte de anidación)
        const listMatch = trimmed.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
        if (listMatch) {
          const listItems = [];
          while (i < lines.length) {
            const l = lines[i];
            const m = l.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
            if (m) {
              listItems.push({
                indent: m[1].length,
                type: /^\d+\./.test(m[2]) ? 'ol' : 'ul',
                text: m[3]
              });
              i++;
            } else if (l.trim() && listItems.length > 0 && /^\s{2,}/.test(l)) {
              // Continuación del ítem anterior
              listItems[listItems.length - 1].text += ' ' + l.trim();
              i++;
            } else {
              break;
            }
          }
          out.push(this.renderList(listItems, opts));
          continue;
        }

        // Párrafo ordinario
        const paraLines = [];
        while (i < lines.length) {
          const l = lines[i];
          const t = l.trim();
          if (!t) break;
          // Si ya tenemos líneas y la siguiente es inicio de otro bloque conocido, cortar párrafo
          if (paraLines.length > 0 && /^(#{1,6}\s+|```|:::thought|>\s?|[-*+]\s+|\d+\.\s+|\|.+\||(\*{3,}|-{3,}|_{3,})$)/.test(t)) {
            break;
          }
          paraLines.push(t);
          i++;
        }
        if (paraLines.length > 0) {
          const pContent = paraLines.map(l => this.parseInline(l)).join('<br>');
          out.push(`<p class="chat-p">${pContent}</p>`);
        }
      }

      let result = out.join('\n');

      // 5. Restaurar códigos inline
      result = result.replace(/\x1AINLINECODE(\d+)\x1A/g, (match, idx) => {
        const code = inlineCodes[parseInt(idx, 10)] || '';
        return `<code class="chat-inline-code">${code}</code>`;
      });

      return result;
    },

    /**
     * Renderiza tablas con alineación y encabezado.
     */
    renderTable(rows) {
      if (rows.length < 2) return '';
      const splitRow = (r) => r.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

      const headers = splitRow(rows[0]);
      const alignRow = splitRow(rows[1]);
      const aligns = alignRow.map(col => {
        const left = col.startsWith(':');
        const right = col.endsWith(':');
        if (left && right) return 'center';
        if (right) return 'right';
        return 'left';
      });

      let html = '<div class="chat-table-wrapper"><table class="chat-table"><thead><tr>';
      headers.forEach((h, idx) => {
        const align = aligns[idx] || 'left';
        html += `<th style="text-align:${align}">${this.parseInline(h)}</th>`;
      });
      html += '</tr></thead><tbody>';

      for (let i = 2; i < rows.length; i++) {
        const cells = splitRow(rows[i]);
        html += '<tr>';
        for (let colIdx = 0; colIdx < headers.length; colIdx++) {
          const cell = cells[colIdx] || '';
          const align = aligns[colIdx] || 'left';
          html += `<td style="text-align:${align}">${this.parseInline(cell)}</td>`;
        }
        html += '</tr>';
      }
      html += '</tbody></table></div>';
      return html;
    },

    /**
     * Renderiza listas respetando anidación de ol, ul y checklists.
     */
    renderList(items, options = {}) {
      if (!items || items.length === 0) return '';
      let html = '';
      const stack = []; // [{ type, indent }]
      const isInteractive = Boolean(options && options.interactiveCheckboxes);

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        let content = this.parseInline(it.text);

        // Soporte para checklists (- [ ] o - [x])
        if (/^\[ \]\s+/.test(content)) {
          const taskIdx = (options && typeof options._taskCounter === 'number') ? options._taskCounter++ : 0;
          if (isInteractive) {
            content = `<input type="checkbox" class="chat-checkbox note-interactive-task-cb" data-task-index="${taskIdx}"> ` + content.replace(/^\[ \]\s+/, '');
          } else {
            content = `<input type="checkbox" disabled class="chat-checkbox"> ` + content.replace(/^\[ \]\s+/, '');
          }
        } else if (/^\[[xX]\]\s+/.test(content)) {
          const taskIdx = (options && typeof options._taskCounter === 'number') ? options._taskCounter++ : 0;
          if (isInteractive) {
            content = `<input type="checkbox" checked class="chat-checkbox note-interactive-task-cb" data-task-index="${taskIdx}"> ` + content.replace(/^\[[xX]\]\s+/, '');
          } else {
            content = `<input type="checkbox" checked disabled class="chat-checkbox"> ` + content.replace(/^\[[xX]\]\s+/, '');
          }
        }

        // Cerrar niveles si la indentación actual es menor
        while (stack.length > 0 && it.indent < stack[stack.length - 1].indent) {
          const top = stack.pop();
          html += `</li></${top.type}>`;
        }

        // Si es un nuevo nivel de indentación más profundo
        if (stack.length === 0 || it.indent > stack[stack.length - 1].indent) {
          html += `<${it.type} class="chat-list chat-${it.type}"><li>${content}`;
          stack.push({ type: it.type, indent: it.indent });
        } else if (it.type !== stack[stack.length - 1].type) {
          // Mismo nivel pero diferente tipo (ul vs ol)
          const top = stack.pop();
          html += `</li></${top.type}><${it.type} class="chat-list chat-${it.type}"><li>${content}`;
          stack.push({ type: it.type, indent: it.indent });
        } else {
          // Mismo nivel y tipo
          html += `</li><li>${content}`;
        }
      }

      while (stack.length > 0) {
        const top = stack.pop();
        html += `</li></${top.type}>`;
      }

      return html;
    },

    /**
     * Procesa elementos en línea: negrita, cursiva, enlaces, etc.
     */
    parseInline(text) {
      if (!text) return '';
      let s = text;

      // Escapar etiquetas HTML crudas para seguridad
      s = s.replace(/<(?!\/?(strong|em|code|del|a|span|details|summary|div|p|br|table|thead|tbody|tr|th|td|ul|ol|li|hr|blockquote|input)[> ])/gi, '&lt;');

      // Negrita + Cursiva (*** o ___)
      s = s.replace(/(\*\*\*|___)([\s\S]+?)\1/g, '<strong><em>$2</em></strong>');

      // Negrita (** o __)
      s = s.replace(/(\*\*|__)([\s\S]+?)\1/g, '<strong>$2</strong>');

      // Cursiva (* o _)
      s = s.replace(/(^|[^\*])\*([^\*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
      s = s.replace(/(^|[^_])_([^_\n]+?)_(?!_)/g, '$1<em>$2</em>');

      // Tachado (~~)
      s = s.replace(/~~([\s\S]+?)~~/g, '<del>$1</del>');

      // Enlaces Markdown [texto](url)
      s = s.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s\)]+)\)/g, (m, label, url) => {
        return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="chat-link">${label}</a>`;
      });

      // Enlaces planos http(s)://
      s = s.replace(/(^|\s)(https?:\/\/[^\s<)]+)/g, (m, sp, url) => {
        return `${sp}<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="chat-link">${escapeHtml(url)}</a>`;
      });

      return s;
    }
  };

  /**
   * Función global para copiar el contenido de un bloque de código al portapapeles.
   */
  global.copyCodeFromBlock = function (btn) {
    if (!btn) return;
    const wrapper = btn.closest('.code-block-wrapper');
    const codeElem = wrapper ? wrapper.querySelector('pre code') : null;
    if (codeElem) {
      const text = codeElem.innerText || codeElem.textContent;
      navigator.clipboard.writeText(text).then(() => {
        const origHtml = btn.innerHTML;
        btn.innerHTML = '✓ ¡Copiado!';
        btn.style.color = '#10b981';
        setTimeout(() => {
          btn.innerHTML = origHtml;
          btn.style.color = '';
        }, 2000);
      }).catch(() => {
        btn.textContent = 'Error al copiar';
      });
    }
  };

  // Delegación de eventos para botones de copia en el documento (cumple estricto CSP sin inline onclick)
  if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.code-copy-btn');
      if (btn && typeof global.copyCodeFromBlock === 'function') {
        global.copyCodeFromBlock(btn);
      }
    });
  }

  global.MarkdownRenderer = MarkdownRenderer;
  global.renderMarkdown = function (md, options) {
    return MarkdownRenderer.render(md, options);
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MarkdownRenderer;
  }
})(typeof window !== 'undefined' ? window : global);
