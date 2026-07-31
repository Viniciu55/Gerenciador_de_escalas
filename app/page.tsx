import Link from "next/link"
import { Music, AudioLines, Laptop, ChevronRight } from "lucide-react"
import { GlobalHeader } from "@/components/global-header"

const SCHEDULES = [
  {
    href: "/louvor",
    label: "Louvor",
    description: "Gerenciar a disponibilidade para a equipe de louvor.",
    icon: Music,
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  {
    href: "/sonoplastia",
    label: "Sonoplastia",
    description: "Gerenciar a disponibilidade para a sonoplastia.",
    icon: AudioLines,
    color: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  },
  {
    href: "/midia",
    label: "Midia",
    description: "Gerenciar a disponibilidade para a mídia.",
    icon: Laptop,
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
]

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Sem atalho de início: esta já é a página inicial. */}
      <GlobalHeader showHomeLink={false} />

      {/* Main Content */}
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="mb-10 flex flex-col items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance text-center">
              Gerenciador de escalas
            </h1>
            <p className="text-sm text-muted-foreground text-center text-pretty">
              Selecione a escala que deseja acessar
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {SCHEDULES.map((schedule) => {
              const Icon = schedule.icon
              return (
                <Link
                  key={schedule.href}
                  href={schedule.href}
                  className="group flex items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:bg-accent/50"
                >
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${schedule.color}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-semibold text-foreground">
                      {schedule.label}
                    </h2>
                    <p className="text-xs text-muted-foreground truncate">
                      {schedule.description}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 transition-transform group-hover:translate-x-0.5" />
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
