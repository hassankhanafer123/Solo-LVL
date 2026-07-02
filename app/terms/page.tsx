import Link from 'next/link';

export const metadata = { title: 'Terms of Use — DayMaxing' };

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-[100svh] max-w-2xl bg-slate-950 px-6 py-12 text-slate-200">
      <Link href="/" className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate-400 hover:text-slate-200">← Back</Link>
      <h1 className="mt-6 text-3xl font-bold text-white">Terms of Use</h1>
      <p className="mt-2 text-xs text-slate-500">Last updated: June 25, 2026</p>

      <section className="mt-8 space-y-4 text-sm leading-relaxed text-slate-300">
        <p><strong>1. What this is.</strong> DayMaxing is a personal self-improvement and habit-tracking tool. It is provided for personal, non-commercial use.</p>
        <p><strong>2. Not professional advice.</strong> DayMaxing is not medical, fitness, mental-health, or professional advice. Consult a qualified professional before starting any exercise, diet, or wellness program. You use the app and act on your own goals at your own risk.</p>
        <p><strong>3. No warranty.</strong> The app is provided “as is,” without warranties of any kind. We do not guarantee it will be uninterrupted, error-free, or that data will be preserved.</p>
        <p><strong>4. Limitation of liability.</strong> To the fullest extent permitted by law, the creator is not liable for any damages arising from your use of the app.</p>
        <p><strong>5. Your data.</strong> Demo mode stores data only in your browser. Accounts store your tasks and progress to provide the service.</p>
        <p><strong>6. Changes.</strong> These terms may change; continued use means you accept the current version.</p>
      </section>
    </main>
  );
}
