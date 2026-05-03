WTG Dashboard - Speed Phase 1 CORS Backend Fix

هذا التحديث يحافظ على Speed Phase 1، ويضيف تعديلًا واضحًا في backend-cloudflare-worker/src/index.js لإجبار Cloudflare Worker على إرجاع CORS headers لكل طلبات Pages.

المشكلة التي ظهرت في Console كانت:
Access-Control-Allow-Origin header is missing

بعد التركيب يجب أن تختفي رسائل CORS، ويعود AWS و X-Minute إلى استخدام الباك إند.

ملاحظة: window.__wtgSpeedPhase1Stats موجود داخل إطار X-Minute وليس في top window. للتحقق استخدم:
document.querySelector('#frame-xmin')?.contentWindow?.__wtgSpeedPhase1Stats
