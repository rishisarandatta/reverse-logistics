import { NextResponse, type NextRequest } from "next/server";
import type { ResultSetHeader } from "mysql2";
import pool from "@/lib/db";
import { requireApiSession } from "@/lib/auth";
import { errorResponse, readJson, toNumber, toOptionalPositiveInt, toPositiveInt, toRequiredText } from "@/lib/http";
import { listProducts } from "@/lib/data/catalog";

// ?q= uses the FULLTEXT index on ProductName; ?categoryId= filters.
export async function GET(request: NextRequest) {
  try {
    await requireApiSession();
    const params = request.nextUrl.searchParams;
    const products = await listProducts({
      q: params.get("q"),
      categoryId: toOptionalPositiveInt(params.get("categoryId"), "categoryId"),
    });
    return NextResponse.json({ products });
  } catch (error) {
    return errorResponse(error);
  }
}

// Unique SKU and non-negative price are enforced by the database.
export async function POST(request: Request) {
  try {
    await requireApiSession("Admin");
    const body = await readJson(request);

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO PRODUCT (ProductName, SKU, UnitPrice, CategoryID)
       VALUES (?, ?, ?, ?)`,
      [
        toRequiredText(body.productName, "Product name", 150),
        toRequiredText(body.sku, "SKU", 50),
        toNumber(body.unitPrice, "Unit price"),
        toPositiveInt(body.categoryId, "Category"),
      ]
    );

    return NextResponse.json(
      { message: "Product created.", productId: result.insertId },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
