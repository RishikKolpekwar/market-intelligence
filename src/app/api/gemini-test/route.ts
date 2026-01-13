import { NextResponse } from "next/server";
import { callGemini } from "@/lib/llm/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/gemini-test
 * Simple smoke test to verify Gemini API is working
 */
export async function GET() {
  console.log("🧪 Testing Gemini API...");
  console.log("🔑 GEMINI_API_KEY exists?", !!process.env.GEMINI_API_KEY);
  console.log("🔑 GEMINI_API_KEY length:", process.env.GEMINI_API_KEY?.length);

  try {
    const result = await callGemini("Reply with exactly: OK");
    console.log("✅ Gemini test successful!");
    return NextResponse.json({
      ok: true,
      text: result.text,
      message: "Gemini API is working correctly"
    });
  } catch (e) {
    console.error("❌ Gemini test failed:", e);
    if (e instanceof Error) {
      console.error("Error message:", e.message);
      console.error("Error stack:", e.stack);
    }
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        details: "Check server terminal for full error details"
      },
      { status: 500 }
    );
  }
}
