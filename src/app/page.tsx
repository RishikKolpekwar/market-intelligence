import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero Section */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
        <div className="text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 tracking-tight">
            📈 Market Intelligence
          </h1>
          <p className="mt-6 text-xl text-gray-600 max-w-2xl mx-auto">
            Get a personalized daily briefing on what matters to your portfolio.
            No noise, just the news that affects your investments.
          </p>
          <div className="mt-10 flex gap-4 justify-center">
            <Link
              href="/login"
              className="px-8 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Get Started
            </Link>
            <Link
              href="#features"
              className="px-8 py-3 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              Learn More
            </Link>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div id="features" className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="p-6 rounded-xl bg-gray-50">
              <div className="text-3xl mb-4">📊</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Track Your Assets
              </h3>
              <p className="text-gray-600">
                Add the stocks and ETFs you care about. Set importance levels
                for personalized prioritization.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-6 rounded-xl bg-gray-50">
              <div className="text-3xl mb-4">🔍</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                We Scan the News
              </h3>
              <p className="text-gray-600">
                Our system monitors multiple news sources, filters out noise,
                and identifies what&apos;s relevant to you.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-6 rounded-xl bg-gray-50">
              <div className="text-3xl mb-4">📧</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Daily Briefing
              </h3>
              <p className="text-gray-600">
                Receive a concise, AI-synthesized briefing in your inbox every
                morning. No fluff, just facts.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Example Briefing Preview */}
      <div className="py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            Sample Briefing
          </h2>
          <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-200">
            <div className="border-b border-gray-200 pb-4 mb-6">
              <h3 className="text-xl font-semibold text-gray-900">
                📈 Daily Market Briefing
              </h3>
              <p className="text-sm text-gray-500 mt-1">January 8, 2026</p>
            </div>

            <div className="space-y-6">
              <div>
                <h4 className="font-semibold text-gray-800 mb-2">
                  🌍 Market Overview
                </h4>
                <p className="text-gray-600 text-sm">
                  Markets opened mixed with the S&P 500 up 0.3% while tech
                  stocks showed some weakness. Focus remained on upcoming
                  earnings season and Fed commentary.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-gray-800 mb-2">
                  📊 Your Portfolio
                </h4>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <span className="font-mono font-bold text-blue-600">
                      AAPL
                    </span>
                    <p className="text-sm text-gray-600">
                      Apple announced expanded AI features in upcoming iOS
                      update. Analysts maintain positive outlook ahead of Q1
                      earnings.
                    </p>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <span className="font-mono font-bold text-blue-600">
                      NVDA
                    </span>
                    <p className="text-sm text-gray-600">
                      NVIDIA showcased new enterprise AI solutions at CES. Stock
                      reacted positively to strong demand signals from cloud
                      providers.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-gray-800 mb-2">
                  📰 Notable Headlines
                </h4>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-gray-400">•</span>
                    <span>
                      Federal Reserve minutes signal cautious approach to rate
                      cuts
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-gray-400">•</span>
                    <span>
                      Tech sector rotation continues as value stocks gain favor
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-400 italic">
                This briefing is for informational purposes only and does not
                constitute financial advice.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="py-20 bg-blue-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Start Your Free Trial
          </h2>
          <p className="text-blue-100 mb-8 text-lg">
            Join thousands of investors who start their day with Market
            Intelligence.
          </p>
          <Link
            href="/login"
            className="inline-block px-8 py-3 bg-white text-blue-600 font-medium rounded-lg hover:bg-gray-100 transition-colors"
          >
            Sign Up with Google
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-8 bg-gray-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-gray-400 text-sm">
              © 2026 Market Intelligence. All rights reserved.
            </p>
            <div className="flex gap-6 mt-4 md:mt-0">
              <Link href="/privacy" className="text-gray-400 text-sm hover:text-white">
                Privacy
              </Link>
              <Link href="/terms" className="text-gray-400 text-sm hover:text-white">
                Terms
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
