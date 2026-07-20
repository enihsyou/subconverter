#!/usr/bin/env node
// 在 ASUS 路由器的 MerlinClash 中更新订阅以应用最新规则列表
// 通过 login.cgi 登录拿 asus_token，再 POST /_api/ 触发 clash_subscribe.sh update
//
// 用法：node scripts/apply_merlinclash.js <profile> [host]
//   profile  配置文件名（HAR 中对应 merlinclash_delyamlsel）
//   host     路由器地址，默认 http://www.asusrouter.com
//   用户密码走 env: ASUS_USER / ASUS_PASS，host 也可走 env: ASUS_HOST
//   调试：env APP_DEBUG=1 输出每个 HTTP 请求/响应

// APP_DEBUG 在 truthy 时输出 HTTP 请求/响应摘要（方法/路径/状态/字节数）
const DEBUG = ['1', 'true', 'yes', 'on'].includes(String(process.env.APP_DEBUG || '').toLowerCase());
function dbg(...args) { if (DEBUG) console.error('[REQ]', ...args); }

class MerlinClash {
  constructor({ host, user, pass }) {
    const url = new URL(host);
    this.host = host;
    this.hostname = url.hostname;
    this.port = url.port || (url.protocol === 'https:' ? 443 : 80);
    this.http = require(url.protocol.slice(0, -1));
    this.user = user;
    this.pass = pass;
    this.token = null;
  }

  // node fetch 把 header 改成小写，ASUS 接口需要 Title-Case
  // https://github.com/node-fetch/node-fetch/issues/764#issuecomment-2734445824
  // 改用低层 http/https 请求，规避这个问题
  #rawRequest(method, path, { headers = {}, body = null } = {}) {
    const finalHeaders = { ...headers };
    if (body != null) {
      finalHeaders['Content-Length'] = Buffer.byteLength(body);
    }
    dbg(`${method} ${path}`, finalHeaders, body);
    return new Promise((resolve, reject) => {
      const req = this.http.request({
        hostname: this.hostname,
        port: this.port,
        path,
        method,
        headers: finalHeaders,
      }, res => {
        let chunks = '';
        res.setEncoding('utf8');
        res.on('data', chunk => chunks += chunk);
        res.on('end', () => {
          dbg(`<- ${res.statusCode} ${path}`, { 'set-cookie': res.headers['set-cookie'] }, chunks);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text: () => Promise.resolve(chunks),
          });
        });
      });
      req.on('error', reject);
      if (body != null) req.write(body);
      req.end();
    });
  }

  // 从 Set-Cookie 数组中提取指定 cookie 名
  static #extractCookie(setCookieHeader, name) {
    if (!setCookieHeader) return null;
    const list = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    for (const entry of list) {
      const [pair] = entry.split(';');
      const [k, ...rest] = pair.split('=');
      if (k.trim() === name) return rest.join('=').trim();
    }
    return null;
  }

  async login() {
    if (!this.user || !this.pass) {
      throw new Error('ASUS_USER / ASUS_PASS 未设置，无法登录');
    }
    const auth = Buffer.from(`${this.user}:${this.pass}`).toString('base64');
    const form = new URLSearchParams({
      group_id: '',
      action_mode: '',
      action_script: '',
      action_wait: '5',
      current_page: 'Main_Login.asp',
      next_page: 'index.asp',
      login_authorization: auth,
      login_captcha: '',
    }).toString();

    const res = await this.#rawRequest('POST', '/login.cgi', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': `${this.host}/Main_Login.asp`,
      },
      body: form,
    });

    if (res.status !== 200 && res.status !== 302) {
      throw new Error(`登录失败 HTTP ${res.status}: ${await res.text()}`);
    }
    const token = MerlinClash.#extractCookie(res.headers['set-cookie'], 'asus_token');
    if (!token) {
      throw new Error('登录响应未携带 asus_token');
    }
    this.token = token;
  }

  async triggerUpdate(profile) {
    if (!this.token) throw new Error('尚未登录');
    // 接口正文是裸 JSON，但 MerlinClash 按 HAR 所示要求 form-urlencoded Content-Type。
    // id 必须是 8 位数字（HAR 中 60632354 也是 8 位）；Date.now() 长达 13 位会让路由器卡住
    const data = JSON.stringify({
      id: Math.floor(10_000_000 + Math.random() * 90_000_000),
      method: "clash_subscribe.sh",
      params: ["update"],
      fields: {
        merlinclash_delyamlsel: profile,
        merlinclash_action: "2",
      },
    });

    const res = await this.#rawRequest('POST', '/_api/', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Referer': `${this.host}/Module_merlinclash.asp`,
        'Cookie': `asus_token=${this.token}`,
      },
      body: data,
    });
    const text = await res.text();
    if (res.status !== 200) {
      throw new Error(`触发更新失败 HTTP ${res.status}: ${text}`);
    }
    return text;
  }

  async getLog() {
    if (!this.token) throw new Error('尚未登录');
    // 该接口每次都返回完整日志文件；查询参数 `_` 不影响响应。
    // clash_subscribe.sh 在写入日志时可能让服务器中途关闭连接，加重试兜底
    const delays = [0, 200, 400, 800];
    let lastErr;
    for (const delay of delays) {
      if (delay) await new Promise(r => setTimeout(r, delay));
      try {
        const res = await this.#rawRequest('GET', '/_temp/merlinclash_log.txt', {
          headers: {
            'Referer': `${this.host}/Module_merlinclash.asp`,
            'Cookie': `asus_token=${this.token}`,
          },
        });
        if (res.status !== 200) {
          throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        }
        return await res.text();
      } catch (err) {
        lastErr = err;
        dbg(`getLog 重试 (${delay}ms) — ${err.message}`);
      }
    }
    throw new Error(`读取日志失败（已重试 ${delays.length - 1} 次）: ${lastErr.message}`);
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// getLog() 返回完整文件，内存中保留上次快照并取这次快照的增量。
// 日志被截断或轮转时，尽可能保留两个快照的重叠部分；没有重叠则把当前
// 文件视为新的日志内容，避免遗漏后续的完成标志。
function findNewLog(previousLog, currentLog) {
  if (currentLog.startsWith(previousLog)) {
    return currentLog.slice(previousLog.length);
  }

  const maxOverlap = Math.min(previousLog.length, currentLog.length);
  for (let length = maxOverlap; length > 0; length -= 1) {
    if (previousLog.endsWith(currentLog.slice(0, length))) {
      return currentLog.slice(length);
    }
  }

  return currentLog;
}

