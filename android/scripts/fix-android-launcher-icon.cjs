const { existsSync, readFileSync, writeFileSync } = require("fs");
const path = require("path");

function fixAndroidLauncherIcon(projectRoot) {
  const manifestPath = path.join(projectRoot, "android", "app", "src", "main", "AndroidManifest.xml");

  if (!existsSync(manifestPath)) {
    return false;
  }

  const original = readFileSync(manifestPath, "utf8");
  const updated = original.replaceAll(
    'android:roundIcon="@mipmap/ic_launcher_round"',
    'android:roundIcon="@mipmap/ic_launcher"',
  );

  if (updated !== original) {
    writeFileSync(manifestPath, updated, "utf8");
    console.log(`Launcher Android ajustado em ${manifestPath}`);
    return true;
  }

  return false;
}

if (require.main === module) {
  fixAndroidLauncherIcon(process.cwd());
}

module.exports = { fixAndroidLauncherIcon };
