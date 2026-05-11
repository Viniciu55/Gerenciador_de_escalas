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
  Minus, Download, Calendar, CalendarDays,
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

function getScheduleDays(monthDate: Date, sundaysOnly: boolean, viewMode: "month" | "week", selectedWeekDate?: Date): Date[] {
  if (viewMode === "week" && selectedWeekDate) {
    const start = startOfWeek(selectedWeekDate, { weekStartsOn: 4 })
    const end = endOfWeek(selectedWeekDate, { weekStartsOn: 4 })
    return eachDayOfInterval({ start, end }).filter(d => sundaysOnly ? getDay(d) === 0 : (getDay(d) === 4 || getDay(d) === 0))
  }

  const start = startOfMonth(monthDate)
  const end = endOfMonth(monthDate)
  let allDays = eachDayOfInterval({ start, end })

  // Filtrar apenas os dias de interesse primeiro (Quintas e Domingos)
  let filteredDays = allDays.filter(d => sundaysOnly ? getDay(d) === 0 : (getDay(d) === 4 || getDay(d) === 0))

  if (!sundaysOnly && filteredDays.length > 0) {
    // CORREÇÃO INÍCIO: Se o primeiro dia encontrado for Domingo (0), 
    // precisamos buscar a Quinta (4) imediatamente anterior para o par Ensaio/Culto.
    if (getDay(filteredDays[0]) === 0) {
      const prevThursday = new Date(filteredDays[0])
      prevThursday.setDate(prevThursday.getDate() - 3)
      filteredDays = [prevThursday, ...filteredDays]
    }

    // CORREÇÃO FIM: Se o último dia encontrado for Quinta (4),
    // precisamos buscar o Domingo (0) imediatamente posterior para fechar o par.
    const lastDay = filteredDays[filteredDays.length - 1]
    if (getDay(lastDay) === 4) {
      const nextSunday = new Date(lastDay)
      nextSunday.setDate(nextSunday.getDate() + 3)
      filteredDays = [...filteredDays, nextSunday]
    }
  }

  return filteredDays
}

