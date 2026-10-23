# DICTATION_SPEC — التسميع بالكتابة (Written Dictation)

المرجع الوحيد لكل أجزاء ميزة "التسميع بالكتابة". أي جزء جاي لازم يلتزم بالأسماء والأشكال المكتوبة هنا، ولو محتاج يغيّر حاجة يعدّل الملف ده الأول.

الحالة: **الجزء 1** (تحليل + فصل البيانات + طبقة CRUD) منفّذ. **الجزء 2** (هيكل الأدمن بقسمين) منفّذ. المحرر لسه (الجزء 3).

---

## 1. وصف المشروع الحالي

**التقنية**

- Next.js `16.4.0` (App Router) + React 19 + TypeScript (strict). `next.config.mjs` فيه `ignoreBuildErrors: true`، فالـ build مش بيكشف أخطاء الأنواع؛ الفحص بيتعمل بـ `npx tsc --noEmit`.
- Tailwind CSS 4 + shadcn/`@base-ui/react` + `lucide-react`.
- محرر النصوص: TipTap 3.
- قاعدة البيانات والمصادقة: Supabase (`@supabase/supabase-js`, `@supabase/ssr`). كل الكتابة والقراءة الحساسة من السيرفر بـ service role عن طريق `db()`؛ الجداول فيها RLS مفعّل من غير policies، يعني ماحدش بيوصلها من المتصفح.
- Gemini: "هات مفتاحك بنفسك" (BYOK). المفتاح بيتخزن في `localStorage` عند المستخدم والطلبات بتروح من المتصفح لجوجل مباشرة (`lib/gemini.ts`، client-only). مفيش حاجة من ده بتتخزن عندنا.
- مدير الحزم المعلن: pnpm (وفيه `package-lock.json` كمان).

**هيكل الملفات (الجزء المهم)**

```
app/
  page.tsx                  الصفحة الرئيسية (الفلاش كاردس)
  decks/[id]/page.tsx       جلسة مذاكرة ديك
  recite/page.tsx           قايمة دروس التسميع الحالي
  recite/[id]/page.tsx      شاشة التسميع الحالي (ReciteWorkspace)
  admin/page.tsx            لوحة الأدمن (AdminTabs)
  admin/actions.ts          server actions للأدمن (ديكات، كروت، أكواد، recite_sources)
  actions.ts                completeOnboarding, redeemCode
  auth/, login/, contact/, about/, privacy/, terms/
components/
  admin/                    admin-tabs, deck-editor, card-editor, codes-panel, recitation-editor, ...
  recite/                   recite-browser, recite-workspace, api-key-dialog
  fx/, auth/, ui/, ...      واجهة عامة
lib/
  cloze.ts                  أنواع Deck/Card + تحليل الـ cloze
  decks.ts                  قراءات الديكات (server-only) + getReciteSource
  recite.ts, recite-server.ts   مرجع التسميع الحالي
  access.ts                 صلاحيات الوصول (أكواد + is_free)
  auth.ts, admin-auth.ts    الجلسة و requireAdmin / isAdmin
  gemini.ts                 عميل Gemini (client-only)
  supabase/{admin,server,session}.ts
proxy.ts                    حماية المسارات (كله محتاج تسجيل دخول ما عدا /login /auth /about /contact /privacy /terms)
supabase/migrations/        migrations SQL
```

**طريقة تخزين البيانات (الفلاش كاردس)**

جداول Supabase: `decks` (فيها `group_id`, `is_free`)، `cards` (`deck_id`, `position`, `cloze`)، `deck_groups`، `access_codes`، `profiles`، `contact_messages`. الصلاحيات: الأدمن من `profiles.is_admin` أو متغير `ADMIN_EMAIL`، والطالب يفتح الديك لو `is_free` أو عنده كود (`access_codes`).

**الأدمن والطالب**

