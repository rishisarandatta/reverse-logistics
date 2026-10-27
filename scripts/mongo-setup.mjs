// Creates the MongoDB collections (with $jsonSchema validation and indexes)
// and seeds documents that are linked to the rows created by db:setup.
//
//   npm run mongo:setup        (run after npm run db:setup)
//
// Collections
//   inspection_reports  one document per SQL INSPECTION row (InspectionID),
//                       holding the category-specific checklist, measured
//                       attributes, defects and photos.
//   return_events       append-only activity feed per return (customer
//                       messages, courier scans, staff notes, workflow
//                       events). Each event type carries a different payload.
import { MongoClient } from "mongodb";
import checklists from "../lib/inspection-checklists.json" with { type: "json" };
import { connect } from "./sql-runner.mjs";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "reverse_logistics";
if (!uri) throw new Error("MONGODB_URI is not set (see .env.example).");

const CONDITIONS = ["Like New", "Good", "Fair", "Damaged", "Defective"];
const DISPOSITIONS = ["Restock", "Refurbish", "Dispose", "Reject"];
const EVENT_TYPES = [
  "REQUEST_CREATED",
  "STATUS_CHANGED",
  "PICKUP_SCHEDULED",
  "PICKUP_SCAN",
  "INSPECTION_COMPLETED",
  "REFUND_ISSUED",
  "CUSTOMER_MESSAGE",
  "STAFF_NOTE",
];

const inspectionReportSchema = {
  $jsonSchema: {
    bsonType: "object",
    required: [
      "inspectionId", "returnId", "productId", "category", "inspector",
      "inspectedAt", "conditionGrade", "conditionScore", "disposition", "checklist",
    ],
    properties: {
      inspectionId: { bsonType: "int", minimum: 1 },
      returnId: { bsonType: "int", minimum: 1 },
      productId: { bsonType: "int", minimum: 1 },
      productName: { bsonType: "string" },
      category: { enum: Object.keys(checklists) },
      inspector: {
        bsonType: "object",
        required: ["userId", "username"],
        properties: {
          userId: { bsonType: "int" },
          username: { bsonType: "string" },
        },
      },
      inspectedAt: { bsonType: "date" },
      conditionGrade: { enum: CONDITIONS },
      conditionScore: { bsonType: "int", minimum: 1, maximum: 10 },
      disposition: { enum: DISPOSITIONS },
      checklist: {
        bsonType: "array",
        minItems: 1,
        items: {
          bsonType: "object",
          required: ["item", "passed"],
          properties: {
            item: { bsonType: "string" },
            passed: { bsonType: "bool" },
            note: { bsonType: "string" },
          },
        },
      },
      attributes: { bsonType: "object" },
      defects: {
        bsonType: "array",
        items: {
          bsonType: "object",
          required: ["type", "severity"],
          properties: {
            type: { bsonType: "string" },
            severity: { enum: ["minor", "major", "critical"] },
            location: { bsonType: "string" },
          },
        },
      },
      photos: {
        bsonType: "array",
        items: {
          bsonType: "object",
          required: ["fileName"],
          properties: {
            fileName: { bsonType: "string" },
            caption: { bsonType: "string" },
          },
        },
      },
      notes: { bsonType: "string" },
    },
  },
};

const returnEventSchema = {
  $jsonSchema: {
    bsonType: "object",
    required: ["returnId", "type", "at", "actor"],
    properties: {
      returnId: { bsonType: "int", minimum: 1 },
      type: { enum: EVENT_TYPES },
      at: { bsonType: "date" },
      actor: {
        bsonType: "object",
        required: ["role"],
        properties: {
          userId: { bsonType: ["int", "null"] },
          username: { bsonType: ["string", "null"] },
          role: { enum: ["Admin", "Staff", "Customer", "Courier", "System"] },
        },
      },
      message: { bsonType: "string" },
      data: { bsonType: "object" },
    },
  },
};

