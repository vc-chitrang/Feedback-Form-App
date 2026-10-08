import { NavLink, Outlet } from 'react-router';
import { BarChart3, History, LayoutList, LogOut, Palette, Tablet } from 'lucide-react';
import { cx } from '@ff/form-renderer';
import { useAuth } from '../lib/auth';
import { useDraft } from '../lib/draft';

const NAV = [
  { to: '/', label: 'Form builder', icon: LayoutList, end: true },
  { to: '/branding', label: 'Branding & kiosk', icon: Palette },
  { to: '/responses', label: 'Responses', icon: BarChart3 },
  { to: '/versions', label: 'Versions', icon: History },
  { to: '/devices', label: 'Devices & QR', icon: Tablet },
];

export function Layout() {
  const { me, logout } = useAuth();
  const { state, editing } = useDraft();

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-stone-200 bg-stone-50 md:w-60 md:border-r md:border-b-0">
        <div className="flex items-center gap-3 px-5 py-4 md:py-6">
          <div className="grid size-9 place-items-center rounded-lg bg-[#7a1f2b] font-display text-lg text-white">
            {me?.tenant.name.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-stone-900">{me?.tenant.name}</p>
            <p className="text-xs text-stone-500">
              {state?.live ? `Live: v${state.live.number}` : 'Not published'}
              {editing && ' · draft open'}
            </p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:pb-0" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                  isActive ? 'bg-white text-stone-900 shadow-sm ring-1 ring-stone-200' : 'text-stone-600 hover:bg-stone-200/60 hover:text-stone-900',
                )
              }
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-stone-200 p-4 md:block">
          <p className="truncate text-sm font-medium text-stone-800">{me?.user.name}</p>
          <p className="truncate text-xs text-stone-500">
            {me?.user.email} · {me?.user.role}
          </p>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-3 flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900"
          >
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
