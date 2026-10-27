export interface Column<Row> {
  label: string;
  render: (row: Row) => React.ReactNode;
  numeric?: boolean;
}

export default function DataTable<Row>({
  columns,
  rows,
  empty = "No data.",
}: {
  columns: Column<Row>[];
  rows: Row[];
  empty?: string;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.label} className={column.numeric ? "num" : undefined}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => (
                <td key={column.label} className={column.numeric ? "num" : undefined}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="table-empty">{empty}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
