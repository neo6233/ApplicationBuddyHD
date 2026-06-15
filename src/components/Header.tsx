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
      <View style={styles.divider} />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Colors.background,
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
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  rightActionText: {
    fontSize: 13,
    color: Colors.accent,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 0,
  },
});

export default Header;
