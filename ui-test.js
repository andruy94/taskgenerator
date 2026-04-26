const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const TASK_ID = 'ec911d53-08f4-47bc-9635-de36de5759c9';

async function run() {
  // Поднимаем статический сервер чтобы открыть index.html
  const server = http.createServer((req, res) => {
    const file = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    try { res.end(fs.readFileSync(file)); } catch { res.writeHead(404); res.end(); }
  }).listen(9999);

  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Открываем страницу ученика с реальным task ID
  await page.goto(`http://localhost:9999/#task/${TASK_ID}`);

  // Ждём пока задание загрузится (появится карточка с вопросом)
  await page.waitForSelector('.qstud', { timeout: 10000 });

  const pass = (label, ok) => console.log((ok ? 'PASS' : 'FAIL') + ': ' + label);

  // 1. Заголовок задания виден
  const title = await page.textContent('#ttitle');
  pass('заголовок задания виден: ' + title, title.length > 0);

  // 2. Есть вопросы на экране
  const qCount = await page.locator('.qstud').count();
  pass('все 10 вопросов отрисованы', qCount === 10);

  // 3. gapinp рендерится как inline (не block/100%-wide)
  const gapStyle = await page.locator('.gapinp').first().evaluate(el => {
    const s = getComputedStyle(el);
    return { display: s.display, width: s.width, border: s.border };
  });
  pass('gapinp display=inline-block', gapStyle.display === 'inline-block');
  const widthPx = parseInt(gapStyle.width);
  pass('gapinp width < 300px (не растянут на всю строку), реальный: ' + gapStyle.width, widthPx < 300);

  // 4. gapinp нет full border (только border-bottom)
  const gapBorderTop = await page.locator('.gapinp').first().evaluate(el => {
    return getComputedStyle(el).borderTopWidth;
  });
  pass('gapinp нет border сверху (0px)', gapBorderTop === '0px');

  // 5. Кнопка "Завершить и проверить" видна
  const btnVisible = await page.locator('#crow button').isVisible();
  pass('кнопка проверки видна', btnVisible);

  // 6. Скриншот — смотрим глазами
  await page.screenshot({ path: 'ui-screenshot.png', fullPage: true });
  console.log('\nСкриншот сохранён: ui-screenshot.png');

  await browser.close();
  server.close();
}

run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
