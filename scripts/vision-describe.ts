#!/usr/bin/env npx tsx
/**
 * Relay Asset Manager — Vision Description Script
 *
 * Analyzes each asset thumbnail with Gemini Vision and saves
 * a visual description to the database for better semantic search.
 *
 * Usage: npx tsx scripts/vision-describe.ts
 *
 * Safe to run multiple times — skips already-described assets.
 * Respects the free tier limit of 1,500 requests/day.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

const GEMINI_VISION_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const DAILY_LIMIT = 5;
const REQUEST_DELAY_MS = 4500;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
    global: {
        headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
    },
});

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function log(msg: string) {
    const ts = new Date().toLocaleTimeString();
    console.log(`[${ts}] ${msg}`);
}

async function describeImage(base64: string, mimeType: string, assetName: string): Promise<string | null> {
    const prompt = `You are a creative asset librarian for Kitsch, a beauty and hair care brand. Your job is to generate rich, detailed search descriptions by combining visual analysis of the image with context extracted from the filename.

FILENAME CONTEXT (extract what you can):
Filename: ${assetName}
- Extract any SKU numbers (sequences of 4-5 digits)
- Extract product name by splitting CamelCase and hyphens into readable words
- Extract dimensions if present (e.g. 1280x1280, 2000x2000)
- Extract resolution if present (e.g. 72dpi, 300dpi)
- Extract any variant codes (e.g. Opt1, Opt2, A, B)

VISUAL ANALYSIS (analyze the image carefully):
- PRODUCT: What exact Kitsch product is shown? Be specific (e.g. solid coconut oil shampoo bar, microfiber leopard print hair towel, luxe shower cap with stripe pattern)
- ASSET TYPE: lifestyle photo, ecomm product shot, flat lay, group shot, infographic, packaging design, CAD drawing, tech pack, certificate, social media graphic, hero shot
- PACKAGING COLOR: What color is the packaging or product? Be specific (e.g. terracotta orange, sage green, cream white, dusty pink, navy blue, warm beige)
- BACKGROUND: Describe background precisely (e.g. clean white studio, warm cream gradient, soft beige, lifestyle bathroom setting, outdoor natural)
- DOMINANT COLORS: List the 3-5 most prominent colors in the entire image
- MODEL: If a model appears — describe hair type (straight, curly, wavy), hair color, skin tone, expression, pose, body part shown. If no model, write "no model"
- INGREDIENTS: If any ingredients are visible on packaging, list them (e.g. coconut oil, rosemary, biotin, rice water, shea butter)
- CERTIFICATIONS: Any visible certifications or badges (e.g. Leaping Bunny, cruelty free, vegan, CA Right to Know)
- COMPOSITION: portrait, landscape, square, overhead flat lay, 45 degree angle, hero shot, multiple products, single product
- MOOD: clean and minimal, warm and cozy, bright editorial, soft natural light, dramatic, playful, professional
- ADDITIONAL ELEMENTS: any props, accessories, or notable visual details (e.g. water droplets, hair tools, bathroom accessories, flowers, towels)

OUTPUT FORMAT:
Write a single detailed paragraph of 150-200 words that naturally incorporates all the above information. Start with the SKU and product name, then describe what you see visually. Write in a way that would help someone find this image by searching for any of its visual or product characteristics.`;

    try {
        const res = await fetch(`${GEMINI_VISION_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { inline_data: { mime_type: mimeType, data: base64 } },
                        { text: prompt }
                    ]
                }],
                generationConfig: { maxOutputTokens: 1200, temperature: 0.2 }
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            log(`  ❌ Gemini error ${res.status}: ${err.slice(0, 150)}`);
            return null;
        }

        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
    } catch (err: any) {
        log(`  ❌ Request failed: ${err.message}`);
        return null;
    }
}

async function main() {
    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║  Relay Asset Manager — Vision Describe   ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log('');

    if (!GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY');
    if (!SUPABASE_SERVICE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

    log('🔍 Fetching assets that need visual descriptions...');

    const toDescribe: any[] = [];
    let from = 0;

    while (true) {
        const { data, error } = await supabase
            .from('assets')
            .select('id, drive_file_id, name, description, thumbnail_url')
            .eq('is_active', true)
            .eq('asset_type', 'photo')
            .not('thumbnail_url', 'is', null)
            .range(from, from + 999);

        if (error) { log(`❌ ${error.message}`); break; }
        if (!data || data.length === 0) break;

        const filtered = data.filter((a: any) =>
            !a.description || !a.description.startsWith('[vision]')
        );
        toDescribe.push(...filtered);
        if (data.length < 1000) break;
        from += 1000;
    }

    log(`📊 Found ${toDescribe.length} assets needing visual descriptions`);

    if (toDescribe.length === 0) {
        log('✅ All assets already have visual descriptions!');
        return;
    }

    const toProcess = toDescribe.slice(0, DAILY_LIMIT);
    if (toDescribe.length > DAILY_LIMIT) {
        log(`⚠️  Daily limit: processing ${toProcess.length} of ${toDescribe.length} today`);
    }

    const estimatedMinutes = Math.ceil(toProcess.length * REQUEST_DELAY_MS / 60000);
    log(`🚀 Starting analysis of ${toProcess.length} images (~${estimatedMinutes} min)`);
    console.log('');

    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < toProcess.length; i++) {
        const asset = toProcess[i];
        const tag = `[${i + 1}/${toProcess.length}]`;

        // Download thumbnail
        let thumbData: ArrayBuffer | null = null;
        let actualMime = 'image/jpeg';

        for (const tp of [`custom_${asset.drive_file_id}.webp`, `${asset.drive_file_id}.webp`]) {
            const { data: td, error: te } = await supabase.storage
                .from('thumbnails')
                .download(tp);

            if (!te && td) {
                thumbData = await td.arrayBuffer();
                const buf = Buffer.from(thumbData);
                const hex = buf.slice(0, 4).toString('hex');
                actualMime = hex.startsWith('ffd8') ? 'image/jpeg'
                    : hex.startsWith('8950') ? 'image/png'
                    : 'image/jpeg';
                break;
            }
        }

        if (!thumbData) {
            log(`${tag} ⏭️  No thumbnail: ${asset.name.slice(0, 50)}`);
            skipped++;
            continue;
        }

        const base64 = Buffer.from(thumbData).toString('base64');
        const description = await describeImage(base64, actualMime, asset.name);

        if (!description) {
            log(`${tag} ❌ Failed: ${asset.name.slice(0, 50)}`);
            failed++;
            await sleep(REQUEST_DELAY_MS);
            continue;
        }

        const { error: updateErr } = await supabase
            .from('assets')
            .update({
                description: `[vision] ${description}`,
                embedding: null,
            })
            .eq('id', asset.id);

        if (updateErr) {
            log(`${tag} ❌ DB error: ${updateErr.message}`);
            failed++;
        } else {
            log(`${tag} ✅ ${asset.name.slice(0, 45)}`);
            log(`       → ${description.slice(0, 90)}`);
            succeeded++;
        }

        await sleep(REQUEST_DELAY_MS);
    }

    console.log('');
    log(`🎉 Done! ${succeeded} described, ${failed} failed, ${skipped} skipped`);

    if (toDescribe.length > DAILY_LIMIT) {
        log(`📅 ${toDescribe.length - DAILY_LIMIT} remaining — run again tomorrow`);
    }

    console.log('');
    log('Next step: go to the app → Sync & Settings → Sync Now');
    log('This will re-embed all newly described assets.');
}

main().catch((err) => {
    console.error('❌ Failed:', err.message);
    process.exit(1);
});
