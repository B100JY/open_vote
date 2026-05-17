import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:open_vote/core/theme/app_theme.dart';
import 'package:open_vote/data/repositories/election_repository.dart';
import 'package:open_vote/data/models/election.dart';
import 'package:open_vote/data/models/voter_code.dart';

class AdminScreen extends StatefulWidget {
  const AdminScreen({super.key});

  @override
  State<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends State<AdminScreen> {
  final _electionRepository = ElectionRepository(supabase: Supabase.instance.client);
  final _nameController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _voterCountController = TextEditingController();
  final _candidateController = TextEditingController();
  final _candidates = <Map<String, dynamic>>[];
  bool _isLoading = false;
  String? _error;
  Election? _createdElection;
  List<VoterCode> _generatedCodes = [];
  bool _showCodes = false;

  void _addCandidate() {
    if (_candidateController.text.trim().isEmpty) return;
    setState(() {
      _candidates.add({
        'id': 'candidate_${_candidates.length + 1}',
        'name': _candidateController.text.trim(),
      });
      _candidateController.clear();
    });
  }

  void _removeCandidate(int index) {
    setState(() {
      _candidates.removeAt(index);
    });
  }

  Future<void> _createElection() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final int voterCount = int.tryParse(_voterCountController.text) ?? 0;

      if (_nameController.text.trim().isEmpty) {
        setState(() {
          _error = '투표명을 입력해주세요.';
          _isLoading = false;
        });
        return;
      }

      if (voterCount <= 0) {
        setState(() {
          _error = '유효한 유권자 수를 입력해주세요.';
          _isLoading = false;
        });
        return;
      }

      if (_candidates.isEmpty) {
        setState(() {
          _error = '최소 한 명 이상의 후보자를 등록해주세요.';
          _isLoading = false;
        });
        return;
      }

      // 1. 투표 생성
      final election = await _electionRepository.createElection(
        name: _nameController.text.trim(),
        description: _descriptionController.text.trim(),
        candidates: _candidates,
        totalVoterCodes: voterCount,
        startsAt: DateTime.now(),
        endsAt: DateTime.now().add(const Duration(days: 7)),
      );

      // 2. 인증코드 생성
      final codes = await _electionRepository.generateVoterCodes(election.id, voterCount);

      setState(() {
        _createdElection = election;
        _generatedCodes = codes;
        _isLoading = false;
        _showCodes = true;
      });
    } catch (e) {
      setState(() {
        _error = '투표 생성 중 오류가 발생했습니다: ${e.toString()}';
        _isLoading = false;
      });
    }
  }

  Future<void> _downloadCsv() async {
    if (_createdElection == null) return;

    try {
      await _electionRepository.downloadVoterCodesCsv(
        electionId: _createdElection!.id,
        electionName: _createdElection!.name,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('CSV 파일이 다운로드되었습니다.')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('CSV 다운로드 실패: ${e.toString()}')),
        );
      }
    }
  }

  void _resetForm() {
    setState(() {
      _nameController.clear();
      _descriptionController.clear();
      _voterCountController.clear();
      _candidates.clear();
      _createdElection = null;
      _generatedCodes = [];
      _showCodes = false;
      _error = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('관리자 - 투표 생성'),
        actions: [
          IconButton(
            icon: const Icon(Icons.list),
            onPressed: () {
              Navigator.pushNamed(context, '/admin-list');
            },
            tooltip: '선거 관리',
          ),
          if (_createdElection != null)
            IconButton(
              icon: const Icon(Icons.refresh),
              onPressed: _resetForm,
              tooltip: '새 투표 생성',
            ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: _showCodes && _createdElection != null
            ? _buildSuccessView()
            : _buildFormView(),
      ),
    );
  }

  Widget _buildFormView() {
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '새 투표 생성',
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const SizedBox(height: 24),
                  TextField(
                    controller: _nameController,
                    decoration: const InputDecoration(
                      labelText: '투표명 *',
                      border: OutlineInputBorder(),
                      hintText: '예: 2024 년 정기 국회의원 선거',
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _descriptionController,
                    decoration: const InputDecoration(
                      labelText: '투표 설명',
                      border: OutlineInputBorder(),
                      hintText: '투표에 대한 간단한 설명을 입력하세요.',
                    ),
                    maxLines: 3,
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _voterCountController,
                    decoration: const InputDecoration(
                      labelText: '유권자 수 *',
                      border: OutlineInputBorder(),
                      hintText: '예: 100',
                    ),
                    keyboardType: TextInputType.number,
                  ),
                  const SizedBox(height: 24),
                  Text(
                    '후보자 등록',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _candidateController,
                          decoration: const InputDecoration(
                            labelText: '후보자 이름',
                            border: OutlineInputBorder(),
                            hintText: '예: 홍길동',
                          ),
                          onSubmitted: (_) => _addCandidate(),
                        ),
                      ),
                      const SizedBox(width: 8),
                      ElevatedButton(
                        onPressed: _addCandidate,
                        child: const Text('추가'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  if (_candidates.isNotEmpty)
                    Container(
                      constraints: const BoxConstraints(maxHeight: 200),
                      child: ListView.builder(
                        shrinkWrap: true,
                        itemCount: _candidates.length,
                        itemBuilder: (context, index) {
                          return Card(
                            margin: const EdgeInsets.only(bottom: 8),
                            child: ListTile(
                              title: Text(_candidates[index]['name']),
                              trailing: IconButton(
                                icon: const Icon(Icons.delete, color: Colors.red),
                                onPressed: () => _removeCandidate(index),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  const SizedBox(height: 24),
                  if (_error != null)
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.red.shade50,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.error_outline, color: Colors.red.shade700),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              _error!,
                              style: TextStyle(color: Colors.red.shade700),
                            ),
                          ),
                        ],
                      ),
                    ),
                  const SizedBox(height: 16),
                  SizedBox(
                    height: 48,
                    child: ElevatedButton(
                      onPressed: _isLoading ? null : _createElection,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.primaryColor,
                        foregroundColor: Colors.white,
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
                              '투표 생성 및 인증코드 발급',
                              style: TextStyle(fontSize: 16),
                            ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSuccessView() {
    final stats = {
      'total': _generatedCodes.length,
      'used': _generatedCodes.where((c) => c.isUsed).length,
      'remaining': _generatedCodes.where((c) => !c.isUsed).length,
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Card(
          color: Colors.green.shade50,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                Icon(Icons.check_circle_outline, color: Colors.green.shade700, size: 48),
                const SizedBox(height: 16),
                Text(
                  '투표가 성공적으로 생성되었습니다!',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    color: Colors.green.shade700,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  _createdElection!.name,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '인증코드 현황',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _buildStatItem('전체', stats['total'].toString(), Colors.blue),
                    _buildStatItem('미사용', stats['remaining'].toString(), Colors.green),
                    _buildStatItem('사용됨', stats['used'].toString(), Colors.grey),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '다음 단계',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 16),
                const ListTile(
                  leading: Icon(Icons.download, color: AppTheme.primaryColor),
                  title: Text('1. CSV 파일 다운로드'),
                  subtitle: Text('유권자에게 배포할 인증코드 리스트를 다운로드하세요.'),
                ),
                ListTile(
                  leading: const Icon(Icons.share, color: AppTheme.primaryColor),
                  title: const Text('2. 인증코드 배포'),
                  subtitle: const Text('다운로드한 CSV 파일을 유권자에게 안전하게 배포하세요.'),
                ),
                ListTile(
                  leading: const Icon(Icons.visibility, color: AppTheme.primaryColor),
                  title: const Text('3. 투표 현황 모니터링'),
                  subtitle: const Text('대시보드에서 실시간 투표 진행률을 확인할 수 있습니다.'),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  height: 48,
                  child: ElevatedButton.icon(
                    onPressed: _downloadCsv,
                    icon: const Icon(Icons.download),
                    label: Text(
                      'CSV 다운로드 (인증코드 ${stats['total']}개)',
                      style: const TextStyle(fontSize: 16),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primaryColor,
                      foregroundColor: Colors.white,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        if (_generatedCodes.isNotEmpty)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        '생성된 인증코드 (${_generatedCodes.length}개)',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      TextButton(
                        onPressed: () {
                          setState(() => _showCodes = !_showCodes);
                        },
                        child: Text(_showCodes ? '접기' : '펼치기'),
                      ),
                    ],
                  ),
                  if (_showCodes) ...[
                    const SizedBox(height: 8),
                    Container(
                      height: 200,
                      decoration: BoxDecoration(
                        border: Border.all(color: Colors.grey.shade300),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Scrollbar(
                        child: SingleChildScrollView(
                          scrollDirection: Axis.vertical,
                          child: DataTable(
                            columns: const [
                              DataColumn(label: Text('인증코드')),
                              DataColumn(label: Text('전화번호 뒷자리')),
                              DataColumn(label: Text('상태')),
                            ],
                            rows: _generatedCodes.map((code) {
                              return DataRow(
                                cells: [
                                  DataCell(Text(code.code)),
                                  DataCell(Text(code.phoneSuffix)),
                                  DataCell(Text(
                                    code.isUsed ? '사용됨' : '미사용',
                                    style: TextStyle(
                                      color: code.isUsed ? Colors.grey : Colors.green,
                                    ),
                                  )),
                                ],
                              );
                            }).toList(),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '주의: 인증코드는 재발급되지 않습니다. CSV 파일을 안전하게 보관하세요.',
                      style: TextStyle(color: Colors.orange.shade700, fontSize: 12),
                    ),
                  ],
                ],
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildStatItem(String label, String value, Color color) {
    return Column(
      children: [
        Text(
          value,
          style: Theme.of(context).textTheme.headlineMedium?.copyWith(
            color: color,
            fontWeight: FontWeight.bold,
          ),
        ),
        Text(
          label,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            color: Colors.grey.shade700,
          ),
        ),
      ],
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    _voterCountController.dispose();
    _candidateController.dispose();
    super.dispose();
  }
}
