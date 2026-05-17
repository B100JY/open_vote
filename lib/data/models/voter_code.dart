class VoterCode {
  final String id;
  final String electionId;
  final String code;
  final String phoneSuffix;
  final bool isUsed;
  final DateTime createdAt;
  final DateTime? usedAt;

  VoterCode({
    required this.id,
    required this.electionId,
    required this.code,
    required this.phoneSuffix,
    required this.isUsed,
    required this.createdAt,
    this.usedAt,
  });

  factory VoterCode.fromJson(Map<String, dynamic> json) {
    return VoterCode(
      id: json['id'] as String,
      electionId: json['election_id'] as String,
      code: json['code'] as String,
      phoneSuffix: json['phone_suffix'] as String,
      isUsed: json['is_used'] as bool,
      createdAt: DateTime.parse(json['created_at']),
      usedAt: json['used_at'] != null ? DateTime.parse(json['used_at']) : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'election_id': electionId,
      'code': code,
      'phone_suffix': phoneSuffix,
      'is_used': isUsed,
      'created_at': createdAt.toIso8601String(),
      'used_at': usedAt?.toIso8601String(),
    };
  }

  /// CSV 형식: 인증코드,전화번호뒷자리,사용여부
  String toCsvRow() {
    return '$code,$phoneSuffix,${isUsed ? "사용됨" : "미사용"}';
  }

  static String get csvHeader {
    return '인증코드,전화번호뒷자리,사용여부';
  }
}
