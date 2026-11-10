// electron-builder drops node_modules folders from extraResources, so the
// bundled editor (server + its node_modules) is copied in after packing.
const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName, packager } = context;
  const resourcesDir =
    electronPlatformName === 'darwin' || electronPlatformName === 'mas'
      ? path.join(appOutDir, `${packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
      : path.join(appOutDir, 'resources');
  const src = path.join(__dirname, '..', 'resources', 'editor');
  const dest = path.join(resourcesDir, 'editor');
  if (!fs.existsSync(path.join(src, 'node_modules'))) {
    throw new Error(`${src} is incomplete. Run "node scripts/prepare-resources.mjs" first.`);
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  if (!fs.existsSync(path.join(dest, 'node_modules', '@nestjs', 'core'))) {
    throw new Error('Bundled editor is missing its dependencies after copy.');
  }
  console.log(`  • copied bundled editor to ${dest}`);
};
