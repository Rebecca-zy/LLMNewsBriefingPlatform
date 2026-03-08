const fs = require("fs");
const path = require("path");
const { requestText } = require("./fetcher");
const { parseRss } = require("./rssParser");
const { clamp, decodeXmlEntities, slugifyDate, stripHtml } = require("./utils");

const ROOT = path.resolve(__dirname, "..");
const SOURCES_PATH = path.join(ROOT, "config", "sources.json");
const OUTPUT_DIR = path.join(ROOT, "data", "briefings");
// 已移除按来源限额，改为全局Top N

const KEYWORD_WEIGHTS = [
  { keyword: "open-source", weight: 8 },
  { keyword: "open source", weight: 8 },
  { keyword: "开源", weight: 8 },
  { keyword: "release", weight: 7 },
  { keyword: "launch", weight: 7 },
  { keyword: "模型", weight: 7 },
  { keyword: "api", weight: 6 },
  { keyword: "benchmark", weight: 6 },
  { keyword: "融资", weight: 6 },
  { keyword: "regulation", weight: 6 },
  { keyword: "安全", weight: 5 },
];

const DIRECTION_RULES = [
  {
    keywords: ["search", "retrieval", "query", "检索", "搜索"],
    direction: "构建语义检索与知识问答场景，优化召回率与答案准确性",
  },
  {
    keywords: ["customer support", "客服", "agent", "help desk", "ticket", "工单"],
    direction: "落地智能客服与工单分流闭环，降低人工响应时延",
  },
  {
    keywords: ["video", "image", "vision", "audio", "multimodal", "图像", "视频", "语音"],
    direction: "探索多模态内容理解、审核与素材管理自动化",
  },
  {
    keywords: ["developer", "code", "coding", "copilot", "编程", "工程"],
    direction: "用于研发提效，如代码生成、测试辅助与文档自动化",
  },
  {
    keywords: ["marketing", "campaign", "creative", "content", "广告", "营销", "内容"],
    direction: "应用于内容生产与营销投放优化，提升转化效率",
  },
  {
    keywords: ["education", "learning", "training", "教学", "学习", "课程"],
    direction: "沉淀教学辅导与员工培训助手，支持规模化知识传递",
  },
  {
    keywords: ["medical", "health", "clinic", "hospital", "医疗", "健康"],
    direction: "尝试医疗信息整理与辅助分析，提升流程标准化程度",
  },
  {
    keywords: ["finance", "risk", "fraud", "bank", "trading", "金融", "风控"],
    direction: "落地风控预警与投研信息处理，增强决策效率",
  },
  {
    keywords: ["api", "inference", "deployment", "benchmark", "推理", "部署", "开源"],
    direction: "推进模型服务化部署与成本优化，验证稳定性与吞吐表现",
  },
  {
    keywords: ["policy", "regulation", "compliance", "governance", "监管", "合规", "政策"],
    direction: "完善治理与合规流程，建立审计与风险控制机制",
  },
];

