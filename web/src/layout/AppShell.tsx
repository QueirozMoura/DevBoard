import { Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router';
import { Logo } from '../components/Logo';
import { Sidebar } from './Sidebar';

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (drawerOpen && !dialog.open) dialog.showModal();
    if (!drawerOpen && dialog.open) dialog.close();
  }, [drawerOpen]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]">
      <a
        href="#conteudo"
        className="bg-cobalt-500 sr-only z-50 rounded-md px-3 py-2 text-sm font-medium text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Pular para o conteúdo
      </a>

      <aside className="border-line bg-ink-900 sticky top-0 hidden h-dvh border-r lg:block">
        <Sidebar />
      </aside>

      <header className="border-line bg-ink-900/90 sticky top-0 z-20 flex h-14 items-center justify-between border-b px-4 backdrop-blur lg:hidden">
        <Logo />
        <button
          type="button"
          aria-label="Abrir menu"
          onClick={() => {
            setDrawerOpen(true);
          }}
          className="hover:bg-ink-800 grid size-10 place-items-center rounded-lg"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </header>

      <dialog
        ref={dialogRef}
        aria-label="Menu de navegação"
        onClose={() => {
          setDrawerOpen(false);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setDrawerOpen(false);
        }}
        className="bg-ink-900 text-fg m-0 h-dvh max-h-none w-72 max-w-[85vw] backdrop:bg-black/60 lg:hidden"
      >
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => {
            setDrawerOpen(false);
          }}
          className="hover:bg-ink-800 absolute top-3 right-3 grid size-9 place-items-center rounded-lg"
        >
          <X className="size-5" aria-hidden />
        </button>
        {drawerOpen ? (
          <Sidebar
            onNavigate={() => {
              setDrawerOpen(false);
            }}
          />
        ) : null}
      </dialog>

      <main id="conteudo" tabIndex={-1} className="min-w-0 px-4 py-6 sm:px-8 lg:py-10">
        <div className="mx-auto w-full max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
