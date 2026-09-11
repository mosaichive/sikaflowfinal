export interface VoiceInputFeedback {
  title: string;
  description: string;
  destructive: boolean;
}

export function describeVoiceRecognitionError(code: string): VoiceInputFeedback | null {
  switch (code) {
    case 'aborted':
      return null;
    case 'not-allowed':
    case 'service-not-allowed':
      return {
        title: 'Microphone blocked',
        description: 'Allow microphone access for KudiTrack in your browser settings, then try again.',
        destructive: true,
      };
    case 'audio-capture':
      return {
        title: 'Microphone unavailable',
        description: 'Check that a microphone is connected and not being used by another app.',
        destructive: true,
      };
    case 'network':
      return {
        title: 'Voice input needs internet',
        description: 'Reconnect to use speech recognition, or type your request while offline.',
        destructive: false,
      };
    case 'no-speech':
      return {
        title: 'No speech detected',
        description: 'Tap the microphone and speak after it changes to the stop icon.',
        destructive: false,
      };
    case 'language-not-supported':
      return {
        title: 'Voice language unavailable',
        description: 'Your browser does not support this speech language. Please type your request.',
        destructive: false,
      };
    default:
      return {
        title: 'Voice input stopped',
        description: 'Please try again or type your request.',
        destructive: false,
      };
  }
}

export function describeMicrophoneAccessError(name: string): VoiceInputFeedback {
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return describeVoiceRecognitionError('not-allowed')!;
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return describeVoiceRecognitionError('audio-capture')!;
    case 'NotReadableError':
    case 'TrackStartError':
      return {
        title: 'Microphone is busy',
        description: 'Close other apps using the microphone, then try again.',
        destructive: true,
      };
    default:
      return {
        title: 'Could not start microphone',
        description: 'Check your browser microphone permission and try again.',
        destructive: true,
      };
  }
}
