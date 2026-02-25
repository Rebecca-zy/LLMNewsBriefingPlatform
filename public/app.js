const statusEl = document.getElementById("status");
const maxItemsEl = document.getElementById("maxItems");
const generateBtn = document.getElementById("generateBtn");
const pushBtn = document.getElementById("pushBtn");
const webhookEl = document.getElementById("webhook");
const listEl = document.getElementById("briefingList");
const contentEl = document.getElementById("briefingContent");
const briefingTitleEl = document.getElementById("briefingTitle");
const metaUpdatedEl = document.getElementById("metaUpdated");
const trendTextEl = document.getElementById("trendText");
const shareBtn = document.getElementById("shareBtn");
const summaryBtn = document.getElementById("summaryBtn");
const summaryPanelEl = document.getElementById("summaryPanel");
const summaryTextEl = document.getElementById("summaryText");

let currentBriefingId = null;
let currentBriefing = null;

const escapeHtml = (text) =>
  String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const setStatus = (text) => {
  statusEl.textContent = text;
};

const renderEmptyState = (kind) => {
  const isNoHistory = kind === "no-history";
  const title = isNoHistory ? "暂无历史简报" : "暂无可展示热点";
  const desc = isNoHistory
    ? "当前还没有生成记录，点击“更新简报”即可立即生成首份热点简报。"
    : "这次生成未筛选出可展示条目，你可以调整条数后重新生成。";

  contentEl.innerHTML = `
    <section class="empty-card">
      <div class="empty-icon">AI</div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(desc)}</p>
      <div class="empty-actions">
        <button id="emptyGenerateBtn" type="button" class="btn btn-primary">更新简报</button>
      </div>
    </section>
  `;

  const btn = document.getElementById("emptyGenerateBtn");
  if (btn) btn.onclick = () => triggerGenerate();
};

const hasChinese = (text) => /[\u4e00-\u9fff]/.test(text || "");

const DIRECTION_RULES = [
  {
    keywords: ["search", "retrieval", "query", "检索", "搜索"],
    direction: "语义检索与知识问答优化",
  },
  {
    keywords: ["customer support", "客服", "agent", "help desk", "ticket", "工单"],
    direction: "智能客服与工单分流自动化",
  },
  {
    keywords: ["video", "image", "vision", "audio", "multimodal", "图像", "视频", "语音"],
    direction: "多模态内容理解与审核",
  },
  {
    keywords: ["developer", "code", "coding", "copilot", "编程", "工程"],
    direction: "研发提效与代码辅助",
  },
  {
    keywords: ["marketing", "campaign", "creative", "content", "广告", "营销", "内容"],
    direction: "内容生产与营销增长",
  },
  {
    keywords: ["api", "inference", "deployment", "benchmark", "推理", "部署", "开源"],
    direction: "模型服务化部署与成本优化",
  },
];

const getLegacyZh = (item) => {
  const base = item.summary || item.introEn || "";
  if (!base) return "暂无中文简介。";
  const cleaned = String(base)
    .replace(
      /这项动态可能影响模型能力判断、产品功能规划和近期落地节奏，建议结合原文核实关键数据与发布时间。?/g,
      ""
    )
    .trim();
  if (hasChinese(cleaned)) return cleaned;
  return `旧记录暂无中文翻译，原文如下：${cleaned}`;
};

const inferExplorationDirections = (item) => {
  const text = `${item.title || ""} ${item.summary || ""} ${item.introZh || ""} ${item.introEn || ""}`.toLowerCase();
  const directions = [];
  for (const rule of DIRECTION_RULES) {
    if (rule.keywords.some((kw) => text.includes(kw.toLowerCase()))) {
      directions.push(rule.direction);
    }
  }
  if (directions.length === 0) {
    const title = (item.title || "该主题").slice(0, 18);
    directions.push(`围绕“${title}”设计业务试点并验证效果`);
  }
  return [...new Set(directions)].slice(0, 3);
};

const buildImpactFromDirections = (directions) => {
  return `${directions.join("；")}。`;
};

