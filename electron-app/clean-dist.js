const fs = require("fs");
const path = require("path");

const distDir = path.resolve(__dirname, "..", "dist");
const portableArtifactPattern = /^Monitoring-Hub-.+-Portable\.exe$/;

for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
  const entryPath = path.join(distDir, entry.name);

  if (entry.isFile() && portableArtifactPattern.test(entry.name)) {
    continue;
  }

  fs.rmSync(entryPath, { recursive: true, force: true });
}
