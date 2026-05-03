WTG Dashboard - X-Minute Backend Phase 1

هذه النسخة مبنية على آخر نسخة مستقرة بعد إصلاح AWS Emergency incidents.

ما الجديد:
- إضافة endpoint جديد في Cloudflare Worker: POST /api/xmin/upload
- قراءة وتجهيز ملف X-Minute / X-Minutal CSV داخل الباك إند
- إرسال البيانات الجاهزة للواجهة بدون تخزين دائم
- الحفاظ على AAW و AWS كما هما في آخر نسخة شغالة

ما زال في الفرونت إند في هذه المرحلة:
- العرض
- الفلاتر
- الجداول
- الرسوم
- التصدير

طريقة التركيب:
انسخ محتويات الملف المضغوط مباشرة داخل Desktop\wtg-dashboard واختر Replace.
ثم من GitHub Desktop اعمل Commit و Push.
