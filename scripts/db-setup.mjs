// Builds the MySQL database from the scripts in /database.
//
//   npm run db:setup          create schema, routines, triggers, views, seed
//   npm run db:reset          DROP the database first, then do the above
import path from "node:path";
import { connect, readSqlFile } from "./sql-runner.mjs";

const FILES = [
  "01_schema.sql",
  "02_constraints_indexes.sql",
  "03_functions_procedures.sql",
  "04_triggers.sql",
  "05_views.sql",
  "06_seed.sql",
];

const reset = process.argv.includes("--reset");
const dbName = process.env.DB_NAME || "ReverseLogisticsDB";
const connection = await connect({ withDatabase: false });

try {
  if (reset) {
    console.log(`Dropping database ${dbName} ...`);
    await connection.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
  } else {
    const [rows] = await connection.query(
      "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?",
      [dbName]
    );
    if (rows.length > 0) {
      console.error(
        `Database ${dbName} already exists. Use "npm run db:reset" to drop and rebuild it.`
      );
      process.exit(1);
    }
  }

  for (const file of FILES) {
    const statements = readSqlFile(path.join("database", file));
    process.stdout.write(`Running ${file} (${statements.length} statements) ... `);

    for (const statement of statements) {
      try {
        const [result] = await connection.query(statement);
        if (Array.isArray(result) && result.length > 0 && !Array.isArray(result[0])) {
          console.log();
          console.table(result);
        }
      } catch (error) {
        console.error(`\n\nFailed in ${file}:\n${statement.slice(0, 400)}\n`);
        throw error;
      }
    }
    console.log("done");
  }

  console.log(`\nDatabase ${dbName} is ready.`);
} finally {
  await connection.end();
}
