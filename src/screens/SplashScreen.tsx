import React, {useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Image,
} from 'react-native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/AppNavigator';
import Colors from '../constants/Colors';
import {loadChatHistory} from '../redux/slices/chatSlice';
import {loadSavedPrograms} from '../redux/slices/programSlice';
import useAppDispatch from '../redux/hooks/useAppDispatch';
import {resolveReachableServiceUrl} from '../config/serviceUrl';
import {setApiBaseURL} from '../services/ApiClient';
import GradientBackground from '../components/GradientBackground';

const {width} = Dimensions.get('window');

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Splash'>;
};

const SplashScreen: React.FC<Props> = ({navigation}) => {
  const dispatch = useAppDispatch();

  const logoScale = useRef(new Animated.Value(0.3)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineTranslate = useRef(new Animated.Value(30)).current;
  const accentOpacity = useRef(new Animated.Value(0)).current;
  const ringScale1 = useRef(new Animated.Value(0.3)).current;
  const ringScale2 = useRef(new Animated.Value(0.3)).current;
  const ringScale3 = useRef(new Animated.Value(0.3)).current;
  const ringOpacity1 = useRef(new Animated.Value(0)).current;
  const ringOpacity2 = useRef(new Animated.Value(0)).current;
  const ringOpacity3 = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(0.4)).current;
  const nameOpacity = useRef(new Animated.Value(0)).current;
  const nameTranslate = useRef(new Animated.Value(15)).current;

  useEffect(() => {
    let active = true;

    // Pre-load Redux data
    dispatch(loadChatHistory());
    dispatch(loadSavedPrograms());

    void (async () => {
      const resolvedBaseUrl = await resolveReachableServiceUrl({
        envKeys: ['BACKEND_URL'],
        port: 5000,
        path: '/api',
        healthPath: '/health',
        timeoutMs: 1200,
      });

      if (active) {
        setApiBaseURL(resolvedBaseUrl);
      }
    })();

    // Pulsing glow loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: 0.8,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse, {
          toValue: 0.3,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    ).start();

    // Animation sequence
    Animated.sequence([
      // Rings expand with stagger
      Animated.stagger(200, [
        Animated.parallel([
          Animated.timing(ringScale1, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity1, {
            toValue: 0.2,
            duration: 700,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(ringScale2, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity2, {
            toValue: 0.12,
            duration: 700,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(ringScale3, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity3, {
            toValue: 0.06,
            duration: 700,
            useNativeDriver: true,
          }),
        ]),
      ]),
      // Logo appears with spring
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      // App name slides up
      Animated.parallel([
        Animated.timing(nameOpacity, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.timing(nameTranslate, {
          toValue: 0,
          duration: 350,
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
    }, 3200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GradientBackground style={styles.container}>

      {/* Ambient glow behind logo */}
      <Animated.View style={[styles.ambientGlow, {opacity: glowPulse}]} />

      {/* Background rings — violet themed */}
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
      <Animated.View
        style={[
          styles.ring,
          styles.ring3,
          {transform: [{scale: ringScale3}], opacity: ringOpacity3},
        ]}
      />

      {/* Logo area */}
      <Animated.View
        style={[
          styles.logoContainer,
          {transform: [{scale: logoScale}], opacity: logoOpacity},
        ]}>
        <View style={styles.logoGlowWrap}>
          <Image
            source={require('../assets/aria_logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>
      </Animated.View>

      {/* App Name */}
      <Animated.View
        style={{
          opacity: nameOpacity,
          transform: [{translateY: nameTranslate}],
        }}>
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
        <Text style={styles.bottomText}>Powered by AI</Text>
        <View style={[styles.accentDot, styles.accentDotSecondary]} />
      </Animated.View>
    </GradientBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ambientGlow: {
    position: 'absolute',
    width: width * 0.7,
    height: width * 0.7,
    borderRadius: width * 0.35,
    backgroundColor: Colors.accent,
    opacity: 0.06,
  },
  ring: {
    position: 'absolute',
    borderRadius: 9999,
    borderWidth: 1,
  },
  ring1: {
    width: width * 0.6,
    height: width * 0.6,
    borderColor: Colors.accent,
  },
  ring2: {
    width: width * 0.85,
    height: width * 0.85,
    borderColor: Colors.accentLight,
  },
  ring3: {
    width: width * 1.15,
    height: width * 1.15,
    borderColor: Colors.secondary,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  logoGlowWrap: {
    borderRadius: 32,
    shadowColor: Colors.accent,
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.6,
    shadowRadius: 30,
    elevation: 15,
  },
  logoImage: {
    width: 100,
    height: 100,
    borderRadius: 28,
  },
  logoText: {
    fontSize: 40,
    fontWeight: '900',
    color: Colors.textPrimary,
    letterSpacing: 8,
    marginBottom: 12,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    letterSpacing: 0.5,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  accentDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.accent,
  },
  accentDotSecondary: {
    backgroundColor: Colors.secondary,
  },
  bottomText: {
    fontSize: 12,
    color: Colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});

export default SplashScreen;
