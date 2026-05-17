import 'dart:async';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:open_vote/core/theme/app_theme.dart';
import 'package:open_vote/data/models/election.dart';
import 'package:open_vote/data/repositories/election_repository.dart';

/// 실시간 투표 진행률 대시보드
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final _electionRepository = ElectionRepository(supabase: Supabase.instance.client);
  
  Election? _election;
  int _totalCodes = 0;
  int _usedCodes = 0;
  int _totalBallots = 0;
  double _progress = 0.0;
  
  bool _isLoading = true;
  String? _error;
  StreamSubscription? _ballotsSubscription;
  StreamSubscription? _voterCodesSubscription;

  @override
  void initState() {
    super.initState();
    _loadInitialData();
    _subscribeToRealtimeUpdates();
  }

  Future<void> _loadInitialData() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      // Get active election
      final elections = await _electionRepository.getActiveElections();
      if (elections.isEmpty) {
        setState(() {
          _error = '진행 중인 선거가 없습니다.';
          _isLoading = false;
        });
        return;
      }

      final election = elections.first;
      final stats = await _electionRepository.getVoterCodeStats(election.id);
      final totalBallots = await _electionRepository.getVoteCount(election.id);

      setState(() {
        _election = election;
        _totalCodes = stats['total'] ?? 0;
        _usedCodes = stats['used'] ?? 0;
        _totalBallots = totalBallots;
        _progress = _totalCodes > 0 ? _usedCodes / _totalCodes : 0.0;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = '데이터를 불러오는데 실패했습니다.';
        _isLoading = false;
      });
    }
  }

  void _subscribeToRealtimeUpdates() {
    if (_election == null) return;

    // Subscribe to ballots changes
    _ballotsSubscription = _electionRepository
        .getBallotsStream(_election!.id)
        .listen((ballots) {
      setState(() {
        _totalBallots = ballots.length;
      });
    });

    // Subscribe to voter_codes changes
    _voterCodesSubscription = _electionRepository
        .getVoterCodesStream(_election!.id)
        .listen((codes) {
      final used = codes.where((c) => c['is_used'] == true).length;
      setState(() {
        _usedCodes = used;
        _totalCodes = codes.length;
        _progress = _totalCodes > 0 ? _usedCodes / _totalCodes : 0.0;
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return Scaffold(
        appBar: AppBar(title: const Text('투표 진행률')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_error != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('투표 진행률')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.error_outline, size: 64, color: Colors.grey.shade400),
                const SizedBox(height: 16),
                Text(_error!),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: _loadInitialData,
                  child: const Text('다시 시도'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('투표 진행률'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadInitialData,
            tooltip: '새로고침',
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadInitialData,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // 선거 정보 카드
              Card(
                color: AppTheme.primaryColor.withOpacity(0.05),
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 6,
                            ),
                            decoration: BoxDecoration(
                              color: _getStatusColor(_election?.status),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  _getStatusIcon(_election?.status),
                                  size: 16,
                                  color: Colors.white,
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  _getStatusText(_election?.status),
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.bold,
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              _election?.name ?? '',
                              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                      if (_election?.description != null && _election!.description!.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        Text(
                          _election!.description!,
                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: Colors.grey.shade600,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 20),

              // 투표 진행률 카드
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            '투표 진행률',
                            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Text(
                            '${(_progress * 100).toStringAsFixed(1)}%',
                            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                              color: AppTheme.primaryColor,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: LinearProgressIndicator(
                          value: _progress,
                          minHeight: 12,
                          backgroundColor: Colors.grey.shade200,
                          valueColor: const AlwaysStoppedAnimation<Color>(AppTheme.primaryColor),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          _buildStatItem('참여', '$_usedCodes 명', Colors.blue),
                          _buildStatItem('전체', '$_totalCodes 명', Colors.grey),
                          _buildStatItem('미참여', '${_totalCodes - _usedCodes}명', Colors.orange),
                        ],
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 16),

              // 투표 현황 카드
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '투표 현황',
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          Expanded(
                            child: _buildInfoCard(
                              icon: Icons.how_to_vote,
                              label: '총 투표수',
                              value: '$_totalBallots',
                              color: Colors.green,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: _buildInfoCard(
                              icon: Icons.people,
                              label: '인증코드',
                              value: '$_totalCodes',
                              color: Colors.blue,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: _buildInfoCard(
                              icon: Icons.check_circle,
                              label: '사용됨',
                              value: '$_usedCodes',
                              color: Colors.orange,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 16),

              // 선거 기간 카드
              if (_election?.startsAt != null || _election?.endsAt != null)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(Icons.calendar_today, size: 20, color: Colors.grey.shade600),
                            const SizedBox(width: 8),
                            Text(
                              '선거 기간',
                              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        _buildDateRow(
                          '시작',
                          _formatDateTime(_election?.startsAt),
                          Icons.play_arrow,
                        ),
                        const SizedBox(height: 8),
                        _buildDateRow(
                          '종료',
                          _formatDateTime(_election?.endsAt),
                          Icons.stop,
                        ),
                      ],
                    ),
                  ),
                ),

              const SizedBox(height: 16),

              // 새로고침 안내
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
                          '실시간으로 업데이트됩니다.下拉하여 새로고침할 수 있습니다.',
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

  Widget _buildStatItem(String label, String value, Color color) {
    return Column(
      children: [
        Text(
          value,
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: TextStyle(
            fontSize: 12,
            color: Colors.grey.shade600,
          ),
        ),
      ],
    );
  }

  Widget _buildInfoCard({
    required IconData icon,
    required String label,
    required String value,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 28),
          const SizedBox(height: 8),
          Text(
            value,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              color: Colors.grey.shade600,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildDateRow(String label, String date, IconData icon) {
    return Row(
      children: [
        Icon(icon, size: 16, color: Colors.grey.shade600),
        const SizedBox(width: 8),
        SizedBox(
          width: 40,
          child: Text(
            label,
            style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            date,
            style: const TextStyle(fontWeight: FontWeight.w500),
          ),
        ),
      ],
    );
  }

  Color _getStatusColor(String? status) {
    switch (status) {
      case 'active':
        return Colors.green;
      case 'draft':
        return Colors.grey;
      case 'closed':
        return Colors.red;
      case 'paused':
        return Colors.orange;
      default:
        return Colors.grey;
    }
  }

  IconData _getStatusIcon(String? status) {
    switch (status) {
      case 'active':
        return Icons.play_arrow;
      case 'draft':
        return Icons.edit;
      case 'closed':
        return Icons.check;
      case 'paused':
        return Icons.pause;
      default:
        return Icons.help;
    }
  }

  String _getStatusText(String? status) {
    switch (status) {
      case 'active':
        return '진행중';
      case 'draft':
        return '준비중';
      case 'closed':
        return '종료';
      case 'paused':
        return '일시중단';
      default:
        return '알수없음';
    }
  }

  String _formatDateTime(DateTime? dateTime) {
    if (dateTime == null) return '-';
    return '${dateTime.year}년 ${dateTime.month}월 ${dateTime.day}일 '
        '${dateTime.hour}시 ${dateTime.minute}분';
  }

  @override
  void dispose() {
    _ballotsSubscription?.cancel();
    _voterCodesSubscription?.cancel();
    super.dispose();
  }
}
