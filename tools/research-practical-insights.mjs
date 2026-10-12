// Explain research availability as a boolean gate, and cash extraction as an
// incremental decision. All amounts and paths come from the effective ruleset.
import fs from "node:fs";
import path from "node:path";

const arr = value => Array.isArray(value) ? value : [];
const finite = value => typeof value === "number" && Number.isFinite(value);
const money = value => "$" + Math.round(value).toLocaleString("en-US");
const unique = values => [...new Set(values.filter(Boolean))];

export function makePracticalResearchInsights({research, detailFor, worldDir, ko}) {
  const byId = new Map(research.map(row => [row.id, row]));
  const unlockers = new Map();

  // An explicit unlocks source bypasses dependencies, but NEVER requires.
  for (const row of research) {
    for (const target of arr(detailFor(row)?.raw?.unlocks)) {
      if (!byId.has(target)) continue;
      if (!unlockers.has(target)) unlockers.set(target, []);
      unlockers.get(target).push(row.id);
    }
  }

  const manufactureIndex = new Map(
    (JSON.parse(fs.readFileSync(path.join(worldDir, "manufacture-index.json"), "utf8")).index || [])
      .map(row => [row.id, row])
  );
  const manufactureBuckets = new Map();
  function manufacture(id) {
    const row = manufactureIndex.get(id);
    if (!row) return null;
    if (!manufactureBuckets.has(row.bucket)) {
      const file = path.join(worldDir, "manufacture-chunks", row.bucket + ".json");
      manufactureBuckets.set(row.bucket, JSON.parse(fs.readFileSync(file, "utf8")).details);
    }
    return manufactureBuckets.get(row.bucket)?.[id] || null;
  }

  const labels = (ids, limit = 5) => {
    const values = unique(arr(ids));
    return values.slice(0, limit).map(ko).join("·") +
      (values.length > limit ? " 외 " + (values.length - limit) + "개" : "");
  };

  function dependencyLabel(id) {
    const gateRow = byId.get(id), gate = gateRow && detailFor(gateRow);
    if (!gate) return ko(id);
    const deps = unique(arr(gate.raw?.dependencies));
    const sources = unique(unlockers.get(id) || []);
    const requires = arr(gate.raw?.requires);
    // This is a genuine OR gate: each listed route explicitly unlocks the
    // zero-cost proxy, so all its nominal dependencies are NOT required.
    const isFreeGate = gate.cost == null || gate.cost === 0;
    if (isFreeGate && !gate.needItem && !requires.length && deps.length >= 2 &&
        deps.every(dependency => sources.includes(dependency))) {
      return "(" + deps.map(ko).join(" / ") + " 중 하나 → " + ko(id) + ")";
    }
    return ko(id);
  }

  function gateFor(row, detail) {
    const raw = detail.raw || {};
    const dependencies = unique(arr(raw.dependencies));
    const requires = unique(arr(raw.requires));
    const sources = unique(unlockers.get(row.id) || []);
    const parts = [];

    if (dependencies.length) {
      parts.push("직접 연구 경로: " + dependencies.map(dependencyLabel).join(" + ") +
        " 모두 완료해야 선행 조건이 충족된다.");
    } else if (!requires.length) {
      parts.push("직접 연구 경로에는 반드시 먼저 완료해야 할 선행 연구가 없다.");
    }
    if (sources.length) {
      parts.push("대체 경로: " + labels(sources, 5) +
        " 중 한 연구가 명시적으로 unlocks하면 위 dependencies 묶음을 우회한다.");
    }
    if (requires.length) {
      parts.push("우회 불가능한 필수조건(requires): " + labels(requires, 5) +
        " 모두 필요하며 unlocks로 생략할 수 없다.");
    }
    if (detail.needItem) {
      parts.push(ko(row.id) + " 실물 1개가 연구를 수행하는 기지에 있어야 하며" +
        (detail.destroyItem ? " 연구에서 1개 소모된다." : " 연구 후에도 소모되지 않는다."));
    } else {
      parts.push("이 연구 자체에는 동명 실물 보유 조건이 없다.");
    }
    if (arr(raw.requiresBaseFunc).length) {
      parts.push("연구 기지 기능도 필요: " + labels(raw.requiresBaseFunc, 3) + ".");
    }
    return parts.join(" ");
  }

  function economyFor(row, detail) {
    // Only compare deterministic, fully priced 1:1 cash-extraction recipes.
    // Do NOT turn stochastic boxes or valuable non-cash rewards into a
    // fabricated guaranteed-profit claim.
    const refs = arr(detail.manufactureReferences)
      .filter(ref => arr(ref.paths).some(p => p === "requires" || p.startsWith("requires.")));
    for (const ref of refs) {
      const recipe = manufacture(ref.id);
      if (!recipe || !arr(recipe.raw?.requires).includes(row.id) || recipe.raw?.refund) continue;
      const inputs = arr(recipe.requiredItems), random = arr(recipe.randomOutputs);
      if (inputs.length !== 1 || inputs[0].id !== row.id || inputs[0].qty !== 1 || random.length) continue;
      const sale = inputs[0].costSell, econ = recipe.economics || {};
      if (!finite(sale) || sale <= 0 || !econ.economicComparable ||
          !econ.inputSellCoverage || !econ.outputSellCoverage ||
          !finite(econ.deterministicOutputSellValue) || !finite(recipe.cost)) continue;

      const output = econ.deterministicOutputSellValue;
      const gain = output - recipe.cost - sale;
      const details = "즉시 판매 " + money(sale) + " vs " + ko(recipe.id) +
        "(현금비 " + money(recipe.cost) + ", " + ko(row.id) + " 1개 소모) 후 결과물 판매 " +
        money(output) + ".";
      const engineerTime = finite(recipe.time) && recipe.time > 0
        ? " 제조 1회당 기술자-시간 " + recipe.time.toLocaleString("ko-KR") +
          "의 기회비용은 현금 손익에서 제외했다." : "";

      if (gain <= 0) {
        return details + " 판매 대신 추출할 때마다 " + money(-gain) +
          (gain < 0 ? " 손해다." : " 추가 이익이 없다.") +
          (detail.destroyItem ? " 최초 연구에서 표본 1개까지 소모되므로 순수 환금 목적에는 더 불리하다." : "") +
          engineerTime;
      }

      let result = details + " 추출 1회당 직접 판매 대비 " + money(gain) +
        " 추가 이익이다.";
      if (detail.needItem && detail.destroyItem) {
        const initiallyLost = sale;
        // Compare N original items sold directly with one item researched
        // and the remaining N-1 processed. Strictly positive profit:
        // (N - 1) * gain - initiallyLost > 0.
        const minimumTotal = Math.floor(initiallyLost / gain) + 2;
        const additional = minimumTotal - 1;
        const firstNet = additional * gain - initiallyLost;
        result += " 하지만 연구에 표본 1개(" + money(initiallyLost) +
          ")를 잃으므로 처음부터 환금만 노린다면 총 " + minimumTotal.toLocaleString("ko-KR") +
          "개 확보, 연구용 1개 + 추가 " + additional.toLocaleString("ko-KR") +
          "개 추출부터 순이익(" + money(firstNet) + ")이다. 식: (총 보유·획득 수량 − 1) × " +
          money(gain) + " − " + money(initiallyLost) + ".";
      } else {
        result += " 이 연구를 이미 완료했다면 최초 표본 손실은 추가 비용으로 중복 계산하지 않는다.";
      }
      return result + engineerTime +
        " 다른 해금 목적이나 크레딧 칩의 별도 사용가치는 포함하지 않은 판매가 비교다.";
    }
    return "";
  }

  return {
    gateFor,
    economyFor
  };
}
