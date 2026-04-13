import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { getServerSession } from "@/lib/auth";

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const today = new Date().toISOString().split('T')[0];

  try {
    // 1. Get cards due for review
    const { data: dueCards, error: dueError } = await supabase
      .from('user_progress')
      .select('*, learning_cards(*)')
      .eq('user_id', userId)
      .lte('next_review', today);

    if (dueError) throw dueError;

    // 2. Get new cards (not in user_progress)
    const { data: newCards, error: newError } = await supabase.rpc('get_new_academy_cards', {
      p_user_id: userId,
      p_limit: 10
    });

    if (newError) throw newError;

    return NextResponse.json({
      due: dueCards || [],
      new: newCards || []
    });
  } catch (error: any) {
    console.error('Review fetch error:', error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