const normalizeImpactText = (text) => {
  const raw = String(text || "");
  const cleaned = raw
    .replace(/建议优先评估在上述场景中的落地价值、实施成本与合规要求。?/g, "")
    .replace(/建议优先评估语义检索准确率与工单闭环效率。?/g, "")
    .replace(/建议优先评估语义检索准确率与工单分流效果。?/g, "")
    .replace(/这条新闻与“[^”]+”方向高度相关。?/g, "")
    .replace(/适用应用领域：/g, "")
    .replace(/可挖掘方向：/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.replace(/^[：:;\s]+/, "");
};

const renderCategoryTag = (category) => {
  const categoryText = String(category || "").trim() || "信息资讯";
  return `
    <div class="category-wrap">
      <span class="category-tag">${escapeHtml(categoryText)}</span>
    </div>
  `;
};

const toLocalDateKey = (dateValue) => {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const toLocalTime = (dateValue) => {
  if (!dateValue) return "--:--";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "--:--";
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
};

const renderHistoryPicker = (versions, dateKey) => {
  const selected = versions.find((v) => v.id === currentBriefingId) || versions[0];
  if (selected) {
    currentBriefingId = selected.id;
  }

  listEl.innerHTML = `
    <div class="history-picker">
      <button type="button" class="history-current">
        ${escapeHtml(dateKey || "历史版本")} <span class="caret">▾</span>
      </button>
      <div class="history-menu">
        ${versions
          .map((item) => {
            const cls = item.id === currentBriefingId ? "history-option active" : "history-option";
            return `<button type="button" class="${cls}" data-id="${escapeHtml(item.id)}">${escapeHtml(
              toLocalTime(item.generatedAt)
            )}</button>`;
          })
          .join("")}
      </div>
    </div>
  `;

  const picker = listEl.querySelector(".history-picker");
  const currentBtn = listEl.querySelector(".history-current");
  const optionBtns = listEl.querySelectorAll(".history-option");
  if (!picker || !currentBtn || !optionBtns.length) return;

  currentBtn.onclick = () => {
    picker.classList.toggle("open");
  };
  optionBtns.forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      if (!id) return;
      picker.classList.remove("open");
      await loadBriefing(id);
    };
  });

  document.addEventListener(
    "click",
    (event) => {
      if (!picker.contains(event.target)) {
        picker.classList.remove("open");
      }
    },
    { once: true }
  );
};

const renderBriefing = (briefing) => {
  currentBriefingId = briefing.id || currentBriefingId;
  currentBriefing = briefing;
  summaryPanelEl.style.display = "none";
  summaryTextEl.textContent = "";
  const generatedAt = briefing.generatedAt ? new Date(briefing.generatedAt).toLocaleString() : "--";

  metaUpdatedEl.textContent = `更新时间 ${generatedAt}`;
  trendTextEl.textContent = briefing.trend || "暂无趋势摘要";

  const itemsHtml = (briefing.items || [])
    .map((item, idx) => {
      const introZh = getLegacyZh({ ...item, summary: item.introZh || item.summary });
      const directions =
        (Array.isArray(item.explorationDirections) && item.explorationDirections.length > 0
          ? item.explorationDirections
          : null) ||
        (Array.isArray(item.applicationDomains) && item.applicationDomains.length > 0 ? item.applicationDomains : null) ||
        inferExplorationDirections(item);
      const impactText =
        typeof item.impact === "string" &&
        (item.impact.includes("综合评分") || item.impact.includes("方向高度相关") || item.impact.includes("适用应用领域"))
          ? buildImpactFromDirections(directions)
          : normalizeImpactText(item.impact) || buildImpactFromDirections(directions);
      const categoryHtml = renderCategoryTag(item.category);
      return `
        <section class="news-item">
          <h3>${escapeHtml(item.title)}</h3>
          ${categoryHtml}
          <p><strong>简介：</strong>${escapeHtml(introZh)}<span class="intro-inline-link"><a href="${escapeHtml(
            item.link
          )}" target="_blank" rel="noopener noreferrer">查看原文</a></span></p>
          <p class="impact-note"><strong>可挖掘方向：</strong>${escapeHtml(impactText)}</p>
        </section>
      `;
    })
    .join("");
  const emptyHtml =
    (briefing.items || []).length === 0 ? "__EMPTY__" : "";

  if (emptyHtml === "__EMPTY__") {
    renderEmptyState("no-items");
    return;
  }

  contentEl.innerHTML = `${itemsHtml}`;

};

const loadBriefing = async (id) => {
  const res = await fetch(`/api/briefings/${id}`);
  if (!res.ok) {
    setStatus("读取简报失败。");
    return;
  }
  const payload = await res.json();
  if (payload.json) {
    currentBriefingId = id;
    renderBriefing(payload.json);
    return;
  }
  setStatus("简报数据格式不正确。");
};

