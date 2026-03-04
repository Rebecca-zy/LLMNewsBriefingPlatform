const { decodeXmlEntities, stripHtml } = require("./utils");

const getTagContent = (block, tag) => {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const matched = block.match(regex);
  return matched ? decodeXmlEntities(stripHtml(matched[1])) : "";
};

const parseDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const pickFirst = (...values) => values.find((value) => String(value || "").trim()) || "";

const parseRss = (xmlText) => {
  const items = [];
  const itemRegex = /<item\b[\s\S]*?<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xmlText)) !== null) {
    const block = match[0];
    const title = getTagContent(block, "title");
    const link = getTagContent(block, "link");
    const description = pickFirst(
      getTagContent(block, "content:encoded"),
      getTagContent(block, "content"),
      getTagContent(block, "summary"),
      getTagContent(block, "description")
    );
    const pubDateRaw = getTagContent(block, "pubDate");

    if (!title || !link) continue;

    items.push({
      title,
      link,
      description,
      publishedAt: parseDate(pubDateRaw),
    });
  }

  if (items.length > 0) return items;

  const entryRegex = /<entry\b[\s\S]*?<\/entry>/gi;
  while ((match = entryRegex.exec(xmlText)) !== null) {
    const block = match[0];
    const title = getTagContent(block, "title");
    const summary = pickFirst(getTagContent(block, "content"), getTagContent(block, "summary"));
    const updated = getTagContent(block, "updated") || getTagContent(block, "published");
    const linkMatch = block.match(/<link[^>]*href="([^"]+)"[^>]*>/i);
    const link = linkMatch ? decodeXmlEntities(linkMatch[1]) : "";

    if (!title || !link) continue;

    items.push({
      title,
      link,
      description: summary,
      publishedAt: parseDate(updated),
    });
  }

  return items;
};

module.exports = {
  parseRss,
};