async function waitForCompletion(client, initialLog = '') {
  let lastLog = initialLog;
  for (;;) {
    const currentLog = await client.getLog();
    const newLog = findNewLog(lastLog, currentLog);
    lastLog = currentLog;

    const markerIndex = newLog.indexOf('BBABBBBC');
    const output = markerIndex === -1 ? newLog : newLog.slice(0, markerIndex);
    if (output) {
      process.stdout.write(output);
    }
    if (markerIndex !== -1) {
      return;
    }

    await sleep(1000);
  }
}

async function main() {
  const argv = [...process.argv, '', ''].slice(2);
  const profile = argv[0] || "sspgist";
  const host = argv[1] || process.env.ASUS_HOST || "http://www.asusrouter.com";

  const client = new MerlinClash({
    host,
    user: process.env.ASUS_USER,
    pass: process.env.ASUS_PASS,
  });

  try {
    console.log(`登录 ${host} ...`);
    await client.login();
    console.log('已获得 asus_token');

    // 先记录触发前的完整日志，避免历史 BBABBBBC 被误认为本次完成。
    const initialLog = await client.getLog();
    console.log(`触发订阅更新 (profile=${profile}) ...`);
    const resp = await client.triggerUpdate(profile);
    console.log(`触发更新响应: ${resp}`);

    console.log('开始监控日志...');
    await waitForCompletion(client, initialLog);
    console.log('更新完成');
  } catch (error) {
    console.error('发生错误:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { findNewLog, waitForCompletion };