// Hand-written inspection details for the six seeded SQL inspections.
const REPORT_DETAILS = {
  1: {
    score: 4,
    failed: { "Battery holds charge": "Does not charge beyond 5 percent" },
    attributes: { serialNumber: "SW-5521-A8", batteryHealthPct: 12, factoryResetDone: true },
    defects: [{ type: "charging failure", severity: "major", location: "charging port" }],
    notes: "Charging circuit faulty. Display and strap are in good shape. Suitable for refurbishment after replacing the charging module and battery.",
  },
  2: {
    score: 10,
    failed: {},
    attributes: { sizeLabel: "UK 8", soleWearPct: 0 },
    defects: [],
    notes: "Unworn, original box and tags intact. Ready to resell as new.",
  },
  3: {
    score: 8,
    failed: { "Original packaging": "Repacked in a plain polybag" },
    attributes: { sizeLabel: "M", fabric: "100% cotton" },
    defects: [{ type: "fold creases", severity: "minor", location: "front" }],
    notes: "Two shirts unworn with tags attached. Slight fold creases, no stains. Restock after steam pressing.",
  },
  4: {
    score: 2,
    failed: {
      "No cracks or dents": "Basket cracked, housing dented",
      "Motor or heating element works": "Heating element does not reach temperature",
    },
    attributes: { wattageTested: 0, missingParts: [] },
    defects: [
      { type: "cracked basket", severity: "critical", location: "basket" },
      { type: "dented housing", severity: "major", location: "heating element housing" },
    ],
    notes: "Severe transit damage. Box was crushed. Repair cost exceeds item value; send for recycling.",
  },
  5: {
    score: 3,
    failed: {
      "Unworn and unwashed": "Signs of wear at the cuffs",
      "No stains or odour": "Stain on the left sleeve",
    },
    attributes: { sizeLabel: "L", fabric: "Denim" },
    defects: [
      { type: "stain", severity: "major", location: "left sleeve" },
      { type: "wear marks", severity: "minor", location: "cuffs" },
    ],
    notes: "Customer reported change of mind, but the jacket shows stains and visible wear. Rejected under the return policy.",
  },
  6: {
    score: 5,
    failed: {
      "Battery holds charge": "Battery holds about 40 percent",
      "No physical damage": "Speaker grille slightly bent",
    },
    attributes: { serialNumber: "BTS-1802-K3", batteryHealthPct: 40, factoryResetDone: true },
    defects: [
      { type: "audio distortion", severity: "major", location: "speaker driver" },
      { type: "battery degradation", severity: "major", location: "battery" },
    ],
    notes: "Speaker driver distorts above 70 percent volume and the battery is degraded. Refurbish by replacing the driver and battery pack.",
  },
};

