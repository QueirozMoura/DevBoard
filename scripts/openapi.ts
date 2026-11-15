/**
 * Fonte única do contrato REST (OpenAPI 3.1). `npm run openapi:generate` grava
 * `openapi.json`; um teste garante que o arquivo versionado não diverge deste código.
 * Rotas com `x-status: planned` fazem parte do contrato mas ainda não existem no servidor.
 */
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type Obj = Record<string, Json>;

const ref = (name: string): Obj => ({ $ref: `#/components/schemas/${name}` });
const uuid: Obj = { type: 'string', format: 'uuid' };
const dateTime: Obj = { type: 'string', format: 'date-time' };
const nullable = (schema: Obj): Obj => ({ anyOf: [schema, { type: 'null' }] });

function object(properties: Obj, required: string[], extra: Obj = {}): Obj {
  return { type: 'object', additionalProperties: false, required, properties, ...extra };
}

const ROLES = ['OWNER', 'MEMBER'];
const STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const ACTIVITY_TYPES = [
  'PROJECT_CREATED',
  'PROJECT_UPDATED',
  'MEMBER_ADDED',
  'MEMBER_ROLE_CHANGED',
  'MEMBER_REMOVED',
  'TASK_CREATED',
  'TASK_UPDATED',
  'TASK_MOVED',
  'TASK_DELETED',
  'COMMENT_ADDED',
];
const ERROR_CODES = [
  'VALIDATION_ERROR',
  'LOGIN_VALIDATION_ERROR',
  'INVALID_CURSOR',
  'UNAUTHORIZED',
  'USER_NOT_FOUND',
  'INVALID_CREDENTIALS',
  'INVALID_REFRESH_TOKEN',
  'FORBIDDEN',
  'CSRF_ORIGIN_REJECTED',
  'NOT_FOUND',
  'INVITEE_NOT_FOUND',
  'EMAIL_ALREADY_EXISTS',
  'ALREADY_MEMBER',
  'LAST_OWNER',
  'INVALID_ASSIGNEE',
  'INVALID_MOVE_TARGET',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
];

