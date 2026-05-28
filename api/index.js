// api/index.js
// 处理指数行情请求，从腾讯接口获取数据

// 指数名称映射
const INDEX_NAMES = {
  'sh000001': '上证指数',
  'sz399001': '深证成指',
  'sz399006': '创业板指',
  'sh000688': '科创50',
  'sh000300': '沪深300',
  'sh000905': '中证500',
  'sh000852': '中证1000',
  'sh000016': '上证50',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  try {
    // 构建腾讯行情接口所需的代码列表
    const codes = Object.keys(INDEX_NAMES).map(code => `s_${code}`).join(',');
    const apiUrl = `https://qt.gtimg.cn/q=${codes}`;

    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `上游接口返回 ${response.status}` });
    }

    const text = await response.text();
    const lines = text.split('\n').filter(line => line.trim());

    const result = lines.map(line => {
      // 腾讯行情返回格式：var hq_str_s_sh000001="上证指数,3360.50,3350.20,..."
      const match = line.match(/hq_str_s_(\w+)="(.+)"/);
      if (!match) return null;

      const rawCode = match[1];
      const fields = match[2].split('~');
      if (fields.length < 4) return null;

      const name = INDEX_NAMES[rawCode] || fields[0];
      const price = parseFloat(fields[3]);
      const change = parseFloat(fields[4]);
      const changePercent = parseFloat(fields[5]);

      return {
        code: rawCode,
        name: name,
        price: isNaN(price) ? null : price,
        change: isNaN(change) ? null : change,
        changePercent: isNaN(changePercent) ? null : changePercent,
      };
    }).filter(Boolean);

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}