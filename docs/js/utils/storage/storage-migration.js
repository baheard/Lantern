/**
 * One-time storage prefix migration: iftalk_ → lantern_
 * Temporary — remove after transition period once all users have upgraded.
 *
 * Runs synchronously at module load time (before any other module touches storage)
 * so it must be the first import in app.js.
 */

const MIGRATION_FLAG = 'lantern_migrated_v1';

if (!localStorage.getItem(MIGRATION_FLAG)) {
  // Construct old prefix via concat so a future bulk rename doesn't corrupt this.
  const OLD = 'if' + 'talk_';
  const NEW = 'lantern_';

  const migrate = (store) => {
    for (const key of [...Object.keys(store)]) {
      if (key.startsWith(OLD)) {
        store.setItem(NEW + key.slice(OLD.length), store.getItem(key));
        store.removeItem(key);
      }
    }
  };

  migrate(localStorage);
  migrate(sessionStorage);
  localStorage.setItem(MIGRATION_FLAG, '1');
}
