import { describe, expect, it } from 'vitest';
import { describeMicrophoneAccessError, describeVoiceRecognitionError } from './voice-input';

describe('voice input errors', () => {
  it('does not report a manual recognition abort as a failure', () => {
    expect(describeVoiceRecognitionError('aborted')).toBeNull();
  });

  it('explains browser permission denial', () => {
    expect(describeVoiceRecognitionError('not-allowed')).toMatchObject({
      title: 'Microphone blocked',
      destructive: true,
    });
    expect(describeMicrophoneAccessError('NotAllowedError').title).toBe('Microphone blocked');
  });

  it('distinguishes silence and network failures', () => {
    expect(describeVoiceRecognitionError('no-speech')).toMatchObject({
      title: 'No speech detected',
      destructive: false,
    });
    expect(describeVoiceRecognitionError('network')).toMatchObject({
      title: 'Voice input needs internet',
      destructive: false,
    });
  });

  it('distinguishes missing and busy microphones', () => {
    expect(describeMicrophoneAccessError('NotFoundError').title).toBe('Microphone unavailable');
    expect(describeMicrophoneAccessError('NotReadableError').title).toBe('Microphone is busy');
  });
});
