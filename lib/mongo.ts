import { MongoClient, type Db } from "mongodb";
import type { Role } from "./session";

// MongoDB stores the semi-structured side of reverse logistics:
//   inspection_reports - category-specific inspection details
//   return_events      - activity feed with varying payloads per event type
// Collections, validators and indexes are created by scripts/mongo-setup.mjs.

const globalForMongo = globalThis as unknown as { mongoClient?: Promise<MongoClient> };

export async function getMongoDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set. See .env.example.");

  if (!globalForMongo.mongoClient) {
    globalForMongo.mongoClient = new MongoClient(uri, {
      serverSelectionTimeoutMS: 3000,
    }).connect();
  }

  try {
    const client = await globalForMongo.mongoClient;
    return client.db(process.env.MONGODB_DB || "reverse_logistics");
  } catch (error) {
    globalForMongo.mongoClient = undefined; // retry on the next request
    throw error;
  }
}

export interface ChecklistEntry {
  item: string;
  passed: boolean;
  note?: string;
}

export interface Defect {
  type: string;
  severity: "minor" | "major" | "critical";
  location?: string;
}

export interface InspectionReport {
  inspectionId: number;
  returnId: number;
  productId: number;
  productName: string;
  category: string;
  inspector: { userId: number; username: string };
  inspectedAt: Date;
  conditionGrade: string;
  conditionScore: number;
  disposition: string;
  checklist: ChecklistEntry[];
  attributes: Record<string, unknown>;
  defects: Defect[];
  photos: { fileName: string; caption?: string }[];
  notes: string;
  createdAt: Date;
}

export type ReturnEventType =
  | "REQUEST_CREATED"
  | "STATUS_CHANGED"
  | "PICKUP_SCHEDULED"
  | "PICKUP_SCAN"
  | "INSPECTION_COMPLETED"
  | "REFUND_ISSUED"
  | "CUSTOMER_MESSAGE"
  | "STAFF_NOTE";

export interface ReturnEvent {
  returnId: number;
  type: ReturnEventType;
  at: Date;
  actor: {
    userId: number | null;
    username: string | null;
    role: Role | "Courier" | "System";
  };
  message: string;
  data: Record<string, unknown>;
}

export const inspectionReports = async () =>
  (await getMongoDb()).collection<InspectionReport>("inspection_reports");

export const returnEvents = async () =>
  (await getMongoDb()).collection<ReturnEvent>("return_events");

// The activity feed is supplementary: if MongoDB is down, the SQL write
// (the system of record) must still succeed, so failures are only logged.
export async function logReturnEvent(
  event: Omit<ReturnEvent, "at" | "data"> & { data?: Record<string, unknown> }
): Promise<void> {
  try {
    const events = await returnEvents();
    await events.insertOne({ ...event, data: event.data ?? {}, at: new Date() });
  } catch (error) {
    console.error("Could not record return event in MongoDB:", error);
  }
}
