const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { rendererScript } = require('../lib/renderer');
const { CSS_INJECT_FULL, CSS_INJECT_FONT_ONLY } = require('../lib/css');

const driver = process.env.RTL_BROWSER_DRIVER;
test('real Chromium: self-only font CSP, mixed prose, streaming, selection, fonts and scoped isolation', { skip: !driver && 'Set RTL_BROWSER_DRIVER and RTL_BROWSER_EXECUTABLE to run real-browser tests' }, async t => {
    const { puppeteer } = await import(pathToFileURL(driver).href);
    const server = http.createServer((request, response) => {
        response.setHeader('Content-Security-Policy', "font-src 'self'");
        response.end('<!doctype html><html><body><main></main></body></html>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await puppeteer.launch({ executablePath: process.env.RTL_BROWSER_EXECUTABLE, headless: true });
    t.after(async () => { await browser.close(); await new Promise(resolve => server.close(resolve)); });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.setContent(`<main>
        <p id="outside">سلام بیرون از پیام</p><span id="icon" style="font-family:monospace">X</span>
        <div class="font-user-message"><div id="bubble">API برای آزمایش متن فارسی است</div></div>
        <div class="standard-markdown" style="font-family:Arial">
          <h2 id="heading" style="font-family:serif">عنوان فارسی</h2><p id="mixed">API برای آزمایش متن فارسی است <code>/tmp/demo.js</code> و <a href="https://example.test/a">https://example.test/a</a></p>
          <p id="english">English text with سلام</p>
          <ol><li id="item">فهرست فارسی<ul><li>زیرمجموعه فارسی</li></ul></li></ol>
          <blockquote id="quote">نقل قول فارسی</blockquote>
          <table><tr><th id="headcell">نام فارسی</th><td id="cell">خانه فارسی</td></tr></table>
          <pre><code id="code">const x = "سلام";</code></pre><span class="katex" id="math">x = y + 2</span>
          <p id="stream">API</p>
        </div>
        <div contenteditable="true" class="ProseMirror" role="textbox"><p dir="auto" id="composer">API برای آزمایش متن فارسی است</p></div>
        </main>`);
    const original = await page.$eval('main', node => node.textContent);
    await page.addStyleTag({ content: CSS_INJECT_FULL });
    await page.addScriptTag({ content: rendererScript('full') });
    await page.waitForFunction(() => document.querySelector('#mixed').dataset.rtlDir === 'rtl');
    const styles = await page.evaluate(() => {
        const result = {};
        for (const id of ['mixed', 'heading', 'english', 'item', 'quote', 'headcell', 'cell', 'code', 'math', 'outside', 'composer', 'icon']) {
            const element = document.getElementById(id), css = getComputedStyle(element);
            result[id] = { direction: css.direction, bidi: css.unicodeBidi, font: css.fontFamily };
        }
        return result;
    });
    for (const id of ['mixed', 'heading', 'item', 'quote', 'headcell', 'cell', 'composer']) assert.equal(styles[id].direction, 'rtl', id);
    assert.equal(await page.$eval('#composer', node => node.hasAttribute('data-rtl-text') || node.hasAttribute('data-rtl-dir') || node.hasAttribute('style')), false, 'Do not mutate editor-owned paragraphs');
    for (const id of ['english', 'code', 'math', 'outside']) assert.equal(styles[id].direction, 'ltr', id);
    assert.equal(styles.code.bidi, 'isolate');
    assert.match(styles.code.font, /monospace/);
    assert.equal(styles.icon.font, 'monospace');
    assert.equal(await page.$eval('#mixed a', node => getComputedStyle(node).unicodeBidi), 'isolate');
    assert.equal(await page.$eval('main', node => node.textContent), original);
    await page.evaluate(() => {
        const range = document.createRange(); range.selectNodeContents(document.querySelector('#mixed'));
        getSelection().removeAllRanges(); getSelection().addRange(range);
    });
    const selection = await page.evaluate(() => getSelection().toString());
    await page.addScriptTag({ content: rendererScript('full') });
    await page.evaluate(() => { document.querySelector('#stream').firstChild.data += ' برای بررسی متن فارسی و پاسخ تدریجی است'; });
    await page.waitForFunction(() => document.querySelector('#stream').dataset.rtlDir === 'rtl');
    assert.equal(await page.evaluate(() => getSelection().toString()), selection);
    await page.evaluate(() => { const node = document.querySelector('#composer'); node.textContent = 'English only'; node.dispatchEvent(new InputEvent('input', { bubbles: true })); });
    await page.waitForFunction(() => document.querySelector('#composer').parentElement.dataset.rtlDir === 'ltr');
    await page.evaluate(() => document.fonts.ready);
    const cdp = await page.createCDPSession();
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument');
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#heading' });
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    assert.ok(fonts.some(font => /Vazirmatn/i.test(font.familyName) && font.glyphCount > 0), JSON.stringify(fonts));
    await t.test('composer lists contribute prose without editor-owned attribute writes', async () => {
        await page.evaluate(() => {
            const root = document.createElement('div');
            root.id = 'list-composer'; root.className = 'ProseMirror'; root.contentEditable = 'true';
            root.innerHTML = '<ul><li>فهرست فارسی برای آزمایش</li></ul>';
            document.body.append(root);
        });
        await page.waitForFunction(() => document.querySelector('#list-composer').dataset.rtlDir, { timeout: 2000 });
        assert.equal(await page.$eval('#list-composer', node => node.dataset.rtlDir), 'rtl');
        assert.equal(await page.$eval('#list-composer li', node => node.hasAttribute('data-rtl-dir') || node.hasAttribute('data-rtl-text')), false);
    });
    await t.test('removed roots are released even without subsequent prose mutations', async () => {
        await page.evaluate(() => {
            globalThis.detachedFixture = document.createElement('div');
            detachedFixture.className = 'standard-markdown'; detachedFixture.textContent = 'سلام';
            document.body.append(detachedFixture);
        });
        await page.waitForFunction(() => __claudeRtlPatch.roots.has(detachedFixture));
        await page.evaluate(() => detachedFixture.remove());
        await page.waitForFunction(() => !__claudeRtlPatch.roots.has(detachedFixture), { timeout: 2000 });
    });
    await t.test('font-only truly preserves native bidi even on streamed text', async () => {
        const second = await browser.newPage();
        await second.goto(`http://127.0.0.1:${server.address().port}`);
        await second.setContent('<main><div class="standard-markdown"><p id="native" dir="rtl">API برای آزمایش</p></div></main>');
        await second.addStyleTag({ content: CSS_INJECT_FONT_ONLY });
        await second.addScriptTag({ content: rendererScript('font-only') });
        await second.$eval('#native', node => node.firstChild.data += ' است');
        assert.deepEqual(await second.$eval('#native', node => [node.dir, node.hasAttribute('data-rtl-dir'), getComputedStyle(node).direction]), ['rtl', false, 'rtl']);
        await second.close();
    });
});
