# خطة الـ90 ميزة — Roadmap مرحلي بـ Feature Flags

## المبدأ الحاكم
لا حذف ولا إعادة كتابة لأي وظيفة حالية. كل ميزة جديدة تُبنى كطبقة **إضافية**:
- جداول جديدة بدل تعديل جداول الطلبات الحالية (وعند الحاجة: أعمدة جديدة nullable فقط بقيم افتراضية آمنة).
- كل نقطة تلامس دورة الطلب الحالية (`create_*_order`, `change_order_status`, `runDispatch`) تُغلَّف بشرط feature flag: إذا الميزة مطفأة يكون السلوك مطابقاً تماماً للسلوك الحالي.
- كل مرحلة تنتهي بـ TypeScript + production build + اختبار دورة طلب كاملة.

## المرحلة 0 — الأساس (تُنفَّذ أولاً، إجبارية)
| المطلوب | التفاصيل |
|---|---|
| **90. Feature Flags** | جدول `feature_flags` (key, description, is_enabled, rollout_percent, audience) + دالة `feature_enabled(key)` تُستدعى داخل كل RPC جديد + `/admin/flags` للتحكم + hook `useFeatureFlag` في الواجهة. |
| **89. إعدادات مركزية** | توسيع `app_settings` الموجود بصفحة `/admin/settings` مجمّعة (تسعير، عمولات، ضرائب، حدود، رسائل). |
| **87. Audit متقدم** | توسيع `audit_logs` الحالي ليغطي: المحفظة، التسويات، الاسترجاع، النزاعات، تغيير الأدوار، تغيير الـflags. |
| **59. ضرائب ورسوم** | جدول `fee_rules` (نوع، نسبة/مبلغ، نطاق مدينة/خدمة) + دمج في احتساب الإجمالي خلف flag. |

بدون هذه المرحلة لا يمكن تفعيل أي شيء لاحقاً بأمان.

## المرحلة 1 — المال والمحفظة
جداول: `wallets`, `wallet_transactions` (ledger append-only بعملة IQD/USD), `payouts`, `settlements`, `settlement_items`, `invoices`, `refund_requests`.
الميزات: 1 (Wallet)، 14 (استرجاع متكامل — بناءً على `payments` الموجود)، 15 و16 و57 (تسويات التجار والمندوبين + دوري تلقائي عبر cron الحالي)، 58 (فواتير وإيصالات)، 44 (تفصيل أرباح المندوب)، 56 (عقود وعمولات — توسيع `commission_rules`)، 60 (تعدد طرق الدفع كـ`payment_methods`).
الواجهات: زبون `/wallet`، مندوب `/driver/earnings`، تاجر `/provider/finance`، إدارة `/admin/settlements` و`/admin/refunds`.
كل حركة مالية تمر عبر RPC SECURITY DEFINER مع idempotency key؛ لا كتابة مباشرة من العميل.

## المرحلة 2 — التسويق والاحتفاظ
جداول: `coupons`, `coupon_redemptions`, `promotions`, `promotion_targets`, `loyalty_points`, `loyalty_ledger`, `referrals`, `subscriptions`, `subscription_plans`, `customer_tiers`.
الميزات: 2، 3، 4 (يمّك Plus)، 5، 6 (VIP)، 10، 25، 26، 27، 48.
منطق الخصم يُحسب **داخل الخادم فقط** ضمن دالة `quote_order_totals` جديدة تُستدعى قبل الإنشاء؛ الواجهة تعرض النتيجة فقط.
الواجهات: زبون: كوبون في `/checkout`، `/rewards`، `/plus`، `/invite`. إدارة: `/admin/promotions`.

## المرحلة 3 — الكتالوج والمخزون
جداول: `product_option_groups`, `product_options`, `order_item_options`, `product_substitutes`, `inventory_movements`, `stock_counts`, `stock_alerts`, `service_packages`, `service_quotes`.
الميزات: 7، 8، 9، 33، 34، 35، 36، 70، 71، 72، 73.
أثر على الطلب: `order_items` تبقى كما هي؛ الخيارات تُخزن في جدول فرعي وتضاف قيمتها للسعر داخل الخادم.
الواجهات: تاجر `/provider/catalog` (تبويب الخيارات والمخزون)، زبون: نافذة الخيارات في صفحة المنتج، إدارة تنبيهات المخزون.

