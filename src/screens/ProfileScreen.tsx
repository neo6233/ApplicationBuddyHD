import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  StatusBar,
} from 'react-native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/AppNavigator';
import Colors from '../constants/Colors';
import Strings from '../constants/Strings';
import Header from '../components/Header';
import useAppSelector from '../redux/hooks/useAppSelector';
import useAppDispatch from '../redux/hooks/useAppDispatch';
import {removeSavedProgram} from '../redux/slices/programSlice';
import {clearChatHistory} from '../redux/slices/chatSlice';
import {Program} from '../models/ProgramModel';
import Validators from '../utils/Validators';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Profile'>;
};

import {SafeAreaView} from 'react-native-safe-area-context';

const ProfileScreen: React.FC<Props> = ({navigation}) => {
  const dispatch = useAppDispatch();
  const totalChats = useAppSelector(s => s.chat.totalChats);
  const savedPrograms = useAppSelector(s => s.programs.savedPrograms);

  // In a real app, these would come from auth/user state
  const [userName] = useState(Strings.PROFILE_DEFAULT_NAME);
  const [userEmail] = useState(Strings.PROFILE_DEFAULT_EMAIL);

  const handleRemoveProgram = (program: Program) => {
    Alert.alert(
      'Remove Program',
      `Remove "${program.name}" from saved programs?`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => dispatch(removeSavedProgram(program)),
        },
      ],
    );
  };

  const handleClearAllChats = () => {
    Alert.alert(
      'Clear Chat History',
      'This will permanently delete all your chat messages.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => dispatch(clearChatHistory()),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <Header title={Strings.PROFILE_TITLE} showBack />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarInitial}>
              {userName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileDetails}>
            <Text style={styles.userName}>{userName}</Text>
            <Text style={styles.userEmail}>{userEmail}</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{totalChats}</Text>
            <Text style={styles.statDesc}>{Strings.PROFILE_TOTAL_CHATS}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{savedPrograms.length}</Text>
            <Text style={styles.statDesc}>{Strings.PROFILE_SAVED_PROGRAMS}</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsCard}>
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => navigation.navigate('Chat')}
              activeOpacity={0.7}>
              <Text style={styles.actionIcon}>🤖</Text>
              <Text style={styles.actionLabel}>Open AI Assistant</Text>
              <Text style={styles.actionChevron}>›</Text>
            </TouchableOpacity>
            <View style={styles.actionDivider} />
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => navigation.navigate('ProgramFinder')}
              activeOpacity={0.7}>
              <Text style={styles.actionIcon}>🎓</Text>
              <Text style={styles.actionLabel}>Find Programs</Text>
              <Text style={styles.actionChevron}>›</Text>
            </TouchableOpacity>
            <View style={styles.actionDivider} />
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => navigation.navigate('Eligibility')}
              activeOpacity={0.7}>
              <Text style={styles.actionIcon}>✅</Text>
              <Text style={styles.actionLabel}>Check Eligibility</Text>
              <Text style={styles.actionChevron}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Saved Programs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Saved Programs ({savedPrograms.length})
          </Text>
          {savedPrograms.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🔖</Text>
              <Text style={styles.emptyText}>
                No saved programs yet.{'\n'}Find and save programs you're interested in.
              </Text>
            </View>
          ) : (
            <View style={styles.savedList}>
              {savedPrograms.map((program, index) => (
                <View key={index} style={styles.savedCard}>
                  <View style={styles.savedCardLeft}>
                    <Text style={styles.savedName}>{program.name}</Text>
                    <Text style={styles.savedMeta}>
                      {program.university} · {program.country}
                    </Text>
                    <View style={styles.savedTagsRow}>
                      <View style={styles.savedTag}>
                        <Text style={styles.savedTagText}>{program.duration}</Text>
                      </View>
                      <View style={styles.savedTag}>
                        <Text style={styles.savedTagText}>{program.intake}</Text>
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveProgram(program)}
                    hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                    <Text style={styles.removeIcon}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Danger Zone */}
        {totalChats > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Data</Text>
            <TouchableOpacity
              style={styles.dangerButton}
              onPress={handleClearAllChats}
              activeOpacity={0.8}>
              <Text style={styles.dangerButtonText}>🗑 Clear Chat History</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
    gap: 16,
  },
  avatarLarge: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textInverse,
  },
  profileDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 3,
  },
  userEmail: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statNum: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.accent,
    marginBottom: 4,
  },
  statDesc: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  actionsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 15,
    gap: 12,
  },
  actionIcon: {
    fontSize: 18,
  },
  actionLabel: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  actionChevron: {
    fontSize: 20,
    color: Colors.textMuted,
  },
  actionDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 18,
  },
  emptyState: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
  savedList: {
    gap: 10,
  },
  savedCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  savedCardLeft: {
    flex: 1,
  },
  savedName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 3,
  },
  savedMeta: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  savedTagsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  savedTag: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  savedTagText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  removeButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 77, 106, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeIcon: {
    fontSize: 12,
    color: Colors.error,
    fontWeight: '600',
  },
  dangerButton: {
    backgroundColor: 'rgba(255, 77, 106, 0.1)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 77, 106, 0.3)',
  },
  dangerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.error,
  },
});

export default ProfileScreen;