const schemas: Obj = {
  ErrorCode: { type: 'string', enum: ERROR_CODES },
  Error: object(
    {
      error: {
        description:
          'Código estável. Erros de transporte do Fastify (JSON malformado, tipo de mídia) usam códigos `FST_*`.',
        anyOf: [ref('ErrorCode'), { type: 'string', pattern: '^FST_' }],
      },
      message: {
        type: 'string',
        description: 'Texto genérico para exibição. NÃO é contratual: use `error`.',
      },
    },
    ['error', 'message'],
  ),
  ValidationError: object(
    {
      error: { const: 'VALIDATION_ERROR' },
      message: { type: 'string' },
      details: {
        type: 'array',
        description:
          'Presente apenas nos endpoints de projetos, tarefas e comentários (não nos de autenticação).',
        items: object({ path: { type: 'string' }, message: { type: 'string' } }, [
          'path',
          'message',
        ]),
      },
    },
    ['error', 'message'],
  ),
  User: object(
    {
      id: uuid,
      name: { type: 'string', minLength: 2, maxLength: 100 },
      email: { type: 'string', format: 'email', maxLength: 254 },
      createdAt: dateTime,
    },
    ['id', 'name', 'email', 'createdAt'],
  ),
  RegisterRequest: object(
    {
      name: { type: 'string', minLength: 2, maxLength: 100 },
      email: { type: 'string', format: 'email', maxLength: 254 },
      password: { type: 'string', minLength: 8, maxLength: 128 },
    },
    ['name', 'email', 'password'],
  ),
  LoginRequest: object(
    {
      email: { type: 'string', format: 'email', maxLength: 254 },
      password: { type: 'string', minLength: 8, maxLength: 128 },
    },
    ['email', 'password'],
  ),
  RefreshTokenField: {
    type: 'string',
    pattern: '^[A-Za-z0-9_-]{43}$',
    deprecated: true,
    description:
      'FASE ATUAL (compat): token opaco de 43 caracteres no corpo. Na migração para cookie HttpOnly ' +
      '(docs/refresh-cookie-migration.md) este campo deixa de ser retornado/aceito. ' +
      'O frontend NÃO deve depender dele.',
  },
  LoginResponse: object(
    {
      accessToken: { type: 'string', description: 'JWT HS256, validade de 15 minutos.' },
      refreshToken: ref('RefreshTokenField'),
      user: ref('User'),
    },
    ['accessToken', 'user'],
  ),
  RefreshResponse: object(
    {
      accessToken: { type: 'string' },
      refreshToken: ref('RefreshTokenField'),
    },
    ['accessToken'],
  ),
  RefreshRequest: object({ refreshToken: ref('RefreshTokenField') }, [], {
    description:
      'Corpo opcional: na versão final o refresh token vem somente do cookie `refresh_token`.',
  }),
  ProfilePatch: {
    ...object(
      {
        name: { type: 'string', minLength: 2, maxLength: 100 },
        email: { type: 'string', format: 'email', maxLength: 254 },
      },
      [],
    ),
    minProperties: 1,
  },
  Role: { type: 'string', enum: ROLES },
  Project: object(
    {
      id: uuid,
      name: { type: 'string', minLength: 1, maxLength: 100 },
      description: nullable({ type: 'string', maxLength: 2000 }),
      myRole: ref('Role'),
      memberCount: { type: 'integer', minimum: 1 },
      taskCount: { type: 'integer', minimum: 0 },
      createdAt: dateTime,
      updatedAt: dateTime,
    },
    [
      'id',
      'name',
      'description',
      'myRole',
      'memberCount',
      'taskCount',
      'createdAt',
      'updatedAt',
    ],
  ),
  ProjectCreate: object(
    {
      name: { type: 'string', minLength: 1, maxLength: 100 },
      description: nullable({ type: 'string', maxLength: 2000 }),
    },
    ['name'],
  ),
  ProjectUpdate: {
    ...object(
      {
        name: { type: 'string', minLength: 1, maxLength: 100 },
        description: nullable({ type: 'string', maxLength: 2000 }),
      },
      [],
    ),
    minProperties: 1,
  },
  Member: object(
    {
      userId: uuid,
      name: { type: 'string' },
      email: { type: 'string', format: 'email' },
      role: ref('Role'),
      joinedAt: dateTime,
    },
    ['userId', 'name', 'email', 'role', 'joinedAt'],
  ),
  MemberAdd: object(
    { email: { type: 'string', format: 'email', maxLength: 254 }, role: ref('Role') },
    ['email'],
    { description: '`role` padrão: MEMBER.' },
  ),
  MemberUpdate: object({ role: ref('Role') }, ['role']),
  TaskStatus: { type: 'string', enum: STATUSES },
  TaskPriority: { type: 'string', enum: PRIORITIES },
  Task: object(
    {
      id: uuid,
      projectId: uuid,
      title: { type: 'string', minLength: 1, maxLength: 200 },
      description: nullable({ type: 'string', maxLength: 10000 }),
      status: ref('TaskStatus'),
      priority: ref('TaskPriority'),
      assigneeId: nullable(uuid),
      dueDate: nullable(dateTime),
      position: {
        type: 'string',
        description:
          'Ordem na coluna (rank fracionário, opaco). Ordene por (status, position). NÃO calcule no cliente: use `POST /tasks/{taskId}/move`.',
      },
      createdById: nullable(uuid),
      commentCount: { type: 'integer', minimum: 0 },
      createdAt: dateTime,
      updatedAt: dateTime,
    },
    [
      'id',
      'projectId',
      'title',
      'description',
      'status',
      'priority',
      'assigneeId',
      'dueDate',
      'position',
      'createdById',
      'commentCount',
      'createdAt',
      'updatedAt',
    ],
  ),
  TaskCreate: object(
    {
      title: { type: 'string', minLength: 1, maxLength: 200 },
      description: nullable({ type: 'string', maxLength: 10000 }),
      status: ref('TaskStatus'),
      priority: ref('TaskPriority'),
      assigneeId: nullable(uuid),
      dueDate: nullable(dateTime),
    },
    ['title'],
    {
      description:
        'Padrões: status TODO, priority MEDIUM. A tarefa entra no FIM da coluna. `assigneeId` deve ser membro do projeto.',
    },
  ),
  TaskUpdate: {
    ...object(
      {
        title: { type: 'string', minLength: 1, maxLength: 200 },
        description: nullable({ type: 'string', maxLength: 10000 }),
        priority: ref('TaskPriority'),
        assigneeId: nullable(uuid),
        dueDate: nullable(dateTime),
      },
      [],
      { description: 'Para mudar status/posição use `/move`.' },
    ),
    minProperties: 1,
  },
  TaskMove: object(
    {
      status: {
        ...ref('TaskStatus'),
        description: 'Coluna de destino. Omitido: mantém a coluna atual.',
      },
      afterTaskId: {
        ...nullable(uuid),
        description:
          'Tarefa que ficará imediatamente ACIMA na coluna de destino; `null` = topo da coluna. Para o fim da coluna, envie o id da última tarefa.',
      },
    },
    ['afterTaskId'],
  ),
  BoardColumn: object(
    {
      status: ref('TaskStatus'),
      tasks: { type: 'array', items: ref('Task') },
      total: { type: 'integer', minimum: 0 },
      hasMore: {
        type: 'boolean',
        description: 'Mais tarefas via `GET /projects/{id}/tasks?status=...&cursor=...`.',
      },
      nextCursor: nullable({ type: 'string' }),
    },
    ['status', 'tasks', 'total', 'hasMore', 'nextCursor'],
  ),
  Board: object(
    {
      columns: {
        type: 'array',
        description: 'Sempre 4 colunas, na ordem TODO, IN_PROGRESS, IN_REVIEW, DONE.',
        items: ref('BoardColumn'),
      },
    },
    ['columns'],
  ),
  Comment: object(
    {
      id: uuid,
      taskId: uuid,
      author: nullable(object({ id: uuid, name: { type: 'string' } }, ['id', 'name'])),
      body: { type: 'string', minLength: 1, maxLength: 5000 },
      createdAt: dateTime,
      updatedAt: dateTime,
    },
    ['id', 'taskId', 'author', 'body', 'createdAt', 'updatedAt'],
  ),
  CommentBody: object({ body: { type: 'string', minLength: 1, maxLength: 5000 } }, [
    'body',
  ]),
  ActivityType: { type: 'string', enum: ACTIVITY_TYPES },
  Activity: object(
    {
      id: uuid,
      projectId: uuid,
      taskId: nullable(uuid),
      actor: nullable(object({ id: uuid, name: { type: 'string' } }, ['id', 'name'])),
      type: ref('ActivityType'),
      data: {
        type: 'object',
        additionalProperties: true,
        description:
          'Detalhes por tipo (ver docs/api-contract.md §Atividades). Sempre presente; pode ser `{}`.',
      },
      createdAt: dateTime,
    },
    ['id', 'projectId', 'taskId', 'actor', 'type', 'data', 'createdAt'],
  ),
};

