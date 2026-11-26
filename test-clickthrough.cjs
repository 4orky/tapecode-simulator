#!/usr/bin/env node
/* 《链上造芯厂》P0 jsdom 点通测试：小镇 → 序章 → 第一章（画 9 门全加器、验货）
 * → 流片 → 挖矿 → 卡片馆 → 模拟器（本地样本）→ 图鉴。
 * 用法：先在 app/ 起 python3 -m http.server 8123，再 node test-clickthrough.cjs
 * 退出码 0 = 全部通过。
 */
const { JSDOM } = require('jsdom');
const T = require('/home/hatch/workspace/tapeout-hackathon/app/app.js');
const fs = require('fs');

let pass = 0, fail = 0;
const lines = [];
function check(name, ok, detail) {
  if (ok) { pass++; lines.push('PASS  ' + name + (detail ? ' — ' + detail : '')); }
  else { fail++; lines.push('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const dom = await JSDOM.fromURL('http://127.0.0.1:8123/index.html', {
    resources: 'usable',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      // jsdom 没有 fetch：把页面内 fetch 桥到 Node 的 fetch（相对路径按页面 URL 解析）
      window.fetch = (u, o) => globalThis.fetch(new URL(u, window.location.href).href, o);
      // 计数 samples/directory.json 的拉取次数（第 36 轮：卡片馆目录会话内只拉一次）
      window.__dirFetches = 0;
      const rawFetch = window.fetch;
      window.fetch = (u, o) => {
        if (String(u).includes('samples/directory.json')) window.__dirFetches++;
        return rawFetch(u, o);
      };
    }
  });
  const { window } = dom;
  const { document } = window;
  // 全程错误陷阱（第 26 轮）：流程里任何未捕获的 JS 异常都记下来，最后断言为 0
  const windowErrors = [];
  window.addEventListener('error', e => windowErrors.push(e.message || String(e.error || e)));
  await new Promise(res => { if (window.document.readyState === 'complete') res(); else window.addEventListener('load', res); });
  await sleep(500);

  const q = s => document.querySelector(s);
  const qa = s => Array.from(document.querySelectorAll(s));
  const nav = name => q(`[data-nav="${name}"]`).click();
  const mousedown = el => el.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0 }));
  const click = el => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const save = () => JSON.parse(window.localStorage.getItem('tapecode-factory-v1'));

  // ---------- 首次访问欢迎弹窗（第 16 轮） ----------
  check('欢迎弹窗：首次打开出现', !!q('#modal-root .modal') && /欢迎来到《链上造芯厂》/.test(q('#modal-root').textContent));
  check('欢迎弹窗：写明不连钱包、不花真钱', /不连钱包、不花真钱/.test(q('#modal-root').textContent));
  // 欢迎弹窗里的 NAND 小演示（第 65 轮，FabX 首屏做法）：一句话价值主张 + 可拨的 NAND 门
  check('欢迎弹窗：一句话价值主张在首屏', /20 分钟玩明白 TapeOut：画电路 → 流片 → 挖矿 → 点亮 CPU/.test(q('#modal-root').textContent));
  check('欢迎弹窗：NAND 小演示在位，初始 A=0 B=0 输出 1', !!q('#w-nand-a') && q('#w-nand-out').textContent === '1');
  click(q('#w-nand-a')); // A=1，B=0 → NAND=1
  await sleep(100);
  check('欢迎弹窗：NAND 演示拨 A=1，输出仍 1', q('#w-nand-out').textContent === '1');
  click(q('#w-nand-b')); // A=1，B=1 → NAND=0
  await sleep(100);
  check('欢迎弹窗：NAND 演示 A=B=1，输出翻成 0', q('#w-nand-out').textContent === '0');
  click(q('#w-nand-a')); // A=0，B=1 → NAND=1
  await sleep(100);
  check('欢迎弹窗：NAND 演示拨回 A=0，输出回 1', q('#w-nand-out').textContent === '1');
  click(q('#btn-welcome-start'));
  await sleep(200);
  check('欢迎弹窗：点开始造芯后关闭并进设计台', q('#modal-root').style.display === 'none' && q('#view-prologue').style.display !== 'none');
  // 图鉴锁定卡人话（第 24 轮）：新开页面时多数图鉴条目是锁定的，检查锁定文案
  nav('codex');
  await sleep(200);
  check('图鉴：锁定卡片显示人话解锁条件', /解锁条件：去任务板通过一道题/.test(q('#codex-grid').textContent));
  check('图鉴：锁定卡片不显示内部 key', !/🔒 ch1/.test(q('#codex-grid').textContent));
  nav('town');
  await sleep(200);

  // ---------- 小镇 ----------
  check('小镇：9 栋建筑', qa('.building').length === 9);
  // 小镇分组 + 折叠区（第 56 轮）：3 个分组、折叠默认合上、当前章节高亮、其余弱化
  check('小镇：3 个分组标题', qa('.town-group').length === 3);
  check('小镇：分组名正确', qa('.town-group').map(el => el.textContent).join('|') === '造芯主线|生态 · 花 BEM 与开厂|图鉴 · 查资料');
  check('小镇：折叠区默认合上', !q('#fold-journey').open && !q('#fold-milestones').open && !q('#fold-save').open);
  check('小镇：当前章节建筑高亮（任务板）', q('.building.now') && q('.building.now').getAttribute('data-b') === 'ch1');
  check('小镇：其余已解锁建筑弱化', qa('.building.dim').length === 3);
  check('小镇：里程碑折叠标题带计数', /里程碑 \d+ \/ 10/.test(q('#fold-milestones summary').textContent));
  q('#fold-journey').open = true;
  q('#fold-journey').dispatchEvent(new window.Event('toggle'));
  q('#fold-milestones').open = true;
  q('#fold-milestones').dispatchEvent(new window.Event('toggle'));
  await sleep(50);
  check('小镇：手风琴一次只开一个', q('#fold-milestones').open && !q('#fold-journey').open);
  // 音效开关（第 53 轮）：默认开，点一下静音，再点恢复
  check('音效：开关在 HUD 里，默认开', !!q('#btn-sound') && q('#btn-sound').textContent === '🔊');
  click(q('#btn-sound'));
  await sleep(100);
  check('音效：点一下静音', q('#btn-sound').textContent === '🔇' && save().sound === false);
  click(q('#btn-sound'));
  await sleep(100);
  check('音效：再点恢复', q('#btn-sound').textContent === '🔊' && save().sound === true);
  check('无 JS 提示：noscript 在位', !!q('noscript') && /需要 JavaScript/.test(q('noscript').textContent));
  check('HUD：星星满分是 18（6 道题 × 3 星）', q('#res-stars-max').textContent === '18');
  check('小镇：旅程 7 步', qa('.j-step').length === 7);
  // 旅程色点（第 43 轮）：7 个色点，分类顺序与建筑配色一致
  check('小镇：旅程 7 步各有分类色点',
    qa('.j-dot').length === 7 &&
    qa('.j-dot').map(el => el.getAttribute('data-cat')).join(',') === 'trade,design,design,mine,trade,cpu,trade');
  check('小镇：下一步引导指向任务板（欢迎弹窗已带用户逛过设计台）', /任务板/.test(q('#next-step').textContent));
  check('小镇：首屏导语第一句就是价值主张', /20 分钟玩明白 TapeOut/.test(q('#view-town p').textContent));
  // 黄金路径常驻指示（第 65 轮）：五步常驻，当前步高亮、走过的打勾，点一步直达
  check('黄金路径：5 步常驻（设计台→流片厂→矿场→集市→点亮 CPU）',
    qa('.gp-step').length === 5 &&
    qa('.gp-step').map(el => el.textContent).join('|') === '设计台|流片厂|矿场|集市|CPU 神殿');
  check('黄金路径：开局当前步是设计台', q('.gp-step.now') && q('.gp-step.now').textContent === '设计台');
  click(q('[data-gp="market"]'));
  await sleep(200);
  check('黄金路径：点集市一步直达集市视图', q('#view-market').style.display !== 'none');
  nav('town');
  await sleep(200);
  check('小镇：里程碑 10 个', qa('.ms-chip').length === 10);
  check('小镇：天际线已画', !!q('.town-skyline svg'));
  check('小镇：建筑有分类配色（矿场 data-cat=mine）', !!q('.building[data-cat="mine"]'));
  // 建筑 SVG 图标（第 15 轮）：9 栋建筑各一个专属描边 SVG
  check('小镇：9 栋建筑都有 SVG 图标', qa('.b-icon svg').length === 9);
  check('小镇：图标各不相同', new Set(qa('.b-icon svg').map(el => el.innerHTML)).size === 9);
  // 存档导出/导入（第 12 轮）
  check('存档：小镇有存档面板', !!q('#btn-save-export') && !!q('#btn-save-import'));
  click(q('#btn-save-import'));
  await sleep(100);
  check('存档：点导入先展开输入框', q('#ta-save-import').style.display !== 'none');
  q('#ta-save-import').value = 'not json';
  click(q('#btn-save-import'));
  await sleep(100);
  check('存档：乱码导入显示失败', /导入失败/.test(q('#save-msg').textContent));
  // 注意：小镇阶段可能还没触发过 save，localStorage 未必有存档；用导出的当前存档做有效输入
  q('#ta-save-import').value = window.TapeFactory.exportSaveText();
  click(q('#btn-save-import'));
  await sleep(100);
  check('存档：当前存档导入成功', /导入成功/.test(q('#save-msg').textContent));
  check('小镇：HUD 初始 200 NAND / 0 游戏 BEM',
    q('#res-nand').textContent === '200' && q('#res-bem').textContent === '0.00');

  // ---------- 多语言（第 58 轮） ----------
  check('语言：切换器在位，默认中文', !!q('#lang-select') && q('#lang-select').value === 'zh');
  q('#lang-select').value = 'en';
  q('#lang-select').dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(200);
  check('语言：切英文后导航变英文', q('button[data-nav="town"]').textContent === '🏘 Town Map');
  check('语言：切英文后小镇标题变英文', q('#view-town h2').textContent === 'Eco Town');
  check('语言：切英文后下一步变英文', /Next: /.test(q('#next-step').textContent) && /Task Board/.test(q('#next-step').textContent));
  check('语言：切英文后 HUD 目标变英文', /Next: /.test(q('#hud-goal').textContent));
  check('语言：切英文后黄金路径变英文',
    qa('.gp-step').map(el => el.textContent).join('|') === 'Workbench|Tape-Out Fab|Mine|Market|CPU Shrine');
  check('语言：切英文后建筑名变英文', q('.building.now .b-name').textContent === 'Task Board ✓' || q('.building.now .b-name').textContent === 'Task Board');
  check('语言：选择存 localStorage', window.localStorage.getItem('tapecode-lang') === 'en');
  check('语言：html lang 属性跟上', q('html').getAttribute('lang') === 'en');
  q('#lang-select').value = 'zh';
  q('#lang-select').dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(200);
  check('语言：切回中文', q('button[data-nav="town"]').textContent === '🏘 小镇地图' && window.localStorage.getItem('tapecode-lang') === 'zh');
  // 日/韩/西（第 59–61 轮）：切换器五门语言齐了，切过去导航真变
  check('语言：切换器有五门语言', q('#lang-select').options.length === 5);
  q('#lang-select').value = 'ja';
  q('#lang-select').dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(200);
  check('语言：切日文后导航变日文', q('button[data-nav="town"]').textContent === '🏘 町の地図');
  check('语言：切日文后下一步变日文', /タスクボード/.test(q('#next-step').textContent));
  q('#lang-select').value = 'ko';
  q('#lang-select').dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(200);
  check('语言：切韩文后导航变韩文', q('button[data-nav="town"]').textContent === '🏘 마을 지도');
  q('#lang-select').value = 'es';
  q('#lang-select').dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(200);
  check('语言：切西文后导航变西文', q('button[data-nav="town"]').textContent === '🏘 Mapa del pueblo');
  q('#lang-select').value = 'zh';
  q('#lang-select').dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(200);
  check('语言：切回中文收尾', q('button[data-nav="town"]').textContent === '🏘 小镇地图');

  // ---------- 序章 ----------
  nav('prologue');
  await sleep(200);
  check('序章：4 个实验', qa('.exp').length === 4);
  check('序章：NOT 实验有原理图', !!q('#exp-board-not svg'));
  const notLed = () => q('#exp-ctrl-not .hled .hled-label').textContent;
  check('序章 NOT：初始 in0=0 → out=1', /1/.test(notLed()));
  click(q('#exp-ctrl-not .hsw')); // 拨到 1
  await sleep(100);
  check('序章 NOT：拨到 1 → out=0', /= 0/.test(notLed()));
  // LATCH：拨 d=1 但不运行，q 不变；运行一拍，q 才跟上
  click(q('#exp-ctrl-latch .hsw')); // d=1
  await sleep(100);
  check('序章 LATCH：只拨 d=1、不运行，q 仍 0（记忆不跟输入走）', /q = 0/.test(q('#exp-ctrl-latch').textContent));
  click(q('#exp-ctrl-latch [data-beat]')); // 拍 1：q=1
  await sleep(100);
  check('序章 LATCH：运行一拍后 q=1', /q = 1/.test(q('#exp-ctrl-latch').textContent));
  click(q('#exp-ctrl-latch .hsw')); // d 拨回 0，不运行
  await sleep(100);
  check('序章 LATCH：d 拨回 0、不运行，q 还保持 1', /q = 1/.test(q('#exp-ctrl-latch').textContent));
  qa('.btn-done').forEach(b => click(b));
  await sleep(100);
  check('序章：4 个实验都标记明白', save().prologueDone && Object.keys(save().prologueDone).length === 4);

  // ---------- 第一章：画 9 门全加器（全程点 UI） ----------
  nav('ch1');
  await sleep(200);
  check('第一章：6 道题标签', qa('.ptab').length === 6);
  // 总账（第 25 轮）：新开页面 0 道通过，总账显示 0/6 与标准解 295
  check('第一章：总账显示已通 0/6、标准解总门数 295', /已通 0\/6 道/.test(q('#ch1-meta').textContent) && /标准解总门数 295/.test(q('#ch1-meta').textContent));
  for (let i = 0; i < 9; i++) click(q('#btn-add-gate'));
  await sleep(100);
  check('第一章：点了 9 次加门，画布 9 门，晶体管 191',
    qa('[data-gate]').length === 9 && q('#res-nand').textContent === '191');
  // 画布直拨（第 64 轮）：点输入框本体拨 0/1，不用下方开关条；点小绿点才选为连线源
  mousedown(q('[data-src="i:0"] .sw-track'));
  await sleep(50);
  check('第一章：点画布上 a 输入框拨到 1', /a = 1/.test(q('#sim-strip').textContent), q('#sim-strip').textContent);
  mousedown(q('[data-src="i:0"] .rail-box'));
  await sleep(50);
  check('第一章：再点一次拨回 0', /a = 0/.test(q('#sim-strip').textContent), q('#sim-strip').textContent);
  // 按样本网表结构连线（信号映射与 test-factory.cjs 一致）
  const sample = T.parseTapnet(new Uint8Array(fs.readFileSync('/home/hatch/workspace/tapeout-hackathon/app/samples/full-adder-9nand.tapnet')));
  const gateIds = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  function srcSel(s) {
    if (s === 0) return '[data-src="c:0"]';
    if (s === 1) return '[data-src="c:1"]';
    if (s === 2) return '[data-src="i:0"] .src-dot';
    if (s === 3) return '[data-src="i:1"] .src-dot';
    if (s === 4) return '[data-src="i:2"] .src-dot';
    return `[data-gate="${gateIds[s - 5]}"] .pin-out`;
  }
  let wired = 0, wireErr = '';
  for (let gi = 0; gi < 9; gi++) {
    for (let pin = 0; pin < 2; pin++) {
      const s = sample.gates[gi].w[pin];
      const src = q(srcSel(s));
      if (!src) { wireErr = '找不到源 ' + s; continue; }
      mousedown(src);
      const dst = q(`[data-gate="${gateIds[gi]}"] .pin-in[data-pin="${pin}"]`);
      if (!dst) { wireErr = '找不到目标门 ' + gateIds[gi] + ' 脚 ' + pin; continue; }
      mousedown(dst);
      wired++;
    }
  }
  await sleep(100);
  check('第一章：18 条输入线全连上', wired === 18 && !wireErr, wireErr);
  // 输出：样本最后两个门信号 = O0/O1；实测 O0=和 → 和门接 out0
  mousedown(q(`[data-gate="8"] .pin-out`));
  mousedown(q('[data-out="0"]'));
  mousedown(q(`[data-gate="9"] .pin-out`));
  mousedown(q('[data-out="1"]'));
  await sleep(100);
  check('第一章：两条输出线接上', qa('.wire').length >= 20, qa('.wire').length + ' 条线');
  click(q('#btn-verify'));
  await sleep(200);
  check('第一章：验货真值表 8/8 全过', /真值表全过：8\/8/.test(q('#tt-panel').textContent), q('#status-line').textContent);
  check('第一章：通过记录 9 门 3 星', save().passed && save().passed.fa && save().passed.fa.gates === 9 && save().passed.fa.stars === 3);
  check('第一章：画布草稿已存档', save().drafts && save().drafts.fa && save().drafts.fa.gates.length === 9);
  // 切题签换草稿（第 66 轮回归）：切 adder4 之前画布还是 fa 的草稿，题签一换就该换
  //（旧 currentDraft 只在 B.draft 为空时创建，切签后输入轨仍是 3 个，除 fa 外 5 道题没法画）。
  click(q('.ptab[data-p="adder4"]'));
  await sleep(200);
  check('第一章：切到 4 位加法器，9 个输入轨出现', qa('[data-src^="i:"]').length === 9, qa('[data-src]').length + ' 个源');
  check('第一章：切到 4 位加法器，教学文案也换了', /4 位加法器/.test(q('#ch1-teach').textContent));
  click(q('.ptab[data-p="fa"]'));
  await sleep(200);
  check('第一章：切回全加器，fa 草稿还在（9 门、3 输入）',
    qa('[data-gate]').length === 9 && qa('[data-src^="i:"]').length === 3);
  // 触屏拖拽（第 31 轮）：合成 Touch 事件拖 1 号门 +50/+20，存档里的门坐标跟着变
  const touchGate = q('[data-gate="1"]');
  const gx0 = save().drafts.fa.gates.find(g => g.id === 1).x;
  const gy0 = save().drafts.fa.gates.find(g => g.id === 1).y;
  function touch(type, x, y) {
    const ev = new window.Event(type, { bubbles: true, cancelable: true });
    ev.touches = [{ clientX: x, clientY: y }];
    touchGate.dispatchEvent(ev);
  }
  touch('touchstart', 100, 100);
  touch('touchmove', 150, 120);
  touch('touchend', 150, 120);
  await sleep(100);
  const gx1 = save().drafts.fa.gates.find(g => g.id === 1).x;
  const gy1 = save().drafts.fa.gates.find(g => g.id === 1).y;
  check('第一章：触屏拖门，x +50 且 y 下移、已存档',
    gx1 === Math.min(940, gx0 + 50) && gy1 > gy0,
    '由 (' + gx0 + ',' + gy0 + ') → (' + gx1 + ',' + gy1 + ')');
  // 画布触摸规则（第 32 轮）：画布可平移、门禁滚动
  const cssText = await (await fetch('http://127.0.0.1:8123/style.css')).text();
  check('第一章：画布 touch-action 是 pan-x pan-y、门是 none',
    /svg\.bschem \{ touch-action: pan-x pan-y/.test(cssText) && /svg\.bschem \[data-gate\] \{ touch-action: none/.test(cssText));

  // ---------- 流片 ----------
  click(q('#btn-to-tapeout'));
  await sleep(200);
  check('流片：视图切换到流片厂', q('#view-tapeout').style.display !== 'none');
  click(q('[data-tape="fa"]'));
  await sleep(4500); // 仪式 900+900+900ms + 余量
  const savedAfterTape = save();
  check('流片：卡已生成（1 张，9 门，SHA 66 位）',
    savedAfterTape.taped.length === 1 && savedAfterTape.taped[0].gates === 9 &&
    /^0x[0-9a-f]{64}$/.test(savedAfterTape.taped[0].sha));
  check('流片：草稿已烧掉（不退回晶体管）',
    !savedAfterTape.drafts.fa && savedAfterTape.nand === 191);
  check('流片：卡详情弹窗出现', !!q('.modal') && /电路 NFT 卡/.test(q('.modal').textContent));
  click(q('#m-close'));
  await sleep(100);
  check('流片：收藏里有 1 张卡', qa('.nft-card').length === 1);
  nav('town'); await sleep(200);
  check('黄金路径：流片后流片厂一步打勾、当前步变矿场',
    /✓ 流片厂/.test(q('#gold-path').textContent) && q('.gp-step.now').textContent === '矿场');

  // ---------- 挖矿 ----------
  nav('mining');
  await sleep(200);
  click(q('[data-reg]'));
  await sleep(100);
  check('挖矿：矿机已注册（TapeOut ×1，9 门卡 Behemoth 不可选）',
    save().miners.length === 1 && save().miners[0].processor === 'tapeout');
  click(q('#btn-settle'));
  await sleep(100);
  const afterSettle = save();
  const expected = 9 / 100500 * 7200;
  check('挖矿：结算一天，第 1 天、收入 = 9/100500×7200',
    afterSettle.day === 1 && Math.abs(afterSettle.bem - expected) < 1e-9,
    '收入 ' + afterSettle.bem.toFixed(4) + '，期望 ' + expected.toFixed(4));
  check('挖矿：结算结果文案含游戏 BEM', /游戏 BEM/.test(q('#settle-result').textContent));
  check('黄金路径：结算后矿场一步打勾、当前步变集市',
    /✓ 矿场/.test(q('#gold-path').textContent) && q('.gp-step.now').textContent === '集市');
  // 结算账本（第 13 轮）：结算 1 天后账本有 1 行“第 1 天”
  check('账本：结算后账本有 1 行', qa('.ledger tr').length === 2 && /第 1 天/.test(q('.ledger').textContent));
  check('账本：账本余额 = 当前 BEM', q('.ledger').textContent.includes(afterSettle.bem.toFixed(2)));

  // ---------- 集市（第四章） ----------
  nav('market');
  await sleep(200);
  check('集市：4 个摊位都在',
    !!q('#stall-parts') && !!q('#stall-deweb') && !!q('#stall-relay') && !!q('#stall-lottery'));
  check('集市：BEM 不够时买按钮禁用（0.64 BEM 买不起 1 BEM 的货）',
    q('[data-buy="nand10"]').disabled === true);
  click(q('#btn-lottery'));
  await sleep(100);
  check('抽奖亭：参加后已记录（第 1 天，已参加）',
    save().lottery.day === 1 && save().lottery.entered === true);
  // 抽奖后重进集市：中奖者区块正常渲染（哈希字段齐全，不崩）
  nav('town'); await sleep(100);
  nav('market'); await sleep(200);
  check('抽奖亭：参加后重进，中奖者区块在位', /中奖者/.test(q('#stall-lottery').textContent));
  // 攒够钱再走购买流程（第 20 轮补覆盖）：买零件 → 开网站 → 加购存储 → 加密消息
  for (let i = 0; i < 10 && save().bem < 3.5; i++) {
    nav('mining'); await sleep(50);
    click(q('#btn-settle')); await sleep(50);
  }
  check('集市：多结算攒够购买钱（≥3.5 游戏 BEM）', save().bem >= 3.5, '当前 ' + save().bem.toFixed(2));
  nav('market'); await sleep(200);
  const nandBefore = save().nand, bemBefore = save().bem;
  click(q('[data-buy="nand10"]'));
  await sleep(100);
  check('零件铺：买 10 NAND，晶体管 +10、BEM -1',
    save().nand === nandBefore + 10 && Math.abs(save().bem - (bemBefore - 1)) < 1e-9,
    'NAND ' + save().nand + '，BEM ' + save().bem.toFixed(2));
  q('#site-name').value = '阿杰的芯片铺';
  click(q('#btn-open-site'));
  await sleep(100);
  check('DeWEB 小镇：开店成功，地址 tape://…',
    save().sites.length === 1 && /^tape:\/\//.test(save().sites[0].addr), save().sites[0] && save().sites[0].addr);
  check('黄金路径：开网站后集市一步打勾、当前步变 CPU 神殿',
    /✓ 集市/.test(q('#gold-path').textContent) && q('.gp-step.now').textContent === 'CPU 神殿');
  click(q('[data-site]'));
  await sleep(100);
  check('DeWEB 小镇：进店弹窗显示店名与地址',
    /阿杰的芯片铺/.test(q('#modal-root').textContent) && /tape:\/\//.test(q('#modal-root').textContent));
  click(q('#m-close')); await sleep(100);
  const gibBefore = save().relayGiB;
  click(q('#btn-relay-buy'));
  await sleep(100);
  check('中继站：加购 2 GiB 存储',
    save().relayGiB === gibBefore + 2, 'relayGiB ' + save().relayGiB);
  q('#relay-text').value = '今晚八点开图';
  click(q('#btn-relay-send'));
  await sleep(100);
  check('中继站：加密消息演示出密文与指纹', /密文/.test(q('#relay-out').textContent) && /指纹/.test(q('#relay-out').textContent));

  // ---------- CPU 神殿（终章：真 4 位计数器） ----------
  nav('cpu');
  await sleep(200);
  check('CPU 神殿：视图已出现', q('#view-cpu').style.display !== 'none');
  check('CPU 神殿：未上电时有上电按钮', !!q('#btn-cpu-power'));
  click(q('#btn-cpu-power'));
  await sleep(200);
  check('CPU 神殿：上电后原理图已画（29 门真电路）', !!q('#cpu-board svg'));
  for (let i = 0; i < 3; i++) { click(q('#btn-cpu-beat')); await sleep(50); }
  check('CPU 神殿：跑 3 拍计数 = 3', /计数 = 3/.test(q('#cpu-panel').textContent), q('.cpu-count') && q('.cpu-count').textContent);
  for (let i = 0; i < 13; i++) { click(q('#btn-cpu-beat')); await sleep(50); }
  check('CPU 神殿：跑满 16 拍点亮 CPU', /已点亮/.test(q('#cpu-panel').textContent) && save().cpu.lit === true);
  check('黄金路径：点亮 CPU 后五步全打勾', qa('.gp-step.done').length === 5 && !q('.gp-step.now'));
  check('CPU 神殿：点亮后厂长履历出现', /厂长履历/.test(q('#cpu-panel').textContent) && !!q('#btn-cpu-share'));
  // 自动跑（第 34 轮）：开自动 → 时钟前进 → 关自动 → 时钟停住
  const clockBefore = save().cpu.clock;
  click(q('#btn-cpu-auto'));
  await sleep(1400);
  const clockRunning = save().cpu.clock;
  check('CPU 神殿：自动跑开，时钟前进 ≥2 拍', clockRunning >= clockBefore + 2, '由 ' + clockBefore + ' → ' + clockRunning);
  click(q('#btn-cpu-auto'));
  await sleep(800);
  check('CPU 神殿：自动跑关，时钟停住', save().cpu.clock === clockRunning, '仍是 ' + save().cpu.clock);
  // 分享文案（第 30 轮）：含游戏链接与图鉴进度（jsdom 无 clipboard，走 fallback 显示全文）
  click(q('#btn-cpu-share'));
  await sleep(100);
  check('CPU 神殿：分享文案含游戏链接', /4orky\.github\.io\/tapecode-simulator/.test(q('#cpu-share-msg').textContent), q('#cpu-share-msg').textContent);
  check('CPU 神殿：分享文案含图鉴进度', /图鉴 \d+\/35 条/.test(q('#cpu-share-msg').textContent));

  // ---------- 生命游戏（CPU 的第二种程序） ----------
  click(q('#btn-mode-life'));
  await sleep(200);
  check('生命游戏：4×4 网格 16 格', qa('.life-cell').length === 16);
  click(q('[data-preset="blinker"]'));
  await sleep(100);
  const aliveCells = () => qa('.life-cell.alive').map(el => parseInt(el.getAttribute('data-cell'), 10)).sort((a, b) => a - b).join(',');
  check('生命游戏：闪烁器预设（5,6,7）', aliveCells() === '5,6,7', aliveCells());
  click(q('#btn-life-beat'));
  await sleep(100);
  check('生命游戏：演化一代变竖三格（2,6,10）', aliveCells() === '2,6,10', aliveCells());
  click(q('#btn-life-beat'));
  await sleep(100);
  check('生命游戏：再演化一代回到横三格，第 2 代', aliveCells() === '5,6,7' && /第 2 代/.test(q('#cpu-panel').textContent));
  // 6×6：切换尺寸 → 36 格、轻型飞船 9 个活细胞、演化一代后第 1 代（gen 归零）
  click(q('[data-size="6"]'));
  await sleep(200);
  check('生命游戏：切 6×6 后 36 格', qa('.life-cell').length === 36);
  check('生命游戏：6×6 文案含 3,600 NAND', /3,600 NAND/.test(q('#cpu-panel').textContent));
  click(q('[data-preset="lwss"]'));
  await sleep(100);
  check('生命游戏：轻型飞船 9 个活细胞', qa('.life-cell.alive').length === 9);
  click(q('#btn-life-beat'));
  await sleep(100);
  check('生命游戏：6×6 演化一代后第 1 代', /第 1 代/.test(q('#cpu-panel').textContent));
  click(q('[data-size="4"]'));
  await sleep(200);
  check('生命游戏：切回 4×4 后 16 格', qa('.life-cell').length === 16);
  // 自动演化（第 35 轮）：开自动 → 世代前进 → 关自动 → 世代停住
  const genOf = () => { const m = /第 (\d+) 代/.exec(q('#cpu-panel').textContent); return m ? parseInt(m[1], 10) : -1; };
  click(q('#btn-life-auto'));
  await sleep(1600);
  const genRunning = genOf();
  check('生命游戏：自动演化开，世代前进 ≥2', genRunning >= 2, '第 ' + genRunning + ' 代');
  click(q('#btn-life-auto'));
  await sleep(900);
  check('生命游戏：自动演化关，世代停住', genOf() === genRunning, '仍是第 ' + genOf() + ' 代');

  // ---------- 处理器工厂（第五章：开厂与发币） ----------
  // 攒够 11 游戏 BEM（开厂 5 + mint 1 + 毕业锁 5）
  for (let i = 0; i < 25 && save().bem < 11.5; i++) {
    nav('mining'); await sleep(50);
    click(q('#btn-settle')); await sleep(50);
  }
  check('开厂：多结算攒够开厂钱（≥11.5 游戏 BEM）', save().bem >= 11.5, '当前 ' + save().bem.toFixed(2));
  nav('factory');
  await sleep(200);
  check('处理器工厂：视图已出现', q('#view-factory').style.display !== 'none');
  check('处理器工厂：长尾真实统计在界面上', /111 台 0 产出/.test(q('#factory-panel').textContent));
  q('#in-factory-name').value = '阿杰的芯片厂';
  click(q('#btn-open-factory'));
  await sleep(100);
  check('处理器工厂：开厂成功（花 5 游戏 BEM）',
    save().processors.length === 1 && save().processors[0].name === '阿杰的芯片厂');
  q('#in-token-name').value = '阿杰币';
  click(q('#btn-mint-token'));
  await sleep(100);
  check('发币：mint 成功，符号 CHIP', save().tokens.length === 1 && save().tokens[0].symbol === 'CHIP');
  click(q('[data-graduate="阿杰币"]'));
  await sleep(100);
  check('发币：开币不满 2 天毕业被拒', /满 2 天/.test(q('#token-msg').textContent), q('#token-msg').textContent);
  for (let i = 0; i < 2; i++) { nav('mining'); await sleep(50); click(q('#btn-settle')); await sleep(50); }
  nav('factory'); await sleep(100);
  click(q('[data-graduate="阿杰币"]'));
  await sleep(100);
  check('发币：满 2 天毕业成功（锁 5 游戏 BEM）',
    save().tokens[0].graduated === true && save().tokens[0].locked === 5);
  nav('mining'); await sleep(50); click(q('#btn-settle')); await sleep(50);
  check('发币：毕业后矿机挖到你的币', save().tokens[0].balance > 0, '余额 ' + save().tokens[0].balance.toFixed(4));

  // ---------- 卡片馆 + 模拟器（本地样本） ----------
  nav('test1');
  await sleep(300);
  check('卡片馆：5 张 Test1 卡', qa('.t1-card').length === 5);
  // 卡片馆目录会话内只拉一次（第 36 轮）：重进卡片馆不再重新下载 761KB
  const dirFetchesFirst = window.__dirFetches;
  nav('town'); await sleep(100);
  nav('test1'); await sleep(300);
  check('卡片馆：重进不再重新拉 directory.json', window.__dirFetches === dirFetchesFirst, '拉了 ' + window.__dirFetches + ' 次，第一次后 ' + dirFetchesFirst + ' 次');
  check('卡片馆：图片有离线 fallback（onerror）',
    (q('.t1-card img').getAttribute('onerror') || '').indexOf('t1ImgFallback') >= 0);
  click(q('[data-play="1000"]'));
  await sleep(2500);
  check('模拟器：本地样本 #1000 已加载', /已加载/.test(q('#sim-status').textContent), q('#sim-status').textContent);
  check('模拟器：原理图已画（8 入 8 出 121 NAND）', !!q('#sim-board svg') && /121 NAND/.test(q('#sim-info').textContent));
  check('模拟器：8 个输入开关 + 8 个输出 LED', qa('#sim-controls .hsw').length === 8 && qa('#sim-controls .hled').length === 8);
  click(q('#sim-controls [data-all1]')); // 全 1：#1000 回归值为 10000111
  await sleep(100);
  check('模拟器：输入全 1 后输出 = 10000111（与回归一致）',
    /输出 10000111/.test(q('#sim-controls').textContent), q('#sim-controls .io-bits').textContent);
  // 上一张/下一张（第 18 轮）：从 #1000 下一张到 #1001（无本地样本，给明错）；输入框同步
  click(q('#sim-next'));
  await sleep(500);
  check('模拟器：下一张翻到 #1001，输入框同步', q('#sim-token').value === '1001');
  check('模拟器：#1001 无本地样本，给明错', /加载失败|没有/.test(q('#sim-status').textContent), q('#sim-status').textContent);
  // 加载失败后仍显示旧电路（第 28 轮）：状态栏必须明说板上是上一张
  check('模拟器：加载失败时状态栏说明板上仍是上一张', /仍显示上一张 #1000/.test(q('#sim-status').textContent), q('#sim-status').textContent);
  // 边界循环：10000 的下一张回到 1（有本地样本，加载成功）
  q('#sim-token').value = '10000';
  click(q('#sim-next'));
  await sleep(2500);
  check('模拟器：10000 的下一张回到 #1 并加载成功', q('#sim-token').value === '1' && /已加载/.test(q('#sim-status').textContent), q('#sim-status').textContent);
  // 边界循环：1 的上一张到 10000（无本地样本，给明错）
  click(q('#sim-prev'));
  await sleep(500);
  check('模拟器：#1 的上一张到 #10000，输入框同步', q('#sim-token').value === '10000');
  // 本地目录会话内只拉一次（第 37 轮）：再加载 #1000 本地样本，directory.json 不再多拉
  const dirBefore = window.__dirFetches;
  q('#sim-token').value = '1000';
  click(q('#sim-load-local'));
  await sleep(2500);
  check('模拟器：再加载 #1000 本地样本，directory.json 不再多拉',
    window.__dirFetches === dirBefore && /已加载/.test(q('#sim-status').textContent),
    '拉了 ' + window.__dirFetches + ' 次，之前 ' + dirBefore + ' 次');

  // ---------- 图鉴 ----------
  nav('codex');
  await sleep(200);
  check('图鉴：35 条', qa('.codex-card').length === 35);
  check('图鉴：已解锁进度显示', /已解锁/.test(q('#codex-progress').textContent), q('#codex-progress').textContent);
  // 图鉴渲染审计（第 19 轮）：正文须是条目 what，不能出现 "undefined"
  check('图鉴：已解锁卡片正文不是 undefined', !/undefined/.test(q('#codex-grid').textContent));
  check('图鉴：NAND 条目正文在位', /函数完备/.test(q('#codex-grid').textContent));
  // 图鉴翻译（第 62 轮）：切英文后条目名、正文、徽章、进度都变英文，切回中文恢复
  q('#lang-select').value = 'en';
  q('#lang-select').dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(200);
  nav('codex');
  await sleep(200);
  check('图鉴：切英文后比较器变 Comparator', /Comparator/.test(q('#codex-grid').textContent) && !/比较器/.test(q('#codex-grid').textContent));
  check('图鉴：切英文后状态徽章变英文', /✅ Live/.test(q('#codex-grid').textContent));
  check('图鉴：切英文后解锁进度变英文', /Unlocked 35 \/ 35 entries/.test(q('#codex-progress').textContent));
  q('#lang-select').value = 'zh';
  q('#lang-select').dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(200);
  nav('codex');
  await sleep(200);
  check('图鉴：切回中文后比较器恢复', /比较器/.test(q('#codex-grid').textContent));

  // 全程错误陷阱（第 26 轮）：整个流程跑下来，window 上不能有未捕获的 JS 异常
  check('全程无未捕获 JS 异常', windowErrors.length === 0, windowErrors.join(' | '));

  console.log('\n' + lines.join('\n'));
  console.log(`\n合计：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试脚本异常：', e); process.exit(2); });
