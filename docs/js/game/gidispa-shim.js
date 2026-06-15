/**
 * GiDispa Shim — minimal dispatch layer for the engine autorestore path
 *
 * The browser app historically ran WITHOUT a GiDispa (do_vm_autosave:false),
 * because the team's first attempt at the engine's whole-VM autosave crashed in
 * save_allstate → GiDispa.get_retained_array(null). That conclusion ("do_autosave
 * is incompatible with Z-machine") was wrong: save_allstate only touches GiDispa
 * to resolve a retained line/memory buffer's addr/len. This shim supplies just
 * enough dispatch bookkeeping for Glk.save_allstate()/restore_allstate() to
 * round-trip, unblocking the engine do_autosave/do_autorestore full-state path.
 *
 * Ported from the proven headless harness shim (tools/play.cjs:144-176), which
 * validates bit-exact round-trips across the game matrix (15/15, see
 * tools/_autorestore_oracle.cjs).
 *
 * For the Z-machine, the retained-array addr/arg are never read back by
 * do_autorestore — it relinks linebuf via read_data.buffer and streams by rock —
 * so synthesizing them here is safe.
 *
 * See reference/autorestore-migration-plan.md (Phase 1) and
 * .tome/save-restore-paradigm.md (GiDispa reconciliation).
 */

/**
 * Create a fresh GiDispa shim instance.
 * @returns {object} an object implementing the GiDispa methods glkapi touches.
 */
export function createGiDispaShim() {
  const byClass = { window: {}, stream: {}, fileref: {} };
  const arrInfo = new Map();
  let rockCounter = 1000;

  return {
    set_vm() {},
    init() {},
    check_autosave() { return null; },
    prepare_resume() {},
    get_vm() {},

    class_register(cls, obj, usedisprock) {
      if (usedisprock === undefined || usedisprock === null) usedisprock = rockCounter++;
      obj.disprock = usedisprock;
      byClass[cls][usedisprock] = obj;
      return usedisprock;
    },

    class_unregister(cls, obj) {
      if (obj && obj.disprock != null) delete byClass[cls][obj.disprock];
    },

    class_obj_from_id(cls, id) {
      return (id === undefined || id === null) ? null : (byClass[cls][id] || null);
    },

    class_id_from_obj(cls, obj) {
      return obj ? obj.disprock : null;
    },

    retain_array(arr, info) {
      arrInfo.set(arr, info || { addr: 0, len: (arr && arr.length) || 0 });
    },

    unretain_array(arr) {
      arrInfo.delete(arr);
    },

    get_retained_array(arr) {
      const info = arrInfo.get(arr) || {};
      return {
        addr: info.addr || 0,
        len: (info.len != null ? info.len : (arr ? arr.length : 0)),
        arr: arr,
        arg: { serialize() { return null; } },
      };
    },
  };
}
