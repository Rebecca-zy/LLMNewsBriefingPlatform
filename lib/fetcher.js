const http = require("http");
const https = require("https");
const { URL } = require("url");

const requestText = (urlString, timeoutMs = 12000, maxRedirects = 5) =>
  new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(urlString);
    } catch (error) {
      reject(new Error(`Invalid URL: ${urlString}`));
      return;
    }

    const client = parsed.protocol === "https:" ? https : http;
    const req = client.get(
      parsed.toString(),
      {
        headers: {
          "User-Agent": "LLMNewsBriefingBot/1.0",
          Accept: "text/html, application/rss+xml, application/xml, text/xml, */*",
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        const location = res.headers && res.headers.location;
        if (status >= 300 && status < 400 && location) {
          if (maxRedirects <= 0) {
            reject(new Error(`Too many redirects: ${urlString}`));
            res.resume();
            return;
          }
          const nextUrl = new URL(location, parsed).toString();
          res.resume();
          requestText(nextUrl, timeoutMs, maxRedirects - 1).then(resolve).catch(reject);
          return;
        }

        if (status >= 400) {
          reject(new Error(`HTTP ${status}`));
          res.resume();
          return;
        }

        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => resolve(data));
      }
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timeout after ${timeoutMs}ms`));
    });

    req.on("error", (error) => reject(error));
  });

module.exports = {
  requestText,
};
