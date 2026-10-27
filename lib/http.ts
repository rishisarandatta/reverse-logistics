import { NextResponse } from "next/server";

// Error with an HTTP status that route handlers can throw.
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

interface MySqlError {
  errno?: number;
  sqlState?: string;
  sqlMessage?: string;
}

interface MongoError {
  name?: string;
  code?: number;
}

// Turns any error into a JSON response. Database errors are translated into
// readable messages so the UI can show *why* the database rejected a write
// (constraint, foreign key, trigger rule, ...).
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const mysqlError = error as MySqlError;
  if (mysqlError?.errno) {
    const message = mysqlError.sqlMessage ?? "Database error.";

    // SIGNAL SQLSTATE '45000' from our triggers / procedures: the message is
    // already written for end users.
    if (mysqlError.sqlState === "45000") {
      return NextResponse.json({ error: message }, { status: 422 });
    }

    switch (mysqlError.errno) {
      case 1062: // ER_DUP_ENTRY
        return NextResponse.json(
          { error: `Duplicate value: ${message.replace(/^Duplicate entry /, "")}` },
          { status: 409 }
        );
      case 1451: // ER_ROW_IS_REFERENCED_2
        return NextResponse.json(
          { error: "This record is referenced by other records (foreign key) and cannot be deleted." },
          { status: 409 }
        );
      case 1452: // ER_NO_REFERENCED_ROW_2
        return NextResponse.json(
          { error: "A referenced record does not exist (foreign key constraint)." },
          { status: 400 }
        );
      case 3819: { // ER_CHECK_CONSTRAINT_VIOLATED
        const name = /'([^']+)'/.exec(message)?.[1] ?? "check";
        return NextResponse.json(
          { error: `Invalid value rejected by database constraint ${name}.`, constraint: name },
          { status: 400 }
        );
      }
      case 1048: // ER_BAD_NULL_ERROR
      case 1366: // ER_TRUNCATED_WRONG_VALUE_FOR_FIELD
      case 1406: // ER_DATA_TOO_LONG
      case 1292: // ER_TRUNCATED_WRONG_VALUE (bad date)
        return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const mongoError = error as MongoError;
  if (mongoError?.name === "MongoServerError" && mongoError.code === 121) {
    return NextResponse.json(
      { error: "The inspection report failed MongoDB schema validation." },
      { status: 400 }
    );
  }

  console.error(error);
  return NextResponse.json({ error: "Internal server error." }, { status: 500 });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  throw new HttpError(400, "Request body must be a JSON object.");
}

// Basic type parsing only. Domain rules (allowed statuses, formats, amounts,
// workflow order) are enforced by the database itself.
export function toPositiveInt(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new HttpError(400, `${field} must be a positive whole number.`);
  }
  return number;
}

// Only checks that the value is a number; the sign / range is left to the
// database CHECK constraint so its validation is visible.
export function toNumber(value: unknown, field: string): number {
  const number = Number(value);
  if (value === "" || value === null || value === undefined || !Number.isFinite(number)) {
    throw new HttpError(400, `${field} must be a number.`);
  }
  return number;
}

export function toOptionalPositiveInt(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  return toPositiveInt(value, field);
}

export function toText(
  value: unknown,
  field: string,
  { required = false, max = 255 }: { required?: boolean; max?: number } = {}
): string | null {
  if (value === undefined || value === null || String(value).trim() === "") {
    if (required) throw new HttpError(400, `${field} is required.`);
    return null;
  }
  const text = String(value).trim();
  if (text.length > max) {
    throw new HttpError(400, `${field} must be at most ${max} characters.`);
  }
  return text;
}

export function toRequiredText(value: unknown, field: string, max = 255): string {
  return toText(value, field, { required: true, max }) as string;
}

export function idParam(value: string): number {
  return toPositiveInt(value, "id");
}
