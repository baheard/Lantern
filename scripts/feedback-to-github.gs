/**
 * IFTalk Feedback → GitHub Issues
 *
 * Paste this entire file into Google Apps Script (script.google.com),
 * bound to the Google Sheet that collects your feedback form responses.
 *
 * SETUP (one-time):
 *  1. Open the script editor: Extensions → Apps Script
 *  2. Paste this file
 *  3. Go to Project Settings → Script Properties and add:
 *       GITHUB_TOKEN  →  your GitHub Personal Access Token
 *                        (needs repo scope: Settings → Developer settings → PAT)
 *  4. Save, then run installTrigger() once (Run → Run function → installTrigger)
 *     This creates the on-form-submit trigger automatically.
 *  5. Authorize when prompted.
 *
 * HOW IT WORKS:
 *  - On every form submission the trigger calls onFormSubmit()
 *  - The response is turned into a GitHub issue on baheard/IFTalk
 *  - That row is then deleted from the sheet so the backlog stays clean
 *  - processBacklog() can be run manually to handle any rows that were
 *    missed (e.g. if the trigger fired but GitHub was unreachable)
 *
 * COLUMN ORDER (must match your Google Sheet — adjust COLS below if needed):
 *  A: Timestamp  B: Game  C: Feedback  D: Device  E: Console  F: Output  G: Version
 */

// ── Configuration ────────────────────────────────────────────────────────────

const GITHUB_REPO  = 'baheard/IFTalk';
const GITHUB_API   = 'https://api.github.com';
const SHEET_NAME   = 'Form Responses 1';   // change if your sheet tab has a different name
const LABEL_BASE   = ['feedback'];          // always applied
const LABEL_BUG    = 'bug';
const LABEL_FEAT   = 'enhancement';

// Zero-based column indices — adjust if your sheet columns differ
const COLS = {
  timestamp : 0,  // A
  game      : 1,  // B
  feedback  : 2,  // C
  device    : 3,  // D
  console   : 4,  // E
  output    : 5,  // F
  version   : 6,  // G  (new field — see feedback.js)
};

// ── Trigger installer ─────────────────────────────────────────────────────────

/**
 * Run this once to install the form-submit trigger.
 * After that it fires automatically on every submission.
 */
function installTrigger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Remove existing triggers first (avoid duplicates if re-run)
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'onFormSubmit')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('onFormSubmit')
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();

  Logger.log('Trigger installed.');
}

// ── Main entry points ─────────────────────────────────────────────────────────

/**
 * Called automatically on each form submission.
 * @param {GoogleAppsScript.Events.SpreadsheetsOnFormSubmit} e
 */
function onFormSubmit(e) {
  const row    = e.range.getRow();
  const sheet  = e.range.getSheet();
  const values = sheet.getRange(row, 1, 1, Object.keys(COLS).length).getValues()[0];

  if (processRow(values)) {
    sheet.deleteRow(row);
  }
}

/**
 * Manually process all rows in the sheet (for backlog catch-up).
 * Run this from the Apps Script editor if the trigger was inactive.
 */
function processBacklog() {
  const sheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data   = sheet.getDataRange().getValues();
  const header = data[0];

  // Walk backwards so row deletion doesn't shift indices
  for (let i = data.length - 1; i >= 1; i--) {
    if (processRow(data[i])) {
      sheet.deleteRow(i + 1); // sheet rows are 1-based
      Utilities.sleep(500);   // stay well under GitHub's rate limit
    }
  }
}

// ── Row processor ─────────────────────────────────────────────────────────────

/**
 * Build and post a GitHub issue for one response row.
 * @param {Array} row  - Values array indexed by COLS
 * @returns {boolean}  - true if the issue was created (row should be deleted)
 */
function processRow(row) {
  const timestamp = row[COLS.timestamp];
  const game      = (row[COLS.game]     || 'None').toString().trim();
  const feedback  = (row[COLS.feedback] || '').toString().trim();
  const device    = (row[COLS.device]   || '').toString().trim();
  const consoleTxt= (row[COLS.console]  || '').toString().trim();
  const outputTxt = (row[COLS.output]   || '').toString().trim();
  const version   = (row[COLS.version]  || '').toString().trim();

  if (!feedback) return true; // empty row — delete silently

  const labels  = detectLabels(feedback);
  const title   = buildTitle(feedback, game);
  const body    = buildBody({ timestamp, game, feedback, device, consoleTxt, outputTxt, version });

  return createGithubIssue(title, body, labels);
}

// ── Label detection ───────────────────────────────────────────────────────────

const BUG_KEYWORDS  = /\b(bug|crash|broken|error|fail|wrong|glitch|freeze|stuck|doesn'?t work|not working|can'?t)\b/i;
const FEAT_KEYWORDS = /\b(would be nice|feature|suggestion|idea|request|please add|wish|could you|improve|enhancement)\b/i;

function detectLabels(text) {
  const labels = [...LABEL_BASE];
  if (BUG_KEYWORDS.test(text))  labels.push(LABEL_BUG);
  if (FEAT_KEYWORDS.test(text)) labels.push(LABEL_FEAT);
  return labels;
}

// ── Content builders ──────────────────────────────────────────────────────────

function buildTitle(feedback, game) {
  const prefix = game && game !== 'None' ? `[${game}] ` : '';
  const short  = feedback.length > 80 ? feedback.slice(0, 77) + '…' : feedback;
  return `Feedback: ${prefix}${short}`;
}

function buildBody({ timestamp, game, feedback, device, consoleTxt, outputTxt, version }) {
  const ts = timestamp ? new Date(timestamp).toISOString() : 'unknown';
  const ver = version || 'unknown';

  let md = `## User Feedback\n\n${feedback}\n\n`;
  md += `## Context\n\n`;
  md += `| Field | Value |\n|---|---|\n`;
  md += `| Submitted | ${ts} |\n`;
  md += `| Version | ${ver} |\n`;
  md += `| Game | ${game} |\n`;
  md += `| Device | ${device || 'unknown'} |\n\n`;

  if (consoleTxt) {
    md += `## Console Log\n\n\`\`\`\n${consoleTxt}\n\`\`\`\n\n`;
  }
  if (outputTxt) {
    md += `## Recent Game Output\n\n\`\`\`\n${outputTxt}\n\`\`\`\n\n`;
  }

  md += `---\n*Auto-generated from in-app feedback form*`;
  return md;
}

// ── GitHub API ────────────────────────────────────────────────────────────────

function createGithubIssue(title, body, labels) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) {
    Logger.log('ERROR: GITHUB_TOKEN script property not set.');
    return false;
  }

  const payload = JSON.stringify({ title, body, labels });

  const options = {
    method     : 'post',
    contentType: 'application/json',
    headers    : {
      Authorization: `token ${token}`,
      Accept       : 'application/vnd.github.v3+json',
      'User-Agent' : 'IFTalk-Feedback-Script',
    },
    payload    : payload,
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/issues`, options);
  const code     = response.getResponseCode();

  if (code === 201) {
    const issue = JSON.parse(response.getContentText());
    Logger.log(`Created issue #${issue.number}: ${issue.html_url}`);
    return true;
  }

  Logger.log(`GitHub API error ${code}: ${response.getContentText()}`);
  return false; // don't delete row if issue creation failed
}
