import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'dist/app.js'), 'utf8');
const dataScript = fs.readFileSync(path.join(root, 'dist/cases.js'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/cases.json'), 'utf8'));
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };

// This harness exercises application event handlers; it is not a browser or a layout renderer.
function makeEnvironment(initialUrl = 'https://rea-case-atlas.test/', stored = new Map()) {
  const elements = new Map();
  const events = new Map();
  const location = { href: initialUrl, get search() { return new URL(this.href).search; } };
  let document;
  class Element {
    constructor(id = '', tag = 'div') {
      this.id = id; this.tagName = tag.toUpperCase(); this.dataset = {}; this.attributes = {};
      this.listeners = new Map(); this.textContent = ''; this.hidden = false; this.value = '';
      this.open = false; this.isConnected = true; this.disabled = false;
      const classes = new Set();
      this.classList = { add: s => classes.add(s), remove: s => classes.delete(s), contains: s => classes.has(s) };
      this._html = '';
    }
    set innerHTML(value) {
      this._html = value;
      for (const id of this.childIds || []) elements.delete(id);
      this.childIds = [];
      for (const match of value.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"/gi)) {
        elements.set(match[2], new Element(match[2], match[1]));
        this.childIds.push(match[2]);
      }
    }
    get innerHTML() { return this._html; }
    addEventListener(type, callback) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(callback);
    }
    async trigger(type, extra = {}) { for (const fn of [...(this.listeners.get(type) || [])]) await fn({ target: this, ...extra }); }
    setAttribute(name, value) { this.attributes[name] = value; }
    querySelector(selector) { return selector === '.close-dialog' ? (this.closeButton ||= new Element()) : null; }
    showModal() { this.open = true; }
    close() { if (this.open) { this.open = false; for (const fn of this.listeners.get('close') || []) fn({ target: this }); } }
    focus() { document.activeElement = this; }
    scrollIntoView() { this.scrolled = true; }
  }
  for (const match of html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"/gi)) elements.set(match[2], new Element(match[2], match[1]));
  document = {
    body: new Element('body', 'body'), activeElement: new Element('body', 'body'),
    getElementById(id) { assert.ok(elements.has(id), `Referenced DOM id exists: ${id}`); return elements.get(id); },
    querySelector(selector) { if (selector === 'dialog[open]') return [...elements.values()].find(e => e.tagName === 'DIALOG' && e.open) || null; return null; },
    querySelectorAll(selector) { if (selector === 'dialog') return [...elements.values()].filter(e => e.tagName === 'DIALOG'); return []; },
    addEventListener(type, fn) { if (!events.has(type)) events.set(type, []); events.get(type).push(fn); }
  };
  const window = { addEventListener(type, fn) { events.set(type, [fn]); } };
  const copied = [];
  const context = vm.createContext({ window, document, location, URL, URLSearchParams,
    localStorage: { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) },
    navigator: { clipboard: { writeText: async value => copied.push(value) } },
    history: { pushState: (_a, _b, url) => { location.href = String(url); }, replaceState: (_a, _b, url) => { location.href = String(url); } },
    matchMedia: () => ({ matches: true }), setTimeout: () => 1, clearTimeout: () => {}, console
  });
  vm.runInContext(dataScript, context);
  vm.runInContext(source, context);
  return {
    get: id => elements.get(id), stored, location, document, copied,
    async event(type, event) { for (const fn of events.get(type) || []) await fn(event); },
    async click(selector, props) {
      const node = new Element(); Object.assign(node, props);
      await this.event('click', { target: { closest: query => query === selector ? node : null }, stopPropagation() {} });
    },
    visibleCount() { return (elements.get('case-list').innerHTML.match(/class="case-row"/g) || []).length; }
  };
}

const env = makeEnvironment();
check(env.get('verified-count').textContent === data.length, 'Header count equals actual dataset');
check(env.visibleCount() === Math.min(12, data.length), 'Pagination renders the first twelve cases');
check(env.get('pagination').innerHTML.includes(`${data.length}`), 'Pagination includes actual result total');

const search = env.get('search');
search.value = 'DX-Ball'; await search.trigger('input');
check(env.visibleCount() === 1 && env.get('case-list').innerHTML.includes('DX-Ball'), 'Search finds the DX-Ball case');
search.value = 'DX-Ball 3205'; await search.trigger('input');
check(env.visibleCount() === 0, 'Search requires every term instead of returning unrelated matches');
check(env.get('empty').hidden === false, 'No-result guidance is visible');
await env.get('reset').trigger('click');
check(env.visibleCount() === 12 && env.get('empty').hidden, 'Reset restores the catalogue');

