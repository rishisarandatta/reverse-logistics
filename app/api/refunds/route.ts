import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { withConnection } from "@/lib/db";
import { requireApiSession } from "@/lib/auth";
import { errorResponse, readJson, toPositiveInt, toRequiredText } from "@/lib/http";
import { logReturnEvent } from "@/lib/mongo";
import { listPendingRefunds, listRefunds } from "@/lib/data/catalog";

export async function GET() {
  try {
    await requireApiSession("Admin", "Staff");
    const [refunds, pending] = await Promise.all([listRefunds(), listPendingRefunds()]);
    return NextResponse.json({ refunds, pending });
  } catch (error) {
    return errorResponse(error);
  }
}

// Issues a refund via sp_process_refund. The procedure runs its own
// transaction (START TRANSACTION ... COMMIT, with an EXIT HANDLER that rolls
// back on any error), locks the pickup row, and takes the amount from
// fn_calculate_refund - the client never chooses the amount.
export async function POST(request: Request) {
  try {
    const session = await requireApiSession("Admin", "Staff");
    const body = await readJson(request);
    const pickupId = toPositiveInt(body.pickupId, "Pickup");
    const method = toRequiredText(body.method, "Refund method", 50);

    const refund = await withConnection(session.userId, async (connection) => {
      await connection.query("CALL sp_process_refund(?, ?, ?, @refund_id, @amount)", [
        pickupId,
        method,
        session.userId,
      ]);
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT @refund_id AS refundId, @amount AS amount, p.ReturnID AS returnId
           FROM PICKUP p WHERE p.PickupID = ?`,
        [pickupId]
      );
      return {
        refundId: Number(rows[0].refundId),
        amount: Number(rows[0].amount),
        returnId: Number(rows[0].returnId),
      };
    });

    await logReturnEvent({
      returnId: refund.returnId,
      type: "REFUND_ISSUED",
      actor: { userId: session.userId, username: session.username, role: session.role },
      message: `Refund of Rs. ${refund.amount.toFixed(2)} issued`,
      data: { refundId: refund.refundId, amount: refund.amount, method },
    });

    return NextResponse.json({ message: "Refund processed.", ...refund }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
