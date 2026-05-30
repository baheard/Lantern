# Scripts

## feedback-to-github.gs — Feedback → GitHub Issues Pipeline

Converts IFTalk in-app feedback form submissions into GitHub Issues and deletes processed rows from the Google Sheet.

### One-Time Setup

#### 1. Add Version field to the Google Form

Open the [Google Form](https://docs.google.com/forms/d/1FAIpQLSfdB2XXAsBC7D-aMb6z0NbquRy29VV6Qlx_soZ54EvPBwjMEA/edit) and add a **Short answer** field labelled `Version`. It will be auto-populated by the app.

After adding it, get its entry ID:
1. Preview the form
2. Right-click the Version field → Inspect
3. Find the `name="entry.XXXXXXXXXX"` attribute
4. Copy that ID into `docs/js/features/feedback.js` → `FIELD_VERSION`

#### 2. Open the linked Google Sheet

From the Form editor: Responses tab → View in Sheets.

#### 3. Open Apps Script

Extensions → Apps Script → paste the contents of `feedback-to-github.gs`.

#### 4. Set your GitHub Token

- Go to [GitHub PAT settings](https://github.com/settings/tokens) → Generate new token (classic)
- Scopes needed: `repo` (for creating issues)
- In Apps Script: Project Settings (gear icon) → Script Properties → Add property:
  - Key: `GITHUB_TOKEN`
  - Value: `ghp_...your token...`

#### 5. Install the trigger

In Apps Script editor, run `installTrigger()` once (Run → Run function → installTrigger). Authorize when prompted.

#### 6. Process existing backlog

Run `processBacklog()` once to convert any rows already in the sheet.

### Column Mapping

The script expects this column order (matches the form field order):

| Column | Field |
|--------|-------|
| A | Timestamp (auto) |
| B | Game |
| C | Feedback |
| D | Device |
| E | Console Log |
| F | Game Output |
| G | Version |

If your sheet has a different order, update the `COLS` object in `feedback-to-github.gs`.

### How Labels Are Applied

| Condition | Labels |
|-----------|--------|
| Always | `feedback` |
| Text contains crash/error/broken/etc. | `feedback`, `bug` |
| Text contains suggestion/feature/idea/etc. | `feedback`, `enhancement` |

### Error Handling

If the GitHub API returns an error, the row is **not deleted** — it stays in the sheet for manual review. Check Apps Script execution logs (Executions tab) for details.
