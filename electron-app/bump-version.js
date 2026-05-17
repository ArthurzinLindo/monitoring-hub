const fs = require("fs");
const path = require("path");

const bumpType = process.argv[2];
const validBumps = new Set(["patch", "minor", "major"]);

if (!validBumps.has(bumpType)) {
  console.error("Uso: node bump-version.js <patch|minor|major>");
  process.exit(1);
}

const electronPackagePath = path.join(__dirname, "package.json");
const electronPackage = readJson(electronPackagePath);
const nextVersion = bumpVersion(electronPackage.version, bumpType);

const filesToUpdate = [
  electronPackagePath,
  path.join(__dirname, "package-lock.json"),
  path.join(__dirname, "electron-package.json"),
  path.resolve(__dirname, "..", "package.json"),
  path.resolve(__dirname, "..", "package-lock.json"),
];

for (const filePath of filesToUpdate) {
  if (!fs.existsSync(filePath)) {
    continue;
  }

  const json = readJson(filePath);
  json.version = nextVersion;

  if (json.packages && json.packages[""]) {
    json.packages[""].version = nextVersion;
  }

  writeJson(filePath, json);
}

console.log(`Versao atualizada para ${nextVersion}.`);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function bumpVersion(version, type) {
  const parts = String(version || "").split(".").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
    throw new Error(`Versao invalida: ${version}`);
  }

  const [major, minor, patch] = parts;

  if (type === "major") {
    return `${major + 1}.0.0`;
  }

  if (type === "minor") {
    return `${major}.${minor + 1}.0`;
  }

  return `${major}.${minor}.${patch + 1}`;
}
