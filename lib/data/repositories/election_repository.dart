import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:open_vote/data/models/election.dart';
import 'package:open_vote/data/models/voter_code.dart';
import 'package:open_vote/data/services/csv_service.dart';

class ElectionRepository {
  final SupabaseClient supabase;

  ElectionRepository({required this.supabase});

  Future<List<Election>> getActiveElections() async {
    final response = await supabase
        .from('elections')
        .select()
        .eq('status', 'active')
        .order('created_at', ascending: false);

    return (response as List).map((json) => Election.fromJson(json)).toList();
  }

  /// 모든 선거 조회 (관리자용)
  Future<List<Election>> getAllElections() async {
    final response = await supabase
        .from('elections')
        .select()
        .order('created_at', ascending: false);

    return (response as List).map((json) => Election.fromJson(json)).toList();
  }

  Future<Election?> getElection(String id) async {
    final response = await supabase
        .from('elections')
        .select()
        .eq('id', id)
        .single();

    return Election.fromJson(response);
  }

  Future<Election> createElection({
    required String name,
    String? description,
    required List<Map<String, dynamic>> candidates,
    required int totalVoterCodes,
    DateTime? startsAt,
    DateTime? endsAt,
  }) async {
    final response = await supabase
        .from('elections')
        .insert({
          'name': name,
          'description': description,
          'candidates': candidates,
          'total_voter_codes': totalVoterCodes,
          'starts_at': startsAt?.toIso8601String(),
          'ends_at': endsAt?.toIso8601String(),
        })
        .select()
        .single();

    return Election.fromJson(response);
  }

  Future<void> updateElectionStatus(String id, String status) async {
    await supabase
        .from('elections')
        .update({'status': status})
        .eq('id', id);
  }

  Future<int> getVoteCount(String electionId) async {
    final response = await supabase
        .rpc('get_vote_count', params: {
          'p_election_id': electionId,
        });

    return response as int;
  }

  Future<List<VoterCode>> generateVoterCodes(String electionId, int count) async {
    final response = await supabase
        .rpc('generate_voter_codes', params: {
          'p_election_id': electionId,
          'p_count': count,
        });

    if (response is List) {
      return response
          .map((json) => VoterCode.fromJson(json as Map<String, dynamic>))
          .toList();
    }
    return [];
  }

  /// 투표에서 모든 인증코드를 가져옴
  Future<List<VoterCode>> getVoterCodesList(String electionId) async {
    final response = await supabase
        .from('voter_codes')
        .select()
        .eq('election_id', electionId)
        .order('created_at', ascending: true);

    return (response as List)
        .map((json) => VoterCode.fromJson(json as Map<String, dynamic>))
        .toList();
  }

  /// 인증코드를 CSV 파일로 다운로드
  Future<void> downloadVoterCodesCsv({
    required String electionId,
    required String electionName,
  }) async {
    final codes = await getVoterCodesList(electionId);
    final timestamp = DateTime.now().toString().replaceAll(RegExp(r'[:.]'), '-').split(' ')[0];
    final filename = 'voter_codes_${electionName}_$timestamp.csv';
    
    CsvService.downloadVoterCodes(
      filename: filename,
      codes: codes,
      electionName: electionName,
    );
  }

  /// 인증코드 사용 현황 가져오기
  Future<Map<String, int>> getVoterCodeStats(String electionId) async {
    final totalResponse = await supabase
        .from('voter_codes')
        .select()
        .eq('election_id', electionId);

    final usedResponse = await supabase
        .from('voter_codes')
        .select()
        .eq('election_id', electionId)
        .eq('is_used', true);

    return {
      'total': (totalResponse as List).length,
      'used': (usedResponse as List).length,
      'remaining': (totalResponse as List).length - (usedResponse as List).length,
    };
  }

  Stream<List<Map<String, dynamic>>> getBallotsStream(String electionId) {
    return supabase
        .from('ballots')
        .stream(primaryKey: ['id'])
        .eq('election_id', electionId);
  }

  Stream<List<Map<String, dynamic>>> getVoterCodesStream(String electionId) {
    return supabase
        .from('voter_codes')
        .stream(primaryKey: ['id'])
        .eq('election_id', electionId);
  }

  /// 선거 결과 집계
  Future<Map<String, dynamic>> getElectionResults(String electionId) async {
    final response = await supabase.rpc('get_vote_results', params: {
      'p_election_id': electionId,
    });

    return response as Map<String, dynamic>;
  }

  /// 선거 통계
  Future<Map<String, dynamic>> getElectionStats(String electionId) async {
    final response = await supabase.rpc('get_election_stats', params: {
      'p_election_id': electionId,
    });

    return response as Map<String, dynamic>;
  }
}
