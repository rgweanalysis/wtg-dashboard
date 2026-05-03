WTG X-Minute Backend Phase 1

هذا التحديث مبني على نسخة AWS Phase 2 الحالية.

الملفات المحدثة:
- backend-cloudflare-worker/src/index.js
- frontend/js/app.js

ما الجديد:
- إضافة endpoint جديد: POST /api/xmin/upload
- قراءة وتجهيز ملف X-Minute / X-Minutal CSV داخل Cloudflare Worker
- إرسال البيانات الجاهزة للواجهة بدون تخزين دائم
- إبقاء العرض والفلاتر والرسوم داخل الفرونت إند

طريقة التركيب:
انسخ الفولدرات الموجودة هنا فوق نفس الفولدرات داخل Desktop\wtg-dashboard واختر Replace.
ثم اعمل Commit + Push من GitHub Desktop.
