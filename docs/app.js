(function () {
  "use strict";

  const state = {
    companies: [],
    pricesByCode: {},
    irByCode: {},
    kpiByCode: {},
    status: null,
    selectedCode: null,
    range: "all",
  };

  // ---------- formatting ----------

  function fmtYen(n) {
    if (n === null || n === undefined) return "—";
    return "¥" + Math.round(n).toLocaleString("ja-JP");
  }

  function fmtMarketCap(n) {
    if (n === null || n === undefined) return "—";
    const oku = n / 1e8; // 1億 = 10^8
    if (oku >= 10000) {
      const cho = Math.floor(oku / 10000);
      const rem = Math.round(oku % 10000);
      return rem > 0 ? `${cho}兆${rem.toLocaleString("ja-JP")}億円` : `${cho}兆円`;
    }
    return `${Math.round(oku).toLocaleString("ja-JP")}億円`;
  }

  function fmtDate(d) {
    if (!d) return "—";
    const [y, m, day] = d.split("-");
    return `${y}/${m}/${day}`;
  }

  function fmtShares(n) {
    if (n === null || n === undefined) return "—";
    return Math.round(n).toLocaleString("ja-JP") + " 株";
  }

  // ---------- data loading ----------

  async function fetchJson(path, fallback) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) return fallback;
      return await res.json();
    } catch (e) {
      return fallback;
    }
  }

  async function loadAll() {
    state.companies = await fetchJson("companies.json", []);
    state.status = await fetchJson("data/status.json", null);

    await Promise.all(
      state.companies.map(async (c) => {
        state.pricesByCode[c.code] = await fetchJson(`data/prices/${c.code}.json`, []);
        state.irByCode[c.code] = await fetchJson(`data/ir/${c.code}.json`, []);
        state.kpiByCode[c.code] = await fetchJson(`data/kpi/${c.code}.json`, []);
      })
    );
  }

  function renderStatus() {
    const el = document.getElementById("statusLine");
    if (!state.status || !state.status.last_run_utc) {
      el.textContent = "まだ自動取得が実行されていません（GitHub Actions の初回実行、またはバックフィルの実行をお待ちください）。";
      return;
    }
    const errCount = (state.status.errors || []).length;
    const runDate = new Date(state.status.last_run_utc);
    let text = `最終取得: ${runDate.toLocaleString("ja-JP")}（${state.status.updated_codes.length}銘柄更新）`;
    if (errCount > 0) {
      text += ` / ${errCount}件のエラーあり`;
      el.classList.add("error");
    } else {
      el.classList.remove("error");
    }
    el.textContent = text;
  }

  // ---------- overview table ----------

  function latestTwo(code) {
    const hist = state.pricesByCode[code] || [];
    const last = hist[hist.length - 1] || null;
    const prev = hist[hist.length - 2] || null;
    return { last, prev };
  }

  function renderOverview() {
    const body = document.getElementById("overviewBody");
    body.innerHTML = "";
    state.companies.forEach((c) => {
      const { last, prev } = latestTwo(c.code);
      const tr = document.createElement("tr");
      tr.dataset.code = c.code;

      const cells = [
        c.code,
        c.name,
        c.brands || "",
        last ? fmtYen(last.close) : "—",
        "",
        last ? fmtMarketCap(last.market_cap) : "—",
        last ? fmtDate(last.date) : "—",
      ];

      cells.forEach((val, i) => {
        const td = document.createElement("td");
        if (i === 4) {
          if (last && prev && typeof last.close === "number" && typeof prev.close === "number") {
            const diff = last.close - prev.close;
            const pct = (diff / prev.close) * 100;
            td.textContent = `${diff >= 0 ? "+" : ""}${diff.toFixed(1)} (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`;
            td.classList.add(diff >= 0 ? "delta-up" : "delta-down");
          } else {
            td.textContent = "—";
          }
        } else {
          td.textContent = val;
        }
        tr.appendChild(td);
      });

      tr.addEventListener("click", () => selectCompany(c.code));
      body.appendChild(tr);
    });
  }

  // ---------- sorting ----------

  function attachSorting() {
    const keyIndex = { code: 0, name: 1, brands: 2, close: 3, delta: 4, market_cap: 5, date: 6 };
    let sortState = { key: null, dir: 1 };
    document.querySelectorAll("#overviewTable thead th").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        sortState.dir = sortState.key === key ? -sortState.dir : 1;
        sortState.key = key;
        const idx = keyIndex[key];
        const body = document.getElementById("overviewBody");
        const rows = Array.from(body.querySelectorAll("tr"));
        rows.sort((a, b) => {
          const av = a.children[idx].textContent;
          const bv = b.children[idx].textContent;
          const an = parseFloat(av.replace(/[^0-9.\-]/g, ""));
          const bn = parseFloat(bv.replace(/[^0-9.\-]/g, ""));
          if (!isNaN(an) && !isNaN(bn) && (key === "close" || key === "delta" || key === "market_cap" || key === "date")) {
            return (an - bn) * sortState.dir;
          }
          return av.localeCompare(bv, "ja") * sortState.dir;
        });
        rows.forEach((r) => body.appendChild(r));
      });
    });
  }

  // ---------- company selector ----------

  function renderCompanySelect() {
    const sel = document.getElementById("companySelect");
    sel.innerHTML = "";
    state.companies.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.code;
      opt.textContent = `${c.name}（${c.code}）`;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", () => selectCompany(sel.value));
  }

  function selectCompany(code) {
    state.selectedCode = code;
    document.getElementById("companySelect").value = code;
    localStorage.setItem("selectedCompanyCode", code);
    renderDetail();
    document.getElementById("detailSection").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---------- stat tiles ----------

  function renderStats(company, hist, ir) {
    const row = document.getElementById("statRow");
    row.innerHTML = "";
    const last = hist[hist.length - 1] || null;
    const prev = hist[hist.length - 2] || null;

    const tiles = [];

    tiles.push({
      label: `株価（${last ? fmtDate(last.date) : "データなし"}）`,
      value: last ? fmtYen(last.close) : "—",
      delta: last && prev ? deltaHtml(last.close - prev.close, ((last.close - prev.close) / prev.close) * 100) : "",
    });

    tiles.push({
      label: "時価総額",
      value: last ? fmtMarketCap(last.market_cap) : "—",
      note: last && last.shares_estimated ? "※発行済株式数は概算（当時の実数ではない可能性）" : "",
    });

    tiles.push({
      label: "発行済株式数",
      value: fmtShares(company.shares_outstanding),
      note: company.shares_outstanding_updated_at
        ? `更新: ${company.shares_outstanding_updated_at}（${company.shares_outstanding_source || "manual"}）`
        : "未登録。適時開示から手動登録してください",
    });

    tiles.push({
      label: "IR記録件数",
      value: String(ir.length),
      note: ir.length ? `直近: ${fmtDate(ir[ir.length - 1].date)}` : "まだ記録がありません",
    });

    tiles.forEach((t) => {
      const div = document.createElement("div");
      div.className = "stat-tile";
      div.innerHTML = `<div class="label"></div><div class="value"></div><div class="delta"></div><div class="note"></div>`;
      div.querySelector(".label").textContent = t.label;
      div.querySelector(".value").textContent = t.value;
      if (t.delta) div.querySelector(".delta").innerHTML = t.delta;
      if (t.note) div.querySelector(".note").textContent = t.note;
      row.appendChild(div);
    });
  }

  function deltaHtml(diff, pct) {
    const cls = diff >= 0 ? "delta-up" : "delta-down";
    const sign = diff >= 0 ? "+" : "";
    const span = document.createElement("span");
    span.className = cls;
    span.textContent = `${sign}${diff.toFixed(1)} (${sign}${pct.toFixed(1)}%) 前日比`;
    return span.outerHTML;
  }

  // ---------- earnings KPI ----------

  function renderKpi(company) {
    const section = document.getElementById("kpiSection");
    const list = (state.kpiByCode[company.code] || []).slice().sort((a, b) => a.date.localeCompare(b.date));

    if (!list.length) {
      section.style.display = "none";
      return;
    }
    section.style.display = "";

    const latest = list[list.length - 1];
    const row = document.getElementById("kpiStatRow");
    row.innerHTML = "";
    const tiles = [
      { label: `売上高（${latest.document_name}）`, value: fmtMarketCap(latest.net_sales) },
      { label: "営業利益", value: fmtMarketCap(latest.operating_income) },
      { label: "経常利益", value: fmtMarketCap(latest.ordinary_income) },
      { label: "当期純利益", value: fmtMarketCap(latest.net_income) },
      { label: "EPS", value: latest.eps != null ? `${latest.eps}円` : "—" },
    ];
    tiles.forEach((t) => {
      const div = document.createElement("div");
      div.className = "stat-tile";
      div.innerHTML = `<div class="label"></div><div class="value"></div>`;
      div.querySelector(".label").textContent = t.label;
      div.querySelector(".value").textContent = t.value;
      row.appendChild(div);
    });

    const tbody = document.getElementById("kpiTableBody");
    tbody.innerHTML = "";
    list.slice().reverse().forEach((r) => {
      const tr = document.createElement("tr");
      [
        fmtDate(r.date),
        r.document_name || "—",
        fmtMarketCap(r.net_sales),
        fmtMarketCap(r.operating_income),
        fmtMarketCap(r.ordinary_income),
        fmtMarketCap(r.net_income),
        r.eps != null ? `${r.eps}円` : "—",
      ].forEach((v) => {
        const td = document.createElement("td");
        td.textContent = v;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  // ---------- range filter ----------

  function filteredHistory(hist) {
    if (state.range === "all") return hist;
    const days = parseInt(state.range, 10);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return hist.filter((r) => new Date(r.date) >= cutoff);
  }

  // ---------- SVG line chart ----------

  function renderLineChart(container, points, opts) {
    container.innerHTML = "";
    if (!points.length) {
      const div = document.createElement("div");
      div.className = "empty-state";
      div.textContent = "データがありません。GitHub Actions の実行後に表示されます。";
      container.appendChild(div);
      return;
    }

    const W = 800, H = 260, padL = 70, padR = 16, padT = 16, padB = 28;
    const values = points.map((p) => p.value);
    let min = Math.min(...values), max = Math.max(...values);
    if (min === max) { min -= 1; max += 1; }
    const pad = (max - min) * 0.08;
    min -= pad; max += pad;

    const xAt = (i) => padL + (i / Math.max(points.length - 1, 1)) * (W - padL - padR);
    const yAt = (v) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("preserveAspectRatio", "none");

    // gridlines + y labels
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const v = min + ((max - min) * i) / ticks;
      const y = yAt(v);
      const line = document.createElementNS(svgNS, "line");
      line.setAttribute("x1", padL);
      line.setAttribute("x2", W - padR);
      line.setAttribute("y1", y);
      line.setAttribute("y2", y);
      line.setAttribute("stroke", "var(--gridline)");
      line.setAttribute("stroke-width", "1");
      svg.appendChild(line);

      const text = document.createElementNS(svgNS, "text");
      text.setAttribute("x", padL - 8);
      text.setAttribute("y", y + 4);
      text.setAttribute("text-anchor", "end");
      text.setAttribute("font-size", "11");
      text.setAttribute("fill", "var(--text-muted)");
      text.textContent = opts.formatValue(v, true);
      svg.appendChild(text);
    }

    // area fill
    let areaD = `M ${xAt(0)} ${yAt(points[0].value)} `;
    points.forEach((p, i) => { areaD += `L ${xAt(i)} ${yAt(p.value)} `; });
    areaD += `L ${xAt(points.length - 1)} ${H - padB} L ${xAt(0)} ${H - padB} Z`;
    const area = document.createElementNS(svgNS, "path");
    area.setAttribute("d", areaD);
    area.setAttribute("fill", opts.color);
    area.setAttribute("opacity", "0.10");
    area.setAttribute("stroke", "none");
    svg.appendChild(area);

    // line
    let lineD = `M ${xAt(0)} ${yAt(points[0].value)} `;
    points.forEach((p, i) => { if (i > 0) lineD += `L ${xAt(i)} ${yAt(p.value)} `; });
    const line = document.createElementNS(svgNS, "path");
    line.setAttribute("d", lineD);
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", opts.color);
    line.setAttribute("stroke-width", "2");
    line.setAttribute("stroke-linejoin", "round");
    line.setAttribute("stroke-linecap", "round");
    svg.appendChild(line);

    // end dot with surface ring
    const lastI = points.length - 1;
    const ring = document.createElementNS(svgNS, "circle");
    ring.setAttribute("cx", xAt(lastI));
    ring.setAttribute("cy", yAt(points[lastI].value));
    ring.setAttribute("r", 6);
    ring.setAttribute("fill", "var(--surface-1)");
    svg.appendChild(ring);
    const dot = document.createElementNS(svgNS, "circle");
    dot.setAttribute("cx", xAt(lastI));
    dot.setAttribute("cy", yAt(points[lastI].value));
    dot.setAttribute("r", 4);
    dot.setAttribute("fill", opts.color);
    svg.appendChild(dot);

    // end label
    const endLabel = document.createElementNS(svgNS, "text");
    endLabel.setAttribute("x", xAt(lastI) - 8);
    endLabel.setAttribute("y", yAt(points[lastI].value) - 10);
    endLabel.setAttribute("text-anchor", "end");
    endLabel.setAttribute("font-size", "12");
    endLabel.setAttribute("font-weight", "600");
    endLabel.setAttribute("fill", "var(--text-primary)");
    endLabel.textContent = opts.formatValue(points[lastI].value, false);
    svg.appendChild(endLabel);

    // crosshair (hidden by default)
    const crosshair = document.createElementNS(svgNS, "line");
    crosshair.setAttribute("class", "crosshair-line");
    crosshair.setAttribute("y1", padT);
    crosshair.setAttribute("y2", H - padB);
    crosshair.setAttribute("opacity", "0");
    svg.appendChild(crosshair);

    const hoverRing = document.createElementNS(svgNS, "circle");
    hoverRing.setAttribute("r", 6);
    hoverRing.setAttribute("fill", "var(--surface-1)");
    hoverRing.setAttribute("opacity", "0");
    svg.appendChild(hoverRing);
    const hoverDot = document.createElementNS(svgNS, "circle");
    hoverDot.setAttribute("r", 4);
    hoverDot.setAttribute("fill", opts.color);
    hoverDot.setAttribute("opacity", "0");
    svg.appendChild(hoverDot);

    // hit overlay
    const overlay = document.createElementNS(svgNS, "rect");
    overlay.setAttribute("x", padL);
    overlay.setAttribute("y", 0);
    overlay.setAttribute("width", Math.max(W - padL - padR, 1));
    overlay.setAttribute("height", H);
    overlay.setAttribute("fill", "transparent");
    svg.appendChild(overlay);

    container.appendChild(svg);

    const tooltip = document.createElement("div");
    tooltip.className = "tooltip";
    tooltip.innerHTML = `<div class="tt-date"></div><div class="tt-value"></div>`;
    container.appendChild(tooltip);
    container.style.position = "relative";

    function nearestIndex(clientX, rect) {
      const vx = ((clientX - rect.left) / rect.width) * W;
      let best = 0, bestDist = Infinity;
      points.forEach((p, i) => {
        const d = Math.abs(xAt(i) - vx);
        if (d < bestDist) { bestDist = d; best = i; }
      });
      return best;
    }

    function showAt(i, rect) {
      const p = points[i];
      const x = xAt(i), y = yAt(p.value);
      crosshair.setAttribute("x1", x);
      crosshair.setAttribute("x2", x);
      crosshair.setAttribute("opacity", "1");
      hoverRing.setAttribute("cx", x); hoverRing.setAttribute("cy", y); hoverRing.setAttribute("opacity", "1");
      hoverDot.setAttribute("cx", x); hoverDot.setAttribute("cy", y); hoverDot.setAttribute("opacity", "1");

      tooltip.querySelector(".tt-date").textContent = fmtDate(p.date);
      tooltip.querySelector(".tt-value").textContent = opts.formatValue(p.value, false);
      const px = (x / W) * rect.width;
      const py = (y / H) * rect.height;
      tooltip.style.left = px + "px";
      tooltip.style.top = py + "px";
      tooltip.style.opacity = "1";
    }

    function hide() {
      crosshair.setAttribute("opacity", "0");
      hoverRing.setAttribute("opacity", "0");
      hoverDot.setAttribute("opacity", "0");
      tooltip.style.opacity = "0";
    }

    overlay.addEventListener("pointermove", (e) => {
      const rect = svg.getBoundingClientRect();
      showAt(nearestIndex(e.clientX, rect), rect);
    });
    overlay.addEventListener("pointerleave", hide);
  }

  // ---------- detail render ----------

  function renderDetail() {
    const code = state.selectedCode;
    const company = state.companies.find((c) => c.code === code);
    if (!company) return;
    const fullHist = state.pricesByCode[code] || [];
    const hist = filteredHistory(fullHist);
    const ir = (state.irByCode[code] || []).slice().sort((a, b) => a.date.localeCompare(b.date));

    document.getElementById("priceChartTitle").textContent = `株価推移（${company.name}）`;
    document.getElementById("capChartTitle").textContent = `時価総額推移（${company.name}）`;
    document.getElementById("irTitle").textContent = `IR（適時開示）履歴 — ${company.name}`;

    renderStats(company, fullHist, ir);

    renderLineChart(
      document.getElementById("priceChartBox"),
      hist.map((r) => ({ date: r.date, value: r.close })),
      { color: "var(--series-price)", formatValue: (v) => fmtYen(v) }
    );

    renderLineChart(
      document.getElementById("capChartBox"),
      hist.filter((r) => r.market_cap != null).map((r) => ({ date: r.date, value: r.market_cap })),
      { color: "var(--series-cap)", formatValue: (v) => fmtMarketCap(v) }
    );

    const tbody = document.getElementById("priceTableBody");
    tbody.innerHTML = "";
    hist.slice().reverse().forEach((r) => {
      const tr = document.createElement("tr");
      [fmtDate(r.date), fmtYen(r.close), fmtShares(r.shares_outstanding), fmtMarketCap(r.market_cap)].forEach((v) => {
        const td = document.createElement("td");
        td.textContent = v;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    renderKpi(company);

    const irList = document.getElementById("irList");
    irList.innerHTML = "";
    if (!ir.length) {
      const li = document.createElement("li");
      li.className = "empty-state";
      li.textContent = "この銘柄のIR記録はまだありません。scripts/add_ir_event.py で追加できます。";
      irList.appendChild(li);
    } else {
      ir.slice().reverse().forEach((ev) => {
        const li = document.createElement("li");
        const dateSpan = document.createElement("span");
        dateSpan.className = "ir-date";
        dateSpan.textContent = fmtDate(ev.date);
        const tag = document.createElement("span");
        tag.className = "ir-tag";
        tag.textContent = ev.category || "その他";
        const titleDiv = document.createElement("div");
        titleDiv.className = "ir-title";
        if (ev.url) {
          const a = document.createElement("a");
          a.href = ev.url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = ev.title;
          titleDiv.appendChild(a);
        } else {
          titleDiv.textContent = ev.title;
        }
        li.appendChild(dateSpan);
        li.appendChild(tag);
        li.appendChild(titleDiv);
        if (ev.note) {
          const noteDiv = document.createElement("div");
          noteDiv.className = "ir-note";
          noteDiv.textContent = ev.note;
          li.appendChild(noteDiv);
        }
        irList.appendChild(li);
      });
    }
  }

  // ---------- range buttons ----------

  function attachRangeButtons() {
    document.querySelectorAll("#rangeButtons button").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#rangeButtons button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.range = btn.dataset.range;
        renderDetail();
      });
    });
  }

  // ---------- theme ----------

  function attachThemeToggle() {
    const btn = document.getElementById("themeToggle");
    const saved = localStorage.getItem("theme");
    if (saved) document.documentElement.setAttribute("data-theme", saved);
    btn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme");
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const currentlyDark = current ? current === "dark" : prefersDark;
      const next = currentlyDark ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("theme", next);
    });
  }

  // ---------- init ----------

  async function init() {
    await loadAll();
    renderStatus();
    renderOverview();
    attachSorting();
    renderCompanySelect();
    attachRangeButtons();
    attachThemeToggle();

    const saved = localStorage.getItem("selectedCompanyCode");
    const initial = (saved && state.companies.some((c) => c.code === saved))
      ? saved
      : (state.companies[0] && state.companies[0].code);
    if (initial) selectCompany(initial);
  }

  init();
})();
