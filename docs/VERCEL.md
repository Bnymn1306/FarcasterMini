# Vercel dağıtım rehberi

Bu proje için Vercel yalnızca **Vite frontend** barındırır. Kalıcı ve doğrulanmış
backend `https://basedmem.replit.app` adresinde çalışmaya devam eder. Veritabanı
Vercel'e taşınmaz; backend'in mevcut veritabanı, tekil executor'ları ve çalışma
durumu korunur.

## 1. Vercel'e bağlama

1. Vercel hesabınıza giriş yapın ve **Add New → Project → Import Git
   Repository** seçin.
2. `Bnymn1306/FarcasterMini` GitHub deposunu ve `main` dalını seçin. Proje
   kökü repository kökü (`.`) olmalıdır.
3. Bu repo içindeki `vercel.json` ayarlarını kullanın. Build için `npm ci`,
   ardından `npm run build:vercel` çalıştırılır; çıktı dizini `dist/public`'dır.
4. **Deploy** düğmesine basın. Yayın tamamlandığında Vercel'in verdiği
   `*.vercel.app` adresini açın.

Build script'i root `public` ile `client/public` içeriklerini birleştirir.
Canonical backend'ten sunulması gereken Farcaster manifesti hariç tutulur;
`/.well-known/farcaster.json` isteği proxy ile `basedmem.replit.app` adresine
gider. Böylece manifestin canonical kaynağı değişmez.

## 2. Ortam ve güvenlik

Frontend istekleri `/api`, `/mcp`, `/frame`, `/token-logo` ve
`/.well-known/farcaster.json` yollarında `https://basedmem.replit.app` adresine
proxy edilir. Bu yollar için frontend'e backend URL'sini sabitlemek dışında
Vercel secret'ı gerekmez.

Backend secret'larını Vercel'e koymayın. Özellikle private key'leri hiçbir zaman
`VITE_*` değişkeni olarak tanımlamayın: `VITE_*` değerleri tarayıcı bundle'ına
girer. İmzalama ve hassas işlemler backend'de kalmalıdır.

`basedmem.xyz` canonical adresi değişmeden kalır. `vercel.app` adresi yalnızca
tamamlayıcı web sitesidir; kendiliğinden doğrulanmış bir Farcaster miniapp veya
varsayılan miniapp-domain association sağlamaz. Doğrulama tamamlanmadan domain
değiştirmeyin.

## 3. Yayın sonrası kontrol listesi

Yeni deployment URL'sinde:

- `GET /api/health` ile backend sağlık yanıtını kontrol edin.
- AskBase'e bir araştırma sorusu gönderin (`POST /api/stock-agents/ask`).
- Cüzdan bağlantısı, bakiye okuma ve işlem teklifi almayı doğrulayın.
  Bu kontroller için işlem imzalamayın veya gerçek fon hareketi yapmayın.
- `/`, token/pool sayfaları ve ilgili route'larda doğrudan açılış ile yenileme
  yapın; SPA fallback'in çalıştığını doğrulayın.
- `/api`, `/mcp`, `/frame`, `/token-logo` ve
  `/.well-known/farcaster.json` proxy yanıtlarını kontrol edin.
- Manifestin `https://basedmem.replit.app/.well-known/farcaster.json`
  kaynağından geldiğini ve canonical adresin değişmediğini doğrulayın.

Vercel external rewrite/proxy istek limitlerini ve timeout'ları göz önünde
bulundurun. AskBase yavaşsa Vercel ayarlarıyla gizlemeye çalışmayın; önce
backend gecikmesini, upstream çağrıları ve limitleri araştırın. Backend'i
yeniden deploy etmek, executor sayısını artırmak veya veritabanını taşımak bu
frontend yayınının parçası değildir.

## 4. Geri alma

Sorunlu frontend için Vercel **Deployments** ekranından son çalışan deployment'ı
seçip **Promote to Production** ile geri alın. Bu işlem yalnızca frontend
deployment'ını değiştirir; `basedmem.replit.app` backend'ini durdurmayın,
executor'ları kapatmayın ve veritabanına dokunmayın.