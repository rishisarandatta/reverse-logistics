import { NextResponse, type NextRequest } from "next/server";
import type { ResultSetHeader } from "mysql2";
import pool from "@/lib/db";
import { requireApiSession } from "@/lib/auth";
import { HttpError, errorResponse, idParam, readJson, toNumber, toPositiveInt, toRequiredText } from "@/lib/http";

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/products/[id]">) {
  try {
    await requireApiSession("Admin");
    const productId = idParam((await ctx.params).id);
    const body = await readJson(request);

    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE PRODUCT
          SET ProductName = ?, SKU = ?, UnitPrice = ?, CategoryID = ?
        WHERE ProductID = ?`,
      [
        toRequiredText(body.productName, "Product name", 150),
        toRequiredText(body.sku, "SKU", 50),
        toNumber(body.unitPrice, "Unit price"),
        toPositiveInt(body.categoryId, "Category"),
        productId,
      ]
    );
    if (result.affectedRows === 0) throw new HttpError(404, "Product not found.");

    return NextResponse.json({ message: "Product updated." });
  } catch (error) {
    return errorResponse(error);
  }
}

// Products that appear on any order cannot be deleted (foreign key).
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/products/[id]">) {
  try {
    await requireApiSession("Admin");
    const productId = idParam((await ctx.params).id);

    const [result] = await pool.query<ResultSetHeader>(
      "DELETE FROM PRODUCT WHERE ProductID = ?",
      [productId]
    );
    if (result.affectedRows === 0) throw new HttpError(404, "Product not found.");

    return NextResponse.json({ message: "Product deleted." });
  } catch (error) {
    return errorResponse(error);
  }
}
