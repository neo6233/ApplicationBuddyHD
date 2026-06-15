import React from 'react';
import {View, Text, StyleSheet, Image, TouchableOpacity} from 'react-native';
import Colors from '../constants/Colors';
import {Message} from '../models/ChatModel';
import Validators from '../utils/Validators';

interface ChatBubbleProps {
  message: Message;
  onSaveProgram?: (program: NonNullable<Message['programs']>[number]) => void;
  isProgramSaved?: (program: NonNullable<Message['programs']>[number]) => boolean;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({message, onSaveProgram, isProgramSaved}) => {
  const isUser = message.role === 'user';
  const primaryProgram = message.programs?.[0];
  const showSaveAction = Boolean(
    !isUser &&
      message.responseType === 'final_recommendation' &&
      message.programs?.length === 1 &&
      primaryProgram &&
      onSaveProgram,
  );

  const renderContent = (content: string) => {
    const lines = content.split('\n');

    return lines.map((line, index) => {
      const trimmedLine = line.trim();

      const boldRegex = /\*\*(.*?)\*\*/g;
      const parts = [];
      let lastIndex = 0;
      let match;

      while ((match = boldRegex.exec(trimmedLine)) !== null) {
        if (match.index > lastIndex) {
          parts.push(trimmedLine.substring(lastIndex, match.index));
        }
        parts.push(
          <Text key={match.index} style={styles.boldText}>
            {match[1]}
          </Text>,
        );
        lastIndex = boldRegex.lastIndex;
      }

      if (lastIndex < trimmedLine.length) {
        parts.push(trimmedLine.substring(lastIndex));
      }

      if (trimmedLine.startsWith('*')) {
        return (
          <View key={index} style={styles.listItem}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.messageText}>{parts}</Text>
          </View>
        );
      }

      return (
        <Text key={index} style={styles.messageText}>
          {parts}
        </Text>
      );
    });
  };

  return (
    <View
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.aiContainer,
      ]}>
      {!isUser && (
        <View style={styles.avatarContainer}>
          <Text style={styles.avatarText}>A</Text>
        </View>
      )}
      <View style={styles.bubbleColumn}>
        <View
          style={[
            styles.bubble,
            isUser ? styles.userBubble : styles.aiBubble,
          ]}>
          {message.image ? (
            <Image
              source={{
                uri: message.image.startsWith('data:')
                  ? message.image
                  : `data:image/jpeg;base64,${message.image}`,
              }}
              style={styles.attachedImage}
              resizeMode="cover"
            />
          ) : null}
          {message.content ? (
            <View>{renderContent(message.content)}</View>
          ) : null}
          {showSaveAction ? (
            <TouchableOpacity
              style={[
                styles.saveProgramButton,
                isProgramSaved?.(primaryProgram!) && styles.saveProgramButtonSaved,
              ]}
              onPress={() => onSaveProgram?.(primaryProgram!)}
              activeOpacity={0.8}>
              <Text
                style={[
                  styles.saveProgramButtonText,
                  isProgramSaved?.(primaryProgram!) && styles.saveProgramButtonTextSaved,
                ]}>
                {isProgramSaved?.(primaryProgram!) ? '✓ Saved' : 'Save Program'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Text
          style={[
            styles.timestamp,
            isUser ? styles.userTimestamp : styles.aiTimestamp,
          ]}>
          {Validators.formatTimestamp(message.timestamp)}
        </Text>
      </View>
      {isUser && (
        <View style={styles.userAvatarContainer}>
          <Text style={styles.userAvatarText}>U</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'flex-end',
    gap: 8,
  },
  userContainer: {
    justifyContent: 'flex-end',
  },
  aiContainer: {
    justifyContent: 'flex-start',
  },
  avatarContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textInverse,
  },
  userAvatarContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    flexShrink: 0,
  },
  userAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white,
  },
  bubbleColumn: {
    maxWidth: '75%',
  },
  bubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: Colors.bubbleUser,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: Colors.bubbleAI,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  attachedImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginBottom: 8,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  },
  userText: {
    color: Colors.bubbleUserText,
  },
  aiText: {
    color: Colors.bubbleAIText,
  },
  saveProgramButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.accent,
  },
  saveProgramButtonSaved: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  saveProgramButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textInverse,
  },
  saveProgramButtonTextSaved: {
    color: Colors.accent,
  },
  boldText: {
    fontWeight: '700',
    color: Colors.bubbleAIText,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  bullet: {
    width: 16,
    fontSize: 15,
    color: Colors.bubbleAIText,
    lineHeight: 22,
  },
  timestamp: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
  },
  userTimestamp: {
    textAlign: 'right',
  },
  aiTimestamp: {
    textAlign: 'left',
  },
});

export default ChatBubble;
