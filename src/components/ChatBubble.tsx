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
  const showProgramList = Boolean(!isUser && message.programs?.length);
  const showSaveAction = Boolean(
    !isUser &&
      message.responseType === 'final_recommendation' &&
      message.programs?.length === 1 &&
      primaryProgram &&
      onSaveProgram,
  );

  const getVisibleTextContent = (content: string) => {
    if (!showProgramList) {
      return content;
    }

    const lines = content.split('\n');
    const firstProgramLine = lines.findIndex(line => {
      const trimmed = line.trim();
      return trimmed.startsWith('•') || trimmed.startsWith('*');
    });

    const introLines = firstProgramLine >= 0 ? lines.slice(0, firstProgramLine) : lines;
    return introLines.join('\n').trim();
  };

  const renderContent = (content: string) => {
    const lines = content.split('\n');

    return lines.map((line, index) => {
      const trimmedLine = line.trim();
      const listMatch = trimmedLine.match(/^(?:[\u2022*•\-]+\s*)+(.*)$/);
      const contentLine = listMatch ? listMatch[1].trim() : trimmedLine;
      const isListItem = Boolean(listMatch);

      const boldRegex = /\*\*(.*?)\*\*/g;
      const parts = [];
      let lastIndex = 0;
      let match;

      while ((match = boldRegex.exec(contentLine)) !== null) {
        if (match.index > lastIndex) {
          parts.push(contentLine.substring(lastIndex, match.index));
        }
        parts.push(
          <Text key={`${index}-${match.index}`} style={[styles.boldText, isUser ? styles.userBoldText : styles.aiBoldText]}>
            {match[1]}
          </Text>,
        );
        lastIndex = boldRegex.lastIndex;
      }

      if (lastIndex < contentLine.length) {
        parts.push(contentLine.substring(lastIndex));
      }

      const cleanedParts = parts.map(part =>
        typeof part === 'string' ? part.replace(/\*\*/g, '') : part,
      );

      const isNumberedHeading = !isListItem && /^\d+\.\s/.test(contentLine);
      if (isNumberedHeading && !isUser) {
        return (
          <View key={index} style={styles.headingContainer}>
            <Text style={styles.headingText}>{cleanedParts}</Text>
          </View>
        );
      }

      if (isListItem) {
        return (
          <View key={index} style={styles.listItem}>
            <Text style={[styles.bullet, isUser ? styles.userBullet : styles.aiBulletText]}>•</Text>
            <Text style={[styles.messageText, isUser ? styles.userText : styles.aiText, styles.listText]}>{cleanedParts}</Text>
          </View>
        );
      }

      return (
        <Text key={index} style={[styles.messageText, isUser ? styles.userText : styles.aiText]}>
          {cleanedParts}
        </Text>
      );
    });
  };

  const renderProgramList = () => {
    if (!message.programs?.length) {
      return null;
    }

    return (
      <View style={styles.programList}>
        {message.programs.map((program, index) => (
          <View key={`${program.name}-${index}`} style={styles.programItem}>
            <View style={styles.programHeader}>
              <Text style={styles.programName}>{program.name}</Text>
              {program.level ? (
                <View style={styles.programLevelBadge}>
                  <Text style={styles.programLevelText}>{program.level}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.programUniversity}>
              {program.university} · {program.country}
            </Text>
            <View style={styles.programMetaRow}>
              <Text style={styles.programMeta}>Duration: {program.duration}</Text>
              <Text style={styles.programMeta}>Intake: {program.intake}</Text>
            </View>
            <Text style={styles.programEligibility}>
              Eligibility: {program.eligibility}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  const visibleContent = getVisibleTextContent(message.content);

  return (
    <View
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.aiContainer,
      ]}>
      {!isUser && (
        <View style={styles.avatarContainer}>
          <Image
            source={require('../assets/aria_logo.png')}
            style={styles.avatarImage}
            resizeMode="cover"
          />
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
          {visibleContent ? (
            <View>{renderContent(visibleContent)}</View>
          ) : null}
          {showProgramList ? renderProgramList() : null}
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
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
    overflow: 'hidden',
    marginBottom: 18,
    flexShrink: 0,
    backgroundColor: Colors.primaryLight,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  userAvatarContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    flexShrink: 0,
  },
  userAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.secondary,
  },
  bubbleColumn: {
    maxWidth: '82%',
  },
  bubble: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: Colors.accent,
    borderBottomRightRadius: 4,
    shadowColor: Colors.accent,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  aiBubble: {
    backgroundColor: Colors.bubbleAI,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.15)',
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
    textAlign: 'left',
    marginBottom: 6,
  },
  listText: {
    flex: 1,
  },
  userText: {
    color: '#FFFFFF',
  },
  aiText: {
    color: Colors.bubbleAIText,
  },
  saveProgramButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    shadowColor: Colors.accent,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  saveProgramButtonSaved: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.25)',
    shadowOpacity: 0,
    elevation: 0,
  },
  saveProgramButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  saveProgramButtonTextSaved: {
    color: Colors.accentLight,
  },
  boldText: {
    fontWeight: '700',
  },
  userBoldText: {
    color: '#FFFFFF',
  },
  aiBoldText: {
    color: Colors.bubbleAIText,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    marginTop: 4,
  },
  bullet: {
    width: 16,
    fontSize: 15,
    lineHeight: 22,
  },
  userBullet: {
    color: '#FFFFFF',
  },
  aiBulletText: {
    color: Colors.bubbleAIText,
  },
  headingContainer: {
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primaryLight,
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderRadius: 6,
  },
  headingText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    color: Colors.bubbleAIText,
    textAlign: 'left',
  },
  programList: {
    marginTop: 10,
    gap: 10,
  },
  programItem: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.18)',
  },
  programHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  programName: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  programLevelBadge: {
    minWidth: 34,
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.25)',
  },
  programLevelText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '800',
    color: Colors.accentLight,
  },
  programUniversity: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  programMetaRow: {
    marginTop: 7,
    gap: 4,
  },
  programMeta: {
    fontSize: 12,
    lineHeight: 17,
    color: Colors.textSecondary,
  },
  programEligibility: {
    marginTop: 7,
    fontSize: 12,
    lineHeight: 17,
    color: Colors.bubbleAIText,
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
