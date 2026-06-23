import React, { useState } from "react";
import { convertToSQL } from "./services/api";

function App() {

  const [input, setInput] = useState("");
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [sql, setSql] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Voice recognition
  const startVoiceInput = () => {

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Speech recognition not supported");
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = "en-IN";
    recognition.start();

    recognition.onresult = (event) => {
      setInput(event.results[0][0].transcript);
    };
  };

  // Convert NL to SQL
  const handleConvert = async () => {

    if (!input.trim()) return;

    setLoading(true);
    setColumns([]);
    setRows([]);
    setSql("");
    setMessage("");

    try {

      const data = await convertToSQL(input);

      if (!data.sql) {
        setMessage("❌ Question not matched with database");
        setLoading(false);
        return;
      }

      setSql(data.sql);

      const lowerSQL = data.sql.toLowerCase();

      if (lowerSQL.startsWith("select")) {

        setColumns(data.columns || []);
        setRows(data.rows || []);

        setMessage(
          data.rows.length === 0
            ? "⚠️ No matching records found"
            : "✅ Query executed successfully"
        );

      } else {

        setMessage("✅ Query executed");

      }

    } catch (err) {

      console.error(err);
      setMessage("Backend error. Check server");

    }

    setLoading(false);
  };

  return (

    <div style={styles.body}>

      <div style={styles.container}>

        <h1 style={styles.title}>
          SQL Query Generator
        </h1>

        {/* Input */}
        <input
          type="text"
          placeholder="Ask your database..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={styles.input}
        />

        {/* Voice */}
        <button
          onClick={startVoiceInput}
          style={styles.voice}
        >
          🎤 Voice Query
        </button>

        {/* Convert */}
        <button
          onClick={handleConvert}
          disabled={loading}
          style={styles.convert}
        >
          {loading ? "Converting..." : "Convert to SQL Query"}
        </button>

        {/* Message */}
        {message && (
          <p style={styles.message}>{message}</p>
        )}

        {/* SQL Output */}
        {sql && (
          <div style={{ marginTop: "25px" }}>

            <h3>Generated SQL</h3>

            <pre style={styles.sql}>
              {sql}
            </pre>

          </div>
        )}

        {/* Table */}
        {rows.length > 0 && (

          <div style={{ marginTop: "25px", overflowX: "auto" }}>

            <h3>Query Result</h3>

            <table style={styles.table}>

              <thead>

                <tr>
                  {columns.map((col) => (
                    <th key={col} style={styles.th}>
                      {col}
                    </th>
                  ))}
                </tr>

              </thead>

              <tbody>

                {rows.map((row, idx) => (
                  <tr key={idx}>

                    {columns.map((col) => (
                      <td key={col} style={styles.td}>
                        {row[col]}
                      </td>
                    ))}

                  </tr>
                ))}

              </tbody>

            </table>

          </div>

        )}

      </div>

    </div>

  );
}

const styles = {

  body: {
    margin: 0,
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontFamily: "Segoe UI",

    background: "linear-gradient(135deg,#1c1c1c,#000000)"
  },

  container: {
    width: "1200px",
    maxWidth: "95%",
    padding: "40px",
    borderRadius: "25px",

    background: "#ffffff",

    boxShadow: "0 20px 50px rgba(0,0,0,0.4)",

    textAlign: "center"
  },

  title: {
    fontSize: "36px",
    color: "#333",
    marginBottom: "25px"
  },

  input: {
    width: "70%",
    padding: "14px",
    borderRadius: "10px",
    border: "1px solid #ccc",
    fontSize: "16px",
    marginBottom: "15px"
  },

  voice: {
    width: "70%",
    padding: "14px",
    borderRadius: "10px",
    border: "none",
    background: "#111",
    color: "white",
    fontSize: "16px",
    marginBottom: "10px",
    cursor: "pointer"
  },

  convert: {
    width: "70%",
    padding: "14px",
    borderRadius: "10px",
    border: "none",

    background: "linear-gradient(90deg,#ff8008,#ffc837)",

    color: "white",
    fontSize: "16px",
    fontWeight: "bold",
    cursor: "pointer"
  },

  message: {
    marginTop: "15px",
    fontWeight: "500"
  },

  sql: {
  background: "#f5f5f5",
  padding: "15px",
  borderRadius: "10px",
  fontFamily: "monospace",
  fontSize: "15px",

  whiteSpace: "normal",     // allows normal wrapping
  overflowWrap: "anywhere", // wraps when needed
  lineHeight: "1.6",

  textAlign: "left"
},

  table: {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: "15px"
  },

  th: {
    padding: "12px",
    border: "1px solid #ddd",

    background: "#ff8008",

    color: "white"
  },

  td: {
    padding: "10px",
    border: "1px solid #ddd"
  }

};

export default App;