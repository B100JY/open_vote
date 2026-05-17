import 'package:supabase_flutter/supabase_flutter.dart';

/// 인증 결과 모델
class AuthResult {
  final bool isValid;
  final String? errorMessage;

  AuthResult({required this.isValid, this.errorMessage});

  factory AuthResult.success() => AuthResult(isValid: true);
  factory AuthResult.failure(String message) => AuthResult(isValid: false, errorMessage: message);
}

class AuthService {
  final SupabaseClient supabase;

  AuthService({required this.supabase});

  /// 인증코드와 전화번호 뒷자리를 검증하고 상세 결과 반환
  Future<AuthResult> validateCodeWithDetails({
    required String electionId,
    required String code,
    required String phoneSuffix,
  }) async {
    try {
      final response = await supabase
          .from('voter_codes')
          .select()
          .eq('code', code)
          .eq('phone_suffix', phoneSuffix)
          .eq('is_used', false)
          .eq('election_id', electionId)
          .maybeSingle();

      if (response == null) {
        return AuthResult.failure('인증코드 또는 전화번호 뒷자리를 확인해주세요.');
      }

      return AuthResult.success();
    } on PostgrestException catch (e) {
      return AuthResult.failure('인증 처리 중 오류가 발생했습니다: ${e.message}');
    } catch (e) {
      return AuthResult.failure('인증 처리 중 오류가 발생했습니다.');
    }
  }

  /// 간단한 인증 코드 검증 (기존 호환용)
  Future<bool> validateCode({
    required String electionId,
    required String code,
    required String phoneSuffix,
  }) async {
    final result = await validateCodeWithDetails(
      electionId: electionId,
      code: code,
      phoneSuffix: phoneSuffix,
    );
    return result.isValid;
  }

  /// 투표 제출 (Supabase Edge Function 호출)
  Future<void> vote({
    required String electionId,
    required String code,
    required String phoneSuffix,
    required String selectedCandidate,
  }) async {
    final response = await supabase.functions.invoke(
      'cast_vote',
      body: {
        'election_id': electionId,
        'code': code,
        'phone_suffix': phoneSuffix,
        'selected_candidate': selectedCandidate,
      },
    );

    if (response.status >= 400) {
      final errorMessage = response.data['error'] as String? ?? 'Vote failed';
      throw Exception(errorMessage);
    }
  }

  /// 직접 투표 처리 (Edge Function 대안)
  Future<void> castVoteDirect({
    required String electionId,
    required String code,
    required String phoneSuffix,
    required String selectedCandidate,
  }) async {
    final response = await supabase.functions.invoke(
      'cast_vote',
      body: {
        'election_id': electionId,
        'code': code,
        'phone_suffix': phoneSuffix,
        'selected_candidate': selectedCandidate,
      },
    );

    if (response.status >= 400) {
      throw Exception(response.data['error'] ?? 'Vote failed');
    }
  }
}
