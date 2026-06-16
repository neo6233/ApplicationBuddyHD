import React, {useEffect, useMemo, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Image,
  Animated,
} from 'react-native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/AppNavigator';
import Colors from '../constants/Colors';
import Strings from '../constants/Strings';
import useAppSelector from '../redux/hooks/useAppSelector';
import GradientBackground from '../components/GradientBackground';

const {width} = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;
const GRAPH_BAR_MAX_WIDTH = width - 156;

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

interface FeatureCard {
  emoji: string;
  title: string;
  description: string;
  route: keyof RootStackParamList;
  accentColor: string;
  glowColor: string;
}

const FEATURE_CARDS: FeatureCard[] = [
  {
    emoji: '🤖',
    title: Strings.HOME_CARD_AI,
    description: Strings.HOME_CARD_AI_DESC,
    route: 'Chat',
    accentColor: Colors.cardAIAssistant,
    glowColor: 'rgba(139, 92, 246, 0.15)',
  },
  {
    emoji: '🎓',
    title: Strings.HOME_CARD_PROGRAMS,
    description: Strings.HOME_CARD_PROGRAMS_DESC,
    route: 'ProgramFinder',
    accentColor: Colors.cardProgramFinder,
    glowColor: 'rgba(59, 130, 246, 0.15)',
  },
  {
    emoji: '✅',
    title: Strings.HOME_CARD_ELIGIBILITY,
    description: Strings.HOME_CARD_ELIGIBILITY_DESC,
    route: 'Eligibility',
    accentColor: Colors.cardEligibility,
    glowColor: 'rgba(52, 211, 153, 0.15)',
  },
  {
    emoji: '👤',
    title: Strings.HOME_CARD_PROFILE,
    description: Strings.HOME_CARD_PROFILE_DESC,
    route: 'Profile',
    accentColor: Colors.cardProfile,
    glowColor: 'rgba(245, 158, 11, 0.15)',
  },
];

const getGraphScore = (matchScore: number | undefined, index: number) => {
  if (typeof matchScore === 'number' && matchScore > 0) {
    return Math.max(35, Math.min(98, Math.round(matchScore)));
  }

  return Math.max(55, 90 - index * 9);
};

const HomeScreen: React.FC<Props> = ({navigation}) => {
  const totalChats = useAppSelector(s => s.chat.totalChats);
  const messages = useAppSelector(s => s.chat.messages);
  const savedPrograms = useAppSelector(s => s.programs.savedPrograms.length);
  const recommendationGraph = useMemo(() => {
    const latestRecommendation = [...messages]
      .reverse()
      .find(
        message =>
          message.role === 'assistant' &&
          message.programs?.length &&
          (message.responseType === 'recommendation' ||
            message.responseType === 'final_recommendation' ||
            !message.responseType),
      );

    return (latestRecommendation?.programs || []).slice(0, 4).map((program, index) => ({
      name: program.name,
      country: program.country,
      score: getGraphScore(program.matchScore, index),
    }));
  }, [messages]);

  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(slideUp, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeIn, slideUp]);

  return (
    <GradientBackground style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>

        {/* Header */}
        <Animated.View
          style={[
            styles.header,
            {opacity: fadeIn, transform: [{translateY: slideUp}]},
          ]}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>{Strings.HOME_GREETING}</Text>
            <Text style={styles.subtitle}>{Strings.HOME_SUBTITLE}</Text>
          </View>
          <View style={styles.logoBadge}>
            <Image
              source={require('../assets/aria_logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
        </Animated.View>

        {/* Stats Bar — Glass effect */}
        <View style={styles.statsBar}>
          <View style={styles.statsGlassHighlight} />
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
            <Text style={[styles.statValue, styles.statValueSecondary]}>AI</Text>
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
              {/* Accent glow — larger, more visible */}
              <View
                style={[
                  styles.cardAccentGlow,
                  {backgroundColor: card.glowColor},
                ]}
              />
              {/* Glass border top highlight */}
              <View
                style={[
                  styles.cardTopBorder,
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

        {recommendationGraph.length > 0 && (
          <View style={styles.graphCard}>
            <View style={styles.graphHeader}>
              <View>
                <Text style={styles.graphTitle}>Course Suitability</Text>
                <Text style={styles.graphSubtitle}>Latest ARIA recommendation</Text>
              </View>
              <Text style={styles.graphBadge}>{recommendationGraph.length}</Text>
            </View>

            <View style={styles.graphRows}>
              {recommendationGraph.map((program, index) => {
                const barWidth = Math.max(38, (GRAPH_BAR_MAX_WIDTH * program.score) / 100);
                return (
                  <View key={`${program.name}-${index}`} style={styles.graphRow}>
                    <View style={styles.graphLabelWrap}>
                      <Text style={styles.graphCourseName} numberOfLines={1}>
                        {program.name}
                      </Text>
                      <Text style={styles.graphCourseCountry} numberOfLines={1}>
                        {program.country}
                      </Text>
                    </View>
                    <View style={styles.graphTrack}>
                      <View
                        style={[
                          styles.graphBar,
                          {
                            width: barWidth,
                            backgroundColor:
                              index === 0
                                ? Colors.accent
                                : index === 1
                                ? Colors.cardProgramFinder
                                : Colors.cardEligibility,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.graphScore}>{program.score}%</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

      </ScrollView>
    </GradientBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  logoBadge: {
    width: 50,
    height: 50,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: Colors.accent,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  logoImage: {
    width: 50,
    height: 50,
    borderRadius: 16,
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    backgroundColor: Colors.glass,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    marginBottom: 28,
    overflow: 'hidden',
    position: 'relative',
  },
  statsGlassHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: Colors.glassHighlight,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.accent,
  },
  statValueSecondary: {
    color: Colors.secondary,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 3,
    letterSpacing: 0.4,
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.border,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.white,
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
    backgroundColor: Colors.glass,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    overflow: 'hidden',
    position: 'relative',
  },
  cardAccentGlow: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  cardTopBorder: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    height: 2,
    borderRadius: 1,
    opacity: 0.5,
  },
  cardEmoji: {
    fontSize: 30,
    marginBottom: 14,
    marginTop: 4,
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
    marginBottom: 16,
  },
  cardChevron: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardChevronText: {
    fontSize: 14,
    fontWeight: '600',
  },
  graphCard: {
    marginHorizontal: 16,
    backgroundColor: Colors.glass,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    overflow: 'hidden',
    position: 'relative',
  },
  graphHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  graphTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  graphSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 3,
  },
  graphBadge: {
    minWidth: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(139, 92, 246, 0.16)',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    color: Colors.accent,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 32,
  },
  graphRows: {
    gap: 12,
  },
  graphRow: {
    minHeight: 44,
  },
  graphLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  graphCourseName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginRight: 10,
  },
  graphCourseCountry: {
    maxWidth: 88,
    fontSize: 11,
    color: Colors.textMuted,
  },
  graphTrack: {
    height: 9,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    marginRight: 46,
  },
  graphBar: {
    height: 9,
    borderRadius: 5,
  },
  graphScore: {
    position: 'absolute',
    right: 0,
    bottom: -2,
    width: 40,
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    textAlign: 'right',
  },
});

export default HomeScreen;
