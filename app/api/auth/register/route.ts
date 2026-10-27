import { NextResponse } from "next/server";
import type { ResultSetHeader } from "mysql2";
import { withTransaction } from "@/lib/db";
import { hashPassword, startSession } from "@/lib/auth";
import { HttpError, errorResponse, readJson, toRequiredText, toText } from "@/lib/http";

// Customer self-registration. The CUSTOMER row and its APP_USER login are
// created in one transaction, so a failure in either (duplicate email,
// duplicate username, invalid phone rejected by a CHECK constraint, ...)
// leaves nothing behind.
export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const name = toRequiredText(body.name, "Name", 100);
    const email = toRequiredText(body.email, "Email", 100);
    const phone = toText(body.phone, "Phone", { max: 20 });
    const address = toText(body.address, "Address");
    const username = toRequiredText(body.username, "Username", 50);
    const password = toRequiredText(body.password, "Password", 200);

    if (password.length < 6) {
      throw new HttpError(400, "Password must be at least 6 characters.");
    }

    const passwordHash = await hashPassword(password);

    const session = await withTransaction(null, async (connection) => {
      const [customer] = await connection.query<ResultSetHeader>(
        `INSERT INTO CUSTOMER (Name, Email, Phone, Address, CustomerType)
         VALUES (?, ?, ?, ?, 'Regular')`,
        [name, email, phone, address]
      );

      const [user] = await connection.query<ResultSetHeader>(
        `INSERT INTO APP_USER (Username, PasswordHash, Role, CustomerID)
         VALUES (?, ?, 'Customer', ?)`,
        [username, passwordHash, customer.insertId]
      );

      return {
        userId: user.insertId,
        username,
        role: "Customer" as const,
        customerId: customer.insertId,
      };
    });

    await startSession(session);
    return NextResponse.json({ user: session }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
