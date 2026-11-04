# Deploy deste fork — slides.nohumans.com.br

Este repositório é um **fork de [nyblnet/bento](https://github.com/nyblnet/bento)**
(MIT, © 2026 The Bento authors), mantido por [@lucasmoraesai](https://github.com/lucasmoraesai)
apenas para publicar o app `bento/slides` em **https://slides.nohumans.com.br**.

Nada do produto foi alterado: o código-fonte é o upstream. A única adição é o
`vercel.json` na raiz, que ensina a Vercel a buildar o app de slides.

## Como o build acontece na Vercel

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
