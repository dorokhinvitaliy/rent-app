const { readdirSync, unlinkSync } = require('node:fs');
const { join } = require('node:path');
// Called before the API starts, when this single-container deployment has no browsers.
// Keep cookies and preferences; only process locks reference the previous container.
function prepareProfiles(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^browser-profile(?:-\d+)?$/.test(entry.name)) continue;
    for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
      try { unlinkSync(join(root, entry.name, name)); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
}
module.exports = { prepareProfiles };
if (require.main === module) prepareProfiles(process.env.DATA_DIR || '/data');
