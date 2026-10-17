// Um programa C# num runtime .NET novo (worker_thread). Ver tools/cs-node.js.
import { workerData, parentPort } from "node:worker_threads";
import path from "node:path";
const d = workerData;
const comum = await import(path.join(d.pasta, "cs-comum.mjs"));
const { dotnet } = await import(path.join(d.pasta, "dotnet.js"));
const mapa = comum.lerPacote(new Uint8Array(d.pacote));
let erroNativo = "", inicio = null;
const rt = await comum.configurar(dotnet, mapa, { depurar: true, erroNativo: (t) => { if (erroNativo.length < 2e6) erroNativo += t; } }).create();
// o runtime morreu sozinho (estouro de pilha): imita o .NET do Linux
process.on("exit", () => {
  const so = comum.estouroDePilha(erroNativo, inicio);
  if (so) { parentPort.postMessage({ ev: "saida", fd: 2, s: so }); parentPort.postMessage({ ev: "fim", exit: 134 }); }
});
rt.setModuleImports("motor", {
  escrever(fd, s) { parentPort.postMessage({ ev: "saida", fd, s }); },
  // sem --stdin: o programa recebe "fim da entrada" (no navegador o leitor digitaria)
  lerEntrada() { parentPort.postMessage({ ev: "leu" }); return ""; },
  inicio(q) { inicio = q; },
  pedirEntrada() {},
});
const ex = (await rt.getAssemblyExports("Motor.dll")).Motor;
try {
  const codigo = await ex.Executor.Rodar(d.dll, d.pdb, d.args, d.dir, d.nomes, d.conteudos, d.stdin, d.arquivoUnico || "", d.chaves || "");
  parentPort.postMessage({ ev: "fim", exit: codigo });
} catch (e) {
  // Environment.Exit(n): o runtime encerra com ExitStatus { status: n }
  if (comum.estouroDePilha(erroNativo, inicio)) process.exit(1);
  if (e && typeof e.status === "number") parentPort.postMessage({ ev: "fim", exit: e.status });
  else parentPort.postMessage({ ev: "falha", msg: String(e && e.stack || e) + " " + JSON.stringify(e) });
}
process.exit(0);
