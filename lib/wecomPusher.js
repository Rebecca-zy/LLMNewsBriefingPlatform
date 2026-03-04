const http = require("http");
const https = require("https");
const { URL } = require("url");
const MAX_MARKDOWN_LENGTH = 3900;
const MAX_ITEMS = 6;
const MAX_TITLE_LENGTH = 90;
const MAX_INTRO_LENGTH = 180;

const normalizeWebhookUrl = (rawValue) => {
  const value = String(rawValue || "").trim().replace(/^['"]|['"]$/g, "");
  if (!value) return "";

  // Support accidental input like: webhook=https://...
  const extracted = value.match(/https?:\/\/[^\s]+/i);
  let candidate = extracted ? extracted[0].trim() : value;

  // Support pasting only robot key
  const maybeKey = candidate.replace(/^key=/i, "").trim();
  if (!/^https?:\/\//i.test(candidate) && /^[0-9a-zA-Z_-]{16,}$/.test(maybeKey)) {
    candidate = `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${maybeKey}`;
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(
      "Invalid webhook format. Please input full URL like https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx or just the robot key."
    );
  }

  const validHost = parsed.hostname === "qyapi.weixin.qq.com";
  const validPath = parsed.pathname === "/cgi-bin/webhook/send";
  const hasKey = parsed.searchParams.has("key");
  if (!validHost || !validPath || !hasKey) {
    throw new Error(
      "Invalid WeCom webhook URL. Expected host qyapi.weixin.qq.com and path /cgi-bin/webhook/send with ?key=..."
    );
  }
  return parsed.toString();
};

const postJson = (urlString, payload, timeoutMs = 12000) =>
  new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(urlString);
    } catch (error) {
      reject(new Error("Invalid webhook URL"));
      return;
    }

    const client = parsed.protocol === "https:" ? https : http;
    const body = JSON.stringify(payload);
    const req = client.request(
      {
        method: "POST",
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "User-Agent": "LLMNewsBriefingBot/1.0",
        },
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${text}`));
            return;
          }
          try {
            resolve(JSON.parse(text));
          } catch {
            resolve({ raw: text });
          }
        });
      }
    );

    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timeout after ${timeoutMs}ms`)));
    req.on("error", reject);
    req.write(body);
    req.end();
  });

const renderWecomMarkdown = (briefing) => {
  const truncate = (text, maxLength) => {
    const value = String(text || "").trim();
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength - 1)}…`;
  };

  const lines = [];
  lines.push(`## ${truncate(briefing.title, 120)}`);
  lines.push(`> 更新时间：${briefing.generatedAt}`);
  lines.push(`> ${truncate(briefing.trend || "今日趋势：暂无", 180)}`);
  lines.push("");

  const items = Array.isArray(briefing.items) ? briefing.items.slice(0, MAX_ITEMS) : [];
  if (items.length === 0) {
    lines.push("今日未生成可展示热点。");
    return lines.join("\n");
  }

  let content = lines.join("\n");
  let included = 0;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const directions = Array.isArray(item.explorationDirections) && item.explorationDirections.length
      ? item.explorationDirections
      : Array.isArray(item.applicationDomains)
      ? item.applicationDomains
      : [];
    const directionsText = directions.length ? directions.slice(0, 3).join("；") : "待模型推测";
    const intro = truncate(item.introZh || item.summary || "暂无简介", MAX_INTRO_LENGTH);
    const block = [
      `**${i + 1}. ${truncate(item.title, MAX_TITLE_LENGTH)}**`,
      `- 可挖掘方向：${truncate(directionsText, 160)}`,
      `- 简介：${intro}`,
      `- 链接：${truncate(item.link, 180)}`,
      "",
    ].join("\n");

    if (content.length + block.length > MAX_MARKDOWN_LENGTH) {
      break;
    }
    content += block;
    included += 1;
  }

  if (included < items.length && content.length + 30 < MAX_MARKDOWN_LENGTH) {
    content += `\n_其余 ${items.length - included} 条已省略_`;
  }

  if (content.length > MAX_MARKDOWN_LENGTH) {
    content = `${content.slice(0, MAX_MARKDOWN_LENGTH - 1)}…`;
  }
  return content;
};

const pushBriefingToWecom = async (webhookUrl, briefing) => {
  if (!webhookUrl) {
    throw new Error("WECHAT_WORK_WEBHOOK is not configured");
  }
  const normalizedWebhook = normalizeWebhookUrl(webhookUrl);

  const payload = {
    msgtype: "markdown",
    markdown: {
      content: renderWecomMarkdown(briefing),
    },
  };

  const response = await postJson(normalizedWebhook, payload);
  if (typeof response.errcode === "number" && response.errcode !== 0) {
    throw new Error(`WeCom push failed: errcode=${response.errcode}, errmsg=${response.errmsg || "unknown"}`);
  }
  return response;
};

const pushSummaryToWecom = async (webhookUrl, briefing, summaryText) => {
  if (!webhookUrl) {
    throw new Error("WECHAT_WORK_WEBHOOK is not configured");
  }
  const normalizedWebhook = normalizeWebhookUrl(webhookUrl);
  const text = String(summaryText || "").trim();
  if (!text) {
    throw new Error("Summary text is empty");
  }

  const title = briefing?.title || "大模型新闻简报摘要";
  const firstLink = Array.isArray(briefing?.items) && briefing.items[0] ? briefing.items[0].link : "";
  const linkLine = firstLink ? `\n\n [查看详情](https://www.baidu.com)` : "";

  let content = `## ${title}\n\n${text}${linkLine}`;
  if (content.length > MAX_MARKDOWN_LENGTH) {
    content = `${content.slice(0, MAX_MARKDOWN_LENGTH - 1)}…`;
  }

  const payload = {
    msgtype: "markdown",
    markdown: { content },
  };

  const response = await postJson(normalizedWebhook, payload);
  if (typeof response.errcode === "number" && response.errcode !== 0) {
    throw new Error(`WeCom push failed: errcode=${response.errcode}, errmsg=${response.errmsg || "unknown"}`);
  }
  return response;
};

module.exports = {
  normalizeWebhookUrl,
  pushBriefingToWecom,
  pushSummaryToWecom,
  renderWecomMarkdown,
};
