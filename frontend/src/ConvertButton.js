import React from "react";

function ConvertButton({ onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ width: "100%", padding: "10px", marginBottom: "20px" }}
    >
      Convert to SQL
    </button>
  );
}

export default ConvertButton;