const CATEGORY_RULES = [
  {
    category: "技术突破",
    weightedKeywords: [
      { kw: "breakthrough", w: 4 },
      { kw: "sota", w: 4 },
      { kw: "state-of-the-art", w: 4 },
      { kw: "new architecture", w: 3 },
      { kw: "技术突破", w: 4 },
      { kw: "创新", w: 2 },
    ],
  },
  {
    category: "模型迭代",
    weightedKeywords: [
      { kw: "checkpoint", w: 4 },
      { kw: "fine-tuned", w: 4 },
      { kw: "embedding model", w: 3 },
      { kw: "new model", w: 2 },
      { kw: "model update", w: 3 },
      { kw: "模型迭代", w: 4 },
      { kw: "模型升级", w: 4 },
      { kw: "基座模型", w: 3 },
    ],
  },
  {
    category: "产品发布",
    weightedKeywords: [
      { kw: "introducing", w: 3 },
      { kw: "new product", w: 4 },
      { kw: "generally available", w: 3 },
      { kw: "发布", w: 2 },
      { kw: "上线", w: 2 },
      { kw: "推出", w: 2 },
    ],
  },
  {
    category: "功能更新",
    weightedKeywords: [
      { kw: "feature", w: 3 },
      { kw: "update", w: 3 },
      { kw: "upgrade", w: 3 },
      { kw: "changelog", w: 4 },
      { kw: "patch", w: 3 },
      { kw: "功能更新", w: 4 },
      { kw: "版本更新", w: 3 },
    ],
  },
  {
    category: "开源生态",
    weightedKeywords: [
      { kw: "open-source", w: 4 },
      { kw: "open source", w: 4 },
      { kw: "github", w: 3 },
      { kw: "apache", w: 3 },
      { kw: "mit license", w: 4 },
      { kw: "开源", w: 4 },
      { kw: "weights", w: 2 },
    ],
  },
  {
    category: "行业合作",
    weightedKeywords: [
      { kw: "partnership", w: 4 },
      { kw: "collaboration", w: 3 },
      { kw: "joint", w: 3 },
      { kw: "alliance", w: 4 },
      { kw: "合作", w: 4 },
      { kw: "联手", w: 4 },
    ],
  },
  {
    category: "融资并购",
    weightedKeywords: [
      { kw: "funding", w: 4 },
      { kw: "invest", w: 3 },
      { kw: "valuation", w: 4 },
      { kw: "acquire", w: 4 },
      { kw: "merger", w: 4 },
      { kw: "融资", w: 4 },
      { kw: "收购", w: 4 },
    ],
  },
  {
    category: "政策监管",
    weightedKeywords: [
      { kw: "regulation", w: 4 },
      { kw: "policy", w: 3 },
      { kw: "law", w: 3 },
      { kw: "compliance", w: 4 },
      { kw: "监管", w: 4 },
      { kw: "法案", w: 4 },
    ],
  },
  {
    category: "安全与治理",
    weightedKeywords: [
      { kw: "safety", w: 4 },
      { kw: "alignment", w: 4 },
      { kw: "red team", w: 4 },
      { kw: "risk", w: 2 },
      { kw: "治理", w: 4 },
      { kw: "审计", w: 3 },
      { kw: "安全", w: 3 },
    ],
  },
  {
    category: "基础设施",
    weightedKeywords: [
      { kw: "infrastructure", w: 4 },
      { kw: "deployment", w: 3 },
      { kw: "inference", w: 3 },
      { kw: "gpu", w: 3 },
      { kw: "latency", w: 2 },
      { kw: "throughput", w: 2 },
      { kw: "算力", w: 4 },
      { kw: "推理", w: 3 },
      { kw: "部署", w: 3 },
    ],
  },
  {
    category: "应用落地",
    weightedKeywords: [
      { kw: "use case", w: 3 },
      { kw: "workflow", w: 3 },
      { kw: "automation", w: 3 },
      { kw: "customer", w: 2 },
      { kw: "enterprise", w: 2 },
      { kw: "落地", w: 4 },
      { kw: "场景", w: 2 },
      { kw: "业务应用", w: 4 },
    ],
  },
];

const ensureOutputDir = () => {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
};

const loadSources = () => JSON.parse(fs.readFileSync(SOURCES_PATH, "utf8"));

const pickDiverseItems = (items, maxItems) => {
  const picked = [];
  const perSourceCount = new Map();
  let arxivCount = 0;
  const perSourceCap = maxItems >= 12 ? 3 : 2;
  const arxivCap = Math.max(2, Math.floor(maxItems * 0.35));

  const canPickItem = (item, allowSourceOverflow = false) => {
    const sourceName = item.sourceName || "unknown";
    const currentSourceCount = perSourceCount.get(sourceName) || 0;
    const isArxiv = /arxiv/i.test(sourceName) || /arxiv/i.test(item.link || "");

    if (!allowSourceOverflow && currentSourceCount >= perSourceCap) return false;
    if (isArxiv && arxivCount >= arxivCap) return false;
    return true;
  };

  for (const item of items) {
    if (picked.length >= maxItems) break;
    if (!canPickItem(item)) continue;
    const sourceName = item.sourceName || "unknown";
    const currentSourceCount = perSourceCount.get(sourceName) || 0;
    picked.push(item);
    perSourceCount.set(sourceName, currentSourceCount + 1);
    if (/arxiv/i.test(sourceName) || /arxiv/i.test(item.link || "")) arxivCount += 1;
  }

  if (picked.length < maxItems) {
    const pickedSet = new Set(picked.map((item) => `${item.sourceName}::${item.link}`));
    for (const item of items) {
      if (picked.length >= maxItems) break;
      const key = `${item.sourceName}::${item.link}`;
      if (pickedSet.has(key)) continue;
      if (!canPickItem(item, true)) continue;
      const sourceName = item.sourceName || "unknown";
      const currentSourceCount = perSourceCount.get(sourceName) || 0;
      picked.push(item);
      perSourceCount.set(sourceName, currentSourceCount + 1);
      if (/arxiv/i.test(sourceName) || /arxiv/i.test(item.link || "")) arxivCount += 1;
      pickedSet.add(key);
    }
  }

  return picked;
};

