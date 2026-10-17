#!/usr/bin/env bash
# Reconstrói o motor do editor C# (assets/cs/) a partir das fontes em tools/cs-src/. Roda NA VPS (nunca no notebook).
#   1. SDK .NET 10 oficial da Microsoft em ~/opt/dotnet com o workload wasm-tools (o SDK do Ubuntu não tem workloads);
#   2. tools/cs-src/Remendo: copia o Roslyn do laboratório (SDK 10.0.112 do Ubuntu, o mesmo compilador do `dotnet`
#      da Ana) sem o código ReadyToRun e com o remendo do Task.Run (ver Remendo/Program.cs);
#   3. tools/cs-src/Motor: dotnet publish (Microsoft.NET.Sdk.WebAssembly, sem trimming);
#   4. tools/empacotar-cs.mjs: pacotes .pak.gz + dotnet*.js + manifesto.json em assets/cs/.
set -euo pipefail
cd "$(dirname "$0")/.."
RAIZ=$PWD
LAB_DOTNET=${LAB_DOTNET:-$HOME/guia-csharp-lab/rootfs/usr/lib/dotnet}
ROSLYN_LAB=$LAB_DOTNET/sdk/10.0.112/Roslyn/bincore
REFS=$LAB_DOTNET/packs/Microsoft.NETCore.App.Ref/10.0.12/ref/net10.0
B=$RAIZ/tools/cs-src/.build
export DOTNET_ROOT=$HOME/opt/dotnet PATH=$HOME/opt/dotnet:$PATH DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
if [ ! -x "$DOTNET_ROOT/dotnet" ]; then
  mkdir -p "$DOTNET_ROOT" && curl -sSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.$$.sh
  bash /tmp/dotnet-install.$$.sh --channel 10.0 --install-dir "$DOTNET_ROOT" && rm -f /tmp/dotnet-install.$$.sh
fi
dotnet workload list | grep -q wasm-tools || dotnet workload install wasm-tools
mkdir -p "$B"
echo "== Roslyn do laboratório: $(strings "$ROSLYN_LAB/Microsoft.CodeAnalysis.CSharp.dll" | grep -m1 -o '5\.[0-9.]*-[0-9.]*+[0-9a-f]\{8\}')"
CONSOLE_WASM=$(ls "$DOTNET_ROOT"/packs/Microsoft.NETCore.App.Runtime.Mono.browser-wasm/*/runtimes/browser-wasm/lib/net10.0/System.Console.dll | tail -1)
timeout 900 dotnet run --project tools/cs-src/Remendo -c Release -- "$ROSLYN_LAB" "$B/roslyn" --console "$CONSOLE_WASM"
rm -rf "$B/pub"
timeout 1800 dotnet publish tools/cs-src/Motor -c Release -o "$B/pub" -p:RoslynLab="$B/roslyn"
VER=$( (strings "$ROSLYN_LAB/Microsoft.CodeAnalysis.CSharp.dll" || true) | grep -m1 -o '5\.[0-9.]*-[0-9.]*+[0-9a-f]\{8\}' || true)
. ~/.profile >/dev/null 2>&1 || true
# analisadores e geradores do dotnet run (os mesmos do laboratório)
AN=$B/analisadores; rm -rf "$AN"; mkdir -p "$AN/pt-BR"
SDKAN=$LAB_DOTNET/sdk/10.0.112/Sdks/Microsoft.NET.Sdk/analyzers
GER=$LAB_DOTNET/packs/Microsoft.NETCore.App.Ref/10.0.12/analyzers/dotnet/cs
cp "$SDKAN"/Microsoft.CodeAnalysis.NetAnalyzers.dll "$SDKAN"/Microsoft.CodeAnalysis.CSharp.NetAnalyzers.dll "$GER"/*.dll "$AN/"
cp "$SDKAN"/pt-BR/Microsoft.CodeAnalysis.NetAnalyzers.resources.dll "$SDKAN"/pt-BR/Microsoft.CodeAnalysis.CSharp.NetAnalyzers.resources.dll "$GER"/pt-BR/*.dll "$AN/pt-BR/" 2>/dev/null || true
rm -f "$AN"/Microsoft.Interop.JavaScript.JSImportGenerator.dll   # [JSImport]: só para o navegador
ILLINK=$B/illink; if [ ! -f "$ILLINK/analyzers/dotnet/cs/ILLink.RoslynAnalyzer.dll" ]; then
  rm -rf "$ILLINK"; mkdir -p "$ILLINK"
  curl -sSL https://api.nuget.org/v3-flatcontainer/microsoft.net.illink.tasks/10.0.12/microsoft.net.illink.tasks.10.0.12.nupkg -o "$ILLINK/p.zip"
  (cd "$ILLINK" && unzip -q -o p.zip 'analyzers/*')
fi
cp "$ILLINK/analyzers/dotnet/cs/ILLink.RoslynAnalyzer.dll" "$AN/"
cp "$SDKAN/build/config/analysislevel_10_default.globalconfig" "$AN/"
cp "$B/bin/Motor/Release/net10.0/Motor.pdb" "$B/pub/wwwroot/_framework/"   # o executor liga a depuração (linhas nas exceções)
node tools/empacotar-cs.mjs "$B/pub/wwwroot/_framework" "$REFS" "$VER" "$AN" "$B/roslyn/console/System.Console.dll"
echo "== pronto: assets/cs/"
ls -la assets/cs/
