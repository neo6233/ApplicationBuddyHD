import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/AppNavigator';
import Colors from '../constants/Colors';
import Strings from '../constants/Strings';
import CustomInput from '../components/CustomInput';
import CustomButton from '../components/CustomButton';
import Header from '../components/Header';
import Loader from '../components/Loader';
import useAppDispatch from '../redux/hooks/useAppDispatch';
import useAppSelector from '../redux/hooks/useAppSelector';
import {checkEligibility, clearResults} from '../redux/slices/eligibilitySlice';
import Validators from '../utils/Validators';
import {EligibleCourse} from '../models/EligibilityModel';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Eligibility'>;
};

const CourseItem: React.FC<{course: EligibleCourse}> = ({course}) => {
  const statusConfig = {
    eligible: {color: Colors.success, label: '✓ Eligible', bg: 'rgba(0, 229, 160, 0.1)'},
    conditional: {color: Colors.warning, label: '⚡ Conditional', bg: 'rgba(255, 184, 48, 0.1)'},
    not_eligible: {color: Colors.error, label: '✗ Not Eligible', bg: 'rgba(255, 77, 106, 0.1)'},
  };

  const config = statusConfig[course.status];
  const courseItemStyle =
    course.status === 'eligible'
      ? styles.courseItemEligible
      : course.status === 'conditional'
      ? styles.courseItemConditional
      : styles.courseItemNotEligible;

  return (
    <View style={[styles.courseItem, courseItemStyle]}>
      <View style={styles.courseHeader}>
        <View style={styles.courseInfo}>
          <Text style={styles.courseName}>{course.name}</Text>
          <Text style={styles.courseUniversity}>{course.university} · {course.country}</Text>
        </View>
        <View style={[styles.statusBadge, {backgroundColor: config.bg}]}>
          <Text style={[styles.statusText, {color: config.color}]}>
            {config.label}
          </Text>
        </View>
      </View>
      <Text style={styles.courseReason}>{course.reason}</Text>
      {course.minimumRequirement && (
        <Text style={styles.courseRequirement}>
          Min. Req: {course.minimumRequirement}
        </Text>
      )}
    </View>
  );
};

