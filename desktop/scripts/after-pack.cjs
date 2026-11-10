// The packed editor (editor.asar + editor.asar.unpacked) is copied in after
// packing; electron-builder would otherwise mangle the .unpacked folder.
const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName, packager } = context;
  const resourcesDir =
    electronPlatformName === 'darwin' || electronPlatformName === 'mas'
      ? path.join(appOutDir, `${packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
      : path.join(appOutDir, 'resources');
  const src = path.join(__dirname, '..', 'resources', 'editor.asar');
  if (!fs.existsSync(src)) {
    throw new Error(`${src} is missing. Run "node scripts/prepare-resources.mjs" first.`);
  }
  const dest = path.join(resourcesDir, 'editor.asar');
  fs.copyFileSync(src, dest);
  fs.rmSync(`${dest}.unpacked`, { recursive: true, force: true });
  if (fs.existsSync(`${src}.unpacked`)) {
    fs.cpSync(`${src}.unpacked`, `${dest}.unpacked`, { recursive: true });
  }
  console.log(`  • copied bundled editor to ${dest}`);
};
