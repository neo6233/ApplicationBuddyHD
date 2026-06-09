import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Dimensions,
} from 'react-native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/AppNavigator';
import Colors from '../constants/Colors';
import Strings from '../constants/Strings';
import useAppSelector from '../redux/hooks/useAppSelector';

const {width} = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

interface FeatureCard {
  emoji: string;
  title: string;
  description: string;
  route: keyof RootStackParamList;
  accentColor: string;
}

const FEATURE_CARDS: FeatureCard[] = [
  {
    emoji: '🤖',
    title: Strings.HOME_CARD_AI,
    description: Strings.HOME_CARD_AI_DESC,
    route: 'Chat',
    accentColor: Colors.accent,
  },
  {
    emoji: '🎓',
    title: Strings.HOME_CARD_PROGRAMS,
    description: Strings.HOME_CARD_PROGRAMS_DESC,
    route: 'ProgramFinder',
    accentColor: Colors.secondary,
  },
  {
    emoji: '✅',
    title: Strings.HOME_CARD_ELIGIBILITY,
    description: Strings.HOME_CARD_ELIGIBILITY_DESC,
    route: 'Eligibility',
    accentColor: Colors.success,
  },
  {
    emoji: '👤',
    title: Strings.HOME_CARD_PROFILE,
    description: Strings.HOME_CARD_PROFILE_DESC,
    route: 'Profile',
    accentColor: Colors.warning,
  },
];

const HomeScreen: React.FC<Props> = ({navigation}) => {
  const totalChats = useAppSelector(s => s.chat.totalChats);
  const savedPrograms = useAppSelector(s => s.programs.savedPrograms.length);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>{Strings.HOME_GREETING}</Text>
            <Text style={styles.subtitle}>{Strings.HOME_SUBTITLE}</Text>
          </View>
          <View style={styles.logoBadge}>
            <Text style={styles.logoLetter}>A</Text>
          </View>
        </View>

        {/* Stats Bar */}
        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{totalChats}</Text>
            <Text style={styles.statLabel}>Chats</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{savedPrograms}</Text>
            <Text style={styles.statLabel}>Saved Programs</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>AI</Text>
            <Text style={styles.statLabel}>Powered</Text>
          </View>
        </View>

        {/* Feature Cards Grid */}
        <Text style={styles.sectionTitle}>Quick Access</Text>
        <View style={styles.grid}>
          {FEATURE_CARDS.map((card, index) => (
            <TouchableOpacity
              key={index}
              style={styles.card}
              onPress={() => navigation.navigate(card.route)}
              activeOpacity={0.8}>
              {/* Accent glow */}
              <View
                style={[
                  styles.cardAccentGlow,
                  {backgroundColor: card.accentColor},
                ]}
              />
              <Text style={styles.cardEmoji}>{card.emoji}</Text>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardDescription}>{card.description}</Text>
              <View style={[styles.cardChevron, {borderColor: card.accentColor}]}>
                <Text style={[styles.cardChevronText, {color: card.accentColor}]}>
                  →
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* CTA Banner */}
        <TouchableOpacity
          style={styles.ctaBanner}
          onPress={() => navigation.navigate('Chat')}
          activeOpacity={0.85}>
          <View style={styles.ctaLeft}>
            <Text style={styles.ctaTitle}>Chat with ARIA</Text>
            <Text style={styles.ctaSubtitle}>
              Get instant personalised guidance
            </Text>
          </View>
          <View style={styles.ctaIcon}>
            <Text style={styles.ctaIconText}>💬</Text>
          </View>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 24,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.accent,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  logoLetter: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textInverse,
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 28,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.accent,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
    letterSpacing: 0.3,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 24,
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    position: 'relative',
  },
  cardAccentGlow: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 60,
    height: 60,
    borderRadius: 30,
    opacity: 0.08,
  },
  cardEmoji: {
    fontSize: 28,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  cardDescription: {
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 17,
    marginBottom: 14,
  },
  cardChevron: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardChevronText: {
    fontSize: 14,
    fontWeight: '600',
  },
  ctaBanner: {
    marginHorizontal: 16,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  ctaLeft: {
    flex: 1,
  },
  ctaTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  ctaSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  ctaIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.white10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaIconText: {
    fontSize: 22,
  },
});

export default HomeScreen;