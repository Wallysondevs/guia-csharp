# assets/cs — o motor do editor C# do guia

O "Experimente" (`.trycs`, `assets/csharpsim.js`) compila com o **Roslyn de verdade** e roda o programa no **runtime .NET 10 em WebAssembly**, tudo no navegador.

| Arquivo | O que é |
| --- | --- |
| `motor.pak.gz` | runtime .NET 10 (Mono, WebAssembly) + bibliotecas completas (sem trimming) + Roslyn + dados ICU (pt-BR) + o `Motor.dll` (tools/cs-src/Motor) |
| `refs.pak.gz` | reference assemblies do `Microsoft.NETCore.App.Ref` 10.0.12 (os mesmos do laboratório); só o compilador usa |
| `dotnet.js`, `dotnet.runtime.js`, `dotnet.native.js` | o carregador do runtime .NET (gerado pelo `dotnet publish`) |
| `cs-comum.mjs` | leitura dos pacotes e configuração comum (navegador e Node) |
| `cs-worker.js` | o Web Worker: compila (um worker fixo) ou roda (um worker novo por execução) |
| `manifesto.json` | versão, tamanhos e o Roslyn usado |

- **Compilador:** os `Microsoft.CodeAnalysis*.dll` do **SDK 10.0.112 do Ubuntu** (o mesmo `dotnet` do laboratório, Roslyn `5.0.0-2.26422.108`), sem o código ReadyToRun e com um remendo de uma linha (o `Task.Run` do `DebugSourceDocument` vira `Task.FromResult`, porque no WebAssembly de uma thread só ele travaria). Mensagens em pt-BR: os satélites `pt-BR` do mesmo SDK.
- **Pacote:** `u32 n` e depois `n × (u16 tamanho do nome, nome, u32 tamanho, bytes)`, comprimido com gzip (o navegador descomprime com `DecompressionStream`).
- **Reconstruir** (na VPS, nunca no notebook): `bash tools/construir-cs.sh`. Fontes em `tools/cs-src/` (`Motor`, `Remendo`); binários intermediários em `tools/cs-src/.build/` (fora do git).

## Licenças
- .NET runtime, bibliotecas e Roslyn: MIT, © .NET Foundation and Contributors (`LICENSE-dotnet.txt`, `LICENSE-roslyn-sdk-ubuntu.txt`, avisos de terceiros em `ThirdPartyNotices-dotnet.txt`).
- ICU (dados de cultura): Unicode License, listada em `ThirdPartyNotices-dotnet.txt`.
