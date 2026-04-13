import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { calculateSM2 } from '@/lib/academy/sm2';
import { getServerSession } from "@/lib/auth";

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const session = await getServerSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const { score } = await req.json(); // 0-5
  const { cardId } = await params;

  try {
    // 1. Get current progress
    const { data: progress } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('card_id', cardId)
      .single();

    const current = progress || {
      ease_factor: 2.5,
      interval_days: 1,
      repetitions: 0,
      mastery_score: 0
    };

    // 2. Calculate new SM2 values
    const result = calculateSM2(
        score,
        current.ease_factor,
        current.interval_days,
        current.repetitions
    );

    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + result.interval_days);

    // Mastery score calculation
    const oldMastery = current.mastery_score || 0;
    const newMastery = Math.min(100, (oldMastery * 0.8) + (score * 20 * 0.2));

    // 3. Upsert progress
    const { error: upsertError } = await supabase
      .from('user_progress')
      .upsert({
        user_id: userId,
        card_id: cardId,
        ease_factor: result.ease_factor,
        interval_days: result.interval_days,
        repetitions: result.repetitions,
        next_review: nextReview.toISOString().split('T')[0],
        last_review: new Date().toISOString(),
        mastery_score: newMastery
      });

    if (upsertError) throw upsertError;

    return NextResponse.json({ success: true, result, newMastery });
  } catch (error: any) {
    console.error('Evaluation error:', error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
