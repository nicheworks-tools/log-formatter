// 地味ログ整形屋（LogFormatter）
// 完全クライアントサイド実装。ログ送信なし。

(function () {
  const MAX_LINES = 10000; // 大量ログ対策：上限

  const logInput = document.getElementById("logInput");
  const formatSelect = document.getElementById("formatSelect");
  const statusFilter = document.getElementById("statusFilter");
  const textFilter = document.getElementById("textFilter");
  const excludeFilter = document.getElementById("excludeFilter");
  const onlyMatched = document.getElementById("onlyMatched");
  const formatButton = document.getElementById("formatButton");
  const clearButton = document.getElementById("clearButton");
  const sampleButton = document.getElementById("sampleButton");
  const darkModeToggle = document.getElementById("darkModeToggle");
  const logOutput = document.getElementById("logOutput");
  const lineCountEl = document.getElementById("lineCount");
  const matchedCountEl = document.getElementById("matchedCount");

  // Nginx / Apache 共通っぽい形式
  const nginxRegex =
    /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)]\s+"(\S+)\s+([^"]+?)\s+(\S+)"\s+(\d{3})\s+(\S+)/;

  // Apache Combined想定（ほぼNginxと同形として扱う）
  const apacheRegex =
    /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)]\s+"(\S+)\s+([^"]+?)\s+(\S+)"\s+(\d{3})\s+(\S+)/;

  function classifyStatus(code) {
    const n = parseInt(code, 10);
    if (isNaN(n)) return "";
    if (n >= 200 && n < 300) return "status-2xx";
    if (n >= 300 && n < 400) return "status-3xx";
    if (n >= 400 && n < 500) return "status-4xx";
    if (n >= 500 && n < 600) return "status-5xx";
    return "";
  }

  function matchStatusFilter(code, filter) {
    if (filter === "all") return true;
    const n = parseInt(code, 10);
    if (isNaN(n)) return false;
    if (filter === "2xx") return n >= 200 && n < 300;
    if (filter === "3xx") return n >= 300 && n < 400;
    if (filter === "4xx") return n >= 400 && n < 500;
    if (filter === "5xx") return n >= 500 && n < 600;
    return true;
  }

  function normalize(str) {
    return (str || "").toLowerCase();
  }

  function parseKeywords(input) {
    return (input || "")
      .split(/\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  function includeByKeywords(textLower, includeKeywords) {
    if (!includeKeywords.length) return true;
    return includeKeywords.every((kw) => textLower.includes(kw));
  }

  function excludeByKeywords(textLower, excludeKeywords) {
    if (!excludeKeywords.length) return false;
    return excludeKeywords.some((kw) => textLower.includes(kw));
  }

  function highlightOnce(text, keyword) {
    if (!keyword) return text;
    const lower = text.toLowerCase();
    const key = keyword.toLowerCase();
    const idx = lower.indexOf(key);
    if (idx === -1) return text;
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + keyword.length);
    const after = text.slice(idx + keyword.length);
    return `${before}<mark>${match}</mark>${after}`;
  }

  function highlightKeywords(text, keywords) {
    if (!keywords.length) return text;
    // 最初の1語だけシンプルにハイライト（過剰な入れ子回避）
    return highlightOnce(text, keywords[0]);
  }

  function renderParsedLine({
    ip,
    time,
    method,
    url,
    proto,
    status,
    size,
    rest,
    includeKeywords,
  }) {
    const statusClass = classifyStatus(status);
    const safeUrl = highlightKeywords(url, includeKeywords);
    let html =
      `<span class="ip">${ip}</span> - - ` +
      `<span class="timestamp">[${time}]</span> "` +
      `<span class="method">${method}</span> ` +
      `<span class="url">${safeUrl}</span> ` +
      `${proto}" ` +
      `<span class="status ${statusClass}">${status}</span> ` +
      `<span class="size">${size}</span>`;

    if (rest && rest.trim()) {
      html += ` ${highlightKeywords(rest, includeKeywords)}`;
    }

    return html;
  }

  function parseJsonLine(line) {
    try {
      const obj = JSON.parse(line);
      const time =
        obj.time ||
        obj.timestamp ||
        obj["@timestamp"] ||
        obj.date ||
        "";
      const level = obj.level || obj.severity || "";
      const msg = obj.msg || obj.message || "";
      const method = obj.method || "";
      const url = obj.url || obj.path || "";
      const status = obj.status || obj.code || "";
      return { obj, time, level, msg, method, url, status };
    } catch {
      return null;
    }
  }

  function formatLogs() {
    const raw = logInput.value || "";
    let lines = raw.replace(/\r\n/g, "\n").split("\n");

    logOutput.innerHTML = "";
    let total = 0;
    let matched = 0;

    if (!raw.trim()) {
      lineCountEl.textContent = "0 行";
      matchedCountEl.textContent = " / 0 行 該当";
      return;
    }

    const format = (formatSelect && formatSelect.value) || "nginx";
    const statusOpt = statusFilter.value;
    const includeKeywords = parseKeywords(textFilter.value);
    const excludeKeywords = parseKeywords(excludeFilter.value);

    // 大量ログ対策
    let truncated = false;
    if (lines.length > MAX_LINES) {
      lines = lines.slice(0, MAX_LINES);
      truncated = true;
    }

    // truncate情報行
    if (truncated) {
      const notice = document.createElement("div");
      notice.className = "log-line system";
      notice.textContent = `※ 行数が多いため先頭 ${MAX_LINES} 行のみ表示しています。必要に応じて分割してください。`;
      logOutput.appendChild(notice);
    }

    for (const lineRaw of lines) {
      const line = lineRaw;
      if (!line && !line.trim()) continue;
      total++;

      const lower = normalize(line);
      let isMatch = true;
      let rendered = "";
      let statusCode = "";

      // ---- 形式ごとにパース ----
      if (format === "nginx" || format === "apache") {
        const regex = format === "nginx" ? nginxRegex : apacheRegex;
        const m = line.match(regex);

        if (m) {
          const ip = m[1];
          const time = m[2];
          const method = m[3];
          const url = m[4];
          const proto = m[5];
          statusCode = m[6];
          const size = m[7];

          if (!matchStatusFilter(statusCode, statusOpt)) {
            isMatch = false;
          }
          if (!includeByKeywords(lower, includeKeywords)) {
            isMatch = false;
          }
          if (excludeByKeywords(lower, excludeKeywords)) {
            isMatch = false;
          }

          if (isMatch) matched++;
          if (!isMatch && onlyMatched.checked) continue;

          const rest = line.slice(m[0].length);
          rendered = renderParsedLine({
            ip,
            time,
            method,
            url,
            proto,
            status: statusCode,
            size,
            rest,
            includeKeywords,
          });
        } else {
          // パース失敗時はプレーン扱い
          if (!includeByKeywords(lower, includeKeywords)) {
            isMatch = false;
          }
          if (excludeByKeywords(lower, excludeKeywords)) {
            isMatch = false;
          }
          if (statusOpt !== "all") {
            isMatch = false;
          }

          if (isMatch) matched++;
          if (!isMatch && onlyMatched.checked) continue;

          rendered = highlightKeywords(line, includeKeywords);
        }
      } else if (format === "jsonl") {
        const parsed = parseJsonLine(line);
        if (parsed) {
          const { time, level, msg, method, url, status } = parsed;
          statusCode = String(status || "");

          if (statusCode && !matchStatusFilter(statusCode, statusOpt)) {
            isMatch = false;
          }
          if (!includeByKeywords(lower, includeKeywords)) {
            isMatch = false;
          }
          if (excludeByKeywords(lower, excludeKeywords)) {
            isMatch = false;
          }

          if (isMatch) matched++;
          if (!isMatch && onlyMatched.checked) continue;

          const statusClass = classifyStatus(statusCode);
          let html = "";
          if (time) {
            html += `<span class="timestamp">[${time}]</span> `;
          }
          if (level) {
            html += `<span class="size">${level}</span> `;
          }
          if (method) {
            html += `<span class="method">${method}</span> `;
          }
          if (url) {
            html += `<span class="url">${highlightKeywords(
              url,
              includeKeywords
            )}</span> `;
          }
          if (statusCode) {
            html += `<span class="status ${statusClass}">${statusCode}</span> `;
          }
          if (msg) {
            html += highlightKeywords(String(msg), includeKeywords);
          }

          rendered = html || highlightKeywords(line, includeKeywords);
        } else {
          // JSONじゃない行は plain 扱い
          if (!includeByKeywords(lower, includeKeywords)) {
            isMatch = false;
          }
          if (excludeByKeywords(lower, excludeKeywords)) {
            isMatch = false;
          }
          if (statusOpt !== "all") {
            isMatch = false;
          }
          if (isMatch) matched++;
          if (!isMatch && onlyMatched.checked) continue;

          rendered = highlightKeywords(line, includeKeywords);
        }
      } else {
        // plain
        if (!includeByKeywords(lower, includeKeywords)) {
          isMatch = false;
        }
        if (excludeByKeywords(lower, excludeKeywords)) {
          isMatch = false;
        }
        if (statusOpt !== "all") {
          isMatch = false;
        }
        if (isMatch) matched++;
        if (!isMatch && onlyMatched.checked) continue;

        rendered = highlightKeywords(line, includeKeywords);
      }

      const div = document.createElement("div");
      div.className = "log-line" + (!isMatch ? " dim" : "");
      div.innerHTML = rendered;
      logOutput.appendChild(div);
    }

    lineCountEl.textContent = `${total} 行`;
    matchedCountEl.textContent = ` / ${matched} 行 該当`;
  }

  function clearAll() {
    logInput.value = "";
    textFilter.value = "";
    excludeFilter.value = "";
    statusFilter.value = "all";
    onlyMatched.checked = false;
    logOutput.innerHTML = "";
    lineCountEl.textContent = "0 行";
    matchedCountEl.textContent = " / 0 行 該当";
  }

  // サンプルログ投入
  if (sampleButton) {
    sampleButton.addEventListener("click", () => {
      logInput.value = [
        '127.0.0.1 - - [10/Nov/2025:12:34:56 +0900] "GET / HTTP/1.1" 200 1234 "-" "curl/7.79.1"',
        '127.0.0.1 - - [10/Nov/2025:12:35:01 +0900] "GET /admin HTTP/1.1" 403 321 "-" "Mozilla/5.0"',
        '127.0.0.1 - - [10/Nov/2025:12:35:10 +0900] "GET /healthcheck HTTP/1.1" 200 12 "-" "kube-probe/1.24"',
        '192.168.0.10 - - [10/Nov/2025:12:36:00 +0900] "POST /api/login HTTP/1.1" 500 0 "-" "Mozilla/5.0"',
        '{"time":"2025-11-10T03:36:00Z","level":"error","msg":"DB timeout","path":"/api/order","status":504}',
      ].join("\n");
      formatSelect.value = "nginx";
      formatLogs();
    });
  }

  // ダークモード切替（ローカルストレージに保存）
  function applyDarkModeFromStorage() {
    try {
      const v = localStorage.getItem("logf_dark_mode");
      if (v === "1") {
        document.body.classList.add("dark-mode");
        if (darkModeToggle) darkModeToggle.checked = true;
      }
    } catch (_) {}
  }

  applyDarkModeFromStorage();

  if (darkModeToggle) {
    darkModeToggle.addEventListener("change", () => {
      if (darkModeToggle.checked) {
        document.body.classList.add("dark-mode");
        try {
          localStorage.setItem("logf_dark_mode", "1");
        } catch (_) {}
      } else {
        document.body.classList.remove("dark-mode");
        try {
          localStorage.setItem("logf_dark_mode", "0");
        } catch (_) {}
      }
    });
  }

  // イベント
  formatButton.addEventListener("click", formatLogs);
  clearButton.addEventListener("click", clearAll);

  [logInput, formatSelect, statusFilter, textFilter, excludeFilter, onlyMatched]
    .forEach((el) => {
      el.addEventListener("input", () => {
        if (!logInput.value.trim()) {
          logOutput.innerHTML = "";
          lineCountEl.textContent = "0 行";
          matchedCountEl.textContent = " / 0 行 該当";
          return;
        }
        formatLogs();
      });
    });
})();
