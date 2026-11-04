# Deploy deste fork — slides.nohumans.com.br

Este repositório é um **fork de [nyblnet/bento](https://github.com/nyblnet/bento)**
(MIT, © 2026 The Bento authors), mantido por [@lucasmoraesai](https://github.com/lucasmoraesai)
e publicado como **nohumans slide** em **https://slides.nohumans.com.br**.

## Identidade: nohumans slide

O código é o upstream; a identidade (nome, marca, cores da marca) foi trocada
para a da nohumans. O que mudou e onde:

| Superfície | Arquivo | O que é agora |
|---|---|---|
| `<title>`, `meta generator`, favicon | `slides/index.html` | `nohumans slide`, `nohumans-slides`, marca em ciano/magenta/lima sobre preto |
| Splash de boot | `slides/index.html` | wordmark `nohumans slide` + tiles da marca |
| Wordmark da barra superior e do About | `slides/src/editor/editor.ts` | `nohumans slide`, marca nova, links para o site e para este repo |
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