const scoreItem = (item) => {
  const now = Date.now();
  const ageHours = item.publishedAt ? (now - item.publishedAt.getTime()) / 36e5 : 72;

  // 时效：0~30分（越新越高）
  const freshnessScore = clamp(30 - ageHours * 0.8, 0, 30);

  // 价值：主要由“内容类型”决定，而不是来源优先级
  const category = inferNewsCategory(item);
  const baseValueByCategory = {
    技术突破: 45,
    模型迭代: 45,
    产品发布: 42,
    开源生态: 36,
    融资并购: 32,
    行业合作: 28,
    功能更新: 26,
    应用落地: 24,
    政策监管: 22,
    安全与治理: 20,
    基础设施: 18,
    信息资讯: 16,
  };

  let valueScore = baseValueByCategory[category] ?? 20;
  const text = `${item.title} ${item.description || ""}`.toLowerCase();

  // 高价值信号：新模型/新发现/SOTA/首发
  const highValueSignals = [
    "new model",
    "model release",
    "模型发布",
    "模型升级",
    "sota",
    "state-of-the-art",
    "breakthrough",
    "first",
    "首次",
    "new architecture",
    "research",
    "paper",
    "发现",
  ];

  // 一般价值信号：治理/合规/基础设施/部署类
  const normalValueSignals = [
    "safety",
    "governance",
    "policy",
    "regulation",
    "compliance",
    "infrastructure",
    "deployment",
    "inference",
    "gpu",
    "安全",
    "治理",
    "监管",
    "合规",
    "基础设施",
    "部署",
    "推理",
    "算力",
  ];

  const highSignalHit = highValueSignals.some((kw) => text.includes(kw));
  const normalSignalHit = normalValueSignals.some((kw) => text.includes(kw));

  if (highSignalHit) valueScore += 8;
  if (normalSignalHit) valueScore -= 3;

  // 关键词分保留但弱化：0~10分
  let keywordScore = 0;
  for (const { keyword, weight } of KEYWORD_WEIGHTS) {
    if (text.includes(keyword)) keywordScore += weight;
  }
  keywordScore = clamp(Math.round(keywordScore * 0.35), 0, 10);

  // 来源仅做轻微兜底：0~5分（避免“来源名气”主导排序）
  const sourceScore = clamp(Math.round((item.sourcePriority || 0.7) * 5), 0, 5);

  return Math.round(clamp(valueScore, 0, 55) + freshnessScore + keywordScore + sourceScore);
};

const buildDedupKey = (item) => {
  const titleKey = (item.title || "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ").trim();
  return titleKey || item.link;
};

const normalizeText = (text) => decodeXmlEntities(stripHtml(text || "")).replace(/\s+/g, " ").trim();

const hasChinese = (text) => /[\u4e00-\u9fff]/.test(text || "");

const DIRECTION_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "that",
  "with",
  "from",
  "this",
  "will",
  "into",
  "about",
  "using",
  "through",
  "their",
  "have",
  "has",
  "are",
  "was",
  "were",
  "its",
  "you",
  "your",
  "our",
  "new",
  "ai",
  "llm",
  "model",
  "models",
  "在",
  "并",
  "和",
  "与",
  "对",
  "及",
  "将",
  "为",
  "等",
  "进行",
  "通过",
  "可以",
  "相关",
  "一个",
  "该",
  "这",
  "更多",
  "发布",
  "更新",
  "支持",
]);

const ARTICLE_HINT_PATTERN = /(article|post|entry|content|body|story|main|detail|markdown|text|news|read)/i;

