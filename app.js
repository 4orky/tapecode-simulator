/* TapeCode 电路模拟器 — TapeOut 黑客松原型
 *
 * 纯静态前端，零构建。核心逻辑（解析/仿真/校验）按 TAP-02 草案（CC0）
 * 与 MIT 参考实现 reference.py 实现；布局思路参考官方查看页
 * nft.taperelay.com/tct1/view/ 的最长路径分层 + 重心排序（自行实现，
 * 未复制官方源码）。取数链按 TECH_BRIEF.md §1 的 9 步校验链。
 *
 * UMD 结构：浏览器里挂 window.TapeSim；Node 里 module.exports = 核心，
 * 供 test-regression.mjs 回归用。DOM 代码只在有 document 时执行。
 */
(function (global) {
  'use strict';

  /* ================= 1. SHA-256（同步实现，无依赖） ================= */
  var K256 = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  function sha256Hex(data) {
    // data: Uint8Array（或普通数字数组）
    var bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    var bitLen = bytes.length * 8;
    var paddedLen = (((bytes.length + 9 + 63) >> 6) << 6);
    var msg = new Uint8Array(paddedLen);
    msg.set(bytes);
    msg[bytes.length] = 0x80;
    var dv = new DataView(msg.buffer);
    dv.setUint32(paddedLen - 4, bitLen >>> 0); // 长度 < 2^32 字节的网表/目录都够用
    dv.setUint32(paddedLen - 8, Math.floor(bitLen / 4294967296));
    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
             0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var w = new Array(64);
    for (var off = 0; off < paddedLen; off += 64) {
      for (var t = 0; t < 16; t++) w[t] = dv.getUint32(off + t * 4);
      for (t = 16; t < 64; t++) {
        var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (t = 0; t < 64; t++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var temp1 = (hh + S1 + ch + K256[t] + w[t]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var temp2 = (S0 + maj) | 0;
        hh = g; g = f; f = e; e = (d + temp1) | 0;
        d = c; c = b; b = a; a = (temp1 + temp2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    var out = '';
    for (var i = 0; i < 8; i++) out += ('00000000' + (h[i] >>> 0).toString(16)).slice(-8);
    return out;
  }

  /* ================= 2. tapnet/1 解析（TECH_BRIEF §2.6） ================= */
  var OP_NAND = 0x00, OP_LATCH = 0x01, OP_REF = 0x02;
  var MAX_SIGNALS = 1 << 24, MAX_PINS = 1 << 16;
  var CONTRACT_TEST1 = '0x0e91460D6823C711643e650A9a4C0cc21DE41614';
  var VIEWER_URL = 'https://nft.taperelay.com/tct1/view/';
  var RPCS = ['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com', 'https://xlayer.drpc.org'];

  function u32be(b, p) {
    return ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
  }
  function u24be(b, p) { return (b[p] << 16) | (b[p + 1] << 8) | b[p + 2]; }

  function parseTapnet(bytes) {
    // 输入：.tapnet 文件字节（Uint8Array）。返回电路对象；不合法抛错。
    // REF（0x02）会被完整解码并标记 hasRef，调用方须明确提示“暂不支持子电路引用”。
    if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
    if (bytes.length <= 16) throw new Error('文件太短，不是 TAPNET 文件');
    var magic = '';
    for (var i = 0; i < 8; i++) magic += ('0' + bytes[i].toString(16)).slice(-2);
    if (magic !== '5441504e45540100') throw new Error('不是 TAPNET 文件（头 magic 不符）');
    var nIn = u32be(bytes, 8), nOut = u32be(bytes, 12);
    if (nIn > MAX_PINS || nOut < 1 || nOut > MAX_PINS) throw new Error('脚数不合法：nIn=' + nIn + ' nOut=' + nOut);
    var gates = [], hasRef = false, p = 16;
    while (p < bytes.length) {
      var op = bytes[p++];
      var w, recLen;
      if (op === OP_NAND) {
        if (p + 6 > bytes.length) throw new Error('记录截断（NAND，字节 ' + (p - 1) + '）');
        w = [u24be(bytes, p), u24be(bytes, p + 3)]; p += 6;
      } else if (op === OP_LATCH) {
        if (p + 3 > bytes.length) throw new Error('记录截断（LATCH，字节 ' + (p - 1) + '）');
        w = [u24be(bytes, p)]; p += 3;
      } else if (op === OP_REF) {
        hasRef = true;
        // REF 记录体：cpu 20B + id u64 + nIns u8 + nOuts u8 + ins u24×nIns
        if (p + 30 > bytes.length) throw new Error('记录截断（REF，字节 ' + (p - 1) + '）');
        var nIns = bytes[p + 28], nOuts = bytes[p + 29];
        recLen = 30 + 3 * nIns;
        if (p + recLen > bytes.length) throw new Error('记录截断（REF 输入，字节 ' + (p - 1) + '）');
        var ins = [];
        for (var k = 0; k < nIns; k++) ins.push(u24be(bytes, p + 30 + 3 * k));
        var cpuHex = '';
        for (var j = 0; j < 20; j++) cpuHex += ('0' + bytes[p + j].toString(16)).slice(-2);
        var idHex = '';
        for (j = 0; j < 8; j++) idHex += ('0' + bytes[p + 20 + j].toString(16)).slice(-2);
        w = ins;
        gates.push({ op: op, w: w, ref: { cpu: '0x' + cpuHex, id: idHex, nIns: nIns, nOuts: nOuts } });
        p += recLen;
        continue;
      } else {
        throw new Error('未知操作码 0x' + ('0' + op.toString(16)).slice(-2) + '（字节 ' + (p - 1) + '）');
      }
      gates.push({ op: op, w: w });
    }
    var nSignals = 2 + nIn;
    gates.forEach(function (g) { nSignals += (g.op === OP_REF ? g.ref.nOuts : 1); });
    if (nSignals > MAX_SIGNALS) throw new Error('信号数超过 2^24');
    if (nSignals - 2 - nIn < nOut) throw new Error('门太少，输出脚数超出信号数');
    var firstOut = 2 + nIn;
    gates.forEach(function (g) {
      g.firstOut = firstOut;
      firstOut += (g.op === OP_REF ? g.ref.nOuts : 1);
      var limit = (g.op === OP_LATCH) ? nSignals : g.firstOut; // NAND/REF 只能引用更早信号；LATCH 可前向引用
      g.w.forEach(function (s) {
        if (s >= limit) throw new Error('引用了不存在的信号 ' + s + '（门输出起于 ' + g.firstOut + '）');
      });
    });
    var nNand = 0, nLatch = 0, nState = 0;
    gates.forEach(function (g) {
      if (g.op === OP_NAND) nNand++;
      else if (g.op === OP_LATCH) { nLatch++; nState++; }
    });
    return {
      nIn: nIn, nOut: nOut, gates: gates, nSignals: nSignals,
      nNand: nNand, nLatch: nLatch, nState: nState, hasRef: hasRef
    };
  }

  /* ================= 3. 仿真：peek / beat（TECH_BRIEF §2.5） ================= */
  // state：LATCH 状态数组（按记录顺序），初始全 0；inputs：nIn 位，LSB-first（位 i = 输入 Ii）。
  // 返回 { signals, newState, outputs }；peek = 不采用 newState，beat = 采用。
  function simulate(circuit, state, inputs) {
    if (circuit.hasRef) throw new Error('暂不支持子电路引用（REF，操作码 0x02）');
    if (inputs.length !== circuit.nIn) throw new Error('输入位数不符：要 ' + circuit.nIn + ' 位，得 ' + inputs.length);
    if (state.length !== circuit.nState) throw new Error('状态位数不符：要 ' + circuit.nState + ' 位，得 ' + state.length);
    var a = new Array(circuit.nSignals);
    a[0] = 0; a[1] = 1;
    for (var i = 0; i < circuit.nIn; i++) a[2 + i] = inputs[i] ? 1 : 0;
    var latchIdx = 0;
    circuit.gates.forEach(function (g) {
      if (g.op === OP_NAND) {
        a[g.firstOut] = 1 - (a[g.w[0]] & a[g.w[1]]);
      } else { // LATCH：输出本拍开始时的状态位
        a[g.firstOut] = state[latchIdx++];
      }
    });
    var newState = [];
    circuit.gates.forEach(function (g) {
      if (g.op === OP_LATCH) newState.push(a[g.w[0]]);
    });
    var outputs = a.slice(a.length - circuit.nOut);
    return { signals: a, newState: newState, outputs: outputs };
  }
  function peek(circuit, state, inputs) { return simulate(circuit, state, inputs); }
  function beat(circuit, state, inputs) {
    var r = simulate(circuit, state, inputs);
    return { state: r.newState, outputs: r.outputs, signals: r.signals };
  }

  /* 位打包：位 i 是第 floor(i/8) 字节的第 i mod 8 位（LSB-first） */
  function packBits(bits) {
    var out = new Uint8Array(Math.ceil(bits.length / 8));
    for (var i = 0; i < bits.length; i++) if (bits[i]) out[i >> 3] |= (1 << (i & 7));
    return out;
  }
  function unpackBits(bytes, n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(((i >> 3) < bytes.length) ? ((bytes[i >> 3] >> (i & 7)) & 1) : 0);
    return out;
  }
  function bitsToString(bits) { return bits.map(function (b) { return b ? '1' : '0'; }).join(''); }

  /* ================= 4. 取数：9 步校验链（TECH_BRIEF §1.1） ================= */
  // 每一步都向 onStep(stepNo, name, status, detail) 汇报；失败抛错并带 step。
  // 目录指纹每次从链上 baseURI() 重读，绝不硬编码。
  function hexToBytes(hex) {
    hex = hex.replace(/^0x/, '');
    var out = new Uint8Array(hex.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }
  function decodeAbiString(hex) {
    var b = hexToBytes(hex);
    if (b.length < 64) throw new Error('ABI 字符串回包太短');
    var dv = new DataView(b.buffer);
    var len = dv.getUint32(32 + 28); // offset 0x20 处的长度（大端 u256 低 32 位）
    // 更稳妥：直接按长度字段读
    var len2 = 0;
    for (var i = 0; i < 4; i++) len2 = (len2 << 8) | b[32 + 28 + i];
    len = len2;
    if (64 + len > b.length) throw new Error('ABI 字符串长度越界');
    var s = '';
    for (var j = 0; j < len; j++) s += String.fromCharCode(b[64 + j]);
    return s;
  }
  async function ethCall(rpc, to, data) {
    var res = await fetch(rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: to, data: data }, 'latest'] })
    });
    if (!res.ok) throw new Error('RPC HTTP ' + res.status);
    var j = await res.json();
    if (j.error) throw new Error('RPC 错误：' + JSON.stringify(j.error));
    if (typeof j.result !== 'string') throw new Error('RPC 无 result');
    return j.result;
  }
  async function ethCallAny(to, data) {
    var lastErr = null;
    for (var i = 0; i < RPCS.length; i++) {
      try { return { rpc: RPCS[i], result: await ethCall(RPCS[i], to, data) }; }
      catch (e) { lastErr = e; }
    }
    throw new Error('三个 X Layer RPC 均失败：' + (lastErr && lastErr.message));
  }
  function fetchWithTimeout(url, ms) {
    ms = ms || 20000;
    return Promise.race([
      fetch(url),
      new Promise(function (_, rej) { setTimeout(function () { rej(new Error('请求超时 ' + ms + 'ms')); }, ms); })
    ]);
  }
  async function fetchBytes(url) {
    var res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
    return new Uint8Array(await res.arrayBuffer());
  }
  async function fetchJson(url) {
    var res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
    return await res.json();
  }

  // 走完整 9 步链拉一张 Test1 网表。id 为 1..10000 的编号。
  async function fetchChain(id, onStep) {
    onStep = onStep || function () {};
    var ctx = { id: id, steps: [] };
    function step(n, name, status, detail) {
      ctx.steps.push({ n: n, name: name, status: status, detail: detail || '' });
      onStep(n, name, status, detail || '');
    }
    // 1. 链上读 baseURI()
    var base;
    try {
      var r1 = await ethCallAny(CONTRACT_TEST1, '0x6c0360eb');
      base = decodeAbiString(r1.result);
      if (base.indexOf('https://nft.taperelay.com/tct1/') !== 0) throw new Error('baseURI 前缀异常：' + base);
      ctx.rpc = r1.rpc; ctx.baseURI = base;
      var fp = base.split('/tct1/')[1].replace(/\/$/, '');
      ctx.fingerprint = fp;
      step(1, '链上读 baseURI()', 'ok', base + '（RPC：' + r1.rpc + '）');
    } catch (e) { step(1, '链上读 baseURI()', 'fail', e.message); throw chainError(1, e); }
    // 2. 链上读 tokenURI(id)，须等于 baseURI + id
    var tokenURI;
    try {
      var idHex = ('0000000000000000000000000000000000000000000000000000000000000000' + id.toString(16)).slice(-64);
      var r2 = await ethCallAny(CONTRACT_TEST1, '0xc87b56dd' + idHex);
      tokenURI = decodeAbiString(r2.result);
      if (tokenURI !== base + id) throw new Error('tokenURI 与 baseURI+id 不符：' + tokenURI);
      ctx.tokenURI = tokenURI;
      step(2, '链上读 tokenURI(' + id + ')', 'ok', tokenURI);
    } catch (e) { step(2, '链上读 tokenURI(' + id + ')', 'fail', e.message); throw chainError(2, e); }
    // 3. 链上读 frozen()
    try {
      var r3 = await ethCallAny(CONTRACT_TEST1, '0x274e4a1d');
      var frozen = parseInt(r3.result.slice(-2), 16);
      ctx.frozen = frozen;
      step(3, '链上读 frozen()', 'ok', frozen === 0 ? '0（未冻结，但目录理论上仍可轮换）' : frozen + '（已冻结）');
    } catch (e) { step(3, '链上读 frozen()', 'fail', e.message); throw chainError(3, e); }
    // 4. 下载 directory.json，SHA-256 须等于 baseURI 指纹
    var dir;
    try {
      var dirBytes = await fetchBytes(base + 'directory.json');
      var dirHash = sha256Hex(dirBytes);
      if (dirHash !== ctx.fingerprint) throw new Error('目录 SHA-256 与链上指纹不符：算得 ' + dirHash + '，链上 ' + ctx.fingerprint);
      dir = JSON.parse(new TextDecoder().decode(dirBytes));
      ctx.directory = dir;
      step(4, '下载 directory.json 并校验 SHA-256', 'ok', dirBytes.length + ' 字节，SHA-256 与链上指纹一致');
    } catch (e) { step(4, '下载 directory.json 并校验 SHA-256', 'fail', e.message); throw chainError(4, e); }
    // 5. 核对目录内容
    try {
      if (!dir.collection || dir.collection.address.toLowerCase() !== CONTRACT_TEST1.toLowerCase())
        throw new Error('collection.address 不是 Test1 合约');
      if (dir.rehearsal !== false) throw new Error('rehearsal 不是 false（疑似彩排目录）');
      if (!dir.reveal || dir.reveal.round !== 34237012) throw new Error('reveal.round 不是 drand 第 34237012 轮');
      step(5, '核对目录内容', 'ok', 'collection=TapeCode-Test1，rehearsal=false，reveal.round=34237012（drand）');
    } catch (e) { step(5, '核对目录内容', 'fail', e.message); throw chainError(5, e); }
    // 6. 下载信息文件，SHA-256 须等于 directory.json 里 files[id]
    var meta;
    try {
      var want = (dir.files && dir.files[String(id)]) || '';
      if (!want) throw new Error('目录 files 里没有编号 ' + id);
      var metaBytes = await fetchBytes(tokenURI);
      var metaHash = '0x' + sha256Hex(metaBytes);
      if (metaHash.toLowerCase() !== want.toLowerCase()) throw new Error('信息文件 SHA-256 与目录登记不符：算得 ' + metaHash + '，目录 ' + want);
      meta = JSON.parse(new TextDecoder().decode(metaBytes));
      ctx.meta = meta;
      step(6, '下载信息文件并校验 SHA-256', 'ok', metaBytes.length + ' 字节，与目录登记一致');
    } catch (e) { step(6, '下载信息文件并校验 SHA-256', 'fail', e.message); throw chainError(6, e); }
    // 7. state 须为 revealed 才有网表
    try {
      var st = meta.tap && meta.tap.state;
      if (st !== 'revealed') {
        step(7, '检查开图状态', 'fail', '该编号状态为 ' + st + '（未开图，无网表；3,000 张已转入黑洞的属于此类）');
        var err = new Error('编号 #' + id + ' 未开图（state=' + st + '），没有网表');
        err.unrevealed = true; err.step = 7; throw err;
      }
      step(7, '检查开图状态', 'ok', 'revealed');
    } catch (e) { if (!e.step) { step(7, '检查开图状态', 'fail', e.message); throw chainError(7, e); } throw e; }
    // 8. 按 netlist.uris 下载网表，SHA-256 须等于 netlist.sha256
    var netBytes;
    try {
      var nl = meta.tap.netlist;
      if (!nl || nl.format !== 'tapnet/1' || !nl.sha256 || !nl.uris || !nl.uris.length)
        throw new Error('信息文件里没有有效的 tap.netlist');
      var wantHash = nl.sha256.replace(/^0x/, '').toLowerCase();
      var lastErr = null;
      for (var u = 0; u < nl.uris.length; u++) {
        try {
          var b = await fetchBytes(nl.uris[u]);
          if (sha256Hex(b) !== wantHash) throw new Error('网表 SHA-256 不符：' + nl.uris[u]);
          netBytes = b;
          ctx.netlistUrl = nl.uris[u];
          break;
        } catch (e2) { lastErr = e2; }
      }
      if (!netBytes) throw new Error('全部 ' + nl.uris.length + ' 个网表地址均失败：' + (lastErr && lastErr.message));
      step(8, '下载网表并校验 SHA-256', 'ok', netBytes.length + ' 字节，SHA-256 与信息文件一致（' + ctx.netlistUrl + '）');
    } catch (e) { step(8, '下载网表并校验 SHA-256', 'fail', e.message); throw chainError(8, e); }
    // 9. 解析网表，门数须与信息文件一致
    var circuit;
    try {
      circuit = parseTapnet(netBytes);
      var nl2 = meta.tap.netlist;
      if (circuit.nIn !== nl2.nIn || circuit.nOut !== nl2.nOut || circuit.nNand !== nl2.nand || circuit.nLatch !== nl2.latch)
        throw new Error('解析出的门数与信息文件不符：解析 nIn/nOut/NAND/LATCH=' +
          [circuit.nIn, circuit.nOut, circuit.nNand, circuit.nLatch].join('/') + '，信息文件=' +
          [nl2.nIn, nl2.nOut, nl2.nand, nl2.latch].join('/'));
      if (circuit.hasRef) throw new Error('网表含子电路引用（REF），本版暂不支持');
      ctx.circuit = circuit; ctx.netBytes = netBytes;
      step(9, '解析网表并核对门数', 'ok', circuit.nIn + ' 入 / ' + circuit.nOut + ' 出，' + circuit.nNand + ' NAND，' + circuit.nLatch + ' LATCH');
    } catch (e) { step(9, '解析网表并核对门数', 'fail', e.message); throw chainError(9, e); }
    return ctx;
  }
  function chainError(stepNo, e) {
    var err = new Error('第 ' + stepNo + ' 步失败：' + e.message);
    err.step = stepNo; err.cause = e; return err;
  }

  /* ---- 本地缓存样本（samples/，2026-11-24 拉取，离线可用） ---- */
  var LOCAL_SAMPLES = [1, 100, 1000, 3500, 9999];
  async function loadLocalSample(id) {
    // 读 samples/test1-N.tapnet + test1-N-meta.json + directory.json，逐项校验。
    var meta = await fetchJson('samples/test1-' + id + '-meta.json');
    var dir = await fetchJson('samples/directory.json');
    var wantMeta = (dir.files && dir.files[String(id)]) || '';
    var metaBytes = await fetchBytes('samples/test1-' + id + '-meta.json');
    if (('0x' + sha256Hex(metaBytes)).toLowerCase() !== wantMeta.toLowerCase())
      throw new Error('本地缓存信息文件 SHA-256 与本地目录登记不符（缓存可能损坏）');
    if (meta.tap.state !== 'revealed') throw new Error('本地缓存：编号 #' + id + ' 未开图');
    var netBytes = await fetchBytes('samples/test1-' + id + '.tapnet');
    if (sha256Hex(netBytes) !== meta.tap.netlist.sha256.replace(/^0x/, '').toLowerCase())
      throw new Error('本地缓存网表 SHA-256 与信息文件不符（缓存可能损坏）');
    var circuit = parseTapnet(netBytes);
    if (circuit.nIn !== meta.tap.netlist.nIn || circuit.nOut !== meta.tap.netlist.nOut ||
        circuit.nNand !== meta.tap.netlist.nand || circuit.nLatch !== meta.tap.netlist.latch)
      throw new Error('本地缓存网表门数与信息文件不符');
    return {
      id: id, meta: meta, circuit: circuit, netBytes: netBytes,
      source: 'local', fingerprint: null, baseURI: null,
      netlistUrl: 'samples/test1-' + id + '.tapnet（本地缓存）'
    };
  }

  /* ================= 5. 布局：最长路径分层 + 重心排序（自行实现） ================= */
  // 节点 = 每个信号（常量/输入/门输出）；层 = 该信号的最长路径深度。
  // LATCH 输出视为层 0（状态源），其 d 输入画成虚线反馈边。
  // 返回 { nodes: [{sig, x, y, layer, kind, label, gateIndex}], edges: [{from, to, latch}], width, height }
  var GRAPH_MAX = 20000; // 节点+边估算超限则降级为门表模式（查看页同款兜底）
  var NODE_W = 74, NODE_H = 30, HGAP = 96, VGAP = 14;

  function layoutCircuit(circuit) {
    var S = circuit.nSignals;
    var producer = new Array(S).fill(-1); // 信号 -> 门下标（-1 表示常量/输入）
    circuit.gates.forEach(function (g, gi) {
      var n = (g.op === OP_REF ? g.ref.nOuts : 1);
      for (var k = 0; k < n; k++) producer[g.firstOut + k] = gi;
    });
    var depth = new Array(S).fill(0);
    for (var s = 0; s < S; s++) {
      var gi = producer[s];
      if (gi < 0) { depth[s] = 0; continue; }
      var g = circuit.gates[gi];
      if (g.op === OP_LATCH) { depth[s] = 0; continue; }
      var d = 0;
      g.w.forEach(function (inp) { if (depth[inp] + 1 > d) d = depth[inp] + 1; });
      depth[s] = d;
    }
    var maxDepth = 0;
    depth.forEach(function (d) { if (d > maxDepth) maxDepth = d; });
    // 输出脚：最后 nOut 个信号。输出层 = 其深度 +1（画在最右侧）。
    var outStart = S - circuit.nOut;
    var layers = [];
    for (var l = 0; l <= maxDepth + 1; l++) layers.push([]);
    for (var s2 = 0; s2 < S; s2++) {
      if (s2 >= outStart) layers[maxDepth + 1].push(s2);
      else layers[depth[s2]].push(s2);
    }
    // 位置表：sig -> 在本层的位置序号（用于重心计算）
    function posInLayer() {
      var pos = {};
      layers.forEach(function (layer, li) { layer.forEach(function (sig, idx) { pos[sig] = idx; }); });
      return pos;
    }
    // 后继表：信号 -> 以它为输入的门输出信号（自下而上排序用，一次建成）
    var successors = {};
    circuit.gates.forEach(function (g) {
      g.w.forEach(function (inp) {
        (successors[inp] = successors[inp] || []).push(g.firstOut);
      });
    });
    // 重心排序：自上而下 3 遍，再自下而上 2 遍
    function barycenter(layerIdx, dir) {
      var layer = layers[layerIdx];
      var pos = posInLayer();
      var scored = layer.map(function (sig, origIdx) {
        var neigh = [];
        if (dir > 0) { // 前驱：该信号的生产门的输入
          var pgi = producer[sig];
          if (pgi >= 0) neigh = circuit.gates[pgi].w.slice();
        } else { // 后继：以该信号为输入的门输出
          neigh = successors[sig] || [];
        }
        var vals = neigh.filter(function (n) { return pos[n] !== undefined; }).map(function (n) { return pos[n]; });
        var c = vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : origIdx;
        return { sig: sig, c: c, orig: origIdx };
      });
      scored.sort(function (a, b) { return (a.c - b.c) || (a.orig - b.orig); });
      layers[layerIdx] = scored.map(function (x) { return x.sig; });
    }
    for (var pass = 0; pass < 3; pass++)
      for (var li = 1; li < layers.length; li++) barycenter(li, 1);
    for (pass = 0; pass < 2; pass++)
      for (li = layers.length - 2; li >= 0; li--) barycenter(li, -1);
    // 坐标
    var maxLayerSize = 0;
    layers.forEach(function (layer) { if (layer.length > maxLayerSize) maxLayerSize = layer.length; });
    var nodes = [];
    var nodeBySig = {};
    layers.forEach(function (layer, li) {
      var layerH = layer.length * (NODE_H + VGAP) - VGAP;
      var totalH = maxLayerSize * (NODE_H + VGAP) - VGAP;
      var yOff = (totalH - layerH) / 2;
      layer.forEach(function (sig, idx) {
        var kind, label, gateIndex = -1;
        if (sig === 0) { kind = 'const0'; label = 'C0'; }
        else if (sig === 1) { kind = 'const1'; label = 'C1'; }
        else if (sig < 2 + circuit.nIn) { kind = 'input'; label = 'I' + (sig - 2); }
        else {
          gateIndex = producer[sig];
          var g = circuit.gates[gateIndex];
          kind = g.op === OP_NAND ? 'nand' : (g.op === OP_LATCH ? 'latch' : 'ref');
          label = (g.op === OP_NAND ? 'NAND ' : (g.op === OP_LATCH ? 'LATCH ' : 'REF ')) + gateIndex;
        }
        var node = {
          sig: sig, x: li * (NODE_W + HGAP), y: yOff + idx * (NODE_H + VGAP),
          layer: li, kind: kind, label: label, gateIndex: gateIndex,
          isOutput: sig >= outStart, outIndex: sig >= outStart ? sig - outStart : -1
        };
        nodes.push(node); nodeBySig[sig] = node;
      });
    });
    var edges = [];
    circuit.gates.forEach(function (g, gi) {
      g.w.forEach(function (inp) {
        edges.push({ from: inp, to: g.firstOut, latch: g.op === OP_LATCH, gate: gi });
      });
    });
    var width = (layers.length) * (NODE_W + HGAP) + 40;
    var height = maxLayerSize * (NODE_H + VGAP) + 40;
    return {
      nodes: nodes, nodeBySig: nodeBySig, edges: edges,
      width: width, height: height,
      nodeCount: nodes.length, edgeCount: edges.length,
      tooBig: (nodes.length + edges.length) > GRAPH_MAX
    };
  }

  /* ================= 6. 导出（v2：界面已移至 game.js） ================= */
  var COLOR_1 = '#37d13a', COLOR_0 = '#127a15', COLOR_UNKNOWN = '#8a877c'; // Logisim 配色
  var core = {
    sha256Hex: sha256Hex, parseTapnet: parseTapnet, simulate: simulate, peek: peek, beat: beat,
    packBits: packBits, unpackBits: unpackBits, bitsToString: bitsToString,
    fetchChain: fetchChain, loadLocalSample: loadLocalSample, layoutCircuit: layoutCircuit,
    GRAPH_MAX: GRAPH_MAX, CONTRACT_TEST1: CONTRACT_TEST1, VIEWER_URL: VIEWER_URL,
    RPCS: RPCS, LOCAL_SAMPLES: LOCAL_SAMPLES
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  global.TapeSim = core;

// v2（游戏化重做）：界面代码已全部移至 game.js。本文件只保留仿真核心
// （SHA-256 / tapnet 解析 / peek-beat 仿真 / 9 步取数链 / 布局）与导出。
// Node 回归（test-regression.cjs）只用核心，不受界面改动影响。
})(typeof globalThis !== 'undefined' ? globalThis : this);
