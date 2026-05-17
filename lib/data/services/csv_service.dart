import 'package:universal_html/html.dart' as html;
import 'package:open_vote/data/models/voter_code.dart';

/// CSV 파일 생성 및 다운로드 서비스
class CsvService {
  /// VoterCode 리스트를 CSV 파일로 다운로드
  static void downloadVoterCodes({
    required String filename,
    required List<VoterCode> codes,
    String? electionName,
  }) {
    final buffer = StringBuffer();

    // 헤더 추가
    buffer.writeln(VoterCode.csvHeader);

    // 데이터 행 추가
    for (final code in codes) {
      buffer.writeln(code.toCsvRow());
    }

    // 선거명 정보가 있으면 상단에 추가
    final content = electionName != null
        ? '선거명: $electionName\n${buffer.toString()}'
        : buffer.toString();

    _downloadFile(
      content: content,
      filename: filename,
      mimeType: 'text/csv;charset=utf-8',
    );
  }

  /// 일반적인 CSV 파일 다운로드
  static void downloadCsv({
    required String filename,
    required List<List<dynamic>> rows,
    List<String>? headers,
  }) {
    final buffer = StringBuffer();

    // 헤더 추가
    if (headers != null) {
      buffer.writeln(headers.join(','));
    }

    // 데이터 행 추가
    for (final row in rows) {
      buffer.writeln(row.join(','));
    }

    _downloadFile(
      content: buffer.toString(),
      filename: filename,
      mimeType: 'text/csv;charset=utf-8',
    );
  }

  /// 파일을 브라우저에서 다운로드
  static void _downloadFile({
    required String content,
    required String filename,
    required String mimeType,
  }) {
    final blob = html.Blob([content], mimeType);
    final url = html.Url.createObjectUrlFromBlob(blob);
    html.AnchorElement(href: url)
      ..setAttribute('download', filename)
      ..click();
    html.Url.revokeObjectUrl(url);
  }

  /// 6 자리 랜덤 인증코드 생성
  static String generateRandomCode() {
    final random = DateTime.now().millisecondsSinceEpoch;
    return (random % 900000 + 100000).toString();
  }

  /// 중복 없는 6 자리 인증코드 리스트 생성
  static List<String> generateUniqueCodes(int count) {
    final codes = <String>{};
    final random = DateTime.now().millisecondsSinceEpoch;
    
    while (codes.length < count) {
      // 더 나은 난수 생성
      final code = (random % 900000 + 100000 + codes.length).toString();
      codes.add(code);
    }
    
    return codes.toList();
  }
}
