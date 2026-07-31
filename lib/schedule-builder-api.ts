/**
 * Acesso a dados da montagem da escala (visão do líder, `schedule-builder`).
 *
 * Enquanto `lib/schedule-api.ts` lida com a disponibilidade declarada pelos
 * membros (`schedule_entries_*`), este módulo lida com a escala já montada —
 * quem foi designado para cada função em cada data — guardada na tabela
 * `built_schedules`, compartilhada pelas três escalas e discriminada pela
 * coluna `schedule_type`.
 */
import { createClient } from '@/lib/supabase/client'
import type { ScheduleType, ScheduleStatus } from '@/lib/types'
import { SCHEDULE_CONFIG } from '@/lib/types'

/**
 * Cria o cliente Supabase do navegador sob demanda, para que importar este
 * módulo não dispare a inicialização durante a renderização no servidor.
 */
function getClient() {
  if (typeof window === 'undefined') {
    throw new Error('Supabase client can only be used in the browser')
  }
  return createClient()
}

/** Membro de uma escala junto da sua disponibilidade em uma data. */
export interface MemberAvailability {
  id: string
  name: string
  email: string
  /** Disponibilidade na data principal (domingo). */
  status: ScheduleStatus | null
  /** Disponibilidade na quinta pareada. Só definido em colunas mescladas. */
  thursdayStatus?: ScheduleStatus | null
  /**
   * Texto de alerta quando a pessoa pode no domingo mas não na quinta pareada.
   * `null` quando não há ressalva. Ver {@link getMembersWithAvailability}.
   */
  thursdayWarning?: string | null
}

/** Designação já gravada: uma função, em uma data, de uma escala. */
export interface BuiltScheduleEntry {
  id: string
  schedule_type: ScheduleType
  schedule_date: string
  role: string
  member_name: string | null
  member_email: string | null
}

/** Funções da escala de louvor, na ordem em que aparecem na tabela. */
export const BAND_ROLES = [
  { key: 'ministro', label: 'Ministro', icon: '🎤' },
  { key: 'voz1', label: 'Voz 1', icon: '🎙️' },
  { key: 'voz2', label: 'Voz 2', icon: '🎙️' },
  { key: 'violao', label: 'Violão', icon: '🎸' },
  { key: 'teclado', label: 'Teclado', icon: '🎹' },
  { key: 'guitarra', label: 'Guitarra', icon: '🎸' },
  { key: 'baixo', label: 'Baixo', icon: '🎸' },
  { key: 'bateria', label: 'Bateria', icon: '🥁' },
] as const

/** Funções da escala de sonoplastia. */
export const SOUND_ROLES = [
  { key: 'mesa_som', label: 'Mesa de Som', icon: '🎚️' },
  { key: 'apoio', label: 'Apoio', icon: '🎛' },
] as const

/** Funções da escala de mídia. */
export const MEDIA_ROLES = [
  { key: 'transmissao', label: 'Transmissão', icon: '💻' },
] as const

export type BandRole = typeof BAND_ROLES[number]['key']
export type SoundRole = typeof SOUND_ROLES[number]['key']
export type MediaRole = typeof MEDIA_ROLES[number]['key']
export type AnyRole = BandRole | SoundRole | MediaRole

export type RoleType = typeof BAND_ROLES[number] | typeof SOUND_ROLES[number] | typeof MEDIA_ROLES[number]

/**
 * Funções que compõem a escala informada. O louvor é o padrão de segurança.
 *
 * O retorno é `readonly` porque as listas de funções são constantes `as const`:
 * expor como array mutável exigiria uma conversão insegura.
 */
export function getRolesForScheduleType(scheduleType: string): readonly RoleType[] {
  switch (scheduleType) {
    case 'louvor':
      return BAND_ROLES
    case 'sonoplastia':
      return SOUND_ROLES
    case 'midia':
      return MEDIA_ROLES
    default:
      return BAND_ROLES
  }
}

/**
 * Lista os membros da escala com a disponibilidade declarada para uma data.
 *
 * Duas regras de negócio importantes:
 *
 * 1. **Sem registro significa disponível.** Quem não respondeu é tratado como
 *    `'disponivel'`, e não como um estado desconhecido (ver
 *    {@link ScheduleStatus}).
 * 2. **O domingo prevalece sobre a quinta.** Em colunas mescladas (o par
 *    ensaio/culto do louvor), `thursdayDate` é informada e o status retornado
 *    continua sendo o do domingo. A quinta nunca torna alguém indisponível: ela
 *    apenas gera um `thursdayWarning` para quem pode no domingo mas não no
 *    ensaio, de modo que a pessoa siga escalável com a ressalva visível.
 *
 * @param date Data principal (domingo), em `yyyy-MM-dd`.
 * @param thursdayDate Quinta pareada, quando a coluna é mesclada.
 */