const refreshList = async () => {
  const res = await fetch("/api/briefings");
  const payload = await res.json();
  listEl.innerHTML = "";

  if (!payload.briefings || payload.briefings.length === 0) {
    listEl.innerHTML = '<span class="history-empty">暂无历史简报</span>';
    briefingTitleEl.textContent = "AI热点简报";
    metaUpdatedEl.textContent = "更新时间 --";
    trendTextEl.textContent = "等待生成趋势摘要…";
    renderEmptyState("no-history");
    return;
  }

  const byDate = new Map();
  payload.briefings.forEach((item) => {
    const key = toLocalDateKey(item.generatedAt);
    if (!key) return;
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(item);
  });

  const todayKey = toLocalDateKey(new Date().toISOString());
  let selectedDateKey = todayKey;
  if (!byDate.has(selectedDateKey)) {
    selectedDateKey = byDate.keys().next().value;
  }
  const versions = byDate.get(selectedDateKey) || [];
  renderHistoryPicker(versions, selectedDateKey);

  if (currentBriefingId) {
    await loadBriefing(currentBriefingId);
  }
};

const triggerGenerate = async () => {
  generateBtn.disabled = true;
  setStatus("正在抓取并生成简报，请稍候...");
  try {
    const maxItems = Number(maxItemsEl.value || 8);
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxItems }),
    });
    const payload = await res.json();
    if (!res.ok) {
      setStatus(`生成失败: ${payload.error || "unknown"}`);
      return;
    }
    const briefing = payload.briefing;
    currentBriefingId = briefing.id;
    setStatus(`生成成功 · ID: ${briefing.id} · 入选 ${briefing.selectedCount} 条`);
    await refreshList();
  } catch (error) {
    setStatus(`生成异常: ${error.message}`);
  } finally {
    generateBtn.disabled = false;
  }
};

const summarizeIntro = (text) => {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const sentence = normalized.split(/[。！？!?.]/)[0] || normalized;
  return sentence.slice(0, 80);
};

const buildSummaryText = () => {
  if (!currentBriefing || !Array.isArray(currentBriefing.items) || currentBriefing.items.length === 0) {
    return "";
  }

  const lines = currentBriefing.items
    .map((item, idx) => {
      const intro = item.introZh || item.summary || item.introEn || "";
      const oneLine = summarizeIntro(intro);
      return oneLine ? `${idx + 1}. ${oneLine}` : "";
    })
    .filter(Boolean);

  return lines.length > 0 ? `本期共 ${lines.length} 条热点，核心信息如下：${lines.join("；")}。` : "";
};

const triggerPush = async () => {
  if (!currentBriefingId) {
    setStatus("请先生成或选择一条简报再推送。");
    return;
  }

  const summary = buildSummaryText();
  if (!summary) {
    setStatus("当前简报缺少可用简介，无法生成摘要并推送。");
    return;
  }

  // 点击推送时，优先将“生成摘要”文案推送到企业微信
  summaryTextEl.textContent = summary;
  summaryPanelEl.style.display = "block";

  pushBtn.disabled = true;
  setStatus(`正在推送摘要 ${currentBriefingId} 到企业微信...`);
  try {
    const webhook = (webhookEl.value || "").trim();
    const res = await fetch(`/api/push/${encodeURIComponent(currentBriefingId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhook, summary }),
    });
    const payload = await res.json();
    if (!res.ok) {
      setStatus(`推送失败: ${payload.error || "unknown"}`);
      return;
    }
    setStatus(`推送成功 · 已发送摘要到企业微信`);
  } catch (error) {
    setStatus(`推送异常: ${error.message}`);
  } finally {
    pushBtn.disabled = false;
  }
};

const triggerSummary = () => {
  const summary = buildSummaryText();
  if (!summary) {
    setStatus("请先生成或选择一条简报，再生成摘要。");
    return;
  }

  summaryTextEl.textContent = summary;
  summaryPanelEl.style.display = "block";
  setStatus("已生成汇总摘要。点击“订阅企业微信推送”会发送该摘要。");
};

const triggerShare = async () => {
  const url = window.location.href;
  try {
    await navigator.clipboard.writeText(url);
    setStatus("页面链接已复制，可直接分享。\n" + url);
  } catch {
    setStatus("复制失败，请手动复制地址栏链接。");
  }
};

generateBtn.addEventListener("click", triggerGenerate);
pushBtn.addEventListener("click", triggerPush);
summaryBtn.addEventListener("click", triggerSummary);
shareBtn.addEventListener("click", triggerShare);
refreshList();
