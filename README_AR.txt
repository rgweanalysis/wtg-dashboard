WTG Workspace - Frontend + Cloudflare Backend
=============================================

هذه النسخة مبنية على النسخة المستقرة v5 الخاصة بالواجهة، مع إضافة Backend مبدئي لجزء AAW فقط.

المحتويات:

frontend/
  WTG_Dashboard.html
  css/style.css
  js/app.js
  js/backend-config.js
  assets/

backend-cloudflare-worker/
  src/index.js
  package.json
  wrangler.toml
  README_AR.md

docs/
  SETUP_AR.md

ما الذي تغير؟
- تم إضافة Cloudflare Worker Backend لرفع وقراءة ملفات AAW.
- تم إضافة ملف إعدادات للواجهة: frontend/js/backend-config.js
- إذا تركت WTG_BACKEND_URL فارغًا، ستعمل الصفحة كما كانت بدون Backend.
- إذا وضعت رابط Cloudflare Worker، سيقوم جزء AAW برفع الملفات للباك إند للقراءة والتحقق ثم يكمل العرض الحالي.

مهم:
هذه المرحلة لا تحفظ الملفات في قاعدة بيانات ولا Cloudflare R2. التخزين الحالي مؤقت داخل الطلب فقط.
