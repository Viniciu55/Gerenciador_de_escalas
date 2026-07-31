"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, LogOut, Check, X, HelpCircle, AlertTriangle} from "lucide-react"
import { format, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from "date-fns"
import { ptBR } from "date-fns/locale"
import type { Member, ScheduleEntry, ScheduleStatus, ScheduleType, ConflictInfo } from "@/lib/types"
import { SCHEDULE_CONFIG } from "@/lib/types"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface ScheduleTableProps {
  /** Membro autenticado. Só as células dele são editáveis. */
  currentMemberId: string
  /** E-mail do membro, usado para detectar conflitos entre escalas. */
  currentEmail: string
  onLogout: () => void
  scheduleType: ScheduleType
}

const STATUS_CONFIG: Record<ScheduleStatus, { label: string; className: string; icon: React.ReactNode }> = {
  disponivel: {
    label: "Disponivel",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    icon: <Check className="h-3.5 w-3.5" />,
  },
  indisponivel: {
    label: "Indisponivel",
    className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    icon: <X className="h-3.5 w-3.5" />,
  },
  nao_sei: {
    label: "Nao sei",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    icon: <HelpCircle className="h-3.5 w-3.5" />,
  },
}

const STATUS_OPTIONS: ScheduleStatus[] = ["disponivel", "indisponivel", "nao_sei"]

/** Dia da semana das quintas (ensaio) conforme `getDay` do date-fns. */
const THURSDAY = 4
/** Dia da semana dos domingos (culto) conforme `getDay` do date-fns. */
const SUNDAY = 0

/** Evento realizado em cada dia de escala. */
const EVENT_LABELS: Record<number, string> = {
  [THURSDAY]: "Ensaio",
  [SUNDAY]: "Culto",
}

const WEEKDAY_LABELS: Record<number, string> = {
  [THURSDAY]: "quinta",
  [SUNDAY]: "domingo",
}

// --- LÓGICA DE DATAS ---

/**
 * Dias de escala dentro do mês: quintas (ensaio) e domingos (culto), ou apenas
 * domingos quando `sundaysOnly` está ligado (caso da mídia).
 *
 * Diferente do builder, esta tabela **não** pareia meses: ela mostra apenas os
 * dias que caem dentro do mês exibido, sem puxar a quinta do mês anterior nem o
 * domingo do mês seguinte. Isso é intencional — aqui cada dia é respondido de
 * forma independente, então não existe o par ensaio/culto a preservar.
 */
function getMonthScheduleDays(monthDate: Date, sundaysOnly: boolean): Date[] {
  const allDays = eachDayOfInterval({
    start: startOfMonth(monthDate),
    end: endOfMonth(monthDate),
  })

  return allDays.filter((day) => {
    const dayOfWeek = getDay(day)
    return sundaysOnly ? dayOfWeek === SUNDAY : dayOfWeek === THURSDAY || dayOfWeek === SUNDAY
  })
}

function StatusBadge({ status }: { status: ScheduleStatus | null }) {
  if (!status) {
    return (
      <span className="inline-flex items-center justify-center w-full rounded-md py-1.5 px-1 text-xs text-muted-foreground bg-muted/50">
        --
      </span>
    )
  }
  const config = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center justify-center gap-1 w-full rounded-md py-1.5 px-1 text-xs font-medium ${config.className}`}>
      {config.icon}
      <span className="hidden sm:inline">{config.label}</span>
    </span>
  )
}

function StatusPicker({
  currentStatus,
  onSelect,
  onClose,
}: {
  currentStatus: ScheduleStatus | null
  onSelect: (status: ScheduleStatus) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1 w-40 rounded-lg border bg-popover shadow-lg p-1 animate-in fade-in-0 zoom-in-95"
    >
      {STATUS_OPTIONS.map((status) => {
        const config = STATUS_CONFIG[status]
        const isActive = currentStatus === status
        return (
          <button
            key={status}
            onClick={() => onSelect(status)}
            className={`flex items-center gap-2 w-full rounded-md px-2.5 py-2 text-sm transition-colors ${
              isActive ? "bg-accent font-medium" : "hover:bg-accent/50"
            }`}
          >
            <span className={`inline-flex items-center justify-center h-5 w-5 rounded ${config.className}`}>
              {config.icon}
            </span>
            <span className="text-popover-foreground">{config.label}</span>
            {isActive && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
          </button>
        )
      })}
    </div>
  )
}

function ConflictWarning({ conflicts, date }: { conflicts: ConflictInfo[]; date: string }) {
  const conflict = conflicts.find((c) => c.date === date)
  if (!conflict) return null

  const scheduleLabels = conflict.schedules.map((s) => SCHEDULE_CONFIG[s].label).join(", ")

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-amber-500 text-amber-50 dark:bg-amber-600 dark:text-amber-50 cursor-help ml-0.5 shrink-0">
            <AlertTriangle className="h-3 w-3" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px]">
          <p className="text-xs">
            Voce esta disponivel neste dia em: <strong>{scheduleLabels}</strong>
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * Grade de disponibilidade do mês: membros nas linhas, dias de escala nas
 * colunas. Todos veem a grade inteira, mas cada pessoa edita apenas a própria
 * linha. As alterações são aplicadas otimisticamente e revertidas via recarga
 * se a gravação falhar.
 */
export function ScheduleTable({ currentMemberId, currentEmail, onLogout, scheduleType }: ScheduleTableProps) {
  const [monthOffset, setMonthOffset] = useState(0)
  const [members, setMembers] = useState<Member[]>([])
  const [entries, setEntries] = useState<ScheduleEntry[]>([])
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState<string | null>(null)
  const [openPicker, setOpenPicker] = useState<string | null>(null)

  const config = SCHEDULE_CONFIG[scheduleType]

  // Memoizado porque `monthStart`/`monthEnd` são dependências de `loadData`:
  // recalculá-los a cada render recriaria o callback e disparia recargas.
  const currentMonthDate = useMemo(() => addMonths(new Date(), monthOffset), [monthOffset])
  const scheduleDays = useMemo(
    () => getMonthScheduleDays(currentMonthDate, config.sundaysOnly),
    [currentMonthDate, config.sundaysOnly]
  )
  const monthStart = useMemo(
    () => format(startOfMonth(currentMonthDate), "yyyy-MM-dd"),
    [currentMonthDate]
  )
  const monthEnd = useMemo(
    () => format(endOfMonth(currentMonthDate), "yyyy-MM-dd"),
    [currentMonthDate]
  )

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const { getAllMembers, getScheduleEntries, getConflicts } = await import("@/lib/schedule-api")
      const [membersData, entriesData, conflictsData] = await Promise.all([
        getAllMembers(scheduleType),
        getScheduleEntries(monthStart, monthEnd, scheduleType),
        getConflicts(currentEmail, scheduleType, monthStart, monthEnd),
      ])
      setMembers(membersData)
      setEntries(entriesData)
      setConflicts(conflictsData)
    } catch (err) {
      console.error("Erro ao carregar dados:", err)
    } finally {
      setIsLoading(false)
    }
  }, [monthStart, monthEnd, scheduleType, currentEmail])

  useEffect(() => {
    loadData()
  }, [loadData])

  /**
   * Status do membro na data. A ausência de registro significa `"disponivel"`,
   * e não um estado indefinido — só é gravada linha para quem respondeu algo
   * diferente do padrão (ver {@link ScheduleStatus}).
   */
  function getEntryStatus(memberId: string, date: string): ScheduleStatus {
    const entry = entries.find(
      (e) => e.member_id === memberId && e.schedule_date === date
    )
    return entry?.status ?? "disponivel"
  }

  async function handleStatusSelect(memberId: string, date: string, newStatus: ScheduleStatus) {
    const cellKey = `${memberId}-${date}`
    setOpenPicker(null)
    setIsSaving(cellKey)

    setEntries((prev) => {
      const existing = prev.find(
        (e) => e.member_id === memberId && e.schedule_date === date
      )
      if (existing) {
        return prev.map((e) =>
          e.member_id === memberId && e.schedule_date === date
            ? { ...e, status: newStatus }
            : e
        )
      }
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          member_id: memberId,
          schedule_date: date,
          status: newStatus,
          created_at: new Date().toISOString(),
        },
      ]
    })

    try {
      const { upsertScheduleEntry, getConflicts } = await import("@/lib/schedule-api")
      await upsertScheduleEntry(memberId, date, newStatus, scheduleType)
      const conflictsData = await getConflicts(currentEmail, scheduleType, monthStart, monthEnd)
      setConflicts(conflictsData)
    } catch (err) {
      console.error("Erro ao salvar:", err)
      loadData()
    } finally {
      setIsSaving(null)
    }
  }

  function handleCellClick(memberId: string, date: string) {
    if (memberId !== currentMemberId) return
    const cellKey = `${memberId}-${date}`
    setOpenPicker((prev) => (prev === cellKey ? null : cellKey))
  }

  const currentMember = members.find((m) => m.id === currentMemberId)
  const monthLabel = format(currentMonthDate, "MMMM yyyy", { locale: ptBR })

  /** Usuário atual primeiro, restante em ordem alfabética. */
  const sortedMembers = useMemo(
    () =>
      [...members].sort((a, b) => {
        if (a.id === currentMemberId) return -1
        if (b.id === currentMemberId) return 1
        return a.name.localeCompare(b.name, "pt-BR")
      }),
    [members, currentMemberId]
  )

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex flex-col">
            <h1 className="text-lg font-bold tracking-tight text-foreground">
              {config.description}
            </h1>
            {currentMember && (
              <p className="text-xs text-muted-foreground">
                {currentMember.name} ({currentEmail})
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 px-4 pb-3">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setMonthOffset((m) => m - 1)}
            aria-label="Mes anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold text-foreground capitalize">
            {monthLabel}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setMonthOffset((m) => m + 1)}
            aria-label="Proximo mes"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b bg-muted/30">
        {STATUS_OPTIONS.map((status) => {
          const statusConfig = STATUS_CONFIG[status]
          return (
            <div key={status} className="flex items-center gap-1.5">
              <span className={`inline-flex items-center justify-center h-5 w-5 rounded ${statusConfig.className}`}>
                {statusConfig.icon}
              </span>
              <span className="text-xs text-muted-foreground">{statusConfig.label}</span>
            </div>
          )
        })}
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-amber-500 text-amber-50 dark:bg-amber-600 dark:text-amber-50">
            <AlertTriangle className="h-3 w-3" />
          </span>
          <span className="text-xs text-muted-foreground">Conflito com outra escala</span>
        </div>
      </div>

      <main className="flex-1 overflow-x-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">Carregando escala...</p>
            </div>
          </div>
        ) : members.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm text-muted-foreground">Nenhum membro na equipe ainda.</p>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="sticky left-0 z-[5] bg-muted/60 backdrop-blur px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[110px] min-w-[110px] max-w-[110px] border-r">
                  Membro
                </th>
                {scheduleDays.map((day) => {
                  const isToday =
                    format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd")
                  const eventLabel = EVENT_LABELS[getDay(day)] ?? ""
                  const weekdayLabel = WEEKDAY_LABELS[getDay(day)] ?? ""
                  return (
                    <th
                      key={day.toISOString()}
                      className={`px-2 py-2.5 text-center text-xs font-semibold min-w-[80px] ${
                        isToday
                          ? "text-primary bg-primary/5"
                          : "text-muted-foreground"
                      }`}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[10px] font-bold tracking-wide opacity-70">
                          {eventLabel}
                        </span>
                        <span className={`text-sm font-bold ${isToday ? "text-primary" : "text-foreground"}`}>
                          {format(day, "dd/MM")}
                        </span>
                        <span className="text-[10px] font-normal normal-case tracking-normal opacity-50">
                          ({weekdayLabel})
                        </span>
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {sortedMembers.map((member) => {
                const isCurrentUser = member.id === currentMemberId
                return (
                  <tr
                    key={member.id}
                    className={`border-b transition-colors ${
                      isCurrentUser
                        ? "bg-primary/5 hover:bg-primary/10"
                        : "hover:bg-muted/30"
                    }`}
                  >
                    <td
                      className={`sticky left-0 z-[5] px-3 py-2.5 w-[110px] min-w-[110px] max-w-[110px] border-r ${
                        isCurrentUser ? "bg-primary/5" : "bg-background"
                      }`}
                    >
                      <div className="flex flex-col overflow-hidden">
                        <span
                          className={`font-medium text-sm truncate ${
                            isCurrentUser ? "text-primary" : "text-foreground"
                          }`}
                        >
                          {member.name}
                        </span>
                        {isCurrentUser && (
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/70">
                            Voce
                          </span>
                        )}
                      </div>
                    </td>
                    {scheduleDays.map((day) => {
                      const dateStr = format(day, "yyyy-MM-dd")
                      const status = getEntryStatus(member.id, dateStr)
                      const cellKey = `${member.id}-${dateStr}`
                      const saving = isSaving === cellKey
                      const hasConflict = isCurrentUser && status === "disponivel" && conflicts.some((c) => c.date === dateStr)

                      return (
                        <td key={dateStr} className="px-2 py-2 text-center min-w-[80px]">
                          {isCurrentUser ? (
                            <div className="relative">
                              <div className="flex items-center gap-0.5">
                                <button
                                  onClick={() => handleCellClick(member.id, dateStr)}
                                  disabled={saving}
                                  className={`flex-1 rounded-md transition-all active:scale-95 ${
                                    saving ? "opacity-60" : "hover:ring-2 hover:ring-primary/30"
                                  }`}
                                  aria-label={`Alterar status para ${format(day, "dd/MM", { locale: ptBR })}`}
                                >
                                  <StatusBadge status={status} />
                                </button>
                                {hasConflict && (
                                  <ConflictWarning conflicts={conflicts} date={dateStr} />
                                )}
                              </div>
                              {openPicker === cellKey && (
                                <StatusPicker
                                  currentStatus={status}
                                  onSelect={(s) =>
                                    handleStatusSelect(member.id, dateStr, s)
                                  }
                                  onClose={() => setOpenPicker(null)}
                                />
                              )}
                            </div>
                          ) : (
                            <StatusBadge status={status} />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </main>

      <footer className="border-t px-4 py-3 bg-muted/20">
        <p className="text-xs text-center text-muted-foreground">
          Toque nas suas celulas para escolher o status
        </p>
      </footer>
    </div>
  )
}