## المرحلة 4 — العمليات واللوجستيك
جداول: `driver_zones`, `driver_shifts`, `driver_incentives`, `order_batches`, `order_batch_items`, `eta_estimates`, `delivery_proofs`, `order_queue`.
الميزات: 40، 41، 42 (ترقية `runDispatch` الحالية لا استبدالها)، 43، 45، 46، 47، 64، 65، 66، 67 (OTP تسليم فوق نظام OTP الحالي)، 68، 77.
الواجهات: إدارة `/admin/live` (خريطة مباشرة + قائمة طلبات لحظية)، مندوب: تبويبات المناوبة/المنطقة/الحوافز، زبون: تتبع مباشر.

## المرحلة 5 — التواصل والدعم
جداول: `conversations`, `messages`, `support_tickets`, `ticket_messages`, `disputes`, `dispute_events`, `push_tokens`, `notification_rules`.
الميزات: 11، 12، 13، 39، 49، 76.
تُبنى على Realtime + `notifications` الموجود. رفع الصور عبر Storage bucket جديد.
الواجهات: `/support`، لوحة `/admin/tickets` و`/admin/disputes`، شاشة محادثة داخل `/orders/$id`.

## المرحلة 6 — نمو التاجر
جداول: `provider_branches`, `provider_staff`, `provider_staff_roles`, `provider_plans`, `business_hours`, `holidays`, `provider_documents`, `provider_quality_scores`.
الميزات: 28، 29، 30، 31 (KDS)، 32 (POS كطبقة API فقط)، 53، 54، 55، 62، 63.
`/provider/kds` شاشة مطبخ realtime، `/provider/branches`، `/provider/staff`، `/admin/verification`.

## المرحلة 7 — الاكتشاف والتخصيص
جداول/آليات: `user_events`, `user_preferences`, `search_index` (مع trgm الموجود)، `favorites`, `saved_places`, `recommendations_cache`.
الميزات: 20، 21، 23، 24، 78، 79، 80، 81 (haversine الموجودة)، 82، 83، 84.
كلها بلا خدمات خارجية.

## المرحلة 8 — الذكاء الاصطناعي
الميزات: 18 (مساعد يمّك)، 19 (بحث بلغة طبيعية)، وترقية 20 بالتوصيات النموذجية.
تُنفَّذ عبر Lovable AI (بدون مفاتيح من المستخدم) كـ server functions مع تمرير سياق مقيّد فقط (لا بيانات شخصية).

## المرحلة 9 — الحماية والمراقبة
جداول: `risk_signals`, `fraud_rules`, `blocklists`, `error_events`, `crm_profiles`, `crm_activities`, `reengagement_campaigns`, `backup_runs`.
الميزات: 17، 37، 38، 50، 51، 52، 85، 86، 88 (تصدير/استعادة مُدارة — النسخ الاحتياطي الفعلي للقاعدة مُدار من المنصة، وما نبنيه هو تصدير منطقي مجدول).
جماعية: 74 و75 (طلبات جماعية وهدايا) تُنفَّذ في نهاية المرحلة 2 لاعتمادها على الدفع والمحفظة.

## يحتاج تكاملات خارجية لاحقاً
- دفع فعلي وتحويلات بنكية للتسويات (Stripe موجود كمهيكل فقط؛ التسوية المحلية تحتاج مزود عراقي).
- SMS/WhatsApp لـ OTP والحملات (Twilio: يحتاج مفاتيح).
- Push حقيقي على الجوال (FCM/APNs مع Capacitor).
- خرائط وETA دقيق بالطرق الفعلية (حالياً haversine).
- POS خارجي (تكامل ثنائي الاتجاه).
كل ما عدا ذلك قابل للتنفيذ الآن.

## الترتيب المقترح والاعتماديات
0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9.
اعتماديات صريحة: 2 و74/75 تعتمد على 1؛ 14/15/16/57/58 تعتمد على 1؛ 43/65 تعتمد على 4؛ 31 تعتمد على 3 و6؛ 19/20 تعتمد على 7؛ كل شيء يعتمد على 0.

## الأمان في كل مرحلة
جدول جديد = GRANT صريح + RLS + سياسات مُقيّدة بـ`auth.uid()` أو `has_role`؛ الأعمدة المالية والتكاليف لا تُقرأ من العميل إلا عبر RPC؛ كل تغيير حالة عبر RPC واحدة موثوقة؛ لا أرقام قادمة من الواجهة تُحتسب.

## تأكيد مطلوب قبل التنفيذ
1) نبدأ فعلياً بالمرحلة 0 + المرحلة 1 (المحفظة والتسويات) أم تفضّل البدء بالمرحلة 2 (كوبونات ونقاط) لأنها أسرع أثراً تجارياً؟
2) عملة الـledger: نثبّت IQD كعملة أساسية مع USD كعرض فقط، أم محفظتان مستقلتان؟
