import { NextResponse, type NextRequest } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { withTransaction } from "@/lib/db";
import { requireApiSession } from "@/lib/auth";
import { HttpError, errorResponse, idParam, readJson, toRequiredText, toText } from "@/lib/http";
import { logReturnEvent } from "@/lib/mongo";

// Updates the pickup status: Picked Up, Failed, Cancelled, or Scheduled
// again (reschedule, optionally with a new date). trg_pickup_before_update
// validates the transition; trg_pickup_after_update moves the return.
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/pickups/[id]">) {
  try {
    const session = await requireApiSession("Admin", "Staff");
    const pickupId = idParam((await ctx.params).id);
    const body = await readJson(request);

    const status = toRequiredText(body.status, "Status", 50);
    const pickupDate = toText(body.pickupDate, "Pickup date", { max: 10 });

    const returnId = await withTransaction(session.userId, async (connection) => {
      const [rows] = await connection.query<RowDataPacket[]>(
        "SELECT ReturnID FROM PICKUP WHERE PickupID = ? FOR UPDATE",
        [pickupId]
      );
      if (rows.length === 0) throw new HttpError(404, "Pickup not found.");

      await connection.query<ResultSetHeader>(
        `UPDATE PICKUP
            SET PickupStatus = ?, PickupDate = COALESCE(?, PickupDate)
          WHERE PickupID = ?`,
        [status, pickupDate, pickupId]
      );
      return rows[0].ReturnID as number;
    });

    await logReturnEvent({
      returnId,
      type: status === "Scheduled" ? "PICKUP_SCHEDULED" : "PICKUP_SCAN",
      actor: { userId: session.userId, username: session.username, role: session.role },
      message:
        status === "Scheduled"
          ? `Pickup rescheduled${pickupDate ? ` for ${pickupDate}` : ""}`
          : `Pickup marked as ${status}`,
      data: { pickupId, status, ...(pickupDate ? { pickupDate } : {}) },
    });

    return NextResponse.json({ message: `Pickup marked as ${status}.` });
  } catch (error) {
    return errorResponse(error);
  }
}
