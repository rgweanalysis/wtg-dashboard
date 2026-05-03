# إخفاء قسم X-Minute Backend Analysis التجريبي

هذا التحديث يخفي القسم المؤقت الذي كان يظهر للتحقق من X-Minute Phase 2.

الحسابات ما زالت تتم في Cloudflare Worker، والنتيجة تظل متاحة للتحقق من Console عبر:

window.__lastXMinBackendResult?.phase
window.__lastXMinBackendResult?.analysis

المتوقع أن يرجع phase:
backend-upload-parse-and-analysis
