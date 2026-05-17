import 'dart:async';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:open_vote/core/theme/app_theme.dart';
import 'package:open_vote/data/models/election.dart';
import 'package:open_vote/data/repositories/election_repository.dart';

/// 투표 결과 화면 - 실시간 결과 및 최종 집계
class ResultsScreen extends StatefulWidget {
  const ResultsScreen({super.key});

  @override
  State<ResultsScreen> createState() => _ResultsScreenState();
}

class _ResultsScreenState extends State<ResultsScreen> {
  final _electionRepository = ElectionRepository(supabase: Supabase.instance.client);
  
  Election? _election;
  List<Map<String, dynamic>> _candidates = [];
  Map<String, int> _results = {};
  int _totalVotes = 0;
  bool _isLoading = true;
  String? _error;
  
  StreamSubscription? _ballotsSubscription;
  bool _isLive = true;

  @override
  void initState() {
    super.initState();
    _loadResults();
  }

  Future<void> _loadResults() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      // Get active or closed election
      final elections = await _electionRepository.getActiveElections();
      
      if (elections.isEmpty) {
        setState(() {
          _error = '결과를 확인할 수 있는 선거가 없습니다.';
          _isLoading = false;
        });
        return;
      }

      final election = elections.first;
      final results = await _electionRepository.getElectionResults(election.id);

      setState(() {
        _election = election;
        _candidates = election.candidates;
        _totalVotes = results['total_votes'] as int? ?? 0;
        
        // Parse results
        final resultsList = results['results'] as List? ?? [];
        _results = {};
        for (var item in resultsList) {
          final candidateId = item['candidate_id'] as String;
          final voteCount = item['vote_count'] as int? ?? 0;
          _results[candidateId] = voteCount;
        }
        
        _isLoading = false;
      });

