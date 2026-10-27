import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";
import { inspectionReports } from "@/lib/mongo";

// Converts free text into a MySQL BOOLEAN MODE full-text query where every
// word is a prefix match ("charg" finds "charging"). Boolean mode is used
// because natural-language mode ignores words found in more than half of
// the rows, which hides results on small data sets.
export function toBooleanQuery(text: string): string | null {
  const words = text
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((word) => word.length >= 2);
  if (words.length === 0) return null;
  return words.map((word) => `${word}*`).join(" ");
}

export interface SearchResults {
  returns: RowDataPacket[];
  inspections: RowDataPacket[];
  products: RowDataPacket[];
  reports: {
    inspectionId: number;
    returnId: number;
    productName: string;
    category: string;
    notes: string;
    score: number;
  }[];
  mongoError?: string;
}

// One search box, two databases: MySQL FULLTEXT indexes over return
// comments, inspection remarks and product names, plus a MongoDB $text index
// over the detailed inspection reports. Results are ranked by relevance.
export async function searchEverything(text: string): Promise<SearchResults> {
  const query = toBooleanQuery(text);
  if (!query) return { returns: [], inspections: [], products: [], reports: [] };

  const [[returns], [inspections], [products]] = await Promise.all([
    pool.query<RowDataPacket[]>(
      `SELECT r.ReturnID, r.ReturnStatus, r.Comments, p.ProductName,
              MATCH(r.Comments) AGAINST (? IN BOOLEAN MODE) AS score
         FROM RETURNS r
         JOIN ORDER_ITEM oi ON oi.OrderItemID = r.OrderItemID
         JOIN PRODUCT p     ON p.ProductID = oi.ProductID
        WHERE MATCH(r.Comments) AGAINST (? IN BOOLEAN MODE)
        ORDER BY score DESC
        LIMIT 20`,
      [query, query]
    ),
    pool.query<RowDataPacket[]>(
      `SELECT i.InspectionID, i.ReturnID, i.ProductCondition, i.Remarks,
              MATCH(i.Remarks) AGAINST (? IN BOOLEAN MODE) AS score
         FROM INSPECTION i
        WHERE MATCH(i.Remarks) AGAINST (? IN BOOLEAN MODE)
        ORDER BY score DESC
        LIMIT 20`,
      [query, query]
    ),
    pool.query<RowDataPacket[]>(
      `SELECT p.ProductID, p.ProductName, p.SKU, c.CategoryName,
              MATCH(p.ProductName) AGAINST (? IN BOOLEAN MODE) AS score
         FROM PRODUCT p
         JOIN CATEGORY c ON c.CategoryID = p.CategoryID
        WHERE MATCH(p.ProductName) AGAINST (? IN BOOLEAN MODE)
        ORDER BY score DESC
        LIMIT 20`,
      [query, query]
    ),
  ]);

  let reports: SearchResults["reports"] = [];
  let mongoError: string | undefined;
  try {
    const collection = await inspectionReports();
    const docs = await collection
      .find(
        { $text: { $search: text } },
        {
          projection: {
            _id: 0,
            inspectionId: 1,
            returnId: 1,
            productName: 1,
            category: 1,
            notes: 1,
            score: { $meta: "textScore" },
          },
        }
      )
      .sort({ score: { $meta: "textScore" } })
      .limit(20)
      .toArray();
    reports = docs as unknown as SearchResults["reports"];
  } catch (error) {
    console.error("MongoDB search failed:", error);
    mongoError = "MongoDB is unavailable, so inspection reports were not searched.";
  }

  return { returns, inspections, products, reports, mongoError };
}
