import type { RowDataPacket } from "mysql2";
import pool from "@/lib/db";

export interface Lookups {
  categories: { CategoryID: number; CategoryName: string }[];
  reasons: { ReturnReasonID: number; ReasonName: string; IsSellerFault: number }[];
  couriers: { CourierID: number; CourierName: string }[];
  warehouses: { WarehouseID: number; WarehouseName: string; Location: string | null }[];
}

// Reference data used by dropdowns across the application.
export async function getLookups(): Promise<Lookups> {
  const [categories, reasons, couriers, warehouses] = await Promise.all([
    pool.query<RowDataPacket[]>("SELECT CategoryID, CategoryName FROM CATEGORY ORDER BY CategoryName"),
    pool.query<RowDataPacket[]>(
      "SELECT ReturnReasonID, ReasonName, IsSellerFault FROM RETURN_REASON ORDER BY ReturnReasonID"
    ),
    pool.query<RowDataPacket[]>("SELECT CourierID, CourierName FROM COURIER ORDER BY CourierName"),
    pool.query<RowDataPacket[]>(
      "SELECT WarehouseID, WarehouseName, Location FROM WAREHOUSE ORDER BY WarehouseName"
    ),
  ]);

  return {
    categories: categories[0] as Lookups["categories"],
    reasons: reasons[0] as Lookups["reasons"],
    couriers: couriers[0] as Lookups["couriers"],
    warehouses: warehouses[0] as Lookups["warehouses"],
  };
}
