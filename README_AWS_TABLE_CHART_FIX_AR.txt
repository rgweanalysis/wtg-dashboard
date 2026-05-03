تحديث إصلاح AWS Alarm Table و AWS Dashboard — Analysis chart

ما تم إصلاحه:
1) جعل قراءة ملف AWS في الباك إند تحافظ على أسماء الأعمدة والقيم كما كانت نسخة HTML القديمة تفعل.
2) الحفاظ على أعمدة Start Date / End Date / Total Duration عند الإرسال من الباك إند إلى الفرونت.
3) تحسين اكتشاف أعمدة AWS في الواجهة، خصوصًا أعمدة التاريخ والمدة.
4) تحسين قراءة صيغ التاريخ المختلفة مثل:
   - 2026-05-01 10:00:00
   - 01/05/2026 10:00:00
   - 01.05.2026 10:00:00
5) لو يوجد Start Date و Total Duration ولا يوجد End Date، يتم حساب End Date من Start Date + Total Duration حتى لا تتعطل الجداول والـ Analysis chart.
6) الحفاظ على إصلاح Emergency incidents السابق.
7) الحفاظ على AAW و AWS و X-Minute Backend كما هم.

اختبار تم قبل إرسال النسخة:
- تم اختبار Parser بملف AWS تجريبي يحتوي Device / Event Name / Category / Total Duration / Start Date / End Date.
- تم التأكد أن Alarm A لتوربينة WTG-001 عند تكرارها مرتين ظهرت Total Duration = 02:15:00.
- تم التأكد أن Date امتلأ في جدول الإنذارات.
- تم التأكد أن بيانات الـ Timeline/Analysis chart لديها يوم صالح للرسم.
- تم تمرير فحص syntax للفرونت والباك إند باستخدام node --check.

طريقة التركيب:
انسخ محتويات هذه النسخة مباشرة داخل فولدر Desktop\wtg-dashboard واختر Replace.
ثم من GitHub Desktop:
Summary: Fix AWS alarm table and analysis chart data
Commit to main
Push origin
وبعد Deploy افتح الموقع واعمل Ctrl + F5.
