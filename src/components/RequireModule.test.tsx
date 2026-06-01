import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequireModule } from '@/components/RequireModule';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const authState = {
  loading: false,
  isStaffMember: true,
  staffMembership: {
    modules: ['dashboard'],
  },
  hasModule: (module: string) => module === 'dashboard',
};

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => authState,
}));

let root: Root | null = null;
let container: HTMLDivElement;

async function renderDashboardGuard() {
  await act(async () => {
    root = createRoot(container);
    root.render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={(
              <RequireModule module="dashboard">
                <div>Dashboard content</div>
              </RequireModule>
            )}
          />
          <Route path="/sales" element={<div>Sales content</div>} />
        </Routes>
      </MemoryRouter>,
    );
  });

  await act(async () => {
    await Promise.resolve();
  });
}

describe('RequireModule staff fallback', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    authState.loading = false;
    authState.isStaffMember = true;
    authState.staffMembership = { modules: ['dashboard'] };
    authState.hasModule = (module: string) => module === 'dashboard';
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    root = null;
    container.remove();
  });

  it('renders Dashboard/Home when it is assigned', async () => {
    await renderDashboardGuard();

    expect(container.textContent).toContain('Dashboard content');
  });

  it('redirects to Sales/POS when Dashboard/Home is not assigned', async () => {
    authState.staffMembership = { modules: ['sales'] };
    authState.hasModule = (module: string) => module === 'sales';

    await renderDashboardGuard();

    expect(container.textContent).toContain('Sales content');
  });

  it('shows an empty state when no sections are assigned', async () => {
    authState.staffMembership = { modules: [] };
    authState.hasModule = () => false;

    await renderDashboardGuard();

    expect(container.textContent).toContain('No assigned sections');
    expect(container.textContent).toContain('No sections have been assigned to your account yet. Please contact your company owner.');
  });
});
