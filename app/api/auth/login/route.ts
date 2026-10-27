import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { startSession, verifyPassword, type Role } from "@/lib/auth";
import { HttpError, errorResponse, readJson, toRequiredText } from "@/lib/http";

interface UserRow extends RowDataPacket {
  UserID: number;
  Username: string;
  PasswordHash: string;
  Role: Role;
  CustomerID: number | null;
  IsActive: number;
}

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const username = toRequiredText(body.username, "Username", 50);
    const password = toRequiredText(body.password, "Password", 200);

    const [rows] = await pool.query<UserRow[]>(
      `SELECT UserID, Username, PasswordHash, Role, CustomerID, IsActive
         FROM APP_USER WHERE Username = ?`,
      [username]
    );
    const user = rows[0];

    // Same message for unknown user and wrong password.
    if (!user || !(await verifyPassword(password, user.PasswordHash))) {
      throw new HttpError(401, "Invalid username or password.");
    }
    if (!user.IsActive) {
      throw new HttpError(403, "This account has been deactivated.");
    }

    const session = {
      userId: user.UserID,
      username: user.Username,
      role: user.Role,
      customerId: user.CustomerID,
    };
    await startSession(session);

    return NextResponse.json({ user: session });
  } catch (error) {
    return errorResponse(error);
  }
}
