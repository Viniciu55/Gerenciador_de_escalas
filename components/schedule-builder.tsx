"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import Link from "next/link"
import {
  format,
  addMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  startOfWeek,
  endOfWeek,
  isSameWeek,
} from "date-fns"
import { ptBR } from "date-fns/locale"

// UI Components
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  ChevronLeft, ChevronRight, X, Check, HelpCircle,
  Minus, Download, Calendar, CalendarDays, Plus,
} from "lucide-react"

// API e Tipagens
import type { ScheduleType, ScheduleStatus } from "@/lib/types"
import { SCHEDULE_CONFIG } from "@/lib/types"
import {
  type MemberAvailability,
  type BuiltScheduleEntry,
  type RoleType,
  getRolesForScheduleType,
  MEDIA_ROLES,
} from "@/lib/schedule-builder-api"
import { GlobalHeader } from "./global-header"

// --- CONSTANTES ---

const STATUS_STYLES: Record<ScheduleStatus, { bg: string; text: string; icon: React.ReactNode; label: string }> = {
  disponivel: { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-800 dark:text-emerald-300", icon: <Check className="h-3 w-3" />, label: "Disponivel" },
  nao_sei: { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-800 dark:text-amber-300", icon: <HelpCircle className="h-3 w-3" />, label: "Nao sei" },
  indisponivel: { bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-800 dark:text-red-300", icon: <X className="h-3 w-3" />, label: "Indisponivel" },
}

// --- LOGICA DE DATAS ---

/** Dia da semana das quintas (ensaio) conforme `getDay` do date-fns. */
const THURSDAY = 4
/** Dia da semana dos domingos (culto) conforme `getDay` do date-fns. */
const SUNDAY = 0
/** Distância em dias entre a quinta do ensaio e o domingo do culto. */
const DAYS_THURSDAY_TO_SUNDAY = 3

/** Um dia é de escala se é quinta ou domingo — ou só domingo, no caso da mídia. */
function isScheduleDay(day: Date, sundaysOnly: boolean): boolean {
  const dayOfWeek = getDay(day)
  return sundaysOnly ? dayOfWeek === SUNDAY : dayOfWeek === THURSDAY || dayOfWeek === SUNDAY
}

/** Deslocamento em dias a partir de `date`, sem mutar o original. */
function shiftDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/**
 * Converte a data `yyyy-MM-dd` do banco em `Date` local.
 *
 * O horário é fixado ao meio-dia de propósito: `new Date("2025-01-05")` é
 * interpretado como UTC e, em fusos negativos como o do Brasil, voltaria para o
 * dia 4. O meio-dia deixa a data imune a esse deslocamento.
 */
function parseScheduleDate(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00`)
}

/** Formata a data no formato `yyyy-MM-dd` usado como chave no banco. */
function toDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd")
}

/**
 * Dias de escala da visão semanal. A semana começa na quinta
 * (`weekStartsOn: 4`) justamente para que o ensaio e o culto que formam um par
 * caiam na mesma semana.
 */
function getWeekScheduleDays(selectedWeekDate: Date, sundaysOnly: boolean): Date[] {
  const start = startOfWeek(selectedWeekDate, { weekStartsOn: THURSDAY })
  const end = endOfWeek(selectedWeekDate, { weekStartsOn: THURSDAY })

  return eachDayOfInterval({ start, end }).filter((day) => isScheduleDay(day, sundaysOnly))
}

/**
 * Dias de escala do mês, mantendo íntegro o par ensaio/culto.
 *
 * O ensaio de quinta e o culto do domingo seguinte formam uma unidade: a mesma
 * equipe atende os dois. Quando o mês corta esse par, o dia que ficou de fora é
 * trazido de volta para que a coluna mesclada continue fazendo sentido:
 *
 * - se o mês **começa** num domingo, puxa a quinta do mês anterior;
 * - se o mês **termina** numa quinta, puxa o domingo do mês seguinte.
 *
 * Escalas com `sundaysOnly` (mídia) não têm ensaio, então não há par a preservar.
 */
function getMonthScheduleDays(monthDate: Date, sundaysOnly: boolean): Date[] {
  const allDays = eachDayOfInterval({
    start: startOfMonth(monthDate),
    end: endOfMonth(monthDate),
  })

  const days = allDays.filter((day) => isScheduleDay(day, sundaysOnly))

  if (sundaysOnly || days.length === 0) return days

  const withLeadingThursday =
    getDay(days[0]) === SUNDAY ? [shiftDays(days[0], -DAYS_THURSDAY_TO_SUNDAY), ...days] : days

  const lastDay = withLeadingThursday[withLeadingThursday.length - 1]

  return getDay(lastDay) === THURSDAY
    ? [...withLeadingThursday, shiftDays(lastDay, DAYS_THURSDAY_TO_SUNDAY)]
    : withLeadingThursday
}

/** Dias exibidos na tabela, conforme a visão selecionada. */
function getScheduleDays(
  monthDate: Date,
  sundaysOnly: boolean,
  viewMode: "month" | "week",
  selectedWeekDate?: Date
): Date[] {
  if (viewMode === "week" && selectedWeekDate) {
    return getWeekScheduleDays(selectedWeekDate, sundaysOnly)
  }
  return getMonthScheduleDays(monthDate, sundaysOnly)
}

/**
 * Pessoa escolhida no seletor: um membro cadastrado ou um nome digitado à mão
 * (usado para convidados que não estão na base).
 */
type PickedMember = Pick<MemberAvailability, "id" | "name"> & {
  email: string | null
  isManual?: boolean
}

interface MemberPickerDialogProps {
  open: boolean
  /** Recebe `false` ao fechar, no formato do `onOpenChange` do Dialog. */
  onClose: (isOpen: boolean) => void
  members: MemberAvailability[]
  role: RoleType
  /** Datas cobertas pela célula (duas quando a coluna é mesclada). */
  dates: string[]
  onSelect: (member: PickedMember) => void
  onRemove: () => void
  /** E-mail já escalado na célula, destacado na lista. */
  currentMemberEmail?: string | null
  /** Habilita a opção de remover, só útil se a célula já está preenchida. */
  hasAssignment: boolean
}

/** Ordem de exibição: quem está disponível aparece primeiro. */
const STATUS_SORT_ORDER: Record<ScheduleStatus, number> = {
  disponivel: 0,
  nao_sei: 1,
  indisponivel: 2,
}
/** Peso de quem não respondeu, para cair depois de todos os status conhecidos. */
const NO_RESPONSE_SORT_WEIGHT = 3

function sortByAvailability(members: MemberAvailability[]): MemberAvailability[] {
  const weightOf = (member: MemberAvailability) =>
    member.status ? STATUS_SORT_ORDER[member.status] ?? NO_RESPONSE_SORT_WEIGHT : NO_RESPONSE_SORT_WEIGHT

  return [...members].sort((a, b) => weightOf(a) - weightOf(b))
}

/**
 * Seletor de quem ocupa uma função numa data. Lista os membros ordenados por
 * disponibilidade e permite digitar um nome avulso ou limpar a célula.
 */
function MemberPickerDialog({
  open,
  onClose,
  members,
  role,
  dates,
  onSelect,
  onRemove,
  currentMemberEmail,
  hasAssignment,
}: MemberPickerDialogProps) {
  const [showManualInput, setShowManualInput] = useState(false)
  const [manualName, setManualName] = useState("")

  const sorted = sortByAvailability(members)
  const dateLabel = dates.map((date) => format(parseScheduleDate(date), "dd/MM")).join(" e ")

  const handleManualSubmit = () => {
    if (!manualName.trim()) return

    onSelect({ id: `manual-${Date.now()}`, name: manualName.trim(), email: null, isManual: true })
    setManualName("")
    setShowManualInput(false)
  }

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setShowManualInput(false)
      setManualName("")
    }
    onClose(isOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm max-h-[80vh] flex flex-col p-6">
        <DialogHeader><DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground"><span className="text-xl">{role.icon}</span><span>{role.label} - {dateLabel}</span></DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-1 mt-4">
          {/* Adicionar nome manualmente */}
          {showManualInput ? (
            <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-accent/30 border border-border">
              <input
                type="text"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
                placeholder="Digite o nome..."
                autoFocus
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <button onClick={handleManualSubmit} disabled={!manualName.trim()} className="p-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => { setShowManualInput(false); setManualName("") }} className="p-1.5 rounded-md hover:bg-muted">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button onClick={() => setShowManualInput(true)} className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-accent/50 text-primary mb-2 border border-dashed border-primary/30">
              <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-primary/10"><Plus className="h-3.5 w-3.5" /></span>
              <span className="font-medium">Adicionar nome manualmente</span>
            </button>
          )}
          {hasAssignment && (
            <button onClick={onRemove} className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-destructive/10 text-destructive mb-2">
              <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-destructive/10"><Minus className="h-3.5 w-3.5" /></span><span className="font-medium">Remover membro</span>
            </button>
          )}
          {sorted.map((member) => {
            const style = member.status ? STATUS_STYLES[member.status] : null
            const isSelected = member.email === currentMemberEmail
            return (
              <button key={member.id} onClick={() => onSelect(member)} className={`flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm transition-colors ${isSelected ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-accent/50"}`}>
                <span className={`inline-flex items-center justify-center h-7 w-7 rounded-full shrink-0 ${style?.bg ?? "bg-muted"} ${style?.text ?? ""}`}>{style?.icon ?? <Minus className="h-3 w-3" />}</span>
                <div className="flex flex-col items-start text-left min-w-0">
                  <span className={`font-medium truncate w-full ${isSelected ? "text-primary" : "text-foreground"}`}>{member.name}</span>
                  <span className="text-[10px] text-muted-foreground">{style?.label ?? "Sem resposta"}</span>
                  {member.thursdayWarning && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400">({member.thursdayWarning})</span>
                  )}
                </div>
                {isSelected && <Check className="ml-auto h-4 w-4 text-primary shrink-0" />}
              </button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Uma coluna da tabela. Quando `isMerged`, a mesma equipe cobre o ensaio de
 * quinta e o culto de domingo, e a célula grava as duas datas de uma vez.
 */
interface ScheduleColumn {
  /** Identificador estável da coluna (data isolada ou início da semana). */
  colKey: string
  thursday?: Date
  sunday?: Date
  isMerged: boolean
}

/** Uma coluna por dia, sem parear ensaio e culto. */
function buildSingleDayColumns(scheduleDays: Date[]): ScheduleColumn[] {
  return scheduleDays.map((day) => ({
    colKey: toDateKey(day),
    thursday: getDay(day) === THURSDAY ? day : undefined,
    sunday: getDay(day) === SUNDAY ? day : undefined,
    isMerged: false,
  }))
}

/**
 * Agrupa os dias por semana para que o ensaio e o culto correspondentes dividam
 * uma única coluna.
 *
 * Aqui a semana começa na segunda (`weekStartsOn: 1`), que é o que mantém a
 * quinta e o domingo seguinte na mesma chave de semana.
 */
function buildMergedColumns(scheduleDays: Date[]): ScheduleColumn[] {
  const weeks: Record<string, { thursday?: Date; sunday?: Date }> = {}

  scheduleDays.forEach((day) => {
    const weekKey = toDateKey(startOfWeek(day, { weekStartsOn: 1 }))
    weeks[weekKey] ??= {}

    if (getDay(day) === THURSDAY) weeks[weekKey].thursday = day
    if (getDay(day) === SUNDAY) weeks[weekKey].sunday = day
  })

  return Object.entries(weeks)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([colKey, days]) => ({
      colKey,
      ...days,
      isMerged: Boolean(days.thursday && days.sunday),
    }))
}

/**
 * Colunas da tabela. Só a escala de louvor mescla ensaio e culto, e apenas
 * quando o modo mesclado está ativo.
 */
function buildScheduleColumns(
  scheduleDays: Date[],
  scheduleType: ScheduleType,
  showMergedCells: boolean
): ScheduleColumn[] {
  const canMerge = scheduleType === "louvor" && showMergedCells
  return canMerge ? buildMergedColumns(scheduleDays) : buildSingleDayColumns(scheduleDays)
}

/**
 * Primeiro dia de escala de cada semana do mês, usado nos botões "Sem 1", "Sem
 * 2"... da visão semanal.
 */
function getWeekAnchors(monthDate: Date, sundaysOnly: boolean): Date[] {
  const monthDays = getScheduleDays(monthDate, sundaysOnly, "month")
  const anchors: Date[] = []
  const seenWeeks = new Set<string>()

  monthDays.forEach((day) => {
    const weekKey = toDateKey(startOfWeek(day, { weekStartsOn: 0 }))
    if (seenWeeks.has(weekKey)) return

    seenWeeks.add(weekKey)
    anchors.push(day)
  })

  return anchors
}

// --- SUBCOMPONENTES DA TABELA ---

interface DateColumnHeaderProps {
  column: ScheduleColumn
  /** Resolve a data remanejada, quando o evento foi movido de dia. */
  getDisplayDate: (date: Date) => Date
  /** Abre o editor de dia. Só o ensaio pode ser remanejado. */
  onEditThursday: (thursday: Date) => void
}

/**
 * Cabeçalho de uma coluna. Numa coluna mesclada mostra ensaio e culto lado a
 * lado; numa coluna simples, apenas o evento do dia. O dia atual é destacado.
 */
function DateColumnHeader({ column, getDisplayDate, onEditThursday }: DateColumnHeaderProps) {
  const { thursday, sunday, isMerged } = column
  const dates = [thursday, sunday].filter(Boolean) as Date[]

  const todayKey = toDateKey(new Date())
  const isToday = dates.some((date) => toDateKey(date) === todayKey)

  const headerClasses = `px-2 py-2.5 text-center text-xs min-w-[120px] ${
    isToday ? "text-primary bg-primary/5" : "text-muted-foreground"
  }`
  const dateClasses = `text-base font-extrabold ${isToday ? "text-primary" : "text-foreground"}`
  const labelClasses = "text-[10px] font-black uppercase tracking-tight opacity-70 block"

  if (isMerged && thursday && sunday) {
    const displayThursday = getDisplayDate(thursday)

    return (
      <th className={headerClasses}>
        <div className="flex items-center justify-center gap-0 text-center">
          <button
            onClick={() => onEditThursday(thursday)}
            className="flex-1 hover:bg-primary/5 rounded py-1 transition-colors group text-center"
          >
            <span className={`${labelClasses} group-hover:text-primary`}>Ensaio</span>
            <span className={dateClasses}>{format(displayThursday, "dd/MM")}</span>
            <span className="text-[10px] font-medium text-muted-foreground block">
              ({format(displayThursday, "eee", { locale: ptBR })})
            </span>
          </button>

          <div className="h-8 w-px bg-muted-foreground/10 mx-1" />

          {/* O culto não é remanejável, então não é um botão. */}
          <div className="flex-1 text-center">
            <span className={labelClasses}>Culto</span>
            <span className={dateClasses}>{format(sunday, "dd/MM")}</span>
            <span className="text-[10px] font-medium text-muted-foreground block">(dom)</span>
          </div>
        </div>
      </th>
    )
  }

  const displayDate = getDisplayDate(dates[0])

  return (
    <th className={headerClasses}>
      <button
        onClick={thursday ? () => onEditThursday(thursday) : undefined}
        className={`flex flex-col gap-0.5 w-full ${
          thursday ? "hover:bg-primary/5 rounded transition-colors group" : ""
        }`}
      >
        <span className={`${labelClasses} group-hover:text-primary`}>
          {thursday ? "Ensaio" : "Culto"}
        </span>
        <span className={dateClasses}>{format(displayDate, "dd/MM")}</span>
        <span className="text-[10px] font-medium text-muted-foreground block">
          ({format(displayDate, "eeee", { locale: ptBR })})
        </span>
      </button>
    </th>
  )
}

/** Célula não escalável, como o ensaio numa função que só atua no culto. */
function EmptyCell() {
  return (
    <td className="px-2 py-2 text-center min-w-[120px]">
      <span className="text-muted-foreground/30 text-xs">--</span>
    </td>
  )
}

/**
 * Variantes visuais da célula. `midia` destaca em violeta as funções de mídia
 * exibidas dentro da escala de sonoplastia.
 */
const CELL_VARIANTS = {
  default: {
    ring: "hover:ring-primary/30",
    filled: "bg-primary/5 border-primary/20 text-foreground",
  },
  midia: {
    ring: "hover:ring-violet-400/40",
    filled:
      "bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800 text-foreground",
  },
} as const

interface AssignmentCellProps {
  role: RoleType
  /** Entrada já gravada para esta célula, ou `undefined` se estiver vazia. */
  assignment?: BuiltScheduleEntry
  variant?: keyof typeof CELL_VARIANTS
  /** Abre o seletor. Assíncrono porque pode carregar a lista de membros. */
  onOpen: () => void
}

/**
 * Célula escalável: mostra quem está escalado, ou um marcador vazio, e abre o
 * seletor de membros ao ser clicada.
 */
function AssignmentCell({ role, assignment, variant = "default", onOpen }: AssignmentCellProps) {
  const styles = CELL_VARIANTS[variant]
  const stateClasses = assignment
    ? styles.filled
    : "bg-muted/30 border-dashed border-muted-foreground/20 text-muted-foreground"

  return (
    <td className="px-2 py-2 text-center min-w-[120px]">
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onOpen}
              className={`w-full rounded-lg border px-2 py-2 text-xs flex items-center justify-center gap-1.5 min-h-[40px] transition-all hover:ring-2 active:scale-95 ${styles.ring} ${stateClasses}`}
            >
              {assignment ? (
                <>
                  <span className="text-sm">{role.icon}</span>
                  <span className="font-semibold truncate">{assignment.member_name}</span>
                </>
              ) : (
                <span className="text-muted-foreground/50">--</span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">{assignment?.member_name || `Escalar ${role.label}`}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </td>
  )
}

// --- COMPONENTE PRINCIPAL ---

interface ScheduleBuilderProps {
  scheduleType: ScheduleType
  onBack: () => void
  /**
   * Mescla o ensaio e o culto da mesma semana numa coluna só. Aplicável apenas
   * ao louvor, onde a mesma equipe atende os dois eventos.
   */
  showMergedCells?: boolean
}

/**
 * Montagem da escala: funções nas linhas, datas nas colunas. Cada célula abre um
 * seletor com os membros ordenados por disponibilidade, e o resultado pode ser
 * exportado como imagem.
 *
 * A escala de sonoplastia também exibe as funções de mídia, gravadas na escala
 * `midia`, para que ambas sejam montadas numa única tela.
 */
export function ScheduleBuilder({ scheduleType, onBack, showMergedCells = false }: ScheduleBuilderProps) {
  const [monthOffset, setMonthOffset] = useState(0)
  const [viewMode, setViewMode] = useState<"month" | "week">("month")
  const [selectedWeekDate, setSelectedWeekDate] = useState<Date>(new Date())
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [builtEntries, setBuiltEntries] = useState<BuiltScheduleEntry[]>([])
  const [membersCache, setMembersCache] = useState<Record<string, MemberAvailability[]>>({})
  const [pickerOpen, setPickerOpen] = useState<{ role: RoleType, dates: string[], cacheKey?: string, isMidia?: boolean } | null>(null)
  
  const [customDates, setCustomDates] = useState<Record<string, Date>>({})
  const [dateEditorOpen, setDateEditorOpen] = useState<{ original: Date; current: Date } | null>(null)

  const exportRef = useRef<HTMLDivElement>(null)
  const config = SCHEDULE_CONFIG[scheduleType]

  const currentMonthDate = useMemo(() => startOfMonth(addMonths(new Date(), monthOffset)), [monthOffset])
  const monthLabel = format(currentMonthDate, "MMMM yyyy", { locale: ptBR })
  
  const scheduleDays = useMemo(() => 
    getScheduleDays(currentMonthDate, config.sundaysOnly, viewMode, selectedWeekDate), 
    [currentMonthDate, config.sundaysOnly, viewMode, selectedWeekDate]
  )

  /**
   * Data efetivamente exibida. Permite que o usuário mova um evento para outro
   * dia (feriado, evento especial) sem alterar a data original, que continua
   * sendo a chave de gravação.
   */
  const getDisplayDate = (date: Date) => customDates[toDateKey(date)] ?? date

  const weeksInMonth = useMemo(
    () => getWeekAnchors(currentMonthDate, config.sundaysOnly),
    [currentMonthDate, config.sundaysOnly]
  )

  const groupedColumns = useMemo(
    () => buildScheduleColumns(scheduleDays, scheduleType, showMergedCells),
    [scheduleDays, scheduleType, showMergedCells]
  )

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const { getBuiltScheduleEntries } = await import("@/lib/schedule-builder-api")
      const startDate = format(startOfMonth(currentMonthDate), "yyyy-MM-dd")
      const endDate = format(endOfMonth(currentMonthDate), "yyyy-MM-dd")
      const entries = await getBuiltScheduleEntries(scheduleType, startDate, endDate)
      // Quando for sonoplastia, também carrega as entradas de mídia para exibir na tabela
      if (scheduleType === "sonoplastia") {
        const midiaEntries = await getBuiltScheduleEntries("midia", startDate, endDate)
        setBuiltEntries([...entries, ...midiaEntries])
      } else {
        setBuiltEntries(entries)
      }
    } finally { setIsLoading(false) }
  }, [scheduleType, currentMonthDate])

  useEffect(() => { loadData() }, [loadData])

  /**
   * Abre o seletor de membros para uma célula, buscando a disponibilidade apenas
   * na primeira vez que aquela coluna é aberta (o resultado fica em
   * `membersCache`, cuja chave distingue colunas mescladas das simples).
   */
  const openPicker = async ({
    role,
    dates,
    cacheKey,
    availabilityType,
    availabilityDate,
    pairedThursday,
    isMidia,
  }: {
    role: RoleType
    /** Datas que a escalação vai gravar. */
    dates: string[]
    cacheKey: string
    /** Escala de onde vem a lista de membros. */
    availabilityType: ScheduleType
    /** Data usada para calcular a disponibilidade exibida na lista. */
    availabilityDate: string
    /** Quinta pareada, quando existe, para o alerta de indisponibilidade. */
    pairedThursday?: string
    isMidia?: boolean
  }) => {
    if (!membersCache[cacheKey]) {
      const { getMembersWithAvailability } = await import("@/lib/schedule-builder-api")
      const list = await getMembersWithAvailability(availabilityType, availabilityDate, pairedThursday)
      setMembersCache((prev) => ({ ...prev, [cacheKey]: list }))
    }

    setPickerOpen({ role, dates, cacheKey, isMidia })
  }

  /**
   * Escala a pessoa na função, aplicando a mudança na tela antes de gravar. Se a
   * gravação falhar, recarrega para descartar o estado otimista.
   *
   * Uma coluna mesclada tem duas datas, então a função é gravada nas duas.
   */
  const handleAssign = async (member: PickedMember) => {
    if (!pickerOpen) return

    const { role, dates, isMidia } = pickerOpen
    // As linhas de mídia dentro da sonoplastia gravam na escala de mídia.
    const targetType: ScheduleType = isMidia ? "midia" : scheduleType

    const isReplacedCell = (entry: BuiltScheduleEntry) =>
      dates.includes(entry.schedule_date) && entry.role === role.key

    setBuiltEntries((prev) => [
      ...prev.filter((entry) => !isReplacedCell(entry)),
      ...dates.map((date) => ({
        id: crypto.randomUUID(),
        schedule_type: targetType,
        schedule_date: date,
        role: role.key,
        member_name: member.name,
        member_email: member.email,
      })),
    ])
    setPickerOpen(null)

    try {
      const { upsertBuiltScheduleEntry } = await import("@/lib/schedule-builder-api")
      await Promise.all(
        dates.map((date) =>
          upsertBuiltScheduleEntry(targetType, date, role.key, member.name, member.email)
        )
      )
    } catch {
      loadData()
    }
  }

  /** Entra na visão semanal já posicionada na primeira semana do mês. */
  const showWeekView = () => {
    setViewMode("week")
    if (weeksInMonth.length > 0) setSelectedWeekDate(weeksInMonth[0])
  }

  /**
   * Dias oferecidos no editor de data: a semana inteira do evento, de segunda a
   * domingo (`weekStartsOn: 1`), para que o domingo do culto também seja opção.
   */
  const dateEditorOptions = useMemo(() => {
    const baseDate = startOfWeek(dateEditorOpen?.original ?? new Date(), { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, dayIndex) => shiftDays(baseDate, dayIndex))
  }, [dateEditorOpen])

  /** Compara por dia/mês para ignorar diferenças de horário. */
  const isDateEditorSelection = (option: Date) =>
    format(option, "dd/MM") === format(getDisplayDate(dateEditorOpen?.original ?? new Date()), "dd/MM")

  /** Passa a exibir o evento em outro dia, sem alterar a data de gravação. */
  const moveEventTo = (option: Date) => {
    if (!dateEditorOpen) return

    setCustomDates((prev) => ({ ...prev, [toDateKey(dateEditorOpen.original)]: option }))
    setDateEditorOpen(null)
  }

  /** Volta a exibir o evento na data original do calendário. */
  const resetEventDate = () => {
    if (!dateEditorOpen) return

    setCustomDates((prev) => {
      const next = { ...prev }
      delete next[toDateKey(dateEditorOpen.original)]
      return next
    })
    setDateEditorOpen(null)
  }

  /** Escalação atual da célula aberta no seletor, se houver. */
  const pickerAssignment = pickerOpen
    ? builtEntries.find(
        (entry) =>
          entry.schedule_date === pickerOpen.dates[0] && entry.role === pickerOpen.role.key
      )
    : undefined

  /** Limpa a célula aberta no seletor, em todas as datas que ela cobre. */
  const handleRemove = async () => {
    if (!pickerOpen) return

    const { role, dates, isMidia } = pickerOpen
    const targetType: ScheduleType = isMidia ? "midia" : scheduleType

    setBuiltEntries((prev) =>
      prev.filter((entry) => !(dates.includes(entry.schedule_date) && entry.role === role.key))
    )
    setPickerOpen(null)

    try {
      const { removeBuiltScheduleEntry } = await import("@/lib/schedule-builder-api")
      await Promise.all(dates.map((date) => removeBuiltScheduleEntry(targetType, date, role.key)))
    } catch {
      loadData()
    }
  }

  /**
   * Exporta a tabela como PNG.
   *
   * A tabela é clonada para fora da tela porque o original tem rolagem
   * horizontal e o `html-to-image` capturaria apenas a parte visível. O clone usa
   * `width: max-content` para que a imagem tenha a largura do conteúdo, e não a
   * do monitor.
   */
  const handleExport = async () => {
    if (!exportRef.current) return

    setIsExporting(true)
    try {
      const { toPng } = await import("html-to-image")
      const isDarkMode = document.documentElement.classList.contains("dark")

      const wrapper = document.createElement("div")
      wrapper.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: max-content;
        background: ${isDarkMode ? "#1a1a2e" : "#fff"};
        z-index: -1;
      `

      const clone = exportRef.current.cloneNode(true) as HTMLElement
      // Remove as restrições que esticariam a tabela até a largura da tela.
      clone.style.width = "auto"
      clone.style.minWidth = "auto"
      clone.style.maxWidth = "none"

      wrapper.appendChild(clone)
      document.body.appendChild(wrapper)

      try {
        const dataUrl = await toPng(wrapper, { pixelRatio: 2 })
        const link = document.createElement("a")
        link.download = `escala-${config.label.toLowerCase()}.png`
        link.href = dataUrl
        link.click()
      } finally {
        // Em `finally` para que o clone não fique preso no DOM se a captura falhar.
        document.body.removeChild(wrapper)
      }
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <GlobalHeader />
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center justify-between px-4 py-3">
          <div><h1 className="text-lg font-bold tracking-tight text-foreground">Montar Escala - {config.label}</h1><p className="text-xs text-muted-foreground">Selecione os membros para cada funcao</p></div>
          <div className="flex items-center gap-1"><Button variant="ghost" size="icon" onClick={onBack}><ChevronLeft className="h-4 w-4" /></Button></div>
        </div>
        <div className="flex items-center justify-center gap-4 px-4 pb-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonthOffset(m => m - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm font-semibold capitalize text-foreground">{monthLabel}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonthOffset(m => m + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
          <div className="flex items-center gap-1 rounded-lg border p-0.5 bg-muted/30">
            <button
              onClick={() => setViewMode("month")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${viewMode === "month" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Mensal
            </button>
            <button
              onClick={showWeekView}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${viewMode === "week" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}
            >
              <Calendar className="h-3.5 w-3.5" />
              Semanal
            </button>
          </div>

          {viewMode === "week" && (
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full">
              {weeksInMonth.map((weekDate, index) => {
                const isSelected = isSameWeek(weekDate, selectedWeekDate, { weekStartsOn: 1 })

                return (
                  <button
                    key={toDateKey(weekDate)}
                    onClick={() => setSelectedWeekDate(weekDate)}
                    className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-bold transition-all ${isSelected ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                  >
                    Sem {index + 1}
                  </button>
                )
              })}
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            className="ml-auto gap-1.5"
            onClick={handleExport}
            disabled={isExporting}
          >
            <Download className="h-3.5 w-3.5" />
            {isExporting ? "Exportando..." : "Exportar"}
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-x-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
        ) : (
          <div ref={exportRef} className="bg-background p-1">
            <div className="px-4 py-3 border-b flex items-center gap-3"><img src="/logo.jpg" alt="Logo" className="h-10 w-10 rounded-full object-cover" /><h2 className="text-sm font-bold text-foreground">Escala - {config.label} ({monthLabel})</h2></div>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="sticky left-0 z-[5] bg-background px-3 py-2.5 text-left text-xs font-bold w-[130px] border-r uppercase tracking-wider text-muted-foreground">Funcao</th>
                  {groupedColumns.map(col => (
                    <DateColumnHeader
                      key={col.colKey}
                      column={col}
                      getDisplayDate={getDisplayDate}
                      onEditThursday={(thursday) =>
                        setDateEditorOpen({ original: thursday, current: getDisplayDate(thursday) })
                      }
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {getRolesForScheduleType(scheduleType).map(role => {
                  // Na sonoplastia o "apoio" atua apenas no culto: o ensaio fica vazio.
                  const isSoundApoio = scheduleType === "sonoplastia" && role.key === "apoio"

                  return (
                    <tr key={role.key} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="sticky left-0 z-[5] bg-background px-3 py-2.5 border-r w-[130px]"><div className="flex items-center gap-2"><span className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-primary/10 text-primary shrink-0 text-lg">{role.icon}</span><span className="font-medium text-xs truncate text-foreground">{role.label}</span></div></td>
                      {groupedColumns.map(col => {
                        const columnDates = [col.thursday, col.sunday].filter(Boolean).map(d => toDateKey(d!))
                        const isThursdayOnly = Boolean(col.thursday && !col.sunday)

                        if (isSoundApoio && isThursdayOnly) return <EmptyCell key={col.colKey} />

                        // O apoio é gravado só no domingo, mesmo em coluna mesclada.
                        const effectiveDates =
                          isSoundApoio && col.sunday ? [toDateKey(col.sunday)] : columnDates

                        // No louvor mesclado o domingo é a data de referência, e a
                        // quinta serve para calcular o alerta de indisponibilidade.
                        const isMergedLouvor = Boolean(
                          scheduleType === "louvor" && col.isMerged && col.sunday && col.thursday
                        )
                        const sundayDateStr = col.sunday ? toDateKey(col.sunday) : effectiveDates[0]
                        const thursdayDateStr = col.thursday ? toDateKey(col.thursday) : undefined

                        const referenceDate = isMergedLouvor ? sundayDateStr : effectiveDates[0]
                        const cacheKey = isMergedLouvor ? `merged-${sundayDateStr}` : effectiveDates[0]
                        const assignment = builtEntries.find(
                          e => e.schedule_date === referenceDate && e.role === role.key
                        )

                        return (
                          <AssignmentCell
                            key={col.colKey}
                            role={role}
                            assignment={assignment}
                            onOpen={() =>
                              openPicker({
                                role,
                                cacheKey,
                                dates: isMergedLouvor ? [sundayDateStr] : effectiveDates,
                                availabilityType: scheduleType,
                                availabilityDate: sundayDateStr,
                                pairedThursday: isMergedLouvor ? thursdayDateStr : undefined,
                              })
                            }
                          />
                        )
                      })}
                    </tr>
                  )
                })}
                {/* Linhas de Mídia dentro da Sonoplastia — apenas domingos (culto) */}
                {scheduleType === "sonoplastia" && (MEDIA_ROLES as readonly RoleType[]).map(role => (
                  <tr key={`midia-${role.key}`} className="border-b hover:bg-muted/30 transition-colors bg-violet-50/30 dark:bg-violet-900/5">
                    <td className="sticky left-0 z-[5] bg-violet-50/30 dark:bg-violet-900/10 px-3 py-2.5 border-r w-[130px]">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 shrink-0 text-lg">{role.icon}</span>
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium text-xs truncate text-foreground">{role.label}</span>
                          <span className="text-[10px] text-violet-500 dark:text-violet-400">Mídia</span>
                        </div>
                      </div>
                    </td>
                    {groupedColumns.map(col => {
                      // A mídia atua somente no culto, então colunas sem domingo
                      // (ensaio isolado) não são escaláveis.
                      const sundayDate = col.sunday ? toDateKey(col.sunday) : null
                      if (!sundayDate) return <EmptyCell key={col.colKey} />

                      const assignment = builtEntries.find(
                        e => e.schedule_date === sundayDate && e.role === role.key
                      )

                      return (
                        <AssignmentCell
                          key={col.colKey}
                          role={role}
                          assignment={assignment}
                          variant="midia"
                          onOpen={() =>
                            openPicker({
                              role,
                              dates: [sundayDate],
                              cacheKey: `midia-${sundayDate}`,
                              availabilityType: "midia",
                              availabilityDate: sundayDate,
                              isMidia: true,
                            })
                          }
                        />
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <Dialog open={!!dateEditorOpen} onOpenChange={() => setDateEditorOpen(null)}>
        <DialogContent className="max-w-[300px] p-4">
          <DialogHeader><DialogTitle className="text-sm font-bold">Alterar dia do Ensaio</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-1.5 mt-2">
            {dateEditorOptions.map((option) => (
              <Button
                key={option.getTime()}
                variant={isDateEditorSelection(option) ? "default" : "outline"}
                size="sm"
                className="justify-start gap-2"
                onClick={() => moveEventTo(option)}
              >
                <span className="capitalize">{format(option, "EEEE", { locale: ptBR })}</span>
                <span className="text-[10px] opacity-60 ml-auto">{format(option, "dd/MM")}</span>
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 text-[10px] text-muted-foreground"
              onClick={resetEventDate}
            >
              Resetar para o padrão
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {pickerOpen && (
        <MemberPickerDialog
          open
          onClose={() => setPickerOpen(null)}
          members={membersCache[pickerOpen.cacheKey ?? pickerOpen.dates[0]] ?? []}
          role={pickerOpen.role}
          dates={pickerOpen.dates}
          onSelect={handleAssign}
          onRemove={handleRemove}
          currentMemberEmail={pickerAssignment?.member_email}
          hasAssignment={Boolean(pickerAssignment)}
        />
      )}
    </div>
  )
}
