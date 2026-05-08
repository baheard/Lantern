/**
 * VoxGlk Renderer
 *
 * Converts Glk update objects to frotz-style HTML for beautiful IF display.
 * Handles status line (grid windows) and main story text (buffer windows).
 */

import { escapeHtml } from '../utils/text-processing.js';

/**
 * Window types (from Glk spec)
 * Note: ifvms sends these as strings, not numbers
 */
const WINTYPE_TEXT_BUFFER = 'buffer';  // Scrolling text (main window)
const WINTYPE_TEXT_GRID = 'grid';      // Fixed grid (status line)

/**
 * Text styles (Glk styles 0-10)
 */
const STYLES = {
  0: 'normal',
  1: 'emphasized',
  2: 'preformatted',
  3: 'header',
  4: 'subheader',
  5: 'alert',
  6: 'note',
  7: 'block-quote',
  8: 'input',
  9: 'user1',
  10: 'user2'
};

/**
 * Style mapping - Glk styles to CSS class names
 */
const STYLE_TO_CLASS = {
  'normal': 'glk-normal',
  'emphasized': 'glk-emphasized',
  'preformatted': 'glk-preformatted',
  'header': 'glk-header',
  'subheader': 'glk-subheader',
  'alert': 'glk-alert',
  'note': 'glk-note',
  'block-quote': 'glk-block-quote',
  'input': 'glk-input',
  'user1': 'glk-user1',
  'user2': 'glk-user2',
  'reverse': 'reverse'  // Reverse video style hint
};

/**
 * Main rendering function
 *
 * @param {Object} updateObj - Update object from glkapi.js
 * @param {Map} persistentWindows - Persistent windows map from voxglk.js
 * @returns {Object} - { statusBarHTML, statusBarText, upperWindowHTML, upperWindowText, mainWindowHTML, plainText }
 */
export function renderUpdate(updateObj, persistentWindows) {
  let statusBarHTML = '';
  let statusBarText = '';
  let upperWindowHTML = '';
  let upperWindowText = '';
  let mainWindowHTML = '';
  let plainText = '';

  const windows = persistentWindows;

  // Process content for each window
  if (updateObj.content) {
    updateObj.content.forEach(content => {
      const window = windows.get(content.id);
      if (!window) {
        return;
      }

      if (window.type === WINTYPE_TEXT_GRID) {
        // Determine window height (number of lines)
        const height = content.lines ? content.lines.length : 0;

        if (height === 1) {
          // Single line = status bar (simple left/right text)
          const statusHTML = renderStatusBar(content);
          const plain = extractPlainText(content);

          if (statusHTML) statusBarHTML += statusHTML;
          if (plain) {
            statusBarText += plain;
            plainText += plain;
          }
        } else if (height > 1) {
          // Multi-line = upper window (grid-based for quotes, maps, etc.)
          const gridHTML = renderGridWindow(content, window);
          const plain = extractPlainText(content);

          if (gridHTML) upperWindowHTML += gridHTML;
          if (plain) {
            upperWindowText += plain;
            plainText += plain;
          }
        }
      } else if (window.type === WINTYPE_TEXT_BUFFER) {
        // Main window - generate frotz HTML
        const { html, plain } = renderBufferWindow(content);
        if (html) {
          mainWindowHTML += html;
        }
        if (plain) {
          plainText += plain;
        }
      }
    });
  }

  return {
    statusBarHTML: statusBarHTML.trim(),
    statusBarText: statusBarText.trim(),
    upperWindowHTML: upperWindowHTML.trim(),
    upperWindowText: upperWindowText.trim(),
    mainWindowHTML: mainWindowHTML.trim(),
    plainText: plainText.trim()
  };
}

/**
 * Render a buffer window (main story text) to frotz-style HTML
 *
 * @param {Object} content - Window content from update object
 * @returns {Object} - { html, plain }
 */
function renderBufferWindow(content) {
  if (!content.text || !Array.isArray(content.text)) {
    return { html: '', plain: '' };
  }

  let htmlLines = [];
  let plainText = '';

  // Process each text block
  content.text.forEach(textBlock => {
    // Empty textBlocks ({}) represent blank lines - add them!
    if (!textBlock.content || !Array.isArray(textBlock.content)) {
      // This is a blank line - add empty string (will become &nbsp; in applyFrotzStructure)
      htmlLines.push('');
      plainText += '\n';
      return;
    }

    const { html, plain, lines } = processStyledContent(textBlock.content);

    if (html) {
      htmlLines.push(...lines);
    }
    if (plain) {
      plainText += plain;
    }

    // Add line break if specified
    if (textBlock.append) {
      plainText += textBlock.append;
    }
  });

  // Format and wrap text lines
  const styledHTML = formatTextLines(htmlLines);

  return {
    html: styledHTML,
    plain: plainText
  };
}

