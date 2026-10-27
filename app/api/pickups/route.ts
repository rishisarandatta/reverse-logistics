import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { withTransaction } from "@/lib/db";
import { requireApiSession } from "@/lib/auth";
import { HttpError, errorResponse, readJson, toPositiveInt, toRequiredText, toText } from "@/lib/http";
import { logReturnEvent } from "@/lib/mongo";

// Schedules the courier pickup for an approved return. The PICKUP triggers
// reject unapproved returns / past dates and move the return to
// 'Pickup Scheduled'.
export async function POST(request: Request) {
  try {
    const session = await requireApiSession("Admin", "Staff");
    const body = await readJson(request);

    const returnId = toPositiveInt(body.returnId, "Return");
    const courierId = toPositiveInt(body.courierId, "Courier");
    const pickupDate = toRequiredText(body.pickupDate, "Pickup date", 10);
    const requestedAddress = toText(body.pickupAddress, "Pickup address");

    const pickup = await withTransaction(session.userId, async (connection) => {
      // Default to the customer's address on file.
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT c.Address, co.CourierName
           FROM RETURNS r
           JOIN ORDERS o   ON o.OrderID = r.OrderID
           JOIN CUSTOMER c ON c.CustomerID = o.CustomerID
           LEFT JOIN COURIER co ON co.CourierID = ?
          WHERE r.ReturnID = ?`,
        [courierId, returnId]
      );
      if (rows.length === 0) throw new HttpError(404, "Return not found.");

      const address = requestedAddress ?? rows[0].Address;
      if (!address) throw new HttpError(400, "Pickup address is required.");

      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO PICKUP (ReturnID, PickupDate, PickupAddress, CourierID)
         VALUES (?, ?, ?, ?)`,
        [returnId, pickupDate, address, courierId]
      );
      return { pickupId: result.insertId, courierName: rows[0].CourierName as string | null };
    });

    await logReturnEvent({
      returnId,
      type: "PICKUP_SCHEDULED",
      actor: { userId: session.userId, username: session.username, role: session.role },
      message: `Pickup booked with ${pickup.courierName ?? "courier"} for ${pickupDate}`,
      data: { pickupId: pickup.pickupId, courierId, pickupDate },
    });

    return NextResponse.json({ message: "Pickup scheduled.", pickupId: pickup.pickupId }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
