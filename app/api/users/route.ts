import { NextResponse } from "next/server";
import type { ResultSetHeader } from "mysql2";
import pool from "@/lib/db";
import { hashPassword, requireApiSession } from "@/lib/auth";
import { HttpError, errorResponse, readJson, toOptionalPositiveInt, toRequiredText } from "@/lib/http";
import { listUsers } from "@/lib/data/catalog";

export async function GET() {
  try {
    await requireApiSession("Admin");
    return NextResponse.json({ users: await listUsers() });
  } catch (error) {
    return errorResponse(error);
  }
}

// Admins create Staff / Admin accounts (or a login for an existing
// customer). chk_app_user_customer_link guarantees Customer accounts are
// linked to a CUSTOMER row and staff accounts are not.
export async function POST(request: Request) {
  try {
    await requireApiSession("Admin");
    const body = await readJson(request);
    const password = toRequiredText(body.password, "Password", 200);
    if (password.length < 6) throw new HttpError(400, "Password must be at least 6 characters.");

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO APP_USER (Username, PasswordHash, Role, CustomerID)
       VALUES (?, ?, ?, ?)`,
      [
        toRequiredText(body.username, "Username", 50),
        await hashPassword(password),
        toRequiredText(body.role, "Role", 20),
        toOptionalPositiveInt(body.customerId, "Customer"),
      ]
    );

    return NextResponse.json({ message: "User created.", userId: result.insertId }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
