# go-to snapshot injection is poisoned by the service-worker cache

**Symptom:** You rebuild a `go-to` snapshot (`jump-to.cjs … --name go-to`, overwriting
`docs/assets/<game>-go-to.snapshot.json`), paste/run the injection one-liner in the browser,
reload — and the game lands at the *previous* go-to target, not the new one. Re-running the
build and re-injecting changes nothing.

**Cause:** The injection one-liner does `fetch('/assets/<game>-go-to.snapshot.json')`. The PWA
service worker caches that asset path. After the first build, the SW serves the **stale** cached
snapshot forever, so every subsequent injection writes the OLD VM state into the autosave slot.
The boot `do_autorestore` then faithfully restores the stale state. Confirmed empirically: a
plain `fetch()` returned a 152769-char body while `fetch(url+'?bust='+rand,{cache:'no-store'})`
returned 152976 chars for the same file on disk.

**Fix when injecting by hand:** always cache-bust the fetch —
`fetch('/assets/<game>-go-to.snapshot.json?bust='+Math.random(),{cache:'no-store'})`.

**Two other confounders that masquerade as the same failure** (rule these out too):
- **Drive save-conflict.** If per-game autosync is on (`lantern_gdrive_autosync_<game>` = "true"),
  boot may surface a "Save Conflict" dialog and the Drive copy (the user's real, higher-move save)
  can win over the injected move-0 local save. Temporarily set that key to "false" for a clean
  test, then restore it.
- **Autosave clobber.** Any turn you type after a *failed* restore auto-writes the current (wrong)
  VM state back over the autosave slot, so the slot's length changes and it looks like your
  injection "didn't stick." Verify location BEFORE typing a turn (status bar / journey), not after.

**Durable engine fix (recommended):** have `tools/jump-to.cjs` emit the cache-busting form in the
one-liner it prints, and have the go-to skill's step-3 injection use `{cache:'no-store'}`. Until
then this bites on every second go-to to the same game.

See also [[headless-replay-harness]], [[bootstrap-restore-flow]].
