import axios from "axios";

export const convertToSQL = async (question) => {
  try {
    const response = await axios.post("http://localhost:8080/api/ask", { question });
    return response.data;
  } catch (error) {
    console.error("API error:", error);
    return { sql: null, columns: [], rows: [], message: "Server error" };
  }
};