- الأدمن: `/admin` ← `AdminTabs` بقسمين رئيسيين (الفلاش كاردس / التسميع بالكتابة، انظر الجزء 2). قسم الفلاش كاردس جواه تابات: Decks / التسميع الحالي / Access codes. كل mutation في `app/admin/actions.ts` بتبدأ بـ `await requireAdmin()`.
- الطالب: `/recite` ← اختيار درس ← `/recite/[id]`.

**ملاحظة مهمة: فيه تسميع بالكتابة موجود بالفعل** (`/recite`, `recite_sources`, `recite_refs`). هو مربوط بالـ `decks` (الدرس = ديك فلاش كاردس). الميزة الجديدة المعرّفة هنا **منفصلة تمامًا عنه** ومش بتلمس أي جدول أو ملف فيه. الدمج أو الاستبدال قرار لاحق.

---

## 2. الفصل عن الفلاش كاردس (قواعد ملزمة)

1. كل جداول التسميع الجديدة بادئتها `dictation_`. مفيش foreign key من أو إلى `decks`, `cards`, `deck_groups`, `access_codes`, `recite_sources`, `recite_refs`.
2. كل كود التسميع الجديد في `lib/dictation/` و `app/admin/dictation-actions.ts` وملفات جديدة بس. **ممنوع** استيراد `lib/decks.ts`, `lib/cloze.ts`, `lib/recite*.ts` أو `app/admin/actions.ts` من كود التسميع الجديد.
3. ملفات الفلاش كاردس الموجودة ما اتعدلتش في الجزء 1. أي تعديل مطلوب لاحقًا على ملف موجود (زي إضافة تاب في `admin-tabs.tsx`) يتعمل في جزء الواجهة بتعديل صغير ومعلن.
4. ملفات PDF المرجعية في Storage bucket مستقل: `dictation-references` (خاص).

---

## 3. مخطط البيانات

الـ migration: `supabase/migrations/20261024000000_dictation.sql` (**لازم يتشغّل على Supabase قبل ما أي كود تسميع جديد يشتغل**). كل الجداول: RLS مفعّل، من غير policies، service role بس.

### `dictation_subjects` — المادة

| عمود | نوع | ملاحظات |
|---|---|---|
| `id` | text PK | UUID بيتولّد في السيرفر |
| `name` | text | حتى 120 حرف |
| `position` | integer | ترتيب المواد |
| `created_at`, `updated_at` | timestamptz | |

### `dictation_lessons` — الدرس

| عمود | نوع | ملاحظات |
|---|---|---|
| `id` | text PK | UUID |
| `subject_id` | text FK → `dictation_subjects.id` | `on delete cascade` |
| `title` | text | حتى 200 حرف |
| `description` | text | حتى 500 حرف، افتراضي `''` |
| `position` | integer | ترتيب الدروس جوه المادة |
| `created_at`, `updated_at` | timestamptz | |

### `dictation_headings` — المحتوى (العناوين)

| عمود | نوع | ملاحظات |
|---|---|---|
| `id` | text PK | UUID أو id من العميل (`[A-Za-z0-9_-]{1,64}`) |
| `lesson_id` | text FK → `dictation_lessons.id` | `on delete cascade` |
| `parent_id` | text FK → `dictation_headings.id` | `null` للرئيسي، وللفرعي id الرئيسي. `on delete cascade` |
| `level` | text | `'main'` أو `'sub'` |
| `title` | text | حتى 300 حرف |
| `position` | integer | **الترتيب بين الإخوة** (الرئيسية بين الرئيسية، والفرعية بين نفس الأب)، يبدأ من 1 |
| `floating` | text | `'none'` (افتراضي) أو `'up'` أو `'down'` |
| `content` | text | اختياري: النص المتوقع تحت العنوان، حتى 20,000 حرف |
| `created_at`, `updated_at` | timestamptz | |

قيد في الداتابيز: `(level='main' and parent_id is null) or (level='sub' and parent_id is not null)`.

مستويين بس: الفرعي لازم يتبع رئيسي من نفس الدرس. حذف الرئيسي بيحذف فرعياته.

### `dictation_references` — المرجع (نص أو PDF)

