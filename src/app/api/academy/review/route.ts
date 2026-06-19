import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { getServerSession } from "@/lib/auth";
import { rateLimit } from '@/lib/rate-limit';
import { withTracing } from '@/lib/observability';

export const runtime = 'nodejs';

async function getHandler(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clientId = req.headers.get('x-forwarded-for') || session.user.id;
  const { allowed } = await rateLimit(clientId);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

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
  } catch (error: unknown) {
    console.error('Review fetch error:', error);
    // FIX-SEC-019: Hide error details in production
    return NextResponse.json({ error: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? (error instanceof Error ? error.message : String(error)) : 'Error interno del servidor' }, { status: 500 });
  }
}

export const GET = withTracing(getHandler, 'GET /api/academy/review');
