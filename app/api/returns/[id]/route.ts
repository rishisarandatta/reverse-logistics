import { NextResponse, type NextRequest } from "next/server";
import type { ResultSetHeader } from "mysql2";
import { withTransaction } from "@/lib/db";
import { requireApiSession } from "@/lib/auth";
import { HttpError, errorResponse, idParam, readJson, toText } from "@/lib/http";
import { logReturnEvent } from "@/lib/mongo";
import { getReturnDetail } from "@/lib/data/returns";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/returns/[id]">) {
  try {
    const session = await requireApiSession();
    const detail = await getReturnDetail(idParam((await ctx.params).id), session);
    if (!detail) throw new HttpError(404, "Return not found.");
    return NextResponse.json(detail);
  } catch (error) {
    return errorResponse(error);
  }
}

const ACTIONS: Record<string, string> = {
  approve: "Approved",
  reject: "Rejected",
};

// Staff approve or reject a request. Whether the change is allowed from the
// current status is decided by the state-machine trigger, which also writes
// the RETURN_STATUS_HISTORY row.
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/returns/[id]">) {
  try {
    const session = await requireApiSession("Admin", "Staff");
    const returnId = idParam((await ctx.params).id);
    const body = await readJson(request);

    const newStatus = ACTIONS[String(body.action)];
    if (!newStatus) throw new HttpError(400, "action must be 'approve' or 'reject'.");
    const note = toText(body.note, "Note", { max: 500 });

    await withTransaction(session.userId, async (connection) => {
      const [result] = await connection.query<ResultSetHeader>(
        "UPDATE RETURNS SET ReturnStatus = ? WHERE ReturnID = ?",
        [newStatus, returnId]
      );
      if (result.affectedRows === 0) throw new HttpError(404, "Return not found.");
    });

    await logReturnEvent({
      returnId,
      type: "STATUS_CHANGED",
      actor: { userId: session.userId, username: session.username, role: session.role },
      message: `Return request ${newStatus.toLowerCase()}${note ? `: ${note}` : ""}`,
      data: { to: newStatus, note: note ?? "" },
    });

    return NextResponse.json({ message: `Return ${newStatus.toLowerCase()}.` });
  } catch (error) {
    return errorResponse(error);
  }
}