function MemberPickerDialog({ open, onClose, members, role, dates, onSelect, onRemove, currentMemberEmail }: any) {
  const sorted = [...members].sort((a, b) => {
    const order: any = { disponivel: 0, nao_sei: 1, indisponivel: 2 }
    return (order[a.status] ?? 3) - (order[b.status] ?? 3)
  })
  const dateLabel = dates.map((d: string) => format(new Date(d + "T12:00:00"), "dd/MM")).join(" e ")
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm max-h-[80vh] flex flex-col p-6">
        <DialogHeader><DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground"><span className="text-xl">{role.icon}</span><span>{role.label} - {dateLabel}</span></DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-1 mt-4">
          {currentMemberEmail && (
            <button onClick={onRemove} className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-destructive/10 text-destructive mb-2">
              <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-destructive/10"><Minus className="h-3.5 w-3.5" /></span><span className="font-medium">Remover membro</span>
            </button>
          )}
          {sorted.map((member) => {
            const style = member.status ? STATUS_STYLES[member.status as ScheduleStatus] : null
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

// --- COMPONENTE PRINCIPAL ---

export function ScheduleBuilder({ scheduleType, onBack, showMergedCells = false }: { scheduleType: ScheduleType, onBack: () => void, showMergedCells?: boolean }) {
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

  const getDisplayDate = (date: Date) => {
    const key = format(date, "yyyy-MM-dd")
    return customDates[key] || date
  }

  const weeksInMonth = useMemo(() => {
    const allDaysOfMonth = getScheduleDays(currentMonthDate, config.sundaysOnly, "month")
    const weeks: Date[] = []
    const seenWeeks = new Set()

    allDaysOfMonth.forEach(day => {
      const weekKey = format(startOfWeek(day, { weekStartsOn: 0 }), "yyyy-MM-dd")
      if (!seenWeeks.has(weekKey)) {
        seenWeeks.add(weekKey)
        weeks.push(day)
      }
    })
    return weeks
  }, [currentMonthDate, config.sundaysOnly])

  const groupedColumns = useMemo(() => {
    const canMerge = scheduleType === "louvor" && showMergedCells;
    if (!canMerge) {
      return scheduleDays.map(day => ({ colKey: format(day, "yyyy-MM-dd"), thursday: getDay(day) === 4 ? day : undefined, sunday: getDay(day) === 0 ? day : undefined, isMerged: false }))
    }
    const weeks: Record<string, { thursday?: Date, sunday?: Date }> = {}
    scheduleDays.forEach(day => {
      const weekKey = format(startOfWeek(day, { weekStartsOn: 1 }), "yyyy-MM-dd")
      if (!weeks[weekKey]) weeks[weekKey] = {}
      if (getDay(day) === 4) weeks[weekKey].thursday = day
      if (getDay(day) === 0) weeks[weekKey].sunday = day
    })
    return Object.entries(weeks).sort().map(([key, val]) => ({ colKey: key, ...val, isMerged: !!(val.thursday && val.sunday) }))
  }, [scheduleDays, showMergedCells, scheduleType])

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

  const handleAssign = async (member: MemberAvailability) => {
    if (!pickerOpen) return
    const { role, dates, isMidia } = pickerOpen
    const targetType = isMidia ? "midia" : scheduleType
    setBuiltEntries(prev => [...prev.filter(e => !(dates.includes(e.schedule_date) && e.role === role.key)), ...dates.map(date => ({ id: crypto.randomUUID(), schedule_type: targetType as ScheduleType, schedule_date: date, role: role.key, member_name: member.name, member_email: member.email }))])
    setPickerOpen(null)
    try {
      const { upsertBuiltScheduleEntry } = await import("@/lib/schedule-builder-api")
      await Promise.all(dates.map(d => upsertBuiltScheduleEntry(targetType as ScheduleType, d, role.key, member.name, member.email)))
    } catch { loadData() }
  }

  /*
  const handleExport = async () => {
    if (!exportRef.current) return
    setIsExporting(true)
    try {
      const { toPng } = await import("html-to-image")
      const wrapper = document.createElement("div")
      wrapper.style.cssText = `position:fixed;top:0;left:0;width:${exportRef.current.scrollWidth}px;background:${document.documentElement.classList.contains("dark") ? "#1a1a2e" : "#fff"};z-index:-1`
      const clone = exportRef.current.cloneNode(true) as HTMLElement
      wrapper.appendChild(clone); document.body.appendChild(wrapper)
      const dataUrl = await toPng(wrapper, { pixelRatio: 2 })
      document.body.removeChild(wrapper)
      const link = document.createElement("a"); link.download = `escala-${config.label.toLowerCase()}.png`; link.href = dataUrl; link.click()
    } finally { setIsExporting(false) }
  }*/
  const handleExport = async () => {
    if (!exportRef.current) return
    setIsExporting(true)
    try {
      const { toPng } = await import("html-to-image")
      const wrapper = document.createElement("div")
      
      // 'max-content' garante que a largura seja ditada pelo conteúdo da tabela,
      // sem ser fixa e sem se esticar para ocupar a largura da tela do PC.
      wrapper.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: max-content; 
        background: ${document.documentElement.classList.contains("dark") ? "#1a1a2e" : "#fff"};
        z-index: -1;
      `
      
      const clone = exportRef.current.cloneNode(true) as HTMLElement
      
      // Removemos qualquer restrição que force a tabela a ocupar a largura total do monitor
      clone.style.width = "auto"
      clone.style.minWidth = "auto"
      clone.style.maxWidth = "none"

      wrapper.appendChild(clone)
      document.body.appendChild(wrapper)
      
      const dataUrl = await toPng(wrapper, { pixelRatio: 2 })
      document.body.removeChild(wrapper)
      
      const link = document.createElement("a")
      link.download = `escala-${config.label.toLowerCase()}.png`
      link.href = dataUrl
      link.click()
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
            <button onClick={() => setViewMode("month")} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${viewMode === "month" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}><CalendarDays className="h-3.5 w-3.5" />Mensal</button>
            <button onClick={() => { setViewMode("week"); if (weeksInMonth.length > 0) setSelectedWeekDate(weeksInMonth[0]) }} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${viewMode === "week" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}><Calendar className="h-3.5 w-3.5" />Semanal</button>
          </div>

          {viewMode === "week" && (
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full">
              {weeksInMonth.map((weekDate, i) => {
                const isSelected = isSameWeek(weekDate, selectedWeekDate, { weekStartsOn: 1 });
                return (
                  <button key={i} onClick={() => setSelectedWeekDate(weekDate)} className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-bold transition-all ${isSelected ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                    Sem {i + 1}
                  </button>
                )
              })}
            </div>
          )}

          <Button variant="outline" size="sm" className="ml-auto gap-1.5" onClick={handleExport} disabled={isExporting}><Download className="h-3.5 w-3.5" /> {isExporting ? "Exportando..." : "Exportar"}</Button>
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
                  {groupedColumns.map(col => {
                    const dates = [col.thursday, col.sunday].filter(Boolean) as Date[]
                    const isToday = dates.some(d => format(d, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd"))
                    return (
                      <th key={col.colKey} className={`px-2 py-2.5 text-center text-xs min-w-[120px] ${isToday ? "text-primary bg-primary/5" : "text-muted-foreground"}`}>
                        {col.isMerged ? (
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-center gap-0 text-center">
                              <button onClick={() => setDateEditorOpen({ original: col.thursday!, current: getDisplayDate(col.thursday!) })} className="flex-1 hover:bg-primary/5 rounded py-1 transition-colors group text-center">
                                <span className="text-[10px] font-black uppercase tracking-tight opacity-70 block group-hover:text-primary">Ensaio</span>
                                <span className={`text-base font-extrabold ${isToday ? 'text-primary' : 'text-foreground'}`}>{format(getDisplayDate(col.thursday!), "dd/MM")}</span>
                                <span className="text-[10px] font-medium text-muted-foreground block">({format(getDisplayDate(col.thursday!), "eee", { locale: ptBR })})</span>
                              </button>
                              <div className="h-8 w-px bg-muted-foreground/10 mx-1" />
                              <div className="flex-1 text-center">
                                <span className="text-[10px] font-black uppercase tracking-tight opacity-70 block">Culto</span>
                                <span className={`text-base font-extrabold ${isToday ? 'text-primary' : 'text-foreground'}`}>{format(col.sunday!, "dd/MM")}</span>
                                <span className="text-[10px] font-medium text-muted-foreground block">(dom)</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <button onClick={col.thursday ? () => setDateEditorOpen({ original: col.thursday!, current: getDisplayDate(col.thursday!) }) : undefined} className={`flex flex-col gap-0.5 w-full ${col.thursday ? 'hover:bg-primary/5 rounded transition-colors group' : ''}`}>
                            <span className="text-[10px] font-black uppercase tracking-tight opacity-70 block group-hover:text-primary">{col.thursday ? "Ensaio" : "Culto"}</span>
                            <span className={`text-base font-extrabold ${isToday ? 'text-primary' : 'text-foreground'}`}>{format(getDisplayDate(dates[0]), "dd/MM")}</span>
                            <span className="text-[10px] font-medium text-muted-foreground block">({format(getDisplayDate(dates[0]), "eeee", { locale: ptBR })})</span>
                          </button>
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {getRolesForScheduleType(scheduleType).map(role => {
                  // Para sonoplastia: "apoio" só aparece no domingo (culto), ensaio fica vazio
                  const isSoundApoio = scheduleType === "sonoplastia" && role.key === "apoio"
                  return (
                    <tr key={role.key} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="sticky left-0 z-[5] bg-background px-3 py-2.5 border-r w-[130px]"><div className="flex items-center gap-2"><span className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-primary/10 text-primary shrink-0 text-lg">{role.icon}</span><span className="font-medium text-xs truncate text-foreground">{role.label}</span></div></td>
                      {groupedColumns.map(col => {
                        const dates = [col.thursday, col.sunday].filter(Boolean).map(d => format(d!, "yyyy-MM-dd"))
                        // Para apoio na sonoplastia: se a coluna é de ensaio (quinta), célula vazia
                        const isThursdayOnly = col.thursday && !col.sunday
                        if (isSoundApoio && isThursdayOnly) {
                          return <td key={col.colKey} className="px-2 py-2 text-center min-w-[120px]"><span className="text-muted-foreground/30 text-xs">--</span></td>
                        }
                        // Para apoio mesclado: usar só a data do domingo
                        const effectiveDates = isSoundApoio && col.sunday ? [format(col.sunday, "yyyy-MM-dd")] : dates
                        // Para células mescladas de louvor: usar data do domingo para status, mas passar quinta para o warning
                        const isMergedLouvor = scheduleType === "louvor" && col.isMerged && col.sunday && col.thursday
                        const sundayDateStr = col.sunday ? format(col.sunday, "yyyy-MM-dd") : effectiveDates[0]
                        const thursdayDateStr = col.thursday ? format(col.thursday, "yyyy-MM-dd") : undefined
                        const cacheKey = isMergedLouvor ? `merged-${sundayDateStr}` : effectiveDates[0]
                        const assignment = builtEntries.find(e => e.schedule_date === (isMergedLouvor ? sundayDateStr : effectiveDates[0]) && e.role === role.key)
                        return (
                          <td key={col.colKey} className="px-2 py-2 text-center min-w-[120px]">
                            <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild>
                                  <button onClick={async () => {
                                      if (!membersCache[cacheKey]) {
                                        const { getMembersWithAvailability } = await import("@/lib/schedule-builder-api")
                                        // Para louvor mesclado, passar data de quinta para obter warning
                                        const list = await getMembersWithAvailability(scheduleType, sundayDateStr, isMergedLouvor ? thursdayDateStr : undefined)
                                        setMembersCache(p => ({ ...p, [cacheKey]: list }))
                                      }
                                      setPickerOpen({ role, dates: isMergedLouvor ? [sundayDateStr] : effectiveDates, cacheKey })
                                    }}
                                    className={`w-full rounded-lg border px-2 py-2 text-xs flex items-center justify-center gap-1.5 min-h-[40px] transition-all hover:ring-2 hover:ring-primary/30 active:scale-95 ${assignment ? "bg-primary/5 border-primary/20 text-foreground" : "bg-muted/30 border-dashed border-muted-foreground/20 text-muted-foreground"}`}
                                  >
                                    {assignment ? (<><span className="text-sm">{role.icon}</span><span className="font-medium truncate">{assignment.member_name}</span></>) : <span className="text-muted-foreground/50">--</span>}
                                  </button>
                                </TooltipTrigger><TooltipContent><p className="text-xs">{assignment?.member_name || `Escalar ${role.label}`}</p></TooltipContent></Tooltip></TooltipProvider>
                          </td>
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
                      // Só o domingo (culto) é escalável; ensaio fica vazio
                      const isThursdayOnly = col.thursday && !col.sunday
                      if (isThursdayOnly) {
                        return <td key={col.colKey} className="px-2 py-2 text-center min-w-[120px]"><span className="text-muted-foreground/30 text-xs">--</span></td>
                      }
                      const sundayDate = col.sunday ? format(col.sunday, "yyyy-MM-dd") : null
                      if (!sundayDate) return <td key={col.colKey} className="px-2 py-2 text-center min-w-[120px]"><span className="text-muted-foreground/30 text-xs">--</span></td>
                      const assignment = builtEntries.find(e => e.schedule_date === sundayDate && e.role === role.key)
                      return (
                        <td key={col.colKey} className="px-2 py-2 text-center min-w-[120px]">
                          <TooltipProvider delayDuration={300}><Tooltip><TooltipTrigger asChild>
                                <button onClick={async () => {
                                    // Busca membros da mídia para a data do domingo
                                    const midiaCacheKey = `midia-${sundayDate}`
                                    if (!membersCache[midiaCacheKey]) {
                                      const { getMembersWithAvailability } = await import("@/lib/schedule-builder-api")
                                      const list = await getMembersWithAvailability("midia", sundayDate)
                                      setMembersCache(p => ({ ...p, [midiaCacheKey]: list }))
                                    }
                                    setPickerOpen({ role, dates: [sundayDate], cacheKey: midiaCacheKey, isMidia: true })
                                  }}
                                  className={`w-full rounded-lg border px-2 py-2 text-xs flex items-center justify-center gap-1.5 min-h-[40px] transition-all hover:ring-2 hover:ring-violet-400/40 active:scale-95 ${assignment ? "bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800 text-foreground" : "bg-muted/30 border-dashed border-muted-foreground/20 text-muted-foreground"}`}
                                >
                                  {assignment ? (<><span className="text-sm">{role.icon}</span><span className="font-medium truncate">{assignment.member_name}</span></>) : <span className="text-muted-foreground/50">--</span>}
                                </button>
                              </TooltipTrigger><TooltipContent><p className="text-xs">{assignment?.member_name || `Escalar ${role.label}`}</p></TooltipContent></Tooltip></TooltipProvider>
                        </td>
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
            {[0, 1, 2, 3, 4, 5, 6].map((dayIdx) => {
              // weekStartsOn: 1 (segunda) → vai de segunda até domingo (inclusive o domingo do culto)
              const baseDate = startOfWeek(dateEditorOpen?.original || new Date(), { weekStartsOn: 1 })
              const d = new Date(baseDate); d.setDate(baseDate.getDate() + dayIdx)
              const isSelected = format(d, "dd/MM") === format(getDisplayDate(dateEditorOpen?.original || new Date()), "dd/MM")
              return (
                <Button key={dayIdx} variant={isSelected ? "default" : "outline"} size="sm" className="justify-start gap-2" onClick={() => {
                  setCustomDates(prev => ({ ...prev, [format(dateEditorOpen!.original, "yyyy-MM-dd")]: d })); setDateEditorOpen(null)
                }}>
                  <span className="capitalize">{format(d, "EEEE", { locale: ptBR })}</span>
                  <span className="text-[10px] opacity-60 ml-auto">{format(d, "dd/MM")}</span>
                </Button>
              )
            })}
            <Button variant="ghost" size="sm" className="mt-1 text-[10px] text-muted-foreground" onClick={() => {
              const newMap = { ...customDates }; delete newMap[format(dateEditorOpen!.original, "yyyy-MM-dd")];
              setCustomDates(newMap); setDateEditorOpen(null)
            }}>Resetar para o padrão</Button>
          </div>
        </DialogContent>
      </Dialog>

      {pickerOpen && (
        <MemberPickerDialog
          open={!!pickerOpen} onClose={() => setPickerOpen(null)}
          members={membersCache[pickerOpen.cacheKey ?? pickerOpen.dates[0]] || []}
          role={pickerOpen.role} dates={pickerOpen.dates}
          onSelect={handleAssign}
          onRemove={async () => {
            const { removeBuiltScheduleEntry } = await import("@/lib/schedule-builder-api")
            const targetType = pickerOpen.isMidia ? "midia" : scheduleType
            setBuiltEntries(p => p.filter(e => !(pickerOpen.dates.includes(e.schedule_date) && e.role === pickerOpen.role.key)))
            setPickerOpen(null)
            await Promise.all(pickerOpen.dates.map(d => removeBuiltScheduleEntry(targetType as ScheduleType, d, pickerOpen.role.key)))
          }}
          currentMemberEmail={builtEntries.find(e => e.schedule_date === pickerOpen.dates[0] && e.role === pickerOpen.role.key)?.member_email}
        />
      )}
    </div>
  )
}
