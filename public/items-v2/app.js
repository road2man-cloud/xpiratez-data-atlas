'use strict';
// This reader must never request legacy 1.1 atlas data or mix research/manufacture sources.
(() => {
  const $ = id => document.getElementById(id);
  const controls = {
    search: $('search'), type: $('type'), sort: $('sort'), hasKo: $('has-ko'),
    reverse: $('reverse'), status: $('status'), list: $('items'), more: $('more'),
    compareTrigger: $('compare-trigger'), compare: $('compare'), compareData: $('compare-data'),
    compareClose: $('compare-close'), detail: $('detail'),
    detailName: $('detail-name'), detailMeta: $('detail-meta'), detailFields: $('detail-fields'),
    detailClose: $('detail-close')
  };
  const s = { items: [], selected: new Set(), visible: 100, descending: false, filtered: [] };
  const raw = value => value === null || value === undefined ? '—'
    : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
  const money = value => typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('ko-KR') : '—';
  const display = item => item.koName || item.enName || item.id;
  const field = (item, key) => Object.hasOwn(item.fields, key) ? item.fields[key] : null;
  const addText = (parent, tag, content, className) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = content;
    parent.appendChild(el);
    return el;
  };
  function syncCompareButton() {
    controls.compareTrigger.disabled = s.selected.size < 2;
    controls.compareTrigger.textContent = `선택 비교 (${s.selected.size}/3)`;
  }
  const normalize = value => String(value || '').toLocaleLowerCase('ko-KR').trim();
  function filteredItems() {
    const query = normalize(controls.search.value), group = controls.type.value;
    const onlyKo = controls.hasKo.checked, sort = controls.sort.value;
    const result = s.items.filter(item => {
      if (onlyKo && !item.koName) return false;
      if (group !== 'all' && String(field(item, 'battleType')) !== group) return false;
      return !query || normalize([item.koName, item.enName, item.id].join(' ')).includes(query);
    });
    result.sort((a, b) => {
      let n;
      if (sort === 'name' || sort === 'id') {
        const A = sort === 'name' ? display(a) : a.id;
        const B = sort === 'name' ? display(b) : b.id;
        n = A.localeCompare(B, 'ko');
      } else {
        const A = field(a, sort), B = field(b, sort);
        const validA = typeof A === 'number' && Number.isFinite(A);
        const validB = typeof B === 'number' && Number.isFinite(B);
        if (!validA || !validB) return validA ? -1 : validB ? 1 : a.id.localeCompare(b.id, 'en');
        n = A - B;
      }
      return (s.descending ? -n : n) || a.id.localeCompare(b.id, 'en');
    });
    return result;
  }
  function renderRows() {
    s.filtered = filteredItems();
    controls.list.replaceChildren();
    const fragment = document.createDocumentFragment();
    for (const item of s.filtered.slice(0, s.visible)) {
      const tr = document.createElement('tr');
      const selected = document.createElement('td');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'select-item';
      checkbox.setAttribute('aria-label', display(item) + ' 비교 선택');
      checkbox.checked = s.selected.has(item.id);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked && s.selected.size >= 3) { checkbox.checked = false; return; }
        if (checkbox.checked) s.selected.add(item.id);
        else s.selected.delete(item.id);
        syncCompareButton();
      });
      selected.appendChild(checkbox);
      tr.appendChild(selected);
      const tdName = document.createElement('td');
      const open = document.createElement('button');
      open.className = 'item-name';
      open.type = 'button';
      open.textContent = display(item);
      open.addEventListener('click', () => renderDetail(item));
      tdName.appendChild(open);
      addText(tdName, 'span', item.id, 'item-id');
      tr.appendChild(tdName);
      for (const k of ['battleType', 'weight', 'power', 'costBuy', 'costSell']) {
        const value = field(item, k);
        addText(tr, 'td', k === 'battleType' ? raw(value) : money(value), 'num');
      }
      const source = document.createElement('td');
      addText(source, 'span', item.sourceFiles.at(-1) || '—', 'note');
      tr.appendChild(source);
      fragment.appendChild(tr);
    }
    controls.list.appendChild(fragment);
    controls.more.hidden = s.visible >= s.filtered.length;
    controls.status.textContent =
      `2.1 모드 아이템 ${s.filtered.length.toLocaleString('ko-KR')}개 검색됨 / 전체 ${s.items.length.toLocaleString('ko-KR')}개 · 현재 ${Math.min(s.visible, s.filtered.length)}개 표시`;
  }
  function renderDetail(item) {
    controls.detail.hidden = false;
    controls.detailName.textContent = display(item);
    controls.detailMeta.textContent = `ID: ${item.id} · 영문: ${item.enName || '미등록'} · 규칙 출처: ${item.sourceFiles.join(' → ')}`;
    controls.detailFields.replaceChildren();
    const fields = Object.entries(item.fields);
    if (!fields.length) {
      const tr = document.createElement('tr');
      addText(tr, 'td', '명시된 비교 필드 없음');
      controls.detailFields.appendChild(tr);
    }
    for (const [name, value] of fields) {
      const tr = document.createElement('tr');
      addText(tr, 'th', name);
      const td = document.createElement('td');
      const pre = addText(td, 'pre', raw(value));
      pre.setAttribute('aria-label', name + ' 값');
      tr.appendChild(td);
      controls.detailFields.appendChild(tr);
    }
    controls.detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function renderCompare() {
    const chosen = s.items.filter(item => s.selected.has(item.id));
    if (chosen.length < 2) return;
    controls.compare.hidden = false;
    controls.compareData.replaceChildren();
    const table = document.createElement('table');
    table.className = 'compare-table';
    const head = document.createElement('thead'), heading = document.createElement('tr');
    addText(heading, 'th', '원본 항목');
    for (const item of chosen) addText(heading, 'th', display(item) + '\n' + item.id);
    head.appendChild(heading);table.appendChild(head);
    const body = document.createElement('tbody');
    const keys = ['sourceFiles', ...new Set(chosen.flatMap(item => Object.keys(item.fields)))];
    for (const key of keys) {
      const tr = document.createElement('tr');
      addText(tr, 'th', key);
      for (const item of chosen) addText(tr, 'td', raw(key === 'sourceFiles' ? item.sourceFiles : field(item, key)));
      body.appendChild(tr);
    }
    table.appendChild(body);
    controls.compareData.appendChild(table);
    controls.compare.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const changed = () => { s.visible = 100; renderRows(); };
  controls.search.addEventListener('input', changed);
  controls.type.addEventListener('change', changed);
  controls.sort.addEventListener('change', changed);
  controls.hasKo.addEventListener('change', changed);
  controls.reverse.addEventListener('click', () => {
    s.descending = !s.descending;
    controls.reverse.textContent = s.descending ? '내림차순' : '오름차순';
    changed();
  });
  controls.more.addEventListener('click', () => { s.visible += 100; renderRows(); });
  controls.compareTrigger.addEventListener('click', renderCompare);
  controls.compareClose.addEventListener('click', () => { controls.compare.hidden = true; });
  controls.detailClose.addEventListener('click', () => { controls.detail.hidden = true; });

  fetch('../data/items-v2-index.json', { cache: 'no-cache' })
    .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
    .then(data => {
      if (data.meta?.schema !== 'xpiratez-v2-mod-items/v1' || data.meta?.sourceVersion !== 'v.o2'
        || !Array.isArray(data.items)) throw new Error('X-Piratez 2.1 데이터 형식이 아닙니다');
      s.items = data.items;
      const kinds = [...new Set(s.items.map(item => field(item, 'battleType'))
        .filter(value => typeof value === 'number'))].sort((a, b) => a - b);
      for (const kind of kinds) {
        const opt = document.createElement('option');
        opt.value = String(kind);
        opt.textContent = String(kind);
        controls.type.appendChild(opt);
      }
      renderRows();
      syncCompareButton();
      const requested = new URL(location.href).searchParams.get('id');
      if (requested) {
        const match = s.items.find(item => item.id === requested);
        if (match) renderDetail(match);
      }
    })
    .catch(error => {
      controls.status.textContent = '2.1 아이템 데이터를 열지 못했습니다: ' + error.message;
    });
})();
