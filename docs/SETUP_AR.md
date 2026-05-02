# تشغيل ونشر WTG Workspace على GitHub + Cloudflare

## 1) تشغيل الفرونت إند محليًا

افتح فولدر:

```text
frontend
```

داخل VS Code، ثم افتح:

```text
WTG_Dashboard.html
```

وشغّله من Live Server.

## 2) تشغيل الباك إند محليًا

افتح Terminal من فولدر المشروع الرئيسي:

```bash
cd backend-cloudflare-worker
npm install
npm run dev
```

افتح الرابط:

```text
http://127.0.0.1:8787/api/health
```

## 3) ربط الفرونت إند بالباك إند المحلي

افتح:

```text
frontend/js/backend-config.js
```

وغيّر السطر إلى:

```js
window.WTG_BACKEND_URL = "http://127.0.0.1:8787";
```

بعدها افتح الصفحة من Live Server، وارفع ملفات AAW. ستجد في Console رسالة:

```text
AAW backend parse result
```

لو الباك إند غير شغال، الواجهة ستكمل بالطريقة القديمة داخل المتصفح.

## 4) نشر الباك إند على Cloudflare Workers

داخل فولدر الباك إند:

```bash
cd backend-cloudflare-worker
npx wrangler login
npm run deploy
```

انسخ رابط Worker الناتج، مثل:

```text
https://wtg-aaw-backend.YOUR-SUBDOMAIN.workers.dev
```

ثم ضعه في:

```text
frontend/js/backend-config.js
```

```js
window.WTG_BACKEND_URL = "https://wtg-aaw-backend.YOUR-SUBDOMAIN.workers.dev";
```

## 5) نشر الفرونت إند على GitHub Pages

ارفع محتويات فولدر `frontend` إلى GitHub repository.

من إعدادات GitHub:

```text
Settings → Pages → Deploy from branch
```

اختار branch مثل `main` ثم root حسب مكان رفع ملفات الواجهة.

## 6) ملاحظة عن CORS

في البداية ملف:

```text
backend-cloudflare-worker/wrangler.toml
```

به:

```toml
ALLOWED_ORIGIN = "*"
```

هذا مناسب للاختبار. بعد نشر GitHub Pages، الأفضل تغييره إلى رابط موقعك فقط، مثل:

```toml
ALLOWED_ORIGIN = "https://your-user.github.io"
```

ثم أعد نشر Worker:

```bash
npm run deploy
```

## 7) معنى التخزين المؤقت

في هذه المرحلة، عندما ترفع ملفات AAW:

1. الفرونت إند يرسل الملفات للـ Cloudflare Worker.
2. الـ Worker يقرأ الملف داخل الذاكرة RAM.
3. يرجع JSON فيه أسماء الأعمدة وعدد الصفوف وPreview.
4. بعد انتهاء الطلب، الملف لا يبقى محفوظًا في أي مكان.

هذا يعني:

- لا يوجد Database.
- لا يوجد حفظ ملفات.
- لا يمكن فتح تقرير قديم من السيرفر.
- لازم ترفع الملفات مرة أخرى في كل جلسة.

لو أردت حفظ الملفات لاحقًا:

- Cloudflare R2 لحفظ ملفات Excel/CSV.
- Cloudflare D1 لحفظ بيانات منظمة وجداول.
- Cloudflare KV لحفظ إعدادات بسيطة أو Cache خفيف.

أنصح بالترتيب التالي:

1. AAW upload + parse: تم في هذه النسخة.
2. AAW validation + standardized JSON.
3. AWS upload + parse.
4. X-Minute upload + parse.
5. Storage باستخدام R2/D1.
6. Login وصلاحيات.
