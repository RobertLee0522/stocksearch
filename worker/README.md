# 盤中即時報價代理

證交所的即時報價端點 `mis.twse.com.tw` 不回 `Access-Control-Allow-Origin`，
瀏覽器會擋掉跨網域請求，因此 GitHub Pages 上的靜態網站無法直接取用。
這個 Cloudflare Worker 代為轉發並補上 CORS 標頭。

網站本身仍然部署在 GitHub Pages，沒有即時報價也能照常運作；
部署好這個 Worker 並在畫面右側「即時報價來源」填入網址之後，才會開始顯示盤中報價。

## 部署

```bash
npx wrangler login
npx wrangler deploy -c worker/wrangler.toml      # 從專案根目錄執行
```

部署後會得到類似 `https://stocksearch-quote-proxy.<你的子網域>.workers.dev` 的網址。
把它填進網站右側的「即時報價來源」，設定只會存在該瀏覽器的 localStorage。

也可以在建置時以 `VITE_QUOTE_PROXY` 環境變數指定預設值，省去每台裝置手動填寫。

## 設定

`wrangler.toml` 的 `ALLOWED_ORIGINS` 以逗號分隔允許的來源，預設只允許本專案的 GitHub Pages 網址。
本機開發時要一併加入，例如：

```toml
ALLOWED_ORIGINS = "https://robertlee0522.github.io,http://localhost:3000"
```

整段拿掉則任何來源都能呼叫。

## 介面

```
GET /quote?codes=2330,2317
```

代號需為 4 到 6 位數字，單次最多 25 檔，超過的會被忽略；
代號會先驗證再組成證交所的查詢字串，因此它無法被用來轉發任意網址。

回應：

```json
{
  "at": "2026-09-14T05:24:31.000Z",
  "quotes": [
    { "code": "2330", "name": "台積電", "price": 1005, "previous": 1000, "change": 5,
      "percent": 0.5, "open": 1001, "high": 1010, "low": 998, "volume": 30000,
      "time": "13:24:31", "date": "20260914", "traded": true }
  ]
}
```

`traded` 為 `false` 時代表當下尚未成交，`price` 以最佳買賣中價（再沒有則以昨收）替代。
上游異常時回傳 502 與 `message`，前端會退回只顯示收盤資料。

## 本機測試

```bash
npx wrangler dev -c worker/wrangler.toml --port 8787
curl "http://127.0.0.1:8787/quote?codes=2330" -H "Origin: https://robertlee0522.github.io"
```
