تحديث X-Minute Safe Sample Fix

- تم تعديل باك إند X-Minute ليستخدم عينة محدودة من الملف بدل تحليل الملف الكامل داخل Cloudflare Worker.
- السبب: ملفات X-Minute الكبيرة قد تتجاوز حد CPU في Cloudflare وتظهر في المتصفح كخطأ CORS.
- الجداول والفلاتر والرسوم تستمر في استخدام الملف الكامل داخل المتصفح.
- للتحقق بعد الرفع: window.__lastXMinBackendResult?.backendMode يجب أن تعطي safe-sample-single-pass
