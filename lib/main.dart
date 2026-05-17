import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:open_vote/core/constants/app_constants.dart';
import 'package:open_vote/core/theme/app_theme.dart';
import 'package:open_vote/features/admin/presentation/screens/admin_screen.dart';
import 'package:open_vote/features/admin/presentation/screens/admin_election_list_screen.dart';
import 'package:open_vote/features/vote/presentation/screens/election_select_screen.dart';
import 'package:open_vote/features/auth/presentation/screens/auth_screen.dart';
import 'package:open_vote/features/vote/presentation/screens/vote_screen.dart';
import 'package:open_vote/features/vote/presentation/screens/vote_complete_screen.dart';
import 'package:open_vote/features/dashboard/presentation/screens/dashboard_screen.dart';
import 'package:open_vote/features/results/presentation/screens/results_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Supabase.initialize(
    url: AppConstants.supabaseUrl,
    anonKey: AppConstants.supabaseAnonKey,
  );

  runApp(const OpenVoteApp());
}

class OpenVoteApp extends StatelessWidget {
  const OpenVoteApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: AppConstants.appName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      initialRoute: '/',
      routes: {
        '/': (context) => const HomeScreen(),
        '/admin': (context) => const AdminScreen(),
        '/admin-list': (context) => const AdminElectionListScreen(),
        '/vote-select': (context) => const ElectionSelectScreen(),
        '/auth': (context) => const AuthScreen(),
        '/vote': (context) => const VoteScreen(),
        '/vote-complete': (context) => const VoteCompleteScreen(),
        '/dashboard': (context) => const DashboardScreen(),
        '/results': (context) => const ResultsScreen(),
      },
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(AppConstants.appName),
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text(
              'Open Vote',
              style: TextStyle(
                fontSize: 32,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              AppConstants.appTagline,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: 48),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                ElevatedButton(
                  onPressed: () => Navigator.pushNamed(context, '/vote-select'),
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 32,
                      vertical: 16,
                    ),
                  ),
                  child: const Text(
                    '투표하기',
                    style: TextStyle(fontSize: 16),
                  ),
                ),
                const SizedBox(width: 16),
                OutlinedButton(
                  onPressed: () => Navigator.pushNamed(context, '/admin'),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 32,
                      vertical: 16,
                    ),
                  ),
                  child: const Text(
                    '관리자',
                    style: TextStyle(fontSize: 16),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
