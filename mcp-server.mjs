import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// --- MCP Endpoint ---
app.post("/mcp", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt" });
    }

    const result = await genAI.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    res.json({ reply: result.response.text() });
  } catch (err) {
    console.error("MCP Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- Default route for health check ---
app.get("/", (req, res) => {
  res.send("✅ MCP + Gemini server running successfully!");
});

// --- Start the server ---
async function startServerWithFallback(app, preferredPorts = []) {
  const ports = Array.from(new Set(preferredPorts.filter(Boolean)));
  for (const port of ports) {
    // Try to listen on the port
    try {
      await new Promise((resolve, reject) => {
        const srv = app.listen(port)
          .once('listening', () => resolve(srv))
          .once('error', (err) => reject(err));
      });
      return port;
    } catch (err) {
      // If port is in use, try next
      if (err && err.code === 'EADDRINUSE') continue;
      // For other errors, rethrow
      throw err;
    }
  }
  throw new Error('No available ports in the provided list');
}

(async () => {
  try {
    const envPort = process.env.PORT ? Number(process.env.PORT) : null;
    const chosenPort = await startServerWithFallback(app, [envPort, 3000, 4000, 5000].filter(Boolean));
    process.env.PORT = String(chosenPort);
    console.log(`🚀 MCP server is live on port ${chosenPort}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();
