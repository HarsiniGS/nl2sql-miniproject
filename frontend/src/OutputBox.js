import React from "react";

const OutputBox = ({ columns, rows }) => {
  if (!rows || rows.length === 0) return <p>No data to display.</p>;

  return (
    <div style={{ marginTop: "20px", overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          textAlign: "left",
        }}
      >
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                style={{
                  border: "1px solid #ccc",
                  padding: "8px",
                  background: "#f5f5f5",
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              {columns.map((col) => (
                <td key={col} style={{ border: "1px solid #ccc", padding: "8px" }}>
                  {row[col]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default OutputBox;