/**
 * Process styled content runs
 *
 * @param {Array} contentArray - Array of text runs with styles
 * @returns {Object} - { html, plain, lines }
 */
function processStyledContent(contentArray) {
  let html = '';
  let plain = '';
  let lines = [];
  let currentLine = '';

  // Check if this is a flat array (style, text, style, text, ...)
  // or an array of run objects
  const isFlat = contentArray.length > 0 &&
                  typeof contentArray[0] === 'string' &&
                  contentArray.length >= 2;

  if (isFlat) {
    // Process flat array: [style1, text1, style2, text2, ...]
    for (let i = 0; i < contentArray.length; i += 2) {
      const styleName = contentArray[i] || 'normal';
      const text = contentArray[i + 1] || '';

      if (!text) continue;

      // Add to plain text (preserve ALL text including spaces for TTS)
      plain += text;

      // Get CSS class for this style
      const cssClass = STYLE_TO_CLASS[styleName] || 'glk-normal';

      // Split text by newlines to handle blank lines properly (like Parchment)
      // Each line (including empty ones) becomes a separate element
      const textLines = text.split('\n');

      for (let lineIdx = 0; lineIdx < textLines.length; lineIdx++) {
        const lineText = textLines[lineIdx];
        const escapedText = escapeHtml(lineText);

        // Filter standalone ">" prompt (waiting for input) but keep ">command" echoes
        const isStandalonePrompt = lineText.trim() === '>' || escapedText.trim() === '&gt;';

        if (isStandalonePrompt) {
        }

        // Add to current line (with white-space: pre-wrap to preserve spaces but allow wrapping)
        if (escapedText && !isStandalonePrompt) {
          // Mark input-style text to use app voice instead of narrator
          const voiceAttr = cssClass === 'glk-input' ? ' data-voice="app"' : '';
          currentLine += `<span class="${cssClass}" style="white-space: pre-wrap;"${voiceAttr}>${escapedText}</span>`;
        }

        // If this is not the last segment, we hit a newline - push current line
        if (lineIdx < textLines.length - 1) {
          // Push current line (or empty string for blank lines)
          lines.push(currentLine);
          currentLine = '';
        }
      }
    }
  } else {
    // Process array of run objects (original format)
    contentArray.forEach(run => {
      let text = '';
      let styleName = 'normal';
      let inlineStyle = '';
      let fgColor = null;
      let bgColor = null;

      // Extract text and style from different formats
      if (typeof run === 'string') {
        // Plain string
        text = run;
      } else if (Array.isArray(run) && run.length >= 2) {
        // [style, text] or [styleNum, text] format
        const styleRef = run[0];
        text = run[1] || '';

        if (typeof styleRef === 'number') {
          styleName = STYLES[styleRef] || 'normal';
        } else if (typeof styleRef === 'string') {
          styleName = styleRef.replace('style-', '');
        }
      } else if (run && typeof run === 'object') {
        // {style: N, text: 'foo', fg: '#fff', bg: '#000'} format
        text = run.text || '';

        if (run.style !== undefined) {
          styleName = STYLES[run.style] || 'normal';
        }

        fgColor = run.fg;
        bgColor = run.bg;
      }

      // Skip empty text
      if (!text) {
        return;
      }

      // Add to plain text
      plain += text;

      // Get CSS class for this style
      const cssClass = STYLE_TO_CLASS[styleName] || 'glk-normal';

      // Build inline styles for custom colors (if any)
      let customStyles = [];
      if (fgColor) {
        customStyles.push(`color: ${fgColor}`);
      }
      if (bgColor) {
        customStyles.push(`background-color: ${bgColor}`);
      }
      const customStyle = customStyles.length > 0 ? customStyles.join('; ') : '';

      // Split text by newlines to handle blank lines properly (like Parchment)
      const textLines = text.split('\n');

      for (let lineIdx = 0; lineIdx < textLines.length; lineIdx++) {
        const lineText = textLines[lineIdx];
        const escapedText = escapeHtml(lineText);

        // Filter standalone ">" prompt (waiting for input) but keep ">command" echoes
        const isStandalonePrompt = lineText.trim() === '>' || escapedText.trim() === '&gt;';

        if (isStandalonePrompt) {
        }

        // Add to HTML
        if (escapedText && !isStandalonePrompt) {
          // Mark input-style text to use app voice instead of narrator
          const voiceAttr = cssClass === 'glk-input' ? ' data-voice="app"' : '';
          if (customStyle) {
            // Custom colors override - use both class and inline style
            currentLine += `<span class="${cssClass}" style="${customStyle}"${voiceAttr}>${escapedText}</span>`;
          } else {
            // Standard style - just use class
            currentLine += `<span class="${cssClass}"${voiceAttr}>${escapedText}</span>`;
          }
        }

        // If this is not the last segment, we hit a newline - push current line
        if (lineIdx < textLines.length - 1) {
          lines.push(currentLine);
          currentLine = '';
        }
      }
    });
  }

  // Add final line
  if (currentLine) {
    lines.push(currentLine);
  }

  html = lines.join('\n');

  return { html, plain, lines };
}

