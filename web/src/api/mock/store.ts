import type {
  Activity,
  Comment,
  Member,
  Project,
  Role,
  Task,
  TaskPriority,
  TaskStatus,
} from '../types';

/** Estado em memória do backend simulado. Recriado a cada `resetMockStore()`. */
interface StoredProject extends Omit<Project, 'myRole' | 'memberCount' | 'taskCount'> {
  members: Member[];
}

export interface MockUser {
  id: string;
  name: string;
  email: string;
}

export interface MockStore {
  me: MockUser;
  people: MockUser[];
  projects: StoredProject[];
  tasks: Task[];
  comments: Comment[];
  activities: Activity[];
}

let sequence = 0;
/** UUID de formato válido e determinístico por sequência (facilita testes). */
export function nextId(): string {
  sequence += 1;
  return `00000000-0000-7000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

const DAY = 86_400_000;
const iso = (offsetDays: number): string =>
  new Date(Date.now() + offsetDays * DAY).toISOString();

export function positionFor(index: number): string {
  return `a${index.toString().padStart(4, '0')}`;
}

let store: MockStore | null = null;

export function clearMockStore(): void {
  store = null;
}

export function getMockStore(): MockStore | null {
  return store;
}

/** Recria o cenário de demonstração para o usuário autenticado. */
export function resetMockStore(me: MockUser): MockStore {
  sequence = 0;
  const people: MockUser[] = [
    me,
    { id: nextId(), name: 'Marina Duarte', email: 'marina@devboard.dev' },
    { id: nextId(), name: 'Rafael Costa', email: 'rafael@devboard.dev' },
    { id: nextId(), name: 'Isabela Nunes', email: 'isabela@devboard.dev' },
  ];
  const [, marina, rafael, isabela] = people as [MockUser, MockUser, MockUser, MockUser];

  const member = (user: MockUser, role: Role, ago: number): Member => ({
    userId: user.id,
    name: user.name,
    email: user.email,
    role,
    joinedAt: iso(-ago),
  });
  const project = (
    name: string,
    description: string | null,
    members: Member[],
    ago: number,
  ): StoredProject => ({
    id: nextId(),
    name,
    description,
    members,
    createdAt: iso(-ago),
    updatedAt: iso(-Math.floor(ago / 3)),
  });

  const payments = project(
    'Plataforma de Pagamentos',
    'Checkout, conciliação e antifraude do marketplace.',
    [member(me, 'OWNER', 60), member(marina, 'MEMBER', 58), member(rafael, 'MEMBER', 40)],
    60,
  );
  const mobile = project(
    'App Mobile v2',
    'Reescrita do aplicativo com foco em desempenho offline.',
    [
      member(marina, 'OWNER', 45),
      member(me, 'MEMBER', 44),
      member(isabela, 'MEMBER', 30),
    ],
    45,
  );
  const site = project(
    'Site Institucional',
    null,
    [member(me, 'OWNER', 20), member(isabela, 'MEMBER', 18)],
    20,
  );

  const tasks: Task[] = [];
  const counters = new Map<string, number>();
  const add = (
    projectRecord: StoredProject,
    title: string,
    status: TaskStatus,
    priority: TaskPriority,
    assignee: MockUser | null,
    dueInDays: number | null,
    description: string | null = null,
  ): void => {
    const key = `${projectRecord.id}:${status}`;
    const index = counters.get(key) ?? 0;
    counters.set(key, index + 1);
    tasks.push({
      id: nextId(),
      projectId: projectRecord.id,
      title,
      description,
      status,
      priority,
      assigneeId: assignee?.id ?? null,
      dueDate: dueInDays === null ? null : iso(dueInDays),
      position: positionFor(index),
      createdById: projectRecord.members[0]?.userId ?? null,
      commentCount: 0,
      createdAt: iso(-20 + tasks.length),
      updatedAt: iso(-5),
    });
  };

  add(
    payments,
    'Integrar antifraude no checkout',
    'IN_PROGRESS',
    'URGENT',
    me,
    2,
    'Bloquear transações acima do limite de risco e registrar o motivo.',
  );
  add(payments, 'Conciliar liquidações do Pix', 'TODO', 'HIGH', rafael, 6);
  add(payments, 'Revisar política de estorno', 'TODO', 'MEDIUM', null, null);
  add(payments, 'Cobrir webhooks com testes', 'IN_REVIEW', 'MEDIUM', me, -1);
  add(payments, 'Migrar relatórios para jobs assíncronos', 'IN_REVIEW', 'LOW', marina, 9);
  add(payments, 'Tela de status do pagamento', 'DONE', 'MEDIUM', marina, -8);
  add(payments, 'Chave de idempotência nas cobranças', 'DONE', 'HIGH', me, -12);
  add(mobile, 'Cache offline das listas', 'IN_PROGRESS', 'HIGH', me, 4);
  add(mobile, 'Onboarding em três passos', 'TODO', 'MEDIUM', isabela, 11);
  add(mobile, 'Reduzir tempo de abertura a frio', 'TODO', 'URGENT', marina, 3);
  add(mobile, 'Notificações push por projeto', 'TODO', 'LOW', null, null);
  add(mobile, 'Pipeline de build das lojas', 'DONE', 'MEDIUM', isabela, -15);
  add(site, 'Nova página de preços', 'IN_PROGRESS', 'MEDIUM', isabela, 5);
  add(site, 'Corrigir contraste do rodapé', 'TODO', 'LOW', me, null);
  add(site, 'Publicar política de privacidade', 'DONE', 'HIGH', me, -3);

  const comments: Comment[] = [];
  const seedComment = (
    title: string,
    author: MockUser,
    body: string,
    ago: number,
  ): void => {
    const task = tasks.find((candidate) => candidate.title === title);
    if (!task) return;
    comments.push({
      id: nextId(),
      taskId: task.id,
      author: { id: author.id, name: author.name },
      body,
      createdAt: iso(-ago),
      updatedAt: iso(-ago),
    });
    task.commentCount += 1;
  };
  seedComment(
    'Integrar antifraude no checkout',
    marina,
    'Podemos usar o score do provedor no primeiro corte e ajustar o limite depois.',
    2,
  );
  seedComment(
    'Cache offline das listas',
    marina,
    'Vale medir antes com os 500 itens mais acessados.',
    1,
  );

  const activities: Activity[] = [];
  for (const [index, record] of [site, mobile, payments].entries()) {
    const owner = record.members.find((m) => m.role === 'OWNER') ?? record.members[0];
    if (!owner) continue;
    activities.push({
      id: nextId(),
      projectId: record.id,
      taskId: null,
      actor: { id: owner.userId, name: owner.name },
      type: 'PROJECT_CREATED',
      data: {},
      createdAt: record.createdAt,
    });
    const done = tasks.find((t) => t.projectId === record.id && t.status === 'DONE');
    if (done) {
      activities.push({
        id: nextId(),
        projectId: record.id,
        taskId: done.id,
        actor: { id: owner.userId, name: owner.name },
        type: 'TASK_MOVED',
        data: { title: done.title, from: 'IN_REVIEW', to: 'DONE' },
        createdAt: iso(-3 - index),
      });
    }
  }

  store = {
    me,
    people,
    projects: [site, mobile, payments],
    tasks,
    comments,
    activities,
  };
  return store;
}
