const fs = require("fs");
const path = require("path");

const packageJson = require("./package.json");
const distDir = path.resolve(__dirname, "..", "dist");
const artifactName = `Monitoring-Hub-${packageJson.version}-Portable.exe`;
const artifactPath = path.join(distDir, artifactName);

if (process.env.MONITORING_HUB_ALLOW_VERSION_OVERWRITE === "1") {
  process.exit(0);
}

if (fs.existsSync(artifactPath)) {
  console.error(`Build bloqueada: ${artifactName} ja existe em dist/.`);
  console.error("Incremente a versao antes de gerar uma nova build versionada.");
  process.exit(1);
}
