class Election {
  final String id;
  final String name;
  final String? description;
  final List<Map<String, dynamic>> candidates;
  final int totalVoterCodes;
  final String status;
  final DateTime? startsAt;
  final DateTime? endsAt;
  final DateTime createdAt;
  final DateTime updatedAt;

  Election({
    required this.id,
    required this.name,
    this.description,
    required this.candidates,
    required this.totalVoterCodes,
    required this.status,
    this.startsAt,
    this.endsAt,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Election.fromJson(Map<String, dynamic> json) {
    return Election(
      id: json['id'] as String,
      name: json['name'] as String,
      description: json['description'] as String?,
      candidates: List<Map<String, dynamic>>.from(json['candidates'] as List),
      totalVoterCodes: json['total_voter_codes'] as int,
      status: json['status'] as String,
      startsAt: json['starts_at'] != null ? DateTime.parse(json['starts_at']) : null,
      endsAt: json['ends_at'] != null ? DateTime.parse(json['ends_at']) : null,
      createdAt: DateTime.parse(json['created_at']),
      updatedAt: DateTime.parse(json['updated_at']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'description': description,
      'candidates': candidates,
      'total_voter_codes': totalVoterCodes,
      'status': status,
      'starts_at': startsAt?.toIso8601String(),
      'ends_at': endsAt?.toIso8601String(),
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  bool get isActive => status == 'active';
  bool get isClosed => status == 'closed';
  bool get isDraft => status == 'draft';
}