/**
 * Format text lines - wrap each line in divs with proper spacing
 *
 * @param {Array} lines - Array of HTML lines
 * @returns {string} - Formatted HTML
 */
function formatTextLines(lines) {
  if (lines.length === 0) {
    return '';
  }

  const compressed = lines;

  // Wrap each line in a div element
  // Blank lines get a spacer class instead of content
  const processedLines = compressed.map(line => {
    const trimmed = line.trim();
    if (trimmed === '') {
      // Blank line - vertical spacer
      return '<div class="blank-line-spacer"></div>';
    } else {
      // Content line - regular div
      return `<div>${line}</div>`;
    }
  });

  // Join all divs together
  return processedLines.join('');
}

// Style name to code mapping (from GlkOte)
const StyleNamesToCode = {
  normal: 0,
  emphasized: 1,
  preformatted: 2,
  header: 3,
  subheader: 4,
  alert: 5,
  note: 6,
  blockquote: 7,
  input: 8,
  user1: 9,
  user2: 10
};

/**
 * Fallback status bar splitter for the adjacent-concatenation case.
 * When a Z5/Z8 game writes room name and right-side info (day/score) with no
 * space separator between them in the same glkapi property group, the 2+ space
 * split in renderStatusBar produces only 1 part. This function scans from right
 * to left looking for a known right-side keyword that starts a 2+ token phrase,
 * returning [leftText, rightText] or null if no clean split is found.
 */
function findAdjacentStatusSplit(text) {
  const rightKeywords = ['score', 'moves', 'move', 'turns', 'turn', 'day', 'night', 'morning', 'afternoon', 'evening', 'time'];
  const pattern = new RegExp(`^(${rightKeywords.join('|')})[\\s:]`, 'i');

  for (let i = text.length - 1; i >= 1; i--) {
    const candidate = text.slice(i);
    if (pattern.test(candidate)) {
      const right = candidate.trimEnd();
      // Require at least 2 whitespace-separated tokens so lone keywords at the
      // end of a room name (e.g. "The Day Room") don't trigger a false split.
      if (right.trim().split(/\s+/).length >= 2) {
        const left = text.slice(0, i).trimEnd();
        if (left) return [left, right];
      }
    }
  }
  return null;
}

/**
 * Render status bar - simple single line with left and right text
 *
 * @param {Object} content - Single-line grid window content
 * @returns {string} - HTML for status bar
 */
