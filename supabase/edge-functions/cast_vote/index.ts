// =====================================================
// Open Vote: Cast Vote Edge Function
// 익명 투표 처리 (Supabase Edge Function)
// =====================================================
//
// 핵심 보안 설계:
// 1. 인증 코드 검증 (존재 + 미사용 + 선거 활성 상태)
// 2. 인증 코드 사용 완료 처리
// 3. 익명 기표 삽입
// 4. 위 2-3 이 단일 트랜잭션 내에서 실행됨 (atomic)
// 5. voter_codes 와 ballots 사이에 어떤 연결 고리도 없음 (FK 없음)
// 6. Rate Limiting 으로 무차별 대입 공격 방지
//
// =====================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Rate limit configuration
const MAX_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }

  const clientIP = req.headers.get('x-forwarded-for') || 'unknown';

  try {
    const body = await req.json();
    const { election_id, code, phone_suffix, selected_candidate } = body;

    // Validate required fields
    if (!election_id || !code || !phone_suffix || !selected_candidate) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'missing_fields',
          message: '필수 항목이 누락되었습니다.' 
        }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Validate code format (6 digits)
    if (!/^\d{6}$/.test(code)) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'invalid_code_format',
          message: '인증코드는 6 자리 숫자여야 합니다.' 
        }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Validate phone suffix format (4 digits)
    if (!/^\d{4}$/.test(phone_suffix)) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'invalid_phone_format',
          message: '전화번호 뒷자리는 4 자리 숫자여야 합니다.' 
        }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Check rate limit
    const rateLimitCheck = await checkRateLimit(clientIP, 'cast_vote');
    if (rateLimitCheck.blocked) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'rate_limit_exceeded',
          message: `너무 많은 시도로 인해 ${rateLimitCheck.remainingSeconds}초간 인증할 수 없습니다.`,
          retryAfter: rateLimitCheck.remainingSeconds
        }),
        { status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Create Supabase client with service role (bypass RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Use database function for atomic anonymous voting
    const { data: result, error: rpcError } = await supabase.rpc('cast_anonymous_vote', {
      p_election_id: election_id,
      p_code: code,
      p_phone_suffix: phone_suffix,
      p_selected_candidate: selected_candidate
    });

    if (rpcError) {
      console.error('RPC error:', rpcError);
      
      // Record failed attempt for rate limiting
      await recordFailedAttempt(clientIP, 'cast_vote');

      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'database_error',
          message: '투표 처리 중 오류가 발생했습니다.' 
        }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Check result from database function
    const voteResult = result as any;
    
    if (!voteResult.success) {
      // Record failed attempt for rate limiting
      await recordFailedAttempt(clientIP, 'cast_vote');

      // Map error codes to HTTP status
      let statusCode = 400;
      if (voteResult.error === 'election_not_active') {
        statusCode = 403;
      } else if (voteResult.error === 'invalid_code') {
        statusCode = 401;
      }

      return new Response(
        JSON.stringify({ 
          success: false,
          error: voteResult.error,
          message: voteResult.message 
        }),
        { status: statusCode, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Success!
    return new Response(
      JSON.stringify({ 
        success: true,
        message: voteResult.message || '투표가 완료되었습니다.' 
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );

  } catch (error) {
    console.error('Edge function error:', error);
    
    // Record failed attempt for rate limiting
    await recordFailedAttempt(clientIP, 'cast_vote').catch(console.error);

    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'internal_error',
        message: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
});

// =====================================================
// Rate Limiting Helper Functions
// =====================================================

async function checkRateLimit(ip: string, endpoint: string): Promise<{
  blocked: boolean;
  remainingSeconds: number;
}> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('rate_limits')
    .select('blocked_until, attempt_count')
    .eq('ip_address', ip)
    .eq('endpoint', endpoint)
    .order('last_attempt_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return { blocked: false, remainingSeconds: 0 };
  }

  if (data.blocked_until) {
    const blockedUntil = new Date(data.blocked_until).getTime();
    const now = Date.now();
    
    if (blockedUntil > now) {
      const remainingSeconds = Math.ceil((blockedUntil - now) / 1000);
      return { blocked: true, remainingSeconds };
    }
  }

  return { blocked: false, remainingSeconds: 0 };
}

async function recordFailedAttempt(ip: string, endpoint: string): Promise<void> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Use database function to record attempt
  const { error } = await supabase.rpc('record_rate_limit_attempt', {
    p_ip_address: ip,
    p_endpoint: endpoint,
    p_max_attempts: MAX_ATTEMPTS,
    p_block_duration_ms: BLOCK_DURATION_MS
  });

  if (error) {
    console.error('Failed to record rate limit attempt:', error);
  }
}