      // Subscribe to realtime updates if election is active
      if (_election?.status == 'active' && _isLive) {
        _subscribeToRealtimeUpdates();
      }
    } catch (e) {
      setState(() {
        _error = '결과를 불러오는데 실패했습니다.';
        _isLoading = false;
      });
    }
  }

  void _subscribeToRealtimeUpdates() {
    if (_election == null) return;

    _ballotsSubscription = _electionRepository
        .getBallotsStream(_election!.id)
        .listen((ballots) {
      if (mounted) {
        setState(() {
          _totalVotes = ballots.length;
          // Recalculate results
          _results = {};
          for (final ballot in ballots) {
            final candidateId = ballot['selected_candidate'] as String?;
            if (candidateId != null) {
              _results[candidateId] = (_results[candidateId] ?? 0) + 1;
            }
          }
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return Scaffold(
        appBar: AppBar(title: const Text('투표 결과')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_error != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('투표 결과')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.poll, size: 64, color: Colors.grey.shade400),
                const SizedBox(height: 16),
                Text(_error!),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: _loadResults,
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
        title: const Text('투표 결과'),
        actions: [
          if (_election?.status == 'active')
            ToggleButtons(
              isSelected: [_isLive],
              onPressed: (index) {
                setState(() {
                  _isLive = !_isLive;
                  if (_isLive) {
                    _subscribeToRealtimeUpdates();
                  } else {
                    _ballotsSubscription?.cancel();
                  }
                });
              },
              borderRadius: BorderRadius.circular(20),
              children: [
                Row(
                  children: [
                    Icon(
                      _isLive ? Icons.live_tv : Icons.tv_off,
                      size: 16,
                    ),
                    const SizedBox(width: 4),
                    Text(_isLive ? '실시간' : '중지'),
                  ],
                ),
              ],
            ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadResults,
            tooltip: '새로고침',
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadResults,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // 선거 정보 카드
              Card(
                color: AppTheme.primaryColor.withOpacity(0.05),
                child: Padding(
                  padding: const EdgeInsets.all(16),
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
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 20),

              // 총 투표수 카드
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    children: [
                      Icon(Icons.how_to_vote, size: 48, color: AppTheme.primaryColor),
                      const SizedBox(height: 12),
                      Text(
                        '총 $_totalVotes 표',
                        style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: AppTheme.primaryColor,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '투표가 집계되었습니다',
                        style: TextStyle(color: Colors.grey.shade600),
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 20),

              // 후보자별 결과
              Text(
                '후보자별 득표 현황',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 12),

              ..._buildCandidateResults(context),

              const SizedBox(height: 24),

              // 결과 상세 테이블
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '결과 상세',
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 12),
                      DataTable(
                        columns: const [
                          DataColumn(label: Text('순위')),
                          DataColumn(label: Text('후보자')),
                          DataColumn(
                            label: Text('득표수'),
                            numeric: true,
                          ),
                          DataColumn(
                            label: Text('득표율'),
                            numeric: true,
                          ),
                        ],
                        rows: _buildTableRows(context),
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 16),

              // 안내 메시지
              if (_election?.status == 'active')
                Card(
                  color: Colors.orange.shade50,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        Icon(Icons.info_outline, color: Colors.orange.shade700),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            '이 선거는 진행 중입니다. 결과는 실시간으로 업데이트됩니다.',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.orange.shade700,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

              if (_election?.status == 'closed')
                Card(
                  color: Colors.green.shade50,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        Icon(Icons.check_circle, color: Colors.green.shade700),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            '이 선거는 종료되었습니다. 최종 결과입니다.',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.green.shade700,
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

  List<Widget> _buildCandidateResults(BuildContext context) {
    final sortedCandidates = _candidates.map((candidate) {
      final candidateId = candidate['id'] as String;
      final name = candidate['name'] as String;
      final votes = _results[candidateId] ?? 0;
      final percentage = _totalVotes > 0 ? (votes / _totalVotes * 100) : 0.0;
      return {
        'id': candidateId,
        'name': name,
        'votes': votes,
        'percentage': percentage,
      };
    }).toList();

    // Sort by votes descending
    sortedCandidates.sort((a, b) => (b['votes'] as int).compareTo(a['votes'] as int));

    return sortedCandidates.map((candidate) {
      final name = candidate['name'] as String;
      final votes = candidate['votes'] as int;
      final percentage = candidate['percentage'] as double;
      final isWinner = sortedCandidates.first == candidate && votes > 0;

      return Card(
        margin: const EdgeInsets.only(bottom: 12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  if (isWinner) ...[
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.amber,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: const Icon(Icons.emoji_events, color: Colors.white, size: 16),
                    ),
                    const SizedBox(width: 8),
                  ],
                  Expanded(
                    child: Text(
                      name,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        '$votes 표',
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: AppTheme.primaryColor,
                        ),
                      ),
                      Text(
                        '${percentage.toStringAsFixed(1)}%',
                        style: TextStyle(
                          color: Colors.grey.shade600,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: LinearProgressIndicator(
                  value: percentage / 100,
                  minHeight: 8,
                  backgroundColor: Colors.grey.shade200,
                  valueColor: AlwaysStoppedAnimation<Color>(
                    isWinner ? Colors.amber : AppTheme.primaryColor,
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }).toList();
  }

  List<DataRow> _buildTableRows(BuildContext context) {
    final sortedCandidates = _candidates.map((candidate) {
      final candidateId = candidate['id'] as String;
      final name = candidate['name'] as String;
      final votes = _results[candidateId] ?? 0;
      final percentage = _totalVotes > 0 ? (votes / _totalVotes * 100) : 0.0;
      return {
        'id': candidateId,
        'name': name,
        'votes': votes,
        'percentage': percentage,
      };
    }).toList();

    sortedCandidates.sort((a, b) => (b['votes'] as int).compareTo(a['votes'] as int));

    return sortedCandidates.asMap().entries.map((entry) {
      final index = entry.key;
      final candidate = entry.value;
      final name = candidate['name'] as String;
      final votes = candidate['votes'] as int;
      final percentage = candidate['percentage'] as double;

      return DataRow(
        cells: [
          DataCell(Text('#${index + 1}')),
          DataCell(Text(name)),
          DataCell(Text('$votes')),
          DataCell(Text('${percentage.toStringAsFixed(1)}%')),
        ],
      );
    }).toList();
  }

  Color _getStatusColor(String? status) {
    switch (status) {
      case 'active':
        return Colors.green;
      case 'draft':
        return Colors.grey;
      case 'closed':
        return Colors.blue;
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

  @override
  void dispose() {
    _ballotsSubscription?.cancel();
    super.dispose();
  }
}
