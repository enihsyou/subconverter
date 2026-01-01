#!/usr/bin/env node
// 在 ASUS 路由器的 MerlinClash 中更新订阅以应用最新规则列表
// Deprecated: 在 Firmware 3004.388.9_2 版本发现，接口需要 asus_s_token Cookie 了

const argv = [...process.argv, '', ''].slice(2);
const profile = argv[0] || "sspgist";
const host = argv[1] || process.env.ASUS_HOST || "http://www.asusrouter.com";

// node fetch 模块发出的 header 是小写的，但接口需要 Title-Case
// https://github.com/node-fetch/node-fetch/issues/764#issuecomment-2734445824
async function triggerUpdate() {
  const url = new URL(`${host}/_api/`);
  const data = JSON.stringify({
    id: 12345678,
    method: "clash_updateyamlsel.sh",
    params: [0],
    fields: {
      merlinclash_delyamlsel: profile,
      merlinclash_action: "26"
    }
  });

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  };

  const response = await new Promise((resolve, reject) => {
    const protocol = require(url.protocol.slice(0, -1));
    const req = protocol.request(url, options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ text: () => Promise.resolve(body) }));
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });

  return response;
}

async function getLog() {
  const response = await fetch(`${host}/_temp/merlinclash_log.txt`);
  return await response.text();
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 通过行数比较来找出新增的日志行
function findNewLines(currentLog, lastLineCount) {
  const lines = currentLog.trimEnd().split('\n');
  const currentLineCount = lines.length;

  if (currentLineCount <= lastLineCount) {
    return [];
  }

  return lines.slice(lastLineCount);
}

async function main() {
  try {
    console.log('触发更新...');
    await triggerUpdate();

    console.log('开始监控日志...');
    for (let lastLineCount = 0; ; await sleep(1000)) {
      const currentLog = await getLog();
      let newLines = findNewLines(currentLog, lastLineCount);
      lastLineCount += newLines.length;
      const markerIndex = newLines.findIndex(line => line.includes('BBABBBBC'));
      const markComplete = markerIndex !== -1;
      if (markComplete) {
        newLines = newLines.slice(0, markerIndex);
      }
      if (newLines.length > 0) {
        console.log(newLines.join('\n'));
      }
      if (markComplete) {
        break;
      }
    }
  } catch (error) {
    console.error('发生错误:', error);
    process.exit(1);
  }
}

main();