| عمود | نوع | ملاحظات |
|---|---|---|
| `lesson_id` | text PK, FK → `dictation_lessons.id` | `on delete cascade` |
| `kind` | text | `'none'` أو `'text'` أو `'pdf'` |
| `reference_text` | text | لما `kind='text'` (حتى 2,000,000 حرف) |
| `pdf_path`, `pdf_name`, `pdf_size` | text / text / integer | لما `kind='pdf'`، المسار جوه الـ bucket (`<lessonId>/<uuid>.pdf`)، الحجم حتى 20MB |
| `updated_at` | timestamptz | |

مرجع واحد لكل درس: نص **أو** PDF (تغيير النوع بيمسح القديم).

### شكل العنوان في TypeScript (`lib/dictation/types.ts`)

```ts
type DictationHeading = {
  id: string
  lessonId: string
  parentId: string | null          // null للرئيسي
  level: 'main' | 'sub'
  title: string
  order: number                    // العمود position، ترتيب بين الإخوة
  floating: 'none' | 'up' | 'down'
  content: string
}
```

معنى `floating` (تفسير مبدئي، يتأكد في الجزء الخاص بالتصحيح):
- `none`: العنوان مكانه ثابت حسب `order`.
- `up`: ممكن الطالب يكتبه **قبل** مكانه الأصلي من غير ما يتحسب غلط ترتيب.
- `down`: ممكن الطالب يكتبه **بعد** مكانه الأصلي من غير ما يتحسب غلط ترتيب.

**ترتيب القراءة** للدرس: كل رئيسي بالترتيب وبعده فرعياته بالترتيب (`flattenHeadingTree`).

---

## 4. قالب تقرير Gemini الثابت (مبدئي — بيتعدّل في الجزء 5)

التصحيح بيتم من المتصفح بمفتاح الطالب (`generate()` في `lib/gemini.ts`) بنفس طريقة التسميع الحالي. القالب بيتحط في `lib/dictation/report-template.ts` (ما اتعملش لسه).

**المدخلات للـ prompt**
1. المرجع: نص، أو PDF يتبعت كـ `inlineData` لجيميناي.
2. شجرة العناوين بترتيبها وقيمة `floating` لكل واحد (بالـ `id` عشان الربط).
3. نص الطالب.

**المخرجات: JSON بالشكل ده بالظبط (`responseSchema`)**

```ts
type DictationReport = {
  overall: { score: number; summary: string }   // score من 0 لـ 100
  headings: Array<{
    headingId: string                           // id من شجرة العناوين
    status: 'covered' | 'partial' | 'missing'
    score: number                               // 0..100
    missing: string[]                           // نقاط ناقصة تحت العنوان
    wrong: Array<{ student: string; correct: string }>
    note: string
  }>
  orderIssues: Array<{ headingId: string; issue: string }>  // بعد مراعاة floating
  extras: string[]                              // حاجات كتبها الطالب ومش في المرجع
  nextSteps: string[]
}
```

**ترتيب عرض التقرير للطالب**
1. الدرجة الكلية + ملخص من سطرين.
2. تفصيل لكل عنوان بترتيب الشجرة (رئيسي ثم فرعياته): الحالة، الناقص، الغلط.
3. مشاكل الترتيب.
4. إضافات مش في المرجع.
5. خطوات المراجعة الجاية.

قواعد ثابتة للـ prompt: التصحيح يعتمد على المرجع فقط، اللغة نفس لغة الطالب، ومفيش اختراع معلومات برا المرجع.

---

## 5. الملفات

### اتعملت في الجزء 1

| ملف | الدور |
|---|---|
| `supabase/migrations/20261024000000_dictation.sql` | الجداول الأربعة + الـ bucket |
| `lib/dictation/types.ts` | الأنواع والثوابت والحدود (آمن للعميل) |
| `lib/dictation/headings.ts` | دوال صافية: `buildHeadingTree`, `flattenHeadingTree`, `normalizeHeadings` (آمن للعميل) |
| `lib/dictation/data.ts` | طبقة CRUD (`server-only`، بدون فحص صلاحيات) |
| `app/admin/dictation-actions.ts` | server actions للأدمن، كل واحد بيبدأ بـ `requireAdmin()` |
| `DICTATION_SPEC.md` | الملف ده |

