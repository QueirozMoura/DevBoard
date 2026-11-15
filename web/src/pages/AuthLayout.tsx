import type { CSSProperties, ReactNode } from 'react';
import { Logo } from '../components/Logo';

/**
 * Painel de marca: quatro colunas de um quadro; um cartão percorre as três primeiras e
 * volta (a única animação ambiente do app). Respeita prefers-reduced-motion via CSS global.
 */
function BoardMotif() {
  const columns = [
    { name: 'A fazer', tone: 'bg-st-todo', cards: [3, 2, 3] },
    { name: 'Em andamento', tone: 'bg-st-progress', cards: [2, 3] },
    { name: 'Em revisão', tone: 'bg-st-review', cards: [3] },
    { name: 'Concluída', tone: 'bg-st-done', cards: [2, 3, 2] },
  ];
  const hopStyle = {
    '--hop-1': 'calc(100% + 0.75rem)',
    '--hop-2': 'calc(200% + 1.5rem)',
  } as CSSProperties;
  return (
    <div aria-hidden className="grid grid-cols-4 gap-3">
      {columns.map((column, index) => (
        <div key={column.name} className="space-y-2.5">
          <div className="flex items-center gap-2">
            <span className={`size-1.5 rounded-full ${column.tone}`} />
            <span className="text-fg-faint truncate text-[11px]">{column.name}</span>
          </div>
          {index === 0 ? (
            <div
              style={hopStyle}
              className="bg-cobalt-500 animate-hop h-14 rounded-lg shadow-lg shadow-cobalt-500/30"
            />
          ) : null}
          {column.cards.map((lines, cardIndex) => (
            <div
              key={cardIndex}
              className="bg-ink-850 border-line space-y-1.5 rounded-lg border p-2.5"
            >
              <div className="bg-ink-700 h-1.5 w-4/5 rounded-full" />
              {lines > 2 ? <div className="bg-ink-800 h-1.5 w-3/5 rounded-full" /> : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="border-line from-ink-900 to-ink-950 hidden flex-col justify-between border-r bg-gradient-to-br p-12 lg:flex">
        <Logo />
        <div className="max-w-lg">
          <h2 className="text-4xl leading-tight font-semibold tracking-tight text-balance">
            Cada tarefa no seu lugar.
          </h2>
          <p className="text-fg-muted mt-4 max-w-md text-pretty">
            Organize projetos em colunas, mova o trabalho do backlog ao concluído e
            mantenha o time alinhado sem reuniões extras.
          </p>
          <div className="mt-12">
            <BoardMotif />
          </div>
        </div>
        <p className="text-fg-faint text-sm">
          Projetos, tarefas e histórico em um só quadro.
        </p>
      </aside>

      <main className="flex min-h-dvh flex-col justify-center px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-sm animate-settle">
          <Logo className="mb-10 lg:hidden" />
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-fg-muted mt-1.5 text-sm">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <p className="text-fg-muted mt-8 text-center text-sm">{footer}</p>
        </div>
      </main>
    </div>
  );
}