await env.get('category-tabs').trigger('click', { target: { closest: () => ({ dataset: { category: 'android' } }) } });
check(env.visibleCount() === data.filter(c => c.category === 'android').length, 'Category filter matches the data');
env.get('kind').value = 'official'; await env.get('kind').trigger('change');
check(env.visibleCount() === data.filter(c => c.category === 'android' && c.kind === 'official').length, 'Category and source-type filters combine');
await env.get('reset').trigger('click');

await env.click('[data-save]', { dataset: { save: data[0].id } });
check(env.get('bookmark-count').textContent === 1, 'Saving updates the bookmark count');
await env.get('bookmark-filter').trigger('click');
check(env.visibleCount() === 1 && env.get('case-list').innerHTML.includes(data[0].title), 'Bookmark filter shows saved records');
check(makeEnvironment('https://rea-case-atlas.test/', env.stored).get('bookmark-count').textContent === 1, 'Saved records survive a new session');
await env.get('reset').trigger('click');

await env.click('[data-open]', { dataset: { open: data[0].id } });
check(env.get('case-dialog').open, 'Case interaction opens the detail dialog');
check(env.get('dialog-content').innerHTML.includes(data[0].sources[0].url), 'Detail view includes the original source');
check(new URL(env.location.href).searchParams.get('case') === data[0].id, 'Opened case creates a deep link');
await env.get('copy-case').trigger('click');
check(env.copied[0] === env.location.href, 'Copy action uses the current case URL');
await env.get('next-case').trigger('click');
check(env.get('dialog-content').innerHTML.includes(data[1].title), 'Next-case navigation changes the record');
env.get('case-dialog').close();
check(!new URL(env.location.href).searchParams.has('case'), 'Closing the dialog removes the case parameter');

const direct = makeEnvironment(`https://rea-case-atlas.test/?case=${data[2].id}`);
check(direct.get('case-dialog').open && direct.get('dialog-content').innerHTML.includes(data[2].title), 'Direct case URLs open the correct record');
const invalid = makeEnvironment('https://rea-case-atlas.test/?case=unknown');
check(!invalid.get('case-dialog').open && !new URL(invalid.location.href).searchParams.has('case'), 'Unknown deep links recover to the catalogue');
const corrupt = makeEnvironment('https://rea-case-atlas.test/', new Map([['rea-case-atlas-bookmarks', 'bad json']]));
check(corrupt.get('bookmark-count').textContent === 0, 'Corrupt stored data does not break the catalogue');

await env.event('keydown', { key: '/', preventDefault() {}, ctrlKey: false, metaKey: false, altKey: false });
check(env.document.activeElement === env.get('search'), 'Keyboard search shortcut focuses search');
await env.click('[data-method]', {});
check(env.get('method-dialog').open, 'Research-method dialog opens');
env.get('method-dialog').close();
await env.get('pagination').trigger('click', { target: { closest: () => ({ dataset: { page: '2' }, disabled: false }) } });
check(env.get('case-list').innerHTML.includes(data[12].title) && !env.get('case-list').innerHTML.includes(data[0].title), 'Second page has the correct records');
check(env.get('archive').scrolled, 'Page changes return to the catalogue');

for (const match of html.matchAll(/(?:src|href)="([^"#][^"]*)"/g)) {
  const value = match[1];
  if (!/^(?:https?:|data:)/.test(value)) check(fs.existsSync(path.join(root, 'dist', value)), `Local asset exists: ${value}`);
}
const budgets = new Map();
for (const item of data) {
  const url = item.sources[0].url.split('#')[0];
  const words = [item.title, item.target, item.description, item.result, item.limitation, ...item.tags].join(' ').trim().split(/\s+/).length;
  budgets.set(url, (budgets.get(url) || 0) + words);
}
check([...budgets.values()].every(n => n <= 200), 'Source-derived visible text stays within the per-page summary budget');
console.log(JSON.stringify({ checks, result: 'passed', cases: data.length, maxSourceWords: Math.max(...budgets.values()), browserQA: 'unverified: managed preview infrastructure unavailable', descriptionMin: Math.min(...data.map(c => [...c.description].length)), descriptionMax: Math.max(...data.map(c => [...c.description].length)) }));
