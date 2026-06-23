require("dotenv").config();
//console.log("GROQ KEY:", process.env.GROQ_API_KEY ? "FOUND" : "NOT FOUND");

const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const Groq = require("groq-sdk");
const { franc } = require("franc");
const translate = require("@vitalets/google-translate-api");

const app = express();
app.use(cors());
app.use(express.json());

// ================= DATABASE =================
const db = new Database("../database/nl2sql.db");

// ================= GROQ =================
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// ================= CLEAN SQL =================
function cleanSQL(sql) {
  return sql
    .replace(/```sql/g, "")
    .replace(/```/g, "")
    .replace(/;\s*$/g, "")
    .trim();
}

// ================= NL → SQL =================
async function convertQuestionToSQL(question) {
  const prompt = `
You are an AI that converts natural language into SQL.

IMPORTANT RULES:
- Always use SINGLE QUOTES for strings (example: 'Zoho')
- Never use double quotes for values
- Allowed: SELECT, INSERT, UPDATE, DELETE
- Never generate DROP, ALTER, TRUNCATE
- Return ONLY SQL query without markdown or explanation

Tables:
students(student_id, student_name, department, cgpa, email)
placements(id, student_name, department, package_lpa, company_name, year)

Question: ${question}
`;

  console.log("Sending request to Groq...");

  const response = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    stream: false, // IMPORTANT FIX for Node 22 stability
  });

  console.log("Groq response received");

  let sql = response.choices[0].message.content;
  sql = cleanSQL(sql);

  return sql;
}

// ================= API =================
app.post("/api/ask", async (req, res) => {
  try {
    const question = req.body.question;

    if (!question || !question.trim()) {
      return res.json({
        sql: null,
        columns: [],
        rows: [],
        message: "❌ Empty question",
      });
    }

    // ===== Language detection =====
    const detectedLang = franc(question);
    console.log("Detected:", detectedLang);

    let englishQuestion = question;

    try {
      const translated = await translate(question, { to: "en" });
      englishQuestion = translated.text;
    } catch {
      console.log("Translation failed. Using original.");
    }

    console.log("English:", englishQuestion);

    // ===== Generate SQL =====
    const generatedSQL = await convertQuestionToSQL(englishQuestion);

    if (!generatedSQL) {
      return res.json({
        sql: null,
        columns: [],
        rows: [],
        message: "❌ SQL generation failed",
      });
    }

    console.log("SQL:", generatedSQL);

    const lowerSQL = generatedSQL.toLowerCase();
    let rows = [];
    let tableName = "";

    // ================= SAFETY CHECK =================
    if (
      lowerSQL.includes("drop") ||
      lowerSQL.includes("alter") ||
      lowerSQL.includes("truncate")
    ) {
      return res.json({
        sql: generatedSQL,
        columns: [],
        rows: [],
        message: "❌ Dangerous query blocked",
      });
    }

    // ================= SELECT =================
    if (lowerSQL.startsWith("select")) {
      try {
        rows = db.prepare(generatedSQL).all();
      } catch (err) {
        console.log("SQL Error:", err.message);
        return res.json({
          sql: generatedSQL,
          columns: [],
          rows: [],
          message: "❌ Invalid SQL generated",
        });
      }
    }

    // ================= INSERT =================
    else if (lowerSQL.startsWith("insert")) {
      if (lowerSQL.includes("students")) tableName = "students";
      if (lowerSQL.includes("placements")) tableName = "placements";

      const match = generatedSQL.match(/values\s*\((.*)\)/i);

      if (match) {
        let values = match[1]
          .split(",")
          .map(v => v.trim().replace(/['"]/g, ""));

        // STUDENTS
        if (tableName === "students") {
          let [student_name, department, cgpa, email] = values;

          const existing = db.prepare(`
            SELECT * FROM students
            WHERE LOWER(student_name) = ?
            OR LOWER(email) = ?
          `).get(student_name.toLowerCase(), email.toLowerCase());

          if (existing) {
            return res.json({
              sql: generatedSQL,
              columns: Object.keys(existing),
              rows: [existing],
              message: "⚠️ Duplicate student exists",
            });
          }

          db.prepare(`
            INSERT INTO students (student_name, department, cgpa, email)
            VALUES (?, ?, ?, ?)
          `).run(student_name, department, cgpa, email);
        }

        // PLACEMENTS
        if (tableName === "placements") {
          let [student_name, department, package_lpa, company_name, year] = values;

          const existing = db.prepare(`
            SELECT * FROM placements
            WHERE LOWER(student_name) = ?
            AND LOWER(company_name) = ?
            AND year = ?
          `).get(student_name.toLowerCase(), company_name.toLowerCase(), year);

          if (existing) {
            return res.json({
              sql: generatedSQL,
              columns: Object.keys(existing),
              rows: [existing],
              message: "⚠️ Placement already exists",
            });
          }

          db.prepare(`
            INSERT INTO placements
            (student_name, department, package_lpa, company_name, year)
            VALUES (?, ?, ?, ?, ?)
          `).run(student_name, department, package_lpa, company_name, year);
        }
      }

      if (tableName) {
        rows = db.prepare(`SELECT * FROM ${tableName}`).all();
      }
    }

    // ================= UPDATE =================
    else if (lowerSQL.startsWith("update")) {
      if (lowerSQL.includes("students")) tableName = "students";
      if (lowerSQL.includes("placements")) tableName = "placements";

      db.prepare(generatedSQL).run();

      if (tableName) {
        rows = db.prepare(`SELECT * FROM ${tableName}`).all();
      }
    }

    // ================= DELETE =================
    else if (lowerSQL.startsWith("delete")) {
      if (lowerSQL.includes("students")) tableName = "students";
      if (lowerSQL.includes("placements")) tableName = "placements";

      db.prepare(generatedSQL).run();

      if (tableName) {
        rows = db.prepare(`SELECT * FROM ${tableName}`).all();
      }
    }

    // ================= INVALID =================
    else {
      return res.json({
        sql: generatedSQL,
        columns: [],
        rows: [],
        message: "❌ Only SELECT, INSERT, UPDATE, DELETE allowed",
      });
    }

    // ================= RESPONSE =================
    res.json({
      sql: generatedSQL,
      columns: rows.length ? Object.keys(rows[0]) : [],
      rows,
      message: lowerSQL.startsWith("select")
        ? rows.length
          ? "✅ Success"
          : "⚠️ No data found"
        : "✅ Operation successful",
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      sql: null,
      columns: [],
      rows: [],
      message: "Server error",
    });
  }
});

// ================= SERVER =================
app.listen(8080, () => {
  console.log("🚀 Backend running on port 8080");
});
