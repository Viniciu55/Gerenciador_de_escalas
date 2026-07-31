"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { CalendarDays, ArrowRight } from "lucide-react"
import type { ScheduleType } from "@/lib/types"
import { SCHEDULE_CONFIG } from "@/lib/types"

interface EmailLoginProps {
  /** Chamado quando o e-mail já está cadastrado nesta escala. */
  onMemberFound: (memberId: string, email: string) => void
  /** Chamado quando o e-mail não existe, para seguir para o cadastro. */
  onMemberNotFound: (email: string) => void
  /** Carregamento controlado pelo pai, durante a transição após a busca. */
  isLoading: boolean
  scheduleType: ScheduleType
}

/**
 * Tela de entrada da escala: identifica a pessoa pelo e-mail e encaminha para a
 * escala ou para o cadastro.
 */
export function EmailLogin({ onMemberFound, onMemberNotFound, isLoading, scheduleType }: EmailLoginProps) {
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  // O `isLoading` do pai só liga depois que a busca termina, então o estado do
  // próprio envio é controlado aqui para o botão refletir a espera.
  const [isSubmitting, setIsSubmitting] = useState(false)
  const config = SCHEDULE_CONFIG[scheduleType]

  const isBusy = isSubmitting || isLoading

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return

    setIsSubmitting(true)
    setError("")

    try {
      const lookupEmail = email.toLowerCase().trim()
      const { lookupMember } = await import("@/lib/schedule-api")
      const member = await lookupMember(lookupEmail, scheduleType)

      if (member) {
        onMemberFound(member.id, member.email)
      } else {
        onMemberNotFound(lookupEmail)
      }
      // Em caso de sucesso o componente é desmontado pelo pai, então o estado de
      // envio segue ligado de propósito para o botão não voltar a piscar.
    } catch (err) {
      // Sem este tratamento uma falha de rede deixava a tela parada, sem retorno.
      setError("Erro ao verificar o e-mail. Tente novamente.")
      console.error(err)
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <CalendarDays className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance text-center">
            {config.description}
          </h1>
          <p className="text-sm text-muted-foreground text-center text-pretty">
            Digite seu e-mail para acessar a escala ou criar sua conta
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email" className="text-sm font-medium text-foreground">
              E-mail
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="h-12 text-base"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="h-12 text-base" disabled={isBusy || !email.trim()}>
            {isBusy ? "Verificando..." : "Continuar"}
            {!isBusy && <ArrowRight className="ml-2 h-4 w-4" />}
          </Button>
        </form>
      </div>
    </div>
  )
}
