(() => {
  "use strict";

  // A single current X-Piratez item snapshot. Engine reference modes are static HTML
  // with stable #mode-N anchors; data is also available as ./items.json.
  const snapshot = window.XPZ_REFERENCE_ITEMS;
  const $ = selector => document.querySelector(selector);
  const modeRows = [...document.querySelectorAll("#modes tbody tr")];
  const c = {
    modeSearch: $("#search"),
    modeStatus: $("#mode-status"),
    itemSearch: $("#item-search"),
    itemMode: $("#item-mode"),
    itemStatus: $("#item-status"),
    itemRows: $("#item-rows")
  };
  if (!snapshot || !Array.isArray(snapshot.items)) {
    c.itemStatus.textContent = "아이템 데이터를 읽을 수 없습니다. items.json을 확인해 주세요.";
    return;
  }

  const params = new URLSearchParams(location.search);
  c.itemSearch.value = params.get("q") || "";
  const requestedMode = params.get("mode") || "";

  function addCell(row, value, className = "", href = "") {
    const td = document.createElement("td");
    if (className) td.className = className;
    const node = document.createElement(href ? "a" : "span");
    node.textContent = String(value);
    if (href) node.href = href;
    td.append(node);
    row.append(td);
    return td;
  }

  function filterModes() {
    const query = c.modeSearch.value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const row of modeRows) {
      const show = !query || row.textContent.toLocaleLowerCase().includes(query);
      row.classList.toggle("hiddenrow", !show);
      if (show) visible++;
    }
    c.modeStatus.textContent = visible + " / " + modeRows.length + "개 모드";
  }

  function refreshQuery() {
    const params = new URLSearchParams(location.search);
    // Older external links may still contain the retired version parameter.
    params.delete("version");
    const q = c.itemSearch.value.trim();
    if (q) params.set("q", q);
    else params.delete("q");
    if (c.itemMode.value) params.set("mode", c.itemMode.value);
    else params.delete("mode");

    const next = location.pathname + (params.toString() ? "?" + params : "") + location.hash;
    try { history.replaceState(null, "", next); } catch (_) { /* file:// preview */ }
  }

  function populateModes() {
    const values = [...new Set(snapshot.items.map(item => item.m))].sort((a, b) => a - b);
    c.itemMode.replaceChildren(new Option("모든 모드", ""));
    for (const value of values) {
      const label = document.getElementById("mode-" + value)?.querySelectorAll("td")[1]?.textContent || "";
      c.itemMode.add(new Option(value + " · " + label, String(value)));
    }
    c.itemMode.value = values.some(value => String(value) === requestedMode) ? requestedMode : "";
  }

  const sorted = [...snapshot.items].sort((a, b) =>
    (a.k || a.e || a.i).localeCompare(b.k || b.e || b.i, "ko") || a.i.localeCompare(b.i));

  function renderItems() {
    const q = c.itemSearch.value.trim().toLocaleLowerCase();
    const mode = c.itemMode.value;
    const fragment = document.createDocumentFragment();
    let count = 0;
    for (const item of sorted) {
      const words = (String(item.k || "") + " " + String(item.e || "") + " " + item.i).toLocaleLowerCase();
      if (q && !words.includes(q)) continue;
      if (mode && String(item.m) !== mode) continue;

      count++;
      const tr = document.createElement("tr");
      tr.id = "item-" + item.i;

      const label = document.createElement("td");
      const name = document.createElement("a");
      name.href = "#item-" + item.i;
      name.textContent = item.k || item.e || item.i;
      const details = document.createElement("small");
      details.textContent = item.i + (item.e && item.e !== item.k ? " · " + item.e : "");
      label.append(name, details);
      tr.append(label);

      addCell(tr, item.m, "num", "#mode-" + item.m);
      addCell(tr, item.d == null ? "—" : item.d, "", item.d == null ? "" : "#damage-" + item.d);
      addCell(tr, item.p == null ? "—" : item.p);
      addCell(tr, item.f + ":" + item.l, "fine");
      fragment.append(tr);
    }

    c.itemRows.replaceChildren(fragment);
    c.itemStatus.textContent = "X-Piratez 2.1 · " + count + " / " + snapshot.items.length +
      "개 명시 선언" + (q || mode ? " · 검색/필터 적용" : "");
    refreshQuery();
  }

  function followDeepLink() {
    const hash = decodeURIComponent(location.hash.slice(1));
    if (!hash.startsWith("item-")) return;
    const target = document.getElementById(hash);
    if (target) {
      target.scrollIntoView({block: "nearest"});
    } else {
      c.itemStatus.textContent += " · 해당 항목은 현재 검색 조건에서 표시되지 않습니다.";
    }
  }

  c.modeSearch.addEventListener("input", filterModes);
  c.itemSearch.addEventListener("input", renderItems);
  c.itemMode.addEventListener("change", renderItems);
  window.addEventListener("hashchange", followDeepLink);

  populateModes();
  filterModes();
  renderItems();
  followDeepLink();
})();
