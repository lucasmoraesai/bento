# Deploy deste fork — slides.nohumans.com.br

Este repositório é um **fork de [nyblnet/bento](https://github.com/nyblnet/bento)**
(MIT, © 2026 The Bento authors), mantido por [@lucasmoraesai](https://github.com/lucasmoraesai)
e publicado como **nohumans slide** em **https://slides.nohumans.com.br**.

## Identidade: nohumans slide

O código é o upstream; a identidade (nome, marca, cores da marca) foi trocada
para a da nohumans. **A marca é a do próprio site** — `https://agenciadeia.tech/logo.svg`:
quadrado preto arredondado com um anel tracejado `#ededed` (viewBox 32, `r=10`,
`stroke-width 1.5`, `dasharray "52 10"`, `rotate(-40)`). Ela aparece inline (sem
requisição externa) no favicon, no splash, na barra superior, no Sobre, na tela
de acesso e no deck — a mesma geometria, em `currentColor` onde o fundo é claro.

O que mudou e onde:

| Superfície | Arquivo | O que é agora |
|---|---|---|
| `<title>`, `meta generator`, favicon | `slides/index.html` | `nohumans slide`, `nohumans-slides`, favicon = `/logo.svg` do site (quadrado preto + anel tracejado) |
| Splash de boot | `slides/index.html` | anel tracejado girando + wordmark `nohumans slide` |
| Wordmark da barra superior e do About | `slides/src/editor/editor.ts` | anel (`currentColor` na barra, `#ededed` no About) + `nohumans slide`; links para o site e para este repo |
| Tela de acesso | `middleware.ts` | anel + `nohumans slide`, paleta nohumans, pt-BR |
| Capa e slide final do deck | `nohumans/deck.compact.json` | anel grande com o lockup `nohumans / slide` dentro |
| Nome do app (título da janela, diálogo de salvar) | `slides/src/main.ts` (`appName`) | `nohumans slide` |
| Catálogos de idioma | `slides/src/i18n/**` | token `bento/slides` → `nohumans slide` (chave + traduções), `packed.ts` regerado por `scripts/build-i18n.mjs` |
| Deck de demonstração | `slides/src/starterdeck.ts` | título, kicker do capítulo 1 e CTA final com a marca nova |
| Canal de atualização | `slides/src/main.ts` (`manifestUrl`) | `https://slides.nohumans.com.br/releases/slides/manifest.json` (nada publicado) |

**O que NÃO mudou, de propósito:**

- **`appId: 'bento-slides'`** — é o id que o canal assinado verifica (é com ele
  que o índice de pacotes de idioma é assinado). Não aparece para ninguém; trocá-lo
  quebraria os downloads de idioma. A identidade visível é o `appName`.
- **O formato do arquivo** — `.bento.html`, o bloco `#bento-doc`, `format:
  'bento/slides'` e a API `window.bento`. É o contrato que faz um deck aberto
  aqui continuar abrindo no bento upstream (e vice-versa). Trocar isso
  quebraria os arquivos já salvos.
- **Bloco de NOTICE/LICENSE** dentro do shell — exigência da licença MIT.
- **Links para a documentação** (`bento.page/help`, `bento.page/agents.md`) —
  é a doc do produto original, e continua correta.

Como não há canal assinado, a checagem automática de atualização nasce
**desligada** (só quando a preferência nunca foi tocada) para não exibir um erro
de servidor inexistente em *Sobre*.

## O deck que abre no site

Quem entra em `slides.nohumans.com.br` cai direto no deck da nohumans, não no
showcase do upstream. O deck é *dado dentro do shell*: o bloco
`#bento-doc` de `slides/index.html` carrega o documento, e o app abre com ele
(bloco vazio = o starter deck de fábrica).

Tudo o que gera esse documento está em `nohumans/`:

| Arquivo | Papel |
|---|---|
| `nohumans/deck.compact.json` | **a fonte**: o deck na forma compacta de autoria (campos default omitidos, `h: "auto"`, ids gerados) |
| `nohumans/build-doc.js` | carrega o compacto no shell construído, imprime o *load report* (`dropped`, `findings`), grava `deck.full.json` — **sem `collab`**, porque um deck público não pode carregar as chaves da sessão |
| `nohumans/deck.full.json` | o documento completo, derivado (é o que vai para o bloco) |
| `nohumans/inject.mjs` | escreve o JSON no bloco `#bento-doc` de `slides/index.html`, escapando `<` como `\u003c` (regra do splice: nunca um `</script>` literal) |
| `nohumans/check-built.cjs` | confere o shell **construído**: título, nº de slides, `collab`, fontes, primeiro slide |
| `nohumans/verify.cjs <url>` | abre a URL num Chrome headless e diz com que deck ela realmente acorda (+ screenshot) |

Editar o deck é: mexer no `deck.compact.json` → `node nohumans/build-doc.js` →
`node nohumans/inject.mjs` → `cd slides && npx vite build --outDir dist-single`
→ commit. O `bento-check` do upstream (`node scripts/bento-check.mjs`) também
valida o resultado; o `validate()` do runtime já sai limpo (0 erros, 0 avisos),
e as duas infos que restam são esperadas: as chaves de sessão removidas na
gravação e a fonte Instrument Sans, que é a face embutida no shell e por isso é
declarada em `fonts` em vez de carregar bytes.

## Acesso: SSO do work

Só entra quem está logado em **work.nohumans.com.br**. O deck não tem senha nem
login próprio: quem decide é a sessão do work.

O handshake tem três pernas e nenhuma leitura de banco do lado do deck:

1. sem cookie → `middleware.ts` manda o browser para
   `https://work.nohumans.com.br/slides-sso?next=<aqui mesmo>`
2. essa rota (no repo `nohumans-work`, `src/app/slides-sso/route.ts`) confere a
   sessão do Supabase **e** a linha em `work.profiles` com `active = true` — a
   mesma regra do `requireProfile` —, cunha um **JWT de 60s** (HS256,
   `SLIDES_SSO_SECRET`) e devolve a pessoa para `/__sso`
3. o `/__sso` valida assinatura, `aud` e `exp`, emite o cookie `nh_slide`
   (2h, assinado com o mesmo segredo) e manda para o caminho pedido

> A rota fica em `/slides-sso`, **não** em `/auth/*`: o `updateSession` do work
> desvia qualquer `/auth/*` de usuário logado para `/dashboard`, e aqui o
> usuário logado é justamente quem precisa passar.

| Peça | Onde | O que faz |
|---|---|---|
| `middleware.ts` | este repo | exige o cookie; sem ele inicia o handshake. **Falha fechado** (503) sem segredo. |
| `src/app/slides-sso/route.ts` | `nohumans-work` | a fonte de verdade: sessão + perfil ativo → token de 60s |
| `SLIDES_SSO_SECRET` | env dos **dois** projetos Vercel | segredo compartilhado HS256 (64 hex) |
| cookie `nh_slide` | slides | JWT de sessão (2h), `HttpOnly; Secure; SameSite=Lax` |
| `nohumans/check-sso.cjs` | este repo | smoke test dos quatro caminhos, sem navegador |

Decisões que valem saber:

- **Revogação em 2h**: deslogar do work não derruba o cookie na hora — ele dura
  2h e, ao expirar, o handshake roda de novo e a pessoa para no login do work.
  Janela menor = `SESSION_TTL` no `middleware.ts`.
- **Tudo é gated**, inclusive o HTML inteiro — num site estático o conteúdo *é* o
  bundle, então isentar asset seria vazar o deck. Só `/favicon.ico` escapa.
- **Sem senha**: o gate por senha (`/__unlock` + `DEPLOY_GATE_PASSWORD_HASH`)
  saiu. Acesso de emergência sem o work exigiria reintroduzir um caminho de
  senha no middleware.
- **App switcher**: o Slides aparece ao lado de Calendar e Site
  (`src/components/layout/app-switcher.tsx`, no repo `nohumans-work`).

### Trocar o segredo

Gere 64 hex, atualize `SLIDES_SSO_SECRET` nos **dois** projetos e redeploy dos
dois. Trocar só de um lado fecha o site — que é o comportamento certo.

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

### Testar sem navegador

```sh
SLIDES_SSO_SECRET=<segredo> node nohumans/check-sso.cjs https://slides.nohumans.com.br
```

Prova: sem cookie → 302 para o work; token válido → 303 + cookie; com cookie →
200 e o shell; token forjado → volta para o work.

### Desligar o gate

Apague `middleware.ts`, a dependência `@vercel/functions` do `package.json`
raiz e o `SLIDES_SSO_SECRET` do projeto; o build volta a ser só o shell
estático.

## Build na Vercel

O app vive em `slides/` e o artefato publicado é **um único HTML** (o próprio
formato de documento do Bento, com viewer + editor + apresentador embutidos):

```sh
cd slides
npm ci
npx tsc -b                                   # typecheck
SINGLEFILE=1 npx vite build --outDir dist-single
```

Saída: `slides/dist-single/index.html` (~1,7 MB, um arquivo, zero requisições
externas). É esse arquivo que a Vercel serve na raiz do domínio.

> O `npm run build:single` do upstream encadeia `mv` + `scripts/postbuild-compress.mjs`
> (zopfli). O `mv` não existe no Windows e o zopfli não instala em todo ambiente,
> por isso o pipeline aqui chama o Vite direto. A Vercel comprime com brotli/gzip
> na borda, então o shell chega ao browser com ~590 KB.

## Build local

```sh
cd slides
npm ci
npx tsc -b
$env:SINGLEFILE='1'; npx vite build --outDir dist-single    # PowerShell
# bash: SINGLEFILE=1 npx vite build --outDir dist-single
```

Depois abra `slides/dist-single/index.html` no navegador — ele funciona mesmo
via `file://`.

## Licença e atribuição

MIT, mantida integralmente (`LICENSE`, `THIRD_PARTY_NOTICES.md`). O bloco de
NOTICE que acompanha cada documento gerado continua embutido no shell e aponta
para o projeto original. Upstream: <https://bento.page> · <https://github.com/nyblnet/bento>.