const cleanDirectionText = (text) =>
  normalizeText(text)
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[_*`>#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenizeDirectionWords = (text) => {
  const lowered = cleanDirectionText(text).toLowerCase();
  const tokens = lowered.match(/[a-z][a-z0-9+-]{2,}|[\u4e00-\u9fff]{2,}/g) || [];
  return tokens.filter((token) => !DIRECTION_STOPWORDS.has(token));
};

const summarizeDirectionFocus = (text) => {
  const normalized = cleanDirectionText(text);
  if (!normalized) return "";

  const sentences = normalized
    .split(/[。！？!?；;\n]/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 12);
  if (!sentences.length) return normalized.slice(0, 42);

  const frequencies = new Map();
  for (const token of tokenizeDirectionWords(normalized)) {
    frequencies.set(token, (frequencies.get(token) || 0) + 1);
  }

  let bestSentence = sentences[0];
  let bestScore = -1;
  for (const sentence of sentences) {
    const uniqTokens = [...new Set(tokenizeDirectionWords(sentence))];
    const tokenScore = uniqTokens.reduce((sum, token) => sum + (frequencies.get(token) || 0), 0);
    const score = tokenScore + Math.min(sentence.length / 40, 1);
    if (score > bestScore) {
      bestScore = score;
      bestSentence = sentence;
    }
  }

  return bestSentence.length > 42 ? `${bestSentence.slice(0, 42).trim()}...` : bestSentence;
};

const normalizeCompareText = (text) =>
  normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isTitleLikeText = (text, title) => {
  const body = normalizeCompareText(text);
  const heading = normalizeCompareText(title);
  if (!body) return true;
  if (!heading) return false;
  if (body === heading) return true;
  if (heading.length >= 18 && body.includes(heading)) return true;

  const bodyTokens = new Set(body.split(" ").filter((token) => token.length >= 2));
  const titleTokens = [...new Set(heading.split(" ").filter((token) => token.length >= 2))];
  if (!titleTokens.length) return false;

  const overlap = titleTokens.filter((token) => bodyTokens.has(token)).length;
  const overlapRate = overlap / titleTokens.length;
  const nearSameLength = body.length <= Math.max(heading.length * 1.6, 120);
  if (overlapRate >= 0.8 && nearSameLength) return true;

  const titlePrefix = titleTokens.slice(0, 6).join(" ");
  if (titlePrefix && body.startsWith(titlePrefix) && body.length <= Math.max(heading.length * 1.8, 160)) return true;

  const bodySentenceCount = body.split(/[.!?。！？;\n]/).filter((line) => line.trim().length > 0).length;
  if (bodySentenceCount <= 2 && overlapRate >= 0.6 && body.length <= Math.max(heading.length * 2, 180)) return true;

  return false;
};

const isUsableSummary = (summary, title) => {
  const cleaned = normalizeText(summary || "");
  if (cleaned.length < 50) return false;
  if (isTitleLikeText(cleaned, title)) return false;
  const sentenceCount = cleaned.split(/[。！？!?;\n]/).filter((line) => line.trim().length >= 8).length;
  return sentenceCount >= 2;
};

const isUsableIntroText = (text, title) => {
  const cleaned = normalizeText(text || "");
  if (cleaned.length < 24) return false;
  if (isTitleLikeText(cleaned, title)) return false;
  return true;
};

const isUsableReasoningText = (text, title) => {
  const cleaned = normalizeText(text || "");
  if (cleaned.length < 120) return false;
  if (isTitleLikeText(cleaned, title)) return false;
  const sentenceCount = cleaned.split(/[。！？!?;\n]/).filter((line) => line.trim().length >= 8).length;
  return sentenceCount >= 3;
};

const cleanFeedDescription = (text, item = {}) => {
  let cleaned = normalizeText(text || "");
  if (!cleaned) return "";

  const isArxivItem =
    /arxiv/i.test(item.sourceName || "") || /arxiv/i.test(item.link || "") || /arxiv/i.test(item.title || "");

  if (isArxivItem) {
    cleaned = cleaned
      .replace(/^arxiv:\S+\s*/i, "")
      .replace(/^(announce type|公告类型)[:：]\s*[^。；; ]+\s*/i, "")
      .replace(/^(abstract|摘要)[:：]\s*/i, "")
      .trim();
  }

  return cleaned;
};

const pickReasoningText = (item) => {
  const candidates = [item.articleReasoningSummary, item.articleText, item.description];
  for (const candidate of candidates) {
    const cleaned = cleanFeedDescription(candidate, item);
    if (cleaned.length < 80) continue;
    if (isTitleLikeText(cleaned, item.title)) continue;
    return cleaned;
  }
  return "";
};

const getReasoningText = (item) => pickReasoningText(item);

const extractHtmlBlocks = (html, regex) => {
  const blocks = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    blocks.push(match[1] || match[0]);
  }
  return blocks;
};

const summarizeArticleText = (text, maxSentences = 2, maxChars = 220) => {
  const normalized = cleanDirectionText(text);
  if (!normalized) return "";

  const sentences = normalized
    .split(/[。！？!?;\n]/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 18);

  if (!sentences.length) return maxChars ? normalized.slice(0, maxChars) : normalized;
  if (sentences.length <= maxSentences) {
    const joined = sentences.join("；");
    return maxChars ? joined.slice(0, maxChars) : joined;
  }

  const tokenFreq = new Map();
  for (const token of tokenizeDirectionWords(normalized)) {
    tokenFreq.set(token, (tokenFreq.get(token) || 0) + 1);
  }

  const ranked = sentences.map((sentence, idx) => {
    const uniqTokens = [...new Set(tokenizeDirectionWords(sentence))];
    const tokenScore = uniqTokens.reduce((sum, token) => sum + (tokenFreq.get(token) || 0), 0);
    const lengthScore = Math.min(sentence.length / 80, 1);
    const positionBonus = 1 / (idx + 1);
    return { sentence, idx, score: tokenScore + lengthScore + positionBonus };
  });

  const selected = ranked
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.idx - b.idx)
    .map((entry) => entry.sentence);

  const summary = selected.join("；");
  if (!maxChars || summary.length <= maxChars) return summary;

  const shortened = summary.slice(0, maxChars);
  const lastBoundary = Math.max(
    shortened.lastIndexOf("。"),
    shortened.lastIndexOf("！"),
    shortened.lastIndexOf("？"),
    shortened.lastIndexOf("；"),
    shortened.lastIndexOf("."),
    shortened.lastIndexOf("!"),
    shortened.lastIndexOf("?"),
    shortened.lastIndexOf(";")
  );
  if (lastBoundary >= Math.max(40, Math.floor(maxChars * 0.6))) {
    return shortened.slice(0, lastBoundary + 1).trim();
  }
  return shortened.trim();
};

const summarizeReasoningText = (text) => summarizeArticleText(text, 4, 520);

const extractArticleText = (html) => {
  const cleanedHtml = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(header|footer|nav|aside|form|svg|iframe)[\s\S]*?<\/\1>/gi, " ");

  const articleBlocks = extractHtmlBlocks(cleanedHtml, /<article\b[^>]*>([\s\S]*?)<\/article>/gi);
  const mainBlocks = extractHtmlBlocks(cleanedHtml, /<main\b[^>]*>([\s\S]*?)<\/main>/gi);
  const hintBlocks = [];
  const hintRegex =
    /<(section|div)\b[^>]*(?:class|id)=["'][^"']*(article|content|post|entry|story|body|main|detail)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi;
  let hintMatch;
  while ((hintMatch = hintRegex.exec(cleanedHtml)) !== null) {
    hintBlocks.push(hintMatch[3] || "");
  }
  const paragraphBlocks = extractHtmlBlocks(cleanedHtml, /<p\b[^>]*>([\s\S]*?)<\/p>/gi);

  const candidateRawBlocks = [...articleBlocks, ...mainBlocks, ...hintBlocks];
  if (paragraphBlocks.length) {
    candidateRawBlocks.push(paragraphBlocks.join(" "));
  }
  if (!candidateRawBlocks.length) {
    candidateRawBlocks.push(cleanedHtml);
  }

  const candidates = candidateRawBlocks
    .map((block) => cleanDirectionText(block))
    .filter((text) => text.length >= 120);

  if (!candidates.length) return "";

  let best = candidates[0];
  let bestScore = 0;
  for (const candidate of candidates) {
    const sentenceCount = candidate.split(/[。！？!?;\n]/).filter((line) => line.trim().length > 0).length;
    const paragraphCount = candidate.split(/\n{2,}/).filter((line) => line.trim().length > 0).length;
    const hintBonus = ARTICLE_HINT_PATTERN.test(candidate) ? 20 : 0;
    const score = candidate.length + sentenceCount * 12 + paragraphCount * 10 + hintBonus;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best.slice(0, 12000);
};

const extractAbsoluteUrl = (value, baseUrl) => {
  try {
    return new URL(value, baseUrl).toString();
  } catch (error) {
    return "";
  }
};

const extractResolvedArticleUrl = (html, baseUrl) => {
  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  if (canonicalMatch && canonicalMatch[1]) {
    const canonicalUrl = extractAbsoluteUrl(canonicalMatch[1], baseUrl);
    if (canonicalUrl && !/news\.google\.com/i.test(canonicalUrl)) return canonicalUrl;
  }

  const refreshMatch = html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"'>]+)["']/i);
  if (refreshMatch && refreshMatch[1]) {
    const refreshUrl = extractAbsoluteUrl(refreshMatch[1], baseUrl);
    if (refreshUrl && !/news\.google\.com/i.test(refreshUrl)) return refreshUrl;
  }

  const urlMatches = html.match(/https?:\/\/[^"'\\\s<>()]+/g) || [];
  for (const rawUrl of urlMatches) {
    const candidate = rawUrl
      .replace(/\\u003d/g, "=")
      .replace(/\\u0026/g, "&")
      .replace(/&amp;/g, "&");
    if (/news\.google\.com/i.test(candidate)) continue;
    if (/google\.[^/]+/i.test(candidate)) continue;
    return candidate;
  }

  return "";
};

const fetchArticleText = async (url) => {
  if (!url) return { articleText: "", resolvedUrl: "" };
  try {
    const html = await requestText(url, 12000);
    let targetUrl = url;
    let targetHtml = html;

    if (/news\.google\.com/i.test(url)) {
      const resolvedUrl = extractResolvedArticleUrl(html, url);
      if (resolvedUrl) {
        targetUrl = resolvedUrl;
        targetHtml = await requestText(resolvedUrl, 12000);
      }
    }

    return {
      articleText: extractArticleText(targetHtml),
      resolvedUrl: targetUrl,
    };
  } catch (error) {
    return { articleText: "", resolvedUrl: "" };
  }
};

const buildSynthesisDirection = (item) => {
  const bodyFocus = summarizeDirectionFocus(getReasoningText(item));
  const focus = (bodyFocus || "正文要点").replace(/[“”"]/g, "").trim();

  if (item.category === "模型发布" || item.category === "模型迭代" || item.category === "技术突破") {
    return `围绕“${focus}”拆解能力边界，设计评测基线并验证上线收益`;
  }
  if (item.category === "产品更新" || item.category === "功能更新" || item.category === "产品发布") {
    return `围绕“${focus}”规划功能试点，跟踪用户使用反馈与转化数据`;
  }
  if (item.category === "开源生态") {
    return `围绕“${focus}”评估开源方案引入、二次开发与维护成本`;
  }
  return `围绕“${focus}”梳理可落地场景，优先验证短周期可见收益`;
};

const translateText = async (text, targetLang) => {
  const cleaned = normalizeText(text);
  if (!cleaned) return "";

  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(
    cleaned
  )}`;

  try {
    const response = await requestText(url, 15000);
    const parsed = JSON.parse(response);
    if (!Array.isArray(parsed) || !Array.isArray(parsed[0])) return "";
    return parsed[0]
      .map((segment) => (Array.isArray(segment) ? segment[0] || "" : ""))
      .join("")
      .trim();
  } catch (error) {
    return "";
  }
};