function page(item: string): Obj {
  return object(
    {
      items: { type: 'array', items: ref(item) },
      nextCursor: nullable({ type: 'string' }),
    },
    ['items', 'nextCursor'],
  );
}
schemas.ProjectPage = page('Project');
schemas.MemberPage = page('Member');
schemas.TaskPage = page('Task');
schemas.CommentPage = page('Comment');
schemas.ActivityPage = page('Activity');

const errorResponse = (description: string, schema = 'Error'): Obj => ({
  description,
  content: { 'application/json': { schema: ref(schema) } },
});

const responses: Obj = {
  ValidationError: errorResponse(
    'Corpo, parâmetro ou cursor inválido.',
    'ValidationError',
  ),
  Unauthorized: {
    ...errorResponse('Access token ausente, inválido ou expirado.'),
    headers: { 'WWW-Authenticate': { schema: { type: 'string', const: 'Bearer' } } },
  },
  InvalidCredentials: errorResponse(
    '`INVALID_CREDENTIALS` (login) ou `INVALID_REFRESH_TOKEN` (refresh/logout: token ausente, inválido, expirado ou reutilizado).',
  ),
  Forbidden: errorResponse(
    'Membro sem papel suficiente (ex.: ação exclusiva de OWNER) ou Origin rejeitado.',
  ),
  NotFound: errorResponse(
    'Recurso inexistente OU projeto do qual o usuário não é membro (indistinguíveis de propósito).',
  ),
  Conflict: errorResponse('Conflito de estado (e-mail/membro duplicado, último OWNER).'),
  Unprocessable: errorResponse(
    'Referência inválida (assignee não é membro, alvo de move).',
  ),
  RateLimited: {
    ...errorResponse('Limite de requisições excedido.'),
    headers: { 'Retry-After': { schema: { type: 'integer' }, description: 'Segundos.' } },
  },
};

