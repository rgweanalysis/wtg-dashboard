تحديث Speed Phase 1
====================

الغرض:
- تسريع الاستجابة بعد الضغط على Apply Filter، خصوصًا مع X-Minute / Experimental.

ما تم تعديله:
1. إزالة إعادة الرسم المتكرر داخل X-Minute:
   - applyFilters كان يعيد بناء الجدول والرسم بالفعل.
   - تم إيقاف الاستدعاءات الإضافية لـ buildTable و updateChart بعد applyFilters.

2. إضافة Cache مؤقت لنتائج فلترة X-Minute داخل المتصفح فقط:
   - لا يتم التخزين في GitHub أو Cloudflare أو Database.
   - التخزين مؤقت في ذاكرة الصفحة فقط.
   - يختفي بعد Refresh أو إغلاق الصفحة.

3. تأجيل تحديث الرسوم Charts لمدة قصيرة:
   - يقلل التجميد أثناء Apply Filter.
   - يمنع إعادة رسم نفس الرسم أكثر من مرة في نفس الضغط.

4. منع إعادة بناء جدول X-Minute مرتين بنفس الحالة خلال لحظات قصيرة.

طريقة التأكد:
بعد رفع X-Minute والضغط على Apply Filter، افتح Console واكتب:

window.__wtgSpeedPhase1Stats

ستظهر معلومات مثل:
- lastFilterSource: computed أو cache
- lastFilterMs
- cachedKeys

لإلغاء الكاش مؤقتًا داخل نفس الجلسة:

window.__clearXMinSpeedCache()

ملاحظة:
AAW و AWS و X-Minute ما زالوا شغالين من الباك إند كما في النسخة المستقرة السابقة.
