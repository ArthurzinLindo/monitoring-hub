const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const fixturesDir = path.resolve(__dirname, "..", "fixtures");

test("fixtures versionadas nao contem identificadores ou credenciais sensiveis", () => {
  const fixtureFiles = fs.readdirSync(fixturesDir)
    .filter((fileName) => fileName.endsWith(".js"));

  assert.ok(fixtureFiles.length > 0);

  for (const fileName of fixtureFiles) {
    const content = fs.readFileSync(path.join(fixturesDir, fileName), "utf8");

    assert.equal(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/.test(content), false);
    assert.equal(/(?<!\d)\d{14}(?!\d)/.test(content), false);
    assert.equal(/\bBearer\s+[A-Za-z0-9._~+/=-]+/i.test(content), false);
    assert.equal(/\b(api[_-]?key|authorization|access_token|refresh_token)\b\s*[:=]/i.test(content), false);
  }
});
