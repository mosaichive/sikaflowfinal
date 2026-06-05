import { ReactNode, useEffect, useRef, useState } from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { PageTransition } from '@/components/PageTransition';
import { Bell } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { useTheme } from '@/hooks/useTheme';
import { useIsMobile } from '@/hooks/use-mobile';
import { Logo } from '@/components/Logo';
import { HeaderAdsTicker } from '@/components/HeaderAdsTicker';
import { EmailVerifyBanner } from '@/components/EmailVerifyBanner';
import { ReferralNotifications } from '@/components/referrals/ReferralNotifications';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

let lastNotificationToneAt = 0;

function playNotificationTone() {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (now - lastNotificationToneAt < 2500) return;

  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextCtor) return;
  lastNotificationToneAt = now;

  try {
    const audio = new AudioContextCtor();
    const startTone = () => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audio.currentTime);
      gain.gain.setValueAtTime(0.001, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.18);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + 0.2);
      oscillator.onended = () => { void audio.close(); };
    };

    if (audio.state === 'suspended') {
      void audio.resume().then(startTone).catch(() => { void audio.close(); });
    } else {
      startTone();
    }
  } catch {
    // Browser audio permissions can block notification sounds; the visual badge still shows.
  }
}

export function AppLayout({ children, title }: { children: ReactNode; title?: string }) {
  const { user, displayName, avatarUrl, profileTitle } = useAuth();
  const { business, businessId } = useBusiness();
  useTheme();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [announcementBadge, setAnnouncementBadge] = useState(0);
  const badgeInitializedRef = useRef(false);

  useEffect(() => {
    if (!user) {
      setAnnouncementBadge(0);
      badgeInitializedRef.current = false;
      return;
    }

    let cancelled = false;
    badgeInitializedRef.current = false;

    const loadAnnouncementBadge = async () => {
      const { data: announcements } = await supabase
        .from('announcements')
        .select('id')
        .lte('publish_at', new Date().toISOString());

      if (cancelled) return;

      const unread = ((announcements || []) as { id: string }[]).filter(
        (row) => !localStorage.getItem(`ann_read_${user.id}_${row.id}`),
      ).length;
      setAnnouncementBadge((previous) => {
        if (badgeInitializedRef.current && unread > previous) {
          playNotificationTone();
        }
        badgeInitializedRef.current = true;
        return unread;
      });
    };

    void loadAnnouncementBadge();

    const channel = supabase
      .channel(`app-layout-announcements-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => { void loadAnnouncementBadge(); })
      .subscribe();

    const onStorage = () => { void loadAnnouncementBadge(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('announcements:read', onStorage);

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('announcements:read', onStorage);
    };
  }, [businessId, user]);


  return (
    <SidebarProvider>
      <ReferralNotifications />
      <div className="min-h-screen flex w-full bg-background">
        {!isMobile && <AppSidebar />}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-2 border-b border-border px-4 bg-card/80 backdrop-blur-sm sticky top-0 z-10">
            <div className="flex shrink-0 items-center gap-3">
              {!isMobile && <SidebarTrigger className="text-muted-foreground hover:text-foreground transition-colors duration-200" />}
              <div className="flex items-center gap-2 md:hidden">
                <Logo className="h-6 w-6 object-contain" />
                <span className="max-w-[112px] truncate text-sm font-semibold text-foreground min-[390px]:max-w-[140px]">
                  {business?.name || 'KudiTrack'}
                </span>
              </div>
              {title && <h1 className="text-lg font-semibold text-foreground hidden md:block">{title}</h1>}
            </div>
            <HeaderAdsTicker />
            <div className="flex shrink-0 items-center gap-2 md:gap-3">
              <button
                onClick={() => navigate('/announcements')}
                aria-label={announcementBadge > 0 ? `${announcementBadge} unread announcement${announcementBadge === 1 ? '' : 's'}` : 'Open announcements'}
                title={announcementBadge > 0 ? `${announcementBadge} unread announcement${announcementBadge === 1 ? '' : 's'}` : 'Announcements'}
                className={cn(
                  'relative rounded-lg p-2 text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground active:scale-95',
                  announcementBadge > 0 && 'bg-primary/10 text-primary shadow-sm shadow-primary/20',
                )}
              >
                <span className={cn('inline-flex', announcementBadge > 0 && 'animate-notification-bell')}>
                  <Bell className="h-4 w-4" />
                </span>
                {announcementBadge > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                    {announcementBadge > 9 ? '9+' : announcementBadge}
                  </span>
                ) : null}
              </button>
              <div className="flex items-center gap-2">
                <Avatar className="h-7 w-7">
                  {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                  <AvatarFallback className="bg-primary/20 text-primary text-[10px] font-semibold">
                    {displayName?.charAt(0)?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden md:block">
                  <p className="text-xs font-medium text-foreground leading-tight">{displayName || 'User'}</p>
                  {profileTitle && <p className="text-[10px] text-muted-foreground leading-tight">{profileTitle}</p>}
                </div>
              </div>
            </div>
          </header>
          <EmailVerifyBanner />
          <main className="flex-1 p-4 md:p-6 overflow-auto pb-24 md:pb-6">
            <PageTransition>
              {children}
            </PageTransition>
          </main>
        </div>
        <MobileBottomNav />
      </div>
    </SidebarProvider>
  );
}
