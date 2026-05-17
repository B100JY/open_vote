import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:open_vote/core/theme/app_theme.dart';
import 'package:open_vote/data/models/election.dart';
import 'package:open_vote/data/repositories/election_repository.dart';

/// 관리자 - 선거 관리 화면 (목록, 상태 변경, 결과 확인)
class AdminElectionListScreen extends StatefulWidget {
  const AdminElectionListScreen({super.key});

  @override
  State<AdminElectionListScreen> createState() => _AdminElectionListScreenState();
}

class _AdminElectionListScreenState extends State<AdminElectionListScreen> {
  final _electionRepository = ElectionRepository(supabase: Supabase.instance.client);
  List<Election> _elections = [];
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadElections();
  }

  Future<void> _loadElections() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      // Get all elections (admin can see all)
      final elections = await _electionRepository.getAllElections();
      setState(() {
        _elections = elections;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = '선거 목록을 불러오는데 실패했습니다.';
        _isLoading = false;
      });
    }
  }

  Future<void> _updateStatus(Election election, String newStatus) async {
    try {
      await _electionRepository.updateElectionStatus(election.id, newStatus);
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('선거 상태가 "${_getStatusText(newStatus)}"로 변경되었습니다.'),
            backgroundColor: Colors.green,
          ),
        );
        _loadElections();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('상태 변경 중 오류가 발생했습니다.'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  void _showStatusDialog(Election election) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('선거 상태 관리'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              election.name,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            Text('현재 상태: ${_getStatusText(election.status)}'),
            const SizedBox(height: 16),
            Text('상태를 변경하려면 아래 버튼을 탭하세요.'),
          ],
        ),
        actions: [
          if (election.status == 'draft')
            ElevatedButton(
              onPressed: () {
                Navigator.pop(context);
                _updateStatus(election, 'active');
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.green,
                foregroundColor: Colors.white,
              ),
              child: const Text('선거 시작'),
            ),
          if (election.status == 'active') ...[
            ElevatedButton(
              onPressed: () {
                Navigator.pop(context);
                _updateStatus(election, 'paused');
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.orange,
                foregroundColor: Colors.white,
              ),
              child: const Text('일시중단'),
            ),
            const SizedBox(height: 8),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(context);
                _updateStatus(election, 'closed');
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.red,
                foregroundColor: Colors.white,
              ),
              child: const Text('선거 종료'),
            ),
          ],
          if (election.status == 'paused') ...[
            ElevatedButton(
              onPressed: () {
                Navigator.pop(context);
                _updateStatus(election, 'active');
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.green,
                foregroundColor: Colors.white,
              ),
              child: const Text('재개'),
            ),
            const SizedBox(height: 8),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(context);
                _updateStatus(election, 'closed');
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.red,
                foregroundColor: Colors.white,
              ),
              child: const Text('선거 종료'),
            ),
          ],
          if (election.status == 'closed')
            const Text(
              '종료된 선거는 다시 열 수 없습니다.',
              style: TextStyle(color: Colors.grey),
            ),
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('취소'),
          ),
        ],
      ),
    );
  }

  String _getStatusText(String status) {
    switch (status) {
      case 'draft':
        return '준비중';
      case 'active':
        return '진행중';
      case 'paused':
        return '일시중단';
      case 'closed':
        return '종료';
      default:
        return status;
    }
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'draft':
        return Colors.grey;
      case 'active':
        return Colors.green;
      case 'paused':
        return Colors.orange;
      case 'closed':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('선거 관리'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadElections,
            tooltip: '새로고침',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _buildErrorView()
              : _elections.isEmpty
                  ? _buildEmptyView()
                  : _buildElectionList(),
    );
  }

  Widget _buildErrorView() {
    return Center(
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
              onPressed: _loadElections,
              child: const Text('다시 시도'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.event_busy, size: 64, color: Colors.grey.shade400),
            const SizedBox(height: 16),
            Text(
              '생성된 선거가 없습니다.',
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: 8),
            Text(
              '새 선거를 생성해보세요.',
              style: TextStyle(color: Colors.grey.shade600),
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: () {
                Navigator.pushNamed(context, '/admin');
              },
              icon: const Icon(Icons.add),
              label: const Text('새 선거 생성'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildElectionList() {
    return RefreshIndicator(
      onRefresh: _loadElections,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _elections.length,
        itemBuilder: (context, index) {
          final election = _elections[index];
          return Card(
            margin: const EdgeInsets.only(bottom: 16),
            child: InkWell(
              onTap: () => _showStatusDialog(election),
              borderRadius: BorderRadius.circular(12),
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
                            color: _getStatusColor(election.status),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            _getStatusText(election.status),
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                              fontSize: 12,
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            election.name,
                            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    if (election.description != null && election.description!.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(
                        election.description!,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: Colors.grey.shade600,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Icon(Icons.people, size: 16, color: Colors.grey.shade600),
                        const SizedBox(width: 4),
                        Text(
                          '유권자: ${election.totalVoterCodes}명',
                          style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
                        ),
                        const SizedBox(width: 16),
                        Icon(Icons.calendar_today, size: 16, color: Colors.grey.shade600),
                        const SizedBox(width: 4),
                        Text(
                          '${election.createdAt.month}/${election.createdAt.day}',
                          style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
                        ),
                        const Spacer(),
                        Icon(Icons.touch_app, size: 16, color: AppTheme.primaryColor),
                        const SizedBox(width: 4),
                        Text(
                          '상태변경',
                          style: TextStyle(
                            color: AppTheme.primaryColor,
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
