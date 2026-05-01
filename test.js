const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const SCREENSHOTS = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOTS)) fs.mkdirSync(SCREENSHOTS);
const shot = name => path.join(SCREENSHOTS, name + '.png');

// Точный формат реального бека: schema_json и payload_json — объекты (не строки),
// ключи в payload_json — строковые ID вопросов, неотвеченные = null
const MOCK_TASKS = [
  {
    id: 'task-001',
    title: 'Present Perfect — упр. 3',
    created_at: new Date().toISOString(),
    schema_json: {
      name: 'Present Perfect — упр. 3',
      type: 'fill_gaps',
      instruction: '',
      style: 'default',
      questions: [
        { id: 1, text: 'She ___ (visit) Paris.', answer: 'has visited', options: [], words: [] },
        { id: 2, text: 'They ___ (not finish) yet.', answer: "haven't finished|have not finished", options: [], words: [] },
      ]
    },
    answers: [
      {
        user_name: 'Анна Иванова',
        submitted_at: new Date().toISOString(),
        payload_json: { '1': { '0': 'has visited' }, '2': { '0': "haven't finished" } }
      },
      {
        user_name: 'Петр Сидоров',
        submitted_at: new Date().toISOString(),
        payload_json: { '1': { '0': 'visited' }, '2': null }
      }
    ]
  },
  {
    id: 'task-002',
    title: 'Zodiac Signs',
    created_at: new Date().toISOString(),
    schema_json: {
      name: 'Zodiac Signs',
      type: 'multiple_choice',
      instruction: '',
      style: 'default',
      questions: [
        { id: 1, text: 'Earth sign?', answer: 'Телец', options: ['Телец', 'Овен', 'Рак', 'Лев'], words: [] },
        { id: 2, text: 'Fire sign?', answer: 'Овен', options: ['Телец', 'Овен', 'Рак', 'Лев'], words: [] },
      ]
    },
    answers: [
      {
        user_name: 'Студент 13',
        submitted_at: new Date().toISOString(),
        payload_json: { '1': ['Телец'], '2': ['Овен'] }
      }
    ]
  }
];

async function run() {
  const server = http.createServer((req, res) => {
    const file = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    try {
      const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png' };
      res.setHeader('Content-Type', types[file.split('.').pop()] || 'application/octet-stream');
      res.end(fs.readFileSync(file));
    } catch { res.writeHead(404); res.end(); }
  }).listen(9995);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));

  await page.route('https://jumped.aiaistudio.org/**', route => {
    const url = route.request().url();
    if (url.includes('/dashboard/tasks')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_TASKS) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  let passed = 0, failed = 0;
  const pass = (label, ok) => {
    console.log((ok ? '✓' : '✗') + ' ' + label);
    ok ? passed++ : failed++;
  };

  // ── Login ─────────────────────────────────────────────────────────────────────
  await page.goto('http://localhost:9995/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.page.active');
  pass('логин-страница активна', await page.locator('#page-login.active').count() > 0);
  await page.screenshot({ path: shot('login'), fullPage: true });

  // ── Teacher ───────────────────────────────────────────────────────────────────
  await page.fill('#api-key-login', 'test-key');
  await page.click('button:has-text("Войти")');
  await page.waitForSelector('#page-teacher.active');
  pass('вход → кабинет учителя', true);
  pass('вкладки Создать / Результаты', await page.locator('.tab').count() === 2);
  pass('зона загрузки видна', await page.locator('#uzone').isVisible());
  await page.screenshot({ path: shot('teacher'), fullPage: true });

  // ── Editor ────────────────────────────────────────────────────────────────────
  await page.click('button:has-text("Создать задание вручную")');
  await page.waitForSelector('#s-edit:not(.hidden)');
  pass('редактор открылся', true);
  pass('style picker (5 тем)', await page.locator('.style-opt').count() === 5);
  pass('поле инструкции', await page.locator('#tinstr').isVisible());
  pass('кнопка Опубликовать', await page.locator('#publish-btn').isVisible());
  pass('кнопка Предпросмотр', await page.locator('button:has-text("Предпросмотр")').isVisible());
  await page.screenshot({ path: shot('editor'), fullPage: true });

  // ── Preview modal ─────────────────────────────────────────────────────────────
  await page.evaluate(() => showPreview());
  await page.waitForFunction(() => !document.getElementById('prev-modal').classList.contains('hidden'));
  pass('модал предпросмотра открылся', true);
  await page.screenshot({ path: shot('preview') });
  await page.evaluate(() => closePreview());
  pass('модал предпросмотра закрылся', await page.locator('#prev-modal.hidden').count() > 0);

  // ── Results tab — с реальными моковыми данными ────────────────────────────────
  await page.click('#tab-btn-results');
  await page.waitForSelector('#tab-results:not(.hidden)');
  pass('вкладка Результаты открылась', true);

  // Задание должно появиться в списке и в селекте
  await page.waitForFunction(() => document.querySelector('#tlist .trow') !== null);
  pass('задания в списке заданий', await page.locator('#tlist .trow').count() === MOCK_TASKS.length);
  pass('задание в выпадающем списке', await page.locator('#rsel option').count() > 1);

  // Выбираем задание → грузим результаты
  await page.selectOption('#rsel', 'task-001');
  await page.waitForSelector('#rbody:not(.hidden)');
  pass('блок результатов появился', true);

  // Статистика
  const stTotal = await page.locator('#st-t').textContent();
  const stAvg   = await page.locator('#st-a').textContent();
  pass('кол-во учеников = 2', stTotal.trim() === '2');
  pass('средний балл отображается', stAvg.trim() !== '—');

  // Таблица с учениками
  pass('строки учеников в таблице', await page.locator('.rrow-main').count() === 2);

  // Раскрываем детали первого ученика
  await page.locator('.dtoggle').first().click();
  await page.waitForSelector('.rrow-detail.open');
  pass('детали ответа раскрываются', true);

  await page.screenshot({ path: shot('results'), fullPage: true });

  // ── JS errors ─────────────────────────────────────────────────────────────────
  pass('нет JS-ошибок', jsErrors.length === 0);
  if (jsErrors.length) jsErrors.forEach(e => console.log('  JS:', e));

  // ── Summary ───────────────────────────────────────────────────────────────────
  console.log(`\n${passed + failed} тестов: ${passed} ✓  ${failed} ✗`);
  console.log('Скриншоты: screenshots/{login,teacher,editor,preview,results}.png');

  await browser.close();
  server.close();
  if (failed > 0) process.exit(1);
}

run().catch(e => { console.error('CRASH:', e.message); process.exit(1); });
