import { cleanup, render } from '@testing-library/react';
import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import StaffUsersPage from '@/pages/StaffUsersPage';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  toast: vi.fn(),
  staffQuery: vi.fn(),
}));

const restoredMember = {
  id: '11111111-1111-4111-8111-111111111111',
  staff_user_id: null,
  display_name: 'Restored teammate',
  email: 'restored@example.test',
  active: true,
  permissions: { role: 'salesperson', modules: ['dashboard'] },
};

function query(data: unknown[]) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    is: (...args: unknown[]) => {
      mocks.staffQuery(...args);
      return builder;
    },
    order: async () => ({ data, error: null }),
  };
  return builder;
}

vi.mock('@/components/AppLayout', () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '22222222-2222-4222-8222-222222222222' },
    isAdmin: true,
    isStaffMember: false,
    hasModule: () => true,
    effectiveBusinessOwnerId: '22222222-2222-4222-8222-222222222222',
    displayName: 'Owner',
  }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => query(table === 'staff_members' ? [restoredMember] : []),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: vi.fn(),
    functions: { invoke: mocks.invoke },
  },
}));

describe('team management restored memberships', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.toast.mockReset();
    mocks.staffQuery.mockReset();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('removes an unlinked restored member by membership ID', async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    render(<StaffUsersPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Remove member' }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('manage-business-user', {
      body: { action: 'remove', member_id: restoredMember.id },
    }));
    expect(mocks.staffQuery).toHaveBeenCalledWith('removed_at', null);
  });

  it('shows the function error body rather than a generic HTTP failure', async () => {
    const error = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: new Response(JSON.stringify({ error: 'team_member_not_found' }), { status: 404 }),
    });
    mocks.invoke.mockResolvedValue({ data: null, error });
    render(<StaffUsersPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Remove member' }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Could not remove',
      description: 'team_member_not_found',
    })));
  });

  it('creates link invitations through the protected team function', async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        ok: true,
        invite_id: '33333333-3333-4333-8333-333333333333',
        token: 'secureinvitetoken1234567890',
      },
      error: null,
    });
    render(<StaffUsersPage />);

    fireEvent.click(await screen.findByRole('button', { name: /Invite Team Member/i }));
    const emailInput = document.querySelector('input[type="email"]');
    expect(emailInput).not.toBeNull();
    if (!emailInput) throw new Error('Email input not found');
    fireEvent.change(emailInput, { target: { value: 'member@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create invite link' }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('manage-business-user', {
      body: expect.objectContaining({
        action: 'invite',
        mode: 'link',
        email: 'member@example.test',
        role: 'salesperson',
      }),
    }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('/invite/secureinvitetoken1234567890'));
  });
});
