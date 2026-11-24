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
    }
  });
  const { window } = dom;
  const { document } = window;
  await new Promise(res => { if (window.document.readyState === 'complete') res(); else window.addEventListener('load', res); });
  await sleep(500);

  const q = s => document.querySelector(s);
  const qa = s => Array.from(document.querySelectorAll(s));
  const nav = name => q(`[data-nav="${name}"]`).click();
  const mousedown = el => el.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0 }));
  const click = el => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const save = () => JSON.parse(window.localStorage.getItem('tapecode-factory-v1'));

  // ---------- 小镇 ----------
  check('小镇：6 栋建筑', qa('.building').length === 6);
  check('小镇：旅程 6 步', qa('.j-step').length === 6);
  check('小镇：HUD 初始 200 NAND / 0 游戏 BEM',
    q('#res-nand').textContent === '200' && q('#res-bem').textContent === '0.00');

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
  check('第一章：3 道题标签', qa('.ptab').length === 3);
  for (let i = 0; i < 9; i++) click(q('#btn-add-gate'));
  await sleep(100);
  check('第一章：点了 9 次加门，画布 9 门，晶体管 191',
    qa('[data-gate]').length === 9 && q('#res-nand').textContent === '191');
  // 按样本网表结构连线（信号映射与 test-factory.cjs 一致）
  const sample = T.parseTapnet(new Uint8Array(fs.readFileSync('/home/hatch/workspace/tapeout-hackathon/app/samples/full-adder-9nand.tapnet')));
  const gateIds = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  function srcSel(s) {
    if (s === 0) return '[data-src="c:0"]';
    if (s === 1) return '[data-src="c:1"]';
    if (s === 2) return '[data-src="i:0"]';
    if (s === 3) return '[data-src="i:1"]';
    if (s === 4) return '[data-src="i:2"]';
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

  // ---------- 卡片馆 + 模拟器（本地样本） ----------
  nav('test1');
  await sleep(300);
  check('卡片馆：5 张 Test1 卡', qa('.t1-card').length === 5);
  click(q('[data-play="1000"]'));
  await sleep(2500);
  check('模拟器：本地样本 #1000 已加载', /已加载/.test(q('#sim-status').textContent), q('#sim-status').textContent);
  check('模拟器：原理图已画（8 入 8 出 121 NAND）', !!q('#sim-board svg') && /121 NAND/.test(q('#sim-info').textContent));
  check('模拟器：8 个输入开关 + 8 个输出 LED', qa('#sim-controls .hsw').length === 8 && qa('#sim-controls .hled').length === 8);
  click(q('#sim-controls [data-all1]')); // 全 1：#1000 回归值为 10000111
  await sleep(100);
  check('模拟器：输入全 1 后输出 = 10000111（与回归一致）',
    /输出 10000111/.test(q('#sim-controls').textContent), q('#sim-controls .io-bits').textContent);

  // ---------- 图鉴 ----------
  nav('codex');
  await sleep(200);
  check('图鉴：22 条', qa('.codex-card').length === 22);
  check('图鉴：已解锁进度显示', /已解锁/.test(q('#codex-progress').textContent), q('#codex-progress').textContent);

  console.log('\n' + lines.join('\n'));
  console.log(`\n合计：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试脚本异常：', e); process.exit(2); });
