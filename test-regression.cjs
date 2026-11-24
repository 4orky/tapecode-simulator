#!/usr/bin/env node
/* 回归脚本：按 TECH_BRIEF §6 验证门跑全部用例。
 * 用法：cd ~/workspace/tapeout-hackathon/app && node test-regression.cjs
 * 退出码 0 = 全部通过；非 0 = 有失败（明细见输出）。
 * 随机抽号部分走实时链（X Layer RPC + taperelay 目录），失败会如实记录。
 */
const fs = require('fs');
const path = require('path');
const T = require('./app.js');

let pass = 0, fail = 0;
const lines = [];
function check(name, ok, detail) {
  if (ok) { pass++; lines.push(`PASS  ${name}${detail ? ' — ' + detail : ''}`); }
  else { fail++; lines.push(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}
function bits(str) { return str.split('').map(c => (c === '1' ? 1 : 0)); }

const SAMP = path.join(__dirname, 'samples');
const read = f => new Uint8Array(fs.readFileSync(path.join(SAMP, f)));

(async () => {
  // ---------- 0. SHA-256 已知向量 ----------
  check('sha256("")', T.sha256Hex(new Uint8Array(0)) === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  check('sha256("abc")', T.sha256Hex(new TextEncoder().encode('abc')) === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

  // ---------- 1. 5 张真实 Test1 网表 ----------
  const dir = JSON.parse(fs.readFileSync(path.join(SAMP, 'directory.json'), 'utf8'));
  const realCases = [
    { id: 1,    nIn: 17, nOut: 9,  nand: 100, latch: 0, out0: '000000000',    out1: '111111111' },
    { id: 100,  nIn: 17, nOut: 9,  nand: 100, latch: 0, out0: '000000000',    out1: '111111111' },
    { id: 1000, nIn: 8,  nOut: 8,  nand: 121, latch: 0, out0: '00000000',     out1: '10000111' },
    { id: 3500, nIn: 16, nOut: 5,  nand: 192, latch: 0, out0: '00000',        out1: '00001' },
    { id: 9999, nIn: 12, nOut: 12, nand: 349, latch: 0, out0: '000000000000', out1: '100000011111' },
  ];
  for (const tc of realCases) {
    const metaBytes = read(`test1-${tc.id}-meta.json`);
    const meta = JSON.parse(new TextDecoder().decode(metaBytes));
    const netBytes = read(`test1-${tc.id}.tapnet`);
    check(`#${tc.id} 信息文件 SHA-256 = 目录登记`,
      ('0x' + T.sha256Hex(metaBytes)).toLowerCase() === dir.files[String(tc.id)].toLowerCase());
    check(`#${tc.id} 网表 SHA-256 = 信息文件登记`,
      T.sha256Hex(netBytes) === meta.tap.netlist.sha256.replace(/^0x/, '').toLowerCase());
    const c = T.parseTapnet(netBytes);
    check(`#${tc.id} 解析：${c.nIn}入/${c.nOut}出/${c.nNand} NAND/${c.nLatch} LATCH`,
      c.nIn === tc.nIn && c.nOut === tc.nOut && c.nNand === tc.nand && c.nLatch === tc.latch);
    check(`#${tc.id} beat(全0) = ${tc.out0}`,
      T.bitsToString(T.simulate(c, [], new Array(tc.nIn).fill(0)).outputs) === tc.out0);
    check(`#${tc.id} beat(全1) = ${tc.out1}`,
      T.bitsToString(T.simulate(c, [], new Array(tc.nIn).fill(1)).outputs) === tc.out1);
  }
  // #1 非平凡输入（TECH_BRIEF §2.7，reference.py 对照）
  {
    const c = T.parseTapnet(read('test1-1.tapnet'));
    check('#1 beat(10101010101010101) = 110101010',
      T.bitsToString(T.simulate(c, [], bits('10101010101010101')).outputs) === '110101010');
    check('#1 beat(11001100110011001) = 111001100',
      T.bitsToString(T.simulate(c, [], bits('11001100110011001')).outputs) === '111001100');
  }

  // ---------- 2. 全加器 8/8 ----------
  {
    const c = T.parseTapnet(read('full-adder-9nand.tapnet'));
    let okSumFirst = true, okCoutFirst = true;
    for (let v = 0; v < 8; v++) {
      const inp = [v & 1, (v >> 1) & 1, (v >> 2) & 1]; // a=I0, b=I1, cin=I2
      const out = T.simulate(c, [], inp).outputs;
      const sum = inp[0] ^ inp[1] ^ inp[2];
      const cout = (inp[0] & inp[1]) | (inp[0] & inp[2]) | (inp[1] & inp[2]);
      if (!(out[0] === sum && out[1] === cout)) okSumFirst = false;
      if (!(out[0] === cout && out[1] === sum)) okCoutFirst = false;
    }
    check('全加器真值表 8/8', okSumFirst || okCoutFirst,
      okSumFirst ? 'O0=和，O1=进位' : (okCoutFirst ? 'O0=进位，O1=和' : '两种映射均不符'));
  }

  // ---------- 3. 单门 NAND 4/4 ----------
  {
    const c = T.parseTapnet(read('nand-1gate.tapnet'));
    let ok = true;
    for (let v = 0; v < 4; v++) {
      const inp = [v & 1, (v >> 1) & 1];
      const out = T.simulate(c, [], inp).outputs;
      if (out[0] !== (1 - (inp[0] & inp[1]))) ok = false;
    }
    check('单 NAND 门真值表 4/4', ok);
  }

  // ---------- 4. popcount8 256/256 ----------
  {
    const c = T.parseTapnet(read('popcount8-55nand.tapnet'));
    let ok = true, bad = -1;
    for (let v = 0; v < 256; v++) {
      const inp = [];
      for (let i = 0; i < 8; i++) inp.push((v >> i) & 1); // LSB-first
      const out = T.simulate(c, [], inp).outputs; // 4 位，LSB-first
      let pc = 0;
      for (let i = 0; i < 8; i++) pc += (v >> i) & 1;
      const exp = [pc & 1, (pc >> 1) & 1, (pc >> 2) & 1, (pc >> 3) & 1];
      if (out.join('') !== exp.join('')) { ok = false; bad = v; break; }
    }
    check('popcount8 真值表 256/256', ok, ok ? '' : ('首个不符输入 ' + bad));
  }

  // ---------- 5. toggle 8 拍（TAP-02 官方向量） ----------
  {
    const vectors = JSON.parse(fs.readFileSync(
      path.join(__dirname, '..', 'research', 'samples', 'tap02-reference', 'vectors.json'), 'utf8'));
    const tv = vectors.valid.find(x => x.name === 'toggle');
    const c = T.parseTapnet(read('toggle-1latch.tapnet'));
    let ok = true, badBeat = -1;
    let state = [0];
    const hexOf = arr => Buffer.from(T.packBits(arr)).toString('hex');
    for (let i = 0; i < tv.beats.length; i++) {
      const b = tv.beats[i];
      const inp = T.unpackBits(Buffer.from(b.inputs, 'hex'), 1);
      const st = T.unpackBits(Buffer.from(b.state, 'hex'), 1);
      if (state.join('') !== st.join('')) { ok = false; badBeat = i + 1; break; }
      const r = T.beat(c, state, inp);
      if (hexOf(r.outputs) !== b.outputs || hexOf(r.state) !== b.newState) { ok = false; badBeat = i + 1; break; }
      state = r.state;
    }
    check('toggle 8 拍（LATCH 前向引用，q\' = q XOR en）', ok, ok ? '' : ('第 ' + badBeat + ' 拍不符'));
  }

  // ---------- 6. REF 识别 ----------
  {
    const vectors = JSON.parse(fs.readFileSync(
      path.join(__dirname, '..', 'research', 'samples', 'tap02-reference', 'vectors.json'), 'utf8'));
    const rv = vectors.valid.find(x => x.name === 'ref_with_state');
    // vectors 里是记录流（无 TAPNET 头）；包上 16 字节头再解析
    const stream = Buffer.from(rv.netlist.replace(/^0x/, ''), 'hex');
    const head = Buffer.alloc(16);
    head.write('TAPNET', 0, 'ascii'); head[6] = 0x01; head[7] = 0x00;
    head.writeUInt32BE(rv.nIn, 8); head.writeUInt32BE(rv.nOut, 12);
    const file = Buffer.concat([head, stream]);
    const c = T.parseTapnet(new Uint8Array(file));
    let threw = false;
    try { T.simulate(c, [0, 0, 0], [0]); } catch (e) { threw = /暂不支持子电路引用/.test(e.message); }
    check('REF（0x02）识别后明确提示暂不支持', c.hasRef === true && threw);
  }

  // ---------- 7. 非法网表须抛错 ----------
  {
    const mk = hex => {
      const stream = Buffer.from(hex, 'hex');
      const head = Buffer.alloc(16);
      head.write('TAPNET', 0, 'ascii'); head[6] = 0x01; head[7] = 0x00;
      head.writeUInt32BE(2, 8); head.writeUInt32BE(1, 12);
      return new Uint8Array(Buffer.concat([head, stream]));
    };
    let t1 = false; try { T.parseTapnet(mk('03000000')); } catch (e) { t1 = /未知操作码/.test(e.message); }
    check('非法：未知操作码 0x03 抛错', t1);
    let t2 = false; try { T.parseTapnet(mk('00000002')); } catch (e) { t2 = /截断/.test(e.message); }
    check('非法：记录截断抛错', t2);
    let t3 = false; try { T.parseTapnet(mk('00000005000003')); } catch (e) { t3 = /不存在的信号/.test(e.message); }
    check('非法：NAND 前向引用抛错', t3);
    let t4 = false; try { T.parseTapnet(new Uint8Array([1, 2, 3])); } catch (e) { t4 = /TAPNET/.test(e.message); }
    check('非法：非 TAPNET 文件抛错', t4);
  }

  // ---------- 8. 布局冒烟 ----------
  {
    const c = T.parseTapnet(read('test1-9999.tapnet'));
    const lay = T.layoutCircuit(c);
    const nodesOk = lay.nodes.length === 2 + c.nIn + c.nNand + c.nLatch;
    const edgesOk = lay.edges.length === 2 * c.nNand;
    const coordsOk = lay.nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y));
    check('布局 #9999：363 节点 + 698 边，不降级', nodesOk && edgesOk && coordsOk && lay.tooBig === false,
      `${lay.nodes.length} 节点 / ${lay.edges.length} 边`);
    // 合成 7000 门大网表 → 必须降级为门表模式
    const N = 7000;
    const recs = Buffer.alloc(16 + N * 7);
    recs.write('TAPNET', 0, 'ascii'); recs[6] = 0x01; recs[7] = 0x00;
    recs.writeUInt32BE(2, 8); recs.writeUInt32BE(1, 12);
    for (let i = 0; i < N; i++) {
      const p = 16 + i * 7;
      recs[p] = 0x00;
      const a = i === 0 ? 2 : 2 + 2 + (i - 1); // 前一门的输出
      recs.writeUIntBE(a, p + 1, 3); recs.writeUIntBE(3, p + 4, 3);
    }
    const big = T.parseTapnet(new Uint8Array(recs));
    const layBig = T.layoutCircuit(big);
    check('布局 7000 门：节点+边 > 20000 自动降级', layBig.tooBig === true,
      `${layBig.nodes.length} 节点 / ${layBig.edges.length} 边`);
    const t0 = Date.now();
    T.simulate(big, [], [0, 0]);
    check('仿真 7000 门单拍 < 100ms', Date.now() - t0 < 100, `实测 ${Date.now() - t0}ms`);
  }

  // ---------- 9. 实时链：随机抽 5 个未拉过的 Test1 编号 ----------
  {
    const pulled = new Set([1, 100, 1000, 3500, 9999, 5000, 7000]);
    const drawn = new Set();
    while (drawn.size < 5) {
      const v = 1 + Math.floor(Math.random() * 10000);
      if (!pulled.has(v)) drawn.add(v);
    }
    const ids = [...drawn].sort((a, b) => a - b);
    console.log('\n随机抽号：' + ids.join(', '));
    for (const id of ids) {
      try {
        const ctx = await T.fetchChain(id, () => {});
        check(`实时链 #${id}：9 步全过`,
          ctx.circuit && ctx.circuit.nNand > 0,
          `${ctx.circuit.nIn}入/${ctx.circuit.nOut}出/${ctx.circuit.nNand} NAND，edition.of=${ctx.meta.tap.edition.of}`);
      } catch (e) {
        if (e.unrevealed) {
          check(`实时链 #${id}：未开图（有效状态，无网表）`, true, 'state 未开图，链本身全通至第 7 步');
        } else {
          check(`实时链 #${id}：9 步全过`, false, e.message);
        }
      }
    }
  }

  console.log('\n' + lines.join('\n'));
  console.log(`\n合计：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('回归脚本异常：', e); process.exit(2); });
