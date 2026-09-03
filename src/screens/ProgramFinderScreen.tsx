import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/AppNavigator';
import Colors from '../constants/Colors';
import Strings from '../constants/Strings';
import CustomInput from '../components/CustomInput';
import CustomButton from '../components/CustomButton';
import Header from '../components/Header';
import GradientBackground from '../components/GradientBackground';
import Loader from '../components/Loader';
import useAppDispatch from '../redux/hooks/useAppDispatch';
import useAppSelector from '../redux/hooks/useAppSelector';
import {findPrograms, clearResults, saveProgram} from '../redux/slices/programSlice';
import Validators from '../utils/Validators';
import {Program} from '../models/ProgramModel';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ProgramFinder'>;
};

const ProgramCard: React.FC<{
  program: Program;
  onSave: (p: Program) => void;
  isSaved: boolean;
}> = ({program, onSave, isSaved}) => {
  const scoreColor =
    program.matchScore >= 80
      ? Colors.success
      : program.matchScore >= 60
      ? Colors.warning
      : Colors.error;

  return (
    <View style={styles.programCard}>
      <View style={styles.programCardHeader}>
        <View style={styles.programInfo}>
          <Text style={styles.programName}>{program.name}</Text>
          <Text style={styles.programUniversity}>{program.university}</Text>
        </View>
        <View style={[styles.matchBadge, {borderColor: scoreColor}]}>
          <Text style={[styles.matchScore, {color: scoreColor}]}>
            {program.matchScore}%
          </Text>
          <Text style={[styles.matchLabel, {color: scoreColor}]}>Match</Text>
        </View>
      </View>

      <View style={styles.programMeta}>
        <View style={styles.metaChip}>
          <Text style={styles.metaLabel}>📍</Text>
          <Text style={styles.metaValue}>{program.country}</Text>
        </View>
        <View style={styles.metaChip}>
          <Text style={styles.metaLabel}>⏱</Text>
          <Text style={styles.metaValue}>{program.duration}</Text>
        </View>
        <View style={styles.metaChip}>
          <Text style={styles.metaLabel}>📅</Text>
          <Text style={styles.metaValue}>{program.intake}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.eligibilityRow}>
        <Text style={styles.eligibilityLabel}>Requirements:</Text>
        <Text style={styles.eligibilityValue}>{program.eligibility}</Text>
      </View>

      {program.careerOpportunities.length > 0 && (
        <View style={styles.careersSection}>
          <Text style={styles.careersLabel}>Career Paths:</Text>
          <View style={styles.careersRow}>
            {program.careerOpportunities.slice(0, 3).map((c, i) => (
              <View key={i} style={styles.careerChip}>
                <Text style={styles.careerText}>{c}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <TouchableOpacity
        style={[styles.saveButton, isSaved && styles.savedButton]}
        onPress={() => onSave(program)}
        activeOpacity={0.8}>
        <Text style={[styles.saveButtonText, isSaved && styles.savedButtonText]}>
          {isSaved ? '✓ Saved' : '+ Save Program'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const ProgramFinderScreen: React.FC<Props> = () => {
  const dispatch = useAppDispatch();
  const {results, loading, error, savedPrograms} = useAppSelector(
    s => s.programs,
  );

  const [qualification, setQualification] = useState('');
  const [gpa, setGpa] = useState('');
  const [interests, setInterests] = useState('');
  const [preferredCountry, setPreferredCountry] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const handleSearch = async () => {
    const validation = Validators.validateProgramForm(
      qualification,
      gpa,
      interests,
      preferredCountry,
    );
    if (!validation.valid) {
      setFormErrors(validation.errors);
      dispatch(clearResults());
      return;
    }
    setFormErrors({});
    await dispatch(findPrograms({qualification, gpa, interests, preferredCountry}));
  };

  const handleSave = (program: Program) => {
    dispatch(saveProgram(program));
    Alert.alert('Saved!', `${program.name} has been added to your saved programs.`);
  };

  const isSaved = (program: Program) =>
    savedPrograms.some(
      p => p.name === program.name && p.university === program.university,
    );

  const handleClear = () => {
    dispatch(clearResults());
    setQualification('');
    setGpa('');
    setInterests('');
    setPreferredCountry('');
    setFormErrors({});
  };

  return (
    <GradientBackground>
      <SafeAreaView style={styles.container}>
      <Header
        title={Strings.PROGRAM_TITLE}
        subtitle={Strings.PROGRAM_SUBTITLE}
        showBack
        rightAction={
          results ? {label: 'Reset', onPress: handleClear} : undefined
        }
      />

      {loading && (
        <Loader
          overlay
          message="Finding matching programs..."
        />
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">

        {/* Form */}
        <View style={styles.formSection}>
          <CustomInput
            label={Strings.PROGRAM_QUALIFICATION_LABEL}
            placeholder={Strings.PROGRAM_QUALIFICATION_PLACEHOLDER}
            value={qualification}
            onChangeText={setQualification}
            error={formErrors.qualification}
          />
          <CustomInput
            label={Strings.PROGRAM_GPA_LABEL}
            placeholder={Strings.PROGRAM_GPA_PLACEHOLDER}
            value={gpa}
            onChangeText={setGpa}
            error={formErrors.gpa}
            keyboardType="default"
          />
          <CustomInput
            label={Strings.PROGRAM_INTERESTS_LABEL}
            placeholder={Strings.PROGRAM_INTERESTS_PLACEHOLDER}
            value={interests}
            onChangeText={setInterests}
            error={formErrors.interests}
            multiline
            numberOfLines={3}
          />
          <CustomInput
            label={Strings.PROGRAM_COUNTRY_LABEL}
            placeholder={Strings.PROGRAM_COUNTRY_PLACEHOLDER}
            value={preferredCountry}
            onChangeText={setPreferredCountry}
            error={formErrors.preferredCountry}
          />

          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>⚠️ {error}</Text>
            </View>
          )}

          <CustomButton
            title={Strings.PROGRAM_SUBMIT}
            onPress={handleSearch}
            loading={loading}
            style={styles.submitButton}
          />
        </View>

        {/* Results */}
        {results && (
          <View style={styles.resultsSection}>
            <View style={styles.resultsMeta}>
              <Text style={styles.resultsTitle}>
                {results.totalFound} Programs Found
              </Text>
              {results.summary ? (
                <Text style={styles.resultsSummary}>{results.summary}</Text>
              ) : null}
            </View>

            {results.programs.length === 0 ? (
              <View style={styles.noResults}>
                <Text style={styles.noResultsText}>
                  {Strings.PROGRAM_NO_RESULTS}
                </Text>
              </View>
            ) : (
              results.programs.map((program, index) => (
                <ProgramCard
                  key={index}
                  program={program}
                  onSave={handleSave}
                  isSaved={isSaved(program)}
                />
              ))
            )}
          </View>
        )}
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
    paddingBottom: 40,
  },
  formSection: {
    padding: 20,
  },
  submitButton: {
    marginTop: 8,
  },
  errorBanner: {
    backgroundColor: 'rgba(251, 113, 133, 0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  errorBannerText: {
    color: Colors.error,
    fontSize: 14,
  },
  resultsSection: {
    paddingHorizontal: 16,
  },
  resultsMeta: {
    marginBottom: 16,
  },
  resultsTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.accent,
    marginBottom: 4,
  },
  resultsSummary: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  noResults: {
    padding: 28,
    alignItems: 'center',
    backgroundColor: Colors.glass,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  noResultsText: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  programCard: {
    backgroundColor: Colors.glass,
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  programCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  programInfo: {
    flex: 1,
    marginRight: 12,
  },
  programName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 3,
  },
  programUniversity: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  matchBadge: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 58,
  },
  matchScore: {
    fontSize: 16,
    fontWeight: '800',
  },
  matchLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  programMeta: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  metaLabel: {
    fontSize: 12,
  },
  metaValue: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginBottom: 12,
  },
  eligibilityRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  eligibilityLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  eligibilityValue: {
    fontSize: 12,
    color: Colors.textSecondary,
    flex: 1,
  },
  careersSection: {
    marginBottom: 14,
  },
  careersLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '600',
    marginBottom: 6,
  },
  careersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
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
    fontWeight: '500',
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
    fontWeight: '600',
    color: Colors.accent,
  },
  savedButtonText: {
    color: Colors.accentDark,
  },
});

export default ProgramFinderScreen;
