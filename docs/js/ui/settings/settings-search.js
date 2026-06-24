/**
 * Settings Search (#103)
 *
 * A single search box at the top of the Settings panel that filters the entire
 * settings surface — toggle/slider labels AND the help accordions (voice commands,
 * save/restore help, etc.) — so help is discoverable by keyword without a separate
 * help system. Standard "search settings" pattern (macOS/Windows/Chrome settings).
 *
 * Behavior:
 *  - Typing filters atomic rows (.setting-item, help <li>, opaque sub-sections) by an
 *    AND-of-terms substring match over their text.
 *  - A section whose header matches reveals all its rows.
 *  - Sections with no visible row (and no header match) are hidden; visible ones auto-expand.
 *  - Clearing the box restores the default collapsed accordion view.
 *
 * All matching is offline and DOM-only — no data model, reusing existing help content.
 */

const HIDDEN = 'search-hidden';   // display:none (settings.css)
const HIT = 'search-hit';         // subtle highlight on a directly-matched row
const ACTIVE = 'settings-search-active';

/** A row is eligible only if it isn't context-hidden (welcome-only/game-only items set
 *  inline display:none; collapsed sections only clip via max-height, so those stay eligible). */
function isEligible(el) {
  return el.offsetParent !== null;
}

function makeMatcher(query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return (text) => {
    if (!terms.length) return false;
    const low = text.toLowerCase();
    return terms.every(t => low.includes(t));
  };
}

/** Immediate header text of a collapsible section. */
function headerText(section) {
  const h = section.querySelector(':scope > .section-header');
  return h ? h.textContent : '';
}

export function initSettingsSearch() {
  const input = document.getElementById('settingsSearch');
  const content = document.querySelector('.settings-content');
  const noResults = document.getElementById('settingsNoResults');
  if (!input || !content) return;

  const allSections = () => [...content.querySelectorAll('.settings-section.collapsible')];
  // Opaque sub-sections (no setting-item / help <li> inside) are matched as a single unit.
  const opaqueSections = () => allSections().filter(s => !s.querySelector('.setting-item, .help-content li'));

  function clearSearch() {
    content.classList.remove(ACTIVE);
    content.querySelectorAll('.' + HIDDEN).forEach(el => el.classList.remove(HIDDEN));
    content.querySelectorAll('.' + HIT).forEach(el => el.classList.remove(HIT));
    // Restore default: every collapsible section collapsed.
    allSections().forEach(s => s.classList.add('collapsed'));
    if (noResults) noResults.hidden = true;
  }

  function applySearch(query) {
    const q = query.trim();
    if (!q) { clearSearch(); return; }

    const matches = makeMatcher(q);
    content.classList.add(ACTIVE);

    // Reset prior pass.
    content.querySelectorAll('.' + HIDDEN).forEach(el => el.classList.remove(HIDDEN));
    content.querySelectorAll('.' + HIT).forEach(el => el.classList.remove(HIT));

    const opaque = opaqueSections();
    // Atomic rows: individual settings, help commands, and opaque sub-sections as whole units.
    const atomicRows = [
      ...content.querySelectorAll('.setting-item'),
      ...content.querySelectorAll('.help-content li'),
      ...opaque,
    ];

    // 1. Row-level visibility by own text (skip context-hidden rows entirely).
    atomicRows.forEach(row => {
      const hit = isEligible(row) && matches(row.textContent);
      row.classList.toggle(HIDDEN, !hit);
      if (hit) row.classList.add(HIT);
    });

    // 2. Header match reveals every row inside that section.
    const containers = allSections().filter(s => !opaque.includes(s));
    containers.forEach(section => {
      if (matches(headerText(section))) {
        section.querySelectorAll('.setting-item, .help-content li').forEach(r => r.classList.remove(HIDDEN));
        opaque.filter(o => section.contains(o)).forEach(o => o.classList.remove(HIDDEN));
      }
    });

    // 2b. Hide a help category (.help-section: a <strong> label + its command list) when
    //     all its commands are filtered out, so a bare category label doesn't linger.
    content.querySelectorAll('.help-section').forEach(hs => {
      const hasVisible = hs.querySelector('li:not(.' + HIDDEN + ')');
      hs.classList.toggle(HIDDEN, !hasVisible);
    });

    // 3. Container visibility: visible if header matches or it holds any visible row. A
    //    parent with a visible descendant row is automatically visible (querySelector is deep),
    //    so nested sections resolve correctly without an explicit bottom-up pass.
    containers.forEach(section => {
      const hasVisibleRow =
        section.querySelector('.setting-item:not(.' + HIDDEN + '), .help-content li:not(.' + HIDDEN + ')') ||
        opaque.some(o => section.contains(o) && !o.classList.contains(HIDDEN));
      const visible = matches(headerText(section)) || !!hasVisibleRow;
      section.classList.toggle(HIDDEN, !visible);
      if (visible) section.classList.remove('collapsed');
    });

    // 4. Empty state.
    const anyVisible = containers.some(s => !s.classList.contains(HIDDEN));
    if (noResults) noResults.hidden = anyVisible;
  }

  input.addEventListener('input', () => applySearch(input.value));
  // 'search' event fires on the native clear (×) button.
  input.addEventListener('search', () => applySearch(input.value));
}
