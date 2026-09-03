import React, {useMemo, useState} from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {PROGRAM_CATALOG, ProgramCatalogItem} from '../data/programCatalog';
import Header from '../components/Header';
import GradientBackground from '../components/GradientBackground';
import Colors from '../constants/Colors';
import Strings from '../constants/Strings';
import {RootStackParamList} from '../navigation/AppNavigator';
import useAppDispatch from '../redux/hooks/useAppDispatch';
import useAppSelector from '../redux/hooks/useAppSelector';
import {saveProgram} from '../redux/slices/programSlice';
import {Program} from '../models/ProgramModel';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AllPrograms'>;
};

const LEVEL_FILTERS = ['All', 'UG', 'PG', 'Diploma'] as const;
type LevelFilter = (typeof LEVEL_FILTERS)[number];

const catalogItemToProgram = (program: ProgramCatalogItem): Program => ({
  name: program.name,
  university: program.university,
  country: program.country,
  duration: program.duration,
  intake: program.intake,
  eligibility: program.eligibility,
  careerOpportunities: program.careerOpportunities,
  matchScore: 100,
});

const AllProgramsScreen: React.FC<Props> = () => {
  const dispatch = useAppDispatch();
  const savedPrograms = useAppSelector(s => s.programs.savedPrograms);
  const [selectedLevel, setSelectedLevel] = useState<LevelFilter>('All');
  const [selectedCountry, setSelectedCountry] = useState('All');

  const countries = useMemo(
    () => ['All', ...Array.from(new Set(PROGRAM_CATALOG.map(program => program.country))).sort()],
    [],
  );

  const visiblePrograms = useMemo(
    () =>
      PROGRAM_CATALOG.filter(program => {
        const levelMatches = selectedLevel === 'All' || program.level === selectedLevel;
        const countryMatches =
          selectedCountry === 'All' || program.country === selectedCountry;
        return levelMatches && countryMatches;
      }),
    [selectedCountry, selectedLevel],
  );

  const isSaved = (program: ProgramCatalogItem) =>
    savedPrograms.some(
      saved =>
        saved.name === program.name && saved.university === program.university,
    );

  const handleSave = (program: ProgramCatalogItem) => {
    if (isSaved(program)) {
      Alert.alert('Already Saved', `${program.name} is already in your saved programs.`);
      return;
    }

    dispatch(saveProgram(catalogItemToProgram(program)));
    Alert.alert('Saved!', `${program.name} has been added to your saved programs.`);
  };

  return (
    <GradientBackground>
      <SafeAreaView style={styles.container}>
        <Header
          title={Strings.ALL_PROGRAMS_TITLE}
          subtitle={`${PROGRAM_CATALOG.length} catalog programs`}
          showBack
        />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryGlow} />
            <Text style={styles.summaryKicker}>Program Catalog</Text>
            <Text style={styles.summaryTitle}>Browse every available program</Text>
            <Text style={styles.summaryText}>
              View the complete list, filter by level or country, and save programs
              to your profile.
            </Text>
          </View>

          <View style={styles.filterSection}>
            <Text style={styles.filterTitle}>Level</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}>
              {LEVEL_FILTERS.map(level => (
                <TouchableOpacity
                  key={level}
                  style={[
                    styles.filterChip,
                    selectedLevel === level && styles.filterChipActive,
                  ]}
                  onPress={() => setSelectedLevel(level)}
                  activeOpacity={0.75}>
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedLevel === level && styles.filterChipTextActive,
                    ]}>
                    {level}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.filterTitle, styles.countryFilterTitle]}>
              Country
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}>
              {countries.map(country => (
                <TouchableOpacity
                  key={country}
                  style={[
                    styles.filterChip,
                    selectedCountry === country && styles.filterChipActive,
                  ]}
                  onPress={() => setSelectedCountry(country)}
                  activeOpacity={0.75}>
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedCountry === country && styles.filterChipTextActive,
                    ]}>
                    {country}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.resultsHeader}>
            <Text style={styles.resultsTitle}>
              {visiblePrograms.length} Programs
            </Text>
            <Text style={styles.resultsSubtitle}>
              {selectedLevel === 'All' ? 'Any level' : selectedLevel} ·{' '}
              {selectedCountry === 'All' ? 'Any country' : selectedCountry}
            </Text>
          </View>

          <View style={styles.programList}>
            {visiblePrograms.map(program => {
              const saved = isSaved(program);
              return (
                <View
                  key={`${program.name}-${program.university}`}
                  style={styles.programCard}>
                  <View style={styles.programHeader}>
                    <View style={styles.programHeaderText}>
                      <Text style={styles.programName}>{program.name}</Text>
                      <Text style={styles.programUniversity}>
                        {program.university}
                      </Text>
                    </View>
                    <View style={styles.levelBadge}>
                      <Text style={styles.levelBadgeText}>{program.level}</Text>
                    </View>
                  </View>

                  <View style={styles.metaRow}>
                    <View style={styles.metaChip}>
                      <Text style={styles.metaText}>{program.country}</Text>
                    </View>
                    <View style={styles.metaChip}>
                      <Text style={styles.metaText}>{program.duration}</Text>
                    </View>
                    <View style={styles.metaChip}>
                      <Text style={styles.metaText}>{program.intake}</Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <Text style={styles.detailLabel}>Eligibility</Text>
                  <Text style={styles.detailText}>{program.eligibility}</Text>

                  <Text style={styles.detailLabel}>Career Paths</Text>
                  <View style={styles.careerRow}>
                    {program.careerOpportunities.slice(0, 3).map(career => (
                      <View key={career} style={styles.careerChip}>
                        <Text style={styles.careerText}>{career}</Text>
                      </View>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={[styles.saveButton, saved && styles.savedButton]}
                    onPress={() => handleSave(program)}
                    activeOpacity={0.8}>
                    <Text
                      style={[
                        styles.saveButtonText,
                        saved && styles.savedButtonText,
                      ]}>
                      {saved ? '✓ Saved' : '+ Save Program'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  summaryCard: {
    backgroundColor: Colors.glass,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    padding: 18,
    marginBottom: 18,
    overflow: 'hidden',
  },
  summaryGlow: {
    position: 'absolute',
    top: -34,
    right: -24,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  summaryKicker: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.cardProgramFinder,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  filterSection: {
    marginBottom: 18,
  },
  filterTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  countryFilterTitle: {
    marginTop: 14,
  },
  chipRow: {
    gap: 8,
    paddingRight: 20,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    borderColor: Colors.accent,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: Colors.accentDark,
  },
  resultsHeader: {
    marginBottom: 12,
  },
  resultsTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  resultsSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 3,
  },
  programList: {
    gap: 14,
  },
  programCard: {
    backgroundColor: Colors.glass,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  programHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  programHeaderText: {
    flex: 1,
  },
  programName: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 3,
  },
  programUniversity: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  levelBadge: {
    minWidth: 56,
    height: 32,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  levelBadgeText: {
    fontSize: 12,
    color: Colors.cardProgramFinder,
    fontWeight: '800',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  metaChip: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  metaText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '700',
    marginBottom: 5,
  },
  detailText: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  careerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  careerChip: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  careerText: {
    fontSize: 11,
    color: Colors.accent,
    fontWeight: '600',
  },
  saveButton: {
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.accent,
  },
  savedButton: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },
  saveButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.accent,
  },
  savedButtonText: {
    color: Colors.accentDark,
  },
});

export default AllProgramsScreen;
