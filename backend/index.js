require("dotenv").config();
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

// ================= NL → SQL =================
async function convertQuestionToSQL(question) {
  const prompt = `
You are an AI that converts natural language into SQL.

Rules:
- Allowed: SELECT, INSERT, UPDATE, DELETE
- SELECT may include JOIN between students and placements
- Never generate DROP, ALTER, TRUNCATE
- Tables:
  students(student_id, student_name, department, cgpa, email)
  placements(id, student_name, department, package_lpa, company_name, year)

Return ONLY SQL query.

Question: ${question}
`;

  const response = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b",
    messages: [{ role: "user", content: prompt }],
  });

  return response.choices[0].message.content.trim();
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

    // ===== Block dangerous queries =====
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

      rows = db.prepare(generatedSQL).all();

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

        // ===== STUDENTS =====
        if (tableName === "students") {

          let [student_name, department, cgpa, email] = values;

          student_name = student_name.toLowerCase();
          department = department.toLowerCase();
          email = email.toLowerCase();

          const existing = db.prepare(`
            SELECT * FROM students
            WHERE LOWER(student_name) = ?
            OR LOWER(email) = ?
          `).get(student_name, email);

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

        // ===== PLACEMENTS =====
        if (tableName === "placements") {

          let [student_name, department, package_lpa, company_name, year] = values;

          student_name = student_name.toLowerCase();
          department = department.toLowerCase();
          company_name = company_name.toLowerCase();

          const existing = db.prepare(`
            SELECT * FROM placements
            WHERE LOWER(student_name) = ?
            AND LOWER(company_name) = ?
            AND year = ?
          `).get(student_name, company_name, year);

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