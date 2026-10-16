(() => {
  'use strict';
  const cases = window.REA_CASES || [];
  const categories = [
    ['all', '전체'], ['game', '게임·보존'], ['desktop', '데스크톱·앱'],
    ['web', '웹·서비스'], ['android', '모바일·인증'], ['native', '바이너리·도구'], ['lab', '교육·실험']
  ];
  const categoryNames = Object.fromEntries(categories);
  const kindNames = { official: '공식 시연', community: '사용자 실행 기록', benchmark: '비교 실험', video: '영상 시연' };
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/g, ' ').trim();
  const pageSize = 12;
  const state = { category: 'all', kind: 'all', query: '', sort: 'curated', bookmarksOnly: false, page: 1 };
  let saved = new Set();
  try {
    const value = JSON.parse(localStorage.getItem('rea-case-atlas-bookmarks') || '[]');
    if (Array.isArray(value)) saved = new Set(value.filter(id => cases.some(item => item.id === id)));
  } catch { /* Unavailable storage leaves a usable session-only list. */ }
  let storageAvailable = true;
  let filtered = [];
  let currentId = null;
  let lastFocused = null;
  let toastTimer;
  const safeUrl = value => {
    try { const url = new URL(value); return url.protocol === 'https:' ? url.href : '#'; }
    catch { return '#'; }
  };
  function toast(message) {
    $('toast').textContent = message;
    $('toast').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2700);
  }
  function persistSaved() {
    try { localStorage.setItem('rea-case-atlas-bookmarks', JSON.stringify([...saved])); }
    catch { storageAvailable = false; }
  }
  function updateBookmarkControls() {
    $('bookmark-count').textContent = saved.size;
    $('bookmark-filter').setAttribute('aria-pressed', String(state.bookmarksOnly));
    document.querySelectorAll('[data-save]').forEach(button => {
      const active = saved.has(button.dataset.save);
      button.setAttribute('aria-pressed', String(active));
      if (button.classList.contains('save-button')) {
        button.textContent = active ? '★' : '☆';
        const title = cases.find(item => item.id === button.dataset.save)?.title || '';
        button.setAttribute('aria-label', `${title} ${active ? '저장 해제' : '저장'}`);
      } else button.textContent = active ? '★ 저장됨' : '☆ 사례 저장';
    });
  }
  function toggleSave(id) {
    if (saved.has(id)) { saved.delete(id); toast('저장한 사례에서 제외했습니다.'); }
    else { saved.add(id); toast('이 브라우저에 사례를 저장했습니다.'); }
    persistSaved();
    if (!storageAvailable) toast('이번 방문 동안 저장됩니다. 브라우저 저장소를 사용할 수 없습니다.');
    if (state.bookmarksOnly) render();
    updateBookmarkControls();
  }
  function renderCategories() {
    $('category-tabs').innerHTML = categories.map(([id, label]) => {
      const count = id === 'all' ? cases.length : cases.filter(item => item.category === id).length;
      return `<button class="category-tab ${state.category === id ? 'active' : ''}" data-category="${id}" aria-pressed="${state.category === id}">${label}<span>${count}</span></button>`;
    }).join('');
  }
  function getFiltered() {
    const terms = normalize(state.query).split(' ').filter(Boolean);
    const result = cases.filter(item => {
      if (state.category !== 'all' && item.category !== state.category) return false;
      if (state.kind !== 'all' && item.kind !== state.kind) return false;
      if (state.bookmarksOnly && !saved.has(item.id)) return false;
      const haystack = normalize([item.title, item.target, item.description, item.result, categoryNames[item.category], ...(item.tags || [])].join(' '));
      return terms.every(term => haystack.includes(term));
    });
    if (state.sort === 'title') result.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
    return result;
  }
  function render() {
    filtered = getFiltered();
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    state.page = Math.min(state.page, pages);
    const start = (state.page - 1) * pageSize;
    const visible = filtered.slice(start, start + pageSize);
    $('result-status').innerHTML = state.query ? `<strong>${filtered.length}개</strong> 검색 결과 <span> / 전체 ${cases.length}개</span>` : `<strong>${filtered.length}개</strong> 사례 <span> / 전체 ${cases.length}개</span>`;
    $('case-list').innerHTML = visible.map(item => {
      const number = cases.indexOf(item) + 1;
      return `<article class="case-row" data-case="${escape(item.id)}">
        <span class="case-number">${String(number).padStart(3, '0')}</span>
        <div class="case-identity"><div class="case-meta"><span class="category-label">${escape(categoryNames[item.category])}</span><span class="kind-badge">${escape(kindNames[item.kind])}</span></div><h3>${escape(item.title)}</h3><span class="case-target">${escape(item.target)}</span></div>
        <div class="case-summary-area"><p class="case-summary">${escape(item.description)}</p><div class="summary-tags">${(item.tags || []).slice(0, 3).map(tag => `<span>${escape(tag)}</span>`).join('')}</div></div>
        <div class="case-open-area"><button class="save-button" data-save="${escape(item.id)}" aria-pressed="${saved.has(item.id)}" aria-label="${escape(item.title)} ${saved.has(item.id) ? '저장 해제' : '저장'}">${saved.has(item.id) ? '★' : '☆'}</button><button class="open-case" data-open="${escape(item.id)}" aria-label="${escape(item.title)} 상세 보기">↗</button></div></article>`;
    }).join('');
    $('empty').hidden = filtered.length !== 0;
    $('pagination').hidden = filtered.length === 0;
    $('pagination').innerHTML = `<button data-page="${state.page - 1}" aria-label="이전 페이지" ${state.page === 1 ? 'disabled' : ''}>←</button>` + Array.from({ length: pages }, (_, index) => `<button data-page="${index + 1}" aria-label="${index + 1}페이지" ${index + 1 === state.page ? 'class="active" aria-current="page"' : ''}>${index + 1}</button>`).join('') + `<button data-page="${state.page + 1}" aria-label="다음 페이지" ${state.page === pages ? 'disabled' : ''}>→</button><span class="page-summary">${filtered.length ? start + 1 : 0}–${Math.min(start + pageSize, filtered.length)} / ${filtered.length}</span>`;
    renderCategories();
    updateBookmarkControls();
  }
  function setCaseUrl(id, push = false) {
    const url = new URL(location.href);
    if (id) url.searchParams.set('case', id);
    else url.searchParams.delete('case');
    if (push) history.pushState({}, '', url);
    else history.replaceState({}, '', url);
  }
  function showDialog(dialog) {
    if (!dialog.open) {
      lastFocused = document.activeElement;
      dialog.showModal();
    }
    document.body.classList.add('modal-open');
  }
  function openCase(id, updateUrl = true) {
    const item = cases.find(entry => entry.id === id);
    if (!item) return;
    const wasOpen = $('case-dialog').open;
    if ($('method-dialog').open) $('method-dialog').close();
    currentId = id;
    const context = filtered.length ? filtered : cases;
    const position = context.findIndex(entry => entry.id === id);
    const sourceLinks = item.sources.map((source, index) => {
      const href = safeUrl(source.url);
      const domain = new URL(href, location.href).hostname;
      return `<a class="source-link" href="${escape(href)}" target="_blank" rel="noopener noreferrer"><span>${String(index + 1).padStart(2, '0')} · ${escape(source.label || '원본 실행 기록')}<small>${escape(domain)}</small></span><span aria-hidden="true">↗</span></a>`;
    }).join('');
    $('dialog-content').innerHTML = `<div class="detail-body"><span class="dialog-category">${escape(categoryNames[item.category])}</span><h2 class="detail-title" id="dialog-title">${escape(item.title)}</h2><p class="detail-subtitle">분석 대상 · ${escape(item.target)}</p><div class="detail-badges"><span>${escape(kindNames[item.kind])}</span>${item.scope ? `<span>${escape(item.scope)}</span>` : ''}<span>원본 출처 ${item.sources.length}개</span></div><p class="detail-summary">${escape(item.description)}</p><span class="summary-caption">설명 ${[...item.description].length}자 · 공백 포함</span>${item.result || item.limitation ? `<div class="detail-panels">${item.result ? `<section class="detail-panel"><h3>확인된 결과</h3><p>${escape(item.result)}</p></section>` : ''}${item.limitation ? `<section class="detail-panel limit"><h3>검증 범위와 한계</h3><p>${escape(item.limitation)}</p></section>` : ''}</div>` : ''}<h3 class="source-heading">원본 출처로 이어보기</h3>${sourceLinks}<div class="detail-actions"><button data-save="${escape(id)}" aria-pressed="${saved.has(id)}">${saved.has(id) ? '★ 저장됨' : '☆ 사례 저장'}</button><button id="copy-case">사례 링크 복사 ↗</button></div><div class="detail-nav"><button id="previous-case" ${position <= 0 ? 'disabled' : ''}>← 이전 사례</button><span>${position >= 0 ? position + 1 : '—'} / ${context.length}</span><button id="next-case" ${position < 0 || position >= context.length - 1 ? 'disabled' : ''}>다음 사례 →</button></div></div>`;
    showDialog($('case-dialog'));
    $('case-dialog').scrollTop = 0;
    if (updateUrl) setCaseUrl(id, !wasOpen);
    $('previous-case').addEventListener('click', () => { if (position > 0) openCase(context[position - 1].id); });
    $('next-case').addEventListener('click', () => { if (position < context.length - 1) openCase(context[position + 1].id); });
    $('copy-case').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(location.href); toast('사례 링크를 복사했습니다.'); }
      catch { toast('주소창의 링크를 복사해 주세요.'); }
    });
  }
  $('search').addEventListener('input', event => { state.query = event.target.value; state.page = 1; render(); });
  $('kind').addEventListener('change', event => { state.kind = event.target.value; state.page = 1; render(); });
  $('sort').addEventListener('change', event => { state.sort = event.target.value; state.page = 1; render(); });
  $('category-tabs').addEventListener('click', event => {
    const button = event.target.closest('[data-category]');
    if (button) { state.category = button.dataset.category; state.page = 1; render(); }
  });
  $('bookmark-filter').addEventListener('click', () => { state.bookmarksOnly = !state.bookmarksOnly; state.page = 1; render(); });
  $('pagination').addEventListener('click', event => {
    const button = event.target.closest('[data-page]');
    if (button && !button.disabled) {
      state.page = Number(button.dataset.page); render();
      $('archive').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
  });
  $('reset').addEventListener('click', () => {
    Object.assign(state, { category: 'all', kind: 'all', query: '', sort: 'curated', bookmarksOnly: false, page: 1 });
    $('search').value = ''; $('kind').value = 'all'; $('sort').value = 'curated'; render();
  });
  document.addEventListener('click', event => {
    const saveButton = event.target.closest('[data-save]');
    if (saveButton) { event.stopPropagation(); toggleSave(saveButton.dataset.save); return; }
    const openButton = event.target.closest('[data-open]');
    if (openButton) { openCase(openButton.dataset.open); return; }
    const row = event.target.closest('[data-case]');
    if (row) openCase(row.dataset.case);
    const methodButton = event.target.closest('[data-method]');
    if (methodButton) { if ($('case-dialog').open) $('case-dialog').close(); showDialog($('method-dialog')); }
  });
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.querySelector('.close-dialog').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => {
      if (dialog.id === 'case-dialog') { currentId = null; setCaseUrl(null); }
      if (!document.querySelector('dialog[open]')) {
        document.body.classList.remove('modal-open');
        if (lastFocused?.isConnected) lastFocused.focus({ preventScroll: true });
      }
    });
  });
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !document.querySelector('dialog[open]') && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
      event.preventDefault(); $('search').focus();
    }
  });
  window.addEventListener('popstate', () => {
    const id = new URLSearchParams(location.search).get('case');
    if (id && cases.some(item => item.id === id)) openCase(id, false);
    else if ($('case-dialog').open) $('case-dialog').close();
  });
  $('verified-count').textContent = cases.length;
  $('nav-count').textContent = cases.length;
  $('research-note').textContent = `${cases.length}건의 공개 실행 기록을 수록했습니다. 나머지 ${Math.max(0, 100 - cases.length)}건은 확인된 원문을 확보하기 전까지 비워 둡니다.`;
  render();
  const initialId = new URLSearchParams(location.search).get('case');
  if (initialId) {
    if (cases.some(item => item.id === initialId)) openCase(initialId, false);
    else { setCaseUrl(null); toast('해당 사례를 찾을 수 없어 전체 목록을 보여드립니다.'); }
  }
})();
