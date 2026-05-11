import { createClient } from '@/lib/supabase/client'
import type { ScheduleType, ScheduleStatus } from '@/lib/types'
import { SCHEDULE_CONFIG } from '@/lib/types'

const supabase = createClient()

export interface MemberAvailability {
  id: string
  name: string
  email: string
  status: ScheduleStatus | null
  thursdayStatus?: ScheduleStatus | null
  thursdayWarning?: string | null
}

export interface BuiltScheduleEntry {
  id: string
  schedule_type: ScheduleType
  schedule_date: string
  role: string
  member_name: string | null
  member_email: string | null
}

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

export const SOUND_ROLES = [
  { key: 'mesa_som', label: 'Mesa de Som', icon: '🎚️' },
  { key: 'apoio', label: 'Apoio', icon: '🎛' },
] as const

export const MEDIA_ROLES = [
  { key: 'transmissao', label: 'Transmissão', icon: '💻' },
] as const

export type BandRole = typeof BAND_ROLES[number]['key']
export type SoundRole = typeof SOUND_ROLES[number]['key']
export type MediaRole = typeof MEDIA_ROLES[number]['key']
export type AnyRole = BandRole | SoundRole | MediaRole

export type RoleType = typeof BAND_ROLES[number] | typeof SOUND_ROLES[number] | typeof MEDIA_ROLES[number]

// Helper function to get roles based on schedule type
export function getRolesForScheduleType(scheduleType: string): RoleType[] {
  switch (scheduleType) {
    case 'louvor':
      return BAND_ROLES as RoleType[]
    case 'sonoplastia':
      return SOUND_ROLES as RoleType[]
    case 'midia':
      return MEDIA_ROLES as RoleType[]
    default:
      return BAND_ROLES as RoleType[]
  }
}

// Get all members with their availability for a specific date
// For louvor merged cells, also pass thursdayDate to get thursday availability
export async function getMembersWithAvailability(
  scheduleType: ScheduleType,
  date: string,
  thursdayDate?: string
): Promise<MemberAvailability[]> {
  const config = SCHEDULE_CONFIG[scheduleType]
  const { data: members, error: membersError } = await supabase
    .from(config.membersTable)
    .select('*')
    .order('name')

  if (membersError) throw new Error(membersError.message)
  if (!members || members.length === 0) return []

  // Buscar entries para a data principal (domingo)
  const { data: entries, error: entriesError } = await supabase
    .from(config.entriesTable)
    .select('*')
    .eq('schedule_date', date)

  if (entriesError) throw new Error(entriesError.message)

  // Se temos data de quinta-feira, buscar entries para ela também
  let thursdayEntries: { member_id: string; status: ScheduleStatus }[] = []
  if (thursdayDate) {
    const { data: thEntries, error: thError } = await supabase
      .from(config.entriesTable)
      .select('*')
      .eq('schedule_date', thursdayDate)
    
    if (!thError && thEntries) {
      thursdayEntries = thEntries
    }
  }

  return members.map((member) => {
    const sundayEntry = entries?.find((e: { member_id: string }) => e.member_id === member.id)
    const thursdayEntry = thursdayEntries.find((e) => e.member_id === member.id)
    
    const sundayStatus = sundayEntry?.status ?? null
    const thursdayStatus = thursdayEntry?.status ?? null
    
    // Lógica: status do domingo prevalece
    // Se disponível no domingo mas indisponível/não sei na quinta, adicionar warning
    let thursdayWarning: string | null = null
    if (sundayStatus === 'disponivel' && thursdayDate) {
      if (thursdayStatus === 'indisponivel') {
        thursdayWarning = 'indisponível quinta-feira'
      } else if (thursdayStatus === 'nao_sei') {
        thursdayWarning = 'não sabe se pode participar na quinta-feira'
      }
    }

    return {
      id: member.id,
      name: member.name,
      email: member.email,
      status: sundayStatus,
      thursdayStatus: thursdayDate ? thursdayStatus : undefined,
      thursdayWarning,
    }
  })
}

// Get built schedule entries for a date range
export async function getBuiltScheduleEntries(
  scheduleType: ScheduleType,
  startDate: string,
  endDate: string
): Promise<BuiltScheduleEntry[]> {
  const { data, error } = await supabase
    .from('built_schedules')
    .select('*')
    .eq('schedule_type', scheduleType)
    .gte('schedule_date', startDate)
    .lte('schedule_date', endDate)

  if (error) throw new Error(error.message)
  return data || []
}

// Upsert a built schedule entry (assign a member to a role on a date)
export async function upsertBuiltScheduleEntry(
  scheduleType: ScheduleType,
  scheduleDate: string,
  role: string,
  memberName: string | null,
  memberEmail: string | null
): Promise<BuiltScheduleEntry> {
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

// Remove a member from a role on a date
export async function removeBuiltScheduleEntry(
  scheduleType: ScheduleType,
  scheduleDate: string,
  role: string
): Promise<void> {
  const { error } = await supabase
    .from('built_schedules')
    .delete()
    .eq('schedule_type', scheduleType)
    .eq('schedule_date', scheduleDate)
    .eq('role', role)

  if (error) throw new Error(error.message)
}
