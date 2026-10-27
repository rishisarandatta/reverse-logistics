import { NextResponse, type NextRequest } from "next/server";
import type { ResultSetHeader } from "mysql2";
import pool from "@/lib/db";
import { requireApiSession } from "@/lib/auth";
import { errorResponse, readJson, toRequiredText, toText } from "@/lib/http";
import { listCustomers } from "@/lib/data/catalog";

export async function GET(request: NextRequest) {
  try {
    await requireApiSession("Admin", "Staff");
    const params = request.nextUrl.searchParams;
    const customers = await listCustomers({ q: params.get("q"), type: params.get("type") });
    return NextResponse.json({ customers });
  } catch (error) {
    return errorResponse(error);
  }
}

// Email / phone format and CustomerType are validated by CHECK constraints.
export async function POST(request: Request) {
  try {
    await requireApiSession("Admin");
    const body = await readJson(request);

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO CUSTOMER (Name, Email, Phone, Address, CustomerType)
       VALUES (?, ?, ?, ?, ?)`,
      [
        toRequiredText(body.name, "Name", 100),
        toRequiredText(body.email, "Email", 100),
        toText(body.phone, "Phone", { max: 20 }),
        toText(body.address, "Address"),
        toText(body.customerType, "Customer type", { max: 30 }) ?? "Regular",
      ]
    );

    return NextResponse.json(
      { message: "Customer created.", customerId: result.insertId },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
