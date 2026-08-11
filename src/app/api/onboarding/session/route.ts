import { getActiveOnboardingSession } from "@/lib/db-queries";

/** Lets the onboarding chat resume an in-progress conversation after a reload instead of starting over. */
export async function GET() {
  try {
    const session = await getActiveOnboardingSession();
    return Response.json({ session });
  } catch (error) {
    console.error("onboarding session fetch error", error);
    return Response.json(
      { error: "セッションの取得中にエラーが発生しました。" },
      { status: 502 },
    );
  }
}
