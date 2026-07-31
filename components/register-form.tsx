"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ArrowLeft, UserPlus} from "lucide-react"
import type { ScheduleType } from "@/lib/types"
import { SCHEDULE_CONFIG } from "@/lib/types"

interface RegisterFormProps {
  /** E-mail já validado na etapa anterior. Exibido, mas não editável. */
  email: string
  /** Chamado com o id do membro recém-criado. */
  onRegistered: (memberId: string) => void
  /** Volta para a tela de e-mail. */
  onBack: () => void
  scheduleType: ScheduleType
}

/**
 * Cadastro exibido quando o e-mail informado ainda não pertence à escala. Só
 * pede o nome, já que o e-mail vem da etapa anterior.
 */
export function RegisterForm({ email, onRegistered, onBack, scheduleType }: RegisterFormProps) {
  const [name, setName] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const config = SCHEDULE_CONFIG[scheduleType]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setIsLoading(true)
    setError("")

    try {
      const { registerMember } = await import("@/lib/schedule-api")
      const member = await registerMember(email, name, scheduleType)
      onRegistered(member.id)
    } catch (err) {
      setError("Erro ao criar conta. Tente novamente.")
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <button
          onClick={onBack}
          className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>

        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <UserPlus className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance text-center">
            Criar conta - {config.label}
          </h1>
          <p className="text-sm text-muted-foreground text-center text-pretty">
            Preencha seus dados para entrar na escala de {config.label.toLowerCase()}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="reg-email" className="text-sm font-medium text-foreground">
              E-mail
            </Label>
            <Input
              id="reg-email"
              type="email"
              value={email}
              disabled
              className="h-12 text-base bg-muted text-muted-foreground"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reg-name" className="text-sm font-medium text-foreground">
              Nome
            </Label>
            <Input
              id="reg-name"
              type="text"
              placeholder="Seu nome ou apelido"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="h-12 text-base"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" className="h-12 text-base" disabled={isLoading || !name.trim()}>
            {isLoading ? "Criando..." : "Criar conta e acessar"}
          </Button>
        </form>
      </div>
    </div>
  )
}