const at = (date, time = "10:00") => new Date(`${date}T${time}:00+05:30`);
const addDays = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const sql = await connect();
const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(dbName);

  for (const name of ["inspection_reports", "return_events"]) {
    await db.collection(name).drop().catch(() => {});
  }

  await db.createCollection("inspection_reports", {
    validator: inspectionReportSchema,
    validationLevel: "strict",
    validationAction: "error",
  });
  await db.createCollection("return_events", {
    validator: returnEventSchema,
    validationLevel: "strict",
    validationAction: "error",
  });

  const reports = db.collection("inspection_reports");
  const events = db.collection("return_events");

  await reports.createIndexes([
    { key: { inspectionId: 1 }, name: "uq_inspection_id", unique: true },
    { key: { returnId: 1 }, name: "idx_return_id" },
    { key: { category: 1, inspectedAt: -1 }, name: "idx_category_date" },
    { key: { "defects.type": 1 }, name: "idx_defect_type" },
    {
      key: { notes: "text", "defects.type": "text", "checklist.note": "text" },
      name: "txt_report_search",
      weights: { notes: 5, "defects.type": 3, "checklist.note": 1 },
    },
  ]);
  await events.createIndexes([
    { key: { returnId: 1, at: 1 }, name: "idx_return_timeline" },
    { key: { type: 1, at: -1 }, name: "idx_type_date" },
  ]);

  // ---- inspection_reports, linked to SQL inspections --------------------
  const [inspections] = await sql.query(`
    SELECT v.InspectionID, v.ReturnID, v.ProductID, v.ProductName, v.CategoryName,
           v.InspectionDate, v.ProductCondition, v.Disposition,
           u.UserID, u.Username
      FROM ReturnPipelineView v
      JOIN INSPECTION i ON i.InspectionID = v.InspectionID
      LEFT JOIN APP_USER u ON u.UserID = i.InspectorID
     WHERE v.InspectionID IS NOT NULL
     ORDER BY v.InspectionID`);

  const reportDocs = inspections.map((row) => {
    const detail = REPORT_DETAILS[row.InspectionID] ?? {
      score: 7, failed: {}, attributes: {}, defects: [], notes: "",
    };
    return {
      inspectionId: row.InspectionID,
      returnId: row.ReturnID,
      productId: row.ProductID,
      productName: row.ProductName,
      category: row.CategoryName,
      inspector: { userId: row.UserID ?? 0, username: row.Username ?? "system" },
      inspectedAt: at(row.InspectionDate, "15:30"),
      conditionGrade: row.ProductCondition,
      conditionScore: detail.score,
      disposition: row.Disposition,
      checklist: checklists[row.CategoryName].checklist.map((item) =>
        detail.failed[item]
          ? { item, passed: false, note: detail.failed[item] }
          : { item, passed: true }
      ),
      attributes: detail.attributes,
      defects: detail.defects,
      photos: [
        { fileName: `inspection-${row.InspectionID}-front.jpg`, caption: "Front view" },
        { fileName: `inspection-${row.InspectionID}-label.jpg`, caption: "Product label" },
      ],
      notes: detail.notes,
      createdAt: at(row.InspectionDate, "15:30"),
    };
  });
  if (reportDocs.length > 0) await reports.insertMany(reportDocs);

  // ---- return_events, derived from the SQL pipeline ---------------------
  const [returns] = await sql.query(`
    SELECT v.*, u.UserID AS CustomerUserID, u.Username AS CustomerUsername
      FROM ReturnPipelineView v
      LEFT JOIN APP_USER u ON u.CustomerID = v.CustomerID
     ORDER BY v.ReturnID`);

  const staff = { userId: 2, username: "staff", role: "Staff" };
  const eventDocs = [];

  for (const r of returns) {
    const customer = {
      userId: r.CustomerUserID ?? null,
      username: r.CustomerUsername ?? null,
      role: "Customer",
    };
    const push = (type, when, actor, message, data = {}) =>
      eventDocs.push({ returnId: r.ReturnID, type, at: when, actor, message, data });

    push("REQUEST_CREATED", at(r.ReturnDate, "09:15"), customer,
      `Return requested: ${r.ReasonName}`,
      { reason: r.ReasonName, quantity: r.ReturnQty, comments: r.Comments ?? "" });

    if (r.ReturnStatus === "Requested") continue;

    if (r.ReturnStatus === "Rejected") {
      push("STATUS_CHANGED", at(addDays(r.ReturnDate, 1), "11:00"), staff,
        "Return request rejected",
        { from: "Requested", to: "Rejected", reason: "Item not eligible under the change-of-mind policy" });
      continue;
    }

    push("STATUS_CHANGED", at(addDays(r.ReturnDate, 1), "11:00"), staff,
      "Return request approved", { from: "Requested", to: "Approved" });

    if (r.PickupID) {
      push("PICKUP_SCHEDULED", at(addDays(r.ReturnDate, 1), "11:05"), staff,
        `Pickup booked with ${r.CourierName}`,
        { pickupId: r.PickupID, courier: r.CourierName, pickupDate: r.PickupDate });

      if (r.PickupStatus === "Picked Up") {
        push("PICKUP_SCAN", at(r.PickupDate, "14:20"),
          { userId: null, username: r.CourierName, role: "Courier" },
          "Parcel collected from customer",
          { scanCode: `RL-${String(r.PickupID).padStart(6, "0")}`, packageWeightKg: 1.2, sealIntact: true });
      } else if (r.PickupStatus === "Failed") {
        push("PICKUP_SCAN", at(r.PickupDate, "16:45"),
          { userId: null, username: r.CourierName, role: "Courier" },
          "Pickup attempt failed",
          { attempt: 1, failureReason: "Customer not available at address" });
        push("CUSTOMER_MESSAGE", at(r.PickupDate, "19:10"), customer,
          "Sorry I missed the courier. Could the pickup be rescheduled for the weekend?");
      }
    }

    if (r.InspectionID) {
      push("INSPECTION_COMPLETED", at(r.InspectionDate, "15:30"), staff,
        `Inspection completed: ${r.ProductCondition}, disposition ${r.Disposition}`,
        { inspectionId: r.InspectionID, condition: r.ProductCondition, disposition: r.Disposition });
    }

    if (r.RefundID) {
      push("REFUND_ISSUED", at(r.RefundDate, "12:00"), staff,
        `Refund of Rs. ${r.RefundAmount} issued`,
        { refundId: r.RefundID, amount: Number(r.RefundAmount), method: r.RefundMethod });
    }
  }

  eventDocs.push({
    returnId: 11,
    type: "CUSTOMER_MESSAGE",
    at: at("2026-10-16", "08:40"),
    actor: { userId: 3, username: "rahul", role: "Customer" },
    message: "Please arrange the pickup after 5 pm, nobody is home during the day.",
    data: {},
  });
  eventDocs.push({
    returnId: 7,
    type: "STAFF_NOTE",
    at: at("2026-10-05", "10:30"),
    actor: staff,
    message: "Parcel received at Bengaluru warehouse. Queued for inspection.",
    data: { bay: "B-04" },
  });

  if (eventDocs.length > 0) await events.insertMany(eventDocs);

  console.log(`MongoDB database "${dbName}" is ready:`);
  console.table([
    { collection: "inspection_reports", documents: await reports.countDocuments() },
    { collection: "return_events", documents: await events.countDocuments() },
  ]);
} finally {
  await client.close();
  await sql.end();
}