### مخطط للأجزاء الجاية (أسماء ملزمة)

| ملف | الدور |
|---|---|
| `lib/dictation/report-template.ts` | القالب والـ schema بتاع التقرير (الجزء 5) |
| `lib/dictation/grading.ts` | بناء الـ prompt وتنفيذ التصحيح من المتصفح |
| `app/dictation/page.tsx` | قايمة المواد والدروس للطالب |
| `app/dictation/[lessonId]/page.tsx` | شاشة الكتابة والتقرير |
| `components/dictation/dictation-browser.tsx` | تصفح المواد والدروس |
| `components/dictation/dictation-workspace.tsx` | محرر كتابة الطالب |
| `components/dictation/report-view.tsx` | عرض التقرير |
| `components/admin/dictation-editor.tsx` | إدارة المواد والدروس في الأدمن |
| `components/admin/dictation-heading-editor.tsx` | تحرير شجرة العناوين |
| `components/admin/dictation-reference-panel.tsx` | المرجع (نص / PDF) |

وتعديل صغير مستقبلي على `components/admin/admin-tabs.tsx` (تاب جديد) في جزء الواجهة.

---

## 6. طبقة البيانات (الجزء 1)

### `lib/dictation/data.ts` (السيرفر فقط، من غير فحص صلاحيات)

**المواد**
- `listSubjects()` ← المواد مع `lessonCount`
- `getSubject(id)`
- `createSubject({ name, order? })` (من غير `order` بيتحط في الآخر)
- `updateSubject(id, { name?, order? })`
- `deleteSubject(id)` ← بيمسح الدروس والعناوين والمراجع وملفات PDF

**الدروس**
- `listLessons(subjectId?)`
- `getLesson(id)`
- `createLesson({ subjectId, title, description?, order? })`
- `updateLesson(id, { title?, description?, order?, subjectId? })` (`subjectId` بينقل الدرس لمادة تانية)
- `deleteLesson(id)`

**المحتوى (العناوين)**
- `listHeadings(lessonId)` ← بترتيب القراءة
- `saveLessonHeadings(lessonId, HeadingInput[])` ← استبدال كامل: إنشاء + تعديل + حذف اللي مش في القايمة، وإعادة ترقيم `order`
- `saveHeading(lessonId, HeadingInput)` ← إنشاء أو تعديل عنوان واحد
- `deleteHeadings(lessonId, ids[])`
- `reorderHeadings(lessonId, orderedIds[])`

**المرجع**
- `getReference(lessonId)`
- `setReferenceText(lessonId, text)` (نص فاضي بيمسح المرجع)
- `createReferencePdfUpload(lessonId)` ← `{ path, token }` لرفع مباشر من المتصفح لـ Storage (الـ server actions حجمها محدود فالـ PDF مش بيعدي عليها)
- `attachReferencePdf(lessonId, { path, name })` ← بيتأكد إن الملف اترفع وحجمه في الحد، ويخليه مرجع الدرس
- `clearReference(lessonId)`
- `getReferencePdfUrl(lessonId, expiresInSeconds?)` ← رابط تحميل مؤقت

**قراءة مجمّعة**
- `getLessonFull(lessonId)` ← `{ lesson, headings, tree, reference }`

### قواعد التحقق (`normalizeHeadings`)
- العنوان لازم نص غير فاضي (بعد trim)، والحدود في `DICTATION_LIMITS`.
- الرئيسي من غير `parentId`، والفرعي لازم `parentId` يشاور على رئيسي في نفس القايمة.
- مفيش id مكرر، ولو id ناقص بيتولّد.
- `order` بيتعاد ترقيمه من 1 بين الإخوة، وعند غياب `order` أو التعادل بيتحفظ ترتيب القايمة.

