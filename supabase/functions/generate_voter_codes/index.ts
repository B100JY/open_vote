// =====================================================
// Open Vote: Generate Voter Codes Edge Function
// 인증 코드 일괄 생성 (Supabase Edge Function)
// =====================================================
//
// 핵심 기능:
// 1. 선거 ID 와 생성할 코드 수량을 입력받음
// 2. 중복 없는 6 자리 랜덤 인증코드 생성 (crypto-safe)
// 3. 전화번호 뒷자리도 함께 생성 (본인 확인용)
// 4. voter_codes 테이블에 일괄 삽입
// 5. 생성된 코드 리스트를 반환
//
// 보안:
// - service_role 키 사용 (RLS 우회)
// - 관리자만 호출 가능 (auth 체크 필요)
// - 생성된 코드는 즉시 암호화되어 저장됨
//
// =====================================================

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

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
      { 
        status: 405, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    );
  }

  try {
    const { election_id, count, phone_suffixes } = await req.json();

    // Validate required fields
    if (!election_id) {
      return new Response(
        JSON.stringify({ error: 'election_id is required' }),
        { 
          status: 400, 
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    const codeCount = parseInt(count, 10);
    if (isNaN(codeCount) || codeCount <= 0) {
      return new Response(
        JSON.stringify({ error: 'Count must be a positive integer' }),
        { 
          status: 400, 
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    if (codeCount > 10000) {
      return new Response(
        JSON.stringify({ error: 'Maximum 10000 codes can be generated at once' }),
        { 
          status: 400, 
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    // Create Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify election exists
    const { data: election, error: electionError } = await supabase
      .from('elections')
      .select('id, name, status, created_by')
      .eq('id', election_id)
      .single();

    if (electionError || !election) {
      return new Response(
        JSON.stringify({ error: 'Election not found' }),
        { 
          status: 404, 
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    // Check if election is in draft status (can only generate codes for draft elections)
    if (election.status !== 'draft') {
      return new Response(
        JSON.stringify({ 
          error: 'Cannot generate codes for non-draft election',
          message: '이미 진행 중이거나 종료된 선거에는 인증코드를 생성할 수 없습니다.'
        }),
        { 
          status: 403, 
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    // Generate voter codes using database function
    const { data: generatedCodes, error: generateError } = await supabase.rpc(
      'generate_voter_codes_batch',
      {
        p_election_id: election_id,
        p_count: codeCount,
        p_phone_suffixes: phone_suffixes || null
      }
    );

    if (generateError) {
      console.error('Generate codes error:', generateError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to generate voter codes',
          details: generateError.message 
        }),
        { 
          status: 500, 
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    // Update election total_voter_codes
    const { error: updateError } = await supabase
      .from('elections')
      .update({ 
        total_voter_codes: codeCount,
        updated_at: new Date().toISOString()
      })
      .eq('id', election_id);

    if (updateError) {
      console.error('Update election error:', updateError);
      // Non-critical error, continue
    }

    // Log the code generation event
    await supabase.from('audit_logs').insert({
      event_type: 'codes_generated',
      election_id: election_id,
      details: {
        count: codeCount,
        generated_at: new Date().toISOString()
      }
    });

    // Return success with generated codes
    return new Response(
      JSON.stringify({ 
        success: true,
        count: generatedCodes?.length || codeCount,
        codes: generatedCodes || [],
        election: {
          id: election.id,
          name: election.name
        }
      }),
      { 
        status: 200, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    );

  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    );
  }
});
