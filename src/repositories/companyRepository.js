const { getDatabase, runInTransaction } = require("../database/connection");

function rowToCompany(row) {
  return {
    id: String(row[0]),
    name: String(row[1]),
    identifier: String(row[2]),
    identifier_digits: String(row[3]),
    api_key: String(row[4]),
    system: String(row[5]),
  };
}

async function listCompanies() {
  const db = await getDatabase();
  const result = db.exec(`
    SELECT id, name, identifier, identifier_digits, api_key, system
    FROM companies
    ORDER BY system ASC, name COLLATE NOCASE ASC;
  `);

  if (!result.length) {
    return [];
  }

  return result[0].values.map(rowToCompany);
}

async function replaceCompanies(companies) {
  await runInTransaction((db) => {
    db.run("DELETE FROM companies;");

    const insert = db.prepare(`
      INSERT INTO companies (
        id,
        name,
        identifier,
        identifier_digits,
        api_key,
        system,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'));
    `);

    try {
      for (const company of companies) {
        insert.run([
          company.id,
          company.name,
          company.identifier,
          company.identifier_digits,
          company.api_key,
          company.system,
        ]);
      }
    } finally {
      insert.free();
    }
  });
}

module.exports = {
  listCompanies,
  replaceCompanies,
};
