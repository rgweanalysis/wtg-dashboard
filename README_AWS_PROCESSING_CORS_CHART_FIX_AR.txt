إصلاح AWS Processing + CORS + Alarm Table/Chart

هذا التحديث يصلح:
- خطأ Invalid regular expression داخل AWS iframe.
- خطأ deviceFilterInput is not defined بصورة دفاعية.
- CORS بين Cloudflare Pages وCloudflare Worker.
- قراءة Start Date / End Date / Total Duration داخل AWS بصورة أكثر ثباتًا، مع حساب End Date من Total Duration عند الحاجة حتى تظهر Date وTotal Duration وDetails وتعمل Analysis Chart.

تم اختبار Syntax للفرونت والباك إند وسكريبتات AWS الداخلية، وتم اختبار endpoint /api/aws/upload محليًا بملف AWS CSV تجريبي.
