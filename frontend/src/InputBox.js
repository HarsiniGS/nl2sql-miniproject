import React from "react";

function InputBox({ value, onChange }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Type your question here..."
      style={{ width: "100%", height: "80px", marginBottom: "10px" }}
    />
  );
}
export default InputBox;
