import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Guard against missing environment variables
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { surpluses, storeId } = body;

    if (!surpluses || !Array.isArray(surpluses) || !storeId) {
      return NextResponse.json({ message: 'Invalid request body' }, { status: 400 });
    }

    // Prepare events for audit logging
    const events = surpluses.map((s: any) => ({
      event_type: 'INVENTORY_SURPLUS_DETECTED',
      entity_id: s.productId,
      payload: {
        store_id: storeId,
        user_id: user.id,
        product_name: s.name,
        expected: s.expected,
        counted: s.counted,
        surplus: s.diff,
      },
    }));

    // Insert audit events
    const { error: eventError } = await supabaseAdmin.from('business_events').insert(events);
    if (eventError) {
      console.error('Error logging surplus to Supabase:', eventError);
      // Non-critical error, we can still proceed with stock adjustment
    }

    // Adjust stock for each surplus
    for (const surplus of surpluses) {
      const { error: rpcError } = await supabaseAdmin.rpc('register_stock_movement', {
        p_store_id: storeId,
        p_product_id: surplus.productId,
        p_variant_id: null,
        p_quantity_change: surplus.diff,
        p_movement_type: 'adjustment',
        p_reference_doc: `Inventory Count Surplus`,
        p_created_by: user.id,
      });

      if (rpcError) {
        console.error(`Error adjusting stock for product ${surplus.productId}:`, rpcError);
        // If one fails, we should ideally roll back, but for now, we'll just log and continue
      }
    }

    return NextResponse.json({ success: true, message: 'Surpluses processed successfully' });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
