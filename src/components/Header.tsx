import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import Colors from '../constants/Colors';

interface HeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  rightAction?: {
    label: string;
    onPress: () => void;
  };
}

const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  showBack = false,
  rightAction,
}) => {
  const navigation = useNavigation();

  return (
    <>
      <View style={styles.container}>
        <View style={styles.gradientGlow} />
        <View style={styles.gradientGlowTwo} />
        <View style={styles.innerContent}>
          <View style={styles.leftSection}>
            {showBack && (
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => navigation.goBack()}
                hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                <Text style={styles.backArrow}>←</Text>
              </TouchableOpacity>
            )}
            <View style={styles.titleBlock}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              {subtitle && (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              )}
            </View>
          </View>
          {rightAction && (
            <TouchableOpacity
              style={styles.rightAction}
              onPress={rightAction.onPress}
              hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <Text style={styles.rightActionText}>{rightAction.label}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <View style={styles.dividerContainer}>
        <View style={styles.divider} />
        <View style={styles.dividerAccent} />
        <View style={styles.dividerAccentTwo} />
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.1)',
  },
  innerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  gradientGlow: {
    position: 'absolute',
    top: -40,
    left: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
  },
  gradientGlowTwo: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(59, 130, 246, 0.06)',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.glass,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  backArrow: {
    fontSize: 18,
    color: Colors.textPrimary,
    fontWeight: '400',
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  rightAction: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.18)',
  },
  rightActionText: {
    fontSize: 13,
    color: Colors.accent,
    fontWeight: '600',
  },
  dividerContainer: {
    position: 'relative',
    height: 1,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(226, 232, 240, 0.8)',
    marginHorizontal: 0,
  },
  dividerAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '45%',
    height: 1,
    backgroundColor: 'rgba(139, 92, 246, 0.25)',
  },
  dividerAccentTwo: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: '30%',
    height: 1,
    backgroundColor: 'rgba(59, 130, 246, 0.18)',
  },
});

export default Header;
