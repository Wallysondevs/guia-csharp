#!/usr/bin/env node
/* Junta a saída do `dotnet publish` (tools/cs-src/Motor) em pacotes para assets/cs/ (chamado por tools/construir-cs.sh).
   node tools/empacotar-cs.mjs PASTA_FRAMEWORK PASTA_REFS VERSAO_ROSLYN
   → assets/cs/motor.pak.gz  (runtime .NET 10 WebAssembly + bibliotecas + Roslyn + ICU pt-BR)
     assets/cs/refs.pak.gz   (reference assemblies do Microsoft.NETCore.App.Ref 10, só o compilador usa)
     assets/cs/dotnet*.js, assets/cs/manifesto.json */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";

const [fw, refs, roslyn] = process.argv.slice(2);
const SAIDA = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "assets", "cs");

function pacote(lista) {
  const partes = [];
  const n = Buffer.alloc(4); n.writeUInt32LE(lista.length); partes.push(n);
  for (const [nome, bytes] of lista) {
    const nb = Buffer.from(nome);
    const h = Buffer.alloc(2); h.writeUInt16LE(nb.length);
    const t = Buffer.alloc(4); t.writeUInt32LE(bytes.length);
    partes.push(h, nb, t, bytes);
  }
  return Buffer.concat(partes);
}
function gravar(nome, bruto) {
  const gz = zlib.gzipSync(bruto, { level: 9 });
  fs.writeFileSync(path.join(SAIDA, nome), gz);
  return { bytes: gz.length, bruto: bruto.length, sha: crypto.createHash("sha256").update(gz).digest("hex").slice(0, 16) };
}

fs.mkdirSync(SAIDA, { recursive: true });
const arquivos = fs.readdirSync(fw).filter((f) => fs.statSync(path.join(fw, f)).isFile());
// fora do pacote: os módulos JS (ficam soltos em assets/cs/) e os dados do ICU que o pt-BR não usa
const motor = arquivos.filter((f) => !/\.js$/.test(f) && !/^icudt_(CJK|EFIGS)\.dat$/.test(f)).sort().map((f) => [f, fs.readFileSync(path.join(fw, f))]);
const pm = gravar("motor.pak.gz", pacote(motor));
const rl = fs.readdirSync(refs).filter((f) => f.endsWith(".dll")).sort().map((f) => [f, fs.readFileSync(path.join(refs, f))]);
const pr = gravar("refs.pak.gz", pacote(rl));
for (const js of arquivos.filter((f) => /\.js$/.test(f))) fs.copyFileSync(path.join(fw, js), path.join(SAIDA, js));
const man = {
  versao: crypto.createHash("sha256").update(pm.sha + pr.sha + fs.readFileSync(path.join(fw, "dotnet.js"))).digest("hex").slice(0, 12),
  roslyn, runtime: (/var e="([\d.]+)"/.exec(fs.readFileSync(path.join(fw, "dotnet.runtime.js"), "utf8")) || [])[1] || "?",
  arquivos: { "motor.pak.gz": pm, "refs.pak.gz": pr },
  total: pm.bytes + pr.bytes,
  gerado: new Date().toISOString(),
};
fs.writeFileSync(path.join(SAIDA, "manifesto.json"), JSON.stringify(man, null, 2) + "\n");
console.log(JSON.stringify(man, null, 2));
