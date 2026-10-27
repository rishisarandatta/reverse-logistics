import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import pool from "@/lib/db";
import { requireApiSession } from "@/lib/auth";
import {
  HttpError,
  errorResponse,
  readJson,
  toOptionalPositiveInt,
  toPositiveInt,
  toRequiredText,
  toText,
} from "@/lib/http";
import { inspectionReports, logReturnEvent, type ChecklistEntry, type Defect, type InspectionReport } from "@/lib/mongo";

const SEVERITIES = new Set(["minor", "major", "critical"]);

// Records an inspection across BOTH databases atomically:
//
//   1. BEGIN (MySQL)
//   2. CALL sp_complete_inspection -> INSPECTION row + one disposition row
//      (triggers: item must be picked up, one disposition only, restock
//      updates INVENTORY, return becomes Inspected / Closed)
//   3. insert the detailed report into MongoDB (validated by $jsonSchema)
//   4. COMMIT (MySQL)
//
// If step 2 or 3 fails, MySQL is rolled back. If the COMMIT itself fails
// after the Mongo insert, the Mongo document is deleted (compensation), so
// neither database ends up with half an inspection.
export async function POST(request: Request) {
  let connection: PoolConnection | undefined;
  let insertedInspectionId: number | null = null;

  try {
    const session = await requireApiSession("Admin", "Staff");
    const body = await readJson(request);
    const returnId = toPositiveInt(body.returnId, "Return");
    const condition = toRequiredText(body.condition, "Condition", 100);
    const disposition = toRequiredText(body.disposition, "Disposition", 20);
    const warehouseId = toOptionalPositiveInt(body.warehouseId, "Warehouse");
    const detail = toText(body.detail, "Disposition detail", { max: 500 });
    const disposalMethod = toText(body.disposalMethod, "Disposal method", { max: 100 });
    const remarks = toText(body.remarks, "Remarks", { max: 500 });
    const notes = toText(body.notes, "Notes", { max: 2000 }) ?? remarks ?? "";
    const conditionScore = toPositiveInt(body.conditionScore, "Condition score");

    const checklist: ChecklistEntry[] = Array.isArray(body.checklist)
      ? body.checklist.map((entry: Record<string, unknown>) => ({
          item: toRequiredText(entry?.item, "Checklist item", 200),
          passed: entry?.passed === true,
          ...(entry?.note ? { note: String(entry.note).slice(0, 500) } : {}),
        }))
      : [];

    const defects: Defect[] = Array.isArray(body.defects)
      ? body.defects.map((entry: Record<string, unknown>) => {
          const severity = String(entry?.severity ?? "minor");
          if (!SEVERITIES.has(severity)) throw new HttpError(400, "Defect severity must be minor, major or critical.");
          return {
            type: toRequiredText(entry?.type, "Defect type", 100),
            severity: severity as Defect["severity"],
            ...(entry?.location ? { location: String(entry.location).slice(0, 100) } : {}),
          };
        })
      : [];

    const attributes =
      body.attributes && typeof body.attributes === "object" && !Array.isArray(body.attributes)
        ? (body.attributes as Record<string, unknown>)
        : {};

    connection = await pool.getConnection();
    await connection.query("SET @app_user_id = ?", [session.userId]);
    await connection.beginTransaction();

    await connection.query(
      "CALL sp_complete_inspection(?, ?, ?, ?, ?, ?, ?, ?, @inspection_id)",
      [returnId, condition, remarks, disposition, warehouseId, detail, disposalMethod, session.userId]
    );

    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT @inspection_id AS inspectionId, oi.ProductID, p.ProductName, c.CategoryName
         FROM RETURNS r
         JOIN ORDER_ITEM oi ON oi.OrderItemID = r.OrderItemID
         JOIN PRODUCT p     ON p.ProductID = oi.ProductID
         JOIN CATEGORY c    ON c.CategoryID = p.CategoryID
        WHERE r.ReturnID = ?`,
      [returnId]
    );
    const info = rows[0];
    const inspectionId = Number(info.inspectionId);

    const report: InspectionReport = {
      inspectionId,
      returnId,
      productId: info.ProductID,
      productName: info.ProductName,
      category: info.CategoryName,
      inspector: { userId: session.userId, username: session.username },
      inspectedAt: new Date(),
      conditionGrade: condition,
      conditionScore,
      disposition,
      checklist,
      attributes,
      defects,
      photos: [],
      notes,
      createdAt: new Date(),
    };

    const reports = await inspectionReports();
    await reports.insertOne(report);
    insertedInspectionId = inspectionId;

    await connection.commit();

    await logReturnEvent({
      returnId,
      type: "INSPECTION_COMPLETED",
      actor: { userId: session.userId, username: session.username, role: session.role },
      message: `Inspection completed: ${condition}, disposition ${disposition}`,
      data: { inspectionId, condition, disposition, conditionScore },
    });

    return NextResponse.json({ message: "Inspection recorded.", inspectionId }, { status: 201 });
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {});
    if (insertedInspectionId !== null) {
      const reports = await inspectionReports().catch(() => null);
      await reports?.deleteOne({ inspectionId: insertedInspectionId }).catch(() => {});
    }
    return errorResponse(error);
  } finally {
    connection?.release();
  }
}
