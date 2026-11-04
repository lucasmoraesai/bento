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

## Acesso: login e senha

O site inteiro fica atrás de uma senha. A Vercel **não vende** Password
Protection no plano Hobby (é add-on de Pro/Enterprise), então o gate é feito em
casa: `middleware.ts` na raiz, usando **Vercel Routing Middleware** — ele roda
antes do shell estático, em toda rota.

| Peça | O que faz |
|---|---|
| `middleware.ts` | exige cookie assinado; sem ele devolve a tela de acesso (401). POST em `/__unlock` confere a senha e grava o cookie (303). |
| `DEPLOY_GATE_PASSWORD_HASH` | env var **encriptada** no projeto Vercel (`production`, `preview`, `development`): `s2:<salt>:<hex>`, scrypt N=16384 r=8 p=1. A senha em texto puro não existe em lugar nenhum do repo. |
| `nohumans/hash-password.mjs` | gera o hash a partir da senha digitada no STDIN (nunca em argv, para não ficar no histórico). |
| cookie `nh_slide` | HMAC do hash, `HttpOnly; Secure; SameSite=Lax`, 1 ano — "entra uma vez, fica". Trocar a senha invalida os cookies emitidos. |
| `nohumans/check-gate.cjs` | smoke test: abre a URL, prova que a tela de acesso vem antes, envia a senha e prova que o deck vem depois. |

Decisões que valem saber:

- **Tudo é gated**, inclusive o HTML inteiro — não há isenção para `.js/.css`
  (num site estático o conteúdo *é* o bundle, então isentar asset seria vazar o
  deck). O único caminho liberado é `/favicon.ico`.
- **Falha fechado**: sem env var ou com hash malformado, o site responde **503**
  em vez de abrir. Um segredo ausente não pode publicar o deck.
- **Sem cache**: as respostas do gate saem com `no-store`, e o shell autenticado
  com `Cache-Control: private`.
- **O que isto NÃO é**: senha compartilhada é trava de conveniência, não
  controle de acesso. Não tem usuário por pessoa, nem log de quem entrou, nem
  limite de tentativas. Para login individual de verdade (contas, papéis,
  revogação por pessoa), o caminho é Clerk/Auth.js ou Vercel Authentication —
  nesse caso este arquivo sai.

### Trocar a senha

```sh
node nohumans/hash-password.mjs        # digita a senha; imprime s2:<salt>:<hex>
```

Cole o hash em Vercel → projeto `bento` → Settings → Environment Variables
(`DEPLOY_GATE_PASSWORD_HASH`, Production + Preview + Development) e **redeploy**:
mudança de env vale para builds novos, então até o redeploy o deployment no ar
continua aceitando a senha antiga. Ou pela API/CLI:

```sh
printf '%s' 's2:...' | vercel env update DEPLOY_GATE_PASSWORD_HASH production
vercel --prod
```

### Desligar o gate

Apague `middleware.ts`, a dependência `@vercel/functions` do `package.json`
raiz, e o `DEPLOY_GATE_PASSWORD_HASH` do projeto; o build volta a ser só o shell
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
