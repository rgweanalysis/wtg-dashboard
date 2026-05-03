# X-Minute analysis-only backend CORS/large-response fix

هذا التحديث يجعل طلب X-Minute إلى الباك إند يرجع التحليل والملخص فقط بدل إرجاع كل الصفوف داخل JSON ضخم.

السبب: ملفات X-Minute الكبيرة قد تجعل استجابة Cloudflare Worker ضخمة جدًا، فيظهر الخطأ كأنه CORS رغم أن السبب العملي هو فشل الاستجابة الكبيرة.

الوضع بعد التعديل:
- التحليل الأساسي لـ X-Minute يتم في Cloudflare Worker.
- الجداول والفلترة تعرض الصفوف محليًا في المتصفح لتفادي إرسال JSON ضخم.
- `window.__lastXMinBackendResult.phase` يجب أن يرجع `backend-upload-parse-and-analysis`.
- `window.__lastXMinBackendResult.responseMode` يجب أن يرجع `analysis-only`.
