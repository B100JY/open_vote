class AppConstants {
  static const String supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  static const String supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');

  // Edge Function endpoints
  static const String castVoteEndpoint = '/functions/v1/cast_vote';

  // Rate limiting
  static const int maxLoginAttempts = 5;
  static const Duration loginCooldown = Duration(minutes: 15);

  // UI
  static const String appName = 'Open Vote';
  static const String appTagline = '노동조합용 오픈소스 투표 시스템';
}
