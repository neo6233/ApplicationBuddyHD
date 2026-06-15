import React, {useState} from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  Platform,
  ViewStyle,
  TextStyle,
  KeyboardTypeOptions,
} from 'react-native';
import Colors from '../constants/Colors';

interface CustomInputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  numberOfLines?: number;
  editable?: boolean;
  style?: ViewStyle;
  inputStyle?: TextStyle;
  maxLength?: number;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  returnKeyType?: 'done' | 'next' | 'search' | 'send' | 'go';
  onSubmitEditing?: () => void;
  onBlur?: () => void;
  rightIcon?: React.ReactNode;
  autoFocus?: boolean;
}

const CustomInput: React.FC<CustomInputProps> = ({
  label,
  placeholder,
  value,
  onChangeText,
  error,
  secureTextEntry = false,
  keyboardType = 'default',
  multiline = false,
  numberOfLines = 1,
  editable = true,
  style,
  inputStyle,
  maxLength,
  autoCapitalize = 'sentences',
  returnKeyType,
  onSubmitEditing,
  onBlur,
  rightIcon,
  autoFocus = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
        <View
        style={[
          styles.inputWrapper,
          isFocused && styles.inputWrapperFocused,
          !!error && styles.inputWrapperError,
          !editable && styles.inputWrapperDisabled,
        ]}>
        <TextInput
          style={[
            styles.input,
            multiline && styles.multilineInput,
            inputStyle,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.inputPlaceholder}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          multiline={multiline}
          numberOfLines={multiline ? numberOfLines : undefined}
          textAlignVertical={multiline ? 'top' : 'center'}
          editable={editable}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            onBlur?.();
          }}
          autoFocus={autoFocus}
          selectionColor={Colors.accent}
        />
        {rightIcon && <View style={styles.rightIconContainer}>{rightIcon}</View>}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 8,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBackground,
    borderWidth: 1.5,
    borderColor: Colors.inputBorder,
    borderRadius: 14,
    paddingHorizontal: 16,
    minHeight: 54,
  },
  inputWrapperFocused: {
    borderColor: Colors.inputFocusBorder,
    backgroundColor: 'rgba(139, 92, 246, 0.04)',
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: Colors.accent,
          shadowOffset: {width: 0, height: 0},
          shadowOpacity: 0.2,
          shadowRadius: 10,
        }
      : {
          elevation: 0,
        }),
  },
  inputWrapperError: {
    borderColor: Colors.error,
  },
  inputWrapperDisabled: {
    opacity: 0.5,
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 15,
    paddingVertical: 14,
    fontWeight: '400',
  },
  multilineInput: {
    paddingTop: 14,
    minHeight: 80,
  },
  rightIconContainer: {
    marginLeft: 8,
  },
  errorText: {
    color: Colors.error,
    fontSize: 12,
    marginTop: 6,
    marginLeft: 4,
  },
});

export default CustomInput;
