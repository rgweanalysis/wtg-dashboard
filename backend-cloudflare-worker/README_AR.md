# WTG AAW Cloudflare Backend

هذا هو الباك إند الخاص بالمرحلة الأولى: **AAW upload + parse** فقط.

## التشغيل المحلي

```bash
cd backend-cloudflare-worker
npm install
npm run dev
```

بعد التشغيل المحلي سيكون الرابط غالبًا:

```text
http://127.0.0.1:8787
```

افتح:

```text
http://127.0.0.1:8787/api/health
```

لو ظهر `status: ok` فالـ Worker شغال.

## ربط الفرونت إند محليًا

افتح الملف:

```text
frontend/js/backend-config.js
```

واكتب:

```js
window.WTG_BACKEND_URL = "http://127.0.0.1:8787";
```

لو تركته فارغًا سيظل النظام يعمل بالطريقة القديمة داخل المتصفح فقط.

## النشر على Cloudflare

```bash
cd backend-cloudflare-worker
npx wrangler login
npm run deploy
```

بعد النشر خذ رابط Worker وضعه في:

```text
frontend/js/backend-config.js
```

مثال:

```js
window.WTG_BACKEND_URL = "https://wtg-aaw-backend.YOUR-SUBDOMAIN.workers.dev";
```

## ملاحظة مهمة عن التخزين

هذه النسخة لا تحفظ الملفات. يتم قراءة الملفات داخل ذاكرة الـ Worker أثناء الطلب فقط، ثم تختفي بعد انتهاء الطلب. هذا مناسب كبداية آمنة لاختبار الباك إند.
