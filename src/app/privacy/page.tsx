import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | Market Intelligence",
  description: "Privacy Policy for Market Intelligence",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-6 flex items-center justify-between">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight"
          >
            <span className="text-slate-900">Market </span>
            <span className="bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
              Intelligence
            </span>
          </Link>
          <Link
            href="/"
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← Back to home
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12 text-slate-800">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">
          Privacy Policy
        </h1>
        <p className="text-slate-500 text-sm mb-10">
          Last updated: {new Date().toLocaleDateString("en-US")}
        </p>

        <div className="space-y-8 text-slate-700">
          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              1. Information We Collect
            </h2>
            <p>
              When you use Market Intelligence, we may collect: (a) account information you provide when signing in (e.g., email, name from your OAuth provider); (b) portfolio and preference data you add; (c) usage data such as how you interact with the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              2. How We Use Your Information
            </h2>
            <p>
              We use your information to provide and improve the Service, personalize your briefings, send you emails you've opted into, and to comply with legal obligations. We do not sell your personal information.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              3. Data Storage and Security
            </h2>
            <p>
              Your data is stored using third-party services (e.g., Supabase) with industry-standard security measures. We take reasonable steps to protect your information from unauthorized access or disclosure.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              4. Third-Party Services
            </h2>
            <p>
              We use third parties for authentication, hosting, payment processing, and email delivery. These providers have their own privacy policies governing how they handle data we share with them.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              5. Cookies and Similar Technologies
            </h2>
            <p>
              We may use cookies and similar technologies for authentication, session management, and analytics. You can control cookies through your browser settings.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              6. Your Rights
            </h2>
            <p>
              Depending on your location, you may have rights to access, correct, delete, or export your personal data, or to object to or restrict certain processing. Contact us to exercise these rights.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              7. Children
            </h2>
            <p>
              The Service is not directed at children under 13. We do not knowingly collect personal information from children under 13.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              8. Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material changes by posting the updated policy and updating the &quot;Last updated&quot; date.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              9. Contact
            </h2>
            <p>
              For privacy-related questions, contact us at{" "}
              <a href="mailto:rishikkolpekwar@gmail.com" className="text-blue-600 hover:underline">
                rishikkolpekwar@gmail.com
              </a>
              .
            </p>
          </section>
        </div>

        <p className="mt-12 pt-8 border-t border-slate-200 text-slate-500 text-sm">
          This is a placeholder privacy policy. Replace with your actual legal policy before launch.
        </p>
      </main>
    </div>
  );
}