const param = (name: string): Obj => ({
  name,
  in: 'path',
  required: true,
  schema: uuid,
});
const parameters: Obj = {
  ProjectId: param('projectId'),
  TaskId: param('taskId'),
  CommentId: param('commentId'),
  UserId: param('userId'),
  Cursor: {
    name: 'cursor',
    in: 'query',
    schema: { type: 'string', maxLength: 512 },
    description: 'Opaco. Use o `nextCursor` da resposta anterior, sem alterar.',
  },
  Limit: {
    name: 'limit',
    in: 'query',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
};
const pref = (name: string): Obj => ({ $ref: `#/components/parameters/${name}` });
const rref = (name: string): Obj => ({ $ref: `#/components/responses/${name}` });
const json = (schema: Obj): Obj => ({ 'application/json': { schema } });
const body = (schema: Obj, required = true): Obj => ({
  required,
  content: json(schema),
});
const ok = (description: string, schema: Obj): Obj => ({
  description,
  content: json(schema),
});
const NOCACHE = { 'Cache-Control': { schema: { type: 'string', const: 'no-store' } } };

interface OpInput {
  id: string;
  tag: string;
  summary: string;
  status: 'implemented' | 'planned';
  auth?: boolean;
  role?: 'MEMBER' | 'OWNER' | 'AUTHOR_OR_OWNER' | 'AUTHOR';
  params?: Obj[];
  body?: Obj;
  success: [string, Obj];
  errors?: string[];
  description?: string;
}

function op(input: OpInput): Obj {
  const auth = input.auth ?? true;
  const errors = new Set(input.errors ?? []);
  if (auth) errors.add('Unauthorized');
  if (input.role) {
    errors.add('NotFound');
    if (input.role !== 'MEMBER') errors.add('Forbidden');
  }
  errors.add('RateLimited');
  const out: Obj = {
    operationId: input.id,
    tags: [input.tag],
    summary: input.summary,
    'x-status': input.status,
    security: auth ? [{ bearerAuth: [] }] : [],
    responses: {
      [input.success[0]]: input.success[1],
      ...Object.fromEntries([...errors].map((name) => [statusFor(name), rref(name)])),
    },
  };
  if (input.description) out.description = input.description;
  if (input.role) out['x-required-role'] = input.role;
  if (input.params) out.parameters = input.params;
  if (input.body) out.requestBody = input.body;
  return out;
}

function statusFor(response: string): string {
  const map: Record<string, string> = {
    ValidationError: '400',
    Unauthorized: '401',
    InvalidCredentials: '401',
    Forbidden: '403',
    NotFound: '404',
    Conflict: '409',
    Unprocessable: '422',
    RateLimited: '429',
  };
  return map[response] ?? 'default';
}

const created = (description: string, schema: Obj): [string, Obj] => [
  '201',
  ok(description, schema),
];
const noContent: [string, Obj] = ['204', { description: 'Sem conteúdo.' }];
const P = pref('ProjectId');
const T = pref('TaskId');
const paged = [pref('Cursor'), pref('Limit')];

const paths: Obj = {
  '/health': {
    get: op({
      id: 'getHealth',
      tag: 'Infra',
      summary: 'Liveness',
      status: 'implemented',
      auth: false,
      success: [
        '200',
        ok(
          'Servidor no ar.',
          object(
            {
              status: { const: 'ok' },
              uptime: { type: 'integer' },
              timestamp: dateTime,
            },
            ['status', 'uptime', 'timestamp'],
          ),
        ),
      ],
    }),
  },
  '/api/v1/auth/register': {
    post: op({
      id: 'register',
      tag: 'Auth',
      summary: 'Cadastro',
      status: 'implemented',
      auth: false,
      body: body(ref('RegisterRequest')),
      success: created('Usuário criado.', ref('User')),
      errors: ['ValidationError', 'Conflict'],
    }),
  },
  '/api/v1/auth/login': {
    post: op({
      id: 'login',
      tag: 'Auth',
      summary: 'Login',
      status: 'implemented',
      auth: false,
      body: body(ref('LoginRequest')),
      description:
        'Cria uma sessão (família de refresh tokens). Resposta com `Cache-Control: no-store`. ' +
        'Na versão final também define o cookie `refresh_token` (ver docs/refresh-cookie-migration.md).',
      success: [
        '200',
        { ...ok('Sessão criada.', ref('LoginResponse')), headers: NOCACHE },
      ],
      errors: ['ValidationError', 'InvalidCredentials'],
    }),
  },
  '/api/v1/auth/refresh': {
    post: op({
      id: 'refresh',
      tag: 'Auth',
      summary: 'Rotaciona o refresh token',
      status: 'implemented',
      auth: false,
      body: body(ref('RefreshRequest'), false),
      description:
        'Reuso de token já rotacionado revoga toda a sessão (401). O cliente deve manter UMA chamada de ' +
        'refresh em andamento e reutilizá-la entre requisições concorrentes. Na versão final o token vem do ' +
        'cookie e o `Origin` é validado.',
      success: ['200', { ...ok('Novo par.', ref('RefreshResponse')), headers: NOCACHE }],
      errors: ['InvalidCredentials', 'Forbidden'],
    }),
  },
  '/api/v1/auth/logout': {
    post: op({
      id: 'logout',
      tag: 'Auth',
      summary: 'Encerra a sessão',
      status: 'implemented',
      auth: false,
      body: body(ref('RefreshRequest'), false),
      description: 'Idempotente para tokens conhecidos. Na versão final limpa o cookie.',
      success: noContent,
      errors: ['InvalidCredentials', 'Forbidden'],
    }),
  },
  '/api/v1/me': {
    get: op({
      id: 'getMe',
      tag: 'Perfil',
      summary: 'Perfil do usuário autenticado',
      status: 'implemented',
      success: ['200', { ...ok('Perfil.', ref('User')), headers: NOCACHE }],
    }),
    patch: op({
      id: 'updateMe',
      tag: 'Perfil',
      summary: 'Atualiza nome e/ou e-mail',
      status: 'implemented',
      body: body(ref('ProfilePatch')),
      success: ['200', { ...ok('Perfil atualizado.', ref('User')), headers: NOCACHE }],
      errors: ['ValidationError', 'Conflict'],
    }),
  },
  '/api/v1/projects': {
    get: op({
      id: 'listProjects',
      tag: 'Projetos',
      summary: 'Projetos dos quais o usuário é membro',
      status: 'implemented',
      description: 'Ordem: createdAt desc, id desc.',
      params: paged,
      success: ['200', ok('Página.', ref('ProjectPage'))],
      errors: ['ValidationError'],
    }),
    post: op({
      id: 'createProject',
      tag: 'Projetos',
      summary: 'Cria projeto (criador vira OWNER)',
      status: 'implemented',
      body: body(ref('ProjectCreate')),
      success: created('Projeto criado.', ref('Project')),
      errors: ['ValidationError'],
    }),
  },
  '/api/v1/projects/{projectId}': {
    get: op({
      id: 'getProject',
      tag: 'Projetos',
      summary: 'Detalhe do projeto',
      status: 'implemented',
      role: 'MEMBER',
      params: [P],
      success: ['200', ok('Projeto.', ref('Project'))],
    }),
    patch: op({
      id: 'updateProject',
      tag: 'Projetos',
      summary: 'Edita nome/descrição',
      status: 'implemented',
      role: 'OWNER',
      params: [P],
      body: body(ref('ProjectUpdate')),
      success: ['200', ok('Projeto atualizado.', ref('Project'))],
      errors: ['ValidationError'],
    }),
    delete: op({
      id: 'deleteProject',
      tag: 'Projetos',
      summary: 'Exclui o projeto e todo o conteúdo (irreversível)',
      status: 'implemented',
      role: 'OWNER',
      params: [P],
      success: noContent,
    }),
  },
  '/api/v1/projects/{projectId}/members': {
    get: op({
      id: 'listMembers',
      tag: 'Membros',
      summary: 'Lista membros',
      status: 'implemented',
      description: 'Ordem: joinedAt asc, userId asc.',
      role: 'MEMBER',
      params: [P, ...paged],
      success: ['200', ok('Página.', ref('MemberPage'))],
      errors: ['ValidationError'],
    }),
    post: op({
      id: 'addMember',
      tag: 'Membros',
      summary: 'Adiciona usuário existente pelo e-mail',
      status: 'implemented',
      role: 'OWNER',
      params: [P],
      body: body(ref('MemberAdd')),
      success: created('Membro adicionado.', ref('Member')),
      errors: ['ValidationError', 'Conflict'],
    }),
  },
  '/api/v1/projects/{projectId}/members/{userId}': {
    patch: op({
      id: 'updateMemberRole',
      tag: 'Membros',
      summary: 'Altera o papel (não rebaixa o último OWNER)',
      status: 'implemented',
      role: 'OWNER',
      params: [P, pref('UserId')],
      body: body(ref('MemberUpdate')),
      success: ['200', ok('Membro atualizado.', ref('Member'))],
      errors: ['ValidationError', 'Conflict'],
    }),
    delete: op({
      id: 'removeMember',
      tag: 'Membros',
      summary: 'Remove membro (OWNER) ou sai do projeto (o próprio usuário)',
      status: 'implemented',
      role: 'MEMBER',
      description:
        'OWNER remove qualquer um; MEMBER só a si mesmo (senão 403). O último OWNER não pode sair (409 LAST_OWNER). ' +
        'Tarefas atribuídas ao removido ficam sem responsável.',
      params: [P, pref('UserId')],
      success: noContent,
      errors: ['Conflict', 'Forbidden'],
    }),
  },
  '/api/v1/projects/{projectId}/board': {
    get: op({
      id: 'getBoard',
      tag: 'Tarefas',
      summary: 'Quadro Kanban (4 colunas)',
      status: 'implemented',
      role: 'MEMBER',
      params: [
        P,
        {
          name: 'limitPerColumn',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
        },
      ],
      success: ['200', ok('Quadro.', ref('Board'))],
      errors: ['ValidationError'],
    }),
  },
  '/api/v1/projects/{projectId}/tasks': {
    get: op({
      id: 'listTasks',
      tag: 'Tarefas',
      summary: 'Lista tarefas com filtros',
      status: 'implemented',
      description: 'Ordem: (status TODO→DONE, position, id).',
      role: 'MEMBER',
      params: [
        P,
        ...paged,
        { name: 'status', in: 'query', schema: ref('TaskStatus') },
        { name: 'priority', in: 'query', schema: ref('TaskPriority') },
        {
          name: 'assigneeId',
          in: 'query',
          schema: uuid,
          description:
            'Filtra por responsável. Para tarefas sem responsável use `unassigned=true`.',
        },
        { name: 'unassigned', in: 'query', schema: { type: 'boolean' } },
        { name: 'q', in: 'query', schema: { type: 'string', maxLength: 100 } },
      ],
      success: ['200', ok('Página.', ref('TaskPage'))],
      errors: ['ValidationError'],
    }),
    post: op({
      id: 'createTask',
      tag: 'Tarefas',
      summary: 'Cria tarefa',
      status: 'implemented',
      role: 'MEMBER',
      params: [P],
      body: body(ref('TaskCreate')),
      success: created('Tarefa criada.', ref('Task')),
      errors: ['ValidationError', 'Unprocessable'],
    }),
  },
  '/api/v1/tasks/{taskId}': {
    get: op({
      id: 'getTask',
      tag: 'Tarefas',
      summary: 'Detalhe',
      status: 'implemented',
      role: 'MEMBER',
      params: [T],
      success: ['200', ok('Tarefa.', ref('Task'))],
    }),
    patch: op({
      id: 'updateTask',
      tag: 'Tarefas',
      summary: 'Edita campos (não move)',
      status: 'implemented',
      role: 'MEMBER',
      params: [T],
      body: body(ref('TaskUpdate')),
      success: ['200', ok('Tarefa atualizada.', ref('Task'))],
      errors: ['ValidationError', 'Unprocessable'],
    }),
    delete: op({
      id: 'deleteTask',
      tag: 'Tarefas',
      summary: 'Exclui (criador da tarefa ou OWNER)',
      status: 'implemented',
      role: 'AUTHOR_OR_OWNER',
      params: [T],
      success: noContent,
    }),
  },
  '/api/v1/tasks/{taskId}/move': {
    post: op({
      id: 'moveTask',
      tag: 'Tarefas',
      summary: 'Move entre colunas / reordena',
      status: 'implemented',
      role: 'MEMBER',
      description:
        'Atômico. `afterTaskId` deve estar na coluna de destino (e não ser a própria tarefa), senão 422 INVALID_MOVE_TARGET.',
      params: [T],
      body: body(ref('TaskMove')),
      success: ['200', ok('Tarefa movida (com a nova `position`).', ref('Task'))],
      errors: ['ValidationError', 'Unprocessable'],
    }),
  },
  '/api/v1/tasks/{taskId}/comments': {
    get: op({
      id: 'listComments',
      tag: 'Comentários',
      summary: 'Lista comentários (mais antigos primeiro)',
      status: 'implemented',
      role: 'MEMBER',
      params: [T, ...paged],
      success: ['200', ok('Página.', ref('CommentPage'))],
      errors: ['ValidationError'],
    }),
    post: op({
      id: 'createComment',
      tag: 'Comentários',
      summary: 'Comenta',
      status: 'implemented',
      role: 'MEMBER',
      params: [T],
      body: body(ref('CommentBody')),
      success: created('Comentário criado.', ref('Comment')),
      errors: ['ValidationError'],
    }),
  },
  '/api/v1/comments/{commentId}': {
    patch: op({
      id: 'updateComment',
      tag: 'Comentários',
      summary: 'Edita o próprio comentário',
      status: 'implemented',
      role: 'AUTHOR',
      params: [pref('CommentId')],
      body: body(ref('CommentBody')),
      success: ['200', ok('Comentário atualizado.', ref('Comment'))],
      errors: ['ValidationError'],
    }),
    delete: op({
      id: 'deleteComment',
      tag: 'Comentários',
      summary: 'Exclui (autor ou OWNER do projeto)',
      status: 'implemented',
      role: 'AUTHOR_OR_OWNER',
      params: [pref('CommentId')],
      success: noContent,
    }),
  },
  '/api/v1/projects/{projectId}/activities': {
    get: op({
      id: 'listActivities',
      tag: 'Atividades',
      summary: 'Histórico do projeto (mais recentes primeiro)',
      status: 'implemented',
      description: 'Somente leitura. Ordem: createdAt desc, id desc.',
      role: 'MEMBER',
      params: [
        P,
        ...paged,
        { name: 'taskId', in: 'query', schema: uuid },
        { name: 'type', in: 'query', schema: ref('ActivityType') },
      ],
      success: ['200', ok('Página.', ref('ActivityPage'))],
      errors: ['ValidationError'],
    }),
  },
};

export function buildOpenApi(): Obj {
  return {
    openapi: '3.1.0',
    info: {
      title: 'DevBoard API',
      version: '1.0.0-draft',
      description:
        'Contrato REST do DevBoard. Fonte: scripts/openapi.ts. Detalhes e regras: docs/api-contract.md. ' +
        '`x-status`: `implemented` (existe no servidor) ou `planned` (contrato estável, ainda sem implementação — ' +
        'use mocks). `x-required-role`: papel mínimo no projeto.',
    },
    servers: [{ url: 'http://127.0.0.1:3000', description: 'Desenvolvimento local' }],
    tags: [
      { name: 'Infra' },
      { name: 'Auth' },
      { name: 'Perfil' },
      { name: 'Projetos' },
      { name: 'Membros' },
      { name: 'Tarefas' },
      { name: 'Comentários' },
      { name: 'Atividades' },
    ],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas,
      parameters,
      responses,
    },
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const { writeFileSync } = await import('node:fs');
  const target = new URL('../openapi.json', import.meta.url);
  writeFileSync(target, `${JSON.stringify(buildOpenApi(), null, 2)}\n`);
  process.stdout.write('openapi.json gerado\n');
}
