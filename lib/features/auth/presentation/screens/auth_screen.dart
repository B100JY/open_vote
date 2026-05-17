import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:open_vote/core/theme/app_theme.dart';
import 'package:open_vote/data/services/auth_service.dart';
import 'package:open_vote/data/models/election.dart';
import 'package:open_vote/data/repositories/election_repository.dart';

/// 유권자 인증 화면 - 인증코드와 전화번호 뒷자리로 본인 확인
class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _codeController = TextEditingController();
  final _phoneSuffixController = TextEditingController();
  final _authService = AuthService(supabase: Supabase.instance.client);
  final _electionRepository = ElectionRepository(supabase: Supabase.instance.client);
  
  String? _electionId;
  Election? _election;
  bool _isAuthenticating = false;
  String? _error;
  int _failedAttempts = 0;
  DateTime? _lockedUntil;
  
  static const int maxAttempts = 5;
  static const int lockDurationMinutes = 15;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final args = ModalRoute.of(context)?.settings.arguments as Map<String, dynamic>?;
    _electionId = args?['electionId'] as String?;
    if (_electionId != null) {
      _loadElection();
    }
  }

  Future<void> _loadElection() async {
    if (_electionId == null) return;
    
    try {
      final election = await _electionRepository.getElection(_electionId!);
      if (mounted) {
        setState(() {
          _election = election;
        });
      }
    } catch (e) {
      // Election load error is non-critical, continue
    }
  }

  void _authenticate() async {
    if (_isLocked) {
      setState(() {
        _error = '너무 많은 시도로 인해 ${_getRemainingLockTime()}동안 인증할 수 없습니다.';
      });
      return;
    }

    final code = _codeController.text.trim();
    final phoneSuffix = _phoneSuffixController.text.trim();

    if (code.isEmpty || code.length != 6) {
      setState(() {
        _error = '인증코드 6 자리를 정확히 입력해주세요.';
      });
      return;
    }

    if (phoneSuffix.isEmpty || phoneSuffix.length != 4) {
      setState(() {
        _error = '전화번호 뒷자리 4 자리를 정확히 입력해주세요.';
      });
      return;
    }

    if (_electionId == null) {
      setState(() {
        _error = '선거 정보를 찾을 수 없습니다.';
      });
      return;
    }

    setState(() {
      _isAuthenticating = true;
      _error = null;
    });

    try {
      final result = await _authService.validateCodeWithDetails(
        electionId: _electionId!,
        code: code,
        phoneSuffix: phoneSuffix,
      );

      if (result.isValid && mounted) {
        // 성공적으로 인증되면 투표 화면으로 이동
        Navigator.pushReplacementNamed(
          context,
          '/vote',
          arguments: {
            'electionId': _electionId!,
            'code': code,
            'phoneSuffix': phoneSuffix,
          },
        );
      } else if (mounted) {
        _handleAuthFailure(result.errorMessage ?? '인증에 실패했습니다.');
      }
    } catch (e) {
      if (mounted) {
        _handleAuthFailure('인증 처리 중 오류가 발생했습니다.');
      }
    } finally {
      if (mounted) {
        setState(() {
          _isAuthenticating = false;
        });
      }
    }
  }

  void _handleAuthFailure(String errorMessage) {
    setState(() {
      _failedAttempts++;
      _error = errorMessage;
      
      if (_failedAttempts >= maxAttempts) {
        _lockedUntil = DateTime.now().add(Duration(minutes: lockDurationMinutes));
        _error = '너무 많은 시도로 인해 ${lockDurationMinutes}분간 인증할 수 없습니다.';
      } else {
        _error = '인증코드 또는 전화번호 뒷자리를 확인해주세요. (남은 시도: ${maxAttempts - _failedAttempts}회)';
      }
    });
  }

  bool get _isLocked {
    if (_lockedUntil == null) return false;
    return DateTime.now().isBefore(_lockedUntil!);
  }

  String _getRemainingLockTime() {
    if (_lockedUntil == null) return '';
    final remaining = _lockedUntil!.difference(DateTime.now());
    if (remaining.inMinutes > 0) {
      return '${remaining.inMinutes}분';
    }
    return '${remaining.inSeconds}초';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('유권자 인증'),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 32),
              // 선거 정보 표시
              if (_election != null) ...[
                Card(
                  color: AppTheme.primaryColor.withOpacity(0.05),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '선거명',
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Colors.grey.shade600,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          _election!.name,
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 24),
              ],
              
              // 인증 폼
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '본인 확인',
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        '부여받은 인증코드와 전화번호 뒷자리를 입력해주세요.',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: Colors.grey.shade600,
                        ),
                      ),
                      const SizedBox(height: 24),
                      TextField(
                        controller: _codeController,
                        enabled: !_isLocked && !_isAuthenticating,
                        decoration: InputDecoration(
                          labelText: '인증코드 (6 자리)',
                          border: const OutlineInputBorder(),
                          hintText: '6 자리 숫자를 입력하세요',
                          prefixIcon: const Icon(Icons.pin),
                        ),
                        maxLength: 6,
                        keyboardType: TextInputType.number,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 24,
                          letterSpacing: 8,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 16),
                      TextField(
                        controller: _phoneSuffixController,
                        enabled: !_isLocked && !_isAuthenticating,
                        decoration: InputDecoration(
                          labelText: '전화번호 뒷자리 (4 자리)',
                          border: const OutlineInputBorder(),
                          hintText: '전화번호 뒷 4 자리',
                          prefixIcon: const Icon(Icons.phone),
                        ),
                        maxLength: 4,
                        keyboardType: TextInputType.number,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 24,
                          letterSpacing: 4,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 24),
                      SizedBox(
                        height: 48,
                        child: ElevatedButton(
                          onPressed: _isLocked || _isAuthenticating ? null : _authenticate,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppTheme.primaryColor,
                            foregroundColor: Colors.white,
                          ),
                          child: _isAuthenticating
                              ? const SizedBox(
                                  height: 24,
                                  width: 24,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                                  ),
                                )
                              : Text(
                                  _isLocked ? '잠김' : '인증하기',
                                  style: const TextStyle(fontSize: 16),
                                ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              
              // 오류 메시지
              if (_error != null) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: _isLocked 
                        ? Colors.orange.shade50 
                        : Colors.red.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: _isLocked 
                          ? Colors.orange.shade200 
                          : Colors.red.shade200,
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        _isLocked ? Icons.lock : Icons.error_outline,
                        color: _isLocked 
                            ? Colors.orange.shade700 
                            : Colors.red.shade700,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          _error!,
                          style: TextStyle(
                            color: _isLocked 
                                ? Colors.orange.shade700 
                                : Colors.red.shade700,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              
              // 잠금 해제 타이머
              if (_isLocked) ...[
                const SizedBox(height: 16),
                Center(
                  child: Text(
                    '${_getRemainingLockTime()} 후 다시 시도할 수 있습니다.',
                    style: TextStyle(
                      color: Colors.orange.shade700,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ],
              
              const Spacer(),
              
              // 주의사항
              Card(
                color: Colors.grey.shade50,
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    children: [
                      Icon(Icons.info_outline, size: 20, color: Colors.grey.shade600),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          '인증코드는 1 회만 사용 가능합니다.',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _codeController.dispose();
    _phoneSuffixController.dispose();
    super.dispose();
  }
}
