(() => {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const search = $("#voxel-search");
  const species = $("#voxel-species");
  const sort = $("#voxel-sort");
  const exceptions = $("#voxel-armor-exceptions");
  const bodyRows = $("#voxel-body-rows");
  const armorRows = $("#voxel-armor-rows");
  const bodyStatus = $("#voxel-body-status");
  const armorStatus = $("#voxel-armor-status");
  if (!search || !species || !bodyRows || !armorRows) return;

  const cell = (tr, text, className = "") => {
    const td = document.createElement("td");
    td.textContent = String(text);
    if (className) td.className = className;
    tr.append(td);
    return td;
  };
  const normalize = text => String(text || "").normalize("NFKC").toLocaleLowerCase().replace(/[\s'’_-]/g,"");
  const alias = s => s.id === "STR_SOLDIER" ? "갈 일반갈" : "";
  const textFor = s => normalize([s.koName,s.enName,s.id,alias(s)].join(" "));
  const fmt = n => Number.isFinite(Number(n)) ? String(n) : "—";
  const label = n => n == null ? "미지정" : n === false ? "불가 명시" : "허용 명시";
  const shapeFor = (s, a) => ({
    standing: a.standHeightOverride === -1 ? s.base.standing : a.standHeightOverride,
    kneeling: a.kneelHeightOverride === -1 ? s.base.kneeling : a.kneelHeightOverride,
    floating: a.floatHeightOverride === -1 ? s.base.floating : a.floatHeightOverride,
    size: a.size,
    allowsKneeling: a.allowsKneeling
  });
  const nameLink = (tr, s, itemId = "") => {
    const td = document.createElement("td");
    const a = document.createElement("a");
    a.href = itemId
      ? "#voxel-armor-" + itemId + "-" + s.id
      : "../soldiers/modern/?dataset=soldiers&family=" + encodeURIComponent(s.id);
    a.textContent = s.koName + (s.id === "STR_SOLDIER" ? " / 일반 갈" : "");
    const small = document.createElement("small");
    small.textContent = s.id;
    td.append(a, small);
    tr.append(td);
  };
  function updateQuery() {
    const params = new URLSearchParams(location.search);
    if (species.value) params.set("species", species.value);
    else params.delete("species");
    try { history.replaceState(null, "", location.pathname +
      (params.size ? "?" + params : "") + location.hash); }
    catch (_) { /* local file preview */ }
  }

  async function initialize() {
    const response = await fetch("./unit-voxels.json", {cache:"no-cache"});
    if (!response.ok) throw new Error("HTTP " + response.status);
    const data = await response.json();
    if (!Array.isArray(data.soldiers) || !Array.isArray(data.armors))
      throw new Error("병종·방어구 데이터 형식 오류");
    const soldiers = new Map(data.soldiers.map(s => [s.id, s]));
    const available = [...data.soldiers].sort((a,b) =>
      a.koName.localeCompare(b.koName,"ko"));
    for (const s of available) species.add(new Option(s.koName + (s.id === "STR_SOLDIER" ? " (일반 갈)" : "") + " / " + s.id, s.id));
    const params = new URLSearchParams(location.search);
    if (soldiers.has(params.get("species"))) species.value = params.get("species");

    const combos = data.armors.flatMap(a => a.soldierTypes
      .filter(id => soldiers.has(id))
      .map(id => ({armor:a, soldier:soldiers.get(id), shape:shapeFor(soldiers.get(id),a)})));
    const source = $("#voxel-sources");
    if (source) source.textContent =
      "X-Piratez " + data.gameVersion + " · 병종 " + data.soldiers.length +
      "종 · 착용 가능 방어구 " + data.armors.length +
      "종 · 룰 파일 SHA-256 " + Object.keys(data.sourceHashes || {}).length + "개";

    function render() {
      const query = normalize(search.value.trim());
      const selected = species.value;
      const visible = available.filter(s =>
        (!selected || s.id === selected) &&
        (!query || textFor(s).includes(query) ||
          normalize(s.defaultArmor).includes(query)));
      const ordered = [...visible].sort((a,b) => {
        if (sort.value === "kneel") return a.defaultShape.kneeling -
          b.defaultShape.kneeling || a.koName.localeCompare(b.koName,"ko");
        if (sort.value === "stand") return a.defaultShape.standing -
          b.defaultShape.standing || a.koName.localeCompare(b.koName,"ko");
        return a.koName.localeCompare(b.koName,"ko");
      });
      const fragment = document.createDocumentFragment();
      for (const s of ordered) {
        const shape = s.defaultShape;
        const tr = document.createElement("tr");
        tr.id = "voxel-body-" + s.id;
        nameLink(tr,s);
        cell(tr,s.base.standing,"num");
        cell(tr,s.base.kneeling,"num");
        cell(tr,shape.standing,"num");
        cell(tr,shape.kneeling,"num");
        cell(tr,fmt(shape.standingShotOrigin),"num");
        cell(tr,shape.size + "×" + shape.size + "타일");
        const td = cell(tr,s.defaultArmor || "—");
        const small = document.createElement("small");
        small.textContent = shape.allowsKneeling === false
          ? "이 방어구: 무릎 허용 안 함" : "기본 착용 방어구";
        td.append(small);
        fragment.append(tr);
      }
      bodyRows.replaceChildren(fragment);
      bodyStatus.textContent = "기본 병종 " + ordered.length + " / " +
        data.soldiers.length + "개 · 기본 방어구 적용 높이";

      const onlyDifferences = exceptions.checked;
      const matches = combos.filter(({soldier:s,armor:a,shape:h}) => {
        if (selected && s.id !== selected) return false;
        if (query && !textFor(s).includes(query) &&
            !textFor(a).includes(query)) return false;
        if (!onlyDifferences) return true;
        return h.standing !== s.base.standing || h.kneeling !== s.base.kneeling ||
          h.floating !== s.base.floating || h.size !== 1 ||
          h.allowsKneeling === false;
      });
      const sortedCombos = [...matches].sort((a,b) =>
        a.shape.kneeling-b.shape.kneeling ||
        a.soldier.koName.localeCompare(b.soldier.koName,"ko") ||
        a.armor.koName.localeCompare(b.armor.koName,"ko"));
      const afrag = document.createDocumentFragment();
      for (const {soldier:s,armor:a,shape:h} of sortedCombos) {
        const tr = document.createElement("tr");
        tr.id = "voxel-armor-" + a.id + "-" + s.id;
        nameLink(tr,s,a.id);
        const td = document.createElement("td");
        const title = document.createElement("strong");
        title.textContent = a.koName;
        const small = document.createElement("small");
        small.textContent = a.id;
        td.append(title,small);tr.append(td);
        cell(tr,h.standing,"num");
        cell(tr,h.kneeling,"num");
        cell(tr,h.floating,"num");
        cell(tr,(h.standing+h.floating-4),"num");
        cell(tr,h.size + "×" + h.size + "타일");
        cell(tr,label(h.allowsKneeling));
        cell(tr,(a.sourceFiles||[]).join(" · "),"fine");
        afrag.append(tr);
      }
      armorRows.replaceChildren(afrag);
      armorStatus.textContent = "방어구 × 병종 조합 " + matches.length +
        " / " + combos.length +
        "개" + (onlyDifferences?" · 기본 병종 높이/점유/자세 제한과 다른 조합":"");
      updateQuery();
    }

    search.addEventListener("input",render);
    species.addEventListener("change",render);
    sort.addEventListener("change",render);
    exceptions.addEventListener("change",render);
    render();
  }
  initialize().catch(error => {
    bodyStatus.textContent = "참조표 데이터 로드 실패: " + error.message +
      " · unit-voxels.json을 직접 확인하세요.";
    armorStatus.textContent = "방어구 표를 표시할 수 없습니다.";
  });
})();
