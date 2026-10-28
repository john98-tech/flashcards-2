export function FacebookButton() {
  return (
    <a
      href="https://www.facebook.com/profile.php?id=61595711941724"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="تابع صفحة كارت وكتاب على فيسبوك"
      title="صفحتنا على فيسبوك"
      className="floating-contact-button fixed bottom-[5.5rem] right-5 z-50 flex size-14 items-center justify-center rounded-full bg-[#1877F2] text-white shadow-lg ring-2 ring-white/90 transition duration-300 hover:-translate-y-1 hover:scale-105 hover:bg-[#0C63D4] hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1877F2] focus-visible:ring-offset-2"
    >
      <span className="floating-contact-hint floating-contact-hint-facebook" aria-hidden="true">تابعنا</span>
      <svg viewBox="0 0 24 24" className="size-7" fill="currentColor" aria-hidden="true">
        <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.49 0-1.956.93-1.956 1.885v2.27h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073Z"/>
      </svg>
    </a>
  )
}
