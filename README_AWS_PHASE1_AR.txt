تحديث AWS Phase 1

استبدل الملفات التالية داخل فولدر wtg-dashboard:

backend-cloudflare-worker/src/index.js
frontend/js/app.js

بعد الاستبدال:
1) افتح GitHub Desktop
2) Summary: Move AWS parsing to backend phase 1
3) Commit to main
4) Push origin

هذا التحديث ينقل قراءة وتحضير ملف AWS إلى Cloudflare Worker من خلال endpoint:
POST /api/aws/upload

التحليلات والجداول والفلاتر ما زالت تُعرض داخل الفرونت إند، والملف لا يتم تخزينه تخزين دائم.
