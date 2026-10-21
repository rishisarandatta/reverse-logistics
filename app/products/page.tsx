import pool from "@/lib/db";
import type { RowDataPacket } from "mysql2";

interface Product extends RowDataPacket {
  ProductID: number;
  ProductName: string;
  CategoryID: number | null;
  SKU: string | null;
  UnitPrice: number;
}

export default async function ProductsPage() {
  const [products] = await pool.query<Product[]>(`
    SELECT
      ProductID,
      ProductName,
      CategoryID,
      SKU,
      UnitPrice
    FROM PRODUCT
    ORDER BY ProductID
  `);

  return (
    <main>
      <h1>Product Management</h1>

      <table border={1} cellPadding={10}>
        <thead>
          <tr>
            <th>Product ID</th>
            <th>Product Name</th>
            <th>Category ID</th>
            <th>SKU</th>
            <th>Unit Price</th>
          </tr>
        </thead>

        <tbody>
          {products.map((product) => (
            <tr key={product.ProductID}>
              <td>{product.ProductID}</td>
              <td>{product.ProductName}</td>
              <td>{product.CategoryID ?? "N/A"}</td>
              <td>{product.SKU ?? "N/A"}</td>
              <td>₹{Number(product.UnitPrice).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}