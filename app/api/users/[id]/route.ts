import { NextResponse, type NextRequest } from "next/server";
import type { ResultSetHeader } from "mysql2";
import pool from "@/lib/db";
import { requireApiSession } from "@/lib/auth";
import { HttpError, errorResponse, idParam, readJson } from "@/lib/http";

// Activate / deactivate an account. Deactivated users cannot log in.
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/users/[id]">) {
  try {
    const session = await requireApiSession("Admin");
    const userId = idParam((await ctx.params).id);
    const body = await readJson(request);

    if (typeof body.isActive !== "boolean") {
      throw new HttpError(400, "isActive must be true or false.");
    }
    if (userId === session.userId && !body.isActive) {
      throw new HttpError(400, "You cannot deactivate your own account.");
    }

    const [result] = await pool.query<ResultSetHeader>(
      "UPDATE APP_USER SET IsActive = ? WHERE UserID = ?",
      [body.isActive, userId]
    );
    if (result.affectedRows === 0) throw new HttpError(404, "User not found.");

    return NextResponse.json({ message: body.isActive ? "User activated." : "User deactivated." });
  } catch (error) {
    return errorResponse(error);
  }
}
