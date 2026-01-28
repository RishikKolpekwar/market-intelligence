import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        {/* Decorative background elements */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50"></div>
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl"></div>

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-blue-200 text-sm mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400"></span>
              </span>
              AI-powered market insights
            </div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white tracking-tight">
              Market
              <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent"> Intelligence</span>
            </h1>
            <p className="mt-6 text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
              Get a personalized daily briefing on what matters to your portfolio.
              No noise, just the news that affects your investments.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/login"
                className="px-8 py-4 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:-translate-y-0.5"
              >
                Log-In/Sign-Up
              </Link>
              <Link
                href="#features"
                className="px-8 py-4 bg-white/10 backdrop-blur-sm text-white font-semibold rounded-xl hover:bg-white/20 transition-all border border-white/20"
              >
                See How It Works
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div id="features" className="py-24 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-sm font-semibold text-blue-600 uppercase tracking-wider mb-3">
              How It Works
            </h2>
            <p className="text-4xl font-bold text-slate-900">
              Three steps to smarter investing
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="group p-8 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-xl hover:border-blue-200 transition-all duration-300">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform">
                📊
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">
                Track Your Assets
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Add the stocks and ETFs you care about. Set importance levels
                for personalized prioritization.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="group p-8 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-xl hover:border-blue-200 transition-all duration-300">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform">
                🔍
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">
                We Scan the News
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Our system monitors multiple news sources, filters out noise,
                and identifies what&apos;s relevant to you.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="group p-8 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-xl hover:border-blue-200 transition-all duration-300">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform">
                📧
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">
                Daily Briefing
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Receive a concise, AI-synthesized briefing in your inbox every
                morning. No fluff, just facts.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Example Briefing Preview - clear division from How It Works */}
      <div id="preview" className="py-24 bg-white border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="max-w-24 mx-auto h-0.5 bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full mb-6" aria-hidden />
            <h2 className="text-sm font-semibold text-blue-600 uppercase tracking-wider mb-3">
              Preview
            </h2>
            <p className="text-4xl font-bold text-slate-900">
              See what you&apos;ll receive
            </p>
          </div>

          {/* Briefing Header Card - matching hero theme */}
          <div className="bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 rounded-2xl shadow-xl p-6 mb-4 text-white relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
            <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/20 rounded-full blur-3xl" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-2xl">📈</span>
                <h3 className="text-xl font-bold">Daily Market Briefing</h3>
              </div>
              <p className="text-blue-200">
                {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              </p>
              <div className="flex gap-2 mt-3">
                <span className="px-2 py-0.5 bg-white/10 backdrop-blur-sm rounded-full text-xs border border-white/20">
                  156 news items
                </span>
                <span className="px-2 py-0.5 bg-white/10 backdrop-blur-sm rounded-full text-xs border border-white/20">
                  12 assets
                </span>
              </div>
            </div>
          </div>

          {/* Compact Preview Cards - match How It Works card style */}
          <div className="space-y-4">
            {/* Market Overview */}
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
              <h4 className="font-bold text-slate-900 mb-2 flex items-center gap-2">
                <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-sm shadow-sm">🌍</span>
                Market Overview
              </h4>
              <p className="text-slate-600 text-sm leading-relaxed">
                A concise summary of the day: major indices, sector moves, and what’s driving the market. Fed policy, earnings, and macro news in one place.
              </p>
            </div>

            {/* Portfolio Summary - Condensed table style */}
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
              <h4 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-white text-sm shadow-sm">📊</span>
                Portfolio Holdings
              </h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-sm text-white bg-gradient-to-r from-blue-600 to-blue-700 px-2 py-1 rounded">AAPL</span>
                    <span className="text-slate-600 text-sm">Apple Inc.</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-900 font-medium text-sm">$198.45</span>
                    <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-xs font-medium">+1.2%</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-sm text-white bg-gradient-to-r from-blue-600 to-blue-700 px-2 py-1 rounded">NVDA</span>
                    <span className="text-slate-600 text-sm">NVIDIA Corp</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-900 font-medium text-sm">$142.67</span>
                    <span className="text-red-500 bg-red-50 px-2 py-0.5 rounded text-xs font-medium">-0.8%</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-sm text-white bg-gradient-to-r from-blue-600 to-blue-700 px-2 py-1 rounded">MSFT</span>
                    <span className="text-slate-600 text-sm">Microsoft</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-900 font-medium text-sm">$425.22</span>
                    <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-xs font-medium">+0.5%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Asset Analysis Preview */}
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
              <h4 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white text-sm shadow-sm">📝</span>
                Asset Analysis
              </h4>

              {/* Asset Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-white bg-gradient-to-r from-blue-600 to-blue-700 px-3 py-1.5 rounded-lg">AAPL</span>
                  <span className="text-sm text-slate-500">— Apple Inc.</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">8 articles</span>
                  <span className="font-semibold text-blue-600 text-sm">12.5%</span>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-gradient-to-r from-slate-50 to-blue-50/30 rounded-xl p-4 border border-slate-100 mb-3">
                <p className="text-slate-600 text-sm leading-relaxed">
                  Apple’s AI and Services strategy remains in focus. Analysts are upbeat ahead of earnings with emphasis on iPhone demand and subscription growth.
                </p>
              </div>

              {/* Article Links */}
              <div className="space-y-2">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-white hover:bg-blue-50 border border-slate-100 transition-all cursor-pointer group">
                  <span className="text-blue-500 mt-0.5">→</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-slate-800 group-hover:text-blue-700 font-medium">Apple&apos;s AI Push Could Drive Services Revenue Growth</span>
                    <span className="text-xs text-slate-400 block mt-0.5">Reuters</span>
                  </div>
                  <svg className="w-4 h-4 text-slate-300 group-hover:text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-white hover:bg-blue-50 border border-slate-100 transition-all cursor-pointer group">
                  <span className="text-blue-500 mt-0.5">→</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-slate-800 group-hover:text-blue-700 font-medium">iPhone Demand Remains Strong Ahead of Q1 Results</span>
                    <span className="text-xs text-slate-400 block mt-0.5">Bloomberg</span>
                  </div>
                  <svg className="w-4 h-4 text-slate-300 group-hover:text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </div>
              </div>

              {/* Expanded Sources - Scrollable box for this asset only */}
              <div className="mt-3">
                <div className="text-xs text-slate-500 font-medium mb-2">+ 6 more sources for AAPL:</div>
                <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-2 space-y-2">
                  <div className="flex items-start gap-3 p-2.5 rounded-lg bg-white hover:bg-blue-50 border border-slate-100 transition-all cursor-pointer group">
                    <span className="text-blue-400 mt-0.5 text-sm">→</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-slate-800 group-hover:text-blue-700 font-medium line-clamp-1">Apple Vision Pro Sales Exceed Expectations in Key Markets</span>
                      <span className="text-xs text-slate-400 block">CNBC</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-2.5 rounded-lg bg-white hover:bg-blue-50 border border-slate-100 transition-all cursor-pointer group">
                    <span className="text-blue-400 mt-0.5 text-sm">→</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-slate-800 group-hover:text-blue-700 font-medium line-clamp-1">Analysts Raise Price Targets Ahead of Earnings Report</span>
                      <span className="text-xs text-slate-400 block">MarketWatch</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-2.5 rounded-lg bg-white hover:bg-blue-50 border border-slate-100 transition-all cursor-pointer group">
                    <span className="text-blue-400 mt-0.5 text-sm">→</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-slate-800 group-hover:text-blue-700 font-medium line-clamp-1">iPhone 16 Production Ramps Up in India Manufacturing</span>
                      <span className="text-xs text-slate-400 block">WSJ</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-2.5 rounded-lg bg-white hover:bg-blue-50 border border-slate-100 transition-all cursor-pointer group">
                    <span className="text-blue-400 mt-0.5 text-sm">→</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-slate-800 group-hover:text-blue-700 font-medium line-clamp-1">Apple Music Subscriber Growth Accelerates in Q4</span>
                      <span className="text-xs text-slate-400 block">TechCrunch</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <p className="text-center text-sm text-slate-500 mt-8">
            This is a sample briefing. Your briefing will be personalized to your portfolio.
          </p>
        </div>
      </div>

      {/* Contact Section */}
      <div id="contact" className="py-24 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-sm font-semibold text-black uppercase tracking-wider mb-3">
              Get In Touch
            </h2>
            <p className="text-4xl font-bold text-black">
              Contact Us
            </p>
          </div>
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
            <form
              action="https://formspree.io/f/xkoreovg"
              method="POST"
              className="space-y-6"
            >
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-black mb-2">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  id="email"
                  required
                  placeholder="you@email.com"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-slate-50 focus:bg-white text-black placeholder:text-slate-500"
                />
              </div>
              <div>
                <label htmlFor="message" className="block text-sm font-semibold text-black mb-2">
                  Message
                </label>
                <textarea
                  name="message"
                  id="message"
                  required
                  rows={5}
                  placeholder="Your message here..."
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all resize-y bg-slate-50 focus:bg-white text-black placeholder:text-slate-500"
                />
              </div>
              <button
                type="submit"
                className="w-full py-4 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
              >
                Send Message
              </button>
            </form>
          </div>
          <p className="text-center mt-8 text-black">
            Or email us directly at{' '}
            <a
              href="mailto:rishikkolpekwar@gmail.com"
              className="text-blue-600 hover:text-blue-700 font-medium hover:underline"
            >
              rishikkolpekwar@gmail.com
            </a>
          </p>
        </div>
      </div>

      {/* CTA Section */}
      <div className="py-24 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50"></div>
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl"></div>

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
            Start Your Free Trial
          </h2>
          <p className="text-xl text-slate-300 mb-10 max-w-2xl mx-auto">
            Join investors who start their day with Market Intelligence.
            Get personalized briefings delivered to your inbox.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-10 py-4 bg-white text-slate-900 font-semibold rounded-xl hover:bg-slate-100 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-0.5"
          >
            Sign Up with Google
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-12 bg-slate-900 border-t border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-xl">📈</span>
              <span className="text-white font-semibold">Market Intelligence</span>
            </div>
            <p className="text-slate-400 text-sm">
              © 2026 Market Intelligence. All rights reserved.
            </p>
            <div className="flex gap-8">
              <Link href="#contact" className="text-slate-400 text-sm hover:text-white transition-colors">
                Contact
              </Link>
              <Link href="/privacy" className="text-slate-400 text-sm hover:text-white transition-colors">
                Privacy
              </Link>
              <Link href="/terms" className="text-slate-400 text-sm hover:text-white transition-colors">
                Terms
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