function renderStatusBar(content) {
  if (!content.lines || !Array.isArray(content.lines) || content.lines.length !== 1) {
    return '';
  }

  const line = content.lines[0];
  if (!line.content || !Array.isArray(line.content)) {
    return '';
  }

  // Extract all text from the line
  let fullText = '';

  // Check if this is a flat array (style, text, style, text, ...)
  const isFlat = line.content.length > 0 &&
                  typeof line.content[0] === 'string' &&
                  line.content.length >= 2;

  if (isFlat) {
    // Process flat array: [style1, text1, style2, text2, ...]
    for (let i = 1; i < line.content.length; i += 2) {
      fullText += line.content[i] || '';
    }
  } else {
    // Process array of run objects
    line.content.forEach(run => {
      if (typeof run === 'string') {
        fullText += run;
      } else if (Array.isArray(run) && run.length >= 2) {
        fullText += run[1] || '';
      } else if (run && run.text) {
        fullText += run.text;
      }
    });
  }


  // Split into parts by 2+ spaces (works when cleared-cell gaps are visible in fullText)
  let parts = fullText.split(/\s{2,}/).filter(p => p.trim());

  // Fallback: some Z5/Z8 games (e.g. Anchorhead) write room name and day/time
  // adjacently with no space separator between them in the same property group.
  // When that happens, the 2+ space split produces only 1 part. Scan from right
  // to left for a known right-side status keyword at a position where it is NOT
  // embedded inside a larger word (its left neighbor is a word char — no \b before
  // the keyword — but we split there anyway since we know it's a status marker).
  if (parts.length === 1 && parts[0]) {
    const split = findAdjacentStatusSplit(parts[0].trimEnd());
    if (split) parts = split;
  }


  if (parts.length === 0) {
    return '';
  }

  // Build HTML with appropriate classes based on number of parts
  // Use chunk-delimiter spans to create TTS pauses (hidden with CSS)
  // Comma creates shorter pause than period
  const delimiter = '<span class="chunk-delimiter">, </span>';
  let html = '<div class="status-bar-line">';

  if (parts.length === 1) {
    // Only left part
    html += `<span class="status-left">${escapeHtml(parts[0].trim())}</span>`;
  } else if (parts.length === 2) {
    // Left and right parts
    html += `<span class="status-left">${escapeHtml(parts[0].trim())}</span>`;
    html += delimiter;
    html += `<span class="status-right">${escapeHtml(parts[1].trim())}</span>`;
  } else {
    // 3+ parts: left, center(s), right
    html += `<span class="status-left">${escapeHtml(parts[0].trim())}</span>`;
    html += delimiter;
    // Middle parts get center class
    for (let i = 1; i < parts.length - 1; i++) {
      html += `<span class="status-center">${escapeHtml(parts[i].trim())}</span>`;
      html += delimiter;
    }
    html += `<span class="status-right">${escapeHtml(parts[parts.length - 1].trim())}</span>`;
  }

  html += '</div>';


  return html;
}

/**
 * Render grid window as CSS Grid HTML (for multi-line upper windows: quotes, maps, etc.)
 *
 * @param {Object} content - Grid window content from ifvms
 * @param {Object} window - Window object with type and style info
 * @returns {string} - HTML with CSS Grid layout
 */