### Server actions (`app/admin/dictation-actions.ts`)
نفس الدوال بأسماء `admin*Dictation*` (مثلًا `adminCreateDictationSubject`, `adminSaveDictationHeadings`, `adminAttachDictationPdf`). كلها `requireAdmin()` الأول، والـ mutations بتعمل `revalidatePath('/admin')` و `/dictation`.

### الوصول للطالب (لسه)
قراءات الطالب هتحتاج قرار صلاحيات (مجاني / بكود). الدوال في `data.ts` ما بتفحصش صلاحيات، فصفحات الطالب لازم تفحص قبل ما تنادي عليها. مفيش `is_free` أو ربط بالأكواد دلوقتي، وده هيتحدد مع واجهة الطالب.

---

## 7. نقطة الوقوف (الجزء 1)

- الفلاش كاردس: ما اتغيّرش فيه أي ملف موجود. الفحص بـ `tsc --noEmit` طلّع نفس عدد الأخطاء قبل وبعد الإضافة (الأخطاء القديمة سابقة على الشغل ده ومش من الملفات الجديدة).
- طبقة بيانات التسميع جاهزة ومتوثقة هنا، لكن **الـ migration لازم يتطبّق على Supabase** (SQL Editor أو `supabase db push`) قبل أي استخدام، ولسه ما اتجرّبتش على قاعدة بيانات حقيقية.

---

## 8. الجزء 2: صفحة الأدمن بقسمين

**الملفات**

| ملف | التغيير |
|---|---|
| `components/admin/dictation-admin.tsx` | جديد. إدارة المواد والدروس لقسم التسميع (client component) |
| `components/admin/admin-tabs.tsx` | تعديل: switcher علوي بقسمين. قسم الفلاش كاردس هو نفس التابات القديمة بالظبط (دالة `FlashcardsSection`) |
| `app/admin/page.tsx` | تعديل: بيحمّل `listSubjects()` و `listLessons()` ويمررهم كـ `dictation` |

**قسم التسميع بالكتابة** (نسخة من هيكل `DeckEditor` على بيانات `dictation_*` بس: المجموعة ← مادة، الديك ← درس):
- اختيار مادة ثم درس لفتحه.
- نقل أي درس محفوظ لمادة تانية (`adminUpdateDictationLesson` بـ `subjectId`).
- كتابة اسم درس في المادة المختارة: يفتحه لو موجود، وإلا يبدأ درس جديد (بيتحفظ بزر "حفظ الدرس").
- إنشاء مادة جديدة.
- بيانات الدرس: العنوان والوصف، زر حفظ، وزر مسح الدرس.
- شاشة تعديل الدرس: placeholder بعنوان "المحرر هيتضاف في الجزء 3" (`data-testid="dictation-editor-placeholder"`).

**قرارات**
- لو قراءة بيانات التسميع فشلت (مثلًا الـ migration لسه ما اتطبّقش)، الصفحة بتعرض تنبيه في قسم التسميع بس، والفلاش كاردس بيشتغل عادي.
- تاب "التسميع بالكتابة" القديم (المربوط بالـ decks) اتنقل جوه قسم الفلاش كاردس واتغيّر اسمه لـ "التسميع الحالي" عشان ما يتلخبطش مع القسم الجديد. محتواه ما اتغيّرش.
- مفيش `is_free` ولا حقل ID في الدرس (القرار مؤجل لواجهة الطالب).
- الفصل: `dictation-admin.tsx` بيستورد من `lib/dictation/types` و `app/admin/dictation-actions` بس، ومفيش أي استيراد من كود الفلاش كاردس.

**نقطة الوقوف:** الأدمن بقسمين شغالين، كل واحد ببياناته (جداول مختلفة تمامًا، فمادة أو درس يتضاف في قسم التسميع ما يظهرش في الفلاش كاردس والعكس). الفحص بـ `tsc --noEmit`: 57 خطأ قبل وبعد (قديمة). لسه ما اتجرّبش على قاعدة بيانات حقيقية، ولازم migration الجزء 1 يتطبّق الأول.
