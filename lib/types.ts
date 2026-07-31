/**
 * Tipos e configuração compartilhados pelas três escalas do sistema.
 *
 * Cada escala (louvor, sonoplastia, mídia) tem o seu próprio par de tabelas no
 * Supabase — uma de membros e uma de registros de disponibilidade. O mapeamento
 * de escala para tabela vive em {@link SCHEDULE_CONFIG}, que é a única fonte de
 * verdade para esses nomes.
 */

/**
 * Disponibilidade que um membro declara para uma data.
 *
 * Importante: a ausência de registro no banco **não** é um quarto estado. Quando
 * não existe linha para (membro, data), o sistema assume `'disponivel'`. Ou seja,
 * só é gravada uma linha quando o membro se manifesta de forma diferente do
 * padrão. Ver `getEntryStatus` em `components/schedule-table.tsx` e
 * `getMemberStatusForDate` em `lib/schedule-builder-api.ts`.
 */
export type ScheduleStatus = 'disponivel' | 'indisponivel' | 'nao_sei'

/** Escalas atendidas pelo sistema. Usado como chave em {@link SCHEDULE_CONFIG}. */
export type ScheduleType = 'louvor' | 'sonoplastia' | 'midia'

/** Pessoa cadastrada em uma escala (linha de `members_*`). */
export interface Member {
  id: string
  email: string
  name: string
  created_at: string
}

/**
 * Registro de disponibilidade de um membro para uma data (linha de
 * `schedule_entries_*`).
 */
export interface ScheduleEntry {
  id: string
  /** FK para `members_*.id` da mesma escala. */
  member_id: string
  /** Data no formato `yyyy-MM-dd`. */
  schedule_date: string
  status: ScheduleStatus
  created_at: string
}

/**
 * Registro de disponibilidade já acompanhado dos dados do membro, como vem das
 * consultas que fazem join com `members_*`.
 */
export interface ScheduleWithMember extends ScheduleEntry {
  members: Pick<Member, 'name' | 'email'>
}

/**
 * Aviso de que a mesma pessoa está disponível em mais de uma escala na mesma
 * data. As pessoas são reconciliadas entre escalas pelo e-mail, já que cada
 * escala tem a sua própria tabela de membros.
 */
export interface ConflictInfo {
  date: string
  /** Outras escalas em que a pessoa está marcada como disponível nessa data. */
  schedules: ScheduleType[]
}

/**
 * Configuração de cada escala: rótulos exibidos na interface, tabelas
 * correspondentes no banco e quais dias entram no calendário.
 */
export const SCHEDULE_CONFIG: Record<ScheduleType, {
  /** Nome exibido na interface. */
  label: string
  /** Tabela de membros no Supabase. */
  membersTable: string
  /** Tabela de registros de disponibilidade no Supabase. */
  entriesTable: string
  /** Texto de apoio exibido nos cabeçalhos. */
  description: string
  /**
   * Quando `true`, a escala considera apenas os domingos (cultos). Quando
   * `false`, considera quintas (ensaios) e domingos, e o builder trata o par
   * ensaio/culto da mesma semana como uma coluna só.
   */
  sundaysOnly: boolean
}> = {
  louvor: {
    label: 'Louvor',
    membersTable: 'members_louvor',
    entriesTable: 'schedule_entries_louvor',
    description: 'Escala do Louvor',
    sundaysOnly: false,
  },
  sonoplastia: {
    label: 'Sonoplastia',
    membersTable: 'members_sonoplastia',
    entriesTable: 'schedule_entries_sonoplastia',
    description: 'Escala da Sonoplastia/Mídia',
    sundaysOnly: false,
  },
  midia: {
    label: 'Midia',
    membersTable: 'members_midia',
    entriesTable: 'schedule_entries_midia',
    description: 'Escala da Midia',
    sundaysOnly: true,
  },
}
