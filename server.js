const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");
const { generateBriefing, getBriefing, listBriefings } = require("./lib/generator");
const { pushBriefingToWecom, pushSummaryToWecom } = require("./lib/wecomPusher");

const HOST = "127.0.0.1";
const PORT = Number(process.env.BRIEFING_PORT || 4311);
const PUBLIC_DIR = path.join(__dirname, "public");

const sendJson = (res, statusCode, body) => {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};

const sendFile = (res, fullPath, contentType) => {
  if (!fs.existsSync(fullPath)) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }
  res.writeHead(200, { "Content-Type": contentType });
  res.end(fs.readFileSync(fullPath));
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

const summarizeIntro = (text) => {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const sentence = normalized.split(/[。！？!?.]/)[0] || normalized;
  return sentence.slice(0, 80);
};

const buildSummaryFromBriefing = (briefingJson) => {
  const items = Array.isArray(briefingJson?.items) ? briefingJson.items : [];
  const lines = items
    .map((item, idx) => {
      const intro = item.introZh || item.summary || item.introEn || "";
      const oneLine = summarizeIntro(intro);
      return oneLine ? `${idx + 1}. ${oneLine}` : "";
    })
    .filter(Boolean);

  return lines.length > 0 ? `本期共 ${lines.length} 条热点：\n\n${lines.join("\n\n")}` : "";
};

const server = http.createServer(async (req, res) => {
  const method = req.method || "GET";
  const parsedUrl = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  const pathname = parsedUrl.pathname;

  try {
    if (method === "GET" && pathname === "/") {
      sendFile(res, path.join(PUBLIC_DIR, "index.html"), "text/html; charset=utf-8");
      return;
    }
    if (method === "GET" && pathname === "/styles.css") {
      sendFile(res, path.join(PUBLIC_DIR, "styles.css"), "text/css; charset=utf-8");
      return;
    }
    if (method === "GET" && pathname === "/app.js") {
      sendFile(res, path.join(PUBLIC_DIR, "app.js"), "application/javascript; charset=utf-8");
      return;
    }

    if (method === "GET" && pathname === "/api/briefings") {
      sendJson(res, 200, { briefings: listBriefings() });
      return;
    }

    if (method === "GET" && pathname.startsWith("/api/briefings/")) {
      const id = pathname.replace("/api/briefings/", "");
      const briefing = getBriefing(id);
      if (!briefing) {
        sendJson(res, 404, { error: "Briefing not found" });
        return;
      }
      sendJson(res, 200, briefing);
      return;
    }

    if (method === "POST" && pathname === "/api/generate") {
      const rawBody = await readBody(req);
      const payload = rawBody ? JSON.parse(rawBody) : {};
      const briefing = await generateBriefing({
        maxItems: payload.maxItems,
      });
      sendJson(res, 200, { ok: true, briefing });
      return;
    }

    if (method === "POST" && pathname.startsWith("/api/push/")) {
      const id = pathname.replace("/api/push/", "");
      const existed = getBriefing(id);
      if (!existed || !existed.json) {
        sendJson(res, 404, { error: "Briefing not found" });
        return;
      }

      const rawBody = await readBody(req);
      const payload = rawBody ? JSON.parse(rawBody) : {};
      const webhookUrl = payload.webhook || process.env.WECHAT_WORK_WEBHOOK;

      // 始终优先推送“摘要文案”，前端没传也由后端自动生成，避免回落到旧模板
      const summaryText =
        (payload.summary && String(payload.summary).trim()) || buildSummaryFromBriefing(existed.json);

      let result;
      if (summaryText) {
        result = await pushSummaryToWecom(webhookUrl, existed.json, summaryText);
      } else {
        result = await pushBriefingToWecom(webhookUrl, existed.json);
      }

      sendJson(res, 200, {
        ok: true,
        id,
        result,
      });
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Briefing platform running at http://${HOST}:${PORT}`);
});