function renderGridWindow(content, window) {
  if (!content.lines || !Array.isArray(content.lines)) {
    return '';
  }

  const lines = [];
  let maxWidth = 0;

  // Parse each line and extract styled runs with positions
  content.lines.forEach(lineObj => {
    if (!lineObj.content || !Array.isArray(lineObj.content)) {
      lines.push([]);
      return;
    }

    const runs = [];
    let currentPos = 0;

    // Check if this is a flat array (style, text, style, text, ...)
    const isFlat = lineObj.content.length > 0 &&
                    typeof lineObj.content[0] === 'string' &&
                    lineObj.content.length >= 2;

    if (isFlat) {
      // Process flat array: [style1, text1, style2, text2, ...]
      for (let i = 0; i < lineObj.content.length; i += 2) {
        const style = lineObj.content[i] || 'normal';
        const text = lineObj.content[i + 1] || '';

        if (text) {
          runs.push({
            style: style,
            text: text,
            start: currentPos,
            end: currentPos + text.length
          });
          currentPos += text.length;
        }
      }
    } else {
      // Process array of run objects
      lineObj.content.forEach((run, idx) => {
        let style = 'normal';
        let text = '';

        if (typeof run === 'string') {
          text = run;
        } else if (Array.isArray(run) && run.length >= 2) {
          style = run[0] || 'normal';
          text = run[1] || '';
        } else if (run && run.text) {
          text = run.text;
          style = run.style || 'normal';
        }

        if (text) {
          runs.push({
            style: style,
            text: text,
            start: currentPos,
            end: currentPos + text.length
          });
          currentPos += text.length;
        }
      });
    }

    lines.push(runs);
    maxWidth = Math.max(maxWidth, currentPos);
  });

  const lineCount = lines.length;
  const isSingleLine = lineCount === 1;

  let html = `<div class="grid-status ${isSingleLine ? 'single-line' : 'multiline'}">`;

  lines.forEach((runs, lineIndex) => {
    // Check if this line has any non-whitespace content
    const hasContent = runs.some(run => run.text.trim().length > 0);

    // Determine if this is part of a consecutive empty line group
    let emptyLineClass = '';
    if (!hasContent) {
      // Check previous and next lines
      const prevEmpty = lineIndex > 0 && !lines[lineIndex - 1].some(run => run.text.trim().length > 0);
      const nextEmpty = lineIndex < lines.length - 1 && !lines[lineIndex + 1].some(run => run.text.trim().length > 0);

      if (prevEmpty || nextEmpty) {
        // Part of a double/multiple line break - keep first one for paragraph spacing
        emptyLineClass = prevEmpty ? 'empty-line empty-line-continuation' : 'empty-line empty-line-first';
      } else {
        // Single line break - hide on mobile
        emptyLineClass = 'empty-line empty-line-single';
      }
    }

    const lineClasses = hasContent ? 'grid-line' : `grid-line ${emptyLineClass}`;

    html += `<div class="${lineClasses}">`;

    runs.forEach(run => {
      const styleClass = STYLE_TO_CLASS[run.style] || 'glk-normal';
      const classes = [styleClass];

      // Only apply reverse video if explicitly sent by ifvms
      // Check: 1. Run has reverse property, 2. Style is 'reverse', 3. Window stylehints specify reverse
      let shouldReverse = run.reverse || (run.style === 'reverse');

      if (!shouldReverse && window?.stylehints) {
        const styleCode = StyleNamesToCode[run.style];
        if (styleCode !== undefined && window.stylehints[styleCode]?.reverse) {
          shouldReverse = true;
        }
      }

      if (shouldReverse) {
        classes.push('reverse');
      }

      // Mark spans containing only whitespace for mobile CSS hiding
      if (run.text.trim().length === 0) {
        classes.push('whitespace-only');
      }

      html += `<span class="${classes.join(' ')}" style="grid-column: ${run.start + 1} / ${run.end + 1};">${escapeHtml(run.text)}</span>`;
    });

    html += `</div>`;
  });

  html += `</div>`;

  return html;
}

/**
 * Extract plain text from content (for TTS)
 *
 * @param {Object} content - Window content
 * @returns {string} - Plain text
 */
function extractPlainText(content) {
  // Grid windows use 'lines' array
  if (content.lines && Array.isArray(content.lines)) {
    let plain = '';
    content.lines.forEach(lineObj => {
      if (!lineObj.content || !Array.isArray(lineObj.content)) {
        return;
      }

      let lineText = '';

      // Check if this is a flat array (style, text, style, text, ...)
      const isFlat = lineObj.content.length > 0 &&
                      typeof lineObj.content[0] === 'string' &&
                      lineObj.content.length >= 2;

      if (isFlat) {
        // Process flat array: [style1, text1, style2, text2, ...]
        for (let i = 1; i < lineObj.content.length; i += 2) {
          lineText += lineObj.content[i];
        }
      } else {
        // Process array of run objects
        lineObj.content.forEach(run => {
          if (typeof run === 'string') {
            lineText += run;
          } else if (Array.isArray(run) && run.length >= 2) {
            lineText += run[1] || '';
          } else if (run && run.text) {
            lineText += run.text;
          }
        });
      }

      // Trim leading/trailing spaces from grid window lines
      // (they're used for positioning in fixed-width grids, not content)
      lineText = lineText.trim();

      if (lineText) {
        plain += lineText + '\n';
      }
    });
    return plain;
  }

  // Buffer windows use 'text' array
  if (!content.text || !Array.isArray(content.text)) {
    return '';
  }

  let plain = '';

  content.text.forEach(textBlock => {
    if (!textBlock.content || !Array.isArray(textBlock.content)) {
      return;
    }

    textBlock.content.forEach(run => {
      if (typeof run === 'string') {
        plain += run;
      } else if (Array.isArray(run) && run.length >= 2) {
        plain += run[1] || '';
      } else if (run && run.text) {
        plain += run.text;
      }
    });

    // Add line break if specified
    if (textBlock.append) {
      plain += textBlock.append;
    }
  });

  return plain;
}


/**
 * Strip HTML tags from text
 *
 * @param {string} html - HTML string
 * @returns {string} - Plain text
 */
function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}