const buildBilingualIntro = async (item) => {
  const cleanedDescription = cleanFeedDescription(item.description, item);
  const fullRssSummary = summarizeArticleText(cleanedDescription, 3, 0);
  const bodyRaw = isUsableSummary(item.articleSummary, item.title)
    ? cleanFeedDescription(item.articleSummary, item)
    : isUsableIntroText(fullRssSummary, item.title)
    ? fullRssSummary
    : isUsableIntroText(cleanedDescription, item.title)
    ? cleanedDescription
    : "";

  if (!bodyRaw) {
    return {
      introZh: "暂无正文摘要（该条 RSS 内容无法提取有效正文，已跳过标题翻译兜底）",
      introEn: "No article body available in this RSS item.",
    };
  }

  let zhCore = "";
  let enCore = "";

  if (hasChinese(bodyRaw)) {
    zhCore = bodyRaw;
    enCore = await translateText(bodyRaw, "en");
  } else {
    enCore = bodyRaw;
    zhCore = await translateText(bodyRaw, "zh-CN");
  }

  if (!zhCore) {
    zhCore = `暂未完成自动翻译，原文摘要如下：${bodyRaw}`;
  }
  if (!enCore) {
    enCore = bodyRaw;
  }

  const introZh = zhCore;
  const introEn = enCore;

  return { introZh, introEn };
};

