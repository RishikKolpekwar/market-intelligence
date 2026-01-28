import Link from "next/link";

export const metadata = {
  title: "Terms of Service | Market Intelligence",
  description: "Terms of Service for Market Intelligence",
};

export default function TermsPage() {
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
          Terms of Service
        </h1>
        <p className="text-slate-500 text-sm mb-10">
          Last updated: {new Date().toLocaleDateString("en-US")}
        </p>

        <div className="space-y-8 text-slate-700">
          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing or using Market Intelligence (&quot;the Service&quot;), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              2. Description of Service
            </h2>
            <p>
              Market Intelligence provides personalized market briefings and financial news aggregation. The Service is for informational purposes only and does not constitute investment advice.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              3. User Accounts
            </h2>
            <p>
              You may sign in via third-party authentication (e.g., Google). You are responsible for maintaining the security of your account and for all activity under it.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              4. Acceptable Use
            </h2>
            <p>
              You agree not to misuse the Service, including by circumventing access limits, scraping data without permission, or using the Service for any unlawful purpose.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              5. Disclaimer
            </h2>
            <p>
              The Service and all content are provided &quot;as is&quot; without warranties of any kind. We do not guarantee accuracy, completeness, or suitability of any information for your investment decisions.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              6. Limitation of Liability
            </h2>
            <p>
              To the maximum extent permitted by law, Market Intelligence and its operators shall not be liable for any indirect, incidental, or consequential damages arising from your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              7. Changes
            </h2>
            <p>
              We may update these Terms from time to time. Continued use of the Service after changes constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              8. Contact
            </h2>
            <p>
              Questions about these Terms? Contact us at{" "}
              <a href="mailto:rishikkolpekwar@gmail.com" className="text-blue-600 hover:underline">
                rishikkolpekwar@gmail.com
              </a>
              .
            </p>
          </section>
        </div>

        <p className="mt-12 pt-8 border-t border-slate-200 text-slate-500 text-sm">
          This is a placeholder terms of service. Replace with your actual legal terms before launch.
        </p>
      </main>
    </div>
  );
}
