import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

type Role = 'admin' | 'editor' | 'viewer';

export async function requireRole(allowedRoles: Role[]) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('email', user.email)
        .single();

    const role = roleData?.role as Role ?? 'viewer';

    if (!allowedRoles.includes(role)) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    return null;
}