const inferExplorationDirections = (item) => {
  const text = getReasoningText(item).toLowerCase();
  const directions = [];
  directions.push(buildSynthesisDirection(item));

  for (const rule of DIRECTION_RULES) {
    if (rule.keywords.some((kw) => text.includes(kw.toLowerCase()))) {
      directions.push(rule.direction);
    }
  }

  if (directions.length === 0) {
    directions.push("围绕该主题梳理业务可落地场景，优先验证短周期可见收益");
  }

  return [...new Set(directions)].slice(0, 3);
};

const inferNewsCategory = (item) => {
  const text = `${normalizeText(item.title)} ${normalizeText(item.description)}`.toLowerCase();
  let bestCategory = "";
  let bestScore = 0;

  for (const rule of CATEGORY_RULES) {
    const score = rule.weightedKeywords.reduce((sum, entry) => {
      return text.includes(entry.kw.toLowerCase()) ? sum + entry.w : sum;
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      bestCategory = rule.category;
    }
  }

  if (bestScore >= 3) return bestCategory;
  if (item.sourceCategory && item.sourceCategory !== "模型发布" && item.sourceCategory !== "行业动态") {
    return item.sourceCategory;
  }
  return "信息资讯";
};

const buildImpact = (item, directions) => {
  const text = directions.join("；");
  return `可挖掘方向：${text}。`;
};

const pickTrend = (items) => {
  if (!items.length) return "今日趋势：未抓取到有效新闻，请检查网络或数据源配置。";
  const categoryCounter = new Map();
  for (const item of items) {
    const cat = item.category || "行业动态";
    categoryCounter.set(cat, (categoryCounter.get(cat) || 0) + 1);
  }

  let bestCategory = "行业动态";
  let bestCount = 0;
  for (const [cat, count] of categoryCounter.entries()) {
    if (count > bestCount) {
      bestCategory = cat;
      bestCount = count;
    }
  }
  return `今日趋势：${bestCategory}相关信息占比最高（${bestCount}条）。`;
};

const formatMarkdown = (briefing) => {
  const lines = [];
  lines.push(`# ${briefing.title}`);
  lines.push("");
  lines.push(`生成时间：${briefing.generatedAt}`);
  lines.push("");
  lines.push(briefing.trend);
  lines.push("");
  lines.push("## 重点新闻");
  lines.push("");

  briefing.items.forEach((item, index) => {
    lines.push(`### ${index + 1}. ${item.title}`);
    lines.push(`- 简介：${item.introZh}`);
    lines.push(`- ${item.impact}`);
    lines.push(`- 来源：${item.sourceName}`);
    lines.push(`- 链接：${item.resolvedLink || item.link}`);
    lines.push("");
  });

  if (briefing.items.length === 0) {
    lines.push("当前未生成新闻条目，建议检查网络连接或更换 RSS 源。\n");
  }

  lines.push("## 生成说明");
  lines.push("");
  lines.push("- 本简报由本地规则自动生成，建议发布前进行人工复核。");
  lines.push("- 若某些源抓取失败，会在 JSON 元数据中记录失败信息。");
  lines.push("- 中文简介为自动翻译后的全文摘要，专业术语请结合原文确认。");
  lines.push("- 可挖掘方向为模型推测结果，用于启发业务探索，不构成唯一结论。");
  lines.push("");
  return lines.join("\n");
};

const collectCandidates = async (sources) => {
  const allItems = [];
  const failures = [];

  await Promise.all(
    sources.map(async (source) => {
      try {
        if (source.type !== "rss") throw new Error(`Unsupported source type: ${source.type}`);
        const xml = await requestText(source.url);
        const parsed = parseRss(xml);
        for (const item of parsed) {
          allItems.push({
            ...item,
            sourceName: source.name,
            sourceCategory: source.category,
            category: source.category,
            sourcePriority: source.priority,
          });
        }
      } catch (error) {
        failures.push({
          sourceName: source.name,
          url: source.url,
          error: error.message,
        });
      }
    })
  );

  return { allItems, failures };
};

const generateBriefing = async (options = {}) => {
  const maxItems = Number(options.maxItems) > 0 ? Number(options.maxItems) : 8;
  // 按全局总分截取，不再按来源限额
  ensureOutputDir();
  const sources = loadSources();
  const { allItems, failures } = await collectCandidates(sources);

  const dedupedMap = new Map();
  for (const item of allItems) {
    const key = buildDedupKey(item);
    if (!dedupedMap.has(key)) {
      dedupedMap.set(key, item);
    }
  }

  const scored = [...dedupedMap.values()].map((item) => ({
    ...item,
    score: scoreItem(item),
  }));
  scored.sort((a, b) => b.score - a.score);

  // 在总分排序基础上做来源多样性约束，避免单一来源刷屏
  const picked = pickDiverseItems(scored, maxItems);

  const selected = await Promise.all(
    picked.map(async (item) => {
      const { articleText, resolvedUrl } = await fetchArticleText(item.link);
      const articleSummaryRaw = summarizeArticleText(articleText || item.description || "", 3, 300);
      const articleSummary = isUsableSummary(articleSummaryRaw, item.title) ? articleSummaryRaw : "";
      const articleReasoningSummaryRaw = summarizeReasoningText(articleText || "");
      const articleReasoningSummary = isUsableReasoningText(articleReasoningSummaryRaw, item.title)
        ? articleReasoningSummaryRaw
        : "";
      const category = inferNewsCategory(item);
      const enrichedItem = { ...item, category, articleText, articleSummary, articleReasoningSummary };
      const intros = await buildBilingualIntro(enrichedItem);
      const explorationDirections = inferExplorationDirections(enrichedItem);
      return {
        title: normalizeText(item.title),
        link: item.link,
        resolvedLink: resolvedUrl || item.link,
        sourceName: item.sourceName,
        category,
        score: item.score,
        publishedAt: item.publishedAt ? item.publishedAt.toISOString() : null,
        articleSummary,
        articleReasoningSummary,
        introZh: intros.introZh,
        introEn: intros.introEn,
        explorationDirections,
        applicationDomains: explorationDirections,
        impact: buildImpact({ ...item, category }, explorationDirections),
      };
    })
  );

  const now = new Date();
  const generatedAt = now.toISOString();
  const id = slugifyDate(now);
  const trend = pickTrend(selected);
  const title = `[${generatedAt.slice(0, 10)}] 大模型新闻简报`;

  const briefing = {
    id,
    title,
    generatedAt,
    totalCandidates: scored.length,
    selectedCount: selected.length,
    trend,
    items: selected,
    failures,
  };

  const markdown = formatMarkdown(briefing);
  fs.writeFileSync(path.join(OUTPUT_DIR, `${id}.json`), JSON.stringify(briefing, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, `${id}.md`), markdown);

  return briefing;
};

const listBriefings = () => {
  ensureOutputDir();
  const files = fs
    .readdirSync(OUTPUT_DIR)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .reverse();

  return files.map((file) => {
    const full = path.join(OUTPUT_DIR, file);
    const content = JSON.parse(fs.readFileSync(full, "utf8"));
    return {
      id: content.id,
      title: content.title,
      generatedAt: content.generatedAt,
      selectedCount: content.selectedCount,
      totalCandidates: content.totalCandidates,
      failureCount: Array.isArray(content.failures) ? content.failures.length : 0,
    };
  });
};

const getBriefing = (id) => {
  ensureOutputDir();
  const jsonPath = path.join(OUTPUT_DIR, `${id}.json`);
  const mdPath = path.join(OUTPUT_DIR, `${id}.md`);
  if (!fs.existsSync(jsonPath)) return null;
  const json = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const markdown = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, "utf8") : "";
  return { json, markdown };
};

module.exports = {
  generateBriefing,
  getBriefing,
  listBriefings,
};
