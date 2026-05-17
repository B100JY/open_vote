import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:open_vote/core/theme/app_theme.dart';
import 'package:open_vote/data/services/auth_service.dart';
import 'package:open_vote/data/models/election.dart';
import 'package:open_vote/data/repositories/election_repository.dart';

/// 투표 화면 - 후보자 선택 및 투표 제출
class VoteScreen extends StatefulWidget {
  const VoteScreen({super.key});

  @override
  State<VoteScreen> createState() => _VoteScreenState();
}

class _VoteScreenState extends State<VoteScreen> {
  final _authService = AuthService(supabase: Supabase.instance.client);
  final _electionRepository = ElectionRepository(supabase: Supabase.instance.client);
  
  String? _electionId;
  String? _authCode;
  String? _phoneSuffix;
  Election? _election;
  
  bool _isLoading = false;
  String? _selectedCandidate;
  String? _error;
  List<Map<String, dynamic>> _candidates = [];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final args = ModalRoute.of(context)?.settings.arguments as Map<String, dynamic>?;
    _electionId = args?['electionId'] as String?;
    _authCode = args?['code'] as String?;
    _phoneSuffix = args?['phoneSuffix'] as String?;
    
    if (_electionId != null) {
      _loadElection();
    }
  }

  Future<void> _loadElection() async {
    if (_electionId == null) return;

    try {
      final election = await _electionRepository.getElection(_electionId!);
      if (mounted && election != null) {
        setState(() {
          _election = election;
          _candidates = election.candidates;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = '선거 정보를 불러오는데 실패했습니다.';
        });
      }
    }
  }

  Future<void> _submitVote() async {
    if (_selectedCandidate == null) {
      setState(() {
        _error = '후보자를 선택해주세요.';
      });
      return;
    }

    // 확인 다이얼로그 표시
    final confirmed = await _showConfirmationDialog();
    
    if (!confirmed || !mounted) {
      return;
    }

    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      await _authService.vote(
        electionId: _electionId!,
        code: _authCode!,
        phoneSuffix: _phoneSuffix!,
        selectedCandidate: _selectedCandidate!,
      );

      if (mounted) {
        // 투표 성공 - 결과 화면으로 이동 (또는 감사 화면)
        Navigator.pushReplacementNamed(context, '/vote-complete');
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = _getErrorMessage(e.toString());
          _isLoading = false;
        });
      }
    }
  }

  Future<bool> _showConfirmationDialog() async {
    final candidateName = _candidates.firstWhere(
      (c) => c['id'] == _selectedCandidate,
      orElse: () => {'name': '후보자'},
    )['name'] as String;

    final confirmed = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.how_to_vote, color: AppTheme.primaryColor),
            SizedBox(width: 8),
            Text('투표 확인'),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '정말로 아래 후보자에게 투표하시겠습니까?',
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppTheme.primaryColor.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppTheme.primaryColor.withOpacity(0.3)),
              ),
              child: Column(
                children: [
                  Text(
                    '선택한 후보자',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Colors.grey.shade600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    candidateName,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: AppTheme.primaryColor,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Text(
              '⚠️ 한번 제출한 투표는 취소할 수 없습니다.',
              style: TextStyle(
                color: Colors.orange.shade700,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('취소'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primaryColor,
              foregroundColor: Colors.white,
            ),
            child: const Text('투표하기'),
          ),
        ],
      ),
    );

    return confirmed ?? false;
  }

  String _getErrorMessage(String error) {
    if (error.contains('already used')) {
      return '이미 사용된 인증코드입니다.';
    } else if (error.contains('not active')) {
      return '이 선거는 현재 진행 중이 아닙니다.';
    } else if (error.contains('Invalid')) {
      return '인증코드를 확인해주세요.';
    }
    return '투표 제출 중 오류가 발생했습니다. 관리자에게 문의하세요.';
  }

  @override
  Widget build(BuildContext context) {
    if (_election == null && !_isLoading) {
      return Scaffold(
        appBar: AppBar(title: const Text('투표하기')),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.error_outline, size: 64, color: Colors.grey.shade400),
              const SizedBox(height: 16),
              Text(_error ?? '선거 정보를 불러올 수 없습니다.'),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('투표하기'),
        actions: [
          if (_election != null)
            Padding(
              padding: const EdgeInsets.only(right: 16),
              child: Center(
                child: Text(
                  _election!.name,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
                ),
              ),
            ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                // 선거 정보 카드
                if (_election != null) ...[
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Card(
                      color: AppTheme.primaryColor.withOpacity(0.05),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Row(
                          children: [
                            Icon(Icons.info_outline, color: AppTheme.primaryColor),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    '선거 안내',
                                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                                      color: AppTheme.primaryColor,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  Text(
                                    '한 명에게만 투표할 수 있습니다.',
                                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                      color: Colors.grey.shade600,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],

                // 오류 메시지
                if (_error != null) ...[
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.red.shade50,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.red.shade200),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.error_outline, color: Colors.red.shade700),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              _error!,
                              style: TextStyle(color: Colors.red.shade700),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                ],

                // 후보자 목록
                Expanded(
                  child: ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: _candidates.length,
                    itemBuilder: (context, index) {
                      final candidate = _candidates[index];
                      final candidateId = candidate['id'] as String;
                      final candidateName = candidate['name'] as String;
                      final description = candidate['description'] as String?;

                      return Card(
                        margin: const EdgeInsets.only(bottom: 12),
                        child: RadioListTile<String>(
                          value: candidateId,
                          groupValue: _selectedCandidate,
                          onChanged: (value) {
                            setState(() {
                              _selectedCandidate = value;
                              _error = null;
                            });
                          },
                          title: Text(
                            candidateName,
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          subtitle: description != null
                              ? Text(
                                  description,
                                  style: TextStyle(color: Colors.grey.shade600),
                                )
                              : null,
                          activeColor: AppTheme.primaryColor,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 8,
                          ),
                        ),
                      );
                    },
                  ),
                ),

                // 투표 제출 버튼
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.05),
                        blurRadius: 10,
                        offset: const Offset(0, -2),
                      ),
                    ],
                  ),
                  child: SafeArea(
                    child: SizedBox(
                      height: 56,
                      child: ElevatedButton(
                        onPressed: _selectedCandidate == null || _isLoading
                            ? null
                            : _submitVote,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.primaryColor,
                          foregroundColor: Colors.white,
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: _isLoading
                            ? const SizedBox(
                                height: 24,
                                width: 24,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                                ),
                              )
                            : const Text(
                                '투표하기',
                                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                              ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  @override
  void dispose() {
    super.dispose();
  }
}