const EligibilityScreen: React.FC<Props> = () => {
  const dispatch = useAppDispatch();
  const {results, loading, error} = useAppSelector(s => s.eligibility);

  const [qualification, setQualification] = useState('');
  const [percentage, setPercentage] = useState('');
  const [englishScore, setEnglishScore] = useState('');
  const [workExperience, setWorkExperience] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const handleCheck = async () => {
    const validation = Validators.validateEligibilityForm(
      qualification,
      percentage,
      englishScore,
    );
    if (!validation.valid) {
      setFormErrors(validation.errors);
      return;
    }
    setFormErrors({});
    await dispatch(checkEligibility({qualification, percentage, englishScore, workExperience}));
  };

  const handleClear = () => {
    dispatch(clearResults());
    setQualification('');
    setPercentage('');
    setEnglishScore('');
    setWorkExperience('');
    setFormErrors({});
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <Header
        title={Strings.ELIGIBILITY_TITLE}
        subtitle={Strings.ELIGIBILITY_SUBTITLE}
        showBack
        rightAction={
          results ? {label: 'Reset', onPress: handleClear} : undefined
        }
      />

      {loading && <Loader overlay message="Analysing your profile..." />}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">

        <View style={styles.formSection}>
          <CustomInput
            label={Strings.ELIGIBILITY_QUALIFICATION_LABEL}
            placeholder={Strings.ELIGIBILITY_QUALIFICATION_PLACEHOLDER}
            value={qualification}
            onChangeText={setQualification}
            error={formErrors.qualification}
          />
          <CustomInput
            label={Strings.ELIGIBILITY_PERCENTAGE_LABEL}
            placeholder={Strings.ELIGIBILITY_PERCENTAGE_PLACEHOLDER}
            value={percentage}
            onChangeText={setPercentage}
            error={formErrors.percentage}
          />
          <CustomInput
            label={Strings.ELIGIBILITY_IELTS_LABEL}
            placeholder={Strings.ELIGIBILITY_IELTS_PLACEHOLDER}
            value={englishScore}
            onChangeText={setEnglishScore}
            error={formErrors.englishScore}
          />
          <CustomInput
            label={Strings.ELIGIBILITY_WORK_LABEL}
            placeholder={Strings.ELIGIBILITY_WORK_PLACEHOLDER}
            value={workExperience}
            onChangeText={setWorkExperience}
          />

          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>⚠️ {error}</Text>
            </View>
          )}

          <CustomButton
            title={Strings.ELIGIBILITY_SUBMIT}
            onPress={handleCheck}
            loading={loading}
            style={styles.submitButton}
          />
        </View>

        {results && (
          <View style={styles.resultsSection}>
            {/* Summary */}
            {results.summary && (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>📊 Summary</Text>
                <Text style={styles.summaryText}>{results.summary}</Text>
              </View>
            )}

            {/* Recommendations */}
            {results.recommendations.length > 0 && (
              <View style={styles.recommendationsCard}>
                <Text style={styles.recommendationsTitle}>
                  💡 Recommendations
                </Text>
                {results.recommendations.map((rec, i) => (
                  <View key={i} style={styles.recommendationItem}>
                    <View style={styles.recDot} />
                    <Text style={styles.recText}>{rec}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Eligible Courses */}
            {results.eligibleCourses.length > 0 && (
              <View style={styles.courseSection}>
                <View style={styles.sectionHeader}>
                  <View
                    style={[
                      styles.sectionIndicator,
                      {backgroundColor: Colors.success},
                    ]}
                  />
                  <Text style={styles.sectionTitle}>
                    Eligible Programs ({results.eligibleCourses.length})
                  </Text>
                </View>
                {results.eligibleCourses.map((course, i) => (
                  <CourseItem key={i} course={course} />
                ))}
              </View>
            )}

            {/* Not Eligible Courses */}
            {results.notEligibleCourses.length > 0 && (
              <View style={styles.courseSection}>
                <View style={styles.sectionHeader}>
                  <View
                    style={[
                      styles.sectionIndicator,
                      {backgroundColor: Colors.error},
                    ]}
                  />
                  <Text style={styles.sectionTitle}>
                    Not Yet Eligible ({results.notEligibleCourses.length})
                  </Text>
                </View>
                {results.notEligibleCourses.map((course, i) => (
                  <CourseItem key={i} course={course} />
                ))}
              </View>
            )}
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
    paddingBottom: 40,
  },
  formSection: {
    padding: 20,
  },
  submitButton: {
    marginTop: 8,
  },
  errorBanner: {
    backgroundColor: 'rgba(255, 77, 106, 0.1)',
    borderRadius: 10,
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
  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 21,
  },
  recommendationsCard: {
    backgroundColor: 'rgba(123, 97, 255, 0.08)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(123, 97, 255, 0.2)',
  },
  recommendationsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.secondary,
    marginBottom: 10,
  },
  recommendationItem: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
    alignItems: 'flex-start',
  },
  recDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.secondary,
    marginTop: 7,
    flexShrink: 0,
  },
  recText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  courseSection: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionIndicator: {
    width: 4,
    height: 18,
    borderRadius: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  courseItem: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  courseItemEligible: {
    borderLeftColor: Colors.success,
    borderLeftWidth: 3,
  },
  courseItemConditional: {
    borderLeftColor: Colors.warning,
    borderLeftWidth: 3,
  },
  courseItemNotEligible: {
    borderLeftColor: Colors.error,
    borderLeftWidth: 3,
  },
  courseHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  courseInfo: {
    flex: 1,
  },
  courseName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  courseUniversity: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  courseReason: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 4,
  },
  courseRequirement: {
    fontSize: 11,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
});

export default EligibilityScreen;