export async function getMembersWithAvailability(
  scheduleType: ScheduleType,
  date: string,
  thursdayDate?: string
): Promise<MemberAvailability[]> {
  const supabase = getClient()
  const config = SCHEDULE_CONFIG[scheduleType]

  const { data: members, error: membersError } = await supabase
    .from(config.membersTable)
    .select('*')
    .order('name')

  if (membersError) throw new Error(membersError.message)
  if (!members || members.length === 0) return []

  const [sundayEntries, thursdayEntries] = await Promise.all([
    fetchEntriesForDate(config.entriesTable, date),
    thursdayDate ? fetchEntriesForDate(config.entriesTable, thursdayDate) : Promise.resolve([]),
  ])

  return members.map((member) => {
    const sundayStatus = findStatus(sundayEntries, member.id)
    const thursdayStatus = findStatus(thursdayEntries, member.id)

    return {
      id: member.id,
      name: member.name,
      email: member.email,
      status: sundayStatus,
      thursdayStatus: thursdayDate ? thursdayStatus : undefined,
      thursdayWarning: thursdayDate ? buildThursdayWarning(sundayStatus, thursdayStatus) : null,
    }
  })
}

/** Registro de disponibilidade cru, como lido de `schedule_entries_*`. */
type AvailabilityRow = { member_id: string; status: ScheduleStatus }

/**
 * Registros de disponibilidade de uma data. Falhas de leitura retornam vazio,
 * o que faz todos serem tratados como disponíveis — o mesmo resultado de uma
 * data em que ninguém respondeu.
 */
async function fetchEntriesForDate(entriesTable: string, date: string): Promise<AvailabilityRow[]> {
  const supabase = getClient()
  const { data, error } = await supabase
    .from(entriesTable)
    .select('*')
    .eq('schedule_date', date)

  if (error || !data) return []
  return data
}

/** Status do membro nos registros, assumindo `'disponivel'` na ausência de um. */
function findStatus(entries: AvailabilityRow[], memberId: string): ScheduleStatus {
  return entries.find((entry) => entry.member_id === memberId)?.status ?? 'disponivel'
}

/**
 * Ressalva a exibir quando a pessoa pode no domingo mas não no ensaio da
 * quinta. Retorna `null` quando não há o que alertar.
 */
function buildThursdayWarning(
  sundayStatus: ScheduleStatus,
  thursdayStatus: ScheduleStatus
): string | null {
  if (sundayStatus !== 'disponivel') return null

  switch (thursdayStatus) {
    case 'indisponivel':
      return 'indisponível quinta-feira'
    case 'nao_sei':
      return 'não sabe se pode participar na quinta-feira'
    default:
      return null
  }
}

/**
 * Designações já gravadas para a escala no intervalo informado.
 *
 * @param startDate Início do intervalo, inclusive, em `yyyy-MM-dd`.
 * @param endDate Fim do intervalo, inclusive, em `yyyy-MM-dd`.
 */
export async function getBuiltScheduleEntries(
  scheduleType: ScheduleType,
  startDate: string,
  endDate: string
): Promise<BuiltScheduleEntry[]> {
  const supabase = getClient()
  const { data, error } = await supabase
    .from('built_schedules')
    .select('*')
    .eq('schedule_type', scheduleType)
    .gte('schedule_date', startDate)
    .lte('schedule_date', endDate)

  if (error) throw new Error(error.message)
  return data || []
}

/**
 * Escala uma pessoa em uma função numa data, substituindo quem estivesse ali
 * (chave `schedule_type` + `schedule_date` + `role`).
 */
export async function upsertBuiltScheduleEntry(
  scheduleType: ScheduleType,
  scheduleDate: string,
  role: string,
  memberName: string | null,
  memberEmail: string | null
): Promise<BuiltScheduleEntry> {
  const supabase = getClient()
  const { data, error } = await supabase
    .from('built_schedules')
    .upsert(
      {
        schedule_type: scheduleType,
        schedule_date: scheduleDate,
        role,
        member_name: memberName,
        member_email: memberEmail,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'schedule_type,schedule_date,role' }
    )
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

/** Remove a designação de uma função em uma data, deixando a célula vazia. */
export async function removeBuiltScheduleEntry(
  scheduleType: ScheduleType,
  scheduleDate: string,
  role: string
): Promise<void> {
  const supabase = getClient()
  const { error } = await supabase
    .from('built_schedules')
    .delete()
    .eq('schedule_type', scheduleType)
    .eq('schedule_date', scheduleDate)
    .eq('role', role)

  if (error) throw new Error(error.message)
}
