import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

/**
 * Auth callback handler — processes the OAuth redirect from Google.
 * Exchanges the authorization code for a session, then redirects to the app.
 */
export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    const nextParam = searchParams.get('next') ?? '/';
    // Prevent open redirect — only allow relative paths
    const next = (!nextParam.startsWith('/') || nextParam.startsWith('//') || nextParam.includes('://')) ? '/' : nextParam;

    // Handle error redirects from Supabase
    if (error) {
        logger.error('auth', 'Supabase auth error', { error, errorDescription });
        const loginUrl = new URL('/login', origin);
        loginUrl.searchParams.set('error', errorDescription || error);
        return NextResponse.redirect(loginUrl.toString());
    }

    if (code) {
        const supabase = await createClient();
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (!exchangeError) {
    // Restrict access to @mykitsch.com emails only
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email?.endsWith('@mykitsch.com')) {
        await supabase.auth.signOut();
        const loginUrl = new URL('/login', origin);
        loginUrl.searchParams.set('error', 'Access restricted to Kitsch team members only.');
        return NextResponse.redirect(loginUrl.toString());
    }

    logger.info('auth', 'Session exchange successful', { redirect: next });
    return NextResponse.redirect(`${origin}${next}`);
}

