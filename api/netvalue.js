// api/netvalue.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { code } = req.query;
  if (!code || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: '缺少有效的基金代码' });
  }

  try {
    const apiUrl = `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${code}&pageIndex=1&pageSize=1`;
    const response = await fetch(apiUrl, {
      headers: {
        'Referer': 'https://fundf10.eastmoney.com/',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'
      }
    });
    const data = await response.json();

    if (data?.ErrCode === 0 && data?.Data?.LSJZList?.length > 0) {
      const latest = data.Data.LSJZList[0];
      const todayStr = new Date().toISOString().substring(0, 10);
      res.json({
        code,
        updated: latest.FSRQ === todayStr
      });
    } else {
      res.json({ code, updated: false });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}