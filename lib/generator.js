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
  const bodyRaw = normalizeText(item.description || item.title);

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
  const text = `${normalizeText(item.title)} ${normalizeText(item.description)}`.toLowerCase();
  const directions = [];
  for (const rule of DIRECTION_RULES) {
    if (rule.keywords.some((kw) => text.includes(kw.toLowerCase()))) {
      directions.push(rule.direction);
    }
  }

  if (directions.length === 0) {
    const title = normalizeText(item.title).slice(0, 26) || "该主题";
    if (item.category === "模型发布") {
      directions.push(`围绕“${title}”评估模型升级、服务接入与推理成本优化机会`);
    } else if (item.category === "产品更新") {
      directions.push(`围绕“${title}”设计产品功能试点，并验证用户使用效果`);
    } else if (item.category === "开源生态") {
      directions.push(`围绕“${title}”探索开源方案引入与二次开发落地路径`);
    } else {
      directions.push(`围绕“${title}”梳理业务可落地场景，优先验证短周期可见收益`);
    }
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
    lines.push(`- 链接：${item.link}`);
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

  // 先全量抓取并打分排序，再按总分截取Top N
  const picked = scored.slice(0, maxItems);

  const selected = await Promise.all(
    picked.map(async (item) => {
      const category = inferNewsCategory(item);
      const intros = await buildBilingualIntro(item);
      const explorationDirections = inferExplorationDirections({ ...item, category });
      return {
        title: normalizeText(item.title),
        link: item.link,
        sourceName: item.sourceName,
        category,
        score: item.score,
        publishedAt: item.publishedAt ? item.publishedAt.toISOString() : null,
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
