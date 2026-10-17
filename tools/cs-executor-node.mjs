// Um programa C# num runtime .NET novo (worker_thread). Ver tools/cs-node.js.
import { workerData, parentPort } from "node:worker_threads";
import path from "node:path";
const d = workerData;
const comum = await import(path.join(d.pasta, "cs-comum.mjs"));
const { dotnet } = await import(path.join(d.pasta, "dotnet.js"));
const mapa = comum.lerPacote(new Uint8Array(d.pacote));
const rt = await comum.configurar(dotnet, mapa).create();
rt.setModuleImports("motor", {
  escrever(fd, s) { parentPort.postMessage({ ev: "saida", fd, s }); },
  // sem --stdin: o programa recebe "fim da entrada" (no navegador o leitor digitaria)
  lerEntrada() { parentPort.postMessage({ ev: "leu" }); return ""; },
  pedirEntrada() {},
});
const ex = (await rt.getAssemblyExports("Motor.dll")).Motor;
try {
  const codigo = await ex.Executor.Rodar(d.dll, d.pdb, d.args, d.dir, d.nomes, d.conteudos, d.stdin);
  parentPort.postMessage({ ev: "fim", exit: codigo });
} catch (e) {
  // Environment.Exit(n): o runtime encerra com ExitStatus { status: n }
  if (e && typeof e.status === "number") parentPort.postMessage({ ev: "fim", exit: e.status });
  else parentPort.postMessage({ ev: "falha", msg: String(e && e.stack || e) + " " + JSON.stringify(e) });
}
process.exit(0);
