import sikaflowLogo from '@/assets/sikaflow-logo.png';

interface LogoProps {
  className?: string;
  alt?: string;
  /** Kept for backwards compatibility; the KudiTrack icon is the same in both themes. */
  variant?: 'dark' | 'light' | 'auto';
}

/**
 * KudiTrack app logo. The colored coin/chart icon works on both light and dark backgrounds.
 * This is the default platform logo used everywhere a tenant has not uploaded
 * their own custom branding.
 */
export function Logo({ className, alt = 'KudiTrack' }: LogoProps) {
  return <img src={sikaflowLogo} alt={alt} className={className} />;
}
