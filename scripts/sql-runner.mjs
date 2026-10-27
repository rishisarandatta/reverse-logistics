// Shared helpers for the database scripts: connection settings from
// environment variables and a SQL file splitter that understands the
// MySQL client's DELIMITER command (used by procedures and triggers).
import fs from "node:fs";
import mysql from "mysql2/promise";

export function mysqlConfig({ withDatabase = true } = {}) {
  const required = ["DB_HOST", "DB_USER", "DB_PASSWORD"];
  const missing = required.filter((key) => process.env[key] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `Missing environment variables: ${missing.join(", ")}. ` +
        "Run the script with `node --env-file=.env.local ...` (npm scripts do this)."
    );
  }

  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: withDatabase ? process.env.DB_NAME || "ReverseLogisticsDB" : undefined,
    dateStrings: true,
  };
}

export function connect(options) {
  return mysql.createConnection(mysqlConfig(options));
}

// Splits a SQL script into individual statements. Comments are dropped;
// quoted strings are kept intact; "DELIMITER xx" lines switch the
// statement terminator exactly like the mysql command-line client.
export function splitSql(source) {
  const statements = [];
  let delimiter = ";";
  let current = "";
  let i = 0;
  let atLineStart = true;

  const push = () => {
    const text = current.trim();
    if (text) statements.push(text);
    current = "";
  };

  while (i < source.length) {
    if (atLineStart) {
      const lineEnd = source.indexOf("\n", i);
      const line = source.slice(i, lineEnd === -1 ? undefined : lineEnd);
      const match = /^\s*DELIMITER\s+(\S+)\s*$/i.exec(line);
      if (match) {
        push();
        delimiter = match[1];
        i = lineEnd === -1 ? source.length : lineEnd + 1;
        continue;
      }
    }

    const ch = source[i];
    const next = source[i + 1];
    atLineStart = false;

    // Line comments: "-- " and "#"
    if ((ch === "-" && next === "-" && /\s/.test(source[i + 2] ?? " ")) || ch === "#") {
      const lineEnd = source.indexOf("\n", i);
      i = lineEnd === -1 ? source.length : lineEnd;
      continue;
    }

    // Block comments
    if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }

    // Quoted strings / identifiers
    if (ch === "'" || ch === '"' || ch === "`") {
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === "\\" && ch !== "`") {
          j += 2;
          continue;
        }
        if (source[j] === ch) {
          if (source[j + 1] === ch) {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      current += source.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    if (source.startsWith(delimiter, i)) {
      push();
      i += delimiter.length;
      continue;
    }

    if (ch === "\n") atLineStart = true;
    current += ch;
    i++;
  }

  push();
  return statements;
}

export function readSqlFile(path) {
  return splitSql(fs.readFileSync(path, "utf8"));
}
