import React, {useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  StatusBar,
  Dimensions,
} from 'react-native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/AppNavigator';
import Colors from '../constants/Colors';
import {loadChatHistory} from '../redux/slices/chatSlice';
import {loadSavedPrograms} from '../redux/slices/programSlice';
import useAppDispatch from '../redux/hooks/useAppDispatch';

const {width} = Dimensions.get('window');

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Splash'>;
};

const SplashScreen: React.FC<Props> = ({navigation}) => {
  const dispatch = useAppDispatch();

  const logoScale = useRef(new Animated.Value(0.4)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineTranslate = useRef(new Animated.Value(20)).current;
  const accentOpacity = useRef(new Animated.Value(0)).current;
  const ringScale1 = useRef(new Animated.Value(0.5)).current;
  const ringScale2 = useRef(new Animated.Value(0.5)).current;
  const ringOpacity1 = useRef(new Animated.Value(0)).current;
  const ringOpacity2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Pre-load Redux data
    dispatch(loadChatHistory());
    dispatch(loadSavedPrograms());

    // Animation sequence
    Animated.sequence([
      // Rings expand
      Animated.parallel([
        Animated.timing(ringScale1, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(ringOpacity1, {
          toValue: 0.15,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(ringScale2, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(ringOpacity2, {
          toValue: 0.1,
          duration: 600,
          useNativeDriver: true,
        }),
        // Logo appears
        Animated.spring(logoScale, {
          toValue: 1,
          tension: 60,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      // Tagline slides up
      Animated.parallel([
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(taglineTranslate, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(accentOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // Navigate after delay
    const timer = setTimeout(() => {
      navigation.replace('Home');
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      {/* Background rings */}
      <Animated.View
        style={[
          styles.ring,
          styles.ring1,
          {transform: [{scale: ringScale1}], opacity: ringOpacity1},
        ]}
      />
      <Animated.View
        style={[
          styles.ring,
          styles.ring2,
          {transform: [{scale: ringScale2}], opacity: ringOpacity2},
        ]}
      />

      {/* Logo area */}
      <Animated.View
        style={[
          styles.logoContainer,
          {transform: [{scale: logoScale}], opacity: logoOpacity},
        ]}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoLetter}>A</Text>
        </View>
        <Text style={styles.logoText}>ARIA</Text>
      </Animated.View>

      {/* Tagline */}
      <Animated.View
        style={{
          opacity: taglineOpacity,
          transform: [{translateY: taglineTranslate}],
        }}>
        <Text style={styles.tagline}>Applicant Resource &</Text>
        <Text style={styles.tagline}>Intelligence Assistant</Text>
      </Animated.View>

      {/* Bottom accent */}
      <Animated.View style={[styles.bottomBar, {opacity: accentOpacity}]}>
        <View style={styles.accentDot} />
        <Text style={styles.bottomText}>Powered by Gemini AI</Text>
        <View style={styles.accentDot} />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderRadius: 9999,
    borderWidth: 1.5,
    borderColor: Colors.accent,
  },
  ring1: {
    width: width * 0.75,
    height: width * 0.75,
  },
  ring2: {
    width: width * 1.1,
    height: width * 1.1,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoBadge: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: Colors.accent,
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  logoLetter: {
    fontSize: 44,
    fontWeight: '800',
    color: Colors.textInverse,
    letterSpacing: -1,
  },
  logoText: {
    fontSize: 36,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: 6,
  },
  tagline: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    letterSpacing: 0.3,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  accentDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.accent,
  },
  bottomText: {
    fontSize: 12,
    color: Colors.textMuted,
    letterSpacing: 0.5,
  },
});

export default SplashScreen;