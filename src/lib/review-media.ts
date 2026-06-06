import type { CSSProperties } from 'react';

export type ReviewMediaFit = 'cover' | 'contain';

export type ReviewMediaAdjustment = {
  media_fit?: string | null;
  media_position_x?: number | string | null;
  media_position_y?: number | string | null;
  media_zoom?: number | string | null;
};

export type ReviewAvatarAdjustment = {
  avatar_fit?: string | null;
  avatar_position_x?: number | string | null;
  avatar_position_y?: number | string | null;
  avatar_zoom?: number | string | null;
};

export const DEFAULT_REVIEW_MEDIA_ADJUSTMENT = {
  media_fit: 'cover' as ReviewMediaFit,
  media_position_x: 50,
  media_position_y: 50,
  media_zoom: 1,
};

export const DEFAULT_REVIEW_AVATAR_ADJUSTMENT = {
  avatar_fit: 'cover' as ReviewMediaFit,
  avatar_position_x: 50,
  avatar_position_y: 50,
  avatar_zoom: 1,
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function toNumber(value: number | string | null | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeReviewMediaAdjustment(adjustment: ReviewMediaAdjustment = {}) {
  const fit: ReviewMediaFit = adjustment.media_fit === 'contain' ? 'contain' : 'cover';
  return {
    media_fit: fit,
    media_position_x: Math.round(clamp(toNumber(adjustment.media_position_x, 50), 0, 100)),
    media_position_y: Math.round(clamp(toNumber(adjustment.media_position_y, 50), 0, 100)),
    media_zoom: Number(clamp(toNumber(adjustment.media_zoom, 1), 1, 3).toFixed(2)),
  };
}

export function normalizeReviewAvatarAdjustment(adjustment: ReviewAvatarAdjustment = {}) {
  const fit: ReviewMediaFit = adjustment.avatar_fit === 'contain' ? 'contain' : 'cover';
  return {
    avatar_fit: fit,
    avatar_position_x: Math.round(clamp(toNumber(adjustment.avatar_position_x, 50), 0, 100)),
    avatar_position_y: Math.round(clamp(toNumber(adjustment.avatar_position_y, 50), 0, 100)),
    avatar_zoom: Number(clamp(toNumber(adjustment.avatar_zoom, 1), 1, 3).toFixed(2)),
  };
}

export function getReviewMediaStyle(adjustment: ReviewMediaAdjustment = {}): CSSProperties {
  const n = normalizeReviewMediaAdjustment(adjustment);
  return {
    objectFit: n.media_fit,
    objectPosition: `${n.media_position_x}% ${n.media_position_y}%`,
    transform: `scale(${n.media_zoom})`,
    transformOrigin: `${n.media_position_x}% ${n.media_position_y}%`,
  };
}

export function getReviewAvatarStyle(adjustment: ReviewAvatarAdjustment = {}): CSSProperties {
  const n = normalizeReviewAvatarAdjustment(adjustment);
  return {
    objectFit: n.avatar_fit,
    objectPosition: `${n.avatar_position_x}% ${n.avatar_position_y}%`,
    transform: `scale(${n.avatar_zoom})`,
    transformOrigin: `${n.avatar_position_x}% ${n.avatar_position_y}%`,
  };
}
