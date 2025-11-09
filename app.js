// 地味ログ整形屋（LogFormatter）
// 完全クライアントサイド実装。ログ送信なし。

(function () {
  const logInput = document.getElementById("logInput");
  const statusFilter = document.getElementById("statusFilter");
  const textFilter = document.getElementById("textFilter");
  const excludeFilter = document.getElementById("excludeFilter");
  const onlyMatched = document.getElementById("onlyMatched");
  const formatButton = document.getElementById("formatButton");
  const clearButton = document.getElementById("clearButton");
  const logOutput = document.getElementById("logOutput");
  const lineCountEl = document.getElementById("lineCount");
  const matchedCountEl = document.getElementById("matchedCount");

  // Nginx アクセスログ想定
  // 例:
  // 192.168.0.1 - - [10/Nov/2025:12:34:56 +0900] "GET /index.html HTTP/1.1" 200 1234 "-" "UA"
  const nginxRegex =
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

  function formatLogs() {
    const raw = logInput.value || "";
    const lines = raw.replace(/\r\n/g, "\n").split("\n");

    let total = 0;
    let matched = 0;

    logOutput.innerHTML = "";

    const keyword = textFilter.value.trim();
    const exclude = excludeFilter.value.trim();
    const statusOpt = statusFilter.value;

    for (const lineRaw of lines) {
      const line = lineRaw;
      if (!line && !line.trim()) continue;
      total++;

      const m = line.match(nginxRegex);
      let isMatch = true;
      let statusCode = "";
      let rendered = "";

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

        const lower = normalize(line);

        if (keyword && !lower.includes(keyword.toLowerCase())) {
          isMatch = false;
        }

        if (exclude && lower.includes(exclude.toLowerCase())) {
          isMatch = false;
        }

        if (isMatch) matched++;
        if (!isMatch && onlyMatched.checked) continue;

        const statusClass = classifyStatus(statusCode);

        const safeUrl = keyword ? highlightOnce(url, keyword) : url;
        const safeLine =
          keyword && !safeUrl.includes("<mark>")
            ? highlightOnce(line, keyword)
            : line;

        rendered =
          `<span class="ip">${ip}</span> ` +
          `- - ` +
          `<span class="timestamp">[${time}]</span> ` +
          `"` +
          `<span class="method">${method}</span> ` +
          `<span class="url">${safeUrl}</span> ` +
          `${proto}" ` +
          `<span class="status ${statusClass}">${statusCode}</span> ` +
          `<span class="size">${size}</span>`;

        const rest = line.slice(m[0].length);
        if (rest && rest.trim()) {
          const restHighlighted =
            keyword && !safeLine.includes("<mark>")
              ? highlightOnce(rest, keyword)
              : rest;
          rendered += ` ${restHighlighted}`;
        }
      } else {
        const lower = normalize(line);

        if (keyword && !lower.includes(keyword.toLowerCase())) {
          isMatch = false;
        }

        if (exclude && lower.includes(exclude.toLowerCase())) {
          isMatch = false;
        }

        if (statusOpt !== "all") {
          isMatch = false;
        }

        if (isMatch) matched++;
        if (!isMatch && onlyMatched.checked) continue;

        const safeLine = keyword ? highlightOnce(line, keyword) : line;
        rendered = safeLine;
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

  formatButton.addEventListener("click", formatLogs);
  clearButton.addEventListener("click", clearAll);

  [logInput, statusFilter, textFilter, excludeFilter, onlyMatched].forEach(
    (el) => {
      el.addEventListener("input", () => {
        if (!logInput.value.trim()) {
          logOutput.innerHTML = "";
          lineCountEl.textContent = "0 行";
          matchedCountEl.textContent = " / 0 行 該当";
          return;
        }
        formatLogs();
      });
    }
  );
})();
