import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Image,
  ActivityIndicator,
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
import {checkEligibility, clearResults} from '../redux/slices/eligibilitySlice';
import Validators from '../utils/Validators';
import {EligibleCourse} from '../models/EligibilityModel';
import ImagePickerService, {EligibilityDocumentResult} from '../services/imagePicker';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Eligibility'>;
};

type DocumentReadStatus = 'idle' | 'selected' | 'reading' | 'read' | 'failed';

const CourseItem: React.FC<{course: EligibleCourse}> = ({course}) => {
  const statusConfig = {
    eligible: {color: Colors.success, label: '✓ Eligible', bg: 'rgba(52, 211, 153, 0.1)'},
    conditional: {color: Colors.warning, label: '⚡ Conditional', bg: 'rgba(251, 191, 36, 0.1)'},
    not_eligible: {color: Colors.error, label: '✗ Not Eligible', bg: 'rgba(251, 113, 133, 0.1)'},
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

const getDocumentBadgeLabel = (document: EligibilityDocumentResult) => {
  if (document.kind === 'pdf') {
    return 'PDF';
  }

  if (document.kind === 'word') {
    return document.fileName?.toLowerCase().endsWith('.doc') ? 'DOC' : 'DOCX';
  }

  return 'IMG';
};

const getDocumentStatusTitle = (status: DocumentReadStatus) => {
  if (status === 'reading') return 'Reading document';
  if (status === 'read') return 'Document read';
  if (status === 'failed') return 'Could not read document';
  return 'Document ready';
};

const EligibilityScreen: React.FC<Props> = () => {
  const dispatch = useAppDispatch();
  const {results, loading, error} = useAppSelector(s => s.eligibility);

  const [qualification, setQualification] = useState('');
  const [percentage, setPercentage] = useState('');
  const [englishScore, setEnglishScore] = useState('');
  const [workExperience, setWorkExperience] = useState('');
  const [selectedDocument, setSelectedDocument] = useState<EligibilityDocumentResult | null>(null);
  const [documentReadStatus, setDocumentReadStatus] = useState<DocumentReadStatus>('idle');
  const [documentReadMessage, setDocumentReadMessage] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const handlePickDocument = async () => {
    if (!ImagePickerService?.pickEligibilityDocument) {
      setFormErrors({
        document: 'Document picker is not ready. Please rebuild the app after installing the native picker.',
      });
      return;
    }

    const picked = await ImagePickerService.pickEligibilityDocument();
    if (picked?.base64) {
      setSelectedDocument(picked);
      setDocumentReadStatus('selected');
      setDocumentReadMessage(`${picked.fileName || 'Selected document'} is ready. Tap Check Eligibility to read it.`);
      setFormErrors({});
    }
  };

  const handleRemoveDocument = () => {
    setSelectedDocument(null);
    setDocumentReadStatus('idle');
    setDocumentReadMessage('');
  };

  const handleCheck = async () => {
    const documentForRequest = selectedDocument;

    if (!documentForRequest) {
      const validation = Validators.validateEligibilityForm(
        qualification,
        percentage,
        englishScore,
      );
      if (!validation.valid) {
        setFormErrors(validation.errors);
        return;
      }
    } else if (englishScore.trim().length > 0 && !/^[\d.\s/a-zA-Z-]+$/.test(englishScore.trim())) {
      setFormErrors({englishScore: 'Please enter a valid English score format'});
      return;
    }

    setFormErrors({});
    if (documentForRequest) {
      setDocumentReadStatus('reading');
      setDocumentReadMessage(`Reading ${documentForRequest.fileName || 'your document'} and checking eligibility...`);
    }

    try {
      const response = await dispatch(checkEligibility({
      qualification,
      percentage,
      englishScore,
      workExperience,
      document: documentForRequest?.base64
        ? {
            base64: documentForRequest.base64,
            mimeType: documentForRequest.mimeType,
            fileName: documentForRequest.fileName,
          }
        : undefined,
      })).unwrap();

      if (documentForRequest) {
        const extracted = response.extractedProfile;
        const readOk = extracted?.extractionStatus !== 'failed' && Boolean(extracted?.qualification || extracted?.percentage);
        setDocumentReadStatus(readOk ? 'read' : 'failed');
        setDocumentReadMessage(
          extracted?.extractionMessage ||
            (readOk
              ? 'I read the document and used those details for the eligibility result.'
              : 'I could not find qualification and marks in this file. Try a clearer PDF/DOCX/JPG/PNG or type the details below.'),
        );

        if (!qualification.trim() && extracted?.qualification) {
          setQualification(extracted.qualification);
        }
        if (!percentage.trim() && extracted?.percentage) {
          setPercentage(extracted.percentage);
        }
        if (!englishScore.trim() && extracted?.englishScore) {
          setEnglishScore(extracted.englishScore);
        }
        if (!workExperience.trim() && extracted?.workExperience) {
          setWorkExperience(extracted.workExperience);
        }
      }
    } catch (requestError: any) {
      if (documentForRequest) {
        setDocumentReadStatus('failed');
        setDocumentReadMessage(
          typeof requestError === 'string'
            ? requestError
            : 'I could not read qualification and marks from this file. Try a clearer PDF/DOCX/JPG/PNG or type the details below.',
        );
      }
    }
  };

  const handleClear = () => {
    dispatch(clearResults());
    setQualification('');
    setPercentage('');
    setEnglishScore('');
    setWorkExperience('');
    setSelectedDocument(null);
    setDocumentReadStatus('idle');
    setDocumentReadMessage('');
    setFormErrors({});
  };

  return (
    <GradientBackground>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoid}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}>
          <Header
            title={Strings.ELIGIBILITY_TITLE}
            subtitle={Strings.ELIGIBILITY_SUBTITLE}
            showBack
            rightAction={
              results ? {label: 'Reset', onPress: handleClear} : undefined
            }
          />

          {loading && (
            <Loader
              overlay
              message={selectedDocument ? 'Reading document and checking eligibility...' : 'Analysing your profile...'}
            />
          )}

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive">

            <View style={styles.formSection}>
              <View style={styles.uploadCard}>
                <View style={styles.uploadHeader}>
                  <View style={styles.uploadIcon}>
                    <Text style={styles.uploadIconText}>↑</Text>
                  </View>
                  <View style={styles.uploadCopy}>
                    <Text style={styles.uploadTitle}>Upload document</Text>
                    <Text style={styles.uploadHint}>
                      Upload a PDF, DOCX, DOC, clear photo, or screenshot of your 12th marksheet, bachelor marksheet, transcript, degree certificate, or resume.
                    </Text>
                  </View>
                </View>

                {selectedDocument ? (
                  <View style={styles.selectedFile}>
                    {selectedDocument.kind === 'image' && selectedDocument.uri ? (
                      <Image source={{uri: selectedDocument.uri}} style={styles.selectedPreview} />
                    ) : (
                      <View style={styles.pdfPreview}>
                        <Text style={styles.pdfPreviewText}>{getDocumentBadgeLabel(selectedDocument)}</Text>
                      </View>
                    )}
                    <View style={styles.selectedFileInfo}>
                      <Text style={styles.selectedFileName} numberOfLines={1}>
                        {selectedDocument.fileName || 'Selected document'}
                      </Text>
                      <Text style={styles.selectedFileMeta}>
                        AI will read qualification, marks, subjects, and experience from this file.
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.removeFileButton}
                      onPress={handleRemoveDocument}
                      activeOpacity={0.8}>
                      <Text style={styles.removeFileText}>×</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={styles.uploadButton}
                  onPress={handlePickDocument}
                  activeOpacity={0.85}>
                  <Text style={styles.uploadButtonText}>
                    {selectedDocument ? 'Change File' : '+ Choose File'}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.manualHint}>
                Optional: add or correct details below if the document is unclear.
              </Text>

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
              <Text style={styles.optionalHint}>Optional. Add it if you already know your IELTS/PTE/TOEFL score.</Text>
              <CustomInput
                label={Strings.ELIGIBILITY_WORK_LABEL}
                placeholder={Strings.ELIGIBILITY_WORK_PLACEHOLDER}
                value={workExperience}
                onChangeText={setWorkExperience}
              />

              {selectedDocument && documentReadStatus !== 'idle' ? (
                <View
                  style={[
                    styles.documentStatusCard,
                    documentReadStatus === 'failed'
                      ? styles.documentStatusCardFailed
                      : documentReadStatus === 'read'
                      ? styles.documentStatusCardRead
                      : null,
                  ]}>
                  <View style={styles.documentStatusHeader}>
                    <View style={styles.documentStatusTitleRow}>
                      {documentReadStatus === 'reading' ? (
                        <ActivityIndicator color={Colors.success} size="small" />
                      ) : (
                        <View
                          style={[
                            styles.documentStatusDot,
                            documentReadStatus === 'failed'
                              ? styles.documentStatusDotFailed
                              : documentReadStatus === 'read'
                              ? styles.documentStatusDotRead
                              : null,
                          ]}
                        />
                      )}
                      <Text style={styles.documentStatusTitle}>
                        {getDocumentStatusTitle(documentReadStatus)}
                      </Text>
                    </View>
                    <Text style={styles.documentStatusBadge}>
                      {getDocumentBadgeLabel(selectedDocument)}
                    </Text>
                  </View>
                  <Text style={styles.documentStatusText}>
                    {documentReadMessage}
                  </Text>

                  {results?.extractedProfile && documentReadStatus === 'read' ? (
                    <View style={styles.documentReadGrid}>
                      {[
                        ['Qualification', results.extractedProfile.qualification],
                        ['Score', results.extractedProfile.percentage],
                        ['Source', results.extractedProfile.sourceType],
                      ].filter(([, value]) => Boolean(value)).map(([label, value]) => (
                        <View key={label} style={styles.documentReadItem}>
                          <Text style={styles.documentReadLabel}>{label}</Text>
                          <Text style={styles.documentReadValue}>{value}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}

              {error && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>⚠️ {error}</Text>
                </View>
              )}
              {formErrors.document ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>⚠️ {formErrors.document}</Text>
                </View>
              ) : null}

              <CustomButton
                title={Strings.ELIGIBILITY_SUBMIT}
                onPress={handleCheck}
                loading={loading}
                style={styles.submitButton}
              />
            </View>

            {results && (
              <View style={styles.resultsSection}>
                {results.extractedProfile && (
                  <View style={styles.extractedCard}>
                    <Text style={styles.extractedTitle}>Read from document</Text>
                    {results.extractedProfile.documentSummary ? (
                      <Text style={styles.summaryText}>
                        {results.extractedProfile.documentSummary}
                      </Text>
                    ) : null}
                    <View style={styles.extractedGrid}>
                      {[
                        ['Qualification', results.extractedProfile.qualification],
                        ['Score', results.extractedProfile.percentage],
                        ['English', results.extractedProfile.englishScore],
                        ['Experience', results.extractedProfile.workExperience],
                      ].filter(([, value]) => Boolean(value)).map(([label, value]) => (
                        <View key={label} style={styles.extractedItem}>
                          <Text style={styles.extractedLabel}>{label}</Text>
                          <Text style={styles.extractedValue}>{value}</Text>
                        </View>
                      ))}
                    </View>
                    {results.extractedProfile.nextStep ? (
                      <Text style={styles.nextStepText}>{results.extractedProfile.nextStep}</Text>
                    ) : null}
                  </View>
                )}

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
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  formSection: {
    padding: 20,
  },
  uploadCard: {
    backgroundColor: Colors.glass,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  uploadHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  uploadIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.24)',
  },
  uploadIconText: {
    color: Colors.success,
    fontSize: 22,
    fontWeight: '800',
  },
  uploadCopy: {
    flex: 1,
  },
  uploadTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 5,
  },
  uploadHint: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  selectedFile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.62)',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    marginBottom: 12,
  },
  selectedPreview: {
    width: 46,
    height: 46,
    borderRadius: 8,
    backgroundColor: Colors.border,
  },
  pdfPreview: {
    width: 46,
    height: 46,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.24)',
  },
  pdfPreviewText: {
    color: Colors.error,
    fontSize: 11,
    fontWeight: '800',
  },
  selectedFileInfo: {
    flex: 1,
    minWidth: 0,
  },
  selectedFileName: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  selectedFileMeta: {
    color: Colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  removeFileButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
  },
  removeFileText: {
    color: Colors.textSecondary,
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '600',
  },
  uploadButton: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.success,
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
  },
  uploadButtonText: {
    color: Colors.success,
    fontSize: 15,
    fontWeight: '800',
  },
  manualHint: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  submitButton: {
    marginTop: 8,
  },
  optionalHint: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: -8,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  documentStatusCard: {
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.22)',
  },
  documentStatusCardRead: {
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderColor: 'rgba(34, 197, 94, 0.24)',
  },
  documentStatusCardFailed: {
    backgroundColor: 'rgba(251, 113, 133, 0.1)',
    borderColor: Colors.error,
  },
  documentStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  documentStatusTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  documentStatusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: Colors.info,
  },
  documentStatusDotRead: {
    backgroundColor: Colors.success,
  },
  documentStatusDotFailed: {
    backgroundColor: Colors.error,
  },
  documentStatusTitle: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  documentStatusBadge: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.62)',
    overflow: 'hidden',
  },
  documentStatusText: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  documentReadGrid: {
    gap: 7,
    marginTop: 12,
  },
  documentReadItem: {
    flexDirection: 'row',
    gap: 8,
  },
  documentReadLabel: {
    width: 88,
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  documentReadValue: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
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
  extractedCard: {
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.2)',
  },
  extractedTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.success,
    marginBottom: 8,
  },
  extractedGrid: {
    gap: 8,
    marginTop: 12,
  },
  extractedItem: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  extractedLabel: {
    width: 92,
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  extractedValue: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  nextStepText: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
  },
  summaryCard: {
    backgroundColor: Colors.glass,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  summaryTitle: {
    fontSize: 15,
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
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  recommendationsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.accent,
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
    backgroundColor: Colors.accent,
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
    backgroundColor: Colors.glass,
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
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
