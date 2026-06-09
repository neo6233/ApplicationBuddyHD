import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import Colors from '../constants/Colors';

interface CustomButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

const CustomButton: React.FC<CustomButtonProps> = ({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  style,
  textStyle,
  icon,
}) => {
  const isDisabled = disabled || loading;

  const getContainerStyle = (): ViewStyle => {
    const base: ViewStyle = {
      ...styles.base,
    };
    switch (variant) {
      case 'primary':
        return {...base, ...styles.primary, opacity: isDisabled ? 0.5 : 1};
      case 'secondary':
        return {...base, ...styles.secondary, opacity: isDisabled ? 0.5 : 1};
      case 'outline':
        return {...base, ...styles.outline, opacity: isDisabled ? 0.5 : 1};
      case 'ghost':
        return {...base, ...styles.ghost, opacity: isDisabled ? 0.5 : 1};
      default:
        return {...base, ...styles.primary, opacity: isDisabled ? 0.5 : 1};
    }
  };

  const getTextStyle = (): TextStyle => {
    switch (variant) {
      case 'outline':
        return {...styles.text, color: Colors.accent};
      case 'ghost':
        return {...styles.text, color: Colors.textSecondary};
      default:
        return styles.text;
    }
  };

  return (
    <TouchableOpacity
      style={[getContainerStyle(), style]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}>
      {loading ? (
        <ActivityIndicator
          color={variant === 'outline' ? Colors.accent : Colors.textInverse}
          size="small"
        />
      ) : (
        <>
          {icon}
          <Text style={[getTextStyle(), textStyle]}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    minHeight: 52,
  },
  primary: {
    backgroundColor: Colors.accent,
  },
  secondary: {
    backgroundColor: Colors.secondary,
  },
  outline: {
    backgroundColor: Colors.transparent,
    borderWidth: 1.5,
    borderColor: Colors.accent,
  },
  ghost: {
    backgroundColor: Colors.white10,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textInverse,
    letterSpacing: 0.3,
  },
});

export default CustomButton;