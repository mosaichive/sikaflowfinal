export type SurveyQuestionType = 'rating' | 'multiple_choice' | 'checkbox' | 'short_text' | 'long_text';

export interface SurveyQuestion {
  id: string;
  survey_id: string;
  type: SurveyQuestionType;
  label: string;
  options: string[];
  required: boolean;
  position: number;
}

export interface Survey {
  id: string;
  title: string;
  description: string | null;
  thank_you_message: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_THANK_YOU_MESSAGE =
  '🎉 Thank You!\n\nWe sincerely appreciate your feedback. Your responses help us improve KudiTrack and build a better experience for your business.';

export interface SurveyResponse {
  id: string;
  survey_id: string;
  user_id: string;
  business_id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  rating: number | null;
  submitted_at: string;
}

export const SKIP_DAYS = 3;

export function sessionShownKey(surveyId: string) {
  return `survey_shown_session_${surveyId}`;
}
