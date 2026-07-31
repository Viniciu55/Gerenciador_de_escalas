import { Home } from "lucide-react"
import Link from "next/link"
import { ThemeToggle } from "./theme-toggle"
import { Button } from "@/components/ui/button"

interface GlobalHeaderProps {
  /**
   * Exibe o atalho para a página inicial. Desligue na própria home, onde o
   * botão levaria para a página atual.
   */
  showHomeLink?: boolean
}

/**
 * Cabeçalho fixo usado em todas as páginas: identidade à esquerda, ações à
 * direita.
 */
export function GlobalHeader({ showHomeLink = true }: GlobalHeaderProps) {
  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <img
            src="/logo.jpg"
            alt="Logo da Igreja Reviver"
            className="h-10 w-10 rounded-full object-cover"
          />
          <span className="text-lg font-bold text-foreground">Reviver</span>
        </div>

        {/*
          Os botões ficam no fluxo do flex e são empurrados para a direita pelo
          `justify-between` do container. Antes usavam posicionamento absoluto
          sem ancestral relativo, o que anulava o `justify-between` e alinhava
          por coincidência.
        */}
        <div className="flex items-center gap-1">
          {showHomeLink && (
            <Link href="/">
              <Button variant="ghost" size="icon" aria-label="Início">
                <Home className="h-4 w-4" />
              </Button>
            </Link>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
