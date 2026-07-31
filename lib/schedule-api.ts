/**
 * Acesso a dados das escalas usado pela visão do membro (`schedule-table`).
 *
 * Todas as funções escolhem a tabela pelo `scheduleType` recebido, usando o
 * mapeamento de `SCHEDULE_CONFIG`, e rodam apenas no navegador.
 */
import { createClient } from '@/lib/supabase/client'
import type { Member, ScheduleEntry, ScheduleStatus, ScheduleType, ConflictInfo } from '@/lib/types'
import { SCHEDULE_CONFIG } from '@/lib/types'

/**
 * Cria o cliente Supabase do navegador.
 *
 * A criação é feita sob demanda (e não no escopo do módulo) para que importar
 * este arquivo em um componente de servidor não dispare a inicialização.
 */
function getClient() {
  if (typeof window === 'undefined') {
    throw new Error('Supabase client can only be used in the browser')
  }
  return createClient()
}

/** Normaliza o e-mail para o formato usado como chave no banco. */
function normalizeEmail(email: string): string {
  return email.toLowerCase().trim()
}

/**
 * Busca um membro da escala pelo e-mail.
 *
 * @returns O membro, ou `null` se o e-mail não estiver cadastrado nesta escala.
 */
export async function lookupMember(email: string, scheduleType: ScheduleType): Promise<Member | null> {
  const supabase = getClient()
  const table = SCHEDULE_CONFIG[scheduleType].membersTable
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('email', normalizeEmail(email))
    .single()

  if (error || !data) return null
  return data
}

/** Cadastra um novo membro na escala e retorna o registro criado. */
export async function registerMember(email: string, name: string, scheduleType: ScheduleType): Promise<Member> {
  const supabase = getClient()
  const table = SCHEDULE_CONFIG[scheduleType].membersTable
  const { data, error } = await supabase
    .from(table)
    .insert({ email: normalizeEmail(email), name: name.trim() })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

/** Lista todos os membros da escala em ordem alfabética. */
export async function getAllMembers(scheduleType: ScheduleType): Promise<Member[]> {
  const supabase = getClient()
  const table = SCHEDULE_CONFIG[scheduleType].membersTable
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('name')

  if (error) throw new Error(error.message)
  return data || []
}

/**
 * Lista os registros de disponibilidade da escala dentro do intervalo.
 *
 * Só existem registros para quem se manifestou: datas sem linha significam
 * "disponível" (ver {@link ScheduleStatus}).
 *
 * @param startDate Início do intervalo, inclusive, em `yyyy-MM-dd`.
 * @param endDate Fim do intervalo, inclusive, em `yyyy-MM-dd`.
 */
export async function getScheduleEntries(
  startDate: string,
  endDate: string,
  scheduleType: ScheduleType
): Promise<ScheduleEntry[]> {
  const supabase = getClient()
  const table = SCHEDULE_CONFIG[scheduleType].entriesTable
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .gte('schedule_date', startDate)
    .lte('schedule_date', endDate)

  if (error) throw new Error(error.message)
  return data || []
}

/**
 * Grava a disponibilidade de um membro para uma data, substituindo o valor
 * anterior caso já exista (chave `member_id` + `schedule_date`).
 */
export async function upsertScheduleEntry(
  memberId: string,
  scheduleDate: string,
  status: ScheduleStatus,
  scheduleType: ScheduleType
): Promise<ScheduleEntry> {
  const supabase = getClient()
  const table = SCHEDULE_CONFIG[scheduleType].entriesTable
  const { data, error } = await supabase
    .from(table)
    .upsert(
      { member_id: memberId, schedule_date: scheduleDate, status },
      { onConflict: 'member_id,schedule_date' }
    )
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

/**
 * Datas em que a pessoa está marcada como disponível em uma outra escala.
 *
 * Cada escala tem a sua própria tabela de membros, então a mesma pessoa é
 * reconciliada entre escalas pelo e-mail. Uma data só entra no resultado quando
 * existe registro explícito com status `'disponivel'` na outra escala.
 *
 * @returns Uma entrada por data conflitante, listando as outras escalas
 * envolvidas.
 */
export async function getConflicts(
  email: string,
  currentScheduleType: ScheduleType,
  startDate: string,
  endDate: string
): Promise<ConflictInfo[]> {
  const otherTypes = (Object.keys(SCHEDULE_CONFIG) as ScheduleType[]).filter(
    (type) => type !== currentScheduleType
  )

  // Cada escala é independente das outras, então as consultas rodam em
  // paralelo. Esta função é reexecutada a cada mudança de status, então o
  // encadeamento sequencial era perceptível na interface.
  const datesByType = await Promise.all(
    otherTypes.map((type) => getAvailableDates(email, type, startDate, endDate))
  )

  const conflictMap: Record<string, ScheduleType[]> = {}
  otherTypes.forEach((type, index) => {
    for (const date of datesByType[index]) {
      conflictMap[date] = conflictMap[date] ?? []
      conflictMap[date].push(type)
    }
  })

  return Object.entries(conflictMap).map(([date, schedules]) => ({ date, schedules }))
}

/**
 * Datas do intervalo em que a pessoa está explicitamente disponível na escala
 * informada. Retorna vazio se o e-mail não pertencer a essa escala.
 */
async function getAvailableDates(
  email: string,
  scheduleType: ScheduleType,
  startDate: string,
  endDate: string
): Promise<string[]> {
  const supabase = getClient()
  const { membersTable, entriesTable } = SCHEDULE_CONFIG[scheduleType]

  const { data: member } = await supabase
    .from(membersTable)
    .select('id')
    .eq('email', normalizeEmail(email))
    .single()

  if (!member) return []

  const { data: entries } = await supabase
    .from(entriesTable)
    .select('schedule_date')
    .eq('member_id', member.id)
    .eq('status', 'disponivel')
    .gte('schedule_date', startDate)
    .lte('schedule_date', endDate)

  return (entries ?? []).map((entry) => entry.schedule_date)
}
