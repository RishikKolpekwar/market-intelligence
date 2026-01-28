# Dashboard, Subscribe, and Home Page Theme Plan

Align the dashboard, subscribe page, and home page preview with the landing theme (deep navy/blue gradients, cyan accents, pill badges, consistent cards). Includes a clear division between "How It Works" and "Preview" on the home page, and an updated daily briefing preview.

---

## Theme tokens (from landing)

- **Hero gradient:** `from-slate-900 via-blue-900 to-slate-900`; dot overlay; blur orbs.
- **Pill:** `bg-white/10 backdrop-blur-sm border border-white/20`; green dot for tag.
- **Title:** "Market" white; "Intelligence" `bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent`.
- **Primary CTA:** `bg-gradient-to-r from-blue-500 to-cyan-500`, `rounded-xl`, white text, `shadow-lg shadow-blue-500/25`.
- **Secondary:** `bg-white/10 backdrop-blur-sm border border-white/20` rounded-xl.
- **Section label:** `text-sm font-semibold text-blue-600 uppercase tracking-wider`.
- **Cards:** white, `rounded-2xl`, `border border-slate-200`, gradient icon boxes (blue–cyan, violet–purple, emerald–teal).

---

## 1. Dashboard (`src/app/dashboard/page.tsx`)

- **Header:** Dark gradient bar (`from-slate-900 via-blue-900 to-slate-900`), optional dot/blur; title "Market" white, "Intelligence" cyan gradient; Settings/email in `text-slate-300`.
- **Background:** `bg-gradient-to-b from-slate-50 to-white` or keep light tint.
- **Actions:** Sync News = primary gradient (`from-blue-500 to-cyan-500`), Generate Briefing = secondary or violet gradient; both `rounded-xl`.
- **Stats cards:** White, `rounded-2xl`, `border-slate-200`; small gradient icons (blue, violet, emerald); optional uppercase label in `text-blue-600`.
- **Asset section:** Same card style; "+ Add Asset" = primary gradient; asset icons = blue–cyan gradient.
- **Modals:** Primary buttons = gradient `from-blue-500 to-cyan-500`, `rounded-xl`.

---

## 2. Subscribe (`src/app/subscribe/page.tsx`)

- **Hero block:** Same gradient + pill ("AI-powered market insights") + "Market Intelligence" title (white + cyan); subtitle for Premium.
- **Pricing block:** White card, `rounded-2xl`, `border-slate-200`; section label "Pricing" in blue-600 uppercase; CTA = primary gradient button; checkmarks `text-green-400`; footer `text-slate-500`.

---

## 3. Home page – division and daily briefing (`src/app/page.tsx`)

### 3a. Division between "How It Works" and "Preview"

- Add a clear visual break so the two sections don’t run together.
- **Options (pick one or combine):**
  - **A:** Give the Preview section a distinct container: e.g. wrap it in a div with `bg-white` and a **top border** (`border-t border-slate-200`) and/or slightly more top padding so the background and spacing separate "How It Works" from "Preview."
  - **B:** Insert a **divider strip** between the two sections: e.g. a full-width block with a thin gradient line (`h-px bg-gradient-to-r from-transparent via-blue-300 to-transparent`) or a short rule with a small centered label (e.g. "Preview" in a pill) and extra vertical spacing.
  - **C:** Change **background** so "How It Works" stays `bg-gradient-to-b from-slate-50 to-white` and the Preview section starts with a contrasting background (e.g. `bg-slate-100/50` or `bg-white`) plus a top border or subtle shadow to create a clear fold.
- **Recommendation:** Use A + C: end "How It Works" with the current gradient; start the Preview section with `className="py-24 bg-white border-t border-slate-200"` (or similar) so the border and white background clearly separate the two sections. Optionally add a thin decorative line (e.g. `max-w-24 mx-auto h-0.5 bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full`) above the "Preview" heading for extra emphasis.

### 3b. Update the daily briefing preview

- **Briefing header card:** Already uses the dark gradient; keep and ensure it matches the hero (same gradient, blur orb, pill-style tags). Optionally add the same dot-pattern overlay used in the hero for consistency.
- **Preview cards (Market Overview, Portfolio Holdings, Asset Analysis):** Align with "How It Works" card style: same `rounded-2xl`, `border-slate-200`, `shadow-sm` / `shadow-lg`; keep gradient icon boxes (blue–cyan, violet–purple, emerald–teal); ensure typography (section labels, body text) matches.
- **Content refresh:** Update sample copy so it feels current (e.g. brief market summary, sample holdings, and one asset analysis with 1–2 headline-style links). Keep structure; wording can be slightly modernized (e.g. "AI" and "earnings" focus). Optional: use a dynamic date for the briefing header (e.g. "Monday, January 27, 2026" from `new Date()` formatted) so it doesn’t feel stale.
- **Footer line:** Keep "This is a sample briefing. Your briefing will be personalized to your portfolio." in `text-slate-400` or `text-slate-500` for consistency.

---

## Files to modify

| File | Changes |
|------|---------|
| `src/app/dashboard/page.tsx` | Dark header, primary/secondary buttons, stats cards, card styles, modal buttons, asset icon gradient. |
| `src/app/subscribe/page.tsx` | Hero block (gradient, pill, title), pricing card and label, gradient CTA, checklist/footer colors. |
| `src/app/page.tsx` | Division between How It Works and Preview (border, background, optional decorative line); daily briefing preview styling and optional content/date refresh. |
