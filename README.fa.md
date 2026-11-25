# OpenCode Voice Pro

[English](README.md) | فارسی

ابزار دیکته صوتی فارسی برای OpenCode Desktop روی Windows 11.

این پروژه فورک و توسعه‌ای از [renjfk/opencode-voice](https://github.com/renjfk/opencode-voice) است. مجوز MIT و اطلاعات انتساب پروژه اصلی حفظ شده‌اند.

## قابلیت‌ها

- شروع و توقف دیکته با Ctrl+D و لغو ضبط با Esc
- انتخاب میکروفون در اولین استفاده و ذخیره انتخاب برای دفعات بعد
- ضبط ویندوز با FFmpeg و DirectShow با فرمت WAV تک‌کاناله 16kHz
- موتور آنلاین Cloudflare Workers AI با مدل @cf/openai/whisper-large-v3-turbo
- تشخیص فارسی با راهنمای زبان fa و واژگان تخصصی برنامه‌نویسی
- اصلاح متن فارسی با قواعد مشخص و بدون LLM
- پشتیبان محلی whisper.cpp با CUDA و Silero VAD هنگام قطعی اینترنت، خطای Worker یا اتمام سهمیه
- درج متن در Composer برای بازبینی؛ ارسال خودکار انجام نمی‌شود
- حذف فایل صوتی موقت پس از تبدیل موفق؛ نگهداری فایل ناموفق برای بازیابی

## پیش‌نیازها

- Windows 11 نسخه 64 بیتی
- OpenCode Desktop با پشتیبانی GUI Plugin
- Node.js نسخه 22 یا جدیدتر
- کارت گرافیک NVIDIA سازگار با CUDA برای موتور پشتیبان محلی
- حساب Cloudflare برای استقرار Worker اختصاصی خودتان

## نصب

### ۱. دریافت پروژه و ساخت افزونه

PowerShell را باز کنید:

```powershell
git clone https://github.com/MrParaZiT98/opencode-voice-pro.git
cd opencode-voice-pro
npm ci
npm run build:gui
```

### ۲. نصب موتور صوتی محلی

از ریشه پروژه اجرا کنید:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install-windows.ps1
```

این اسکریپت FFmpeg، نسخه CUDA از whisper.cpp، مدل چندزبانه Large-v3-Turbo Q5 و مدل Silero VAD را دریافت و نصب می‌کند. دانلودها حجیم هستند؛ فضای دیسک و زمان کافی در نظر بگیرید.

### ۳. راه‌اندازی Cloudflare اختصاصی

هر کاربر باید Worker خودش را در حساب Cloudflare خودش مستقر کند. از ریشه پروژه اجرا کنید:

```powershell
npx --yes wrangler@4.168.0 login
npm run worker:deploy
.\scripts\configure-cloudflare.ps1
```

پس از Deploy، آدرس Worker که Wrangler نمایش می‌دهد را هنگام اجرای اسکریپت پیکربندی وارد کنید. اسکریپت یک رمز تصادفی تولید می‌کند، آن را به‌صورت Secret در Worker ذخیره می‌کند و آدرس و رمز را در متغیرهای محیطی ویندوز ثبت می‌کند. این اطلاعات نباید در GitHub یا فایل‌های پروژه قرار بگیرند.

### ۴. معرفی افزونه به OpenCode Desktop

فایل تنظیمات زیر را باز کنید:

```text
%USERPROFILE%\.config\opencode\opencode.json
```

مسیر محلی پروژه را به آرایه plugins اضافه کنید؛ افزونه‌های قبلی خود را حذف نکنید:

```json
{
  "plugins": [
    {
      "package": "C:\\path\\to\\opencode-voice-pro",
      "options": {}
    }
  ]
}
```

مسیر نمونه را با مسیر واقعی پوشه‌ای که پروژه را در آن Clone کرده‌اید جایگزین کنید. اگر آرایه plugins از قبل وجود دارد، فقط همین شیء را به آن اضافه کنید.

OpenCode Desktop را ببندید و دوباره اجرا کنید. در اولین استفاده، Ctrl+D را بزنید و میکروفون دلخواهتان را انتخاب کنید.

## استفاده

- Ctrl+D: شروع یا توقف دیکته
- Esc: لغو ضبط فعال
- Command Palette → Choose microphone: تغییر میکروفون
- Command Palette → Voice engine status: بررسی وضعیت Cloudflare، Whisper، VAD، میکروفون و مصرف تخمینی

متن تشخیص‌داده‌شده در Composer قرار می‌گیرد؛ قبل از ارسال آن را بازبینی کنید.

## نکته هزینه Cloudflare

برای پردازش آنلاین فقط از Worker اختصاصی شما استفاده می‌شود و در صورت عدم دسترسی یا اتمام سهمیه، برنامه به Whisper محلی برمی‌گردد. برای جلوگیری از هزینه ناخواسته، حساب Cloudflare را روی پلن Free نگه دارید و پرداخت اضافه (Paid overages) را فعال نکنید. شمارنده مصرف داخل برنامه تخمینی است؛ داشبورد Cloudflare مرجع نهایی مصرف است.

## توسعه و اجرای تست‌ها

```powershell
npm ci
npm test
npm run check
npm run build:gui
```

## پروژه اصلی و مجوز

- پروژه اصلی: https://github.com/renjfk/opencode-voice
- مجوز: MIT؛ فایل‌های LICENSE و UPSTREAM.md را ببینید.
